
/* PROFILE is a hardcoded object. Its agent entry carries the broker's name,
   licence number, phone and email, so every agent signing in would see
   "Good morning, Marlenyi" above her contact details presented as their own.
   It has not bitten anyone because agents are still served the old payload,
   and it would have bitten all of them the moment that gate opened.

   The member record is the only identity the Hub actually knows, so the
   fields it holds are written over the frozen ones and the rest are emptied
   rather than left showing somebody else's licence. Called after the member
   loads, before the first render. */
function __plIdentity(){
  var me = window.__hubMe;
  if(!me || typeof PROFILE === 'undefined') return;
  var role = (me.role === 'broker') ? 'broker' : 'agent';
  var p = PROFILE[role];
  if(!p) return;

  if(me.full_name) p.name  = me.full_name;
  if(me.email)     p.email = me.email;

  /* Blanked rather than inherited. An agent seeing the broker's licence
     number on their own profile card is worse than an agent seeing a dot,
     and the dot is also the honest answer: no agent has a licence number on
     record at all, which is a gap worth the broker noticing. */
  p.licence = me.license_number || '\u00B7';
  p.phone   = __plPhone(me.phone);
  p.area    = '\u00B7';

  /* The frozen rows described one person's plan and fees. The plan page
     shows those properly, from the file. */
  var plan = __tmPlan(me.commission_plan);
  p.rows = [
    ['Your split', 'chip dk', plan.split],
    ['Plan', 'chip gh', plan.label],
    ['Fee exempt', me.fee_exempt ? 'chip gh' : 'chip', me.fee_exempt ? 'yes' : 'no']
  ];

  /* The broker card asserted "6 agents". Count them. */
  if(role === 'broker'){
    var active = (typeof __tmMembers !== 'undefined' ? __tmMembers : [])
      .filter(function(m){ return m.status === 'active'; }).length;
    p.chip = active ? (active + ' member' + (active === 1 ? '' : 's')) : '';
  }
}

/* Stored as ten digits. Rendered the way a person would read it, and left
   alone if it is any other shape rather than mangled into one. */
function __plPhone(v){
  if(!v) return '\u00B7';
  var d = String(v).replace(/\D/g, '');
  return d.length === 10
    ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6)
    : String(v);
}

var __plRows = [];

function __plMine(uid, year){
  return __txRows.filter(function(t){
    if(t.agent_id !== uid) return false;
    var when = t.paid_at || t.closing_date;
    return when && String(when).slice(0,4) === String(year);
  }).sort(function(a,b){
    return String(b.closing_date||'').localeCompare(String(a.closing_date||''));
  });
}

