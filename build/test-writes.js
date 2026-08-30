// Exercises every write path against a stub that enforces the real column
// names from build/schema.json. The point is a stub that can disagree: the
// activity insert shipped with 'activity_type' and 'occurred_at' and passed
// every earlier test, because the old stub accepted whatever it was handed.
const { chromium } = require('playwright');
const path = require('path');
const SCHEMA = require('./schema.json');

const ROWS = [
  { id:'c1', full_name:'Ana T', email:'a@x.com', phone:'239-555-0001', contact_type:'Buyer and Seller', record_class:'client', stage:'New Lead', tier:'A', last_touch:null, notes:null, db_state:'unworked', snoozed_until:null, snooze_count:0, city:'Lehigh Acres', household_id:'h1', household_primary:true, is_agent:false, gap_skips:[], created_at:'2026-08-01T00:00:00Z' },
  { id:'c2', full_name:'Bob T', email:null, phone:'239-555-0002', contact_type:'Buyer', record_class:'client', stage:'New Lead', tier:'A', last_touch:'2026-06-01', notes:null, db_state:'active', snoozed_until:null, snooze_count:4, city:null, household_id:'h1', household_primary:false, is_agent:false, gap_skips:[], created_at:'2026-08-01T00:00:00Z' },
  { id:'c3', full_name:'Cara T', email:'c@x.com', phone:'239-555-0004', contact_type:'Seller', record_class:'client', stage:'Closed', tier:'C', last_touch:'2026-08-20', notes:null, db_state:'active', snoozed_until:null, snooze_count:0, city:'Fort Myers', household_id:null, household_primary:false, is_agent:false, gap_skips:[], created_at:'2026-06-04T00:00:00Z' }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.addInitScript(([rows, schema]) => { window.__ROWS = rows; window.__SCHEMA = schema; }, [ROWS, SCHEMA]);
  await page.route('**/supabase-js-*.js', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__CALLS = [];
    function check(table, obj, what){
      var cols = window.__SCHEMA[table];
      if(!cols) return { message: 'relation "'+table+'" does not exist' };
      for(var k in obj){
        if(cols.indexOf(k) < 0){
          return { message: 'column "'+k+'" of relation "'+table+'" does not exist', code: '42703', op: what };
        }
      }
      return null;
    }
    window.supabase = { createClient: function(){ return {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
        getUser:    async () => ({ data: { user: { id: 'u1' } } }),
        signOut:    async () => ({}), onAuthStateChange: () => {}
      },
      from: function(table){
        var q = { _t: table, _patch: null };
        q.select = function(){
          if(table === 'realty_members') return { eq: function(){ return { single: async () => ({ data: { user_id:'u1', full_name:'Marlenyi L. Paredes', role:'broker', status:'active' }, error: null }) }; } };
          if(q._pending) return Promise.resolve(q._pending);
          return q;
        };
        q.eq = function(){ return q; };
        q.order = async function(){ return { data: JSON.parse(JSON.stringify(window.__ROWS)), error: null }; };
        q.update = function(patch){
          var bad = check(table, patch, 'update');
          window.__CALLS.push({ table: table, op: 'update', keys: Object.keys(patch), error: bad });
          q._pending = bad ? { data: null, error: bad } : { data: [], error: null };
          return q;
        };
        q.insert = function(row){
          var bad = check(table, row, 'insert');
          window.__CALLS.push({ table: table, op: 'insert', keys: Object.keys(row), error: bad });
          var res = bad ? { data: null, error: bad } : { data: [row], error: null };
          return { select: async () => res };
        };
        return q;
      }
    }; } };
  `}));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));

  await page.goto('file://' + path.join(__dirname, '..', 'hub_next.html'), { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2200);

  const out = await page.evaluate(async () => {
    const runs = [];
    async function run(label, fn){
      window.__CALLS = [];
      let res = null, threw = null;
      try { res = await fn(); } catch (e) { threw = String(e && e.message || e); }
      const rejected = window.__CALLS.filter(c => c.error);
      runs.push({
        label,
        calls: window.__CALLS.map(c => c.table + '.' + c.op + '(' + c.keys.join(',') + ')'),
        rejectedBySchema: rejected.map(c => c.error.message),
        returnedError: res && res.error ? res.error.message : null,
        threw
      });
    }
    await run('log a conversation',        () => window.__dbLogActivity('c3', 'conversation', null));
    await run('log again, same day',       () => window.__dbLogActivity('c3', 'conversation', null));
    await run('change tier, household',    () => window.__dbSetTier('c1', 'B'));
    await run('snooze 3 days',             () => window.__dbPostpone('c3', 3));
    await run('snooze to the 5th, tier A', () => window.__dbPostpone('c2', 3));
    await run('promote to active',         () => window.__dbStartWorking('c3'));
    return runs;
  });

  let fail = 0;
  for (const r of out) {
    const bad = r.rejectedBySchema.length || r.threw;
    if (bad) fail++;
    console.log((bad ? 'FAIL  ' : 'ok    ') + r.label);
    for (const c of r.calls) console.log('        ' + c);
    for (const m of r.rejectedBySchema) console.log('        REJECTED: ' + m);
    if (r.threw) console.log('        THREW: ' + r.threw);
  }
  console.log('\npage errors: ' + errs.length);
  errs.slice(0, 4).forEach(e => console.log('  ' + e.slice(0, 160)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
