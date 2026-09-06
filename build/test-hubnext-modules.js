// The Transaction Coordinator section, inside the new Hub.
//
// realty-hub composes the page it serves: it downloads a base document, runs
// dedupeGlobals over it, then injects tx_module into TX_SLOT, broker_module
// into BROKER_SLOT for a broker, and the ICA gate into ICA_GATE_SLOT. Until
// now hub_next returned early and received none of that.
//
// This composes the same document the function composes, in the same order,
// with the same three string rewrites, and opens it in a real browser. What it
// is looking for is the failure mode that would blank the page: a duplicate
// top level declaration, which is a SyntaxError and takes the whole script
// with it. Both base documents are checked, because the old build has to keep
// working while the new one is proven.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Copied from supabase/functions/realty-hub/index.ts. If the function's three
// rewrites ever change, this copy is wrong and the test is worthless, so it is
// asserted against the deployed source below.
function dedupeGlobals(html) {
  return html
    .replace('const SB_URL=', 'window.SB_URL=')
    .replace('const SB_KEY=', 'window.SB_KEY=')
    .replace('const sb=window.supabase.createClient', 'window.sb=window.sb||window.supabase.createClient');
}
function inject(html, slot, content) {
  if (!content) return html;
  if (html.includes(slot)) return html.replace(slot, () => content);
  return html.replace('</body>', () => content + '\n</body>');
}

// A stand in for the real ICA gate. The real script lives in realty_config and
// is not in this repository; what is being proven here is that the slot exists
// and that a script placed in it runs, which is the part that was missing.
const GATE = '<scr' + 'ipt>window.__gateFired = true;</scr' + 'ipt>';

function compose(base, withBroker) {
  let html = dedupeGlobals(read(base));
  html = inject(html, '<!--TX_SLOT-->', dedupeGlobals(read('tx_module.html')));
  if (withBroker) html = inject(html, '<!--BROKER_SLOT-->', dedupeGlobals(read('broker_module.html')));
  html = inject(html, '<!--ICA_GATE_SLOT-->', GATE);
  return html;
}

let fails = 0, checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (cond) { console.log('  ok   ' + name); return true; }
  fails++;
  console.log('  FAIL ' + name + (detail ? '\n       ' + detail : ''));
  return false;
}

// A Supabase stand in. Every builder method returns the same object and the
// object is thenable, so any chain the Hub writes resolves; single() decides
// whether the answer is a row or a list.
// One file with an extracted contract on it, so the Contracts screen has
// something to open. Without a row the panel shows its pick-a-contract note and
// renders no tabs and no flag cards, which makes every styling assertion vacuous.
const FILES_JSON = JSON.stringify([{
  id: 'f1', client_type: 'buyer', created_at: '2026-08-01T00:00:00Z',
  service_type: 'tc_one_side', contract_type: 'frbar_asis',
  effective_date: '2026-01-02', closing_date: '2026-03-06',
  logistics: {}, deadline_overrides: {},
  raw_form_data: { contract_path: 'f/c.pdf', extracted_contract: {
    flags_at: '2026-08-02T00:00:00Z',
    fields: { contract_type: 'AS IS', address: 'A property', price: '450000', emd: '10000',
              closing_date: '2026-03-06', effective_date: '2026-01-02',
              financing_type: 'conventional', buyer: 'A buyer', seller: 'A seller' },
    flags: [{ id: 'a', severity: 'stop', title: 'A stop flag', body: 'Body.', page: 3 },
            { id: 'b', severity: 'check', title: 'A check flag', body: 'Body.', page: 7 }],
    documents: [{ title: 'Contract', page: 1 }] } }
}]);

