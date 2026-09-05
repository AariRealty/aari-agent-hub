// The Contracts screen. Phase 1 only: rail, viewer, Summary, Risk Flags and
// the Español toggle. No model, nothing that bills.
//
// Four things in the spec are not negotiable, so each gets a test rather than
// a comment: no delete control, no fabricated page anchor, a file with no
// extraction still shows and opens saying so, and pdf.js is vendored rather
// than pulled from a CDN. The rest is rendering.
//
// Lifts the shipped functions out of tx_module.html and runs them, the same
// technique as test-invite, so this tests the file that deploys.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MODULE = fs.readFileSync(path.join(ROOT, 'tx_module.html'), 'utf8');

const checks = [];
const has = (re, label) => checks.push([label, re.test(MODULE)]);
const hasNot = (re, label) => checks.push([label, !re.test(MODULE)]);

// ---- placement -----------------------------------------------------------
// The gate has to be broker OR is_tc, and is_tc has to actually be selected,
// or the check silently reads undefined for everybody.
has(/ME\.role === 'broker' \|\| ME\.is_tc === true/, 'the gate is broker or is_tc');
has(/select\('role,full_name,status,is_tc'\)/, 'and is_tc is actually selected off the member row');
checks.push(['the screen is in the module injected for everyone, not the broker only one',
  /ctrCanSee/.test(MODULE) && !fs.readFileSync(path.join(ROOT,'broker_module.html'),'utf8').includes('ctrCanSee')]);

// ---- the three constraints -----------------------------------------------
hasNot(/data-ctrdelete|ctrDelete|>Delete<\/button>/, 'no delete control on the rail');
has(/if\(fl\.page && Number\(fl\.page\) > 0\)/, 'a page link renders only when a real page exists');
hasNot(/page\s*[:=]\s*1\s*\/\/\s*default|fl\.page\s*\|\|\s*1/, 'no fallback page number is ever invented for a flag');
has(/This file has a contract on it but has never been through the extractor/, 'a file with no extraction opens and says so');
has(/That is not the same as nothing being wrong/, 'and does not read as an all clear');

// ---- vendored, not a CDN --------------------------------------------------
has(/CTR_PDFJS = '\/vendor\/pdfjs-3\.11\.174\.min\.js'/, 'pdf.js is served from our own origin, pinned');
has(/CTR_PDFJS_WORKER = '\/vendor\/pdfjs-worker-3\.11\.174\.min\.js'/, 'and so is its worker');
hasNot(/cdnjs|jsdelivr|unpkg|cdn\.|mozilla\.github\.io/, 'no CDN host appears anywhere in the module');
for (const f of ['vendor/pdfjs-3.11.174.min.js', 'vendor/pdfjs-worker-3.11.174.min.js']) {
  checks.push([f + ' is committed', fs.existsSync(path.join(ROOT, f))]);
}
// Without the worker path pdf.js parses on the main thread and locks the tab
// on a long contract, and it looks like it works right up until it does not.
has(/GlobalWorkerOptions\.workerSrc = CTR_PDFJS_WORKER/, 'the worker path is set, so parsing stays off the main thread');
has(/document\.createElement\('script'\)[\s\S]{0,200}CTR_PDFJS/, 'pdf.js loads on first open, not on every Hub load');

// ---- rendering, run for real ---------------------------------------------
{
  const from = MODULE.indexOf('function ctrMoney(v)');
  const to = MODULE.indexOf('async function ctrLoadRail()');
  if (from < 0 || to <= from) { checks.push(['the value formatters are present', false]); }
  else {
    const fn = new Function('CTR_LANG', MODULE.slice(from, to) + '\nreturn {ctrVal:ctrVal, ctrMoney:ctrMoney};')('en');
    const F = { address:'1 Example St, Cape Coral, FL 33904', price:'350,000.00', emd:'0.00',
                closing_date:'August 30, 2026', financing_type:'fha', street:'1 Example St', city:'Cape Coral', state:'FL', zip:'33904' };
    checks.push(['a price renders as money', fn.ctrVal(F,'price') === '$350,000.00']);
    checks.push(['a zero deposit is not shown as a figure', fn.ctrVal(F,'emd') === null]);
    checks.push(['financing renders uppercase', fn.ctrVal(F,'financing_type') === 'FHA']);
    checks.push(['a missing field returns null so the caller can say Not extracted',
      fn.ctrVal(F,'effective_date') === null]);
    checks.push(['property falls back to the composed address',
      fn.ctrVal({street:'2 Other Rd',city:'Lehigh Acres',state:'FL',zip:'33974'},'__property') === '2 Other Rd, Lehigh Acres, FL, 33974']);
  }
}

// ---- Español --------------------------------------------------------------
{
  const from = MODULE.indexOf('var CTR_ES = {');
  const to = MODULE.indexOf('var CTR_T = {');
  const ES = new Function(MODULE.slice(from, to) + '\nreturn CTR_ES;')();
  // Every rule in flags.js has to have a translation or the toggle shows a
  // half English panel, which is worse than no toggle.
  const flags = fs.readFileSync(path.join(ROOT,'supabase/functions/extract-contract-fields/flags.js'),'utf8');
  const ids = [...flags.matchAll(/flag\('([a-z_]+)'/g)].map(m => m[1]);
  const missing = ids.filter(id => !ES[id]);
  checks.push(['every flag id in flags.js has Spanish', missing.length === 0]);
  if (missing.length) console.log('     missing: ' + missing.join(', '));
  checks.push(['and there are no Spanish entries for rules that do not exist',
    Object.keys(ES).every(k => ids.includes(k))]);
  checks.push(['each carries both a label and a detail',
    Object.values(ES).every(v => Array.isArray(v) && v.length === 2 && v[0] && v[1])]);
  // The toggle must not call anything.
  const langBlock = MODULE.slice(MODULE.indexOf("data-ctrlang"), MODULE.indexOf("data-ctrlang") + 600);
  checks.push(['the toggle re-renders locally and makes no network call',
    !/await |fetch\(|sb\./.test(langBlock)]);
}

let bad = 0;
for (const [n, ok] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? '\nFAIL' : '\nPASS');
process.exit(bad ? 1 : 0);
