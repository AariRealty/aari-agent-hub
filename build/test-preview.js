// The preview delivery path: index.html document.write()ing the new build.
//
// Reported 30 August: hub.joinaari.com/?preview=next rendered a completely
// blank page. The route was fine, realty-hub logged realty_hub_preview and
// returned the build. The write itself threw:
//
//   Failed to execute 'write' on 'Document':
//   Identifier 'SB_URL' has already been declared
//
// index.html declares SB_URL, SB_KEY and sb as const at global scope.
// document.open() does not reset the global lexical environment, so the new
// build's own const declarations were a redeclaration. The write aborted,
// nothing was written, and nothing could report it: the failure happened
// during the write, before any script in the build could run. That is also
// why the watchdog never fired.
//
// realty-hub's dedupeGlobals exists to prevent exactly this, and the preview
// route returns before it on purpose. So the build must not collide at all.
const {chromium}=require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
(async()=>{
 const root=require('path').join(__dirname,'..');
 const NEXT=fs.readFileSync(path.join(root,'hub_next.html'),'utf8');
 const srv=http.createServer((req,res)=>{
   const f=path.join(root, decodeURIComponent(req.url.split('?')[0]));
   if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
   res.writeHead(200,{'Content-Type': f.endsWith('.js')?'application/javascript':'text/html'});
   res.end(fs.readFileSync(f));
 }).listen(8936);
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:390,height:800}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.route('**/cdn.jsdelivr.net/**', r=>r.abort());
 await p.route('**/fonts.googleapis.com/**', r=>r.fulfill({contentType:'text/css',body:''}));
 // index.html's own client: session valid, member active.
 await p.route('**/vendor/supabase-js-*.js', async route=>{
   const real = fs.readFileSync(path.join(root,'vendor','supabase-js-2.112.4.min.js'),'utf8');
   route.fulfill({contentType:'application/javascript', body:
     'window.__realSupabaseSrc=1;\n' +
     'window.supabase={createClient:function(){return{auth:{'+
     'getSession:async()=>({data:{session:{user:{id:"u1"},access_token:"t"}}}),'+
     'getUser:async()=>({data:{user:{id:"u1"}}}),'+
     'signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},'+
     'from:function(t){var q={};q.select=function(){return {eq:function(){return{single:async()=>'+
     '({data:{must_change_password:false,status:"active",full_name:"M",role:"broker"},error:null})};},'+
     'order:async()=>({data:[],error:null}),then:function(r){r({data:[],error:null});}};};'+
     'q.eq=function(){return q;};q.order=async function(){return{data:[],error:null};};'+
     'q.then=function(r){r({data:[],error:null});};return q;}};}};'});
 });
 // realty-hub returns the real new build, exactly as the preview route does.
 let sawPreviewParam = null;
 await p.route('**/functions/v1/realty-hub**', route=>{
   if(route.request().method()!=='GET') return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   sawPreviewParam = /preview=next/.test(route.request().url());
   route.fulfill({status:200, contentType:'text/plain', body: NEXT});
 });
 await p.goto('http://127.0.0.1:8936/index.html',{waitUntil:'load',timeout:45000});
 await p.waitForTimeout(5000);
 const st=await p.evaluate(()=>({
   bodyChars: document.body ? document.body.textContent.trim().length : -1,
   hasGate: !!document.getElementById('gate'),
   gateHidden: (document.getElementById('gate')||{}).hidden,
   hasApp: !!document.getElementById('app'),
   appHidden: (document.getElementById('app')||{}).hidden,
   appChars: (document.getElementById('app')||{textContent:''}).textContent.trim().length,
   htmlLen: document.documentElement.outerHTML.length,
   scriptTags: Array.from(document.querySelectorAll('script[src]')).map(s=>s.getAttribute('src')).slice(0,4)
 }));
 console.log(JSON.stringify(st,null,1));
 console.log('page errors:', errs.length);
 errs.slice(0,5).forEach(e=>console.log('   '+e.slice(0,150)));
 console.log('bare domain asked for the new build:', sawPreviewParam);
 const ok = errs.length===0 && st.gateHidden===true && st.appHidden===false && st.appChars>100000
            && sawPreviewParam===true;
 console.log(ok ? '\nPASS' : '\nFAIL');
 await b.close(); srv.close();
 process.exit(ok?0:1);
})();