const SB_STUB = (member) => `
window.supabase = { createClient: function(){
  function q(table){
    var one = false, o = {};
    ['select','eq','neq','in','order','limit','not','is','or','and','gte','lte','gt','lt',
     'filter','range','ilike','like','contains','overlaps','match','abortSignal','returns',
     'insert','update','upsert','delete','head','csv','textSearch','rpc'
    ].forEach(function(k){ o[k] = function(){ return o; }; });
    o.single = function(){ one = true; return o; };
    o.maybeSingle = function(){ one = true; return o; };
    o.then = function(res, rej){
      var data = one ? (table === 'realty_members' ? ${JSON.stringify(member)} : null)
                     : (table === 'files' ? ${FILES_JSON} : []);
      return Promise.resolve({ data: data, error: null, count: 0 }).then(res, rej);
    };
    return o;
  }
  return {
    auth: {
      getSession: async function(){ return { data: { session: { user: { id: 'u1' }, access_token: 't' } } }; },
      getUser: async function(){ return { data: { user: { id: 'u1' } } }; },
      signOut: async function(){ return {}; },
      onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }
    },
    from: q,
    rpc: function(){ return q(''); },
    storage: { from: function(){ return { download: async function(){ return { data: null, error: 'stub' }; },
                                          createSignedUrl: async function(){ return { data: null, error: 'stub' }; } }; } },
    functions: { invoke: async function(){ return { data: null, error: 'stub' }; } }
  };
} };
`;

