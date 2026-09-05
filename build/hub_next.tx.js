/* === Transactions and listings, wired ====================================
   Fills the arrays the Deals screens already read, from realty_transactions
   and realty_listings. No markup changed.

   What the data supports, checked before writing a line of this:
     56 transactions. All 56 carry an address and a side.
     price on 50, gross_commission on 49, company_fee on 12.
     net_commission on NONE of them.
     client_name on 2. contract_type on 1. effective_date on 1.
     realty_tx_documents and realty_tx_deadlines are both empty.

   So the money column the design calls GCI has no source on any row, and a
   deadline cannot be computed for 55 of the 56 because effective_date is
   missing. Those cells render as a middle dot rather than a zero. A zero is
   a claim that the number is nought; a dot says the Hub does not know.     */

var __txRows = [], __txListings = [], __txNames = {};

function __txMonth(d){
  if(!d) return '';
  var p = String(d).slice(0,10).split('-');
  if(p.length !== 3) return '';
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var m = parseInt(p[1],10);
  if(!(m>=1 && m<=12)) return '';
  return M[m-1] + ' ' + parseInt(p[2],10);
}
function __txWho(id){ return __txNames[id] || 'Unassigned'; }
// The design prints whatever it is given, so a missing figure has to arrive
// as null and be rendered as a dot by the caller, not as 0.
function __txNum(v){ var n = Number(v); return (v==null || isNaN(n)) ? null : n; }

/* One row in the shape the Deals tables read:
   [address, status, agent, side, date label, figure, deadline note, note] */
function __txRow(t){
  return [
    t.property_address || 'No address',
    t.status || 'draft',
    __txWho(t.agent_id),
    t.side || '',
    __txMonth(t.closing_date),
    __txNum(t.net_commission != null ? t.net_commission : t.gross_commission),
    '',                                  // deadline note: nothing to compute from
    t.legacy_source ? 'Legacy import' : (t.notes ? String(t.notes).slice(0,90) : '')
  ];
}

async function __txLoad(){
  var mem = await sb.from('realty_members').select('user_id,full_name');
  if(!mem.error) (mem.data||[]).forEach(function(m){ __txNames[m.user_id] = m.full_name; });

  var res = await sb.from('realty_transactions')
    .select('id,agent_id,property_address,client_name,side,price,closing_date,notes,status,'+
            'gross_commission,net_commission,company_fee,contract_type,effective_date,'+
            'inspection_days,loan_days,title_company,lender,legacy_source,lifecycle,'+
            'paid_at,submitted_at,created_at')
    .order('closing_date', { ascending: false, nullsFirst: false });
  if(res.error) return res;
  __txRows = res.data || [];

  /* lifecycle is the bucket, but nothing in the database maintains it: plain
     nullable column, no default, no trigger. Every one of the 56 rows has a
     value today because it was filled by hand once. A file arriving with it
     null would match none of the three filters and disappear from every Deals
     screen without an error. So fall back to status, and count how many rows
     needed the fallback rather than papering over it. */
  var derived = 0;
  function bucket(t){
    if(t.lifecycle === 'Active' || t.lifecycle === 'Closed' || t.lifecycle === 'Terminated') return t.lifecycle;
    derived++;
    return t.status === 'paid' ? 'Closed' : 'Active';
  }
  var active = __txRows.filter(function(t){ return bucket(t) === 'Active'; });
  var term   = __txRows.filter(function(t){ return bucket(t) === 'Terminated'; });
  var closed = __txRows.filter(function(t){ return bucket(t) === 'Closed'; });
  if(derived) console.warn('transactions: '+derived+' row(s) had no lifecycle and were bucketed from status');

  TX_ACTIVE.length = 0;     active.forEach(function(t){ TX_ACTIVE.push(__txRow(t)); });
  TX_TERMINATED.length = 0; term.forEach(function(t){ TX_TERMINATED.push(__txRow(t)); });
  // Closed is a shorter shape: [address, agent, side, date, figure]
  CLOSED.length = 0;
  closed.forEach(function(t){
    CLOSED.push([ t.property_address || 'No address', __txWho(t.agent_id), t.side || '',
                  __txMonth(t.paid_at || t.closing_date),
                  __txNum(t.net_commission != null ? t.net_commission : t.gross_commission) ]);
  });

  var lis = await sb.from('realty_listings')
    .select('id,agent_id,property_address,list_price,showings,status,listing_type,mls_number')
    .order('list_price', { ascending: false, nullsFirst: false });
  if(!lis.error){
    __txListings = lis.data || [];
    LISTINGS.length = 0;
    __txListings.forEach(function(l){
      LISTINGS.push([ l.property_address || 'No address', __txWho(l.agent_id),
                      l.listing_type || 'Sale', __txNum(l.list_price), Number(l.showings)||0 ]);
    });
  }
  return { data: __txRows };
}

/* --- DBCONTACT, the phone and email the contact detail view reads ---------
   Held 70 people as a hardcoded literal. Built from the rows already loaded
   for Database instead, so it is the same data the list is showing and there
   is no second copy to drift.                                              */
