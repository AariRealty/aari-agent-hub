// Compose the document the way realty-hub does, then measure it. Never measure a
// module against its own source: tx_module emits one document level layer that
// covers both modules, so a class defined there resolves in broker_module and
// looking at broker_module alone cannot see it. That mistake produced two wrong
// answers on this exact task.
const { chromium } = require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function dedupeGlobals(h){return h.replace('const SB_URL=','window.SB_URL=').replace('const SB_KEY=','window.SB_KEY=').replace('const sb=window.supabase.createClient','window.sb=window.sb||window.supabase.createClient');}
function inject(h,slot,c){if(!c)return h;return h.includes(slot)?h.replace(slot,()=>c):h.replace('</body>',()=>c+'\n</body>');}
// Stand in for the real ICA gate. The real script lives in realty_config; every id
// it creates is aari-prefixed and it guards each one with getElementById before
// creating it, so it cannot collide with anything measured here.
const GATE = '<scr'+'ipt>window.__gateFired = true;</scr'+'ipt>';
const stub = (m) => `window.supabase={createClient:function(){function q(t){var one=false,o={};['eq','neq','in','order','limit','not','is','or','gte','lte','gt','lt','filter','range','ilike','like','contains','overlaps','match','abortSignal','returns','insert','update','upsert','delete','head','csv'].forEach(function(k){o[k]=function(){return o;};});o.select=function(){return o;};o.single=function(){one=true;return o;};o.maybeSingle=function(){one=true;return o;};o.then=function(r,j){return Promise.resolve({data:one?${JSON.stringify(m)}:[],error:null,count:0}).then(r,j);};return o;}return{auth:{getSession:async function(){return {data:{session:{user:{id:'u1'},access_token:'t'}}};},getUser:async function(){return {data:{user:{id:'u1'}}};},signOut:async function(){return {};},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}};}},from:q,rpc:function(){return q('');},storage:{from:function(){return{download:async function(){return{data:null,error:'s'};},createSignedUrl:async function(){return{data:null,error:'s'};}};}},functions:{invoke:async function(){return{data:null,error:'s'};}}};}};`;

const AUDIT = () => {
  // every class token actually on an element
  const present = new Set();
  document.querySelectorAll('[class]').forEach(el => {
    (el.getAttribute('class')||'').split(/\s+/).forEach(c => { if (c) present.add(c); });
  });
  // every class token named in any selector, walking nested rules too
  const mentioned = new Set();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.selectorText) {
        const m = r.selectorText.match(/\.(-?[_a-zA-Z][\w-]*)/g) || [];
        m.forEach(x => mentioned.add(x.slice(1)));
      }
      if (r.cssRules) walk(r.cssRules);
    }
  };
  let sheetsRead = 0; const blocked = [];
  for (const s of document.styleSheets) {
    try { walk(s.cssRules); sheetsRead++; } catch (_e) { blocked.push(s.href || '(inline)'); }
  }
  const sheetsBlocked = blocked.length;
  const unresolved = [...present].filter(c => !mentioned.has(c)).sort();
  // Evidence for each: what carries it, and whether it is styled inline instead.
  const unresolvedDetail = unresolved.map(c => {
    const els = [...document.querySelectorAll('.' + CSS.escape(c))];
    const e = els[0];
    return { cls: c, count: els.length,
      tag: e ? e.tagName.toLowerCase() : null,
      inlineStyle: e ? (e.getAttribute('style') || null) : null,
      otherClasses: e ? (e.getAttribute('class')||'').split(/\s+/).filter(x=>x&&x!==c) : [],
      text: e ? (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,44) : null };
  });

  // duplicate ids
  const counts = {};
  document.querySelectorAll('[id]').forEach(e => { counts[e.id] = (counts[e.id]||0)+1; });
  const duplicates = Object.keys(counts).filter(k => counts[k] > 1).sort()
    .map(k => ({ id: k, n: counts[k] }));

  // ids scripts look up that are not in the document
  const refs = new Set();
  const src = [...document.querySelectorAll('script')].map(s => s.textContent || '').join('\n');
  for (const m of src.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)) refs.add(m[1]);
  for (const m of src.matchAll(/querySelector\(\s*['"]#([A-Za-z0-9_-]+)['"]\s*\)/g)) refs.add(m[1]);
  // A reference to an id that is absent right now is usually a node built later.
  // The real defect is a reference to an id that nothing anywhere ever creates.
  const whole = document.documentElement.outerHTML;
  const creates = (id) => new RegExp('id\\s*=\\s*[\'"\\\\]*' + id + '[\'"\\\\]|\\.id\\s*=\\s*[\'"]' + id + '[\'"]').test(whole);
  const absent = [...refs].filter(id => !document.getElementById(id));
  const dangling = absent.filter(id => !creates(id)).sort();
  const builtLater = absent.length - dangling.length;

  return {
    shell: { hasApp: !!document.getElementById('app'), hasTopbar: !!document.querySelector('.topbar') },
    elements: document.querySelectorAll('*').length,
    classTokensPresent: present.size,
    sheetsRead, sheetsBlocked, blocked,
    unresolved, unresolvedDetail, duplicates,
    idsRefBySrc: refs.size, absentAtLoad: absent.length, builtLater, dangling,
  };
};

(async () => {
  const srv = http.createServer((rq,rs)=>{const f=path.join(root,decodeURIComponent(rq.url.split('?')[0]).replace(/^\//,''));
    if(!f.startsWith(root)||!fs.existsSync(f)){rs.writeHead(404);return rs.end();}
    rs.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});rs.end(fs.readFileSync(f));}).listen(8961);
  const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  fs.mkdirSync(path.join(root,'.audit'),{recursive:true});
  const out = {};
  for (const build of ['hub_payload.html','hub_next.html']) {
    for (const role of ['agent','broker']) {
      const label = build.replace('.html','') + ' as ' + role;
      const M = {user_id:'u1',full_name:'X',role,status:'active',is_tc:false};
      let html = dedupeGlobals(read(build));
      html = inject(html,'<!--TX_SLOT-->', dedupeGlobals(read('tx_module.html')));
      if (role==='broker') html = inject(html,'<!--BROKER_SLOT-->', dedupeGlobals(read('broker_module.html')));
      html = inject(html,'<!--ICA_GATE_SLOT-->', GATE);
      const f = path.join(root,'.audit', build.replace('.html','')+'-'+role+'.html');
      fs.writeFileSync(f, html);
      const bytes = Buffer.byteLength(html,'utf8');
      const p = await b.newPage({viewport:{width:1400,height:1000}});
      const errs = [];
      p.on('pageerror', e => errs.push(e.message.slice(0,160)));
      await p.route('**/vendor/supabase-js-*.js', r => r.fulfill({contentType:'application/javascript', body: stub(M)}));
      await p.route('**/functions/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"transactions":[],"posts":[]}'}));
      await p.route('**/aaritransactions.com/**', r => r.abort());
      let built = true, why = null;
      try {
        await p.goto('http://127.0.0.1:8961/.audit/'+path.basename(f), {waitUntil:'load', timeout:45000});
        await p.waitForTimeout(3000);
      } catch (e) { built = false; why = String(e.message).slice(0,200); }
      const r = built ? await p.evaluate(AUDIT) : null;
      out[label] = { bytes, built, why, pageErrors: errs, ...(r||{}) };
      await p.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
})();
