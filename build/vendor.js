// Copies the installed supabase-js UMD build into vendor/ and prints its hash.
// Run after changing the version in package.json, then update the <script src>
// in index.html by hand. The manual step is deliberate: the filename carries
// the version, so the page names exactly which build it runs.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'node_modules/@supabase/supabase-js/package.json'));
const src = path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
const out = path.join(root, 'vendor', 'supabase-js-' + pkg.version + '.min.js');
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
const buf = fs.readFileSync(src);
fs.writeFileSync(out, buf);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
console.log('wrote  vendor/supabase-js-' + pkg.version + '.min.js');
console.log('bytes  ' + buf.length);
console.log('sha256 ' + sha);
console.log('\nNow update the <script src> in index.html to this filename, delete the old one, and run npm run check.');