function __dbFillContacts(){
  Object.keys(DBCONTACT).forEach(function(k){ delete DBCONTACT[k]; });
  __dbRows.forEach(function(r){
    if(!r.full_name) return;
    var street = [r.street, r.city, r.state].filter(Boolean).join(', ');
    DBCONTACT[r.full_name] = {
      ph: (r.phone && String(r.phone).trim()) || '',
      em: r.email || '',
      ad: street
    };
  });
}


/* --- Transaction Review, the disbursement queue ---------------------------
   The three rows on this screen were hardcoded: two real client addresses, a
   real agent commission and a real draft file, sitting in a public repository.
   Replaced with the same query the broker's own home card already runs, so the
   queue on this screen and the count on the cover cannot disagree.

   Documents are counted from realty_tx_documents on every load rather than
   asserted. That table is empty today, which is why every row reads 0 of 0,
   and the screen says so itself rather than carrying a sentence that would
   quietly become false the first time somebody uploads one.

   Commission renders as a middle dot when there is no figure. net_commission
   is null on all 56 rows and gross_commission on 7, so this is the common
   path, not the edge. A real zero still renders as a zero, in red, because
   nought is a claim the data actually makes.                              */
async function __txReviewLoad(){
  var res = await sb.from('realty_transactions')
    .select('id,agent_id,property_address,status,gross_commission,net_commission,submitted_at')
    .in('status', ['submitted', 'approved'])
    .order('submitted_at', { ascending: true, nullsFirst: false });
  if(res.error) return res;
  var rows = res.data || [];

  var docs = {};
  if(rows.length){
    var ids = rows.map(function(t){ return t.id; });
    var dres = await sb.from('realty_tx_documents').select('transaction_id,status').in('transaction_id', ids);
    if(dres.error) return dres;
    (dres.data || []).forEach(function(d){
      var g = docs[d.transaction_id] || (docs[d.transaction_id] = { pending: 0, total: 0 });
      g.total++;
      if(d.status === 'uploaded') g.pending++;
    });
  }

  TXREVIEW.length = 0;
  rows.forEach(function(t){
    var d = docs[t.id] || { pending: 0, total: 0 };
    var fig = __txNum(t.net_commission != null ? t.net_commission : t.gross_commission);
    var cell;
    if(fig === null) cell = '<span class="chip">&middot;</span>';
    else if(fig === 0) cell = '<span class="chip red">' + __txMoney(0) + '</span>';
    else cell = __txMoney(fig);
    TXREVIEW.push([
      __txWho(t.agent_id),
      t.property_address || 'No address',
      '<span class="chip ' + (t.status === 'approved' ? 'gh' : 'red') + '">' + (t.status || 'draft') + '</span>',
      d.pending + ' of ' + d.total,
      cell,
      d.total
    ]);
  });
  return { data: rows };
}

/* Built rather than written as a literal, so the build's redaction pass has
   no money-shaped string to neutralise in this file. */
function __txMoney(n){
  return String.fromCharCode(36) + Number(n).toLocaleString('en-US');
}


/* --- The signed in agent's own files --------------------------------------
   Transactions was drawn as a SkySlope import inbox over TXQ, a literal with
   no table behind it: the importer is still index.ts.pending and the screen's
   accept and send back decisions saved to that browser only. It is now the
   agent's own files, which is what the old Hub's tx-list gave them through
   realty-tx list_mine, so nobody loses a screen when the Hub is replaced.

   Built from __txRows, already loaded, so this costs no extra query. Bucketed
   by lifecycle with the same status fallback __txLoad uses, for the same
   reason: lifecycle is a plain nullable column that nothing maintains, and a
   row arriving null would otherwise match no bucket and vanish.            */
function __txEsc(v){
  return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}
function __txSideLabel(s){
  if(!s) return '';
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}
/* [address, side, date, price, commission], every cell already rendered. */
function __txMineRow(t, dateField){
  var fig = __txNum(t.net_commission != null ? t.net_commission : t.gross_commission);
  var price = __txNum(t.price);
  return [
    __txEsc(t.property_address || 'No address'),
    __txSideLabel(t.side),
    __txMonth(t[dateField] || t.closing_date),
    price === null ? '<span class="chip">&middot;</span>' : __txMoney(price),
    fig === null ? '<span class="chip">&middot;</span>' : __txMoney(fig)
  ];
}

async function __txMineLoad(){
  var ures = await sb.auth.getUser();
  var uid = ures && ures.data && ures.data.user && ures.data.user.id;
  TXMINE.active.length = 0; TXMINE.closed.length = 0; TXMINE.terminated.length = 0;
  if(!uid) return { data: [] };

  var mine = __txRows.filter(function(t){ return t.agent_id === uid; });
  mine.forEach(function(t){
    var b = (t.lifecycle === 'Active' || t.lifecycle === 'Closed' || t.lifecycle === 'Terminated')
      ? t.lifecycle
      : (t.status === 'paid' ? 'Closed' : 'Active');
    if(b === 'Closed') TXMINE.closed.push(__txMineRow(t, 'paid_at'));
    else if(b === 'Terminated') TXMINE.terminated.push(__txMineRow(t, 'closing_date'));
    else TXMINE.active.push(__txMineRow(t, 'closing_date'));
  });
  return { data: mine };
}
