
/* === Pop-bys, wired ======================================================
   The ranking, the map and the route builder in the design were already
   sound and are left alone. What was frozen was the data underneath: PB held
   a hundred real home addresses as a literal, the weekly target came off one
   person's goal row, deliveries were kept in localStorage, and the score
   pretended every contact was stage New Lead because on 18 August every one
   of those hundred rows happened to be.

   This fills PB from the contacts already loaded for Database, so there is
   one copy of the book rather than two, and writes deliveries to
   agent_activity as type pop_by, the same type the working Hub uses.

   ONE THING IS NOT REVERSIBLE. agent_activity carries an insert policy and a
   select policy and no delete policy, so a delivery can be recorded and
   cannot be unrecorded from here. The design's "Not delivered after all"
   button is therefore gone rather than left there doing nothing, and the
   confirm step exists because of it.                                      */

/* Lee County by city, named rather than derived, because "near me" on this
   screen means the county the brokerage works and not a radius. */
var PBLEE_CITIES = ['Lehigh Acres','Fort Myers','Cape Coral','North Fort Myers',
                    'Bonita Springs','Estero','Fort Myers Beach','Sanibel','Captiva',
                    'Alva','Boca Grande','Buckingham','Matlacha','Pine Island','St. James City'];

/* A pin is a guess when the geocoder fell back to the middle of the town.
   That shows up as several different households landing on one coordinate to
   six decimal places, which does not happen to real street addresses. Two at
   one point is a couple; three is the town centre. */
var PB_CENTRE_MIN = 3;

var __pbRows = [];          // the contact rows behind PB, in PB's order
var __pbIdByName = {};      // display name -> contact id, for the write
var __pbLoggedWeek = {};    // contact id -> date, pop_bys already recorded

function __pbWeekStart(){
  var d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay());          // Sunday, matching pop_by_day 0..6
  return d.toISOString().slice(0,10);
}

function __pbDaysSince(dateStr){
  if(!dateStr) return null;
  var d = new Date(String(dateStr).slice(0,10)+'T00:00:00');
  if(isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime())/86400000);
}

/* PB rows, in the positional shape the design reads:
   [name, tier, street, city, lat, lon, exact, pastClient, noPhone, daysSinceTouch]
   plus stage, carried on the eleventh slot so the score can stop guessing. */
