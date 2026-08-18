// The review queue behind an imported transaction.
//
// An imported row waits on the agent it belongs to. They accept it, propose a
// correction, or say it is not theirs. A proposed correction is written to
// realty_transaction_edits and does NOT touch realty_transactions until the
// broker approves it — approving applies every proposed field, declining puts
// the file back to waiting and leaves the proposal on the record either way.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS: Record<string,string> = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const json = (b: unknown, s=200) =>
  new Response(JSON.stringify(b), { status:s, headers:{...CORS,'Content-Type':'application/json'} });

// Only these can be corrected by an agent. Anything else is ignored rather
// than trusted.
const EDITABLE = new Set(['price','gross_commission','company_fee','closing_date','client_name','side']);
const NUMERIC  = new Set(['price','gross_commission','company_fee']);

Deno.serve(async (req: Request) => {
  if(req.method === 'OPTIONS') return new Response('ok',{headers:CORS});
  if(req.method !== 'POST') return json({error:'method_not_allowed'}, 405);

  const url  = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const svc  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const jwt = (req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt) return json({error:'no_auth'}, 401);

  const anonClient = createClient(url, anon, { global:{ headers:{ Authorization:`Bearer ${jwt}` } } });
  const { data: u, error: uErr } = await anonClient.auth.getUser();
  if(uErr || !u?.user) return json({error:'invalid_token'}, 401);
  const uid = u.user.id;

  const admin = createClient(url, svc);
  const { data: me } = await admin.from('realty_members')
    .select('role,status,full_name').eq('user_id', uid).maybeSingle();
  if(!me) return json({error:'not_a_member'}, 403);
  if(me.status !== 'active') return json({error:'inactive_member'}, 403);
  const isBroker = me.role === 'broker';

  let body: any; try { body = await req.json(); } catch { return json({error:'bad_json'}, 400); }
  const action = String(body?.action||'');
  const txId   = body?.transaction_id ? String(body.transaction_id) : '';

  // ---- list ---------------------------------------------------------------
  if(action === 'list'){
    let q = admin.from('realty_transactions')
      .select('id,agent_id,property_address,client_name,side,price,closing_date,status,tx_type,'+
              'gross_commission,company_fee,review_state,review_at,review_note,'+
              'import_source,import_batch,external_id')
      .not('review_state','is',null)
      .order('closing_date',{ ascending:false, nullsFirst:false });
    if(!isBroker) q = q.eq('agent_id', uid);
    const { data: txs, error } = await q;
    if(error) return json({error:'list_failed', detail:error.message}, 500);

    const ids = (txs||[]).map((t:any)=>t.id);
    let edits: any[] = [];
    if(ids.length){
      const { data } = await admin.from('realty_transaction_edits')
        .select('*').in('transaction_id', ids).order('created_at',{ascending:false});
      edits = data||[];
    }
    const names = new Map<string,string>();
    const { data: mem } = await admin.from('realty_members').select('user_id,full_name');
    (mem||[]).forEach((m:any)=> names.set(m.user_id, m.full_name));

    return json({ ok:true, broker:isBroker, transactions:(txs||[]).map((t:any)=>({
      ...t, agent_name: names.get(t.agent_id) || null,
      edits: edits.filter(e=>e.transaction_id===t.id)
    })) });
  }

  if(!txId) return json({error:'transaction_id_required'}, 400);
  const { data: tx } = await admin.from('realty_transactions')
    .select('*').eq('id', txId).maybeSingle();
  if(!tx) return json({error:'not_found'}, 404);

  const mine = tx.agent_id === uid;
  const now  = new Date().toISOString();

  // ---- the agent's own answer --------------------------------------------
  if(action === 'accept' || action === 'reject'){
    if(!mine && !isBroker) return json({error:'not_your_file'}, 403);
    const { error } = await admin.from('realty_transactions').update({
      review_state: action === 'accept' ? 'accepted' : 'rejected',
      review_by: uid, review_at: now,
      review_note: action === 'reject' ? String(body?.note||'') : null,
      updated_at: now
    }).eq('id', txId);
    if(error) return json({error:'update_failed', detail:error.message}, 500);
    return json({ ok:true, review_state: action === 'accept' ? 'accepted' : 'rejected' });
  }

  // ---- a proposed correction ---------------------------------------------
  if(action === 'propose'){
    if(!mine && !isBroker) return json({error:'not_your_file'}, 403);
    const changes = body?.changes && typeof body.changes === 'object' ? body.changes : {};
    const note = String(body?.note||'');
    const rows: any[] = [];
    for(const [field, raw] of Object.entries(changes)){
      if(!EDITABLE.has(field)) continue;
      const oldV = tx[field] == null ? null : String(tx[field]);
      const newV = raw == null || raw === '' ? null : String(raw);
      if(oldV === newV) continue;
      if(NUMERIC.has(field) && newV !== null && isNaN(Number(newV)))
        return json({error:'not_a_number', field}, 400);
      rows.push({ transaction_id: txId, proposed_by: uid, field,
                  old_value: oldV, new_value: newV, note, state:'proposed' });
    }
    if(!rows.length && !note) return json({error:'nothing_proposed'}, 400);

    // supersede anything still open on this file, so approving cannot apply
    // two different answers to the same field
    await admin.from('realty_transaction_edits')
      .update({ state:'declined', resolved_by: uid, resolved_at: now })
      .eq('transaction_id', txId).eq('state','proposed');
    if(rows.length){
      const { error } = await admin.from('realty_transaction_edits').insert(rows);
      if(error) return json({error:'edit_insert_failed', detail:error.message}, 500);
    }
    await admin.from('realty_transactions').update({
      review_state:'edited', review_by: uid, review_at: now, review_note: note, updated_at: now
    }).eq('id', txId);
    return json({ ok:true, review_state:'edited', proposed: rows.length });
  }

  // ---- the broker's answer on a correction ------------------------------------
  if(action === 'approve' || action === 'decline'){
    if(!isBroker) return json({error:'broker_only'}, 403);
    const { data: open } = await admin.from('realty_transaction_edits')
      .select('*').eq('transaction_id', txId).eq('state','proposed');
    if(!open || !open.length) return json({error:'nothing_to_resolve'}, 400);

    if(action === 'approve'){
      const patch: Record<string, any> = { updated_at: now };
      for(const e of open){
        patch[e.field] = e.new_value === null ? null
          : (NUMERIC.has(e.field) ? Number(e.new_value) : e.new_value);
      }
      patch.review_state = 'accepted';
      patch.review_by = uid; patch.review_at = now;
      const { error } = await admin.from('realty_transactions').update(patch).eq('id', txId);
      if(error) return json({error:'apply_failed', detail:error.message}, 500);
    } else {
      // nothing on the transaction was ever changed, so there is nothing to
      // roll back — it just goes back to waiting on the agent
      await admin.from('realty_transactions').update({
        review_state:'pending', review_note:null, review_by:null, review_at:null, updated_at: now
      }).eq('id', txId);
    }
    await admin.from('realty_transaction_edits')
      .update({ state: action === 'approve' ? 'approved' : 'declined',
                resolved_by: uid, resolved_at: now })
      .eq('transaction_id', txId).eq('state','proposed');
    return json({ ok:true, resolved: open.length,
                  review_state: action === 'approve' ? 'accepted' : 'pending' });
  }

  return json({error:'unknown_action', action}, 400);
});
