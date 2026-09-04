/* === Toolbox ==============================================================
   One flat table, realty_toolbox, grouped by category on render.

   A tile with no url is a tool the brokerage has named but not wired up yet.
   It renders greyed and inert with "coming soon" rather than being hidden or,
   worse, rendered as a link that goes nowhere. The broker can see at a glance
   what is still missing, and so can the agent.                              */

var __tbTiles = [], __tbVendors = [], __tbSub = null, __tbEvents = [], __tbPanel = null;
var __tbEventsNote = null;

async function __tbLoad(){
  if(!window.sb) return { ok:false };
  var r = await sb.from('realty_toolbox')
    // route was added to the table and to the rendering but not to this
    // select, so every routed tile arrived with route undefined and fell
    // through to "coming soon". The panels existed and were unreachable.
    .select('id,category,category_sort,title,description,emoji,url,route,file_path,sort,active')
    .eq('active', true)
    .order('category_sort').order('sort');
  if(r.error){ console.error('toolbox', r.error.message); return { ok:false }; }
  __tbTiles = r.data || [];

  /* Only fetched if a tile actually routes there, so a brokerage that removes
     the Vendors tile does not pay for the query. */
  if(__tbTiles.some(function(t){ return t.route === 'vendors'; })){
    var v = await sb.from('realty_vendors')
      .select('id,name,type,phone,email,website,notes,active')
      .eq('active', true).order('type').order('name');
    if(!v.error) __tbVendors = v.data || [];
  }

  /* The classes do not live in Postgres. realty_events is an empty table that
     nothing has ever written to; the real calendar is the shared Google
     calendar "Aari Events & Trainings", which the broker adds to directly and
     which the ics-sync job also feeds from the in-house counsel's calendar.
     The realty-events function reads it with a read-only service account and
     serves the same list to every active member, so this asks that function
     rather than a table that will always come back empty. */
  if(__tbTiles.some(function(t){ return t.route === 'calendar'; })){
    var ev = await sb.functions.invoke('realty-events');
    var payload = (ev && !ev.error && ev.data) ? ev.data : null;
    __tbEvents = (payload && Array.isArray(payload.events)) ? payload.events : [];
    __tbEventsNote = payload ? (payload.note || payload.error || null) : 'unreachable';
  }

  if(__tbTiles.some(function(t){ return t.route === 'subscription'; })){
    var u = await sb.auth.getUser();
    var uid = u && u.data && u.data.user && u.data.user.id;
    if(uid){
      var sres = await sb.from('realty_agent_subscriptions')
        .select('plan_label,fee_amount,frequency,next_due_date,last_paid_date,status,billing_source,notes')
        .eq('agent_id', uid).maybeSingle();
      if(!sres.error) __tbSub = sres.data || null;
    }
  }
  return { ok:true, n:__tbTiles.length };
}

/* Categories in the order the table gives them, each with its tiles. */
function __tbGroups(){
  var seen = {}, out = [];
  __tbTiles.forEach(function(t){
    var k = t.category || 'Other';
    if(!seen[k]){ seen[k] = { name:k, tiles:[] }; out.push(seen[k]); }
    seen[k].tiles.push(t);
  });
  return out;
}

function __tbEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* A url is only ever rendered into href after this returns true. The table
   has a CHECK for the same shape; this is the second gate, because a value
   that reached the row before the constraint existed must not become a
   javascript: link on an agent's screen. */
