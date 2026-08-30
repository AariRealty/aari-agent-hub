// Which outside origins does the Hub load code or styles from.
//
// On 30 August sign in broke because index.html pulled supabase-js from a
// public CDN and the request failed: the script died on its first statement
// and the login form fell back to a native submit. The library is vendored
// now. This exists so a new external dependency cannot creep back in without
// somebody deciding to.
//
// Only blocking loads count: <script src> and <link rel=stylesheet>. A link
// somebody clicks cannot take the page down.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

// Fonts are the one outside origin still allowed, and they are not fatal: a
// stylesheet that fails to load does not stop JavaScript, it only falls back
// to the next family in the stack. Vendoring them is a separate decision.
const ALLOWED = [/^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//];

(async () => {
  const root = path.join(__dirname, '..');
  const srv = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html' });
    res.end(fs.readFileSync(f));
  }).listen(8934);

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const external = [];
  p.on('request', r => {
    const u = r.url(), t = r.resourceType();
    if (u.startsWith('http://127.0.0.1:8934') || u.startsWith('data:') || u.startsWith('blob:')) return;
    if (t === 'script' || t === 'stylesheet' || t === 'font') external.push({ url: u, type: t });
  });

  await p.goto('http://127.0.0.1:8934/index.html', { waitUntil: 'load', timeout: 30000 });
  await p.waitForTimeout(1500);

  const st = await p.evaluate(() => ({
    libLoaded: !!(window.supabase && window.supabase.createClient),
    clientMade: (typeof sb !== 'undefined') && !!sb && !!sb.auth
  }));

  const unexpected = external.filter(e => !ALLOWED.some(re => re.test(e.url)));
  console.log('library served from our own origin: ' + st.libLoaded);
  console.log('client created:                     ' + st.clientMade);
  console.log('page errors:                        ' + errs.length);
  console.log('\nexternal blocking loads: ' + external.length);
  for (const e of external) {
    const ok = ALLOWED.some(re => re.test(e.url));
    console.log('  ' + (ok ? 'allowed    ' : 'UNEXPECTED ') + e.type.padEnd(11) + e.url.slice(0, 78));
  }

  await b.close(); srv.close();
  const pass = st.libLoaded && st.clientMade && !errs.length && unexpected.length === 0;
  console.log(pass ? '\nPASS' : '\nFAIL');
  process.exit(pass ? 0 : 1);
})();
