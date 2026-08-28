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

/* One card. */
pageToday = function(){
  return tdBoard();
};

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
