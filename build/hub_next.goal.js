
/* === Goal Engine, wired ==================================================
   The calculator in the design was already correct: computeGoalMath is copied
   verbatim out of hub_payload.html so the two cannot disagree. Three things
   were not.

   One, it loaded from localStorage. A goal typed on a phone did not exist on
   a laptop, and a cleared browser lost it.

   Two, __goalLoad filled four of the ten fields of GE0 and GEV was cloned
   before it ran, so the six it did not fill arrived at the input tags as the
   literal string "undefined", and computeGoalMath refused every one of them.
   Every screen that reads the weekly figure, the Today board and the pop-by
   target among them, was working off an invalid goal.

   Three, the page carried one person's history in prose: a target of three
   new contacts a week justified by fourteen closings against a book of 204.
   True of the broker, of nobody else, and shown to everyone.

   realty_agent_goals holds one row per agent per year and every field the
   calculator reads, so this loads from it and saves back to it.           */

var __geSavedAt = null;     // updated_at from the row, null when there is none
var __geRowYear = null;

function __geBlank(){
  return { income_target:0, avg_price:0, commission_pct:0, split_pct:0,
           appt_to_close_pct:0, conv_to_appt_pct:0, working_weeks:0,
           prospecting_days:0, handwritten_notes_target:0, pop_by_day:0,
           pop_by_ratio:0.20 };
}

/* Numeric or zero. A goal field that is null in the database is a field the
   agent has not set, and computeGoalMath already treats zero as unset, so
   there is no need for a second way of saying the same thing. */
function __geNum(v){ var n = Number(v); return isFinite(n) ? n : 0; }

async function __geLoad(){
  var ures = await sb.auth.getUser();
  var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
  if(!uid) return;
  var year = new Date().getFullYear();
  __geRowYear = year;

  var res = await sb.from('realty_agent_goals')
    .select('income_target,avg_price,commission_pct,split_pct,appt_to_close_pct,'+
            'conv_to_appt_pct,working_weeks,prospecting_days,handwritten_notes_target,'+
            'pop_by_day,pop_by_ratio,updated_at')
    .eq('agent_id', uid).eq('period_year', year).maybeSingle();
  if(res.error){ console.error('goal engine load', res.error); return; }

  var blank = __geBlank();
  Object.keys(blank).forEach(function(k){ GE0[k] = blank[k]; });

  var g = res.data;
  if(g){
    Object.keys(blank).forEach(function(k){
      if(k in g) GE0[k] = __geNum(g[k]);
    });
    if(!GE0.pop_by_ratio) GE0.pop_by_ratio = 0.20;
    __geSavedAt = g.updated_at || null;
  }

  /* GEV is what the inputs are bound to, and it was cloned from GE0 before
     any of this ran. Rewriting its fields in place keeps the binding the
     design closes over. */
  Object.keys(blank).forEach(function(k){ GEV[k] = GE0[k]; });
  PBRATIO = GE0.pop_by_ratio || 0.20;
  geHint = null;
}

/* "Saved 3 September" rather than a timestamp, and the honest thing when
   there is no row at all. */
function __geSavedLine(){
  if(!__geSavedAt) return 'Not saved yet. Nothing is stored for you in realty_agent_goals for '+
    (__geRowYear || new Date().getFullYear())+'.';
  var d = new Date(__geSavedAt);
  if(isNaN(d.getTime())) return 'Last saved '+__geSavedAt+'.';
  return 'Last saved '+d.toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})+'.';
}

