// Copies vendored third party builds into vendor/ and prints their hashes.
// Run after changing a version in package.json, then update the <script src>
// by hand. The manual step is deliberate: the filename carries the version, so
// the page names exactly which build it runs and a stale cache cannot quietly
// serve a different one.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });

function vendor(pkgName, from, name) {
  const pkg = require(path.join(root, 'node_modules', pkgName, 'package.json'));
  const buf = fs.readFileSync(path.join(root, 'node_modules', pkgName, from));
  const file = name.replace('{v}', pkg.version);
  fs.writeFileSync(path.join(root, 'vendor', file), buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  console.log('wrote  vendor/' + file);
  console.log('bytes  ' + buf.length);
  console.log('sha256 ' + sha);
  console.log('');
  return { file: file, bytes: buf.length, sha: sha, version: pkg.version };
}

vendor('@supabase/supabase-js', 'dist/umd/supabase.js', 'supabase-js-{v}.min.js');
// pdf.js ships the viewer and its worker as two files and both have to be
// served from our own origin. The worker path is set in the page, and if it is
// wrong pdf.js falls back to parsing on the main thread, which looks like it
// works until a twenty page contract locks the tab.
vendor('pdfjs-dist', 'build/pdf.min.js', 'pdfjs-{v}.min.js');
vendor('pdfjs-dist', 'build/pdf.worker.min.js', 'pdfjs-worker-{v}.min.js');

console.log('Now update the <script src> tags to these filenames, delete the old ones, and run npm run check.');