function __tbSafe(u){
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function __tbTile(t){
  /* Three shapes, not two. An external link is an <a>, an in-hub route is a
     <button>, and a tile with neither is an inert <span> saying so. The
     route list is constrained in the database, so an unknown one cannot
     render as something that looks live and does nothing. */
  if(t.route && __TB_PANELS[t.route]){
    return '<button class="tbcard" type="button" data-tbroute="' + __tbEsc(t.route) + '">' +
      '<span class="tbic">' + __tbEsc(t.emoji || '') + '</span>' +
      '<span class="tbtx"><span class="tbt">' + __tbEsc(t.title) + '</span>' +
      '<span class="tbd">' + __tbEsc(t.description || '') + '</span></span></button>';
  }
  var live = __tbSafe(t.url);
  var body =
    '<span class="tbic">' + __tbEsc(t.emoji || '') + '</span>' +
    '<span class="tbtx"><span class="tbt">' + __tbEsc(t.title) + '</span>' +
    '<span class="tbd">' + __tbEsc(t.description || '') +
      (live ? '' : ' <span class="tbsoon">coming soon</span>') + '</span></span>';
  return live
    ? '<a class="tbcard" href="' + __tbEsc(t.url) + '" target="_blank" rel="noopener noreferrer">' + body + '</a>'
    : '<span class="tbcard off" aria-disabled="true">' + body + '</span>';
}


/* ---- Route panels --------------------------------------------------------
   A routed tile opens one of these in place of the tile grid, with a way
   back. Kept inside the Toolbox rather than added as new tabs: these are
   things an agent reaches from the Toolbox, not places they navigate to.   */

function __tbBack(title){
  return '<div class="ch"><h2>' + __tbEsc(title) + '</h2>' +
    '<button class="tdbtn quiet" type="button" data-tbroute="">&larr; Toolbox</button></div>';
}

function __tbTel(v){
  var d = String(v || '').replace(/\D/g, '');
  if(d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10
    ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6)
    : (v || '');
}

/* Vendors. 60 rows, none with a website, so this is a call-and-email
   directory rather than a set of links. Grouped by type because that is how
   an agent looks: they need an inspector, not a name. */
function __tbPanelVendors(){
  if(!__tbVendors.length){
    return '<div class="card wide anim tbwide">' + __tbBack('Vendors') +
      '<div class="pbempty">Nothing active in realty_vendors.</div></div>';
  }
  var byType = {}, order = [];
  __tbVendors.forEach(function(v){
    var k = v.type || 'Other';
    if(!byType[k]){ byType[k] = []; order.push(k); }
    byType[k].push(v);
  });
  var withSite = __tbVendors.filter(function(v){ return __tbSafe(v.website); }).length;
  return '<div class="card wide anim tbwide">' + __tbBack('Vendors') +
    order.map(function(k){
      return '<div class="tbgrp"><div class="txlab">' + __tbEsc(k) + ' &middot; ' + byType[k].length + '</div>' +
        '<div class="fill">' + byType[k].map(function(v){
          var bits = [];
          if(v.phone) bits.push('<a href="tel:' + __tbEsc(String(v.phone).replace(/[^0-9+]/g,'')) + '">' + __tbEsc(__tbTel(v.phone)) + '</a>');
          if(v.email) bits.push('<a href="mailto:' + __tbEsc(v.email) + '">' + __tbEsc(v.email) + '</a>');
          if(__tbSafe(v.website)) bits.push('<a href="' + __tbEsc(v.website) + '" target="_blank" rel="noopener noreferrer">website</a>');
          return '<div class="tdq"><div><b>' + __tbEsc(v.name) + '</b></div>' +
            '<div class="rfoot">' + (bits.length ? bits.join(' &middot; ') : '&middot;') +
            (v.notes ? '<br>' + __tbEsc(v.notes) : '') + '</div></div>';
        }).join('') + '</div></div>';
    }).join('') +
    '<div class="pbnote">Live from realty_vendors, ' + __tbVendors.length + ' active across ' +
    order.length + ' type' + (order.length === 1 ? '' : 's') + '. ' +
    (withSite ? withSite + ' have a website.' : 'None has a website recorded, so these are phone and email only.') +
    '</div></div>';
}

/* Your fees and E&O. One agent's own row and nothing else: what they pay,
   how often, when it is next due, and whether they are behind. */
function __tbPanelSubscription(){
  var s = __tbSub;
  if(!s){
    return '<div class="card wide anim tbwide">' + __tbBack('Your fees and E&O') +
      '<div class="pbempty">No subscription is recorded for you.</div>' +
      '<div class="pbnote">If you are being billed, the Hub does not know about it. Tell the broker.</div></div>';
  }
  var overdue = String(s.status || '').toLowerCase() === 'overdue';
  var fee = (s.fee_amount == null)
    ? '\u00B7'
    : '$' + Number(s.fee_amount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  return '<div class="card wide anim tbwide">' + __tbBack('Your fees and E&O') +
    (overdue ? '<div class="fill"><div class="tdq" style="border-left:2px solid var(--alert,#B04040);padding-left:10px">' +
       '<div><b>This account is marked overdue</b> <span class="chip red">overdue</span></div>' +
       '<div class="rfoot">Due ' + __tbEsc(s.next_due_date || '\u00B7') +
       '. Speak to the broker: the Hub is not the billing system and the amount here may not be current.</div></div></div>' : '') +
    '<div class="fill">' +
      sr('Your fee', 'chip gh', fee) +
      sr('How often', 'chip gh', __tbEsc(s.frequency || '\u00B7')) +
      sr('Next due', overdue ? 'chip red' : 'chip gh', __tbEsc(s.next_due_date || '\u00B7')) +
      sr('Last paid', s.last_paid_date ? 'chip gh' : 'chip', __tbEsc(s.last_paid_date || '\u00B7')) +
      sr('Status', overdue ? 'chip red' : 'chip gh', __tbEsc(s.status || '\u00B7')) +
      sr('Billed through', 'chip gh', __tbEsc(s.billing_source || '\u00B7')) +
    '</div>' +
    (s.notes ? '<div class="pbnote">' + __tbEsc(s.notes) + '</div>' : '') +
    '<div class="pbnote">Your row only. Fees differ by plan, and this screen does not show anyone else\u2019s. ' +
    'Billing lives in ' + __tbEsc(s.billing_source || 'the billing system') + '; this is a copy, so the invoice wins if they disagree.</div></div>';
}

/* Add me to the Aari roster. The MLS wants the same handful of facts every
   time, so the page hands them over rather than making an agent hunt. */
function __tbPanelRoster(){
  var me = window.__hubMe || {};
  var name = me.full_name || 'your name';
  var lic  = me.license_number || '[your licence number]';
  var body =
    'Hello,\n\n' +
    'Please add me to the Aari Realty LLC roster.\n\n' +
    'Agent: ' + name + '\n' +
    'Licence: ' + lic + '\n' +
    'Brokerage: Aari Realty LLC\n' +
    'Broker of record: Marlenyi L. Paredes, BK3530153\n\n' +
    'Thank you,\n' + name;
  return '<div class="card wide anim tbwide">' + __tbBack('Add me to the Aari roster') +
    '<div class="pbnote">Send this to your MLS or association membership desk. It carries everything they ask for.</div>' +
    '<pre id="tbroster" style="white-space:pre-wrap;font:inherit;background:#f5f4f0;border:1px solid #e5e3dd;' +
    'border-radius:6px;padding:14px;margin:12px 0;overflow-x:auto">' + __tbEsc(body) + '</pre>' +
    '<div class="fill">' +
      sr('Brokerage', 'chip gh', 'Aari Realty LLC') +
      sr('Broker of record', 'chip gh', 'Marlenyi L. Paredes') +
      sr('Broker licence', 'chip gh', 'BK3530153') +
      sr('Your licence', me.license_number ? 'chip gh' : 'chip red',
         me.license_number || 'not on file, add it before you send') +
    '</div>' +
    (me.license_number ? '' :
      '<div class="pbnote">Your licence number is not on your record, so the message above has a gap in it. ' +
      'Tell the broker your number and it will fill in.</div>') +
    '</div>';
}


/* The prompt cheat sheet. A one-screen reference an agent opens from the
   Toolbox and can print to PDF.

   Deliberately NOT a sheet about "our AI": the Hub has no assistant, and the
   material one could answer from is about 14KB. This teaches an agent to
   prompt whatever tool they already use, and spends most of its space on the
   Florida limits, which is the part a brokerage can actually add and the part
   that protects the broker's licence.

   Own mnemonic rather than a borrowed one, and it spells the brand.        */
function __tbPanelPrompts(){
  function step(letter, head, body){
    return '<div class="tdq"><div><b><span style="' +
      'font-family:Georgia,serif;font-size:17px;line-height:1">' + letter + '</span>' + __tbEsc(head) + '</b></div>' +
      '<div class="rfoot">' + body + '</div></div>';
  }
  function ex(role, line){
    return '<div class="tdq"><div><b>' + __tbEsc(role) + '</b></div>' +
      '<div class="rfoot" style="font-style:italic">' + __tbEsc(line) + '</div></div>';
  }
  return '<div class="card wide anim tbwide" id="tbsheet">' +
    '<div class="ch"><h2>Prompt cheat sheet</h2>' +
      '<button class="tdbtn quiet" type="button" id="tbprint">Print or save as PDF</button>' +
      '<button class="tdbtn quiet" type="button" data-tbroute="">&larr; Toolbox</button></div>' +

    '<div class="pbnote">Every AI writes confident sentences whether or not it knows the answer. ' +
    'These four lines are what turns that into something you can send. Nothing here is Aari software: ' +
    'use it with whichever tool you already have open.</div>' +

    '<div class="txlab" style="margin-top:16px">Start every prompt with four lines</div>' +
    '<pre style="white-space:pre-wrap;font:inherit;background:#f5f4f0;border:1px solid #e5e3dd;' +
    'border-radius:6px;padding:14px;margin:10px 0;overflow-x:auto">' +
    'You are a [ROLE].\nMy task is [ONE THING].\nHere is what you need to know: [THE REAL DETAILS].\n' +
    'Give it back as [FORMAT].</pre>' +

    '<div class="txlab" style="margin-top:18px">Remember it as A A R I</div>' +
    '<div class="fill">' +
      step('A', 'ssign a role', 'Not "help me with a listing". <b>You are a Florida listing agent writing for a first time buyer in Lehigh Acres.</b> The role sets the vocabulary, the reading level and the assumptions.') +
      step('A', 'sk for one thing', 'One prompt, one job. A prompt that asks for a description, a social post and an email gets you three mediocre ones. Run it three times instead.') +
      step('R', 'ules and limits', 'The half everyone skips, and the half that keeps you licensed. See below.') +
      step('I', 'n what form', '"Four bullet points." "Under 200 words." "A table with three columns." "An email with a subject line." If you do not say, you get an essay.') +
    '</div>' +

    '<div class="txlab" style="margin-top:18px">The Florida lines to put in your prompts</div>' +
    '<div class="fill">' +
      step('&middot;', ' Describe the property, never the buyer',
        'Fair housing is about who you describe and who you exclude. Add: <b>describe only the property and its features, never the type of person it would suit, and use no language about family, religion, national origin, disability or neighbourhood character.</b>') +
      step('&middot;', ' Advertising carries the brokerage name',
        'Florida requires the licensed brokerage name on your advertising. Add: <b>include "Aari Realty LLC" in any post, flyer or page.</b> Then check it actually did.') +
      step('&middot;', ' Ask for questions, not legal answers',
        'An AI will answer a Chapter 475 or FR/BAR question confidently and can be wrong. Ask it: <b>list the questions I should take to my broker about this,</b> then bring them to Marlenyi.') +
      step('&middot;', ' Never paste a client\u2019s details in',
        'No names, addresses, phone numbers, contract figures or anything from a closing statement. Describe the situation without identifying anyone.') +
      step('&middot;', ' It does not know your MLS rules',
        'Word limits, remarks fields and what may appear in public remarks are set by your association, not by the model. Trim to fit after, never trust it to know.') +
    '</div>' +

    '<div class="txlab" style="margin-top:18px">Prompts worth stealing</div>' +
    '<div class="fill">' +
      ex('Listing copy', 'You are a Florida listing agent. Write the public remarks for a 3 bed 2 bath in Lehigh Acres. Describe only the property, no language about who would live there, include Aari Realty LLC, under 150 words.') +
      ex('A hard conversation', 'You are a Florida broker. My buyer wants out of an FR/BAR As Is contract after the inspection period ended. Do not tell me what the law says. List the questions I should take to my broker, and what I should have in front of me when I ask.') +
      ex('Following up', 'You are me, a Florida agent, writing to a past client I have not spoken to in eight months. Warm, three sentences, no market statistics, ends with one easy question. No mention of a referral.') +
      ex('Prospecting', 'You are a marketing specialist. Five short posts for first time buyers in Lee County about what closing costs actually are. Each under 120 words, plain language, no jargon, each ends with one question. Include Aari Realty LLC.') +
      ex('Preparing', 'You are a real estate trainer. I have a listing appointment on a vacant lot in Okeechobee tomorrow. Give me the ten questions the seller is most likely to ask and a one line answer to each.') +
    '</div>' +

    '<div class="pbnote" style="margin-top:16px"><b>The rule underneath all of it.</b> ' +
    'Anything an AI tells you about Florida law, your contract or your commission is a draft, not an answer. ' +
    'Chapter 475, the FR/BAR forms and your broker are the sources. The AI is the typist.</div></div>';
}

/* Training calendar. realty_events holds the classes; it is empty today, and
   the calendar on the dashboard is illustrative, which its own footnote says.
   The panel reads whatever is actually scheduled from today forward, and says
   plainly that nothing is when nothing is, rather than showing example dates
   an agent might turn up for. */
function __tbPanelCalendar(){
  var SOURCE = 'These are the classes and events on the Aari Events and Trainings ' +
    'calendar. The broker adds them there and they appear here straight away, ' +
    'there is nothing to refresh. To have them on your own phone or laptop ' +
    'calendar as well, ask the broker to share the calendar with the Google ' +
    'account you use for work.';

  if(!__tbEvents.length){
    return '<div class="card wide anim tbwide">' + __tbBack('Training calendar') +
      '<div class="pbempty">Nothing is scheduled from today onward.</div>' +
      '<div class="pbnote">' + SOURCE +
      (__tbEventsNote ? ' The calendar could not be read just now: ' +
        __tbEsc(String(__tbEventsNote)) + '.' : '') +
      '</div></div>';
  }

  var MON = ['January','February','March','April','May','June','July',
             'August','September','October','November','December'];
  function human(d){
    var p = String(d).split('-');
    return Number(p[2]) + ' ' + MON[Number(p[1]) - 1];
  }
  /* The feed reaches back thirty days so the card can show what has just been,
     but an agent looking at a training list wants what they can still attend. */
  var today = new Date().toISOString().slice(0,10);
  var wk = new Date(); wk.setDate(wk.getDate() + 7);
  var weekEnd = wk.toISOString().slice(0,10);
  var rows = __tbEvents.filter(function(e){ return e.date >= today; })
    .sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  if(!rows.length){
    return '<div class="card wide anim tbwide">' + __tbBack('Training calendar') +
      '<div class="pbempty">Nothing is scheduled from today onward.</div>' +
      '<div class="pbnote">' + SOURCE + '</div></div>';
  }
  var thisWeek = rows.filter(function(e){ return e.date <= weekEnd; }).length;

  return '<div class="card wide anim tbwide">' + __tbBack('Training calendar') +
    '<div class="fill">' + rows.map(function(e){
      var soon = e.date <= weekEnd;
      /* The title carries the source calendar after a middle dot when the
         event arrived by sync. Splitting it keeps the class name readable. */
      var bits = String(e.title || 'Class').split(' \u00B7 ');
      var name = bits.shift();
      var from = bits.join(' \u00B7 ');
      var when = human(e.date) +
        (e.all_day ? '' : (e.time ? ' &middot; ' + __tbEsc(e.time) : '')) +
        (from ? ' &middot; ' + __tbEsc(from) : '');
      var joinable = typeof e.location === 'string' && /^https?:\/\//i.test(e.location);
      return '<div class="tdq"' + (soon ? ' style="border-left:2px solid var(--fill,#000);padding-left:10px"' : '') + '>' +
        '<div><b>' + __tbEsc(name) + '</b>' +
        (e.date === today ? ' <span class="chip red">today</span>' :
         soon ? ' <span class="chip gh">this week</span>' : '') + '</div>' +
        '<div class="rfoot">' + when +
        (joinable ? ' &middot; <a href="' + __tbEsc(e.location) +
          '" target="_blank" rel="noopener noreferrer">Open</a>' : '') +
        '</div></div>';
    }).join('') + '</div>' +
    '<div class="pbnote">' + rows.length + ' scheduled from today, ' +
    thisWeek + ' in the next seven days. ' + SOURCE + '</div></div>';
}

var __TB_PANELS = {
  vendors:      __tbPanelVendors,
  subscription: __tbPanelSubscription,
  roster:       __tbPanelRoster,
  prompts:      __tbPanelPrompts,
  calendar:     __tbPanelCalendar,
  plan:         function(){ return typeof pagePlan === 'function' ? pagePlan() : ''; },
  training:     function(){ return typeof pageClasses === 'function' ? pageClasses() : ''; }
};

/* One delegated listener, attached once. data-tbroute="" goes back. */
function __tbWire(){
  if(window.__tbWired) return;
  window.__tbWired = true;
  document.addEventListener('click', function(e){
    if(e.target.closest && e.target.closest('#tbprint')){ e.preventDefault(); window.print(); return; }
    var b = e.target.closest && e.target.closest('[data-tbroute]');
    if(!b) return;
    var r = b.getAttribute('data-tbroute') || '';
    __tbPanel = (r && __TB_PANELS[r]) ? r : null;
    e.preventDefault();
    if(typeof render === 'function') render();
  });
}

function pageToolbox(){
  __tbWire();
  if(__tbPanel && __TB_PANELS[__tbPanel]) return __TB_PANELS[__tbPanel]();
  var groups = __tbGroups();
  if(!groups.length){
    return '<div class="card wide anim tbwide"><div class="ch"><h2>Toolbox</h2></div>' +
      '<div class="pbempty">Nothing in realty_toolbox yet.</div></div>';
  }
  var wired = __tbTiles.filter(function(t){ return __tbSafe(t.url); }).length;
  return '<div class="card wide anim tbwide"><div class="ch"><h2>Toolbox</h2>' +
    '<span class="chip gh">' + __tbTiles.length + ' tool' + (__tbTiles.length===1?'':'s') + '</span></div>' +
    groups.map(function(g){
      return '<div class="tbgrp"><div class="txlab">' + __tbEsc(g.name) + '</div>' +
        '<div class="tbgrid">' + g.tiles.map(__tbTile).join('') + '</div></div>';
    }).join('') +
    '<div class="pbnote">Live from realty_toolbox. ' + wired + ' of ' + __tbTiles.length +
    ' have a link; the rest are named but not wired up yet and cannot be clicked.</div></div>';
}

/* Broker view of the same table: what is missing, by category. It does not
   duplicate the agent grid, it answers the only question the broker has. */
function pageToolboxAdmin(){
  var groups = __tbGroups();
  var missing = __tbTiles.filter(function(t){ return !__tbSafe(t.url); });
  return '<div class="card wide anim tbwide"><div class="ch"><h2>Manage Toolbox</h2>' +
    (missing.length
      ? '<span class="chip red">' + missing.length + ' without a link</span>'
      : '<span class="chip gh">all wired</span>') + '</div>' +
    (missing.length
      ? '<div class="fill">' + missing.map(function(t){
          return '<div class="tdq"><div><b>' + __tbEsc(t.emoji || '') + ' ' + __tbEsc(t.title) + '</b>' +
            ' <span class="chip red">needs a link</span></div>' +
            '<div class="rfoot">' + __tbEsc(t.category) + ' &middot; ' +
            __tbEsc(t.description || '') + '</div></div>';
        }).join('') + '</div>'
      : '<div class="pbempty">Every tile has a link.</div>') +
    '<div class="pbnote">' + groups.length + ' categor' + (groups.length===1?'y':'ies') + ', ' +
    __tbTiles.length + ' tiles. Add or edit a tile in realty_toolbox: category, ' +
    'category_sort, title, description, emoji, url, sort. A tile with no url shows to agents as ' +
    'coming soon rather than as a dead link.</div></div>';
}
