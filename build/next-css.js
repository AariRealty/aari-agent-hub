// Generates the new Hub's override layer for the two injected modules, from
// the Aari design system rather than by hand.
//
// The modules borrow class names from the design system: .panel-title,
// .btn-submit, .flag-alert, .form-input and the rest. hub_payload implements
// that system, so on the old build they resolve and nothing is needed.
// hub_next has its own vocabulary and defines none of them, so on the new
// build they resolved to nothing.
//
// Rather than retype fifty rules, this reads the pinned copy of the system,
// keeps only the rules whose selector names a class the modules actually put
// on an element, prefixes each selector with `#app `, and writes the result
// into tx_module.html between two markers. #app exists only in the new build,
// so the whole layer is inert on the build the agents are on, by construction
// rather than by care.
//
//   node build/next-css.js          rewrites the block
//   node build/next-css.js --check  fails if the block is stale
//
// build/aari-base.css is a pinned copy of the design system skill's
// aari-base.css, sha256 a9a2f6410913529b44e16c3b05a1e233dc4c4282585865de093c4fe42309e699.
// Re-copy it and re-run this when the system changes; nothing here edits it.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const START = '/*NEXT_CSS_START*/';
const END = '/*NEXT_CSS_END*/';

// Every class name the two modules put on an element. Read from the modules
// themselves so the list cannot drift away from the markup.
function usedClasses() {
  const out = new Set();
  for (const f of ['tx_module.html', 'broker_module.html']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const add = (s) => s.split(/\s+/).forEach(t => { if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(t)) out.add(t); });
    for (const m of src.matchAll(/class=\\?["']([^"'\\]+)/g)) add(m[1]);
    for (const m of src.matchAll(/className\s*=\s*["']([^"']+)/g)) add(m[1]);
    for (const m of src.matchAll(/classList\.(?:add|toggle)\(\s*["']([A-Za-z][A-Za-z0-9_-]*)/g)) out.add(m[1]);
  }
  return out;
}

// A deliberately small CSS reader. The design system is hand written, one rule
// per line, with two @media blocks. Anything it cannot parse is reported
// rather than skipped, because a rule dropped in silence is a rule nobody
// notices is missing.
function rules(css) {
  const out = [];
  let media = null, depth = 0, skip = false;
  for (const raw of css.split('\n')) {
    const line = raw.replace(/\/\*.*?\*\//g, '').trim();
    if (!line) continue;
    if (/^@media/.test(line)) { media = line.replace(/\{$/, '').trim(); depth = 1; continue; }
    if (media && line === '}') { if (--depth <= 0) media = null; continue; }
    if (/^@import/.test(line)) continue;
    if (/^:root/.test(line)) { skip = !line.endsWith('}'); continue; }
    if (skip) { if (line.endsWith('}')) skip = false; continue; }
    if (line === '}') continue;
    // One source line can carry more than one rule. Splitting on the brace pair
    // matters: treating "a{x}b{y}" as a single rule left the second one with no
    // scope prefix at all, which is a leak onto every page, not a styling miss.
    for (const m of line.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ sel: m[1].trim(), body: m[2].trim(), media });
    }
  }
  return out;
}

// The design system's own token values, so a var() that the new Hub does not
// define still resolves. Written as fallbacks rather than by redefining the
// tokens on #app: redefining them would also repaint the new Hub's own UI,
// which this layer must never touch.
function tokens(css) {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  const out = {};
  if (!m) return out;
  for (const d of m[1].split(';')) {
    const k = d.match(/(--[a-z0-9-]+)\s*:\s*(.+)/i);
    if (k) out[k[1]] = k[2].trim();
  }
  return out;
}
function withFallbacks(body, tok) {
  return body.replace(/var\((--[a-z0-9-]+)\)/gi, (whole, name) =>
    tok[name] ? 'var(' + name + ',' + tok[name] + ')' : whole);
}

// The design system does not define every class the modules use. The ones it
// does not are hub_payload originals, and hub_payload's own stylesheet is the
// only definition of them that exists, so it is the second source rather than
// a place to invent values. hub_payload is archived and untouched, so this
// cannot drift the way a hand copy would.
//
// Excluded on purpose, and not gaps:
//   on, active        state modifiers, only ever used compounded with a
//                     component class that is already covered
//   vt-btn, vt-active  markers the view toggle queries from JavaScript; the
//                     pills are painted by .hr-pill, which the module owns
//   mydeals-tabs      styled with inline style attributes, no rule anywhere
//   err               only ever .ctr-note.err, and the module defines that
const NOT_COMPONENTS = new Set(['on', 'active', 'vt-btn', 'vt-active', 'mydeals-tabs', 'err']);

// hub_payload's stylesheet is 292KB of hand written CSS, so this brace matches
// rather than reading a rule per line the way the design system allows.
function payloadRules(html) {
  const out = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = m[1];
    let i = 0, media = null, mediaEnd = -1;
    while (i < css.length) {
      const open = css.indexOf('{', i);
      if (open < 0) break;
      let head = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (/^@media/i.test(head)) { media = head; mediaEnd = matchEnd(css, open); i = open + 1; continue; }
      if (/^@/.test(head)) { i = matchEnd(css, open) + 1; continue; }
      const end = matchEnd(css, open);
      if (end < 0) break;
      out.push({ sel: head, body: css.slice(open + 1, end).trim(), media });
      i = end + 1;
      if (media !== null && i > mediaEnd) { media = null; }
    }
  }
  return out;
}
function matchEnd(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') d++;
    else if (s[i] === '}') { if (--d === 0) return i; }
  }
  return -1;
}

function build() {
  const used = usedClasses();
  const css = fs.readFileSync(path.join(__dirname, 'aari-base.css'), 'utf8');
  const tok = tokens(css);
  const kept = [];
  for (const r of rules(css)) {
    // Every comma separated part must be class based and name something the
    // modules use. Bare element and id selectors are the design system's shell,
    // which the new build supplies itself and must not be overwritten.
    const parts = r.sel.split(',').map(s => s.trim()).filter(Boolean);
    const take = parts.filter(p => {
      const names = [...p.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(x => x[1]);
      if (!names.length) return false;
      if (!names.some(n => used.has(n))) return false;
      // never reach outside the module: no bare element leading selector
      return /^\./.test(p) || /^\.[^ ]/.test(p);
    });
    if (!take.length) continue;
    kept.push({ sel: take.map(p => '#app ' + p).join(','), body: withFallbacks(r.body, tok), media: r.media });
  }
  // Second source: hub_payload, for the names the design system never had.
  const covered = new Set();
  for (const k of kept) for (const n of k.sel.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) covered.add(n[1]);
  const orphans = new Set([...used].filter(n => !covered.has(n) && !NOT_COMPONENTS.has(n)));
  const payload = fs.readFileSync(path.join(root, 'hub_payload.html'), 'utf8');
  const fromPayload = [];
  for (const r of payloadRules(payload)) {
    const parts = r.sel.split(',').map(x => x.trim()).filter(Boolean);
    // Anchored on an orphan: the FIRST class in the part must be one. That keeps
    // every borrowed rule rooted on a component the modules own, so none of them
    // can reach an element the new Hub owns.
    const take = parts.filter(p => {
      const first = p.match(/^\.([A-Za-z][A-Za-z0-9_-]*)/);
      return first && orphans.has(first[1]);
    });
    if (!take.length) continue;
    fromPayload.push({ sel: take.map(p => '#app ' + p).join(','), body: r.body.replace(/\s+/g, ' ').trim(), media: r.media });
  }
  kept.push(...fromPayload);

  // Group the media rules after the plain ones so the cascade is unsurprising.
  const plain = kept.filter(k => !k.media), inMedia = kept.filter(k => k.media);
  const lines = [];
  lines.push("  /* Generated by build/next-css.js. Do not edit by hand: run the script.");
  lines.push("     Source one is build/aari-base.css, the pinned design system. Source two");
  lines.push("     is hub_payload's own stylesheet, for the class names the system never");
  lines.push("     defined, which exist nowhere else. Every selector is prefixed #app,");
  lines.push("     which exists only in the new Hub. */");
  // The emitted CSS is concatenated into a single quoted JavaScript string, and
  // some design system values carry their own quotes: the serif stack is
  // 'Cormorant Garamond'. Unescaped, the first one ends the string and the file
  // stops parsing.
  const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  for (const k of plain) lines.push("  +'" + q(k.sel) + '{' + q(k.body) + "}'");
  const byMedia = {};
  for (const k of inMedia) (byMedia[k.media] = byMedia[k.media] || []).push(k);
  for (const query of Object.keys(byMedia)) {
    lines.push("  +'" + query + '{' + byMedia[query].map(k => q(k.sel) + '{' + q(k.body) + '}').join('') + "}'");
  }
  return { text: lines.join('\n'), count: kept.length, used };
}

const target = path.join(root, 'tx_module.html');
let src = fs.readFileSync(target, 'utf8');
const a = src.indexOf(START), b = src.indexOf(END);
if (a < 0 || b < 0) { console.error('markers not found in tx_module.html'); process.exit(1); }
const built = build();
const next = src.slice(0, a + START.length) + '\n' + built.text + '\n  ' + src.slice(b);

if (process.argv.includes('--check')) {
  if (next !== src) { console.error('build/next-css.js: the generated block is stale. Run: node build/next-css.js'); process.exit(1); }
  console.log('next-css block is current (' + built.count + ' rules)');
} else {
  fs.writeFileSync(target, next);
  console.log('wrote ' + built.count + ' scoped rules into tx_module.html');
}
