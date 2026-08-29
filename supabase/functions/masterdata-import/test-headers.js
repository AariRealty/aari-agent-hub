// Exercises the header resolution in index.ts.pending against header rows
// shaped like a SkySlope MasterData export. The logic is lifted out of the
// source at run time rather than copied, so this cannot drift from it.
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, 'index.ts.pending'), 'utf8');

function block(startRe, endRe) {
  const lines = src.split('\n');
  let s = lines.findIndex(l => startRe.test(l));
  if (s < 0) throw new Error('not found: ' + startRe);
  for (let i = s; i < lines.length; i++) if (endRe.test(lines[i])) return lines.slice(s, i + 1).join('\n');
  throw new Error('no end for ' + startRe);
}
const tsSource = [
  block(/^const FALLBACK =/, /\} as const;/),
  block(/^const HEADERS:/, /^\};/),
  block(/^function norm\(/, /^function norm\(/),
  block(/^function resolveColumns\(/, /^\}/)
].join('\n') + '\nglobalThis.__out = { resolveColumns, norm };';

// Transpile the real TypeScript rather than stripping types by hand, which is
// how the first version of this test broke.
const { transformSync } = require('esbuild');
const js = transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code;
const ctx = { module: {}, exports: {}, console, globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(js, ctx);
const { resolveColumns } = ctx.__out;


// Row index 3 is the header row; rows 0-2 are the export's banner.
function sheet(headers) { return [[], [], [], headers, [], []]; }

const cases = [
  ['exact SkySlope names', sheet([
    'Office','Transaction Status','x','Transaction Type','Property Type','x','x','x','x','x',
    'Property Address','x','x','x','x','x','Scheduled Closing Date','Actual Closing Date','x',
    'List Price','Sale Price','x','x','x','x','x','x','x','Gross Commission',
    'Agent First Name','Agent Last Name','Net Commission','Client Name','Effective Date','Contract Type'])],
  ['alias wording', sheet([
    'Office','Status','x','Type','Property Type','x','x','x','x','x',
    'Full Address','x','x','x','x','x','Estimated Close Date','Closing Date','x',
    'Listing Price','Purchase Price','x','x','x','x','x','x','x','Total Commission',
    'Listing Agent First Name','Listing Agent Last Name','Net To Agent','Buyer Name','Acceptance Date','Form Type'])],
  ['a column inserted at the front, which used to shift everything', sheet([
    'NEW COLUMN','Office','Transaction Status','x','Transaction Type','Property Type','x','x','x','x',
    'x','Property Address','x','x','x','x','x','Scheduled Closing Date','Actual Closing Date','x',
    'List Price','Sale Price','x','x','x','x','x','x','x','Gross Commission',
    'Agent First Name','Agent Last Name','Net Commission','Client Name','Effective Date','Contract Type'])],
  ['four fields absent, as the current export is', sheet([
    'Office','Transaction Status','x','Transaction Type','Property Type','x','x','x','x','x',
    'Property Address','x','x','x','x','x','Scheduled Closing Date','Actual Closing Date','x',
    'List Price','Sale Price','x','x','x','x','x','x','x','Gross Commission',
    'Agent First Name','Agent Last Name'])]
];

let fail = 0;
for (const [name, rows] of cases) {
  const { COL, report } = resolveColumns(rows);
  const byHeader = Object.keys(report).filter(k => report[k].from === 'header');
  const missing = Object.keys(report).filter(k => report[k].from === 'MISSING');
  const fellBack = Object.keys(report).filter(k => report[k].from === 'fallback index');
  const hdr = rows[3];
  // Every field resolved from a header must point at that header.
  const wrong = byHeader.filter(k => !HEADERSOK(k, hdr[COL[k]]));
  function HEADERSOK(key, h) { return h != null && String(h).trim() !== '' && String(h) !== 'x'; }
  const ok = wrong.length === 0;
  if (!ok) fail++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name);
  console.log('        by header: ' + byHeader.length + ', fallback: ' + fellBack.length + ', missing: ' + missing.length);
  if (missing.length) console.log('        MISSING: ' + missing.join(', '));
  if (wrong.length) console.log('        POINTS AT BLANK: ' + wrong.join(', '));
}
console.log(fail ? '\nFAIL' : '\nPASS');
process.exit(fail ? 1 : 0);
