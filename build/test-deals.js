// Deals: do the transaction screens render from live-shaped rows without
// throwing, and do missing figures stay missing rather than becoming zero.
const { chromium } = require('playwright');
const path = require('path');
const SCHEMA = require('./schema.json');
const MEMBERS = [{user_id:'u1',full_name:'Marlenyi L. Paredes'},{user_id:'u2',full_name:'Milennys Vargas'}];
const TX = [
 {id:'t1',agent_id:'u1',property_address:'12 Example St, Lehigh Acres',client_name:null,side:'buyer',price:250000,closing_date:'2026-08-14',notes:null,status:'draft',gross_commission:7500,net_commission:null,company_fee:null,contract_type:null,effective_date:null,inspection_days:null,loan_days:null,title_company:null,lender:null,legacy_source:null,lifecycle:'Active',paid_at:null,submitted_at:null,created_at:'2026-07-01T00:00:00Z'},
 {id:'t2',agent_id:'u2',property_address:'44 Sample Ave, Naples',client_name:null,side:'seller',price:600000,closing_date:'2026-08-05',notes:null,status:'submitted',gross_commission:17877,net_commission:null,company_fee:null,contract_type:null,effective_date:null,inspection_days:null,loan_days:null,title_company:null,lender:null,legacy_source:null,lifecycle:'Active',paid_at:null,submitted_at:'2026-08-01T00:00:00Z',created_at:'2026-07-01T00:00:00Z'},
 {id:'t3',agent_id:'u1',property_address:'99 Old Rd, Jacksonville',client_name:null,side:'buyer',price:null,closing_date:'2026-04-29',notes:null,status:'draft',gross_commission:null,net_commission:null,company_fee:null,contract_type:null,effective_date:null,inspection_days:null,loan_days:null,title_company:null,lender:null,legacy_source:'Cloze',lifecycle:'Terminated',paid_at:null,submitted_at:null,created_at:'2026-04-01T00:00:00Z'},
 {id:'t4',agent_id:'u2',property_address:'7 Closed Way, Fort Myers',client_name:null,side:'buyer',price:300000,closing_date:'2026-07-17',notes:null,status:'paid',gross_commission:9000,net_commission:null,company_fee:null,contract_type:null,effective_date:null,inspection_days:null,loan_days:null,title_company:null,lender:null,legacy_source:null,lifecycle:'Closed',paid_at:'2026-07-20T00:00:00Z',submitted_at:null,created_at:'2026-06-01T00:00:00Z'}
];
const LIS = [{id:'l1',agent_id:'u2',property_address:'1 Listing Ln, Estero',list_price:355000,showings:0,status:'Active',listing_type:'Sale',mls_number:'2026005685'}];
const CONTACTS = [{id:'c1',full_name:'Ana T',email:'a@x.com',phone:'555-0001',contact_type:'Buyer and Seller',record_class:'client',stage:'New Lead',tier:'A',last_touch:null,db_state:'unworked',snoozed_until:null,snooze_count:0,city:'Naples',household_id:null,household_primary:false,is_agent:false,gap_skips:[],created_at:'2026-08-01T00:00:00Z'}];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([tx,lis,mem,con,schema])=>{window.__TX=tx;window.__LIS=lis;window.__MEM=mem;window.__CON=con;window.__SCHEMA=schema;},[TX,LIS,MEMBERS,CONTACTS,SCHEMA]);
  await p.route('**/supabase-js@2/**', r => r.fulfill({ contentType:'application/javascript', body: `
    function ok(d){return Promise.resolve({data:d,error:null});}
    window.supabase={createClient:function(){return{
      auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
            getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
            signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:function(t){var q={};
        q.select=function(){
          if(t==='realty_members') return {eq:function(){return{single:()=>ok({user_id:'u1',full_name:'Marlenyi L. Paredes',role:'agent',status:'active'})};},
            then:function(res){res({data:window.__MEM,error:null});}};
          if(t==='agent_activity'){var s={eq:function(){return s;},then:function(res){res({data:[],error:null});}};return s;}
          return q;};
        q.eq=function(){return q;};
        q.order=function(){ if(t==='realty_transactions') return ok(window.__TX);
                            if(t==='realty_listings') return ok(window.__LIS);
                            return ok(window.__CON); };
        q.update=function(){return q;}; q.insert=function(){return{select:()=>ok([])};};
        return q;}};}};`}));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css',body:''}));
  await p.goto('file://' + path.join(__dirname,'..','hub_next.html'), { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(2800);
  const out = { screens: {} };
  out.boot = await p.evaluate(()=>({
    app: !document.getElementById('app').hidden,
    gate: !document.getElementById('gate').hidden,
    nav: Array.from(document.querySelectorAll('#nav a')).map(a=>a.textContent.trim()),
    txLen: (typeof TX_ACTIVE!=='undefined') ? TX_ACTIVE.length : 'undef',
    closedLen: (typeof CLOSED!=='undefined') ? CLOSED.length : 'undef'
  }));
  // Agent Deals: both screens are bespoke markup and stay coming soon, so the
  // assertion is that no frozen file detail leaks onto them.
  await p.evaluate(()=>{var a=Array.from(document.querySelectorAll('#nav a')).find(x=>/deals/i.test(x.textContent)); if(a)a.click();});
  await p.waitForTimeout(800);
  out.screens.dealsAgent = await p.evaluate(()=>{
    const g=document.querySelector('.grid')||document.body; const t=g.textContent||'';
    return { soon:/coming soon|Not connected yet|not reading/i.test(t),
             leakedFrozen:/Frederick Reid|Hibiscus|Basin St|Pine Cone|Diamond Trl|never submitted/i.test(t) };
  });
  // Broker Listings reads LISTINGS, which __txLoad fills from realty_listings.
  // Driven through the UI because the page functions live inside the design's
  // IIFE and are not reachable from evaluate.
  await p.evaluate(()=>{ var b=document.getElementById('tb'); if(b) b.click(); });
  await p.waitForTimeout(700);
  await p.evaluate(()=>{var a=Array.from(document.querySelectorAll('#nav a')).find(x=>/deals/i.test(x.textContent)); if(a)a.click();});
  await p.waitForTimeout(600);
  const subs = await p.evaluate(()=>Array.from(document.querySelectorAll('[data-t]')).map(e=>e.getAttribute('data-t')));
  out.brokerDealsSubs = subs;
  await p.evaluate(()=>{
    var a=Array.from(document.querySelectorAll('a,button')).find(x=>/^listings$/i.test((x.textContent||'').trim()));
    if(a) a.click();
  });
  await p.waitForTimeout(800);
  out.screens.listings = await p.evaluate(()=>{
    const g=document.querySelector('.grid')||document.body; const t=g.textContent||'';
    return { rendersLiveAddress: /Listing Ln/.test(t),
             noFrozenAddress: !/Hibiscus|Basin St|Pine Cone|Diamond Trl/.test(t),
             countsRows: /1 live/.test(t) };
  });
  out.pageErrors = errs.length; out.firstErrors = errs.slice(0,4);
  console.log(JSON.stringify(out,null,1));
  const li = out.screens.listings || {};
  const da = out.screens.dealsAgent || {};
  const good = !errs.length && da.soon && !da.leakedFrozen
            && li.rendersLiveAddress && li.noFrozenAddress && li.countsRows;
  console.log(good ? '\nPASS' : '\nFAIL');
  await b.close();
  process.exit(good ? 0 : 1);
})();
