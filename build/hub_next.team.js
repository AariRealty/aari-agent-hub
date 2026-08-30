/* === Team, Announcements, Classes, Costs, Production, Roster ==============
   Fills the arrays those screens read, from tables that already hold data:
   realty_members 8, realty_announcements 5, realty_expenses 17,
   realty_training_items 10 across 4 categories.

   Money is never invented. Where a figure is absent the cell gets a middle
   dot, never a zero.                                                        */

var __tmMembers = [], __tmAnn = [], __tmExpenses = [], __tmTraining = [], __tmCats = [];

/* Commission plans. One registry, because a plan list scattered across a
   label function and a split function drifts the moment one changes.

   current: the three plans the brokerage offers today. 75_25 Mentorship is
   the required entry point for a new agent; the database CHECK has always
   allowed it and no member is on it, so it was invisible to every earlier
   version of this code.

   legacy: plans nobody is sold any more but members are still on. They are
   labelled as legacy rather than dropped or quietly shown as current. A
   member on a retired plan is a fact, and the screen has to say so without
   pretending the plan is on offer.

   unknown: anything else. Shown verbatim with a warning rather than blanked,
   because a plan the code does not recognise is a thing somebody needs to
   look at, not a thing to hide. */
var PLANS = {
  '75_25':   { label: 'Mentorship 75 / 25', split: '0.75', state: 'current' },
  '85_15':   { label: 'Growth 85 / 15',     split: '0.85', state: 'current' },
  '100_max': { label: 'Max 100%',           split: '1.00', state: 'current' },
  '80_20':   { label: '80 / 20',            split: '0.80', state: 'legacy'  },
  '70_30':   { label: '70 / 30',            split: '0.70', state: 'legacy'  }
};
function __tmPlan(p){
  if(!p) return { label: '&middot;', split: '&middot;', state: 'unset' };
  return PLANS[p] || { label: String(p), split: '&middot;', state: 'unknown' };
}
function __tmPlanLabel(p){
  var x = __tmPlan(p);
  if(x.state === 'legacy')  return x.label + ' <span class="chip">legacy</span>';
  if(x.state === 'unknown') return x.label + ' <span class="chip red">unrecognised plan</span>';
  return x.label;
}
function __tmSplit(p){ return __tmPlan(p).split; }
function __tmPlanCounts(){
  var out = { current:0, legacy:0, unknown:0, unset:0 };
  __tmMembers.forEach(function(m){ out[__tmPlan(m.commission_plan).state]++; });
  return out;
}
function __tmDay(d){
  if(!d) return 'never';
  var p = String(d).slice(0,10).split('-');
  if(p.length !== 3) return 'never';
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return M[parseInt(p[1],10)-1] + ' ' + parseInt(p[2],10);
}

