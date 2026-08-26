// Counts hardcoded personal data left in hub_next.html.
//
//   node build/pii-sweep.js
//
// Exits non-zero while anything is still baked in, so it can gate a publish.
// Base64 image data is skipped: it is the headshot and the logo, not records.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'hub_next.html');
const raw = fs.readFileSync(file, 'utf8');

// Drop data: URIs and any absurdly long line, which is only ever inlined media.
const text = raw
  .replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/g, 'data:INLINED')
  .split('\n').filter(l => l.length < 400).join('\n');

const checks = [
  ['phone numbers',   /\b(?:\(\d{3}\)\s?|\d{3}[-.])\d{3}[-.]\d{4}\b/g],
  ['email addresses', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ['street addresses',/\b\d{2,6}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z.]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Way|Ter|Terrace|Pl|Place)\b/g],
  ['dollar figures',  /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g],
  ['bare production numbers', /\[\s*'[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+'\s*,\s*\d{4,}\s*,/g]
];

// Company addresses and the brokerage's own mailbox are not client data.
const ALLOW = [/@aarirealty\.com/i, /@joinaari\.com/i];

let total = 0;
const report = [];
for (const [label, re] of checks) {
  const hits = [...new Set((text.match(re) || []))].filter(h => !ALLOW.some(a => a.test(h)));
  total += hits.length;
  report.push({ label, count: hits.length, sample: hits.slice(0, 3) });
}

const w = Math.max(...report.map(r => r.label.length));
for (const r of report) {
  console.log(
    r.label.padEnd(w) + '  ' + String(r.count).padStart(4) +
    (r.count ? '   e.g. ' + r.sample.join(', ').slice(0, 70) : '')
  );
}
console.log('-'.repeat(w + 8));
console.log('TOTAL'.padEnd(w) + '  ' + String(total).padStart(4));
process.exit(total === 0 ? 0 : 1);