function __pbBuild(){
  var geo = __dbRows.filter(function(r){
    return r.latitude != null && r.longitude != null &&
           r.record_class === 'client' && !r.is_agent && !r.do_not_market;
  });

  // town-centre detection, on the whole geocoded set before any filtering
  var atPoint = {};
  geo.forEach(function(r){
    var k = r.latitude+','+r.longitude;
    atPoint[k] = (atPoint[k]||0) + 1;
  });

  /* Households collapse to one stop: two people at one address is one door.
     The primary carries it when one is marked, otherwise the first by name,
     which is the order the loader already returns. */
  var hhSeen = {}, rows = [];
  geo.forEach(function(r){
    if(r.household_id){
      if(hhSeen[r.household_id]) return;
      hhSeen[r.household_id] = 1;
    }
    rows.push(r);
  });

  var dupNames = {}, collisions = 0;
  rows.forEach(function(r){
    if(dupNames[r.full_name]) collisions++;
    dupNames[r.full_name] = 1;
  });
  if(collisions) console.warn('pop-bys: '+collisions+' contact(s) share a name with another on the '+
    'map. The route keys on the name, so those rows would act as one stop.');

  __pbRows = rows;
  __pbIdByName = {};
  PB.length = 0;
  rows.forEach(function(r){
    __pbIdByName[r.full_name] = r.id;
    var city = [r.city, r.state].filter(Boolean).join(', ');
    var exact = !r.address_needs_review &&
                (atPoint[r.latitude+','+r.longitude] || 0) < PB_CENTRE_MIN;
    PB.push([
      r.full_name,
      r.tier || 'C',
      r.street || r.address_raw || '',
      city,
      Number(r.latitude), Number(r.longitude),
      exact ? 1 : 0,
      (r.stage === 'Closed') ? 1 : 0,
      (r.phone && String(r.phone).trim()) ? 0 : 1,
      __pbDaysSince(r.last_touch),
      r.stage || ''
    ]);
  });

  // Lee membership, rebuilt from the cities actually present
  Object.keys(PBLEE).forEach(function(k){ delete PBLEE[k]; });
  PBLEE_CITIES.forEach(function(c){ PBLEE[c+', FL'] = 1; });

  /* PBHOME stood in for the broker's live position with a fixed pair of
     coordinates. Distances are what orders the list, so on an agent whose
     book is somewhere else entirely that ordering was meaningless. The
     middle of the agent's own book is not their front door either, but it is
     at least theirs, and the note under the list says so. */
  if(rows.length){
    var la = rows.map(function(r){ return Number(r.latitude); }).sort(function(a,b){ return a-b; });
    var lo = rows.map(function(r){ return Number(r.longitude); }).sort(function(a,b){ return a-b; });
    var mid = function(a){ var h = Math.floor(a.length/2);
      return a.length % 2 ? a[h] : (a[h-1]+a[h])/2; };
    var byCity = {};
    rows.forEach(function(r){ if(r.city) byCity[r.city] = (byCity[r.city]||0)+1; });
    var top = Object.keys(byCity).sort(function(a,b){ return byCity[b]-byCity[a]; })[0];
    PBHOME.lat = mid(la); PBHOME.lon = mid(lo);
    PBHOME.l = top ? ('the middle of your book, around '+top) : 'the middle of your book';
  }
}

/* The score, with the stage read rather than assumed. */
function pbScore(c){
  if(c.t === 'D') return -1e9;
  var tw = c.t==='A' ? 60 : c.t==='B' ? 35 : c.t==='C' ? 15 : 0;
  var op;
  if(c.days == null) op = 40;
  else op = Math.min(40, Math.max(0, c.days - pbAllowance(c)) * 2);
  var sp = TD_STAGE_POINTS[c.stage] || 0;
  return tw + op + sp + (c.past?50:0) + (c.nophone?25:0);
};

function pbAll(){
  return PB.map(function(r){
    return { n:r[0], t:r[1], st:r[2], city:r[3], lat:r[4], lon:r[5], exact:!!r[6],
             past:!!r[7], nophone:!!r[8], days:r[9], stage:r[10]||'',
             lee: !!PBLEE[r[3]] };
  });
};

/* The route is a plan for today and lives in this browser, which is the one
   piece of local state on this screen that is not pretending to be a record.
   Deliveries are not: they go to agent_activity and are read back below. */
function pbSave(){
  try{ localStorage.setItem(PBKEY, JSON.stringify({route:pbRoute, seeded:pbSeeded})); }catch(e){}
};

async function __pbLoadDeliveries(){
  var ures = await sb.auth.getUser();
  var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
  if(!uid) return;
  var res = await sb.from('agent_activity')
    .select('contact_id,occurred_on')
    .eq('agent_id', uid).eq('type','pop_by')
    .gte('occurred_on', __pbWeekStart());
  if(res.error){ console.error('pop-by history', res.error); return; }
  __pbLoggedWeek = {};
  var byId = {};
  __pbRows.forEach(function(r){ byId[r.id] = r.full_name; });
  pbDone.length = 0;
  (res.data||[]).forEach(function(a){
    if(!a.contact_id) return;
    __pbLoggedWeek[a.contact_id] = a.occurred_on;
    var name = byId[a.contact_id];
    if(name && pbDone.indexOf(name) < 0) pbDone.push(name);
  });
}

