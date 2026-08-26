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
const db = read('build/hub_next.db.js');

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
const wired = lines.join('\n');

const out = (head + wired + auth)
  .split('__MP_PHOTO__').join(photo)
  .split('__AARI_LOGO__').join(logo)
  .split('__AARI_MARK__').join(mark);

const dest = path.join(root, 'hub_next.html');
fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + 'KB');