function pageGoal(){
  var m = computeGoalMath(GEV);
  var dash = '&middot;';
  var weeklyNotes = __geNum(GEV.handwritten_notes_target);

  return '<div class="card" style="grid-area:1/1/2/3">'+
      '<div class="ge-panel-label">Inputs</div>'+
      GEF.map(gefield).join('')+
      '<div class="ge-field-row">'+
        gefield(['working_weeks','Working weeks per year','','','1','52','1',''])+
        gefield(['prospecting_days','Prospecting days per week','','','1','7','1',''])+
      '</div>'+
      gefield(['handwritten_notes_target','Handwritten notes per week','','','0','20','1',''])+
      '<div class="ge-field-help">Weekly target for the notes track on Today. Set to 0 to hide the block.</div>'+
      '<button type="button" class="ge-save-btn" id="ge-save">Save my goal</button>'+
      '<div class="ge-save-hint" id="ge-save-hint">'+
        (geHint || __geSavedLine())+'</div>'+
    '</div>'+

    '<div class="gecol" style="grid-area:1/3/2/5">'+
      '<div class="card warm ge-hero'+(m.invalid?' invalid':'')+'">'+
        '<div class="ge-panel-label">Daily number</div>'+
        '<div class="ge-hero-num"><span id="ge-daily">'+(m.invalid?dash:m.daily)+'</span>'+
          '<span class="ge-hero-unit"> conversations per day.</span></div></div>'+

      '<div class="card">'+
        '<div class="ge-panel-label">The path there</div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Net per closing</span>'+
          '<span class="ge-row-val">'+(m.invalid?dash:gmoney(m.netPerClosing))+'</span></div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Closings needed</span>'+
          '<span class="ge-row-val">'+(m.invalid?dash:m.closings)+'</span></div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Appointments needed</span>'+
          '<span class="ge-row-val">'+(m.invalid?dash:m.appointments)+'</span></div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Conversations per year</span>'+
          '<span class="ge-row-val">'+(m.invalid?dash:m.conversations)+'</span></div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Conversations per week</span>'+
          '<span class="ge-row-val">'+(m.invalid?dash:m.weekly)+'</span></div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Pop-bys per week</span>'+
          '<span class="ge-row-val">'+(m.invalid?dash:Math.max(1,Math.ceil(m.weekly*(PBRATIO||0.20))))+'</span></div>'+
        '<div class="ge-row"><span class="ge-row-lbl">Handwritten notes per week</span>'+
          '<span class="ge-row-val">'+(weeklyNotes>0?weeklyNotes:dash)+'</span></div>'+
        '<div class="ge-field-help" style="margin-top:8px">Every row moves when you change an '+
        'input above. The pop-by figure is your weekly conversations times '+
        Math.round((PBRATIO||0.20)*100)+' percent, which is the ratio on your goal row, and it is '+
        'the number the Pop-bys screen builds a route to. The notes figure is the one you typed; '+
        'nothing derives it.</div></div>'+

      '<div class="card ge-value-card">'+
        '<div class="ge-panel-label">What every conversation is worth</div>'+
        '<div class="ge-big">'+(m.invalid?dash:gmoney(m.valuePerConv))+'</div>'+
        '<div class="ge-cost-line">'+(m.invalid
          ? 'Fill in every field to see what a skipped day costs you.'
          : 'A day you skip costs you <strong>'+gmoney(m.costOfSkip)+'</strong>.')+'</div></div>'+
    '</div>';
};

