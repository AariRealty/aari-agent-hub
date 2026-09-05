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

// Some assertions are about what an agent can SEE, and the comments explaining
// a decision necessarily quote the thing being ruled out. The first version of
// the teal and coming soon checks failed on the comments that document why
// there is no teal and no coming soon stub, which is the test being wrong
// rather than the code. Whole-line comments are dropped for those two, and
// only those two, so a real string in the markup is still caught.
const RENDERED = MODULE.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const rHasNot = (re, label) => checks.push([label, !re.test(RENDERED)]);

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

// ---- the design system, not a generic layout ------------------------------
// The tab bar, the flag card and the buttons are components the Hub already
// defines. Reinventing them is how properties drift apart.
has(/class="ctr-seg"/, 'the tab bar is a segmented control, the reference structure');
has(/ctr-segb'\+\(CTR_TAB===t\?' on':''\)/, 'with an active segment');
has(/class="flag-alert ctr-flag/, 'flag cards are the Hub flag-alert component');
has(/class="btn-black-sm ctr-ctab" data-ctrtrack/, 'Track deadlines is the Hub primary button');
has(/class="ctr-go" type="button" data-ctrpage/, 'a page jump is a Go to page link');
// The reference screen is teal. The Aari palette is monochrome plus alert red,
// and copying the teal would break every other Aari property.
rHasNot(/teal|#0d9488|#14b8a6|#2dd4bf|#0f766e/i, 'no teal reaches the screen, the palette has one accent and it is red');
{
  // Every colour my own rules use has to be a design system token value.
  const css = MODULE.slice(MODULE.indexOf("s.textContent ="), MODULE.indexOf("document.head.appendChild(s)"));
  const TOKENS = new Set(['#fcfcfa','#ffffff','#000000','#f4f1e8','#1a1a1a','#2a2a2a','#3a3a3a','#4a4a4a',
    '#6a6a6a','#8a8a8a','#a0a09a','#ece9e2','#f0ede5','#e0ddd5','#d5d1c8','#B04040','#FFF8F4','#F9E2E2',
    '#274332','#162900','#fff','#000']);
  const used = [...new Set((css.match(/#[0-9a-fA-F]{3,6}/g) || []))];
  const stray = used.filter(h => !TOKENS.has(h));
  checks.push(['every colour on this screen is a design system token', stray.length === 0]);
  if (stray.length) console.log('     not tokens: ' + stray.join(', '));
}

// ---- Clauses and Chat say what they need ----------------------------------
// A coming soon stub was the thing most disliked about the new Hub.
rHasNot(/coming soon/i, 'neither tab renders the words coming soon');
has(/needs a language model and a cost for every file analysed/, 'Clauses says what it needs and why');
has(/That decision has not been made, so this is not built\. It is not waiting on engineering time\./,
  'and that the decision is not an engineering one');
has(/clauses_need:'Un registro de cl/, 'in Spanish too');

// ---- the deadline arithmetic ---------------------------------------------
{
  const from = MODULE.indexOf('var CTR_PERIOD_KEYS');
  const to = MODULE.indexOf('function ctrFlagCard(fl, docs){');
  checks.push(['the arithmetic ships in the module', from >= 0 && to > from]);
  if (from >= 0 && to > from) {
    const A = new Function(MODULE.slice(from, to) +
      '\nreturn {ctrSchedule:ctrSchedule, ctrHolidays:ctrHolidays, ctrRoll:ctrRoll, ctrIso:ctrIso};')();
    const FULL = { inspection_days:15, loan_approval_days:30, loan_application_days:5,
                   initial_deposit_days:3, additional_deposit_days:10 };
    const dateOf = (s, id) => (s.items.find(i => i.id === id) || {}).date;

    // No effective date, nothing computed. Returned alone everywhere else too.
    const none = A.ctrSchedule({ closing_date:'August 30, 2026' }, FULL);
    checks.push(['no effective date computes nothing at all', none.computable === false && none.items.length === 0]);

    const s1 = A.ctrSchedule({ effective_date:'July 1, 2026', closing_date:'August 30, 2026' }, FULL);
    checks.push(['eight items with all five numbers', s1.items.length === 8 && s1.items.every(i => i.date)]);
    // 1 Jul + 3 lands on Saturday 4 July, and the holiday is observed Friday
    // the 3rd, so it rolls forward to Monday.
    checks.push(['a forward date rolls off a weekend and a holiday', dateOf(s1,'init_deposit') === '2026-07-06']);
    checks.push(['inspection lands on a plain weekday', dateOf(s1,'inspection_end') === '2026-07-16']);
    checks.push(['the flood zone right is twenty days, printed not entered', dateOf(s1,'flood_zone') === '2026-07-21']);
    // Closing is a Sunday. A walk through counted back must roll BACK, or it
    // lands after the closing it is meant to precede.
    checks.push(['a date counted back from closing rolls backwards',
      dateOf(s1,'walk_through') === '2026-08-28']);
    checks.push(['and therefore never falls after closing',
      dateOf(s1,'walk_through') < '2026-08-30' && dateOf(s1,'survey') < '2026-08-30']);

    // No default is ever substituted for a number nobody entered.
    const bare = A.ctrSchedule({ effective_date:'July 1, 2026', closing_date:'August 30, 2026' }, {});
    const undatedIds = bare.items.filter(i => !i.date).map(i => i.id).sort();
    checks.push(['a missing period leaves its item with no date rather than a default',
      JSON.stringify(undatedIds) === JSON.stringify(['additional_deposit','init_deposit','inspection_end','loan_app','loan_approval'])]);
    checks.push(['and the printed values still compute',
      !!dateOf(bare,'flood_zone') && !!dateOf(bare,'walk_through')]);

    const noClose = A.ctrSchedule({ effective_date:'July 1, 2026' }, FULL);
    checks.push(['no closing date drops only the two closing items',
      !dateOf(noClose,'walk_through') && !dateOf(noClose,'survey') && !!dateOf(noClose,'inspection_end')]);

    // Only items with an unambiguous slot in file_deadlines are writable.
    const writable = s1.items.filter(i => i.deadline_key).map(i => i.id).sort();
    checks.push(['six of the eight map to a real deadline slot',
      JSON.stringify(writable) === JSON.stringify(['additional_deposit','init_deposit','inspection_end','loan_app','loan_approval','walk_through'])]);
    checks.push(['the two with no unambiguous slot are shown, never written',
      s1.items.filter(i => !i.deadline_key).map(i => i.id).sort().join(',') === 'flood_zone,survey']);

    checks.push(['holidays are computed, not a list that expires',
      A.ctrHolidays(2031).length === 11 && A.ctrHolidays(2031)[0].startsWith('2031')]);
  }
}

// ---- the write path -------------------------------------------------------
// file_deadlines already holds the checklist rows. Filling a due_date is the
// job; inserting duplicates or overwriting a coordinator's own date is not.
has(/if\(existing\.due_date\)\{ kept\+\+; continue; \}/, 'a date already set by a person is left alone');
hasNot(/from\('file_deadlines'\)\.insert/, 'Track deadlines never inserts a row');
has(/from\('file_deadlines'\)\.update\(\{ due_date/, 'it fills the slot that already exists');
has(/if\(!existing\)\{ absent\+\+; continue; \}/, 'and reports a file with no slot rather than creating one');
// The periods are confirmed values and belong on the file row.
has(/from\('files'\)\.update\(\{ deadline_periods: out \}\)/, 'the periods are stored on the file row');
has(/if\(raw !== ''\) out\[el\.getAttribute\('data-ctrper'\)\] = Number\(raw\);/,
  'an empty box stays empty rather than becoming the placeholder');
has(/placeholder="'\+m\[3\]\+'"/, 'the printed default is a placeholder, never a value');

// The reference structure, piece by piece, in the order it renders.
has(/ctr-langi[\s\S]{0,120}ctr-langp/, 'the language toggle is one joined pill with a glyph');
has(/ctr-ctai[\s\S]{0,200}ctr-ctat[\s\S]{0,200}ctr-ctab/, 'the callout is glyph, line, then button, in one row');
has(/class="ctr-dot" aria-hidden="true"/, 'each flag card carries a small coloured mark');
has(/ctr-go ctr-doc/, 'the documents jump links read like the Go to page link');
// Aari type: the section headings are the serif, not a micro label.
has(/\.ctr-sec\{font-family:var\(--serif/, 'section headings are the Aari serif');
has(/\.ctr-segb\.on\{background:#fff;color:#000;box-shadow/, 'the active segment is a white pill with a soft shadow');
has(/\.ctr-cta\{display:flex[^']*background:var\(--cream/, 'the callout is cream, not teal');

let bad = 0;
for (const [n, ok] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? '\nFAIL' : '\nPASS');
process.exit(bad ? 1 : 0);
