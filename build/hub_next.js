// Builds hub_next.html, the standalone replacement portal, from three parts:
//
//   build/hub_next.head.html   document wrapper + sign in gate
//   mockups/dashboard-v6.src.html   the approved design, unchanged
//   build/hub_next.auth.html   the Supabase session layer
//
//   node build/hub_next.js  ->  hub_next.html
//
// The three image placeholders are inlined the same way mockups/build.js does
// it, with one difference: the headshot is downscaled and re-encoded as JPEG
// first. At full size it is 2.1MB, which as base64 would put the page over
// 3MB before a single row of data loads. That is not a page an agent should
// have to open on a phone every morning.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const head = read('build/hub_next.head.html');
const body = read('mockups/dashboard-v6.src.html');
const auth = read('build/hub_next.auth.html');

for (const token of ['__MP_PHOTO__', '__AARI_LOGO__', '__AARI_MARK__']) {
  if (!body.includes(token)) throw new Error(token + ' placeholder missing from the design source');
}

// Downscale + JPEG the headshot. Pillow is the only image tool in the
// container, so this shells out rather than pulling in a node dependency.
const tmp = path.join(require('os').tmpdir(), 'hub_next_headshot.jpg');
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open("${path.join(root, 'assets/headshots/marlenyi.png')}").convert("RGB")
im.thumbnail((520, 700), Image.LANCZOS)
im.save("${tmp}", "JPEG", quality=82, optimize=True, progressive=True)
`]);

const photo = 'data:image/jpeg;base64,' + fs.readFileSync(tmp).toString('base64');
const logo  = 'data:image/png;base64,'  + fs.readFileSync(path.join(root, 'logo.png')).toString('base64');
const mark  = 'data:image/png;base64,'  + fs.readFileSync(path.join(root, 'assets/logo-mark.png')).toString('base64');

// Strip the hardcoded contact rows and inject the live data layer in their
// place. DBP keeps its identity as an array the design already closes over;
// it just starts empty and is filled from Supabase after sign in.
const db = read('build/hub_next.db.js') + '\n' + read('build/hub_next.today.js');

const lines = body.split('\n');
let s = null;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('var DBP=[')) { s = i; break; }
}
if (s === null) throw new Error('var DBP=[ not found in the design source');
let depth = 0, e = null;
for (let i = s; i < lines.length; i++) {
  depth += (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length;
  if (depth === 0 && i > s) { e = i; break; }
}
if (e === null) throw new Error('var DBP=[ never closes');
// Empty a hardcoded data literal in place, keeping the binding the design
// closes over. Returns how many lines were dropped.
function blankLiteral(lines, name, empty) {
  let s = null;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^\\s*var ' + name + '\\s*=').test(lines[i])) { s = i; break; }
  }
  if (s === null) throw new Error('literal not found: ' + name);
  let depth = 0, e = s;
  const count = (l, a, b) => (l.match(a) || []).length - (l.match(b) || []).length;
  depth = count(lines[s], /\[/g, /\]/g) + count(lines[s], /\{/g, /\}/g);
  if (depth > 0) {
    for (let i = s + 1; i < lines.length; i++) {
      depth += count(lines[i], /\[/g, /\]/g) + count(lines[i], /\{/g, /\}/g);
      if (depth <= 0) { e = i; break; }
    }
  }
  const dropped = e - s + 1;
  lines.splice(s, dropped, '  var ' + name + ' = ' + empty + ';  // emptied: not wired yet');
  return dropped;
}
const stripped = e - s - 1;
lines.splice(s, e - s + 1, '  var DBP=[];  // filled from agent_contacts after sign in');
console.log('stripped ' + stripped + ' hardcoded contact rows from DBP');

// The data layer goes inside the design's IIFE so it shares scope with DBP
// and render(). The IIFE closes on the last '})();' in the file.
let close = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '})();') { close = i; break; }
}
if (close < 0) throw new Error('could not find the closing })(); of the design IIFE');
lines.splice(close, 0, db);
// Everything below is frozen 18 August data on a screen that is not wired.
// Blanking the literal removes the data; the coming soon override below
// removes the empty shell it would otherwise leave behind.
const BLANK = [
  ['DBCONTACT', '{}'],   // refilled from agent_contacts by the data layer
  ['DBDEALS', '{}'], ['DBPAST', '[]'], ['DBREF', '{}'],
  ['DBPROPVAL', '{}'], ['DBUNSOURCED', '[]'],
  ['TX_ACTIVE', '[]'], ['TX_TERMINATED', '[]'], ['CLOSED', '[]'],
  ['LISTINGS', '[]'], ['ROSTER', '[]'], ['SEATS', '[]'], ['TEAM', '[]'],
  ['ANNIV', '[]'], ['CAL_EVENTS', '[]'], ['ANN', '[]'],
  ['ANNROWS', '[]'], ['CLASS_ITEMS', '[]'],
  // Client home addresses with coordinates, household pairings, and the
  // monthly commission table. All real people, none of it wired.
  ['PB', '[]'], ['DBDUPS', '[]'], ['DBHH', '[]'], ['MONTHS', '{}'],
  ['TXQ', '[]'], ['TXQ0', '[]'],
  // Her real 2026 goal row and her real earned figure, as bare integers that
  // only become money at render time via toLocaleString. Every agent would
  // have seen HER numbers on their own cover.
  ['GOAL', "{ broker:{target:0, done:0, set:false}, agent:{target:0, earned:0, set:false} }"],
  ['GE0', "{income_target:0,avg_price:0,commission_pct:0,split_pct:0}"]
];
let blanked = 0;
for (const [name, empty] of BLANK) blanked += blankLiteral(lines, name, empty);
console.log('emptied ' + BLANK.length + ' hardcoded literals, ' + blanked + ' lines');

// Replace an unwired page function's body outright. Overriding it at runtime
// stops it drawing, but leaves every address and figure in its markup sitting
// in the file where anyone who can fetch the file can read them. This removes
// the body instead. Returns lines dropped.
function stubPage(lines, name, title, line) {
  let s = null;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^\\s*function ' + name + '\\s*\\(').test(lines[i])) { s = i; break; }
  }
  if (s === null) return 0;
  let depth = 0, e = null, started = false;
  for (let i = s; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (!started && /\{/.test(l)) started = true;
    if (started && depth <= 0) { e = i; break; }
  }
  if (e === null) return 0;
  const dropped = e - s + 1;
  lines.splice(s, dropped,
    '  function ' + name + '(){  // not wired yet, body removed at build time',
    '    return __soonCard(' + JSON.stringify(title) + ', ' + JSON.stringify(line) + ');',
    '  }');
  return dropped - 3;
}

// The coming soon card helper has to exist before the stubs reference it.
const soonHelper = read('build/hub_next.soon.js');

const SOON = JSON.parse(read('build/hub_next.soon.json'));
let stubbedLines = 0, stubbed = 0;
for (const [fn, title, line] of SOON) {
  const n = stubPage(lines, fn, title, line);
  if (n > 0) { stubbedLines += n; stubbed++; }
}
console.log('stubbed ' + stubbed + ' unwired page functions, ' + stubbedLines + ' lines of markup removed');

const comingSoon = soonHelper;
let close2 = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '})();') { close2 = i; break; }
}
lines.splice(close2, 0, comingSoon);

// Real figures, addresses and personal emails survive in two places: source
// comments, which never render, and string literals on screens that are still
// drawing. Comments keep their sentence with the value redacted, so the
// reasoning survives. Rendered strings get an honest placeholder instead of a
// number the Hub cannot stand behind.
const MONEY = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g;
const ADDR  = /\b\d{2,6}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z.]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Way|Ter|Terrace|Pl|Place)\b(?:\s+[EWNS]\b)?(?:,\s*[A-Z][A-Za-z ]+(?:,\s*FL\s*\d{5})?)?/g;
const MAIL  = /\b[A-Za-z0-9._%+-]+@(?!aarirealty\.com|joinaari\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Skip the reviewed resource directory: public agency and vendor support lines.
let rzStart = -1, rzEnd = -1;
for (let i = 0; i < lines.length; i++) if (/^\s*var RZ\s*=/.test(lines[i])) { rzStart = i; break; }
if (rzStart >= 0) {
  let d = 0;
  for (let i = rzStart; i < lines.length; i++) {
    d += (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length;
    if (d <= 0 && i > rzStart) { rzEnd = i; break; }
  }
}

let inBlock = false, redacted = 0, neutralised = 0;
for (let i = 0; i < lines.length; i++) {
  if (rzStart >= 0 && i >= rzStart && i <= rzEnd) continue;
  const l = lines[i];
  if (l.length > 400) continue;
  const opens = /\/\*/.test(l), closes = /\*\//.test(l);
  const isComment = inBlock || opens || /^\s*(\/\/|\*)/.test(l);
  if (opens && !closes) inBlock = true;
  if (closes) inBlock = false;

  let out = l;
  if (isComment) {
    out = out.replace(MONEY, '[figure]').replace(ADDR, '[address]').replace(MAIL, '[email]');
    if (out !== l) redacted++;
  } else {
    out = out.replace(MONEY, '&middot;').replace(ADDR, 'Not connected yet').replace(MAIL, '');
    // Money without a dollar sign. Bare integers on money-shaped keys and in
    // count attributes only become figures at render time, so the patterns
    // above never saw them. Zeroed rather than removed, so arithmetic that
    // reads them still works and simply reports nothing.
    out = out.replace(/\b(target|earned|income_target|avg_price|gci|volume|amount|price|fee_amount|commission|net|gross|outstanding)(\s*:\s*)\d{3,}/g, '$1$20');
    out = out.replace(/(data-(?:count|money)\s*=\s*")\d{3,}(")/g, '$10$2');
    if (out !== l) neutralised++;
  }
  lines[i] = out;
}
console.log('redacted ' + redacted + ' comment lines, neutralised ' + neutralised + ' rendered lines');

// The note under the tier rows is a paragraph of frozen counts wrapped in
// prose: "204 clients and 3 vendors ... eight working days ... thirteen
// weeks". Rewritten to read from the same computed figures as the card above
// it, so it cannot drift from the numbers sitting directly over it.
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('204 clients and 3 vendors')) {
    lines[i] = "          :'<div class=\"note\">'+DBN.clients+' client'+(DBN.clients===1?'':'s')+' and '+DBN.vendors+' vendor'+(DBN.vendors===1?'':'s')+'. '+" +
               "(DBN.hh? DBN.hh+' household'+(DBN.hh===1?' holds ':'s hold ')+DBN.hhrows+' of those rows, so the book is ':'The book is ')+";
    // The sentence runs on for two more lines of frozen arithmetic: how many
    // are inside cadence, how many working days to clear tier A, how many
    // weeks for the book. Replace the whole tail with the one figure that is
    // actually known.
    for (let j = i + 1; j < i + 4 && j < lines.length; j++) {
      if (lines[j].includes('inside their cadence')) {
        lines[j] = "           DBN.total+' people. '+DBN.ok+' of them '+(DBN.ok===1?'is':'are')+' currently inside their cadence.</div>')+";
      } else if (lines[j].includes('working days')) {
        lines[j] = "           ''+";
      }
    }
  }
}

// A real client address used as a form placeholder.
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('id="tx-addr"')) {
    lines[i] = lines[i].replace(/placeholder="[^"]*"/, 'placeholder="Street, city, state ZIP"');
  }
}

const wired = lines.join('\n');

const out = (head + wired + auth)
  .split('__MP_PHOTO__').join(photo)
  .split('__AARI_LOGO__').join(logo)
  .split('__AARI_MARK__').join(mark);

const dest = path.join(root, 'hub_next.html');
fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + 'KB');
