// The Toolbox renders from realty_toolbox. Two things matter beyond "it drew
// something": a tile with no url must not become a link, and an unsafe url
// must never reach an href. The table has a CHECK for the url shape, but a row
// written before that constraint existed would still be rendered, so the page
// gates it again.
const {chromium}=require('playwright'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const TILES=[
 {id:'t1',category:'Transactions',category_sort:0,title:'SkySlope Suite',description:'Start every transaction here.',emoji:'\u{1F5C2}️',url:null,sort:0,active:true},
 {id:'t2',category:'Transactions',category_sort:0,title:'Send a file to Aari Transactions',description:'Hand a closing to a coordinator.',emoji:'\u{1F4EC}',url:'https://www.aaritransactions.com',sort:1,active:true},
 {id:'t3',category:'Learning and training',category_sort:4,title:'Week 0, Your Business',description:'Six items.',emoji:'\u{1F393}',url:null,sort:0,active:true},
 {id:'t4',category:'Learning and training',category_sort:4,title:'Hostile',description:'Should never be a link.',emoji:'⚠️',url:'javascript:alert(1)',sort:1,active:true},
 // Routed tiles, so the panel checks below actually run. Without these the
 // loop finds nothing to click and passes without testing anything.
 {id:'t5',category:'Branding and marketing',category_sort:2,title:'Vendors',description:'Directory.',emoji:'\u{1F4C7}',url:null,route:'vendors',sort:0,active:true},
 {id:'t6',category:'Branding and marketing',category_sort:2,title:'Your fees and E&O',description:'What you pay.',emoji:'\u{1F6DF}',url:null,route:'subscription',sort:1,active:true},
 {id:'t7',category:'Branding and marketing',category_sort:2,title:'Add me to the roster',description:'Email your MLS.',emoji:'\u{1F4C7}',url:null,route:'roster',sort:2,active:true},
 {id:'t8',category:'Learning and training',category_sort:4,title:'Training calendar',description:'Classes you can attend.',emoji:'\u{1F4C5}',url:null,route:'calendar',sort:2,active:true},
 {id:'t9',category:'Branding and marketing',category_sort:2,title:'Listing description writer',description:'MLS remarks.',emoji:'\u270F️',url:null,route:'listing',sort:3,active:true},
 {id:'t10',category:'Branding and marketing',category_sort:2,title:'Aari logos',description:'Download the logo.',emoji:'\u{1F3A8}',url:null,route:'logos',sort:4,active:true}
];
const T={realty_toolbox:TILES,
 realty_vendors:[{id:'v1',name:'Sandbar Title',type:'Title Company',phone:'2395551234',email:'ops@sandbar.example',website:null,notes:null,active:true}],
 realty_agent_subscriptions:[{plan_label:'80/20',fee_amount:'99.00',frequency:'quarterly',next_due_date:'2026-08-19',last_paid_date:null,status:'active',billing_source:'SkySlope Books',notes:null}],
 realty_agent_goals:[],realty_broker_goals:[],
 realty_brand_assets:[{id:'b1',title:'Logo, full size',description:'The logo on its own.',storage_path:'aari-realty-logo.png',file_name:'Aari-Realty-logo.png',mime:'image/png',bytes:84526,width:2023,height:856,background:'transparent',sort:0,active:true}],
 realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',commission_plan:'100_max',
   fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,must_change_password:false,license_status:'active'}],
 realty_transactions:[],realty_listings:[],realty_announcements:[],realty_announcement_reads:[],
 realty_expenses:[],realty_training_categories:[],realty_training_items:[],realty_training_completions:[],
 agent_contacts:[],agent_activity:[]};

