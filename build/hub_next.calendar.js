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
