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

const logo = fs.readFileSync(path.join(root, 'logo.png'));
if (!src.includes('__MP_PHOTO__')) throw new Error('__MP_PHOTO__ placeholder missing');
if (!src.includes('__AARI_LOGO__')) throw new Error('__AARI_LOGO__ placeholder missing');

// Full-size PNG is ~2MB. Good enough for a mockup, but if it ever needs to be
// smaller, downscale to roughly 520x700 and re-encode as JPEG first.
// logo.png is inlined as-is here; the published mockup uses a version that
// has been trimmed to the mark and had its white ground made transparent.
const out = src
  .split('__MP_PHOTO__').join('data:image/png;base64,' + png.toString('base64'))
  .split('__AARI_LOGO__').join('data:image/png;base64,' + logo.toString('base64'));
const dest = path.join(__dirname, 'dashboard-v6.html');
fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + 'KB');
