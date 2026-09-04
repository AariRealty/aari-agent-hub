/* --- the dashboard calendar, live --------------------------------------------
   CAL_EVENTS was a snapshot of the shared Google calendar taken by hand on 18
   August 2026. Its own comment said so. Anything the broker added after that
   date did not appear on the calendar card or the Today card, which is the one
   thing a calendar has to do.

   The classes are not in Postgres. realty_events is an empty table nothing has
   ever written to. They live in the shared Google calendar "Aari Events &
   Trainings", which the realty-events function reads with a read-only service
   account and serves to every active member. This replaces the snapshot with
   that feed, keeping every field the design already reads, so no card had to
   change shape to receive it.                                                */

/* The month grid matches an event to a cell with e.d === dayOfMonth, so d is a
   day number and nothing else. An event outside the month on screen must not
   collide with a cell: future ones get an ordinal above any real day so that
   "the next event" still sorts correctly, past ones get a negative. */
function __calDayKey(iso, now){
  var p = String(iso).split('-');
  var y = Number(p[0]), m = Number(p[1]) - 1, d = Number(p[2]);
  if(y === now.getFullYear() && m === now.getMonth()) return d;
  var days = Math.round((Date.UTC(y, m, d) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return days > 0 ? 1000 + days : -1000 + days;
}

/* "11:00" reads as 11:00am. The Today card pulls the time back out of the
   subtitle with /(\d{1,2}:\d{2}\s*[ap]m)/i, so the format is not cosmetic. */
function __calTime(t){
  var p = String(t || '').split(':');
  if(p.length < 2) return '';
  var h = Number(p[0]), m = p[1];
  var ap = h >= 12 ? 'pm' : 'am';
  h = h % 12; if(h === 0) h = 12;
  return h + ':' + m + ap;
}

/* A title synced in from a class provider carries the source calendar after a
   middle dot. That is what makes it training rather than something the broker
   put on the company calendar herself. */
function __calSplit(title){
  var bits = String(title || 'Event').split(' · ');
  var name = bits.shift();
  return { name: name, from: bits.join(' · ') };
}

function __calRow(e, now, i){
  var s = __calSplit(e.title);
  var when = e.all_day ? '' : __calTime(e.time);
  var sub = [];
  if(s.from) sub.push(s.from);
  if(when) sub.push(when);
  if(e.all_day) sub.push('All day');
  return {
    i: i,
    d: __calDayKey(e.date, now),
    src: s.from ? 'training' : 'company',
    t: s.name,
    s: sub.join(' &middot; '),
    id: e.id,
    /* The calendar itself is the sharing boundary now: every active member is
       a reader on it in Google, so everything on it is shared by definition.
       The broker's per-event switch still flips in the page, as it always has,
       but it has never been written anywhere and still is not. */
    share: true,
    date: e.date
  };
}

async function __calLoad(){
  if(!window.sb || typeof CAL_EVENTS === 'undefined') return { ok:false };
  var r = await sb.functions.invoke('realty-events');
  if(!r || r.error || !r.data || !Array.isArray(r.data.events)){
    /* Leave the card alone rather than emptying it on a failed call. An empty
       calendar and an unreachable one look identical to an agent, and only one
       of them is true. */
    console.error('calendar load', (r && r.error) || 'no events in the response');
    return { ok:false };
  }
  var now = new Date();
  var rows = r.data.events
    .slice()
    .sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
    .map(function(e, i){ return __calRow(e, now, i); });

  CAL_EVENTS.length = 0;
  rows.forEach(function(x){ CAL_EVENTS.push(x); });
  /* Attendance is keyed by event id and the design seeded it with the ids of
     the snapshot. A live id with no key would break the first person to say
     they are attending. */
  rows.forEach(function(x){ if(x.id && !ATTEND[x.id]) ATTEND[x.id] = []; });
  return { ok:true, n:rows.length };
}

/* --- listing description writer -------------------------------------------
   The Listing description writer tile had nothing behind it. The work was
   already done and unreachable: generate-listing-description has been
   deployed since May, and nothing in this repository calls it. Its prompt
   carries the two things that matter here, the MLS 1200 character cap and
   Fair Housing, and it scrubs phone numbers, emails, urls, gate codes and
   commission language out of both the input and the output.

   This is a form in front of that function and nothing more. It invents no
   figures: an empty field is left out of the request rather than guessed,
   because the function is told not to invent details and a blank that
   arrives as a zero is a detail.                                            */

var __lwBusy = false;

var __LW_TYPES = [
  ['single_family','Single family home'],
  ['condo_villa','Condo or villa'],
  ['multi_family','Multi family, income'],
  ['lot_land','Lot or land'],
  ['rental_long','Long term annual rental'],
  ['rental_short','Short term vacation rental']
];

function __lwField(id, label, hint, attrs){
  return '<label class="lwf"><span class="lwl">' + __tbEsc(label) + '</span>' +
    '<input class="lwi" id="' + id + '" ' + (attrs || '') + '>' +
    (hint ? '<span class="lwh">' + __tbEsc(hint) + '</span>' : '') + '</label>';
}

function __tbPanelListing(){
  var opts = __LW_TYPES.map(function(t){
    return '<option value="' + t[0] + '">' + __tbEsc(t[1]) + '</option>';
  }).join('');

  return '<div class="card wide anim tbwide">' + __tbBack('Listing description writer') +
    '<div class="pbnote" style="margin-bottom:14px">Writes the public remarks for a Florida ' +
    'listing. It is held to the MLS 1200 character cap and to Fair Housing, so it will not ' +
    'write perfect for families, great for retirees, or anything else about who might live ' +
    'there. Phone numbers, emails, web addresses, gate codes and any mention of commission ' +
    'are stripped on the way in and again on the way out. Read it before you paste it: it is ' +
    'a draft, and the listing is yours.</div>' +

    '<div class="lwgrid">' +
      '<label class="lwf"><span class="lwl">Property type</span>' +
        '<select class="lwi" id="lw-type">' + opts + '</select></label>' +
      __lwField('lw-loc','Area','Cape Coral, Lehigh Acres, the street is not needed','maxlength="80"') +
      __lwField('lw-price','List price','','inputmode="numeric" maxlength="12"') +
      __lwField('lw-beds','Bedrooms','','inputmode="numeric" maxlength="4"') +
      __lwField('lw-fbath','Full baths','','inputmode="numeric" maxlength="3"') +
      __lwField('lw-hbath','Half baths','','inputmode="numeric" maxlength="3"') +
      __lwField('lw-sqft','Living area, sq ft','','inputmode="numeric" maxlength="9"') +
      __lwField('lw-year','Year built','','inputmode="numeric" maxlength="4"') +
      __lwField('lw-acres','Lot size, acres','','inputmode="decimal" maxlength="8"') +
    '</div>' +

    '<div class="lwl" style="margin:16px 0 6px">The three things that sell it</div>' +
    '<div class="pbnote" style="margin:0 0 8px">In your own words. Two is the minimum. ' +
    'Write what you would say standing in the driveway.</div>' +
    '<textarea class="lwt" id="lw-s1" rows="2" maxlength="300" placeholder="Gulf access, no bridges"></textarea>' +
    '<textarea class="lwt" id="lw-s2" rows="2" maxlength="300" placeholder="Roof and AC both replaced last year"></textarea>' +
    '<textarea class="lwt" id="lw-s3" rows="2" maxlength="300" placeholder="Screened lanai runs the width of the house"></textarea>' +

    '<div class="lwacts">' +
      '<button class="tdbtn" type="button" data-tbact="lw-go">Write the remarks</button>' +
      '<span class="lwmsg" id="lw-msg"></span>' +
    '</div>' +
    '<div id="lw-out"></div></div>';
}

function __lwNum(id){
  var el = document.getElementById(id);
  if(!el) return null;
  var raw = String(el.value || '').replace(/[^0-9.]/g, '');
  if(!raw) return null;
  var n = Number(raw);
  return isFinite(n) && n > 0 ? n : null;
}
function __lwText(id){
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function __lwPaint(html){
  var out = document.getElementById('lw-out');
  if(out) out.innerHTML = html;
}
function __lwMsg(t){
  var m = document.getElementById('lw-msg');
  if(m) m.textContent = t || '';
}

async function __lwGenerate(){
  if(__lwBusy) return;
  var standouts = [__lwText('lw-s1'), __lwText('lw-s2'), __lwText('lw-s3')]
    .filter(function(s){ return s.length > 0; });
  if(standouts.length < 2){
    __lwMsg('Two of the three, at least.');
    return;
  }

  /* Only fields that were filled in. The function is told not to invent
     details, and a blank arriving as 0 is a detail it would have to use. */
  var basics = {};
  var loc = __lwText('lw-loc'); if(loc) basics.address = loc;
  var map = { list_price:'lw-price', bedrooms:'lw-beds', full_baths:'lw-fbath',
              half_baths:'lw-hbath', living_area_sqft:'lw-sqft',
              year_built:'lw-year', lot_size_acres:'lw-acres' };
  Object.keys(map).forEach(function(k){
    var v = __lwNum(map[k]);
    /* Numbers, not the strings the inputs hand back: the function calls
       toLocaleString on the square footage, which a string does not have. */
    if(v !== null) basics[k] = v;
  });

  var typeEl = document.getElementById('lw-type');
  __lwBusy = true;
  __lwMsg('Writing, this takes a few seconds.');
  __lwPaint('');
  try{
    var r = await sb.functions.invoke('generate-listing-description', {
      body: {
        property_type: typeEl ? typeEl.value : 'single_family',
        standouts: standouts,
        basics: basics
      }
    });
    var d = r && r.data;
    if(r && r.error || !d || !d.ok || !d.remarks){
      var why = (d && d.error) || (r && r.error && r.error.message) || 'no reason given';
      __lwMsg('');
      __lwPaint('<div class="pbnote">It did not come back with anything: ' + __tbEsc(why) +
        '. Nothing has been saved. Try again, and tell the broker if it keeps happening.</div>');
      return;
    }
    var n = d.char_count || d.remarks.length;
    __lwMsg('');
    __lwPaint(
      '<div class="lwout"><div class="lwoh"><b>Draft remarks</b>' +
      '<span class="chip ' + (n > 1200 ? 'red' : 'gh') + '">' + n + ' of 1200 characters</span>' +
      '<button class="tdbtn quiet" type="button" data-tbact="lw-copy">Copy</button></div>' +
      '<div class="lwtext" id="lw-text">' + __tbEsc(d.remarks) + '</div>' +
      '<div class="pbnote">Read it against the property before it goes in the MLS. ' +
      'Anything it says that you cannot stand behind is yours to take out.</div></div>');
  }catch(e){
    __lwMsg('');
    __lwPaint('<div class="pbnote">It could not be reached: ' + __tbEsc(String(e && e.message || e)) +
      '. Nothing has been saved.</div>');
  }finally{
    __lwBusy = false;
  }
}

function __lwCopy(){
  var el = document.getElementById('lw-text');
  if(!el) return;
  var text = el.textContent || '';
  var done = function(){ __lwMsg('Copied.'); setTimeout(function(){ __lwMsg(''); }, 1600); };
  /* The clipboard is blocked when the Hub runs inside a preview frame, which
     is exactly where it gets tested. The prompt box is not pretty and it
     always works. */
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done, function(){ window.prompt('Copy the remarks', text); });
  } else {
    window.prompt('Copy the remarks', text);
  }
}
