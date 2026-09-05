// The ICA gate is injected by realty-hub into the payload it serves. The
// preview route that serves hub_next.html returns before that injection, so
// an agent moved onto the new Hub would get no gate: seven active members,
// ICA v5 current since 26 July, one signature on it.
//
// hub_next.html now carries an explicit <!--ICA_GATE_SLOT-->. This proves two
// things a grep cannot: that a script injected at that slot actually executes,
// and that injecting it does not stop the Hub booting.
const {chromium} = require('playwright');
const path = require('path');
const fs   = require('fs');
const ROOT = path.join(__dirname, '..');
// All three slots realty-hub injects into, not just the gate. hub_next had
// only the gate, so serving it in the payload's place would have dropped the
// transaction and broker modules on the floor with nothing to say about it.
const SLOTS = ['<!--TX_SLOT-->', '<!--BROKER_SLOT-->', '<!--ICA_GATE_SLOT-->'];

const raw = fs.readFileSync(path.join(ROOT, 'hub_next.html'), 'utf8');
for (const s of SLOTS) {
  if (raw.indexOf(s) === -1) { console.log('FAIL  hub_next.html has no ' + s); process.exit(1); }
}

// Stands in for the real gate: same shape, an IIFE reading window.SB_URL and
// guarding itself, with no block-scoped declarations at the top level.
const FAKE_GATE = '<script>\n(function(){\n' +
  '  if (window.__aariIcaGate) return; window.__aariIcaGate = 1;\n' +
  '  window.__gateSawSbUrl = !!window.SB_URL;\n' +
  '  function boot(){ var d=document.createElement("div"); d.id="icagate";\n' +
  '    d.textContent="Sign your ICA"; document.body.appendChild(d); }\n' +
  '  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot);\n' +
  '  else setTimeout(boot,50);\n' +
  '})();\n</' + 'script>';

// One marker per slot, so a slot that silently fails to execute is named
// rather than hidden behind the other two passing.
function stub(tag){
  return '<script>\n(function(){ window.__slotRan = window.__slotRan || {};\n' +
    '  window.__slotRan[' + JSON.stringify(tag) + '] = true;\n' +
    '  window.__slotSawSbUrl = window.__slotSawSbUrl || {};\n' +
    '  window.__slotSawSbUrl[' + JSON.stringify(tag) + '] = !!window.SB_URL;\n' +
    '})();\n</' + 'script>';
}
let withGate = raw.replace('<!--ICA_GATE_SLOT-->', FAKE_GATE);
withGate = withGate.replace('<!--TX_SLOT-->', stub('tx'));
withGate = withGate.replace('<!--BROKER_SLOT-->', stub('broker'));
const tmp = path.join(ROOT, '.hub_next.gatetest.html');
fs.writeFileSync(tmp, withGate);

const T = {realty_members:[{user_id:'u1',full_name:'Zoe',role:'agent',status:'active',
  commission_plan:'100_max',fee_exempt:false,email:'z@x.com',license_number:null,phone:null}],
  realty_toolbox:[],realty_vendors:[],realty_agent_subscriptions:[],realty_agent_goals:[],
  realty_broker_goals:[],realty_transactions:[],realty_listings:[],realty_announcements:[],
  realty_announcement_reads:[],realty_expenses:[],realty_training_categories:[],
  realty_training_items:[],realty_training_completions:[],agent_contacts:[],agent_activity:[]};

(async () => {
  const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p = await b.newPage({viewport:{width:1100,height:800}});
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(t => { window.__T = t; }, T);
  await p.route('**/supabase-js-*.js', r => r.fulfill({contentType:'application/javascript', body:`
    function ok(d){return Promise.resolve({data:d,error:null});}
    window.supabase={createClient:function(){return{
     auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
       getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
       signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
     from:function(t){var rows=window.__T[t]||[];var q={};
      q.select=function(){if(t==='realty_members')return{eq:function(){return{single:()=>ok(window.__T.realty_members[0])};},order:()=>ok(rows),then:function(r){r({data:rows,error:null});}};return q;};
      q.eq=function(){return q;};q.order=function(){q.order=function(){return ok(rows);};return q;};
      q.maybeSingle=function(){return ok(rows[0]||null);};
      q.then=function(r){r({data:rows,error:null});};
      q.update=function(){return q;};q.insert=function(){return{select:()=>ok([])};};
      return q;}};}};`}));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
  await p.goto('file://' + tmp, {waitUntil:'load', timeout:45000});
  await p.waitForTimeout(3500);

  const r = await p.evaluate(() => ({
    gateRan:   !!window.__aariIcaGate,
    sawSbUrl:  !!window.__gateSawSbUrl,
    gateInDom: !!document.getElementById('icagate'),
    hubAlive:  !!window.__hubAlive,
    appShown:  !!(document.getElementById('app') && !document.getElementById('app').hidden),
    txRan:     !!(window.__slotRan && window.__slotRan.tx),
    brokerRan: !!(window.__slotRan && window.__slotRan.broker),
    txSawUrl:     !!(window.__slotSawSbUrl && window.__slotSawSbUrl.tx),
    brokerSawUrl: !!(window.__slotSawSbUrl && window.__slotSawSbUrl.broker)
  }));
  fs.unlinkSync(tmp);

  const checks = [
    ['a script at TX_SLOT executes',         r.txRan],
    ['TX_SLOT can read window.SB_URL',       r.txSawUrl],
    ['a script at BROKER_SLOT executes',     r.brokerRan],
    ['BROKER_SLOT can read window.SB_URL',   r.brokerSawUrl],
    ['a script at ICA_GATE_SLOT executes',   r.gateRan],
    ['it can read window.SB_URL',            r.sawSbUrl],
    ['it can write to the document',         r.gateInDom],
    ['the Hub still boots alongside it',     r.hubAlive],
    ['the app is still shown',               r.appShown],
    ['no page errors',                       errs.length === 0]
  ];
  checks.forEach(([n, ok]) => console.log((ok ? 'ok   ' : 'FAIL ') + n));
  if (errs.length) console.log('  ' + errs[0]);
  const pass = checks.every(c => c[1]);
  console.log(pass ? '\nPASS' : '\nFAIL');
  await b.close();
  process.exit(pass ? 0 : 1);
})();
