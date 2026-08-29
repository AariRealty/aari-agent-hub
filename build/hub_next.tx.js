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