function wireGoalEngine(){
  var host = grid.querySelector('[data-ge]'); if(!host) return;

  [].forEach.call(grid.querySelectorAll('[data-ge]'), function(el){
    var k = el.getAttribute('data-ge');
    var live = function(){
      var v = (k==='working_weeks'||k==='prospecting_days'||k==='handwritten_notes_target')
        ? parseInt(el.value,10) : parseFloat(el.value);
      GEV[k] = v;
      // only the results are repainted, so the caret stays where she is typing
      var m = computeGoalMath(GEV), d = '&middot;';
      var col = grid.querySelector('.gecol'); if(!col) return;
      var hero = col.querySelector('.ge-hero');
      hero.classList.toggle('invalid', m.invalid);
      col.querySelector('#ge-daily').innerHTML = m.invalid ? d : m.daily;
      var notes = __geNum(GEV.handwritten_notes_target);
      var vals = [m.invalid?d:gmoney(m.netPerClosing), m.invalid?d:m.closings,
                  m.invalid?d:m.appointments, m.invalid?d:m.conversations, m.invalid?d:m.weekly,
                  m.invalid?d:Math.max(1,Math.ceil(m.weekly*(PBRATIO||0.20))),
                  notes>0?notes:d];
      [].forEach.call(col.querySelectorAll('.ge-row-val'), function(x,i){ x.innerHTML = vals[i]; });
      col.querySelector('.ge-big').innerHTML = m.invalid ? d : gmoney(m.valuePerConv);
      col.querySelector('.ge-cost-line').innerHTML = m.invalid
        ? 'Fill in every field to see what a skipped day costs you.'
        : 'A day you skip costs you <strong>'+gmoney(m.costOfSkip)+'</strong>.';
    };
    el.oninput = live; el.onchange = live;
  });

  var btn = document.getElementById('ge-save'), hint = document.getElementById('ge-save-hint');
  if(!btn) return;
  btn.onclick = async function(){
    // the same checks the live Save runs, in the same order
    var f = GEV, errs = [];
    if(!(f.income_target>0)) errs.push('Income target');
    if(!(f.avg_price>0)) errs.push('Average sale price');
    if(!(f.commission_pct>0)) errs.push('Commission percent');
    if(!(f.split_pct>0)) errs.push('Split percent');
    if(!(f.appt_to_close_pct>0)) errs.push('Appointment to close rate');
    if(!(f.conv_to_appt_pct>0)) errs.push('Conversation to appointment rate');
    if(!(f.working_weeks>0)) errs.push('Working weeks');
    if(!(f.prospecting_days>0)) errs.push('Prospecting days');
    if(!(f.handwritten_notes_target>=0 && f.handwritten_notes_target<=20))
      errs.push('Handwritten notes per week (0-20)');
    if(errs.length){ geToast('Fix these before saving. '+errs.join(', ')); return; }

    var ures = await sb.auth.getUser();
    var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
    if(!uid){ geToast('Your session has expired. Sign in again and try once more.'); return; }

    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving.';
    var year = new Date().getFullYear();
    var row = {
      agent_id: uid, period_year: year,
      income_target: f.income_target, avg_price: f.avg_price,
      commission_pct: f.commission_pct, split_pct: f.split_pct,
      appt_to_close_pct: f.appt_to_close_pct, conv_to_appt_pct: f.conv_to_appt_pct,
      working_weeks: f.working_weeks, prospecting_days: f.prospecting_days,
      handwritten_notes_target: f.handwritten_notes_target,
      updated_at: new Date().toISOString()
    };
    /* pop_by_day and pop_by_ratio are not on this form, so they are carried
       rather than overwritten. An upsert that omitted them would reset them
       to their column defaults on every save, which is how a setting nobody
       is looking at quietly disappears. */
    if(__geNum(GEV.pop_by_day) || GEV.pop_by_day === 0) row.pop_by_day = __geNum(GEV.pop_by_day);
    if(PBRATIO) row.pop_by_ratio = PBRATIO;

    var res = await sb.from('realty_agent_goals')
      .upsert(row, { onConflict: 'agent_id,period_year' }).select().maybeSingle();

    btn.disabled = false; btn.textContent = label;
    if(res.error){
      /* No localStorage fallback. A goal that did not reach the table is a
         goal the Today board and the pop-by target will not see tomorrow, and
         saying "saved" to that is worse than saying nothing. */
      console.error('goal save', res.error);
      geHint = null;
      if(hint) hint.textContent = 'Not saved. '+(res.error.message || 'The database refused the write.');
      geToast('Could not save. Nothing was stored.');
      return;
    }

    __geSavedAt = (res.data && res.data.updated_at) || row.updated_at;
    geHint = 'Saved just now.';
    if(hint) hint.textContent = geHint;
    geToast('Goal saved.');

    /* The cover, the Today board and the pop-by route all read the goal. They
       are repainted rather than left showing the old target until a reload. */
    try{
      GOAL.agent.target = __geNum(f.income_target);
      GOAL.agent.set = __geNum(f.income_target) > 0;
      var cov = document.getElementById('mcover');
      if(cov && !cov.hidden && typeof coverFact === 'function'){
        var cf = coverFact();
        var n = document.getElementById('mcnum'), u = document.getElementById('mcunit');
        if(n) n.textContent = cf.n;
        if(u) u.textContent = cf.u;
      }
    }catch(e){ console.error('goal repaint', e); }
  };
};
