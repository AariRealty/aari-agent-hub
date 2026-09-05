// The Aari logos panel. What matters here is not that three cards draw, it is
// that pressing Download hands the agent a file with a name on it, and that
// no url in the page outlives the session.
//
// The bucket is private and readable only by an active member, so every link
// is signed at the moment it is needed. A regression that swapped that for a
// public url would still look right on screen, so this checks the call, not
// the picture.
const {chromium}=require('playwright'); const path=require('path');
const ROOT=path.join(__dirname,'..');

const ASSETS=[
 {id:'a1',title:'Logo, full size',description:'The logo on its own.',storage_path:'aari-realty-logo.png',
  file_name:'Aari-Realty-logo.png',mime:'image/png',bytes:84526,width:2023,height:856,background:'transparent',sort:0,active:true},
 {id:'a2',title:'Logo, small',description:'For an email signature.',storage_path:'aari-realty-logo-small.png',
  file_name:'Aari-Realty-logo-small.png',mime:'image/png',bytes:7639,width:208,height:88,background:'transparent',sort:1,active:true}
];

const T={realty_toolbox:[{id:'t1',category:'Branding and marketing',category_sort:2,title:'Aari logos',
   description:'Download the logo.',emoji:'🎨',url:null,route:'logos',sort:0,active:true}],
 realty_brand_assets:ASSETS,
 realty_vendors:[],realty_agent_subscriptions:[],realty_agent_goals:[],realty_broker_goals:[],
 realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',commission_plan:'100_max',
   fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,
   must_change_password:false,license_status:'active'}],
 realty_transactions:[],realty_listings:[],realty_announcements:[],realty_announcement_reads:[],
 realty_expenses:[],realty_training_categories:[],realty_training_items:[],
 realty_training_completions:[],agent_contacts:[],agent_activity:[]};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1280,height:1000},acceptDownloads:true});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(t=>{window.__T=t;window.__SIGNED=[];},T);
 await p.route('**/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',body:`
  function ok(d){return Promise.resolve({data:d,error:null});}
  window.supabase={createClient:function(){return{
   auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
     getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
     signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
   storage:{from:function(bucket){return{
     createSignedUrl:function(pth,secs,opts){
       window.__SIGNED.push({bucket:bucket,path:pth,secs:secs,opts:opts||null});
       return ok({signedUrl:'blob:signed/'+pth});
     }};}},
   functions:{invoke:function(n){ if(n==='realty-events') return ok({role:'agent',events:[]}); return ok({}); }},
   from:function(t){var rows=window.__T[t]||[];var q={};
    q.select=function(){ if(t==='realty_members') return {eq:function(){return{single:()=>ok({user_id:'u1',full_name:'Zoe',role:'agent',status:'active'})};},order:()=>ok(rows),then:function(r){r({data:rows,error:null});}};
      return q;};
    q.eq=function(){return q;}; q.gte=function(){return q;};
    q.order=function(){ q.order=function(){return ok(rows);}; return q; };
    q.maybeSingle=function(){return ok(rows[0]||null);};
    q.then=function(r){r({data:rows,error:null});};
    q.update=function(){return q;}; q.insert=function(){return{select:()=>ok([])};};
    return q;}};}};`}));
 await p.route('**/fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await p.goto('file://'+path.join(ROOT,'hub_next.html'),{waitUntil:'load',timeout:45000});
 await p.waitForTimeout(3500);

 await p.evaluate(()=>{
   const el=[...document.querySelectorAll('button,a,[role=tab],.tab')]
     .find(e=>e.textContent.trim()==='Toolbox');
   if(el) el.click();
 });
 await p.waitForTimeout(700);
 const opened=await p.evaluate(()=>{
   const b=document.querySelector('[data-tbroute="logos"]');
   if(!b) return false; b.click(); return true;
 });
 if(!opened){ console.log('FAIL  no routed Aari logos tile'); await b.close(); process.exit(1); }
 await p.waitForTimeout(900);

 const seen=await p.evaluate(()=>({
   cards: document.querySelectorAll('.lgcard').length,
   text: document.querySelector('.tbwide').innerText,
   signed: window.__SIGNED.slice()
 }));

 const checks=[];
 checks.push(['every logo on the manifest gets a card', seen.cards===ASSETS.length]);
 checks.push(['each one says its size and its weight', /2023 × 856/.test(seen.text) && /83 KB|84 KB|85 KB/.test(seen.text)]);
 checks.push(['the panel says there is no white version and no vector',
   /no white version/i.test(seen.text) && /vector/i.test(seen.text)]);
 checks.push(['the brokerage name rule is on the page', /brokerage name/i.test(seen.text)]);
 // Previews are signed too, and from the private bucket.
 checks.push(['previews are signed rather than linked',
   seen.signed.length>=ASSETS.length && seen.signed.every(s=>s.bucket==='realty-brand')]);

 await p.evaluate(()=>{ window.__SIGNED.length=0; });
 await p.evaluate(()=>{
   document.querySelector('[data-tbact="lg-get"]').click();
 });
 await p.waitForTimeout(600);
 const dl=await p.evaluate(()=>({signed:window.__SIGNED.slice(),
   msg:(document.querySelector('.lgmsg')||{}).textContent||''}));
 const first=dl.signed[0]||{};
 checks.push(['Download signs a fresh url', dl.signed.length===1]);
 checks.push(['from the private brand bucket', first.bucket==='realty-brand']);
 checks.push(['for the right file', first.path==='aari-realty-logo.png']);
 checks.push(['the link is short lived', typeof first.secs==='number' && first.secs>0 && first.secs<=600]);
 // Without this the browser saves the storage key, or a file called blob.
 checks.push(['and carries the filename the agent should end up with',
   !!(first.opts && first.opts.download==='Aari-Realty-logo.png')]);
 checks.push(['no page errors', errs.length===0]);

 let bad=0;
 for(const [n,ok] of checks){ console.log((ok?'ok   ':'FAIL ')+n); if(!ok) bad++; }
 if(errs.length) console.log('   '+errs.slice(0,3).join(' | '));
 await b.close();
 console.log(bad?'\nFAIL':'\nPASS');
 process.exit(bad?1:0);
})();
