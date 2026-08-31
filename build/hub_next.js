// Builds hub_next.html, the standalone replacement portal, from three parts:
//
//   build/hub_next.head.html   document wrapper + sign in gate
//   mockups/dashboard-v6.src.html   the approved design, unchanged
//   build/hub_next.auth.html   the Supabase session layer
//
//   node build/hub_next.js  ->  hub_next.html
//
// The three image placeholders are inlined the same way mockups/build.js does
// it, with one difference: the headshot is downscaled and re-encoded as JPEG
// first. At full size it is 2.1MB, which as base64 would put the page over
// 3MB before a single row of data loads. That is not a page an agent should
// have to open on a phone every morning.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const head = read('build/hub_next.head.html');
const body = read('mockups/dashboard-v6.src.html');
const auth = read('build/hub_next.auth.html');

for (const token of ['__MP_PHOTO__', '__AARI_LOGO__', '__AARI_MARK__']) {
  if (!body.includes(token)) throw new Error(token + ' placeholder missing from the design source');
}

// Downscale + JPEG the headshot. Pillow is the only image tool in the
// container, so this shells out rather than pulling in a node dependency.
const tmp = path.join(require('os').tmpdir(), 'hub_next_headshot.jpg');
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open("${path.join(root, 'assets/headshots/marlenyi.png')}").convert("RGB")
im.thumbnail((520, 700), Image.LANCZOS)
im.save("${tmp}", "JPEG", quality=82, optimize=True, progressive=True)
`]);

const photo = 'data:image/jpeg;base64,' + fs.readFileSync(tmp).toString('base64');
const logo  = 'data:image/png;base64,'  + fs.readFileSync(path.join(root, 'logo.png')).toString('base64');
const mark  = 'data:image/png;base64,'  + fs.readFileSync(path.join(root, 'assets/logo-mark.png')).toString('base64');

// Strip the hardcoded contact rows and inject the live data layer in their
// place. DBP keeps its identity as an array the design already closes over;
// it just starts empty and is filled from Supabase after sign in.
const db = read('build/hub_next.db.js') + '\n' + read('build/hub_next.today.js') + '\n' + read('build/hub_next.tx.js') + '\n' + read('build/hub_next.team.js');

const lines = body.split('\n');
let s = null;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('var DBP=[')) { s = i; break; }
}
if (s === null) throw new Error('var DBP=[ not found in the design source');
let depth = 0, e = null;
for (let i = s; i < lines.length; i++) {
  depth += (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length;
  if (depth === 0 && i > s) { e = i; break; }
}
if (e === null) throw new Error('var DBP=[ never closes');
// Empty a hardcoded data literal in place, keeping the binding the design
// closes over. Returns how many lines were dropped.
function blankLiteral(lines, name, empty) {
  let s = null;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^\\s*var ' + name + '\\s*=').test(lines[i])) { s = i; break; }
  }
  if (s === null) throw new Error('literal not found: ' + name);
  let depth = 0, e = s;
  const count = (l, a, b) => (l.match(a) || []).length - (l.match(b) || []).length;
  depth = count(lines[s], /\[/g, /\]/g) + count(lines[s], /\{/g, /\}/g);
  if (depth > 0) {
    for (let i = s + 1; i < lines.length; i++) {
      depth += count(lines[i], /\[/g, /\]/g) + count(lines[i], /\{/g, /\}/g);
      if (depth <= 0) { e = i; break; }
    }
  }
  const dropped = e - s + 1;
  lines.splice(s, dropped, '  var ' + name + ' = ' + empty + ';  // emptied: not wired yet');
  return dropped;
}
const stripped = e - s - 1;
lines.splice(s, e - s + 1, '  var DBP=[];  // filled from agent_contacts after sign in');
console.log('stripped ' + stripped + ' hardcoded contact rows from DBP');

// The data layer goes inside the design's IIFE so it shares scope with DBP
// and render(). The IIFE closes on the last '})();' in the file.
let close = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '})();') { close = i; break; }
}
if (close < 0) throw new Error('could not find the closing })(); of the design IIFE');
lines.splice(close, 0, db);
// Everything below is frozen 18 August data on a screen that is not wired.
// Blanking the literal removes the data; the coming soon override below
// removes the empty shell it would otherwise leave behind.
const BLANK = [
  ['DBCONTACT', '{}'],   // refilled from agent_contacts by the data layer
  ['DBDEALS', '{}'], ['DBPAST', '[]'], ['DBREF', '{}'],
  ['DBPROPVAL', '{}'], ['DBUNSOURCED', '[]'],
  ['TX_ACTIVE', '[]'], ['TX_TERMINATED', '[]'], ['CLOSED', '[]'],
  ['LISTINGS', '[]'], ['ROSTER', '[]'], ['SEATS', '[]'], ['TEAM', '[]'],
  ['ANNIV', '[]'], ['CAL_EVENTS', '[]'], ['ANN', '[]'],
  ['ANNROWS', '[]'], ['CLASS_ITEMS', '[]'],
  // Client home addresses with coordinates, household pairings, and the
  // monthly commission table. All real people, none of it wired.
  ['PB', '[]'], ['DBDUPS', '[]'], ['DBHH', '[]'], ['MONTHS', '{}'],
  ['TXQ', '[]'], ['TXQ0', '[]'],
  // Her real 2026 goal row and her real earned figure, as bare integers that
  // only become money at render time via toLocaleString. Every agent would
  // have seen HER numbers on their own cover.
  ['GOAL', "{ broker:{target:0, done:0, set:false}, agent:{target:0, earned:0, set:false} }"],
  ['GE0', "{income_target:0,avg_price:0,commission_pct:0,split_pct:0}"]
];
let blanked = 0;
for (const [name, empty] of BLANK) blanked += blankLiteral(lines, name, empty);
console.log('emptied ' + BLANK.length + ' hardcoded literals, ' + blanked + ' lines');

// Replace an unwired page function's body outright. Overriding it at runtime
// stops it drawing, but leaves every address and figure in its markup sitting
// in the file where anyone who can fetch the file can read them. This removes
// the body instead. Returns lines dropped.
function stubPage(lines, name, title, line) {
  let s = null;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^\\s*function ' + name + '\\s*\\(').test(lines[i])) { s = i; break; }
  }
  if (s === null) return 0;
  let depth = 0, e = null, started = false;
  for (let i = s; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (!started && /\{/.test(l)) started = true;
    if (started && depth <= 0) { e = i; break; }
  }
  if (e === null) return 0;
  const dropped = e - s + 1;
  lines.splice(s, dropped,
    '  function ' + name + '(){  // not wired yet, body removed at build time',
    '    return __soonCard(' + JSON.stringify(title) + ', ' + JSON.stringify(line) + ');',
    '  }');
  return dropped - 3;
}

// The coming soon card helper has to exist before the stubs reference it.
const soonHelper = read('build/hub_next.soon.js');

const SOON = JSON.parse(read('build/hub_next.soon.json'));
let stubbedLines = 0, stubbed = 0;
for (const [fn, title, line] of SOON) {
  const n = stubPage(lines, fn, title, line);
  if (n > 0) { stubbedLines += n; stubbed++; }
}
console.log('stubbed ' + stubbed + ' unwired page functions, ' + stubbedLines + ' lines of markup removed');

const comingSoon = soonHelper;
let close2 = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '})();') { close2 = i; break; }
}
lines.splice(close2, 0, comingSoon);

// Real figures, addresses and personal emails survive in two places: source
// comments, which never render, and string literals on screens that are still
// drawing. Comments keep their sentence with the value redacted, so the
// reasoning survives. Rendered strings get an honest placeholder instead of a
// number the Hub cannot stand behind.
const MONEY = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g;
const ADDR  = /\b\d{2,6}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z.]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Way|Ter|Terrace|Pl|Place)\b(?:\s+[EWNS]\b)?(?:,\s*[A-Z][A-Za-z ]+(?:,\s*FL\s*\d{5})?)?/g;
const MAIL  = /\b[A-Za-z0-9._%+-]+@(?!aarirealty\.com|joinaari\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Skip the reviewed resource directory: public agency and vendor support lines.
let rzStart = -1, rzEnd = -1;
for (let i = 0; i < lines.length; i++) if (/^\s*var RZ\s*=/.test(lines[i])) { rzStart = i; break; }
if (rzStart >= 0) {
  let d = 0;
  for (let i = rzStart; i < lines.length; i++) {
    d += (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length;
    if (d <= 0 && i > rzStart) { rzEnd = i; break; }
  }
}

let inBlock = false, redacted = 0, neutralised = 0;
for (let i = 0; i < lines.length; i++) {
  if (rzStart >= 0 && i >= rzStart && i <= rzEnd) continue;
  const l = lines[i];
  if (l.length > 400) continue;
  const opens = /\/\*/.test(l), closes = /\*\//.test(l);
  const isComment = inBlock || opens || /^\s*(\/\/|\*)/.test(l);
  if (opens && !closes) inBlock = true;
  if (closes) inBlock = false;

  let out = l;
  if (isComment) {
    out = out.replace(MONEY, '[figure]').replace(ADDR, '[address]').replace(MAIL, '[email]');
    if (out !== l) redacted++;
  } else {
    out = out.replace(MONEY, '&middot;').replace(ADDR, 'Not connected yet').replace(MAIL, '');
    // Money without a dollar sign. Bare integers on money-shaped keys and in
    // count attributes only become figures at render time, so the patterns
    // above never saw them. Zeroed rather than removed, so arithmetic that
    // reads them still works and simply reports nothing.
    out = out.replace(/\b(target|earned|income_target|avg_price|gci|volume|amount|price|fee_amount|commission|net|gross|outstanding)(\s*:\s*)\d{3,}/g, '$1$20');
    out = out.replace(/(data-(?:count|money)\s*=\s*")\d{3,}(")/g, '$10$2');
    if (out !== l) neutralised++;
  }
  lines[i] = out;
}
console.log('redacted ' + redacted + ' comment lines, neutralised ' + neutralised + ' rendered lines');

// The note under the tier rows is a paragraph of frozen counts wrapped in
// prose: "204 clients and 3 vendors ... eight working days ... thirteen
// weeks". Rewritten to read from the same computed figures as the card above
// it, so it cannot drift from the numbers sitting directly over it.
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('204 clients and 3 vendors')) {
    lines[i] = "          :'<div class=\"note\">'+DBN.clients+' client'+(DBN.clients===1?'':'s')+' and '+DBN.vendors+' vendor'+(DBN.vendors===1?'':'s')+'. '+" +
               "(DBN.hh? DBN.hh+' household'+(DBN.hh===1?' holds ':'s hold ')+DBN.hhrows+' of those rows, so the book is ':'The book is ')+";
    // The sentence runs on for two more lines of frozen arithmetic: how many
    // are inside cadence, how many working days to clear tier A, how many
    // weeks for the book. Replace the whole tail with the one figure that is
    // actually known.
    for (let j = i + 1; j < i + 4 && j < lines.length; j++) {
      if (lines[j].includes('inside their cadence')) {
        lines[j] = "           DBN.total+' people. '+DBN.ok+' of them '+(DBN.ok===1?'is':'are')+' currently inside their cadence.</div>')+";
      } else if (lines[j].includes('working days')) {
        lines[j] = "           ''+";
      }
    }
  }
}

// pageInventory held its listings as a local array of seven. It reads the
// live LISTINGS array now, which __txLoad fills from realty_listings, and the
// chip counts them instead of asserting seven.
for (let i = 0; i < lines.length; i++) {
  if (/^\s*function pageInventory\(/.test(lines[i])) {
    let d = 0, started = false, e = i;
    for (let j = i; j < lines.length; j++) {
      d += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
      if (!started && /\{/.test(lines[j])) started = true;
      if (started && d <= 0) { e = j; break; }
    }
    lines.splice(i, e - i + 1,
      "  function pageInventory(){",
      "    var L = LISTINGS.slice();",
      "    var total = L.reduce(function(a,x){ return a + (Number(x[3])||0); }, 0);",
      "    return bcard('1/1/2/5','Agent Inventory',",
      "      '<span class=\"chip gh\">'+L.length+' live'+(total?' &middot; '+money0(total):'')+'</span>',",
      "      L.length",
      "        ? table(['Agent','Property','List price','Showings'],",
      "            L.map(function(x){ return td([nm(x[1],''), x[0],",
      "              (x[3]==null?'&middot;':money0(x[3])),",
      "              '<span class=\"chip'+((Number(x[4])||0)===0?' red':'')+'\">'+(Number(x[4])||0)+'</span>']); }))",
      "        : '<div class=\"pbempty\">No listings in realty_listings.</div>',",
      "      L.length ? 'Live from realty_listings. Showings come from the showings column; a red nought means nobody has logged one.' : '');",
      "  }");
    console.log('pageInventory rewritten to read LISTINGS');
    break;
  }
}

// Four screens that held their data inline, rewritten to read what the data
// layer loads. Same approach as pageInventory: the markup keeps its shape,
// the numbers stop being frozen. A missing figure prints a middle dot.
function replaceFn(lines, name, bodyLines) {
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^\\s*function ' + name + '\\(').test(lines[i])) {
      let d = 0, started = false, e = i;
      for (let j = i; j < lines.length; j++) {
        d += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
        if (!started && /\{/.test(lines[j])) started = true;
        if (started && d <= 0) { e = j; break; }
      }
      lines.splice(i, e - i + 1, ...bodyLines);
      console.log(name + ' rewritten to read live data');
      return true;
    }
  }
  return false;
}

replaceFn(lines, 'pageRoster', [
  "  function pageRoster(){",
  "    return bcard('1/1/2/5','Roster','<span class=\"chip gh\">'+ROSTER.length+' member'+(ROSTER.length===1?'':'s')+'</span>',",
  "      ROSTER.length",
  "        ? table(['Name','Role','Plan','Closed','GCI','Last seen'],",
  "            ROSTER.map(function(r){ return td([nm(r[0],''), r[1], r[2], String(r[4]),",
  "              (r[5]==null?'&middot;':money0(r[5])),",
  "              r[8] ? '<span class=\"chip red\">never signed in</span>' : r[6]]); }))",
  "        : '<div class=\"pbempty\">No members in realty_members.</div>',",
  "      'Live from realty_members. Closed count and GCI come from realty_transactions; a dot means the file carries no commission figure.'+__tmRosterNote());",
  "  }"
]);

replaceFn(lines, 'pageProduction', [
  "  function pageProduction(){",
  "    var rows = ROSTER.slice().filter(function(r){ return r[4] > 0 || r[5] != null; })",
  "                     .sort(function(a,b){ return (b[5]||0)-(a[5]||0); });",
  "    var files = ROSTER.reduce(function(a,r){ return a + (r[4]||0); }, 0);",
  "    return bcard('1/1/2/5','Production','<span class=\"chip gh\">'+files+' closed file'+(files===1?'':'s')+'</span>',",
  "      rows.length",
  "        ? table(['Agent','Closed','GCI'],",
  "            rows.map(function(r){ return td([nm(r[0],''), String(r[4]),",
  "              (r[5]==null?'&middot;':money0(r[5]))]); }))",
  "        : '<div class=\"pbempty\">Nobody has a closed file yet.</div>',",
  "      'Closed files per agent, live from realty_transactions. net_commission is null on every row today, so GCI falls back to gross_commission and shows a dot where neither is set.');",
  "  }"
]);

replaceFn(lines, 'pageRevenue', [
  "  function pageRevenue(){",
  "    var monthly = __tmMonthlyCost();",
  "    return bcard('1/1/2/3','Revenue and fees',",
  "      '<span class=\"chip'+(monthly?' red':'')+'\">'+(monthly==null?'&middot;':money0(monthly)+' / mo')+'</span>',",
  "      __tmExpenses.length",
  "        ? table(['What','Category','Amount','How often'],",
  "            __tmExpenses.map(function(e){ return td([e.label||'&middot;', e.category||'&middot;',",
  "              (e.amount==null?'&middot;':money0(e.amount)), e.frequency||'&middot;']); }))",
  "        : '<div class=\"pbempty\">Nothing active in realty_expenses.</div>',",
  "      __tmExpenses.length+' active row'+(__tmExpenses.length===1?'':'s')+' in realty_expenses, normalised to a monthly figure. Quarterly divided by three, annual by twelve.'+__tmPlanNote());",
  "  }"
]);

// pageOnboarding asserted "10 items" and named its two categories in frozen
// prose. The moment a category or an item is added the screen lies, and the
// broker has no way to tell. It reads the same arrays pageClasses does, plus
// realty_training_completions, so the count is whatever the tables say.
// pageAsk's sidebar asserts "10 items, 0 done" for the training library.
// Adding an onboarding phase makes that wrong the moment it is written, so
// this one figure is made live. The rest of that card is frozen prose from
// an earlier snapshot and is left as it is: it is not this change's to fix.
lines.forEach(function(l, i){
  lines[i] = l.replace(
    "sr('Training library','chip red','10 items, 0 done')",
    "sr('Training library', __tmTraining.length?'chip gh':'chip red', "
    + "(__tmTraining.length||'no')+' item'+(__tmTraining.length===1?'':'s')+', '"
    + "+(__tmDone.length||'0')+' done')");
});

replaceFn(lines, 'pageOnboarding', [
  "  function pageOnboarding(){",
  "    var total = __tmTraining.length;",
  "    var req   = __tmTraining.filter(function(t){ return t.required; }).length;",
  "    var doneP = {};",
  "    __tmDone.forEach(function(d){ (doneP[d.user_id] = doneP[d.user_id] || {})[d.item_id] = 1; });",
  "    var people = Object.keys(doneP).length;",
  "    var rows = __tmCats.map(function(c){",
  "      var items = __tmTraining.filter(function(t){ return t.category_id === c.id; });",
  "      var r     = items.filter(function(t){ return t.required; }).length;",
  "      return sr(c.name || 'Uncategorised',",
  "        items.length ? 'chip gh' : 'chip red',",
  "        items.length ? items.length + ' item' + (items.length===1?'':'s') + (r ? ', ' + r + ' required' : '') : 'empty');",
  "    }).join('');",
  "    return bcard('1/1/2/3','Onboarding',",
  "      (people ? '<span class=\"chip gh\">' + people + ' started</span>'",
  "              : '<span class=\"chip red\">nobody yet</span>'),",
  "      (people",
  "        ? '<div class=\"fill\">' + __tmMembers.filter(function(m){ return doneP[m.user_id]; }).map(function(m){",
  "            var n = Object.keys(doneP[m.user_id]).length;",
  "            return sr(m.full_name || 'Unnamed', 'chip gh', n + ' of ' + total);",
  "          }).join('') + '</div>'",
  "        : empty('realty_training_completions has no rows','No agent has ever been marked through a step.')),",
  "      'Live from realty_training_completions. A member with no completions is not listed rather than shown as a zero.') +",
  "    bcard('1/3/2/5','The checklist behind it',",
  "      '<span class=\"chip gh\">' + total + ' item' + (total===1?'':'s') + '</span>',",
  "      '<div class=\"fill\">' + (rows || '<div class=\"pbempty\">No categories in realty_training_categories.</div>') + '</div>',",
  "      'Live from realty_training_categories and realty_training_items, ' + req + ' required across ' + __tmCats.length + ' categor' + (__tmCats.length===1?'y':'ies') + '. An empty category is content nobody has written yet, not a step nobody has taken.');",
  "  }"
]);

replaceFn(lines, 'pageClasses', [
  "  function pageClasses(){",
  "    var req = __tmTraining.filter(function(t){ return t.required; }).length;",
  "    var byCat = __tmCats.map(function(c){",
  "      var items = __tmTraining.filter(function(t){ return t.category_id === c.id; });",
  "      return '<div class=\"txlab\">'+(c.name||'Uncategorised')+' &middot; '+items.length+'</div>'+",
  "        (items.length ? items.map(function(t){",
  "          return '<div class=\"tdq\"><div><b>'+(t.title||'Untitled')+'</b>'+",
  "            (t.required?' <span class=\"chip red\">required</span>':'')+'</div>'+",
  "            '<div class=\"rfoot\">'+(t.description||'')+'</div></div>'; }).join('')",
  "         : '<div class=\"pbempty\">Nothing in this category.</div>');",
  "    }).join('');",
  "    return '<div class=\"card wide anim\"><div class=\"ch\"><h2>Classes</h2>'+",
  "      '<span class=\"chip gh\">'+__tmTraining.length+' item'+(__tmTraining.length===1?'':'s')+'</span></div>'+",
  "      (__tmTraining.length ? byCat : '<div class=\"pbempty\">Nothing in realty_training_items.</div>')+",
  "      '<div class=\"pbnote\">Live from realty_training_items across '+__tmCats.length+' categor'+(__tmCats.length===1?'y':'ies')+', '+req+' required. Completions are not tracked on this screen yet.</div></div>';",
  "  }"
]);

// pageTeam and pageAnn read ROSTER and ANNROWS, but each also carried a
// frozen leaderboard and hardcoded commentary naming real agents and posts.
// Rendering them showed live and 18 August content side by side. The tables
// stay, driven by the arrays; the frozen commentary goes.
replaceFn(lines, 'pageTeam', [
  "  function pageTeam(){",
  "    var ranked = ROSTER.slice().sort(function(a,b){ return (b[5]||0)-(a[5]||0); });",
  "    var top = ranked[0] && ranked[0][5] ? ranked[0][5] : 0;",
  "    return bcard('1/1/2/5','Team','<span class=\"chip gh\">'+ROSTER.length+' member'+(ROSTER.length===1?'':'s')+'</span>',",
  "      ranked.length",
  "        ? ranked.map(function(r){",
  "            var pct = top ? Math.round(((r[5]||0)/top)*100) : 0;",
  "            return lr(r[0], r[4]+' file'+(r[4]===1?'':'s'), pct, (r[5]==null?'&middot;':money0(r[5])));",
  "          }).join('')",
  "        : '<div class=\"pbempty\">No members in realty_members.</div>',",
  "      'Live from realty_members, with closed files and GCI from realty_transactions. The bar is each agent against the top earner. A dot means the file carries no commission figure.');",
  "  }"
]);

replaceFn(lines, 'pageAnn', [
  "  function pageAnn(){",
  "    var needAck = ANNROWS.filter(function(a){ return a[2] && a[5] === 0; }).length;",
  "    return bcard('1/1/2/5','Announcements',",
  "      '<span class=\"chip'+(needAck?' red':' gh')+'\">'+ANNROWS.length+' post'+(ANNROWS.length===1?'':'s')+(needAck?' &middot; '+needAck+' unacknowledged':'')+'</span>',",
  "      ANNROWS.length",
  "        ? table(['Post','Urgency','Posted','Read','Acknowledged'],",
  "            ANNROWS.map(function(a){ return td([a[0],",
  "              '<span class=\"chip'+(a[1]==='urgent'?' red':'')+'\">'+a[1]+'</span>',",
  "              a[3], String(a[4]), a[2] ? String(a[5]) : '&middot;']); }))",
  "        : '<div class=\"pbempty\">Nothing posted in realty_announcements.</div>',",
  "      'Live from realty_announcements, with read and acknowledgement counts from realty_announcement_reads. A dot under Acknowledged means the post does not require one.');",
  "  }"
]);

// comingCard crashes when its list is empty: it does soon[0].at with no
// guard, and the anniversary and calendar arrays are blanked because nothing
// is wired to them. That is a hard error on the Dashboard for every agent,
// caused by the blanking rather than by the design. Guarded, keeping the card
// and its shape exactly as they are. It also named a specific person inline.
for (let i = 0; i < lines.length; i++) {
  if (/^\s*function comingCard\(/.test(lines[i])) {
    lines.splice(i + 1, 0,
      "    // Guard added at build time: the arrays this reads are not wired yet,",
      "    // and the original went straight to soon[0].at with nothing to read.",
      "    if(!comingList().length){",
      "      return '<div class=\"card setcard\" data-card=\"coming\" data-cw=\"1\" style=\"align-self:start\">'+",
      "        '<div class=\"ch\"><div class=\"ct\">What is coming</div></div>'+",
      "        '<div class=\"pbempty\">Anniversaries and renewals are not connected yet.</div></div>';",
      "    }");
    console.log('comingCard guarded against an empty list');
    break;
  }
}

// The same card asserted a named agent's situation inline. Nothing is wired
// to establish it, so it goes rather than being asserted about a real person.
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("n.who==='Odalis Mora'")) {
    lines[i]   = "    var why = 'Nothing has been sent about it yet.';";
    if (lines[i+1] && lines[i+1].includes('no member row')) lines[i+1] = '';
    if (lines[i+2] && lines[i+2].includes("Nothing has been sent about it yet.")) lines[i+2] = '';
    console.log('removed the named assertion from comingCard');
    break;
  }
}

// The calendar was pinned to August 2026. CAL_TODAY falls back to 18 unless
// the month happens to be August 2026, and every date calculation builds
// new Date(2026, 7, CAL_TODAY). From 1 September the Hub would quietly
// believe it is 18 August: wrong day on the cover, wrong week, wrong
// days-quiet arithmetic, and nothing to say so. Made real.
{
  let dateFixes = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 400) continue;
    const before = lines[i];
    lines[i] = lines[i]
      .replace(/var CAL_TODAY=\(CAL_NOW\.getMonth\(\)===7&&CAL_NOW\.getFullYear\(\)===2026\)\?CAL_NOW\.getDate\(\):18;/,
               'var CAL_TODAY=CAL_NOW.getDate();  // the real day, always')
      .replace(/new Date\(2026,\s*7,\s*CAL_TODAY\)/g,
               'new Date(CAL_NOW.getFullYear(),CAL_NOW.getMonth(),CAL_TODAY)')
      .replace(/new Date\(2026,\s*7,\s*/g,
               'new Date(CAL_NOW.getFullYear(),CAL_NOW.getMonth(),');
    if (lines[i] !== before) dateFixes++;
  }
  // The cover printed the month as a literal.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("' '+CAL_TODAY+' August'")) {
      lines[i] = lines[i].replace("' '+CAL_TODAY+' August'",
        "' '+CAL_TODAY+' '+['January','February','March','April','May','June','July','August','September','October','November','December'][CAL_NOW.getMonth()]");
      dateFixes++;
    }
  }
  console.log('date pinning removed from ' + dateFixes + ' lines');
}

// A real client address used as a form placeholder.
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('id="tx-addr"')) {
    lines[i] = lines[i].replace(/placeholder="[^"]*"/, 'placeholder="Street, city, state ZIP"');
  }
}

const wired = lines.join('\n');

const out = (head + wired + auth)
  .split('__MP_PHOTO__').join(photo)
  .split('__AARI_LOGO__').join(logo)
  .split('__AARI_MARK__').join(mark);

const dest = path.join(root, 'hub_next.html');
fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + 'KB');
