// Today: does the board show real people, and does the log button write.
// Same schema-enforcing stub as test-writes.js, so a bad column still fails.
const { chromium } = require('playwright');
const path = require('path');
const SCHEMA = require('./schema.json');
const ROWS = [
  { id:'u-ana', full_name:'Ana Tester', email:'a@x.com', phone:'239-555-0001', contact_type:'Buyer and Seller', record_class:'client', stage:'New Lead', tier:'A', last_touch:null, notes:null, db_state:'unworked', snoozed_until:null, snooze_count:0, city:'Lehigh Acres', household_id:null, household_primary:false, is_agent:false, qualified:false, gap_skips:[], created_at:'2026-08-01T00:00:00Z' },
  { id:'u-bob', full_name:'Bob Tester', email:null, phone:'239-555-0002', contact_type:'Buyer', record_class:'client', stage:'New Lead', tier:'A', last_touch:'2026-05-01', notes:null, db_state:'active', snoozed_until:null, snooze_count:0, city:'Fort Myers', household_id:null, household_primary:false, is_agent:false, qualified:false, gap_skips:[], created_at:'2026-08-01T00:00:00Z' },
  { id:'u-cara', full_name:'Cara Tester', email:'c@x.com', phone:'239-555-0004', contact_type:'Seller', record_class:'client', stage:'Contacted', tier:'B', last_touch:'2026-07-01', notes:null, db_state:'active', snoozed_until:null, snooze_count:0, city:'Naples', household_id:null, household_primary:false, is_agent:false, qualified:false, gap_skips:[], created_at:'2026-06-04T00:00:00Z' }
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(([rows, schema]) => { window.__ROWS = rows; window.__SCHEMA = schema; }, [ROWS, SCHEMA]);
  await page.route('**/supabase-js-*.js', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__CALLS = [];
    function check(t,o){var c=window.__SCHEMA[t]; if(!c) return {message:'no relation '+t};
      for(var k in o) if(c.indexOf(k)<0) return {message:'column "'+k+'" of relation "'+t+'" does not exist'}; return null;}
    window.supabase={createClient:function(){return{
      auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{id:'u1'}}}),
            signOut:async()=>({}),onAuthStateChange:()=>{}},
      from:function(t){var q={_eq:{}};
        q.select=function(){ if(t==='realty_members') return {eq:function(){return{single:async()=>({data:{user_id:'u1',full_name:'M',role:'broker',status:'active'},error:null})}}};
          if(t==='agent_activity'){ var self={eq:function(){return self;},then:function(res){res({data:[],error:null});}}; return self; }
          if(q._pending) return Promise.resolve(q._pending); return q; };
        q.eq=function(){return q;};
        q.order=async function(){return{data:JSON.parse(JSON.stringify(window.__ROWS)),error:null};};
        q.update=function(p){var b=check(t,p);window.__CALLS.push({table:t,op:'update',keys:Object.keys(p),error:b});q._pending=b?{data:null,error:b}:{data:[],error:null};return q;};
        q.insert=function(r){var b=check(t,r);window.__CALLS.push({table:t,op:'insert',keys:Object.keys(r),error:b});var res=b?{data:null,error:b}:{data:[r],error:null};return{select:async()=>res};};
        return q;}};}};
  `}));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.join(__dirname, '..', 'hub_next.html'), { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2400);

  const board = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('#nav a')).find(x => /today/i.test(x.textContent));
    if (a) a.click();
    return null;
  });
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => {
    const b = document.getElementById('tdboard');
    const t = b ? b.textContent : '';
    return {
      boardPresent: !!b,
      names: ['Ana Tester', 'Bob Tester', 'Cara Tester'].filter(n => t.indexOf(n) >= 0),
      logButtons: document.querySelectorAll('[data-log]').length,
      otherCards: document.querySelectorAll('.grid > .card, #deck > .card').length
    };
  });
  // By design "Spoke to them" only appears once Call or Text has been tapped.
  const tryBtn = await page.$('[data-try]');
  if (tryBtn) { await tryBtn.click(); await page.waitForTimeout(500); }
  const gated = await page.evaluate(() => document.querySelectorAll('[data-log]').length);
  console.log('log buttons after tapping Call ->', gated);
  await page.evaluate(() => { window.__CALLS = []; });
  const btn = await page.$('[data-log]');
  if (btn) { await btn.click(); await page.waitForTimeout(1000); }
  const after = await page.evaluate(() => ({
    calls: window.__CALLS.map(c => c.table + '.' + c.op + '(' + c.keys.join(',') + ')'),
    rejected: window.__CALLS.filter(c => c.error).map(c => c.error.message)
  }));
  console.log('board       ->', JSON.stringify(before));
  console.log('after a log ->', JSON.stringify(after, null, 1));
  console.log('page errors:', errs.length);
  errs.slice(0, 4).forEach(e => console.log('  ' + e.slice(0, 160)));
  const ok = before.boardPresent && before.names.length >= 1 && before.boardPresent
    && after.calls.some(c => c.startsWith('agent_activity.insert')) && !after.rejected.length && !errs.length;
  console.log(ok ? '\nPASS' : '\nFAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
