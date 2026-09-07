/* === Today, one card =====================================================
   Scope agreed with Marlenyi on 26 August: Today shows the people to call
   today and nothing else. The banner, the also-card, the calendar and the
   setup card are dropped for now, because each needs a data source that is
   not connected and the banner's per-conversation figures are not something
   the Hub can source at all.

   Almost nothing here is new. tdPool() already reads DBP, so the board went
   live the moment Database did. What was missing was the writing: the log
   button only moved a counter in memory.                                   */

/* tdId() derives its key from the name, so a real contact id has to be
   carried alongside it. Duplicates would collide here; they are out of this
   pass, and the Database list has the same property.                       */
var __tdUuid = {};
function __tdMapIds(){
  __tdUuid = {};
  DBP.forEach(function(p){ if(p.id) __tdUuid[tdId(p.n)] = p.id; });
}

/* THIS OVERRIDE NEVER TOOK EFFECT AND HAS BEEN REMOVED.

   It read `pageToday = function(){ return tdBoard(); }`, meaning Today would
   be the call board and nothing else. TABS captures the function reference
   when its object literal is evaluated, and this file is injected afterwards,
   so the assignment changed a name the navigation never reads again. Today has
   been drawing the design's five-card version since the day this was written.
   A function declaration would have won, the way pagePlan's does.

   It is not being reinstated, because the reasoning under it went stale. The
   three cards it dropped were dropped for having no data source, and the
   calendar has had one since the calendar layer landed. Deleting three working
   cards to honour a note from 26 August would be following the note rather
   than the reason for it. What the note was actually protecting against is
   below: figures on those cards that belong to one person.

   If Today should be one card, that is a decision to make now, on what the
   cards do today, not by leaving a line here that looks like it settled it. */

/* AGENT_CLOSINGS was 46, the broker's closed count, on a card whose whole job
   is to guide somebody who has never closed anything. Its guard returns
   nothing whenever the figure is above nought, so "Path to first close" is
   hidden from every one of the six agents who has never closed a file and
   would have shown to the one person who has, had the figure been theirs.
   And the "Database" step asserted 207 contacts loaded, which is the broker's
   book presented to an agent as their own.

   Both read from the seat now. Called after the transactions and contacts are
   in, because both figures come from them. */
function __tdSetupFigures(){
  if(typeof AGENT_CLOSINGS !== 'undefined'){
    AGENT_CLOSINGS = Number(window.__naClosed) || 0;
  }
}

/* The design's setupCard, with the two frozen figures read from the seat and
   the step list otherwise untouched. */
function setupCard(){
  if(AGENT_CLOSINGS > 0) return '';
  var convs = dbLive();
  var book = (typeof __dbRows !== 'undefined')
    ? __dbRows.filter(function(r){ return r.record_class === 'client' && !r.is_agent; }).length
    : 0;
  var steps = [
    ['Onboarding','checklist still empty','now'],
    ['Database', book ? book + ' contact' + (book===1?'':'s') + ' loaded' : 'nothing loaded yet',
      book ? 'done' : ''],
    ['10 conversations', convs ? convs+' logged this week' : 'none logged this week',
      convs>=10 ? 'done' : ''],
    ['First appointment','nothing booked yet',''],
    ['First contract','none closed yet','']
  ];
  var done = steps.filter(function(x){ return x[2]==='done'; }).length;
  return '<div class="card setcard" data-card="ramp" data-cw="1" style="align-self:start">'+
    '<div class="ch"><div class="ct">Path to first close</div>'+
    '<div class="lab">'+done+' of '+steps.length+'</div></div>'+
    '<div class="setroute">'+steps.map(function(x,i){
      return '<div class="setnode'+(x[2]?' '+x[2]:'')+'"><span class="setdisc">'+
        (x[2]==='done'?'&#10003;':(i+1))+'</span>'+
        '<span><span class="setlab">'+x[0]+'</span>'+
        '<span class="setwhy">'+x[1]+'</span></span></div>'; }).join('')+'</div>'+
    '<button class="setgo" type="button">Start step 1</button>'+
    '<div class="setgone">This card goes when you close your first file.</div></div>';
}

/* The log button writes now. It marks the row done only after Supabase has
   accepted it, so a failed write leaves the name in the queue rather than
   quietly ticking it off. No local fallback: a write that did not land did
   not happen.                                                              */
var __tdWireInner = wireToday;
wireToday = function(){
  __tdWireInner();
  var g = grid;
  if(!document.getElementById('tdboard')) return;
  g.querySelectorAll('[data-log]').forEach(function(b){
    b.onclick = async function(){
      var key = b.getAttribute('data-log');
      if(TD.done[key]) return;
      var uuid = __tdUuid[key];
      if(!uuid){
        if(typeof showGoalToast==='function') showGoalToast('Could not find that contact.');
        return;
      }
      var label = b.textContent;
      b.disabled = true; b.textContent = 'Logging.';
      try{
        var res = await __dbLogActivity(uuid, 'conversation', null);
        if(res && res.duplicate){
          if(typeof showGoalToast==='function') showGoalToast('Already logged today.');
          TD.done[key] = 1; TD.focus = null; tdRepaint();
          return;
        }
        if(res && res.error) throw res.error;
        TD.done[key] = 1;
        TD.logged = Math.min(TD.goal, TD.logged + 1);
        TD.focus = null;
        if(typeof showGoalToast==='function') showGoalToast('Logged conversation.');
        tdRepaint();
      }catch(e){
        b.disabled = false; b.textContent = label;
        if(typeof showGoalToast==='function'){
          showGoalToast('Could not log. ' + (e && e.message ? e.message : 'Try again.'));
        }
        console.error('today log', e);
      }
    };
  });
};

/* How many conversations are already logged today, so a reload does not
   reset the count to nought. Reads agent_activity rather than assuming.    */
async function __tdLoadLoggedToday(){
  var ures = await sb.auth.getUser();
  var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
  if(!uid) return;
  var today = __dbToday();
  var res = await sb.from('agent_activity')
    .select('contact_id')
    .eq('agent_id', uid)
    .eq('occurred_on', today);
  if(res.error){ console.error('logged today', res.error); return; }
  var rows = res.data || [];
  TD.logged = Math.min(TD.goal, rows.length);
  // Tick off anyone already spoken to today so they do not come back up.
  var byUuid = {};
  DBP.forEach(function(p){ if(p.id) byUuid[p.id] = tdId(p.n); });
  rows.forEach(function(r){
    var key = byUuid[r.contact_id];
    if(key){ TD.done[key] = 1; __dbRecentLog[r.contact_id] = today; }
  });
}
