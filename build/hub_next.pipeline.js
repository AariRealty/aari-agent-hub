
/* === Your pipeline, wired ================================================
   The design's version of this screen was three cards written around one
   person's file: an address, a closing date and two closed deals typed into
   the markup. Every agent who opened it would have read the broker's
   transactions as their own. There was nothing to wire, so this is written
   rather than connected.

   It reads the rows __txLoad already fetched, filtered to the signed-in
   agent, so there is no second query and no second copy.

   WHAT THE DATA WILL NOT SUPPORT, checked before writing it:
     net_commission is null on every row in the table. So "what you keep" has
     no source and is not shown. gross_commission is the commission on the
     deal, not the agent's share, and it is labelled as that.
     realty_tx_deadlines is empty and effective_date is set on one row out of
     fifty six, so there are no deadlines to show and no deadline column.
   A cell with no figure behind it renders as a middle dot. A zero would be a
   claim that the number is nought.                                        */

function __ppMoney(v){
  return (v === null || v === undefined || v === '')
    ? '<span class="num">&middot;</span>'
    : '<span class="num">$'+Number(v).toLocaleString('en-US',
        {minimumFractionDigits:2, maximumFractionDigits:2})+'</span>';
}

function __ppDate(d){
  if(!d) return '&middot;';
  var t = __txMonth(d);
  return t || '&middot;';
}

/* Past its closing date and never submitted is the one thing on this screen
   worth a colour. It is also the only judgement it makes. */
function __ppLate(t){
  if(!t.closing_date) return false;
  if(t.status === 'paid' || t.lifecycle === 'Closed' || t.lifecycle === 'Terminated') return false;
  return new Date(String(t.closing_date).slice(0,10)+'T00:00:00') < new Date(new Date().toDateString());
}

function __ppBucket(t){
  if(t.lifecycle === 'Active' || t.lifecycle === 'Closed' || t.lifecycle === 'Terminated') return t.lifecycle;
  return t.status === 'paid' ? 'Closed' : 'Active';
}

