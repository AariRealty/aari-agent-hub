// The Listing description writer panel. What matters is not that a form draws.
// It is what leaves the page and what comes back.
//
//  - a blank field must be absent from the request, not sent as 0. The
//    function is told not to invent details, and a zero year built is a detail
//    it would have to use.
//  - numbers must arrive as numbers. The function calls toLocaleString on the
//    square footage, and a string has no such method.
//  - fewer than two standouts must never reach the network. The function
//    rejects it, and spending a round trip to be told so is worse than saying
//    it in the page.
//  - the remarks are inserted as text. A description carrying a < must not
//    become markup.
const {chromium}=require('playwright'); const path=require('path');
const ROOT=path.join(__dirname,'..');

const T={realty_toolbox:[{id:'t1',category:'Branding and marketing',category_sort:2,
  title:'Listing description writer',description:'MLS remarks.',emoji:'✏️',
  url:null,route:'listing',sort:0,active:true}],
 realty_vendors:[],realty_agent_subscriptions:[],realty_agent_goals:[],realty_broker_goals:[],
 realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',commission_plan:'100_max',
   fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,
   must_change_password:false,license_status:'active'}],
 realty_transactions:[],realty_listings:[],realty_announcements:[],realty_announcement_reads:[],
 realty_expenses:[],realty_training_categories:[],realty_training_items:[],
 realty_training_completions:[],agent_contacts:[],agent_activity:[]};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1280,height:1100}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(t=>{window.__T=t;window.__SENT=[];},T);
 await p.route('**/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',body:`
  function ok(d){return Promise.resolve({data:d,error:null});}
  window.supabase={createClient:function(){return{
   auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
     getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
     signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
   functions:{invoke:function(n,opts){
     window.__SENT.push({fn:n,body:opts&&opts.body});
     if(n==='generate-listing-description') return ok({ok:true,
       remarks:'Gulf access with no bridges. <script>alert(1)<\\/script> Roof replaced last year.',
       char_count:74});
     if(n==='realty-events') return ok({role:'agent',events:[]});
     return ok({});
   }},
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
   const b=document.querySelector('[data-tbroute="listing"]');
   if(!b) return false; b.click(); return true;
 });
 if(!opened){ console.log('FAIL  no routed Listing description writer tile'); await b.close(); process.exit(1); }
 await p.waitForTimeout(500);

 const checks=[];

 // One standout only. Nothing should leave the page.
 await p.evaluate(()=>{
   document.getElementById('lw-s1').value='Gulf access, no bridges';
   document.querySelector('[data-tbact="lw-go"]').click();
 });
 await p.waitForTimeout(400);
 const afterOne=await p.evaluate(()=>({sent:window.__SENT.filter(s=>s.fn==='generate-listing-description').length,
   msg:(document.getElementById('lw-msg')||{}).textContent||''}));
 checks.push(['one standout never reaches the network', afterOne.sent===0]);
 checks.push(['and the page says why', /two/i.test(afterOne.msg)]);

 // Two standouts, some basics filled and some deliberately left blank.
 await p.evaluate(()=>{
   document.getElementById('lw-s2').value='Roof and AC replaced last year';
   document.getElementById('lw-loc').value='Cape Coral';
   document.getElementById('lw-sqft').value='1,842';
   document.getElementById('lw-beds').value='3';
   document.querySelector('[data-tbact="lw-go"]').click();
 });
 await p.waitForTimeout(700);
 const sent=await p.evaluate(()=>window.__SENT.filter(s=>s.fn==='generate-listing-description').pop());
 const basics=(sent&&sent.body&&sent.body.basics)||{};
 checks.push(['a filled form does reach the function', !!sent]);
 checks.push(['only the standouts that were written are sent',
   Array.isArray(sent&&sent.body&&sent.body.standouts) && sent.body.standouts.length===2]);
 checks.push(['a blank field is absent, not zero',
   !('year_built' in basics) && !('list_price' in basics) && !('lot_size_acres' in basics)]);
 checks.push(['square footage arrives as a number, with the comma stripped',
   basics.living_area_sqft===1842 && typeof basics.living_area_sqft==='number']);
 checks.push(['bedrooms arrive as a number', basics.bedrooms===3]);
 checks.push(['the area is passed through', basics.address==='Cape Coral']);

 const out=await p.evaluate(()=>{
   const t=document.getElementById('lw-text');
   return {text:t?t.textContent:'', scripts:document.querySelectorAll('#lw-out script').length,
           html:(document.getElementById('lw-out')||{}).innerHTML||''};
 });
 checks.push(['the remarks are shown', /Gulf access/.test(out.text)]);
 checks.push(['a script tag in the remarks stays text and never becomes markup',
   out.scripts===0 && /&lt;script&gt;/.test(out.html)]);
 checks.push(['the character count is shown against the cap', /of 1200 characters/.test(out.html)]);
 checks.push(['no page errors', errs.length===0]);

 let bad=0;
 for(const [n,ok] of checks){ console.log((ok?'ok   ':'FAIL ')+n); if(!ok) bad++; }
 if(errs.length) console.log('   '+errs.slice(0,3).join(' | '));
 await b.close();
 console.log(bad?'\nFAIL':'\nPASS');
 process.exit(bad?1:0);
})();
