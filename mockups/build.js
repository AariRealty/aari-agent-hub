// Inlines the broker headshot into the dashboard mockup. The published page
// has to be self-contained — the artifact host blocks every external origin —
// so the image travels with the file rather than being fetched at view time.
//
//   node mockups/build.js            -> mockups/dashboard-v6.html
//
// assets/headshots/marlenyi.png is pulled from Supabase Storage by the
// "Fetch headshots" workflow; the dev container has no egress to do it here.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(__dirname, 'dashboard-v6.src.html'), 'utf8');
const png = fs.readFileSync(path.join(root, 'assets/headshots/marlenyi.png'));

if (!src.includes('__MP_PHOTO__')) throw new Error('__MP_PHOTO__ placeholder missing');

// Full-size PNG is ~2MB. Good enough for a mockup, but if it ever needs to be
// smaller, downscale to roughly 520x700 and re-encode as JPEG first.
const out = src.split('__MP_PHOTO__').join('data:image/png;base64,' + png.toString('base64'));
const dest = path.join(__dirname, 'dashboard-v6.html');
fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + 'KB');
