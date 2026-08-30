// Sign in on index.html, the page agents actually log in through.
//
// The bug this exists to prevent: the script began with
// window.supabase.createClient(), so a CDN that did not load threw on the
// first statement, killed the whole script, and left the login form as a bare
// <form> with a submit button. Tapping Sign in did a native submit. The page
// reloaded, both fields cleared, no error appeared, and nothing ever reached
// Supabase. Reported as "sign-in is broken", indistinguishable from a wrong
// password, and invisible in auth.audit_log_entries.
//
// Three paths, all of which must never navigate and must always say something:
//   blocked         the library never arrives
//   wrong-password  Supabase answers with an error
//   magic-link      the reset path still works
//
const {chromium}=require('playwright');
(async()=>{
 const INDEX = require('path').join(__dirname, '..', 'index.html');
 let fail=0;
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for (const mode of ['blocked','wrong-password','magic-link']) {
   const cdnWorks = mode !== 'blocked';
   const p=await b.newPage({viewport:{width:390,height:800}});
   const errs=[]; p.on('pageerror',e=>errs.push(e.message));
   let navigations=0; p.on('framenavigated',()=>navigations++);
   if(cdnWorks){
     const magic = mode==='magic-link';
     await p.route('**/supabase-js@2/**',r=>r.fulfill({contentType:'application/javascript',body:`
       window.__RESET_CALLED=null;
       window.supabase={createClient:function(){return{auth:{
         getSession:async()=>({data:{session:${magic?"{user:{id:'u1'},access_token:'t'}":'null'}}}),
         signInWithPassword:async()=>({data:null,error:{message:'Invalid login credentials'}}),
         resetPasswordForEmail:async(e)=>{window.__RESET_CALLED=e;return{error:null};},
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}
         ,from:function(){return{select:function(){return{eq:function(){return{single:async()=>({data:{must_change_password:false,status:'active'},error:null})};}};}};}};}};`}));
   } else {
     await p.route('**/supabase-js@2/**',r=>r.abort());   // CDN unreachable
   }
   await p.goto('file://'+INDEX,{waitUntil:'load',timeout:30000});
   await p.waitForTimeout(800);
   const before=await p.evaluate(()=>{
     var has=false; try{ has = (typeof window.$ !== 'undefined') || (eval('typeof $') !== 'undefined'); }catch(e){ has=false; }
     return { hasDollar: has };
   });
   navigations=0;
   await p.fill('#email','marlenyi@aarirealty.com').catch(()=>{});
   await p.fill('#password','secret123').catch(()=>{});
   await p.click('#login-btn').catch(()=>{});
   await p.waitForTimeout(1200);
   const after=await p.evaluate(()=>({
     email:(document.getElementById('email')||{}).value,
     password:(document.getElementById('password')||{}).value,
     errText:((document.getElementById('login-err')||{}).textContent||'').trim(),
     errShown:((document.getElementById('login-err')||{}).style||{}).display
   }));
   console.log('--- '+mode+' ---');
   console.log('  script ran (has $):', before.hasDollar);
   console.log('  navigations on submit:', navigations, navigations?'<= page reloaded':'');
   console.log('  email after submit:', JSON.stringify(after.email));
   console.log('  password after submit:', JSON.stringify(after.password));
   console.log('  error shown:', JSON.stringify(after.errText), 'display='+after.errShown);
   console.log('  page errors:', errs.length, errs[0]?('| '+errs[0].slice(0,90)):'');
   if(mode==='magic-link'){
     const reset=await p.evaluate(async()=>{
       document.getElementById('forgot-link').click();
       await new Promise(r=>setTimeout(r,200));
       document.getElementById('forgot-email').value='marlenyi@aarirealty.com';
       document.getElementById('forgot-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
       await new Promise(r=>setTimeout(r,400));
       return { called: window.__RESET_CALLED,
                ok: ((document.getElementById('forgot-ok')||{}).style||{}).display };
     });
     console.log('  reset link requested for:', JSON.stringify(reset.called), 'confirmation shown:', reset.ok);
   }
   const guarded = navigations===0 && after.errShown==='block' && after.email!=='';
   const pwCleared = mode==='blocked' ? true : after.password==='';
   if(!(guarded && pwCleared)){ fail++; console.log('  FAIL'); } else { console.log('  ok'); }
   await p.close();
 }
 await b.close();
 console.log(fail ? '\nFAIL' : '\nPASS');
 process.exit(fail ? 1 : 0);
})();
