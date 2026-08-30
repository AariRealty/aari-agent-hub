// Team, Roster, Announcements, Classes, Production, Costs: do they render live
// rows, and is the frozen 18 August content gone.
const { chromium } = require('playwright');
const path = require('path');
const MEM = [
  {user_id:'u1',full_name:'Zoe Example',role:'broker',status:'active',commission_plan:'100_max',fee_exempt:true,is_tc:false,last_login_at:'2026-08-28T00:00:00Z',license_status:'active'},
  {user_id:'u2',full_name:'Nils Sample',role:'agent',status:'active',commission_plan:'85_15',fee_exempt:false,is_tc:true,last_login_at:null,license_status:'active'},
  {user_id:'u3',full_name:'Ove Legacy',role:'agent',status:'active',commission_plan:'80_20',fee_exempt:false,is_tc:false,last_login_at:null,activated_at:null,start_date:null,must_change_password:true,license_status:'active'},
  {user_id:'u4',full_name:'Pia Entry',role:'agent',status:'active',commission_plan:'75_25',fee_exempt:false,is_tc:false,last_login_at:null,license_status:'active'}
];
const TX = [{id:'t1',agent_id:'u2',property_address:'7 Closed Way',side:'buyer',price:300000,closing_date:'2026-07-17',status:'paid',gross_commission:9000,net_commission:null,lifecycle:'Closed',paid_at:'2026-07-20T00:00:00Z',legacy_source:null,notes:null,client_name:null,company_fee:null,contract_type:null,effective_date:null,inspection_days:null,loan_days:null,title_company:null,lender:null,submitted_at:null,created_at:'2026-06-01T00:00:00Z'}];
const ANN = [{id:'a1',title:'Quarterly compliance reminder',urgency:'urgent',requires_ack:true,posted_at:'2026-08-20T00:00:00Z',recipient_ids:[],archived:false}];
const EXP = [{id:'e1',label:'Lockbox subscription',category:'Tools',amount:120,frequency:'monthly',vendor:'X',active:true,display_note:null},
             {id:'e2',label:'Annual E&O',category:'Insurance',amount:1200,frequency:'annual',vendor:'Y',active:true,display_note:null}];
const CATS = [{id:'c1',name:'Contracts',description:'',sort:1,archived:false}];
const ITEMS = [{id:'i1',category_id:'c1',title:'FR/BAR walkthrough',description:'',content_type:'video',required:true,sort:1,archived:false}];
const CONTACTS = [{id:'k1',full_name:'Ana T',email:null,phone:'555-1',contact_type:'Buyer',record_class:'client',stage:'New Lead',tier:'A',last_touch:null,db_state:'unworked',snoozed_until:null,snooze_count:0,city:'Naples',household_id:null,household_primary:false,is_agent:false,gap_skips:[],created_at:'2026-08-01T00:00:00Z'}];
const T = { realty_members:MEM, realty_transactions:TX, realty_announcements:ANN, realty_announcement_reads:[],
            realty_expenses:EXP, realty_training_categories:CATS, realty_training_items:ITEMS,
            realty_listings:[], agent_contacts:CONTACTS, agent_activity:[] };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + String(e.stack||'').split('\n').slice(0,4).join('\n')));
  await p.addInitScript(t => { window.__T = t; }, T);
  await p.route('**/supabase-js-*.js', r => r.fulfill({ contentType:'application/javascript', body: `
    function ok(d){return Promise.resolve({data:d,error:null});}
    window.supabase={createClient:function(){return{
      auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
            getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
            signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:function(t){
        var rows = window.__T[t] || [];
        var q={};
        q.select=function(){
          if(t==='realty_members') return { eq:function(){ return { single:()=>ok({user_id:'u1',full_name:'Zoe Example',role:'broker',status:'active'}) }; },
                                            order:()=>ok(rows), then:function(res){res({data:rows,error:null});} };
          q._t=true; return q; };
        q.eq=function(){return q;};
        q.order=function(){return ok(rows);};
        q.then=function(res){res({data:rows,error:null});};
        q.update=function(){return q;}; q.insert=function(){return{select:()=>ok([])};};
        return q;}};}};`}));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css',body:''}));
  await p.goto('file://' + path.join(__dirname,'..','hub_next.html'), { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(3000);
  await p.evaluate(()=>{ var b=document.getElementById('tb'); if(b) b.click(); });
  await p.waitForTimeout(700);
  const out = {};
  async function open(tab, sub){
    await p.evaluate(n=>{var a=Array.from(document.querySelectorAll('#nav a')).find(x=>new RegExp('^'+n+'$','i').test(x.textContent.trim())); if(a)a.click();}, tab);
    await p.waitForTimeout(450);
    await p.evaluate(n=>{var a=Array.from(document.querySelectorAll('a,button')).find(x=>new RegExp('^'+n+'$','i').test((x.textContent||'').trim())); if(a)a.click();}, sub);
    await p.waitForTimeout(650);
    return p.evaluate(()=>{ const g=document.querySelector('.grid')||document.body; return g.textContent||''; });
  }
  const frozen = /Milennys|Alied Machuca|Flavia Aguilera|Roosevelt|Eileen Hernandez|100% is here|CRSP contract walkthrough/;
  const checks = [
    ['People > Roster',       await open('People','Roster'),       /Zoe Example|Nils Sample/],
    ['People > Team',         await open('People','Team'),         /Zoe Example|Nils Sample/],
    ['Money > Production',    await open('Money','Production'),    /Nils Sample/],
    ['Money > Costs',         await open('Money','Costs'),         /Lockbox subscription/],
    ['Costs names the legacy plan', await open('Money','Costs'),    /1 member on a retired plan/],
    ['Roster labels legacy',        await open('People','Roster'),  /legacy/],
    ['Roster knows Mentorship',     await open('People','Roster'),  /Mentorship 75 \/ 25/],
    ['Roster flags never signed in', await open('People','Roster'),  /never signed in/],
    ['Roster flags missing start',   await open('People','Roster'),  /no start date/],
    ['Reach > Announcements', await open('Reach','Announcements'), /Quarterly compliance reminder/],
    ['Reach > Classes',       await open('Reach','Classes'),       /FR\/BAR walkthrough/]
  ];
  let fail=0;
  for (const [name, text, live] of checks){
    const hasLive = live.test(text), hasFrozen = frozen.test(text);
    const ok = hasLive && !hasFrozen;
    if(!ok) fail++;
    console.log((ok?'ok    ':'FAIL  ')+name+'   live:'+hasLive+'  frozen:'+hasFrozen);
  }
  console.log('page errors: '+errs.length);
  errs.slice(0,3).forEach(e=>console.log('  '+e.slice(0,140)));
  console.log(fail||errs.length ? '\nFAIL' : '\nPASS');
  await b.close();
  process.exit(fail||errs.length ? 1 : 0);
})();
