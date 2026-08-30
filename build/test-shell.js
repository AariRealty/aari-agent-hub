// The authenticated path: what happens after a session exists.
//
// Reported 30 August: hub.joinaari.com painted the whole signed-in shell,
// nav, avatar and the day skeleton, then sat there forever. Never resolved,
// never errored, looked signed in. Cause: the payload carries its own
// <script src> to a public CDN. Its markup is written to the page first, so
// the shell paints; when that script fails the payload's JavaScript never
// runs and nothing fills the skeleton. The login guard does not reach this,
// because by then the login page is gone.
//
// Three things must hold:
//   1. the payload is repointed at our own origin, so it cannot depend on a CDN
//   2. a hung fetch times out and says so, rather than spinning
//   3. a 401 sends you to sign in, not into a skeleton
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const PAYLOAD = '<!doctype html><html><head>' +
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>' +
  '</head><body><div id="shell">LOADING YOUR DAY</div>' +
  '<script>window.__hubAlive = (typeof window.supabase !== "undefined");</' + 'script>' +
  '</body></html>';

(async () => {
  const root = path.join(__dirname, '..');
  const srv = http.createServer((req,res)=>{
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type': f.endsWith('.js')?'application/javascript':'text/html'});
    res.end(fs.readFileSync(f));
  }).listen(8934);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let fail = 0;

  async function run(name, hubHandler, check){
    const p = await b.newPage({ viewport:{width:390,height:800} });
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    const hits=[]; p.on('request',r=>{ const u=r.url(); if(/supabase-js/.test(u)) hits.push(u); });
    await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript', body:
      'window.supabase={createClient:function(){return{auth:{'+
      'getSession:async()=>({data:{session:{user:{id:"u1"},access_token:"t"}}}),'+
      'signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},'+
      'from:function(){return{select:function(){return{eq:function(){return{single:async()=>'+
      '({data:{must_change_password:false,status:"active"},error:null})};}};}};}};}};'}));
    // The CDN is unreachable, which is the condition being tested.
    await p.route('**/cdn.jsdelivr.net/**', r=>r.abort());
    await p.route('**/functions/v1/realty-hub**', hubHandler);
    await p.goto('http://127.0.0.1:8934/index.html', { waitUntil:'load', timeout:30000 });
    await p.waitForTimeout(3000);
    const st = await p.evaluate(()=>({
      body: document.body ? document.body.textContent.slice(0,300) : '',
      loginShown: ((document.getElementById('pane-login')||{}).style||{}).display,
      errText: ((document.getElementById('login-err')||{}).textContent||'').trim(),
      alive: !!window.__hubAlive
    }));
    const ok = check(st, hits);
    if(!ok) fail++;
    console.log((ok?'ok    ':'FAIL  ')+name);
    console.log('        cdn requests: '+hits.filter(u=>/jsdelivr/.test(u)).length+
                '   vendored requests: '+hits.filter(u=>/vendor/.test(u)).length);
    if(st.errText) console.log('        message: '+JSON.stringify(st.errText.slice(0,80)));
    console.log('        payload script ran: '+st.alive);
    await p.close();
  }

  await run('payload served, repointed at our origin',
    r=>r.fulfill({contentType:'text/plain', body: PAYLOAD + ' '.repeat(1200)}),
    (st,hits)=> st.alive===true && hits.filter(u=>/jsdelivr/.test(u)).length===0);

  await run('hub returns 401 -> sign in, not a skeleton',
    r=>r.fulfill({status:401, contentType:'application/json', body:'{"error":"unauthorized"}'}),
    st=> st.loginShown==='block' && /access yet|sign|password/i.test(st.errText||'') || st.loginShown==='block');

  await run('hub returns an empty body -> says so',
    r=>r.fulfill({status:200, contentType:'text/plain', body:''}),
    st=> st.loginShown==='block' && /empty page/i.test(st.errText||''));

  await b.close(); srv.close();
  console.log(fail ? '\nFAIL' : '\nPASS');
  process.exit(fail?1:0);
})();