(async () => {
  // The rewrites this test copies must be the ones the function performs.
  const fn = read('supabase/functions/realty-hub/index.ts');
  ok('dedupeGlobals still rewrites the three const forms',
     ["const SB_URL=", "const SB_KEY=", "const sb=window.supabase.createClient"]
       .every(l => fn.includes("'" + l + "'")),
     'the deployed function no longer matches the copy in this test');
  ok('the function no longer returns early for hub_next',
     !/return new Response\(next,/.test(fn),
     'the preview route still bypasses dedupeGlobals and all three injects');

  const tmp = path.join(root, '.hubtest');
  fs.mkdirSync(tmp, { recursive: true });
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(root, rel);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(f));
  }).listen(8937);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  async function open(label, base, member, withBroker) {
    const file = path.join(tmp, label.replace(/\W+/g, '_') + '.html');
    fs.writeFileSync(file, compose(base, withBroker));
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [], cdnHits = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    // Both documents now load the client from our own origin. The jsdelivr route
    // stays as a tripwire: if anything reaches for it again, the stub answers and
    // the assertion below catches the request rather than the page dying quietly.
    const stub = (r) => r.fulfill({ contentType: 'application/javascript', body: SB_STUB(member) });
    await p.route('**/vendor/supabase-js-*.js', stub);
    await p.route('**/cdn.jsdelivr.net/**/supabase*.js', (r) => { cdnHits.push(r.request().url()); return stub(r); });
    await p.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.route('**/aaritransactions.com/**', r => r.abort());
    await p.goto('http://127.0.0.1:8937/.hubtest/' + path.basename(file), { waitUntil: 'load', timeout: 40000 });
    await p.waitForTimeout(2500);
    return { p, errs, cdnHits };
  }

  const BROKER = { user_id: 'u1', full_name: 'Broker', role: 'broker', status: 'active', is_tc: false };
  const TC     = { user_id: 'u1', full_name: 'Coordinator', role: 'agent', status: 'active', is_tc: true };
  const AGENT  = { user_id: 'u1', full_name: 'Agent', role: 'agent', status: 'active', is_tc: false };

  const syntax = (errs) => errs.filter(e => /already been declared|SyntaxError|Identifier .* has already/.test(e));

  // ---------------------------------------------------------------- new build
  console.log('\nhub_next, broker, both modules injected');
  {
    const { p, errs } = await open('next-broker', 'hub_next.html', BROKER, true);
    const st = await p.evaluate(() => ({
      bTxOpen: typeof window.bTxOpen,
      brokerPanelInit: typeof window.brokerPanelInit,
      bflagsRun: typeof window.bflagsRun,
      tcMount: typeof window.__aariTcMount,
      shellless: window.__aariShellless === true,
      brokerShellless: window.__aariBrokerShellless === true,
      gate: window.__gateFired === true,
      alive: window.__hubAlive === true,
    }));
    ok('no duplicate declaration SyntaxError', syntax(errs).length === 0, syntax(errs).join('\n       '));
    // Errors this harness causes itself do not count: the stub has no functions
    // client, and aaritransactions.com is deliberately unreachable.
    const real = errs.filter(e => !/calendar load stub|ERR_CONNECTION_RESET|net::ERR_FAILED/.test(e));
    ok('no console errors beyond the ones this harness causes', real.length === 0,
       real.join('\n       '));
    ok('bTxOpen is defined', st.bTxOpen === 'function', st.bTxOpen);
    ok('brokerPanelInit is defined', st.brokerPanelInit === 'function', st.brokerPanelInit);
    ok('bflagsRun is defined', st.bflagsRun === 'function', st.bflagsRun);
    ok('the ICA gate script ran', st.gate);
    ok('the TC entry point is exported', st.tcMount === 'function');
    ok('the transaction module stood down rather than throwing', st.shellless);
    ok('the broker module stood down rather than throwing', st.brokerShellless);
    ok('the Hub reports itself alive', st.alive);
    await p.close();
  }

  // ---------------------------------------------------------------- the tab
  async function navCheck(label, member, shouldSee) {
    const { p, errs } = await open('nav-' + label, 'hub_next.html', member, member.role === 'broker');
    const tabs = await p.evaluate(() =>
      [].map.call(document.querySelectorAll('nav a[data-t], [data-t]'), a => a.getAttribute('data-t')));
    const seen = tabs.indexOf('TC') !== -1;
    ok(label + (shouldSee ? ' sees a TC tab' : ' sees no TC tab'), seen === shouldSee,
       'tabs: ' + JSON.stringify(tabs));
    if (shouldSee) {
      await p.evaluate(() => {
        const a = [].filter.call(document.querySelectorAll('[data-t]'), x => x.getAttribute('data-t') === 'TC')[0];
        if (a) a.click();
      });
      await p.waitForTimeout(1500);
      const st = await p.evaluate(() => ({
        box: !!document.getElementById('ctr-box'),
        rail: !!document.getElementById('ctr-rail'),
        css: !!document.getElementById('ctr-css'),
        text: (document.getElementById('ctr-box') || {}).textContent || '',
      }));
      ok(label + ': the TC tab renders the contract screen', st.box && st.rail && st.css,
         JSON.stringify(st).slice(0, 200));
      ok(label + ': it did not fall back to the did-not-load message',
         st.text.indexOf('did not load') === -1, st.text.slice(0, 120));
    }
    ok(label + ': no duplicate declaration SyntaxError', syntax(errs).length === 0,
       syntax(errs).join('\n       '));
    await p.close();
  }
  console.log('\nwho gets the TC tab');
  await navCheck('a broker', BROKER, true);
  await navCheck('a coordinator (is_tc)', TC, true);
  await navCheck('a plain agent', AGENT, false);

  // ------------------------------------------------- the sign in gate
  // #gate is fixed, inset 0, z-index 9999. Shipped without a hidden attribute
  // it painted a full screen login over everything from the first byte until
  // the session check flipped it, at somebody who is already signed in. On the
  // injected path it can never be the right first paint: realty-hub verifies
  // the JWT and returns 403 unless the member row is active, so the document
  // only exists in an authenticated browser.
  console.log('\nthe sign in gate does not flash');
  ok('the gate ships hidden in the markup',
     /<div id="gate" hidden>/.test(read('hub_next.html')),
     'no hidden attribute, so it paints before any script runs');
  {
    const { p } = await open('gate-signed-in', 'hub_next.html', BROKER, true);
    const st = await p.evaluate(() => {
      const g = document.getElementById('gate'), a = document.getElementById('app');
      return { gateHidden: g.hasAttribute('hidden'), gateDisplay: getComputedStyle(g).display,
               appShown: !a.hasAttribute('hidden'),
               ground: getComputedStyle(document.body).backgroundImage };
    });
    ok('signed in: the gate stays hidden', st.gateHidden && st.gateDisplay === 'none');
    ok('signed in: the app is shown', st.appShown);
    // With both hidden the ground must be the warm gradient, not a white void.
    ok('the boot ground is the warm gradient, not blank white',
       /linear-gradient/.test(st.ground), st.ground.slice(0, 60));
    await p.close();
  }
  // A genuinely signed out user must still get a login, not a blank screen.
  {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const noSession = SB_STUB(BROKER).replace(
      "getSession: async function(){ return { data: { session: { user: { id: 'u1' }, access_token: 't' } } }; }",
      "getSession: async function(){ return { data: { session: null } }; }");
    ok('the no-session stub was actually built', noSession.indexOf('session: null') !== -1);
    await p.route('**/vendor/supabase-js-*.js', r => r.fulfill({ contentType: 'application/javascript', body: noSession }));
    await p.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.route('**/aaritransactions.com/**', r => r.abort());
    const file = path.join(tmp, 'gate_none.html');
    fs.writeFileSync(file, compose('hub_next.html', true));
    await p.goto('http://127.0.0.1:8937/.hubtest/' + path.basename(file), { waitUntil: 'load', timeout: 40000 });
    await p.waitForTimeout(2000);
    const st = await p.evaluate(() => {
      const g = document.getElementById('gate');
      return { shown: !g.hasAttribute('hidden') && getComputedStyle(g).display === 'flex',
               form: !!document.getElementById('gate-form') };
    });
    ok('no session: the gate is revealed, with its form', st.shown && st.form);
    await p.close();
  }
  // The library guard writes into #gate-msg. With the gate hidden that message
  // would land on a page nobody can see: a failure presenting as an absence.
  {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.route('**/vendor/supabase-js-*.js', r => r.abort());
    await p.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.route('**/aaritransactions.com/**', r => r.abort());
    const file = path.join(tmp, 'gate_nolib.html');
    fs.writeFileSync(file, compose('hub_next.html', true));
    await p.goto('http://127.0.0.1:8937/.hubtest/' + path.basename(file), { waitUntil: 'load', timeout: 40000 });
    await p.waitForTimeout(2000);
    const st = await p.evaluate(() => {
      const g = document.getElementById('gate');
      return { shown: !g.hasAttribute('hidden'),
               msg: (document.getElementById('gate-msg') || {}).textContent || '' };
    });
    ok('an unreachable client library reveals the gate and says so',
       st.shown && /Could not load the sign in library/.test(st.msg), JSON.stringify(st));
    await p.close();
  }

  // ------------------------------------------------- the override layer
  // The modules borrow class names from the design system. hub_payload
  // implements it; hub_next does not, so on the new build they resolved to
  // nothing. build/next-css.js generates the layer from the pinned copy of the
  // system, prefixing every selector with #app.
  console.log('\nthe design system override layer');
  {
    const mod = read('tx_module.html');
    const blk = mod.slice(mod.indexOf('/*NEXT_CSS_START*/'), mod.indexOf('/*NEXT_CSS_END*/'));
    const sels = [...blk.matchAll(/\+'([^{]*?)\{/g)].map(m => m[1]).filter(s => s.indexOf('@media') < 0);
    ok('the generated block is not empty', sels.length > 40, sels.length + ' selectors');
    ok('every generated selector is scoped to #app',
       sels.every(s => s.split(',').every(p => p.trim().startsWith('#app '))),
       sels.filter(s => !s.split(',').every(p => p.trim().startsWith('#app '))).join(' | '));

    // The old build is the one that matters most, so it is measured, not argued.
    const oldPage = await open('layer-old-build', 'hub_payload.html', BROKER, true);
    const oldHit = await oldPage.p.evaluate((ss) => {
      let n = 0; for (const s of ss) { try { n += document.querySelectorAll(s).length; } catch (e) {} } return n;
    }, sels);
    ok('not one generated rule matches anything on the old build', oldHit === 0, oldHit + ' matches');
    await oldPage.p.close();

    const newPage = await open('layer-new-build', 'hub_next.html', BROKER, true);
    await newPage.p.evaluate(() => {
      const a = [].filter.call(document.querySelectorAll('[data-t]'), x => x.getAttribute('data-t') === 'TC')[0];
      if (a) a.click();
    });
    await newPage.p.waitForTimeout(1200);
    await newPage.p.evaluate(() => { const r = document.querySelector('#ctr-rail [data-ctr]'); if (r) r.click(); });
    await newPage.p.waitForTimeout(1200);
    const st = await newPage.p.evaluate((ss) => {
      const app = document.getElementById('app');
      let matched = 0; const outside = [];
      for (const s of ss) { let els = []; try { els = [...document.querySelectorAll(s)]; } catch (e) { continue; }
        matched += els.length;
        for (const el of els) if (!app || !app.contains(el)) outside.push(s); }
      return { layer: !!document.getElementById('aari-next-css'), matched, outside: outside.slice(0, 6) };
    }, sels);
    ok('the layer is injected on the new build', st.layer);
    ok('it matches something there', st.matched > 0, st.matched + ' matches');
    ok('and nothing it matches sits outside #app', st.outside.length === 0, st.outside.join(' | '));
    await newPage.p.close();
  }

  // ------------------------------------------------- ids and name collisions
  // Two names were shared between a host page and a guest module. Neither ever
  // produced two elements in one document, because the shells are mutually
  // exclusive, but a shared id is a trap that springs the first time that stops
  // being true. Each name now belongs to one owner.
  console.log('\nnothing shares a name with its host');
  {
    ok('the module names its own container', /id="tx-ctr-box"/.test(read('tx_module.html')));
    ok('and hub_next keeps ctr-box as the mount point it offers',
       /id="ctr-box"/.test(read('hub_next.html')));
    ok('the broker module namespaces its done modifier',
       !/\.onb-chk\.done\b/.test(read('broker_module.html'))
       && /\.onb-chk\.onb-done\b/.test(read('broker_module.html')));
    ok('and emits the namespaced class, not the bare one',
       /it\.done\?' onb-done'/.test(read('broker_module.html')));
    ok('no bare .done rule exists on either side',
       ![read('hub_next.html'), read('broker_module.html')]
         .some(src => /(^|[};,\s])\.done\s*\{/.test(src)));

    for (const [label, base] of [['new build', 'hub_next.html'], ['old build', 'hub_payload.html']]) {
      const { p } = await open('ids-' + label.replace(/\W+/g, '_'), base, BROKER, true);
      if (base === 'hub_next.html') {
        await p.evaluate(() => {
          const a = [].filter.call(document.querySelectorAll('[data-t]'), x => x.getAttribute('data-t') === 'TC')[0];
          if (a) a.click();
        });
      } else {
        await p.evaluate(() => { const i = document.querySelector('.sidebar-item[data-panel="tx-contracts"]'); if (i) i.click(); });
      }
      await p.waitForTimeout(1500);
      const st = await p.evaluate(() => {
        const dupes = {};
        document.querySelectorAll('[id]').forEach(el => { dupes[el.id] = (dupes[el.id] || 0) + 1; });
        const tx = document.getElementById('panel-tx-list');
        const blog = document.getElementById('panel-broker-blog');
        return { ctrBox: dupes['ctr-box'] || 0, txCtrBox: dupes['tx-ctr-box'] || 0,
                 perId: dupes,
                 hosted: {
                   txListIsHost: !!(tx && tx.querySelector('#txr-list') && !tx.querySelector('#tx-list-box')),
                   txListHasTabBar: !!(tx && tx.querySelector('.mydeals-tabs')),
                   blogIsHost: !!(blog && blog.querySelector('#blog-composer-mount') && !blog.querySelector('#bpost-box')),
                   txFlag: window.__aariTxListHosted,
                   blogFlag: window.__aariBrokerBlogHosted,
                 },
                 anyDuplicateId: Object.keys(dupes).filter(k => dupes[k] > 1) };
      });
      ok(label + ': ctr-box appears at most once', st.ctrBox <= 1, 'found ' + st.ctrBox);
      ok(label + ': tx-ctr-box appears at most once', st.txCtrBox <= 1, 'found ' + st.txCtrBox);
      // hub_payload carries a static #panel-tx-list and #panel-broker-blog with
      // real content, and each module used to create one of the same id, so
      // setPanel activated both and the two rendered stacked on every load.
      // Both were live, so neither could simply be deleted: each module now
      // leaves the id alone where the host already owns it. Named here so a
      // regression on either one, or a third collision anywhere, fails the build
      // rather than being noticed on screen.
      const FIXED = ['panel-tx-list', 'panel-broker-blog'];
      ok(label + ': no duplicate id anywhere in the composed document',
         st.anyDuplicateId.length === 0, st.anyDuplicateId.join(', '));
      // On the new build both modules stand down and neither panel is created,
      // so the count there is zero, not one. Only the old build owns them.
      const want = base === 'hub_payload.html' ? 1 : 0;
      for (const id of FIXED) {
        ok(label + ': ' + id + ' appears ' + want + ' time(s)',
           (st.perId[id] || 0) === want, 'found ' + (st.perId[id] || 0));
      }
      if (base === 'hub_payload.html') {
        ok('the surviving Transactions panel is the host page\'s, with the tab bar on it',
           st.hosted.txListIsHost && st.hosted.txListHasTabBar);
        ok('the surviving blog composer is the host page\'s',
           st.hosted.blogIsHost);
        ok('and each module recorded which screen it stood down for',
           st.hosted.txFlag === true && st.hosted.blogFlag === true);
      }
      await p.close();
    }
  }

  // ---------------------------------------------------------------- old build
  console.log('\nhub_payload, unchanged, still works');
  {
    const { p, errs, cdnHits } = await open('payload-broker', 'hub_payload.html', BROKER, true);
    const st = await p.evaluate(() => ({
      bTxOpen: typeof window.bTxOpen,
      brokerPanelInit: typeof window.brokerPanelInit,
      bflagsRun: typeof window.bflagsRun,
      shellless: window.__aariShellless === true,
      gate: window.__gateFired === true,
      sidebar: !!document.getElementById('sidebar'),
    }));
    ok('no duplicate declaration SyntaxError', syntax(errs).length === 0, syntax(errs).join('\n       '));
    // The payload used to load the client from jsdelivr at a floating @2. It is
    // repointed at the vendored copy the other two documents already use, so
    // nothing on this build reaches a third party host for its client any more.
    ok('the old build asks no CDN for its client', cdnHits.length === 0, cdnHits.join(', '));
    // Removing the five ctr* functions must leave no caller behind on the build
    // agents are actually on. Same harness exclusions as the new build.
    const realOld = errs.filter(e => !/calendar load stub|ERR_CONNECTION_RESET|net::ERR_FAILED|Failed to load resource/.test(e));
    ok('no console errors beyond the ones this harness causes', realOld.length === 0,
       realOld.join('\n       '));
    ok('no caller survived the ctr removal',
       !errs.some(e => /ctr(Holidays|Roll|Schedule|SavePeriods|TrackDeadlines|ActionsHtml)|is not defined/.test(e)),
       errs.filter(e => /is not defined/.test(e)).join('\n       '));
    ok('the three broker functions are still defined',
       st.bTxOpen === 'function' && st.brokerPanelInit === 'function' && st.bflagsRun === 'function');
    ok('the old shell is present, so the builder ran', st.sidebar && !st.shellless);
    ok('the ICA gate script ran', st.gate);
    await p.close();
  }

  await b.close(); srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (fails ? fails + ' of ' + checks + ' checks FAILED' : checks + ' checks passed'));
  process.exit(fails ? 1 : 0);
})();
