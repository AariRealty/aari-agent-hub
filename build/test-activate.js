// The invitation and password-set path, which is the same page as sign in.
//
// If it loaded the library the same unguarded way, an agent following an
// invite link would hit the identical failure: the script dies, the set
// password form submits natively, the page reloads, nothing is said, and the
// agent never activates. Tested with the library blocked, the same way login
// was, so this cannot be a second silent version of the same bug.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const srv = http.createServer((req,res)=>{
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if(!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200,{'Content-Type': f.endsWith('.js')?'application/javascript':'text/html'});
    res.end(fs.readFileSync(f));
  }).listen(8933);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let fail = 0;
  for (const libOk of [false, true]) {
    const p = await b.newPage({ viewport:{width:390,height:800} });
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    let navs=0; p.on('framenavigated',()=>navs++);
    if(libOk){
      await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript', body:`
        window.supabase={createClient:function(){return{auth:{
          getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}}),
          updateUser:async()=>({data:null,error:{message:'New password should be at least 10 characters'}}),
          onAuthStateChange:function(cb){ window.__cb=cb; return {data:{subscription:{unsubscribe(){}}}}; }}
          ,from:function(){return{select:function(){return{eq:function(){return{single:async()=>({data:{must_change_password:true,status:'active'},error:null})};}};}};}};}};`}));
    } else {
      await p.route('**/vendor/supabase-js-*.js', r=>r.abort());
    }
    // Arrive the way an invite link does.
    await p.goto('http://127.0.0.1:8933/index.html#type=recovery&access_token=x', { waitUntil:'load', timeout:30000 });
    await p.waitForTimeout(900);
    navs = 0;
    const hasPwForm = await p.evaluate(()=>!!document.getElementById('pw-form'));
    if(hasPwForm){
      await p.fill('#new-pw','shortpw123').catch(()=>{});
      await p.fill('#new-pw2','shortpw123').catch(()=>{});
      await p.click('#pw-btn').catch(()=>{});
      await p.waitForTimeout(1000);
    }
    const st = await p.evaluate(()=>({
      navs:0,
      errLogin:((document.getElementById('login-err')||{}).textContent||'').trim(),
      errPw:((document.getElementById('pw-err')||{}).textContent||'').trim(),
      shownLogin:((document.getElementById('login-err')||{}).style||{}).display,
      shownPw:((document.getElementById('pw-err')||{}).style||{}).display
    }));
    const said = (st.shownPw==='block' && st.errPw) || (st.shownLogin==='block' && st.errLogin);
    const ok = navs===0 && said;
    if(!ok) fail++;
    console.log((ok?'ok    ':'FAIL  ')+'library '+(libOk?'present':'BLOCKED'));
    console.log('        navigations on submit: '+navs);
    console.log('        message: '+JSON.stringify((st.errPw||st.errLogin).slice(0,90)));
    console.log('        page errors: '+errs.length+(errs[0]?(' | '+errs[0].slice(0,70)):''));
    await p.close();
  }
  await b.close(); srv.close();
  console.log(fail ? '\nFAIL' : '\nPASS');
  process.exit(fail?1:0);
})();
