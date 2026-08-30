// The cover: it reads the income goal from realty_agent_goals, and it is
// painted by mCover() rather than render(), so loading the goal without
// repainting left it asserting "no income goal saved in realty_agent_goals
// yet" while the row existed. Also checks the date is the real one: the
// calendar used to be pinned to August 2026 and fell back to the 18th
// outside it.
const {chromium}=require('playwright');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const T = (function(){
  const y = new Date().getFullYear();
  return {
    realty_agent_goals:[{period_year:y,income_target:150000,avg_price:350000,commission_pct:2.5,
      split_pct:100,working_weeks:48,prospecting_days:5,pop_by_day:4,pop_by_ratio:0.2,handwritten_notes_target:3}],
    realty_broker_goals:[],
    realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',commission_plan:'100_max',
      fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,
      must_change_password:false,license_status:'active'}],
    realty_transactions:[], realty_listings:[], realty_announcements:[], realty_announcement_reads:[],
    realty_expenses:[], realty_training_categories:[], realty_training_items:[],
    agent_contacts:[], agent_activity:[]
  };
})();
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:390,height:800}});
 const logs=[]; p.on('console',m=>logs.push(m.type()+': '+m.text().slice(0,140)));
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
         return q; };
       q.eq=function(){return q;}; q.order=function(){return ok(rows);};
       q.maybeSingle=function(){ return ok(rows[0]||null); };
       q.then=function(r){r({data:rows,error:null});};
       q.update=function(){return q;}; q.insert=function(){return{select:()=>ok([])};};
       return q;}};}};`}));
 await p.route('**/fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await p.goto('file://'+path.join(ROOT,'hub_next.html'),{waitUntil:'load',timeout:45000});
 await p.waitForTimeout(3500);
 const st=await p.evaluate(()=>({
   coverHidden:(document.getElementById('mcover')||{}).hidden,
   num:(document.getElementById('mcnum')||{}).textContent,
   unit:(document.getElementById('mcunit')||{}).textContent
 }));
 console.log(JSON.stringify(st,null,1));
 console.log('console:'); logs.filter(l=>/goal|error/i.test(l)).slice(0,6).forEach(l=>console.log('  '+l));
 console.log('errors:',errs.length, errs[0]||'');
 const day = await p.evaluate(()=>(document.getElementById('mcday')||{}).textContent||'');
 const now = new Date();
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const expect = now.getDate()+' '+months[now.getMonth()];
 console.log('cover date:', JSON.stringify(day), 'expected to contain:', JSON.stringify(expect));
 const ok = errs.length===0
   && /150,000/.test(st.unit||'')
   && !/no income goal saved/.test(st.unit||'')
   && (day||'').indexOf(expect) >= 0;
 console.log(ok ? '\nPASS' : '\nFAIL');
 await b.close();
 process.exit(ok?0:1);
})();