function __plMoney(v){
  return (v === null || v === undefined || v === '')
    ? '·'
    : '$' + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

/* A row is questionable when the company kept more than the deal earned.
   Returns null when either figure is missing: unknown is not a discrepancy. */
function __plOdd(t){
  if(t.company_fee == null || t.gross_commission == null) return null;
  return Number(t.company_fee) > Number(t.gross_commission)
    ? Number(t.company_fee) - Number(t.gross_commission)
    : null;
}

function pagePlan(){
  var me   = window.__hubMe || {};
  var uid  = me.user_id;
  var year = new Date().getFullYear();
  var plan = __tmPlan(me.commission_plan);
  var mine = uid ? __plMine(uid, year) : [];

  var closed  = mine.filter(function(t){ return t.lifecycle === 'Closed'; });
  var gross   = null, fees = null, flagged = 0;
  closed.forEach(function(t){
    if(t.gross_commission != null) gross = (gross || 0) + Number(t.gross_commission);
    if(t.company_fee     != null) fees  = (fees  || 0) + Number(t.company_fee);
    if(__plOdd(t) != null) flagged++;
  });

  var planState =
    plan.state === 'legacy'  ? '<span class="chip red">retired plan</span>' :
    plan.state === 'unknown' ? '<span class="chip red">unrecognised</span>' :
    plan.state === 'unset'   ? '<span class="chip red">no plan on file</span>' :
                               '<span class="chip gh">current</span>';

  var rows = closed.length
    ? closed.map(function(t){
        var odd = __plOdd(t);
        return '<div class="tdq"' + (odd != null ? ' style="border-left:2px solid var(--alert,#B04040);padding-left:10px"' : '') + '>' +
          '<div><b>' + __tbEsc(t.property_address || 'No address') + '</b>' +
          (odd != null ? ' <span class="chip red">check this</span>' : '') + '</div>' +
          '<div class="rfoot">' + (t.closing_date || '·') +
            ' &middot; commission ' + __plMoney(t.gross_commission) +
            ' &middot; to the company ' + __plMoney(t.company_fee) +
            (odd != null
              ? '<br>The company fee recorded is ' + __plMoney(odd) +
                ' more than the commission on this file. That cannot be right if the fee is a share of the commission, so it is flagged rather than counted as settled. Ask the broker before relying on it.'
              : '') +
          '</div></div>';
      }).join('')
    : '<div class="pbempty">No closed files recorded for you in ' + year + '.</div>';

  return '<div class="card wide anim tbwide"><div class="ch"><h2>Your plan</h2>' + planState + '</div>' +
    '<div class="fill">' +
      sr('Plan', 'chip gh', plan.label) +
      sr('Your split', 'chip gh', plan.split) +
      sr('Fee exempt', me.fee_exempt ? 'chip gh' : 'chip', me.fee_exempt ? 'yes' : 'no') +
    '</div>' +
    '<div class="pbnote">Read from your realty_members record. <b>Your signed ICA is the system of record, not this screen.</b> ' +
    'If anything here does not match what you signed, the ICA is right and the Hub is wrong. Tell the broker.' +
    (plan.state === 'legacy'
      ? ' This plan is retired and is not offered to new agents. It is shown because it is what your record says.'
      : '') + '</div></div>' +

    '<div class="card wide anim tbwide"><div class="ch"><h2>' + year + ' so far</h2>' +
      (flagged ? '<span class="chip red">' + flagged + ' to check</span>' : '') + '</div>' +
    '<div class="fill">' +
      sr('Closed files', 'chip gh', String(closed.length)) +
      sr('Commission on them', gross == null ? 'chip' : 'chip gh', __plMoney(gross)) +
      sr('Paid to the company', fees == null ? 'chip' : 'chip gh', __plMoney(fees)) +
    '</div>' +
    '<div class="pbnote">Every figure is the one recorded on the file. Nothing here is calculated from your plan, ' +
    'because the fee depends on the plan and on whether the property is vacant land. A file with no figure recorded ' +
    'shows a dot rather than a zero.</div></div>' +

    '<div class="card wide anim tbwide"><div class="ch"><h2>Your closings</h2>' +
      '<span class="chip gh">' + closed.length + '</span></div>' +
    '<div class="fill">' + rows + '</div></div>' +

    // 2026-09-24 · Career record. Yearly summary from realty_agent_history
    // for the signed in agent. Hidden until the async loader confirms at
    // least one row. Never mixed into Your plan or Year so far above.
    '<div class="card wide anim tbwide" id="pl-career-card" style="display:none">' +
      '<div class="ch"><h2>Career record</h2><span class="chip">Before Aari</span></div>' +
      '<div class="fill" style="display:block"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="text-align:left;color:#6a6560;font-size:11px;letter-spacing:.5px;text-transform:uppercase">' +
          '<th style="padding:8px 0;font-weight:600">Year</th>' +
          '<th style="padding:8px 0;font-weight:600">Deals</th>' +
          '<th style="padding:8px 0;font-weight:600;text-align:right">Total</th>' +
        '</tr></thead><tbody id="pl-career-rows"></tbody>' +
      '</table></div>' +
      '<div class="pbnote">Not included in Aari production, P&amp;L, or goals.</div>' +
    '</div>';
}

/* 2026-09-24 · Career record loader for the plan tab. Called from a
   setTimeout hook attached where __TB_PANELS.plan is invoked, so the DOM
   already carries the placeholder card by the time we paint into it. */
async function __plLoadCareer(){
  var card = document.getElementById('pl-career-card');
  var tb   = document.getElementById('pl-career-rows');
  if(!card || !tb) return;
  var uid = null;
  try{ var u = await sb.auth.getUser(); uid = u && u.data && u.data.user && u.data.user.id; }catch(e){}
  if(!uid){ card.style.display='none'; return; }
  try{
    var q = await sb.from('realty_agent_history')
      .select('closing_date,commission')
      .eq('agent_id', uid)
      .order('closing_date', { ascending:true });
    if(q.error) throw q.error;
    var data = q.data || [];
    if(!data.length){ card.style.display='none'; return; }
    var byYear = {};
    data.forEach(function(r){
      var yr = String(r.closing_date||'').slice(0,4);
      if(!yr) return;
      if(!byYear[yr]) byYear[yr] = { deals:0, total:0 };
      byYear[yr].deals++;
      byYear[yr].total += Number(r.commission) || 0;
    });
    var years = Object.keys(byYear).sort();
    var money = function(n){ return '$' + Math.round(n).toLocaleString('en-US'); };
    tb.innerHTML = years.map(function(y){
      var b = byYear[y];
      return '<tr style="border-top:1px solid #eae6dd">' +
             '<td style="padding:9px 0;font-weight:500">' + y + '</td>' +
             '<td style="padding:9px 0">' + b.deals + '</td>' +
             '<td style="padding:9px 0;text-align:right;font-family:\'Cormorant Garamond\',serif;font-weight:600;font-size:15px">' + money(b.total) + '</td>' +
             '</tr>';
    }).join('');
    card.style.display = '';
  }catch(e){ console.error('career record (plan)', e); card.style.display='none'; }
}
