// Transaction Review was three hardcoded rows: two real client addresses, a
// real agent commission and a real draft file, in a public repository. It is
// now read from realty_transactions with the document count read from
// realty_tx_documents.
//
// What this proves that a grep cannot: only submitted and approved rows reach
// the queue, a missing commission stays missing instead of becoming zero, a
// real zero still shows as zero, and the empty state is reachable.
const { chromium } = require('playwright');
const path = require('path');

const MEMBERS = [
  { user_id: 'u1', full_name: 'Ada Lovelace' },
  { user_id: 'u2', full_name: 'Grace Hopper' }
];

// Four statuses on purpose. Only two of them belong in a disbursement queue.
const TX = [
  { id:'t1', agent_id:'u1', property_address:'12 Example St, Lehigh Acres', side:'buyer', price:250000,
    closing_date:'2026-08-14', status:'draft', gross_commission:7500, net_commission:null,
    lifecycle:'Active', paid_at:null, submitted_at:null, created_at:'2026-07-01T00:00:00Z', legacy_source:null, notes:null },
  { id:'t2', agent_id:'u2', property_address:'44 Sample Ave, Naples', side:'seller', price:600000,
    closing_date:'2026-08-05', status:'submitted', gross_commission:12345, net_commission:null,
    lifecycle:'Active', paid_at:null, submitted_at:'2026-08-01T00:00:00Z', created_at:'2026-07-01T00:00:00Z', legacy_source:null, notes:null },
  { id:'t3', agent_id:'u1', property_address:'99 Nofigure Rd, Estero', side:'buyer', price:null,
    closing_date:'2026-09-01', status:'approved', gross_commission:null, net_commission:null,
    lifecycle:'Active', paid_at:null, submitted_at:'2026-08-02T00:00:00Z', created_at:'2026-07-02T00:00:00Z', legacy_source:null, notes:null },
  { id:'t4', agent_id:'u2', property_address:'7 Zero Way, Fort Myers', side:'buyer', price:300000,
    closing_date:'2026-07-17', status:'submitted', gross_commission:0, net_commission:null,
    lifecycle:'Active', paid_at:null, submitted_at:'2026-08-03T00:00:00Z', created_at:'2026-06-01T00:00:00Z', legacy_source:null, notes:null },
  { id:'t5', agent_id:'u2', property_address:'3 Paid Cl, Cape Coral', side:'buyer', price:300000,
    closing_date:'2026-07-17', status:'paid', gross_commission:9000, net_commission:null,
    lifecycle:'Closed', paid_at:'2026-07-20T00:00:00Z', submitted_at:null, created_at:'2026-06-01T00:00:00Z', legacy_source:null, notes:null }
];

function stub(txRows, docRows, role) {
  return `
    function ok(d){return Promise.resolve({data:d,error:null});}
    window.__TX = ${JSON.stringify(txRows)};
    window.__DOCS = ${JSON.stringify(docRows)};
    window.__MEM = ${JSON.stringify(MEMBERS)};
    window.supabase={createClient:function(){return{
      auth:{getSession:()=>ok({session:{user:{id:'u1'}}}).then(r=>({data:r.data})),
            getUser:()=>ok({user:{id:'u1'}}).then(r=>({data:r.data})),
            signOut:()=>ok({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:function(t){
        var q={_in:null};
        function rows(){
          if(t==='realty_transactions'){
            var r=window.__TX;
            if(q._in && q._in.col==='status') r=r.filter(function(x){return q._in.vals.indexOf(x.status)>=0;});
            return r;
          }
          if(t==='realty_tx_documents'){
            var d=window.__DOCS;
            if(q._in && q._in.col==='transaction_id') d=d.filter(function(x){return q._in.vals.indexOf(x.transaction_id)>=0;});
            return d;
          }
          if(t==='realty_members') return window.__MEM;
          return [];
        }
        q.select=function(){
          if(t==='realty_members') return {eq:function(){return{single:()=>ok({user_id:'u1',full_name:'Ada Lovelace',role:'${'$'}{role}',status:'active'})};},
            then:function(res){res({data:window.__MEM,error:null});}};
          if(t==='agent_activity'){var s={eq:function(){return s;},then:function(res){res({data:[],error:null});}};return s;}
          return q;};
        q.in=function(col,vals){ q._in={col:col,vals:vals}; return q; };
        q.eq=function(){return q;};
        q.order=function(){ return ok(rows()); };
        q.then=function(res){ res({data:rows(),error:null}); };
        q.update=function(){return q;}; q.insert=function(){return{select:()=>ok([])};};
        return q;}};}};`;
}

