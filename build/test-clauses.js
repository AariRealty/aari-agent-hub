// The clause register, checked offline.
//
// The build container's proxy blocks supabase.co and the model API, so this
// cannot run a register. What it can do is guard the two rules, and those are
// the whole product. A register that quietly merged with risk flags, or that
// stored a clause nobody had located in the document, would be worse than no
// register: it would look like evidence.
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ts   = fs.readFileSync(path.join(ROOT, 'supabase/functions/realty-clause-register/index.ts'), 'utf8');
const sql  = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260905_clause_register.sql'), 'utf8');
const flagTest = fs.readFileSync(path.join(ROOT, 'build/test-flags.js'), 'utf8');

const checks = [];
const ok = (name, pass, note) => checks.push([name, !!pass, note || '']);

// ---- RULE ONE. The two vocabularies must share no word. ------------------
// Read both from their real sources rather than restating them here, so this
// keeps holding when either side changes.
const clauseSev = (ts.match(/const SEVERITIES = \[([^\]]+)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
const flagSev = ((flagTest.match(/\/\^\(([a-z|]+)\)\$\//) || [, ''])[1]).split('|').filter(Boolean);

ok('the clause vocabulary was found', clauseSev.length === 3, clauseSev.join(','));
ok('the risk flag vocabulary was found', flagSev.length === 2, flagSev.join(','));
const overlap = clauseSev.filter((s) => flagSev.includes(s));
ok('the two vocabularies share no word', overlap.length === 0, 'overlap: ' + overlap.join(','));
ok('clause severity is exactly standard, negotiated, unusual',
   clauseSev.join(',') === 'standard,negotiated,unusual');
ok('the database constrains severity to the same three',
   /severity       text not null check \(severity in \('standard','negotiated','unusual'\)\)/.test(sql));
// A flag word appearing as a clause severity anywhere would be the merge.
ok('no flag word appears as a clause severity in the schema',
   !flagSev.some((w) => new RegExp("severity in \\([^)]*'" + w + "'").test(sql)));
// The clause tables must not create or carry a flags column of their own. The
// word itself appears in the migration's comment explaining the separation,
// which is the point, so ban the structure and not the word.
const sqlNoComments = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
ok('clauses and flags are different tables',
   /create table if not exists realty_contract_clauses/.test(sql)
   && !/\bflags?\b/i.test(sqlNoComments));
ok('the register writes no risk flag', !/risk_flag|riskFlags|flags_at/.test(ts));

// ---- RULE TWO. Nothing is stored that was not located. -------------------
ok('every clause is checked against the page text',
   /normPages\[claimed - 1\]\.includes\(nq\)/.test(ts));
ok('a quote not on its claimed page is searched for elsewhere',
   /normPages\.findIndex\(\(p\) => p\.includes\(nq\)\)/.test(ts));
ok('a quote found nowhere is rejected, not stored',
   /if \(found < 0\) \{ rejected\.push/.test(ts));
ok('rejections are counted on the run', /clauses_rejected: rejected\.length/.test(ts));
ok('the count is a database column', /clauses_rejected  integer not null default 0/.test(sql));
ok('a stored clause is verified by construction', /quote_verified: true/.test(ts));
// The guarantee has to survive someone later inserting a row by hand.
ok('the database refuses an unverified clause',
   /add constraint realty_contract_clauses_verified_only check \(quote_verified\)/.test(sql));
ok('a quote too short to be evidence is rejected',
   /const MIN_QUOTE = \d+/.test(ts) && /norm\(quote\)\.length < MIN_QUOTE/.test(ts));
ok('the minimum is long enough to mean something',
   Number((ts.match(/const MIN_QUOTE = (\d+)/) || [, 0])[1]) >= 20);
ok('normalising does not strip anything but case and whitespace',
   /toLowerCase\(\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)/.test(ts));

// ---- The page number, required and verified ------------------------------
// Her point: their clause links drive the PDF viewer. Ours only work if the
// page is right, so requiring it is not enough on its own.
ok('page is required by the tool schema',
   /required: \['title', 'category', 'severity', 'page', 'quote'\]/.test(ts));
ok('page is a not-null column', /page           integer not null/.test(sql));
ok('the stored page is the verified one, not the claimed one',
   /page: found,/.test(ts));
ok('a corrected page is recorded as corrected',
   /page_corrected: Number\.isFinite\(claimed\) && claimed !== found/.test(ts));
ok('page_corrected is a column', /page_corrected boolean not null default false/.test(sql));

// ---- Structured output ----------------------------------------------------
ok('the model is constrained by a tool schema, not asked politely',
   /tool_choice: \{ type: 'tool', name: TOOL\.name \}/.test(ts));
ok('the severity enum is pinned at the API boundary',
   /severity: \{ type: 'string', enum: SEVERITIES/.test(ts));
ok('a truncated register is refused rather than stored short',
   /stop === 'max_tokens'/.test(ts) && /would have been incomplete/.test(ts));
ok('a failure names the stop reason and what did arrive',
   /stop_reason=/.test(ts) && /blocks=/.test(ts));

// ---- Nothing fails silently ----------------------------------------------
['registered','no_contract','unreadable','no_clauses_found','all_rejected',
 'model_error','model_unavailable','error'].forEach((o) => {
  ok("outcome '" + o + "' exists in the schema", new RegExp("'" + o + "'").test(sql));
});
ok('a file with no contract is not a failed read',
   /This is not a failed read/.test(ts));
ok('a model outage is told apart from a model error',
   /unavailable \? 'model_unavailable' : 'model_error'/.test(ts));
ok('every run is recorded, including the failures',
   /await admin\.from\('realty_clause_runs'\)\.insert\(\{[\s\S]{0,200}outcome,/.test(ts));

// ---- Blast radius ---------------------------------------------------------
// The register reads. It must not become a second writer of contract values.
ok('it never writes to files', !/from\('files'\)[\s\S]{0,40}\.update\(/.test(ts));
ok('it never writes raw_form_data', !/raw_form_data:/.test(ts));
ok('it only writes its own two tables',
   (ts.match(/\.from\('([a-z_]+)'\)/g) || [])
     .map((m) => m.replace(/\.from\('|'\)/g, ''))
     .every((t) => ['files','realty_clause_runs','realty_contract_clauses'].includes(t)));

// ---- Cost is reported, not assumed ---------------------------------------
ok('tokens and cost are recorded per run',
   /input_tokens: inTok, output_tokens: outTok, usd/.test(ts));
ok('cost is computed from one place', /const USD_IN = 3\.0, USD_OUT = 15\.0/.test(ts));

// ---- House style -----------------------------------------------------------
const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
const dashes = [...ts, ...sql].filter((c) => c === EM || c === EN).length;
ok('no em or en dashes', dashes === 0, dashes + ' found');
ok('the file carries no literal control characters',
   ![...ts].some((c) => c.charCodeAt(0) < 32 && c !== '\n' && c !== '\t'));

checks.forEach(([n, pass, note]) => console.log((pass ? 'ok   ' : 'FAIL ') + n + (pass || !note ? '' : '  (' + note + ')')));
const failed = checks.filter((c) => !c[1]).length;
console.log('\n' + checks.length + ' checks, ' + failed + ' failed');
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
