// The dashboard calendar card and the Today card both read CAL_EVENTS, which
// was a snapshot of the shared Google calendar taken by hand on 18 August.
// Anything the broker added afterwards did not appear, and the card looked
// exactly the same whether it was live or frozen. That is the failure this
// guards: it puts a class on the feed dated today and asserts it reaches both
// cards, and it asserts a stale hardcoded title is gone.
const {chromium}=require('playwright'); const path=require('path'); const fs=require('fs');
const ROOT=path.join(__dirname,'..');

// The snapshot's own entries. If any of these survive the load, the card is
// still drawing August rather than what is on the calendar now.
const STALE=['Real Talk LIVE Call','Commission Dispute Lawsuit'];

const T={realty_toolbox:[],realty_vendors:[],realty_agent_subscriptions:[],
 realty_agent_goals:[],realty_broker_goals:[],
 realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',commission_plan:'100_max',
   fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,
   must_change_password:false,license_status:'active'}],
 realty_transactions:[],realty_listings:[],realty_announcements:[],realty_announcement_reads:[],
 realty_expenses:[],realty_training_categories:[],realty_training_items:[],realty_training_completions:[],
 agent_contacts:[],agent_activity:[]};

(async()=>{
 const now=new Date();
 const iso=d=>d.toISOString().slice(0,10);
 const today=iso(now);
 // Same month, so it lands on a real cell in the month grid.
 const later=new Date(now.getFullYear(),now.getMonth(),Math.min(28,now.getDate()+2));
 const EVENTS=[
  {id:'g1',title:'Broker Roundtable',date:today,time:'14:00',all_day:false,location:null},
  {id:'g2',title:'Live Class: Condo Law Update · Attorney Martinez',date:iso(later),time:'11:00',all_day:false,location:'https://app.mn.co/x'},
  {id:'g3',title:'Long gone',date:iso(new Date(now.getFullYear(),now.getMonth()-2,4)),time:null,all_day:true,location:null}
 ];

 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1280,height:1000}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(x=>{window.__T=x.T;window.__EVENTS=x.E;},{T,E:EVENTS});
 await p.route('**/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',body:`
  function ok(d){return Promise.resolve({data:d,error:null});}
  window.supabase={createClient:function(){return{
   auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
     getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
     signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
   functions:{invoke:function(n){
     if(n==='realty-events') return ok({role:'agent',events:window.__EVENTS||[]});
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
 await p.waitForTimeout(4000);

 // An agent lands on Today, whose only sub entry is pageToday, so that screen
 // is their dashboard. AGENT(), and the dark todayCard() inside it, is only
 // reached when a sub entry is null, which happens for the broker and never
 // for an agent. Asserting against the screen an agent actually gets.
 const seen=await p.evaluate(()=>{
   const c=document.querySelector('#calcard');
   return {cal: c?c.innerText:'', body: document.body.innerText};
 });
 const cal=seen.cal;
 const onReach=await p.evaluate(()=>{
   const el=[...document.querySelectorAll('button,a,[role=tab],.tab')]
     .find(e=>e.textContent.trim()==='Reach');
   if(!el) return false; el.click(); return true;
 });
 if(onReach){ await p.waitForTimeout(700); }
 // Going to another tab and back repaints from CAL_EVENTS again. A load that
 // only worked because it happened to run before the first paint would show up
 // here as an empty card.
 await p.evaluate(()=>{
   const el=[...document.querySelectorAll('button,a,[role=tab],.tab')]
     .find(e=>e.textContent.trim()==='Today');
   if(el) el.click();
 });
 await p.waitForTimeout(700);
 seen.again=await p.evaluate(()=>{
   const c=document.querySelector('#calcard'); return c?c.innerText:'';
 });

 const checks=[
  ['a class added to the calendar reaches the calendar card', /Broker Roundtable/.test(seen.cal)],
  ['it survives leaving the tab and coming back', /Broker Roundtable/.test(seen.again)],
  ['the time is in the format the day rail parses back out', /2:00pm/.test(seen.cal)],
  ['a synced class keeps its own name, not the feed it came from', /Condo Law Update/.test(seen.cal)],
  ['nothing from the August snapshot is still on the page',
    !STALE.some(x=>new RegExp(x).test(seen.body))],
  ['no page errors', errs.length===0]
 ];
 // A month-old event must not land on a cell in the month now on screen.
 const collide = /Long gone/.test(cal);
 checks.push(['an event from another month does not land on this month’s grid', !collide]);

 // The Subscribe dialog. Two of its three actions pointed at a public ICS url
 // this calendar has not got and returned 404. What is left has to be one
 // working action per row, painted into a host that a builder edit above this
 // one briefly deleted, which no grep would have noticed.
 const sub = await p.evaluate(()=>{
   const btn = document.getElementById('calsub');
   if(!btn) return {open:false};
   btn.click();
   const rows = document.getElementById('subrows');
   const acts = rows ? [...rows.querySelectorAll('a,button')] : [];
   return {
     open: true,
     host: !!rows,
     rows: rows ? rows.querySelectorAll('.subrow').length : 0,
     labels: acts.map(a=>a.textContent.trim()),
     hrefs: acts.filter(a=>a.tagName==='A').map(a=>a.getAttribute('href')),
     text: document.getElementById('subdlg') ? document.getElementById('subdlg').innerText : ''
   };
 });
 checks.push(['the Subscribe dialog opens', sub.open === true]);
 checks.push(['its feed rows have somewhere to paint', sub.host === true && sub.rows > 0]);
 checks.push(['Add to Google is the only action left', 
   sub.labels.length > 0 && sub.labels.every(l => l === 'Add to Google')]);
 checks.push(['no link in it points at a public ICS feed',
   !sub.hrefs.some(h => /public\/basic\.ics/.test(String(h)))]);
 checks.push(['every link points at a calendar an agent has been given',
   sub.hrefs.length > 0 && sub.hrefs.every(h => /3a699f86/.test(String(h)))]);
 checks.push(['the dialog no longer tells anyone to tap a button that is gone',
   !/Copy link/.test(sub.text)]);

 let bad=0;
 for(const [n,okv] of checks){ console.log((okv?'ok   ':'FAIL ')+n); if(!okv) bad++; }
 if(errs.length) console.log('   ' + errs.slice(0,3).join(' | '));
 await b.close();
 console.log(bad?'\nFAIL':'\nPASS');
 process.exit(bad?1:0);
})();