function pagePipeline(){
  var me  = window.__hubMe || {};
  var uid = me.user_id;
  if(!uid){
    return '<div class="card wide anim"><div class="ch"><h2>Your pipeline</h2></div>'+
      '<div class="pbempty">Not signed in.</div></div>';
  }

  var mine = __txRows.filter(function(t){ return t.agent_id === uid; });
  var open = mine.filter(function(t){ return __ppBucket(t) === 'Active'; })
                 .sort(function(a,b){
                   return String(a.closing_date||'9999').localeCompare(String(b.closing_date||'9999')); });
  var closed = mine.filter(function(t){ return __ppBucket(t) === 'Closed'; })
                   .sort(function(a,b){
                     return String(b.paid_at||b.closing_date||'').localeCompare(String(a.paid_at||a.closing_date||'')); });
  var gone = mine.filter(function(t){ return __ppBucket(t) === 'Terminated'; });
  var listings = __txListings.filter(function(l){ return l.agent_id === uid; });

  var year = new Date().getFullYear();
  var closedThisYear = closed.filter(function(t){
    return String(t.paid_at || t.closing_date || '').slice(0,4) === String(year); });
  var gross = null, counted = 0;
  closedThisYear.forEach(function(t){
    if(t.gross_commission != null){ gross = (gross||0) + Number(t.gross_commission); counted++; }
  });

  var late = open.filter(__ppLate);
  var drafts = open.filter(function(t){ return t.status === 'draft'; });

  /* --- open files ------------------------------------------------------- */
  var openCard = '<div class="card wide anim">'+
    head('Your open files', '<span class="chip'+(late.length?' red':' gh')+'">'+
      open.length+' open'+(late.length?' &middot; '+late.length+' past the date':'')+'</span>')+
    (open.length
      ? table(['Property','Side','Status','Closing','Commission'],
          open.map(function(t){
            return td([
              nm(__tbEsc(t.property_address || 'No address'),
                 /* escape each part, then join with the entity: escaping the
                    joined string turned the separator into literal "&middot;"
                    on screen. */
                 [t.client_name, t.contract_type].filter(Boolean)
                   .map(__tbEsc).join(' &middot; ')),
              t.side || '&middot;',
              '<span class="chip'+(t.status==='draft'?'':' gh')+'">'+(t.status||'draft')+'</span>',
              __ppLate(t)
                ? '<b style="color:var(--bad)">'+__ppDate(t.closing_date)+'</b>'
                : __ppDate(t.closing_date),
              __ppMoney(t.gross_commission)
            ]);
          }))
      : '<div class="pbempty">No open files on your name.</div>')+
    '<div class="note">Commission is the gross on the file, not your share. '+
      'net_commission is empty on every row in the table, so the Hub cannot work out what you keep '+
      'and does not guess. Your split is on My plan; the signed ICA is what settles it.'+
      (drafts.length
        ? ' <b>'+drafts.length+' of these '+(drafts.length===1?'is':'are')+' still a draft</b>, which '+
          'means the broker has not been sent '+(drafts.length===1?'it':'them')+' yet.'
        : '')+
    '</div></div>';

  /* --- listings --------------------------------------------------------- */
  var listCard = '<div class="card warm wide anim">'+
    head('Your listings', '<span class="chip gh">'+listings.length+
      (listings.length===1?' live':' live')+'</span>')+
    (listings.length
      ? table(['Property','Type','List price','Showings'],
          listings.map(function(l){
            return td([
              nm(__tbEsc(l.property_address || 'No address'),
                 l.mls_number ? 'MLS '+__tbEsc(l.mls_number) : ''),
              l.listing_type || 'Sale',
              l.list_price == null ? '<span class="num">&middot;</span>'
                : '<span class="num">'+money(Number(l.list_price))+'</span>',
              '<span class="num">'+(Number(l.showings)||0)+'</span>'
            ]);
          }))
      : '<div class="pbempty">Nothing listed on your name.</div>')+
    '<div class="note">List date, expiry and showing history are not columns on realty_listings, so '+
      'none of them is shown. Showings is whatever was last written to the row.</div></div>';

  /* --- closed ----------------------------------------------------------- */
  var closedCard = '<div class="card wide anim">'+
    head('Your closings', '<span class="chip gh">'+closed.length+' file'+(closed.length===1?'':'s')+
      (counted ? ' &middot; $'+Math.round(gross).toLocaleString('en-US') : '')+'</span>')+
    (closed.length
      ? table(['Property','Side','Closed','Commission'],
          closed.map(function(t){
            return td([
              nm(__tbEsc(t.property_address || 'No address'), ''),
              t.side || '&middot;',
              __ppDate(t.paid_at || t.closing_date),
              __ppMoney(t.gross_commission)
            ]);
          }))
      : '<div class="pbempty">No closed files on your name.</div>')+
    '<div class="note">'+
      (closed.length === 0 ? 'Nothing to total.'
        : counted === closedThisYear.length && counted > 0
          ? 'The '+year+' total covers all '+counted+' of your closings this year.'
          : counted === 0
            ? 'No commission figure is recorded on any of your closed files, so there is no total to show.'
            : 'The '+year+' total covers '+counted+' of your '+closedThisYear.length+
              ' closings this year. The rest carry no commission figure and are left out rather than '+
              'counted as nought.')+
    '</div></div>'+
    (gone.length
      ? '<div class="card wide anim">'+head('Fell through','<span class="chip">'+gone.length+'</span>')+
        table(['Property','Side','Was closing'],
          gone.map(function(t){
            return td([ nm(__tbEsc(t.property_address || 'No address'), ''),
                        t.side || '&middot;', __ppDate(t.closing_date) ]);
          }))+
        '<div class="note">Terminated files, kept because they are still yours and still count '+
        'toward the work you did.</div></div>'
      : '');

  return openCard + listCard + closedCard;
};

/* The footnote under the grid, keyed by the sub-tab label. The design's
   entries for these three were written on 18 August and asserted counts
   ("All 100 geocoded rows", "your 56 files") and, on two of them, that
   saving went to the browser rather than the table. Two of those claims are
   now false and the counts were always going to rot, so these describe where
   the screen reads from and stop counting. */
TABFOOT['Pipeline'] =
  'Your files and listings out of realty_transactions and realty_listings, filtered to you. ' +
  'Commission shown is the gross on the file; net_commission is empty on every row in the table, ' +
  'so what you keep is not calculated here.';
TABFOOT['Transactions'] =
  'Not built. This screen is a review inbox for a weekly import, and there is no table behind it: ' +
  'realty_transactions has no column for an agent’s answer and no import queue exists. Your ' +
  'files are on Pipeline.';
TABFOOT['Pop bys'] =
  'Your contacts with coordinates, out of agent_contacts, with the working Hub’s own ranking ' +
  'and route seeding. Marking a stop delivered writes a pop_by to your activity record and moves ' +
  'the contact’s last touch. The route itself is kept in this browser. No map tiles: pins are ' +
  'drawn from stored coordinates and distances are straight-line.';
TABFOOT['Goal Engine'] =
  'The same nine inputs and the same arithmetic as the working Hub, reading and saving your row in ' +
  'realty_agent_goals for this year. Everything else that quotes a weekly or daily number, the ' +
  'Today board and the pop-by target among them, is computed from what you save here.';
