/* === Database, wired ===
   Injected into the design's IIFE at build time so it shares scope with DBP
   and the render functions. Nothing in the design was changed to make this
   fit; the loader maps each agent_contacts row onto the shape DBP already
   used, so every existing render path keeps working untouched.

   Every query and write below is copied from archive/hub-reference.md in
   AariRealty/recruiting2, which transcribes them from the live Hub with line
   numbers. Nothing here was written from scratch.

   Three corrections from the audit are applied:
   - No localStorage fallback on a failed write. A write either lands in
     Supabase or the row rolls back and says so.
   - The role axis is contact_type, not record_class. record_class is the
     client versus vendor axis.
   - Duplicates are out of this pass.                                        */

/* --- health engine, verbatim from hub_payload.html lines 6444 to 6483 --- */
function __dbDaysSince(dateStr){
  if(!dateStr) return null;
  var d=new Date(dateStr+'T00:00:00');
  if(isNaN(d.getTime())) return null;
  return Math.floor((Date.now()-d.getTime())/86400000);
}
function __dbCadenceAllowance(c){
  if(c && c.stage==='Lost')           return 36500;
  if(c && c.tier==='D')               return 36500;
  if(c && c.stage==='Under Contract') return 3;
  if(c && c.stage==='Closed')         return 90;
  var t = c && c.tier;
  return t==='A' ? 7 : t==='B' ? 14 : t==='C' ? 30 : 30;
}
function __dbHealth(c){
  if(c.record_class!=='client') return null;
  if(c.stage==='Lost') return null;
  if(c.tier==='D')     return null;
  if(c.last_touch==null) return 'untouched';
  var days=__dbDaysSince(c.last_touch);
  if(days==null) return 'untouched';
  var overdue=days - __dbCadenceAllowance(c);
  if(overdue<=0) return 'healthy';
  if(overdue<=7) return 'slipping';
  return 'leaking';
}

