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

// ---- never evaluated is not the same as nothing found ---------------------
// Zero flags means one of two completely different things. The flag pass has
// never been run on this book, so today every file takes this path.
has(/var everRun = !!\(ex\.flags_at\)/, 'a file is only called clean when the flag pass actually ran on it');
has(/notrun_flags:'The flag pass has not been run on this file'/, 'and says so plainly when it has not');
has(/notrun_flags:'No se ha ejecutado la revisión de señales en este expediente'/, 'in Spanish too');
has(/no flags is not the same as no problems/, 'and does not let no flags read as no problems');

// ---- money we cannot stand behind -----------------------------------------
// The predicate lives in flags.js and is mirrored here because a browser
// cannot import an edge function. Running both over the same table is the only
// thing stopping them drifting apart.
{
  const from = MODULE.indexOf('function ctrMoneyUnconfirmed(f){');
  const to = MODULE.indexOf('function ctrVal(f, key){');
  checks.push(['the screen carries the unconfirmed predicate', from >= 0 && to > from]);
  if (from >= 0 && to > from) {
    const screenSide = new Function(MODULE.slice(from, to) + '\nreturn ctrMoneyUnconfirmed;')();
    const CASES = [
      [{ price: '250,000.00' }, true, 'no contract type at all'],
      [{ contract_type: 'Standard Residential', price: '399.00' }, true, 'a residential price of $399'],
      [{ contract_type: 'AS IS Residential', price: '295,000.00' }, false, 'a real AS IS contract'],
      [{ contract_type: 'AS IS Residential', price: '790,000.00' }, false, 'the top of the book'],
      [{ contract_type: 'Vacant Land', price: '10,000.00' }, false, 'vacant land at ten thousand'],
      [{ contract_type: 'Vacant Land', price: '900.00' }, false, 'cheap land is not residential, so not caught'],
      [{ contract_type: 'AS IS Residential' }, false, 'a contract with no price at all'],
      [{ contract_type: '   ', price: '250,000.00' }, true, 'a blank contract type'],
      [{ contract_type: 'NABOR As-Is (NAB089)', price: '595,900.00' }, false, 'the NABOR form'],
    ];
    let agree = true, wrong = [];
    for (const [f, want, why] of CASES) {
      const got = screenSide(f);
      if (got !== want) { agree = false; wrong.push(why); }
    }
    checks.push(['the screen predicate is right on all nine real shapes', agree]);
    if (wrong.length) console.log('     wrong on: ' + wrong.join('; '));

    // And the server rule has to agree, case for case.
    const flagsSrc = fs.readFileSync(path.join(ROOT, 'supabase/functions/extract-contract-fields/flags.js'), 'utf8');
    const body = flagsSrc.replace(/export \{[^}]*\};?/, '') + '\nreturn moneyUnconfirmed;';
    let serverSide = null;
    try { serverSide = new Function(body)(); } catch (e) { /* reported below */ }
    checks.push(['flags.js exports the same predicate', typeof serverSide === 'function']);
    if (typeof serverSide === 'function') {
      const drift = CASES.filter(([f]) => serverSide(f) !== screenSide(f)).map(c => c[2]);
      checks.push(['and the two sides agree on every case, so they cannot drift', drift.length === 0]);
      if (drift.length) console.log('     they disagree on: ' + drift.join('; '));
    }
  }
}

// The figure is marked, never suppressed. Hiding it would conceal what the
// extractor actually read off the page.
has(/doubt \? ' <span class="ctr-unc">'/, 'an unconfirmed figure is marked rather than hidden');
has(/unconfirmed:'sin confirmar'/, 'and the mark is translated');

let bad = 0;
for (const [n, ok] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? '\nFAIL' : '\nPASS');
process.exit(bad ? 1 : 0);