async function __pbLoad(){
  __pbBuild();
  // route out of local storage; deliveries out of the table, always
  try{
    var _pb = JSON.parse(localStorage.getItem(PBKEY)||'{}');
    pbRoute = _pb.route || []; pbSeeded = !!_pb.seeded;
  }catch(e){ pbRoute = []; pbSeeded = false; }
  await __pbLoadDeliveries();
}

async function __pbMarkDelivered(name){
  var id = __pbIdByName[name];
  if(!id) return { error: { message: 'That contact is not on the map any more.' } };
  var ures = await sb.auth.getUser();
  var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
  if(!uid) return { error: { message: 'Your session has expired. Sign in again.' } };
  var today = __dbToday();
  var res = await sb.from('agent_activity').insert({
    agent_id: uid, contact_id: id, type: 'pop_by', occurred_on: today, note: null
  }).select().maybeSingle();
  if(res.error) return res;
  __pbLoggedWeek[id] = today;
  /* A pop-by is a touch. The contact's cadence clock should move with it, the
     same as a logged conversation, or the person stays at the top of the
     ranking the day after the gift was dropped off. */
  try{ await __dbUpdateWithCascade(id, { last_touch: today }); }
  catch(e){ console.error('pop-by last_touch', e); }
  return res;
}

function pagePopby(){
  if(!PB.length){
    /* An empty map with no explanation reads as broken software. It is not:
       it is a book with no coordinates on it, and the fix is an address, not
       a bug report. */
    var withAddr = __dbRows.filter(function(r){ return r.street || r.address_raw; }).length;
    var total = __dbRows.length;
    return '<div class="card wide anim"><div class="ch"><h2>Pop bys</h2></div>'+
      '<div class="pbempty">Nothing on your map yet.</div>'+
      '<p class="note">A stop needs coordinates, and coordinates come from an address. '+
      (total === 0
        ? 'Your database is empty, so there is nothing to place. Add people on the Database screen first.'
        : withAddr === 0
          ? 'None of your '+total+' contacts has a street address on file, so none of them can be placed. '+
            'Add addresses on the Database screen and they will appear here.'
          : withAddr+' of your '+total+' contacts have an address but none of them has been geocoded yet. '+
            'Geocoding is a broker-run job; ask for it and this screen fills in.')+
      '</p></div>';
  }

  pbSeed();
  var route = pbRouteRows(), rest = pbRest(), wk = pbWeekly();
  var deliveredThisWeek = pbDone.length;
  var onMap = route.filter(pbArea_).length + rest.length;
  var apx = rest.concat(route).filter(function(p){ return !p.exact; }).length;
  var sel = pbSel ? pbAll().filter(function(p){ return p.n === pbSel; })[0] : null;
  var rows = (pbTab==='route') ? route : route.filter(pbArea_).concat(rest);
  var counts = {lee:0, out:0};
  pbAll().forEach(function(c){ c.lee ? counts.lee++ : counts.out++; });

  var book = __dbRows.filter(function(r){
    return r.record_class === 'client' && !r.is_agent;
  }).length;
  var noAddress = book - PB.length;
  var m = computeGoalMath(GEV);

  return '<div class="card wide anim">'+
    '<div class="ch"><h2>Pop bys</h2></div>'+
    '<div class="pbhero"><span class="pbbig">'+route.length+'</span> stop'+(route.length===1?'':'s')+
      ' on today\'s route. <em>'+deliveredThisWeek+' of '+wk+' delivered this week.</em></div>'+

    '<div class="uni pbtiers" role="group" aria-label="Tier">'+
      [['all','All'],['A','A'],['B','B'],['C','C']].map(function(t){
        return '<button type="button" data-pbtier="'+t[0]+'"'+(pbTier===t[0]?' class="on" aria-pressed="true"':' aria-pressed="false"')+'>'+t[1]+'</button>';
      }).join('')+'</div>'+
    '<div class="uni pbareas" role="group" aria-label="Where">'+
      [['lee','Lee '+counts.lee],['out','Elsewhere '+counts.out],['all','All '+PB.length]].map(function(t){
        return '<button type="button" data-pbarea="'+t[0]+'"'+(pbArea===t[0]?' class="on" aria-pressed="true"':' aria-pressed="false"')+'>'+t[1]+'</button>';
      }).join('')+'</div>'+

    pbMap()+
    '<div class="pbnote">Every contact with coordinates is on the map. The starred pins are your '+
      'picks for this week, ranked by past client, tier, and how long it has been.</div>'+

    '<div class="pbwarn nomap"><b>Streets are not drawn.</b> The pins are placed from the stored '+
      'coordinates on a plain grid, with no map tiles behind them. Positions are true; distances '+
      'are straight-line rather than driving. Use Directions on a stop for the real route.</div>'+

    (apx? '<div class="pbwarn"><b>'+apx+' of these addresses are pinned to the middle of the town.</b> '+
      'The geocoder could not resolve the street and fell back to the city centre. They are hollow '+
      'on the map and flagged in the list, check before you drive.</div>' : '')+

    '<div class="pbbar'+(sel?' open':'')+'" id="pbbar" aria-live="polite">'+
      (sel? '<div class="pbbarh"><span class="pbbarn">'+sel.n+'</span>'+
          '<button type="button" class="pbx" id="pbclose" aria-label="Close">&times;</button></div>'+
        '<div class="pbbarm">Tier '+sel.t+' &middot; '+sel.st+', '+sel.city+
          (sel.past?' &middot; past client':'')+
          (sel.exact?'':' &middot; <span class="pbapx">approximate pin</span>')+'</div>'+
        '<div class="pbacts">'+
          '<button type="button" class="pbbtn primary" data-pbact="add">'+
            (pbOnRoute(sel.n)?'Take off the route':'Add to route')+'</button>'+
          '<a class="pbbtn" target="_blank" rel="noopener" '+
            'href="https://www.google.com/maps/dir/?api=1&amp;destination='+
            encodeURIComponent(sel.st+', '+sel.city)+'">Directions</a>'+
          '<button type="button" class="pbbtn quiet" data-pbact="open">Open the card</button>'+
          (pbDone.indexOf(sel.n)>=0
            ? '<button type="button" class="pbbtn quiet" disabled>Delivered</button>'
            : '<button type="button" class="pbbtn quiet" data-pbact="done">Mark delivered</button>')+
        '</div>' : '')+
    '</div>'+

    '<div class="seg2 pbtabs" role="group" aria-label="List">'+
      [['near','Near me'],['route','Route']].map(function(t){
        return '<button type="button" data-pbtab="'+t[0]+'"'+(pbTab===t[0]?' class="on" aria-pressed="true"':' aria-pressed="false"')+'>'+
          t[1]+(t[0]==='route'&&route.length?' ('+route.length+')':'')+'</button>';
      }).join('')+'</div>'+

    '<div class="pbhead"><span>'+(pbTab==='route'?'Driving order':'Best first')+'</span>'+
      '<span class="r">'+(pbTab==='route'?route.length+' stop'+(route.length===1?'':'s')
        :onMap+' on the map')+'</span></div>'+

    (rows.length? '<div class="pblist">'+rows.map(pbRow).join('')+'</div>'
      : '<div class="pbempty">Nothing here with these filters.</div>')+

    (route.length? '<div class="pbfoot">'+
      '<span><b>'+route.length+' stop'+(route.length===1?'':'s')+'</b> on today\'s route</span>'+
      '<a class="pbstart" target="_blank" rel="noopener" href="'+pbMapsUrl()+'">Start route</a>'+
      '<button type="button" class="pbclear" id="pbclear">Clear</button></div>':'')+

    '<p class="note">Ranked on tier (A 60, B 35, C 15), plus 40 when nothing has ever been logged '+
      'or two points per day past your cadence, plus the stage, plus 50 for a past client, plus 25 '+
      'when there is no usable phone number. '+
      (m.invalid
        ? '<b>The weekly target is the default of '+wk+'</b>, because your goal is not filled in. '+
          'Set it on the Goal Engine and this number becomes yours.'
        : 'The weekly target is your conversations per week times '+
          Math.round((PBRATIO||0.20)*100)+' percent, which is ceil('+m.weekly+' &times; '+
          (PBRATIO||0.20)+') = '+wk+'.')+
      ' Distance runs from '+PBHOME.l+', not your live position, so it orders the list rather than '+
      'telling you how far you will drive. '+PB.length+' of your '+book+' contacts have coordinates'+
      (noAddress>0 ? '; the other '+noAddress+' have no address on file or are not clients' : '')+'. '+
      '<b>Marking a stop delivered writes to your activity record and cannot be undone here.</b></p>'+
  '</div>';
};

