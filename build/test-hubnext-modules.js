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
    var rows = table === 'realty_members' ? [${JSON.stringify(0)} && null] : [];
    o.then = function(res, rej){
      var data = one ? (table === 'realty_members' ? ${JSON.stringify(member)} : null) : [];
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
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    // hub_next loads the client from our own origin; hub_payload still loads it
    // from jsdelivr. Both get the same stand in, or the payload's own script dies
    // on window.supabase being undefined and every later assertion measures that
    // instead of the modules.
    const stub = (r) => r.fulfill({ contentType: 'application/javascript', body: SB_STUB(member) });
    await p.route('**/vendor/supabase-js-*.js', stub);
    await p.route('**/cdn.jsdelivr.net/**/supabase*.js', stub);
    await p.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.route('**/aaritransactions.com/**', r => r.abort());
    await p.goto('http://127.0.0.1:8937/.hubtest/' + path.basename(file), { waitUntil: 'load', timeout: 40000 });
    await p.waitForTimeout(2500);
    return { p, errs };
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

  // ---------------------------------------------------------------- old build
  console.log('\nhub_payload, unchanged, still works');
  {
    const { p, errs } = await open('payload-broker', 'hub_payload.html', BROKER, true);
    const st = await p.evaluate(() => ({
      bTxOpen: typeof window.bTxOpen,
      brokerPanelInit: typeof window.brokerPanelInit,
      bflagsRun: typeof window.bflagsRun,
      shellless: window.__aariShellless === true,
      gate: window.__gateFired === true,
      sidebar: !!document.getElementById('sidebar'),
    }));
    ok('no duplicate declaration SyntaxError', syntax(errs).length === 0, syntax(errs).join('\n       '));
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