async function run(txRows, docRows, opts) {
  opts = opts || {};
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/supabase-js-*.js', r => r.fulfill({ contentType: 'application/javascript', body: stub(txRows, docRows, opts.role || 'broker') }));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await p.goto('file://' + path.join(__dirname, '..', 'hub_next.html'), { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(3000);

  // Review is a broker tab, so the role toggle comes first. Driven through the
  // UI because the page functions and TXREVIEW both live inside the design's
  // IIFE and are not reachable from evaluate. Asserting on the rendered table
  // is the stronger test anyway: it proves the render, not just the array.
  const click = (re) => p.evaluate((r) => {
    const el = Array.from(document.querySelectorAll('#nav a, a, button, .tab, .subtab, [role=tab]'))
      .find(x => new RegExp(r, 'i').test((x.textContent || '').trim()));
    if (el) el.click();
    return !!el;
  }, re);
  let reached;
  if (opts.screen === 'txns') {
    await click('^deals$');  await p.waitForTimeout(700);
    reached = await click('^transactions$'); await p.waitForTimeout(700);
  } else {
    await click('^broker$'); await p.waitForTimeout(600);
    await click('^deals$');  await p.waitForTimeout(700);
    reached = await click('^review$'); await p.waitForTimeout(700);
  }

  const arr = await p.evaluate((wantAgent) => {
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    if (wantAgent) {
      return tables.filter(x => /Commission/i.test(x.textContent || ''))
        .flatMap(t => Array.from(t.querySelectorAll('tbody tr'))
          .map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim())));
    }
    const t = tables.find(x => /Docs to review/i.test(x.textContent || ''));
    if (!t) return [];
    return Array.from(t.querySelectorAll('tbody tr'))
      .map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim()));
  }, opts.screen === 'txns');
  const text = await p.evaluate(() => document.body.innerText);
  const html = await p.evaluate(() => document.body.innerHTML);
  await b.close();
  return { arr, text, html, errs, reached };
}

(async () => {
  const full = await run(TX, []);
  const empty = await run(TX.filter(t => t.status === 'paid' || t.status === 'draft'), []);
  const withDocs = await run(TX, [
    { transaction_id: 't2', status: 'uploaded' }, { transaction_id: 't2', status: 'approved' }
  ]);

  // pageTxns was a SkySlope import inbox over a literal with no table behind
  // it. It is now the signed in agent's own files. u1 owns t1 and t3.
  const mine  = await run(TX, [], { role: 'agent', screen: 'txns' });
  const none  = await run(TX.filter(t => t.agent_id !== 'u1'), [], { role: 'agent', screen: 'txns' });

  const ids = (full.arr || []).map(r => r[1]);
  const cell = (a, m, i) => (a || []).some(r => m.test(r[1]) && i.test(r[4]));
  const checks = [
    ['the Review tab is reachable',                 full.reached === true],
    ['the queue renders three rows',                Array.isArray(full.arr) && full.arr.length === 3],
    ['only submitted and approved rows reach it',   !ids.some(a => /Example St|Paid Cl/.test(a))],
    ['a draft is excluded',                         !ids.some(a => /Example St/.test(a))],
    ['a paid file is excluded',                     !ids.some(a => /Paid Cl/.test(a))],
    ['a null commission renders a middle dot',      cell(full.arr, /Nofigure/, /\u00B7/)],
    ['a null commission is not a zero',             !cell(full.arr, /Nofigure/, /0/)],
    ['a real zero still renders as zero',           cell(full.arr, /Zero Way/, /^\$0$/)],
    ['docs read 0 of 0 when none are uploaded',     (full.arr || []).length > 0 && (full.arr || []).every(r => r[3] === '0 of 0')],
    ['docs are counted when they exist',            (withDocs.arr || []).some(r => r[3] === '1 of 2')],
    ['the screen renders the rows',                 /Nofigure Rd/.test(full.text) && /Sample Ave/.test(full.text)],
    ['the empty state says so in words',            /No file is waiting on a disbursement decision/.test(empty.text)],
    ['the empty state renders no table rows',       Array.isArray(empty.arr) && empty.arr.length === 0],
    // Scoped to the three rows this screen used to carry. A bare "816 Frederick
    // Reid" with the street type dropped survives elsewhere in the build and is
    // a separate, pre-existing leak on the Today cards, reported not fixed:
    // both the build redaction and pii-sweep require a St or Ave suffix.
    ['no hardcoded queue row survives the build',   !/Frederick Reid St|17,877|Rush Ave|32nd Ave/.test(full.html)],
    ['Transactions is reachable as an agent',       mine.reached === true],
    ['it shows only the signed in agent files',     (mine.arr || []).length === 2],
    ['another agent file is not shown',             !/Sample Ave|Zero Way|Paid Cl/.test((mine.arr || []).map(r => r[0]).join(' '))],
    // .txlab is uppercased in CSS and innerText returns it transformed, so the
    // match is case insensitive. u1 owns two Active files and nothing else, so
    // the other two groups must not appear at all.
    ['it labels the active group',                  /active\s*\u00B7\s*2/i.test(mine.text)],
    ['it shows no group it has no files for',       !/closed\s*\u00B7/i.test(mine.text) && !/terminated\s*\u00B7/i.test(mine.text)],
    ['a missing price renders a middle dot',        (mine.arr || []).some(r => /Nofigure/.test(r[0]) && r[3].indexOf('\u00B7') >= 0)],
    ['an agent with no file gets the empty state',  /No file is recorded against you yet/.test(none.text)],
    ['the SkySlope inbox is gone from the build',   !/MasterDataReport|Last import 18 Aug/.test(mine.html)],
    ['no page errors',                              full.errs.length === 0 && empty.errs.length === 0 && mine.errs.length === 0]
  ];
  checks.forEach(([n, ok]) => console.log((ok ? 'ok   ' : 'FAIL ') + n));
  if (full.errs.length) console.log('  ' + full.errs[0]);
  const pass = checks.every(c => c[1]);
  console.log(pass ? '\nPASS' : '\nFAIL');
  process.exit(pass ? 0 : 1);
})();