async function __tmLoad(){
  // Members. Closed files and GCI per agent come from the transactions
  // already loaded, so there is one source for both screens.
  var mem = await sb.from('realty_members')
    .select('user_id,full_name,role,status,commission_plan,fee_exempt,is_tc,last_login_at,license_status,activated_at,start_date,must_change_password')
    .order('full_name');
  if(!mem.error){
    __tmMembers = mem.data || [];
    ROSTER.length = 0;
    __tmMembers.forEach(function(m){
      var mine = __txRows.filter(function(t){ return t.agent_id === m.user_id && t.lifecycle === 'Closed'; });
      var gci  = mine.reduce(function(a,t){
        var v = t.net_commission != null ? t.net_commission : t.gross_commission;
        return a + (Number(v) || 0);
      }, 0);
      var title = (m.role === 'broker' ? 'Broker' : 'Agent') + (m.is_tc ? ' &middot; TC' : '');
      ROSTER.push([
        m.full_name || 'Unnamed',
        title,
        __tmPlanLabel(m.commission_plan) + (m.fee_exempt ? ' &middot; exempt' : ''),
        __tmSplit(m.commission_plan),
        mine.length,
        gci || null,
        __tmDay(m.last_login_at),
        m.status === 'active' ? 'ok' : (m.status || 'never'),
        // 8: never reached the Hub. A member row and closed files are not the
        // same as an account somebody can sign in to.
        (!m.activated_at && !m.last_login_at),
        // 9: no start date. Null on every member today, and it is the field
        // that answers whether a plan is grandfathered.
        !m.start_date
      ]);
    });
  }

  // Announcements, with the acknowledgement counts they carry.
  var ann = await sb.from('realty_announcements')
    .select('id,title,urgency,requires_ack,posted_at,recipient_ids,archived')
    .eq('archived', false).order('posted_at', { ascending: false });
  if(!ann.error){
    __tmAnn = ann.data || [];
    var reads = await sb.from('realty_announcement_reads').select('announcement_id,acknowledged');
    var readCount = {}, ackCount = {};
    if(!reads.error) (reads.data||[]).forEach(function(r){
      readCount[r.announcement_id] = (readCount[r.announcement_id]||0) + 1;
      if(r.acknowledged) ackCount[r.announcement_id] = (ackCount[r.announcement_id]||0) + 1;
    });
    ANNROWS.length = 0;
    __tmAnn.forEach(function(a){
      ANNROWS.push([ a.title || 'Untitled', a.urgency || 'normal', a.requires_ack === true,
                     __tmDay(a.posted_at), readCount[a.id] || 0, ackCount[a.id] || 0 ]);
    });
  }

  var exp = await sb.from('realty_expenses')
    .select('id,label,category,amount,frequency,vendor,active,display_note')
    .eq('active', true).order('amount', { ascending: false, nullsFirst: false });
  if(!exp.error) __tmExpenses = exp.data || [];

  var cats = await sb.from('realty_training_categories')
    .select('id,name,description,sort,archived').eq('archived', false).order('sort');
  if(!cats.error) __tmCats = cats.data || [];

  var tr = await sb.from('realty_training_items')
    .select('id,category_id,title,description,content_type,required,sort,archived')
    .eq('archived', false).order('sort');
  if(!tr.error) __tmTraining = tr.data || [];

  return { ok: true };
}

/* Monthly cost of everything in realty_expenses, normalised. Returns null
   rather than 0 when nothing is known, so the caller can print a dot. */
function __tmMonthlyCost(){
  if(!__tmExpenses.length) return null;
  var per = { monthly:1, quarterly:1/3, annual:1/12, yearly:1/12, weekly:52/12, one_time:0 };
  var t = __tmExpenses.reduce(function(a,e){
    var f = per[String(e.frequency||'monthly').toLowerCase()];
    return a + (Number(e.amount)||0) * (f == null ? 1 : f);
  }, 0);
  return Math.round(t*100)/100;
}

/* A retired plan is a fact the Costs screen has to state, not hide. Never
   asserts a fee: no fee is charged from the Hub until the plan's fee is
   confirmed, and this says so rather than implying a number exists. */
function __tmPlanNote(){
  var c = __tmPlanCounts(), bits = [];
  if(c.legacy)  bits.push(c.legacy+' member'+(c.legacy===1?'':'s')+' on a retired plan');
  if(c.unknown) bits.push(c.unknown+' on a plan this build does not recognise');
  if(c.unset)   bits.push(c.unset+' with no plan set');
  if(!bits.length) return '';
  return ' '+bits.join(', ')+'. No transaction fee is charged from here until that plan\'s fee is confirmed.';
}

/* Members who have a row and, in several cases, closed files, but have never
   activated or signed in. Producing agents who cannot reach the Hub is an
   operational fact, not a display detail, so the Roster states it. */
function __tmNeverIn(){ return ROSTER.filter(function(r){ return r[8]; }); }
function __tmNoStart(){ return ROSTER.filter(function(r){ return r[9]; }); }
function __tmRosterNote(){
  var a = __tmNeverIn(), b = __tmNoStart(), bits = [];
  if(a.length) bits.push(a.length+' '+(a.length===1?'member has':'members have')+' never signed in');
  if(b.length) bits.push(b.length+' '+(b.length===1?'has':'have')+' no start date');
  return bits.length ? ' '+bits.join(', ')+'.' : '';
}
