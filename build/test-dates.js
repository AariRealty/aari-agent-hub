// Nothing in the Hub may hardcode a date. This has been fixed three times in
// one session and each time something survived: the cover, then the week
// strip, then the month-elapsed bar. Every fix looked complete. A test is the
// only thing that does not forget.
//
// Scans the built file for the patterns that caused each of those, and prints
// the offending line so the next one is diagnosed rather than hunted.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'hub_next.html'), 'utf8');
const lines = src.split('\n');

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const RULES = [
  { name: 'new Date() with a literal year and month',
    rx: /new Date\(\s*20\d\d\s*,\s*\d+\s*[,)]/,
    why: 'pins the calendar to one month; use CAL_NOW.getFullYear() and .getMonth()' },
  { name: 'a month name inside a date label',
    rx: new RegExp("(Week of|left in|days? left|elapsed)[^'\"\\n]{0,20}(" + MONTHS + ")"),
    why: 'the month must come from the real date, not a literal' },
  { name: 'a hardcoded percentage of the month elapsed',
    rx: /\d{1,3}%\s*(&middot;|·)\s*\d+\s*days?\s*left/,
    why: 'compute from the real date and the real length of the month' },
  { name: 'a date guarded on one specific month',
    rx: /getMonth\(\)\s*===\s*\d+\s*&&\s*.*getFullYear\(\)\s*===\s*20\d\d/,
    why: 'falls back to a fixed day outside that month' },
];

// Lines that legitimately hold a month name: the lookup table itself, and the
// day-of-week list. Named rather than matched loosely, so the exemption cannot
// quietly swallow a real offender.
const ALLOW = [
  /var CAL_MONTHS\s*=\s*\[/,
  /^\s*var M = \['January'/,
  /'January','February','March','April','May','June','July','August','September','October','November','December'/,
];

// Comments describe the bugs that were fixed, so they quote the very strings
// this test hunts for. Only code counts.
function isComment(l){
  const t = l.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

let bad = [];
lines.forEach((l, i) => {
  if (isComment(l)) return;
  if (ALLOW.some(a => a.test(l))) return;
  RULES.forEach(r => {
    if (r.rx.test(l)) bad.push({ line: i + 1, rule: r.name, why: r.why, text: l.trim().slice(0, 120) });
  });
});

if (bad.length) {
  console.log('hardcoded dates found:\n');
  bad.slice(0, 12).forEach(b => {
    console.log('  line ' + b.line + '  ' + b.rule);
    console.log('    ' + b.text);
    console.log('    ' + b.why + '\n');
  });
  if (bad.length > 12) console.log('  ...and ' + (bad.length - 12) + ' more');
  console.log('\nFAIL');
  process.exit(1);
}
console.log('ok   no hardcoded year or month in the built Hub');
console.log('ok   no frozen month-elapsed figure');
console.log('\nPASS');