function wirePopby(){
  if(!grid.querySelector('.pbtiers') && !grid.querySelector('.pbempty')) return;
  function repaint(){ grid.innerHTML = pagePopby(); animate(); wirePopby(); }

  [].forEach.call(grid.querySelectorAll('[data-pbtier]'), function(b){
    b.onclick = function(){ pbTier = b.getAttribute('data-pbtier'); pbSel = null; repaint(); }; });
  [].forEach.call(grid.querySelectorAll('[data-pbarea]'), function(b){
    b.onclick = function(){ pbArea = b.getAttribute('data-pbarea'); pbSel = null; repaint(); }; });
  [].forEach.call(grid.querySelectorAll('[data-pbtab]'), function(b){
    b.onclick = function(){ pbTab = b.getAttribute('data-pbtab'); repaint(); }; });

  var pick = function(n){ pbSel = (pbSel===n ? null : n); repaint(); };
  [].forEach.call(grid.querySelectorAll('[data-pbrow]'), function(b){
    b.onclick = function(e){ e.stopPropagation(); pick(b.getAttribute('data-pbrow')); }; });
  [].forEach.call(grid.querySelectorAll('[data-pbpin]'), function(g){
    var n = g.getAttribute('data-pbpin');
    g.onclick = function(){ pick(n); };
    g.onkeydown = function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(n); } };
  });

  var close = document.getElementById('pbclose');
  if(close) close.onclick = function(){ pbSel = null; repaint(); };
  var clr = document.getElementById('pbclear');
  if(clr) clr.onclick = function(){ pbRoute = []; pbSeeded = true; pbSave(); repaint(); };

  [].forEach.call(grid.querySelectorAll('[data-pbact]'), function(b){
    b.onclick = async function(){
      var a = b.getAttribute('data-pbact'), n = pbSel;
      if(!n) return;
      if(a === 'open'){ cxShow(n); return; }
      if(a === 'add'){
        var i = pbRoute.indexOf(n);
        if(i>=0) pbRoute.splice(i,1); else pbRoute.push(n);
        pbSave(); repaint(); return;
      }
      if(a === 'done'){
        if(!window.confirm('Record a pop-by delivered to '+n+' today?\n\nThis goes on your activity '+
                           'record and cannot be undone from the Hub.')) return;
        var label = b.textContent;
        b.disabled = true; b.textContent = 'Recording.';
        var res = await __pbMarkDelivered(n);
        if(res && res.error){
          b.disabled = false; b.textContent = label;
          console.error('pop-by delivered', res.error);
          if(typeof showGoalToast === 'function')
            showGoalToast('Not recorded. '+(res.error.message || 'The database refused the write.'));
          return;
        }
        if(pbDone.indexOf(n) < 0) pbDone.push(n);
        var k = pbRoute.indexOf(n); if(k>=0) pbRoute.splice(k,1);
        pbSel = null; pbSave();
        if(typeof showGoalToast === 'function') showGoalToast('Pop-by recorded.');
        repaint();
      }
    };
  });
};