/* --- today, verbatim from hub_payload.html line 6435 --- */
function __dbToday(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

/* --- the raw rows behind DBP, keyed by contact id --- */
var __dbRows=[];
function __dbRowFor(p){ return p && p.id ? __dbRows.filter(function(r){return r.id===p.id;})[0] : null; }

/* --- household members, verbatim from hub_payload.html lines 6616 to 6626 --- */
function __dbHouseholdMembers(c){
  if(!c || !c.household_id) return c ? [c] : [];
  return __dbRows.filter(function(x){ return x.household_id===c.household_id; });
}

/* --- the cascade, verbatim from hub_payload.html lines 6661 to 6683 ---
   The one difference is the collection it reads: __dbRows here, __db.contacts
   there. The behaviour, including the (res.data||members) fallback the
   reference flags as an observation, is unchanged.                          */
async function __dbUpdateWithCascade(contactId, patch){
  var c = __dbRows.filter(function(x){return x.id===contactId;})[0];
  if(!c) return { data: null, error: {message:'contact not found'} };
  var members = __dbHouseholdMembers(c);
  var q;
  if(c.household_id){
    q = sb.from('agent_contacts').update(patch).eq('household_id', c.household_id).select();
  } else {
    q = sb.from('agent_contacts').update(patch).eq('id', contactId).select();
  }
  var res = await q;
  if(res.error) return res;
  (res.data||members).forEach(function(row){
    var local = __dbRows.filter(function(x){return x.id===row.id;})[0];
    if(local) Object.assign(local, row);
  });
  return res;
}

/* --- map one agent_contacts row onto the shape the design already reads ---
   The design keys people by name. That is fragile against duplicates, which
   are out of this pass, so the id travels alongside and every write uses it. */
function __dbMapRow(r){
  var health = __dbHealth(r);
  var st = health==='untouched' ? 'new'
         : health==='healthy'   ? 'ok'
         : health==='slipping'  ? 'slip'
         : health==='leaking'   ? 'leak' : 'new';
  var kind = r.record_class==='vendor' ? 'vendor' : (r.is_agent ? 'agent' : 'client');
  // Role axis is contact_type. Vendors and agents sit outside it.
  var role = kind==='agent'  ? 'agent'
           : kind==='vendor' ? 'none'
           : r.contact_type==='Buyer and Seller' ? 'both'
           : r.contact_type==='Buyer'  ? 'buyer'
           : r.contact_type==='Seller' ? 'seller'
           : 'unset';
  var quiet = __dbDaysSince(r.last_touch);
  return {
    id:   r.id,
    n:    r.full_name,
    t:    r.tier || null,
    ct:   r.contact_type || null,
    city: r.city || 'no address',
    st:   st,
    // null, not 0. tdPeople() does touch:(p.q==null?null:p.q) and the design
    // prints "Never touched" for null and "Touched Nd ago" for a number. A 0
    // here made every untouched contact read "Touched 0d ago".
    q:    quiet,
    ha:   r.home_anniversary ? [r.home_anniversary] : [],
    wa:   r.wedding_anniversary ? [r.wedding_anniversary] : null,
    own:  r.is_homeowner === true,
    em:   r.email ? 1 : 0,
    lg:   r.language || '',
    sg:   r.stage || 'New Lead',
    ar:   r.created_at ? String(r.created_at).slice(0,10) : '',
    r:    role,
    kind: kind,
    hh:   [],
    main: !r.household_id || r.household_primary === true
  };
}

/* --- fill in household partners once every row is mapped --- */
function __dbLinkHouseholds(list){
  var byHh={};
  __dbRows.forEach(function(r){
    if(!r.household_id) return;
    (byHh[r.household_id]=byHh[r.household_id]||[]).push(r);
  });
  list.forEach(function(p){
    var raw=__dbRowFor(p);
    if(!raw || !raw.household_id) return;
    p.hh = (byHh[raw.household_id]||[])
      .filter(function(x){ return x.id!==raw.id; })
      .map(function(x){ return x.full_name; });
  });
}

/* --- the read. Same column list the live Hub selects, plus the fields the
       design needs for gaps.                                                */
async function __dbLoad(){
  var ures = await sb.auth.getUser();
  var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
  if(!uid) return { error: { message: 'no session' } };
  var res = await sb.from('agent_contacts')
    .select('id,full_name,email,phone,contact_type,record_class,vendor_type,stage,tier,'+
            'last_touch,next_action,next_action_date,notes,db_state,snoozed_until,snooze_count,'+
            'street,city,state,postal_code,household_id,household_primary,pre_household_tier,'+
            'birthday,home_anniversary,wedding_anniversary,children,instagram_handle,'+
            'facebook_url,whatsapp_number,is_agent,is_business,is_homeowner,qualified,'+
            'language,do_not_market,gap_skips,created_at')
    .eq('agent_id', uid)
    .order('full_name', { ascending: true });
  if(res.error) return res;
  __dbRows = res.data || [];
  var mapped = __dbRows.map(__dbMapRow);
  __dbLinkHouseholds(mapped);
  DBP.length = 0;
  mapped.forEach(function(p){ DBP.push(p); });
  __dbStats();
  __tdMapIds();
  __dbFillContacts();
  return { data: __dbRows };
}

/* --- writes -------------------------------------------------------------
   Each one rolls the local row back on failure and says so. There is no
   localStorage fallback: a write that did not reach Supabase did not happen. */

/* Postpone. Copied from hub_payload.html lines 8536 to 8575. The exact
   equality at five is preserved as transcribed; archive/hub-reference.md
   section A explains why >= is safer and why it is not changed here. */
async function __dbPostpone(contactId, days){
  var c = __dbRows.filter(function(x){return x.id===contactId;})[0];
  if(!c) return { error: { message:'contact not found' } };
  var today = __dbToday();
  var newCount = (Number(c.snooze_count)||0) + 1;
  var d = new Date(today+'T00:00:00'); d.setDate(d.getDate()+days);
  var snoozedUntil = d.toISOString().slice(0,10);
  var patch = { snoozed_until: snoozedUntil, snooze_count: newCount };
  var noteToAppend = null;
  if(newCount === 5){
    if(c.tier === 'A'){ patch.tier = 'B'; noteToAppend = 'Auto-downgraded from tier A to B on '+today+': postponed 5 consecutive times without contact.'; }
    else if(c.tier === 'B'){ patch.tier = 'C'; noteToAppend = 'Auto-downgraded from tier B to C on '+today+': postponed 5 consecutive times without contact.'; }
    else { noteToAppend = 'Postponed 5 consecutive times at bottom tier C on '+today+'. Consider marking Lost or changing stage.'; }
  }
  if(noteToAppend){
    var existing = c.notes ? String(c.notes) : '';
    patch.notes = existing ? (existing + '\n\n' + noteToAppend) : noteToAppend;
  }
  var upd = await __dbUpdateWithCascade(contactId, patch);
  if(upd.error) return upd;
  __dbResync();
  return upd;
}

/* Tier. Copied from hub_payload.html lines 7356 to 7391, cascade and all. */
async function __dbSetTier(contactId, tier){
  var c = __dbRows.filter(function(x){return x.id===contactId;})[0];
  if(!c || c.tier === tier) return { data: null };
  var members = __dbHouseholdMembers(c);
  var prev = members.map(function(m){ return { id: m.id, tier: m.tier }; });
  members.forEach(function(m){ m.tier = tier; });
  __dbResync();
  var res = await __dbUpdateWithCascade(contactId, { tier: tier });
  if(res.error){
    prev.forEach(function(p){
      var m = __dbRows.filter(function(x){return x.id===p.id;})[0];
      if(m) m.tier = p.tier;
    });
    __dbResync();
  }
  return res;
}

/* Activity log plus last_touch. Copied from hub_payload.html lines 7492 to
   7521. The insert and the update are two writes with no transaction, which
   archive/hub-reference.md flags as an observation; carried as transcribed.

   The column names are 'type' and 'occurred_on', and occurred_on is a DATE.
   An earlier version of this function wrote 'activity_type' and
   'occurred_at', which do not exist, so every log threw. Stub tests did not
   catch it because the stub accepted whatever it was handed. Copied from the
   payload now rather than remembered.                                       */
var __dbRecentLog = {};
async function __dbLogActivity(contactId, type, note){
  var today = __dbToday();
  // Duplicate guard, as the live Hub has at line 7492: a second tap inside
  // the same day is the same conversation, not two.
  if(__dbRecentLog[contactId] === today){
    return { data: null, duplicate: true };
  }
  var ures = await sb.auth.getUser();
  var uid  = ures && ures.data && ures.data.user && ures.data.user.id;
  if(!uid) return { error: { message:'no session' } };
  var ins = await sb.from('agent_activity').insert({
    agent_id: uid,
    contact_id: contactId,
    type: type || 'conversation',
    occurred_on: today,
    note: note || null
  }).select();
  if(ins.error) return ins;
  var upd = await __dbUpdateWithCascade(contactId, {
    last_touch: today, db_state: 'active', snoozed_until: null, snooze_count: 0
  });
  if(upd.error) return upd;
  __dbRecentLog[contactId] = today;
  __dbResync();
  return upd;
}

/* db_state promotion. Copied from hub_payload.html lines 7523 to 7539. */
async function __dbStartWorking(contactId){
  var upd = await __dbUpdateWithCascade(contactId, { db_state: 'active' });
  if(!upd.error) __dbResync();
  return upd;
}

/* Re-map the raw rows into DBP in place and repaint. DBP is never replaced,
   only refilled, because the design holds a reference to it. */
function __dbResync(){
  var mapped = __dbRows.map(__dbMapRow);
  __dbLinkHouseholds(mapped);
  DBP.length = 0;
  mapped.forEach(function(p){ DBP.push(p); });
  __dbStats();
  __tdMapIds();
  __dbFillContacts();
  try{ render(); }catch(e){ console.error('render after write', e); }
}

/* The session layer calls this once the member gate has passed. */
window.hubOnSession = async function(session, member){
  // The plan page reads the member record. hubShowApp already passes it;
  // nothing was holding on to it.
  if(member) window.__hubMe = member;
  try{
    var res = await __dbLoad();
    if(res.error){ console.error('database load', res.error); return; }
    await __tdLoadLoggedToday();
    var tx = await __txLoad();
    if(tx && tx.error) console.error('transactions load', tx.error);
    // The disbursement queue is its own query: a different status filter and a
    // document count the Deals arrays do not carry.
    try{ var txr = await __txReviewLoad(); if(txr && txr.error) console.error('tx review load', txr.error); }
    catch(e){ console.error('tx review load', e); }
    // after transactions, because the roster counts closed files from them
    try{ await __tmLoad(); }catch(e){ console.error('team load', e); }
    try{ __plIdentity(); }catch(e){ console.error('identity', e); }
    try{ await __tbLoad(); }catch(e){ console.error('toolbox load', e); }
    try{ await __calLoad(); }catch(e){ console.error('calendar load', e); }
    try{ await __lgLoad(); }catch(e){ console.error('brand load', e); }
    try{ await __goalLoad(); }catch(e){ console.error('goal load', e); }
    // render() after the goal, not before: the cover reads GOAL, and loading
    // it without repainting left the cover still saying no goal was saved.
    render();
  }catch(e){ console.error('hubOnSession', e); }
};
window.__dbPostpone=__dbPostpone;
window.__dbSetTier=__dbSetTier;
window.__dbLogActivity=__dbLogActivity;
window.__dbStartWorking=__dbStartWorking;

/* --- counts, computed rather than frozen ---------------------------------
   The design carried a DBN object of whole-book figures captured on 18
   August, and three filter lists whose chip counts were frozen the same way.
   That is the same class of bug as the live Hub's "201 of 202", where the
   202 was a constant, so these are all derived now. DBN keeps its identity
   as an object the design closes over; only its fields are rewritten.       */
function __dbStats(){
  var rows = __dbRows;
  var clients = rows.filter(function(r){ return r.record_class==='client' && !r.is_agent; });
  // Households count once, the same way the list draws them.
  var hhSeen={}, book=0;
  clients.forEach(function(r){
    if(r.household_id){ if(hhSeen[r.household_id]) return; hhSeen[r.household_id]=1; }
    book++;
  });
  var hhIds=Object.keys(hhSeen).filter(function(h){
    return clients.filter(function(r){return r.household_id===h;}).length>1;
  });
  var byHealth={leak:0,slip:0,ok:0,never:0};
  clients.forEach(function(r){
    var h=__dbHealth(r);
    if(h==='leaking') byHealth.leak++;
    else if(h==='slipping') byHealth.slip++;
    else if(h==='healthy') byHealth.ok++;
    else byHealth.never++;
  });
  var tier=function(t){ return clients.filter(function(r){return r.tier===t;}).length; };
  var has =function(f){ return clients.filter(f).length; };

  DBN.total   = book;
  DBN.raw     = rows.length;
  DBN.A       = tier('A'); DBN.B = tier('B'); DBN.C = tier('C');
  DBN.never   = byHealth.never;
  DBN.leak    = byHealth.leak;
  DBN.slip    = byHealth.slip;
  DBN.ok      = byHealth.ok;
  DBN.snooze  = has(function(r){ return !!r.snoozed_until; });
  DBN.hh      = hhIds.length;
  DBN.hhrows  = clients.filter(function(r){ return r.household_id && hhIds.indexOf(r.household_id)>=0; }).length;
  DBN.homeann = has(function(r){ return !!r.home_anniversary; });
  DBN.wedann  = has(function(r){ return !!r.wedding_anniversary; });
  DBN.dated   = has(function(r){ return !!(r.home_anniversary || r.wedding_anniversary || r.birthday); });
  DBN.undated = clients.length - DBN.dated;
  DBN.placed  = has(function(r){ return !!(r.city || r.street); });
  DBN.noaddr  = clients.length - DBN.placed;
  DBN.phone   = has(function(r){ return !!(r.phone && String(r.phone).trim()); });
  DBN.mail    = has(function(r){ return !!r.email; });
  DBN.phoneonly = has(function(r){ return !!(r.phone && String(r.phone).trim()) && !r.email; });
  DBN.unreachable = has(function(r){ return !(r.phone && String(r.phone).trim()) && !r.email; });
  DBN.social  = has(function(r){ return !!(r.instagram_handle || r.facebook_url || r.whatsapp_number); });
  DBN.es      = has(function(r){ return r.language==='es'; });
  DBN.en      = has(function(r){ return r.language==='en'; });
  DBN.nolang  = clients.length - DBN.es - DBN.en;
  DBN.clients = clients.length;
  DBN.vendors = rows.filter(function(r){ return r.record_class==='vendor'; }).length;

  // The Today queue chip read "3 of 22 tier A" with 22 frozen. Same family of
  // bug as dbDue's 201.
  try{ TD.tierA = DBN.A; }catch(e){}

  // The import line is a claim about history the Hub cannot make from these
  // columns. Rather than show a plausible date, say nothing.
  DBN.imported  = null;
  DBN.importday = null;
  DBN.importage = null;

  // Filter chip counts. Third element of each row is the count.
  var countBy=function(list, keyOf){
    list.forEach(function(row){
      row[2] = DBP.filter(function(p){ return keyOf(p)===row[0]; }).length;
    });
  };
  countBy(DBTIER,  function(p){ return p.t; });
  countBy(DBROLE,  function(p){ return dbRoleKey(p); });
  countBy(DBSTATE, function(p){ return p.st; });
  DBGAP.forEach(function(g){
    g[2] = DBP.filter(function(p){ return dbGaps(p).indexOf(g[0])>=0; }).length;
  });
}

/* --- dbDue, computed --------------------------------------------------------
   The design returned {A:22,B:78,C:101,total:201-logged}. Those are frozen
   18 August figures and the 201 is a constant, which is the identical bug
   found on the live Hub and reported as "201 of 202". Recomputing it here
   rather than leaving the same mistake in the replacement.

   Overdue means past the contact's own cadence allowance, which is exactly
   what __dbHealth calls slipping or leaking. Never touched counts as overdue
   too: a contact with no last_touch is not on cadence, they are unstarted.  */
dbDue = function(){
  var out = { A:0, B:0, C:0, total:0 };
  var logged = {};
  try{ Object.keys(dbLogged||{}).forEach(function(n){ logged[n]=1; }); }catch(e){}
  __dbRows.forEach(function(r){
    if(r.record_class!=='client' || r.is_agent) return;
    var h = __dbHealth(r);
    if(h===null) return;                       // tier D and Lost are excluded
    if(h==='healthy') return;                  // inside cadence
    if(logged[r.full_name]) return;            // spoken to today
    if(r.tier==='A') out.A++;
    else if(r.tier==='B') out.B++;
    else if(r.tier==='C') out.C++;
    out.total++;
  });
  return out;
};
