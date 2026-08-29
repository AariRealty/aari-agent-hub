/* === Team, Announcements, Classes, Costs, Production, Roster ==============
   Fills the arrays those screens read, from tables that already hold data:
   realty_members 8, realty_announcements 5, realty_expenses 17,
   realty_training_items 10 across 4 categories.

   Money is never invented. Where a figure is absent the cell gets a middle
   dot, never a zero.                                                        */

var __tmMembers = [], __tmAnn = [], __tmExpenses = [], __tmTraining = [], __tmCats = [];

function __tmPlanLabel(p){
  return ({ '100_max':'100% Max', '85_15':'85 / 15', '80_20':'80 / 20', '70_30':'70 / 30' })[p] || (p || '&middot;');
}
function __tmSplit(p){
  return ({ '100_max':'1.00', '85_15':'0.85', '80_20':'0.80', '70_30':'0.70' })[p] || '&middot;';
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
    .select('user_id,full_name,role,status,commission_plan,fee_exempt,is_tc,last_login_at,license_status')
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
        m.status === 'active' ? 'ok' : (m.status || 'never')
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
