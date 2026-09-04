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
 {id:'t4',category:'Learning and training',category_sort:4,title:'Hostile',description:'Should never be a link.',emoji:'⚠️',url:'javascript:alert(1)',sort:1,active:true}
];
const T={realty_toolbox:TILES,
 realty_agent_goals:[],realty_broker_goals:[],
 realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',commission_plan:'100_max',
   fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,must_change_password:false,license_status:'active'}],
 realty_transactions:[],realty_listings:[],realty_announcements:[],realty_announcement_reads:[],
 realty_expenses:[],realty_training_categories:[],realty_training_items:[],realty_training_completions:[],
 agent_contacts:[],agent_activity:[]};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1100,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(t=>{window.__T=t;},T);
 await p.route('**/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',body:`
  function ok(d){return Promise.resolve({data:d,error:null});}
  window.supabase={createClient:function(){return{
   auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
     getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
     signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
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
 const r = await p.evaluate(()=>{
   const cards=[...document.querySelectorAll('.tbcard')];
   return {
     tiles: cards.length,
     groups: document.querySelectorAll('.tbgrp').length,
     links: cards.filter(c=>c.tagName==='A').map(c=>c.getAttribute('href')),
     inert: cards.filter(c=>c.tagName!=='A').length,
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
 if(r.err){ console.log('FAIL', r.err); await b.close(); process.exit(1); }
 const checks=[
  ['renders every tile', r.tiles===4],
  ['groups by category', r.groups===2],
  ['only the safe url is a link', r.links.length===1 && r.links[0]==='https://www.aaritransactions.com'],
  ['javascript: url never reaches href', !r.links.some(h=>/javascript:/i.test(h))],
  ['tiles without a link are inert', r.inert===3],
  ['each inert tile says coming soon', r.soon===3],
  ['counts wired vs total honestly', /1 of 4 have a link/.test(r.text)],
  ['no page errors', errs.length===0],
  // The footnote under the tabs is written with textContent, and the builder's
  // money redaction used to put '&middot;' there, which printed literally.
  // test-goal checks the cover; this checks the Toolbox tab.
  ['no undecoded entities on this tab', r.visible.length===0]
 ];
 checks.forEach(([n,ok])=>console.log((ok?'ok   ':'FAIL ')+n));
 const pass=checks.every(c=>c[1]);
 if(errs.length) console.log('  '+errs[0]);
 if(r.visible.length) r.visible.forEach(v=>console.log('  entity: '+v));
 console.log(pass?'\nPASS':'\nFAIL');
 await b.close(); process.exit(pass?0:1);
})();