// The renderer read t.route while the query never asked for it, so every
// routed tile arrived undefined and rendered as "coming soon". The fixture
// supplies route directly, so no amount of DOM assertion could catch it.
// This reads the built file and checks the select covers what is read.
{
  const fs = require('fs');
  const built = fs.readFileSync(path.join(__dirname,'..','hub_next.html'),'utf8');
  const m = built.match(/from\('realty_toolbox'\)[\s\S]{0,600}?\.select\('([^']+)'\)/);
  if(!m){ console.log('FAIL  could not find the realty_toolbox select in the built Hub'); process.exit(1); }
  const asked = m[1].split(',').map(s=>s.trim());
  const needed = ['id','category','category_sort','title','description','emoji','url','route','sort','active'];
  const missing = needed.filter(c => !asked.includes(c));
  if(missing.length){
    console.log('FAIL  the toolbox query does not ask for: ' + missing.join(', '));
    console.log('      it selects: ' + asked.join(', '));
    process.exit(1);
  }
  console.log('ok   the toolbox query asks for every column the tiles read');
}

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1100,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 const d=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 const EVENTS=[{id:'e1',title:'Live Class: Condo Law Update \u00B7 Attorney Martinez',date:d(3),time:'11:00',all_day:false,location:'https://app.mn.co/8/spaces/1/posts/2'},
  {id:'e2',title:'Legal Roundtable',date:d(20),time:null,all_day:true,location:null},
  {id:'e3',title:'Already been and gone',date:d(-9),time:'09:00',all_day:false,location:null}];
 await p.addInitScript(t=>{window.__T=t.T;window.__EVENTS=t.E;},{T,E:EVENTS});
 await p.route('**/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',body:`
  function ok(d){return Promise.resolve({data:d,error:null});}
  window.supabase={createClient:function(){return{
   auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
     getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
     signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
   functions:{invoke:function(name){
     // The calendar panel reads the shared Google calendar through the
     // realty-events function. A mock with only from() would have let the
     // panel throw inside the tab render and shown nothing at all.
     if(name==='realty-events') return ok({role:'agent',events:window.__EVENTS||[]});
     return ok({});
   }},
   storage:{from:function(){return{createSignedUrl:function(pth){return ok({signedUrl:'blob:signed/'+pth});}};}},
   from:function(t){var rows=window.__T[t]||[];var q={};
    q.select=function(){ if(t==='realty_members') return {eq:function(){return{single:()=>ok({user_id:'u1',full_name:'Zoe',role:'agent',status:'active'})};},order:()=>ok(rows),then:function(r){r({data:rows,error:null});}};
      return q;};
    q.eq=function(){return q;};
    q.order=function(){ q.order=function(){return ok(rows);}; return q; };
    q.maybeSingle=function(){return ok(rows[0]||null);};
    q.then=function(r){r({data:rows,error:null});};
    q.update=function(){return q;}; q.insert=function(){return{select:()=>ok([])};};
    return q;}};}};`}));
 await p.route('**/fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await p.goto('file://'+path.join(ROOT,'hub_next.html'),{waitUntil:'load',timeout:45000});
 await p.waitForTimeout(3500);
 // Drive the UI rather than calling pageToolbox directly: the layers are
 // spliced inside the design IIFE, so the page functions are not on window,
 // and clicking the tab proves the wiring as well as the rendering.
 const clicked = await p.evaluate(()=>{
   const el=[...document.querySelectorAll('button,a,[role=tab],.tab')]
     .find(e=>e.textContent.trim()==='Toolbox');
   if(!el) return false; el.click(); return true;
 });
 if(!clicked){ console.log('FAIL  no Toolbox tab in the agent nav'); await b.close(); process.exit(1); }
 await p.waitForTimeout(900);
 // Route panels: each opens, shows a back control, and carries no undecoded
 // entity. The grid check above never reaches them, and the first version of
 // the panels rendered "E&amp;O" as literal text in a heading.
 const panels = {ok:true, seen:[]};
 for(const rr of ['vendors','subscription','roster','calendar','listing','logos']){
   const has = await p.evaluate(x=>!!document.querySelector('[data-tbroute="'+x+'"]'), rr);
   if(!has) continue;
   await p.evaluate(x=>document.querySelector('[data-tbroute="'+x+'"]').click(), rr);
   await p.waitForTimeout(400);
   const got = await p.evaluate(()=>{
     const c=document.querySelector('.tbwide');
     const rx=/&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\\d{1,5});/;
     return {back:!!document.querySelector('[data-tbroute=\"\"]'),
             dirty: c ? rx.test(c.innerText) : true};
   });
   panels.seen.push(rr + (got.back?'':' NO-BACK') + (got.dirty?' ENTITY':''));
   if(!got.back || got.dirty) panels.ok = false;
   if(rr === 'calendar'){
     // The panel used to read realty_events, a table with no rows, so it
     // rendered "nothing is scheduled" no matter what the brokerage had on.
     // These assert it shows a real class and hides one that has passed.
     const t = await p.evaluate(()=>document.querySelector('.tbwide').innerText);
     if(!/Condo Law Update/.test(t)){ console.log('FAIL  the calendar panel did not show an upcoming class'); panels.ok=false; }
     else console.log('ok   the calendar panel shows a class from the shared calendar');
     if(/Already been and gone/.test(t)){ console.log('FAIL  the calendar panel showed an event that has passed'); panels.ok=false; }
     else console.log('ok   the calendar panel drops events that have passed');
     if(/realty_events/.test(t)){ console.log('FAIL  the calendar panel still names the empty table'); panels.ok=false; }
   }
   await p.evaluate(()=>{const b=document.querySelector('[data-tbroute=""]'); if(b) b.click();});
   await p.waitForTimeout(300);
 }

 const r = await p.evaluate(()=>{
   const cards=[...document.querySelectorAll('.tbcard')];
   return {
     tiles: cards.length,
     groups: document.querySelectorAll('.tbgrp').length,
     links: cards.filter(c=>c.tagName==='A').map(c=>c.getAttribute('href')),
     inert: cards.filter(c=>c.tagName==='SPAN').length,
     routed: cards.filter(c=>c.tagName==='BUTTON').length,
     soon:  document.querySelectorAll('.tbsoon').length,
     text:  document.body.textContent,
     // Visible text only. body.textContent swallows inline <script> source,
     // where '&middot;' legitimately appears inside string literals, so an
     // entity check against it fails on code that is not rendered at all.
     visible: (function(){
       const rx=/&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,5}|#x[0-9a-fA-F]{1,5});/;
       const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{
         acceptNode(n){ const t=n.parentElement&&n.parentElement.tagName;
           if(t==='SCRIPT'||t==='STYLE'||t==='TEXTAREA') return NodeFilter.FILTER_REJECT;
           return rx.test(n.nodeValue||'')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP; }});
       const bad=[]; let n; while((n=w.nextNode())&&bad.length<4) bad.push(n.nodeValue.trim().slice(0,90));
       return bad;
     })()
   };
 });
 r.panels = panels;
 if(r.err){ console.log('FAIL', r.err); await b.close(); process.exit(1); }
 const checks=[
  ['renders every tile', r.tiles===10],
  ['groups by category', r.groups===3],
  ['only the safe url is a link', r.links.length===1 && r.links[0]==='https://www.aaritransactions.com'],
  ['javascript: url never reaches href', !r.links.some(h=>/javascript:/i.test(h))],
  ['tiles without a link or route are inert', r.inert===3],
  ['each inert tile says coming soon', r.soon===3],
  ['routed tiles render as buttons', r.routed===6],
  ['counts wired vs total honestly', /1 of 10 have a link/.test(r.text)],
  ['no page errors', errs.length===0],
  // The footnote under the tabs is written with textContent, and the builder's
  // money redaction used to put '&middot;' there, which printed literally.
  // test-goal checks the cover; this checks the Toolbox tab.
  ['no undecoded entities on this tab', r.visible.length===0],
  ['every route panel opens, goes back, and is entity clean', r.panels.ok]
 ];
 checks.forEach(([n,ok])=>console.log((ok?'ok   ':'FAIL ')+n));
 const pass=checks.every(c=>c[1]);
 if(errs.length) console.log('  '+errs[0]);
 if(r.visible.length) r.visible.forEach(v=>console.log('  entity: '+v));
 if(panels.seen.length) console.log('  panels: '+panels.seen.join(', '));
 console.log(pass?'\nPASS':'\nFAIL');
 await b.close(); process.exit(pass?0:1);
})();
