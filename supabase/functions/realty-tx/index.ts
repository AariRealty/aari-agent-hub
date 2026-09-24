import { createClient } from 'jsr:@supabase/supabase-js@2'

const URL_ = Deno.env.get('SUPABASE_URL')!
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = 'Aari Realty Hub <broker@aarirealty.com>'
const BUCKET = 'realty-tx-docs'
const MAX_BYTES = 15 * 1024 * 1024

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TYPE_LABELS: Record<string, string> = {
  residential_sale: 'Residential Sale',
  residential_lease: 'Residential Lease',
  commercial_sale: 'Commercial Sale',
  commercial_lease: 'Commercial Lease',
  vacant_land: 'Vacant Land',
}
const PLAN_SPLIT: Record<string, number> = { '75_25': 0.75, '85_15': 0.85, '100_max': 1.0 }
const PLAN_INFO: Record<string, { label: string; monthly: number }> = {
  '75_25': { label: '75 / 25 Split', monthly: 59 },
  '85_15': { label: '85 / 15 Split', monthly: 79 },
  '100_max': { label: '100% Max', monthly: 99 },
}
const QUARTERLY_FEE = { amount: 99, label: 'Quarterly Brokerage Access Fee', effective: '2026-08-01' }

// ---------------- Stage 1.5 commission engine ----------------
// Single source of truth for net-to-agent math. Used by mark_paid, quick_log (paid branch),
// and fix_paid_commission. Never duplicate this math inline elsewhere.
const RENTAL_FEE_CUTOVER = '2026-08-23'
const RENTAL_FEE_CURRENT = 99

function resolveTransactionFee(txType: string, closingDate: string | null, explicitFee: number | null | undefined): { fee: number | null; source: string } {
  if (explicitFee !== undefined && explicitFee !== null && explicitFee !== '' as unknown) return { fee: Number(explicitFee), source: 'explicit' }
  if (txType === 'residential_sale') return { fee: 499, source: 'table' }
  if (txType === 'vacant_land') return { fee: 299, source: 'table' }
  if (txType === 'residential_lease') {
    if (!closingDate) return { fee: null, source: 'residential_lease requires a closing_date to resolve the fee (rate changed 2026-08-23); supply transaction_fee explicitly or set closing_date.' }
    if (closingDate >= RENTAL_FEE_CUTOVER) return { fee: RENTAL_FEE_CURRENT, source: 'table' }
    return { fee: null, source: 'residential_lease closing before 2026-08-23 uses the prior rate, which is not on file. Supply transaction_fee explicitly.' }
  }
  return { fee: null, source: `no fee table entry for tx_type '${txType}' (commercial_sale/commercial_lease). Supply transaction_fee explicitly.` }
}

function computeCommission(input: {
  gross_commission: number
  referral_amount: number
  agent_split: number | null // fraction 0-1; ignored for company-lead
  transaction_fee: number
  other_deductions: number
  is_company_lead: boolean
}): { base: number; net_to_agent: number; company_dollar: number; formula: 'standard' | 'company_lead' } {
  const gross = input.gross_commission
  const referral = input.referral_amount || 0
  const fee = input.transaction_fee
  const otherDed = input.other_deductions || 0

  if (input.is_company_lead) {
    // Company lead: fee comes off the top before the 50/50 split, since both sides share it.
    // net_to_agent and company_dollar are each half of base; note this means
    // net_to_agent + company_dollar + referral_amount does NOT equal gross_commission for
    // company-lead files (the fee is carved out pre-split and isn't assigned to either bucket) —
    // this is a known, deliberate deviation from the standard-file reconciliation identity.
    const base = round2(gross - referral - fee)
    const net_to_agent = round2(base * 0.5)
    const company_dollar = round2(base - net_to_agent)
    return { base, net_to_agent, company_dollar, formula: 'company_lead' }
  }

  // Standard file (75/25, 85/15, 100% Max). Referral off the top first, fee comes out of the
  // agent's side after the split (Exhibit A + rental fee notice: fee is deducted from the
  // agent's commission at closing).
  const split = input.agent_split
  if (split === null || split === undefined || !(split > 0)) throw new Error('agent_split not resolvable')
  const base = round2(gross - referral)
  const agent_share = round2(base * split)
  const net_to_agent = round2(agent_share - fee - otherDed)
  const company_dollar = round2(gross - referral - net_to_agent)
  return { base, net_to_agent, company_dollar, formula: 'standard' }
}

async function audit(actorId: string, actorType: string, action: string, targetTable: string, targetId: string | null, details: Record<string, unknown>, req: Request) {
  try {
    await admin.from('audit_log').insert({
      actor_id: actorId, actor_type: actorType, action, target_table: targetTable, target_id: targetId, details,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent') || null,
    })
  } catch (_e) { /* non-blocking */ }
}
async function notify(recipientId: string, nType: string, body: string, txId: string | null, docId: string | null) {
  try { await admin.from('realty_notifications').insert({ recipient_id: recipientId, n_type: nType, body, transaction_id: txId, document_id: docId }) } catch (_e) { /* */ }
}
async function email(to: string | null, subject: string, text: string) {
  if (!RESEND_KEY || !to) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    })
  } catch (_e) { /* non-blocking */ }
}
async function activeBrokers() {
  const { data } = await admin.from('realty_members').select('user_id, email, full_name').eq('role', 'broker').eq('status', 'active')
  return data ?? []
}
function sanitize(name: string) {
  return (name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120)
}
function yearStart(): string {
  return new Date(new Date().getFullYear(), 0, 1).toISOString()
}
function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

function resolveAgentSplit(agentMember: { commission_plan?: string | null; agent_split?: number | string | null } | null): number | null {
  const raw = agentMember?.agent_split
  if (raw !== undefined && raw !== null) return Number(raw)
  if (agentMember?.commission_plan && PLAN_SPLIT[agentMember.commission_plan]) return PLAN_SPLIT[agentMember.commission_plan]
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return j({ error: 'method_not_allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user }, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !user) return j({ error: 'unauthorized' }, 401)

  const { data: member } = await admin.from('realty_members').select('user_id, role, status, full_name, email, commission_plan, agent_split, fee_exempt').eq('user_id', user.id).maybeSingle()
  if (!member || member.status !== 'active') return j({ error: 'forbidden' }, 403)
  const isBroker = member.role === 'broker'
  const actorType = isBroker ? 'realty_broker' : 'realty_member'

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')

  // ---------------- create ----------------
  if (action === 'create') {
    const txType = String(body.tx_type ?? '')
    const address = String(body.property_address ?? '').trim()
    if (!TYPE_LABELS[txType]) return j({ error: 'invalid tx_type' }, 400)
    if (!address) return j({ error: 'property_address required' }, 400)
    const { data: checklist } = await admin.from('realty_tx_checklists').select('*').eq('tx_type', txType).order('sort')
    if (!checklist?.length) return j({ error: 'no checklist for type' }, 500)

    const { data: tx, error: tErr } = await admin.from('realty_transactions').insert({
      agent_id: user.id,
      tx_type: txType,
      property_address: address,
      client_name: String(body.client_name ?? '').trim() || null,
      side: String(body.side ?? '').trim() || null,
      price: body.price ? Number(body.price) : null,
      closing_date: body.closing_date || null,
      notes: String(body.notes ?? '').trim() || null,
      gross_commission: body.gross_commission ? Number(body.gross_commission) : null,
    }).select().single()
    if (tErr || !tx) return j({ error: tErr?.message ?? 'create failed' }, 500)

    const docRows = checklist.map((c) => ({ transaction_id: tx.id, doc_key: c.doc_key, label: c.label, required: c.required, sort: c.sort }))
    const { error: dErr } = await admin.from('realty_tx_documents').insert(docRows)
    if (dErr) { await admin.from('realty_transactions').delete().eq('id', tx.id); return j({ error: dErr.message }, 500) }
    await audit(user.id, actorType, 'realty_tx_create', 'realty_transactions', tx.id, { tx_type: txType, address }, req)
    return j({ ok: true, transaction: tx })
  }

  // ---------------- quick_log (broker shadow entry for SkySlope deals) ----------------
  if (action === 'quick_log') {
    const targetAgentId = String(body.agent_id ?? '').trim() || user.id
    const address = String(body.property_address ?? '').trim()
    const status = String(body.status ?? 'submitted')
    if (!address) return j({ error: 'property_address required' }, 400)
    if (!['submitted', 'paid'].includes(status)) return j({ error: 'status must be submitted or paid' }, 400)
    if (targetAgentId !== user.id && !isBroker) return j({ error: 'only brokers can log a deal on behalf of another agent' }, 403)
    const { data: targetAgent } = await admin.from('realty_members').select('user_id, full_name, status, commission_plan, agent_split').eq('user_id', targetAgentId).maybeSingle()
    if (!targetAgent || targetAgent.status !== 'active') return j({ error: 'agent not found or inactive' }, 400)

    const txType = String(body.tx_type ?? 'residential_sale')
    if (!TYPE_LABELS[txType]) return j({ error: 'invalid tx_type' }, 400)

    const now = new Date().toISOString()
    const closingDate = body.closing_date || null
    const paidAt = status === 'paid' ? ((closingDate ? closingDate + 'T12:00:00Z' : now)) : null

    // Stage 1.5: quick-logging as paid with gross_commission runs the same commission engine
    // mark_paid uses. Referral / company-lead default to none unless explicitly supplied —
    // never guessed. Fee auto-resolves only where the table is deterministic; otherwise this
    // call fails asking for transaction_fee explicitly rather than assuming one.
    let insertExtra: Record<string, unknown> = {}
    if (status === 'paid' && body.gross_commission !== undefined && body.gross_commission !== null && body.gross_commission !== '') {
      const gross = Number(body.gross_commission)
      if (!(gross > 0)) return j({ error: 'gross_commission must be a positive number' }, 400)
      const isCompanyLead = !!body.is_company_lead
      const split = isCompanyLead ? null : resolveAgentSplit(targetAgent)
      if (!isCompanyLead && (split === null || !(split > 0))) return j({ error: 'This agent has no split on file. Set their plan in the Control Panel roster first, or log this deal as submitted and pay it through the normal review queue.' }, 400)
      const feeRes = resolveTransactionFee(txType, closingDate, body.transaction_fee)
      if (feeRes.fee === null) return j({ error: 'transaction_fee could not be resolved: ' + feeRes.source }, 400)
      const referralAmount = body.referral_amount !== undefined && body.referral_amount !== null && body.referral_amount !== ''
        ? round2(Number(body.referral_amount))
        : (body.referral_pct ? round2(gross * Number(body.referral_pct) / 100) : 0)
      if (referralAmount < 0) return j({ error: 'referral_amount cannot be negative' }, 400)
      const otherDed = round2(Number(body.other_deductions ?? 0) || 0)
      if (otherDed < 0) return j({ error: 'other_deductions cannot be negative' }, 400)
      let calc
      try { calc = computeCommission({ gross_commission: round2(gross), referral_amount: referralAmount, agent_split: split, transaction_fee: feeRes.fee, other_deductions: otherDed, is_company_lead: isCompanyLead }) }
      catch (e) { return j({ error: (e as Error).message }, 400) }
      if (calc.net_to_agent < 0) return j({ error: 'Net to agent computes negative ($' + calc.net_to_agent + '). Check gross, referral, and fee before logging this as paid.' }, 400)
      insertExtra = {
        gross_commission: round2(gross),
        agent_split: isCompanyLead ? null : split,
        split_pct_applied: isCompanyLead ? null : split,
        is_company_lead: isCompanyLead,
        lead_source: (body.lead_source && String(body.lead_source).trim()) || null,
        referral_pct: body.referral_pct !== undefined ? Number(body.referral_pct) : null,
        referral_amount: referralAmount,
        referral_to: (body.referral_to && String(body.referral_to).trim()) || null,
        transaction_fee: feeRes.fee,
        other_deductions: otherDed,
        company_fee: calc.company_dollar,
        net_commission: calc.net_to_agent,
        plan_code: isCompanyLead ? null : (targetAgent.commission_plan ?? null),
        commission_computed_at: now,
      }
    }

    const { data: tx, error: tErr } = await admin.from('realty_transactions').insert({
      agent_id: targetAgentId,
      tx_type: txType,
      property_address: address,
      client_name: String(body.client_name ?? '').trim() || null,
      side: String(body.side ?? '').trim() || null,
      price: body.price ? Number(body.price) : null,
      closing_date: closingDate,
      notes: String(body.notes ?? '').trim() || null,
      status: status,
      submitted_at: now,
      paid_at: paidAt,
      paid_by: status === 'paid' ? user.id : null,
      ...insertExtra,
    }).select().single()
    if (tErr || !tx) return j({ error: tErr?.message ?? 'quick_log failed' }, 500)
    await audit(user.id, actorType, 'realty_tx_quick_log', 'realty_transactions', tx.id, { agent_id: targetAgentId, agent_name: targetAgent.full_name, address, status, price: body.price || null, ...insertExtra }, req)
    return j({ ok: true, transaction: tx })
  }

  // ---------------- fix_paid_commission (broker, one-time correction, Stage 1.5 engine) ----------------
  // Corrects transactions marked 'paid' before commission was ever computed. Only touches rows
  // where status='paid' AND net_commission is currently null — refuses to overwrite an existing
  // figure. gross_commission defaults to what's already stored on the row; everything else
  // (split, fee, referral, company-lead) must resolve deterministically or be supplied explicitly.
  // Never guesses. Does not send, does not write until the caller has reviewed the preview.
  if (action === 'preview_fix_paid_commission' || action === 'fix_paid_commission') {
    if (!isBroker) return j({ error: 'forbidden' }, 403)
    const txId = String(body.transaction_id ?? '')
    const { data: tx } = await admin.from('realty_transactions').select('*').eq('id', txId).maybeSingle()
    if (!tx) return j({ error: 'not found' }, 404)
    if (tx.status !== 'paid') return j({ error: 'this action only corrects transactions already marked paid (status: ' + tx.status + ')' }, 400)
    if (tx.net_commission !== null && tx.net_commission !== undefined) return j({ error: 'this transaction already has a net_commission on file ($' + tx.net_commission + '). Refusing to overwrite.' }, 400)

    const gross = body.gross_commission !== undefined && body.gross_commission !== null && body.gross_commission !== '' ? Number(body.gross_commission) : Number(tx.gross_commission)
    if (!(gross > 0)) return j({ error: 'gross_commission is required (none on file and none supplied) and must be positive' }, 400)

    const isCompanyLead = body.is_company_lead !== undefined ? !!body.is_company_lead : !!tx.is_company_lead
    let split: number | null = null
    if (!isCompanyLead) {
      const { data: agentMember } = await admin.from('realty_members').select('commission_plan, agent_split, email, full_name').eq('user_id', tx.agent_id).single()
      split = resolveAgentSplit(agentMember)
      if (split === null || !(split > 0)) return j({ error: 'This agent has no split on file. Set their plan in the Control Panel roster first.' }, 400)
    }

    const feeRes = resolveTransactionFee(tx.tx_type, tx.closing_date, body.transaction_fee ?? tx.transaction_fee)
    if (feeRes.fee === null) return j({ error: 'transaction_fee could not be resolved: ' + feeRes.source }, 400)

    const referralAmount = body.referral_amount !== undefined && body.referral_amount !== null && body.referral_amount !== ''
      ? round2(Number(body.referral_amount))
      : (body.referral_pct !== undefined ? round2(gross * Number(body.referral_pct) / 100) : round2(Number(tx.referral_amount ?? 0)))
    if (referralAmount < 0) return j({ error: 'referral_amount cannot be negative' }, 400)
    const otherDed = round2(Number(body.other_deductions ?? tx.other_deductions ?? 0) || 0)
    if (otherDed < 0) return j({ error: 'other_deductions cannot be negative' }, 400)

    let calc
    try { calc = computeCommission({ gross_commission: round2(gross), referral_amount: referralAmount, agent_split: split, transaction_fee: feeRes.fee, other_deductions: otherDed, is_company_lead: isCompanyLead }) }
    catch (e) { return j({ error: (e as Error).message }, 400) }
    if (calc.net_to_agent < 0) return j({ error: 'Net to agent computes negative ($' + calc.net_to_agent + '). This deal cannot be corrected with these inputs — check gross, referral, and fee. Not writing anything.' }, 400)

    const preview = {
      transaction_id: txId, property_address: tx.property_address, tx_type: tx.tx_type,
      gross_commission: round2(gross), is_company_lead: isCompanyLead, agent_split_used: split,
      transaction_fee: feeRes.fee, fee_source: feeRes.source, referral_amount: referralAmount, other_deductions: otherDed,
      base: calc.base, net_to_agent: calc.net_to_agent, company_dollar: calc.company_dollar, formula: calc.formula,
    }

    if (action === 'preview_fix_paid_commission') return j({ ok: true, preview, written: false })

    await admin.from('realty_transactions').update({
      gross_commission: round2(gross),
      agent_split: isCompanyLead ? tx.agent_split : split,
      split_pct_applied: isCompanyLead ? null : split,
      is_company_lead: isCompanyLead,
      referral_pct: body.referral_pct !== undefined ? Number(body.referral_pct) : tx.referral_pct,
      referral_amount: referralAmount,
      referral_to: (body.referral_to && String(body.referral_to).trim()) || tx.referral_to,
      lead_source: (body.lead_source && String(body.lead_source).trim()) || tx.lead_source,
      transaction_fee: feeRes.fee,
      other_deductions: otherDed,
      company_fee: calc.company_dollar,
      net_commission: calc.net_to_agent,
      commission_computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', txId)
    await audit(user.id, actorType, 'realty_tx_fix_paid_commission', 'realty_transactions', txId, preview, req)
    return j({ ok: true, written: true, result: preview })
  }

  // ---------------- set_gross (draft only, owner) ----------------
  if (action === 'set_gross') {
    const txId = String(body.transaction_id ?? '')
    const gross = Number(body.gross_commission)
    if (!txId || !(gross > 0)) return j({ error: 'transaction_id and positive gross_commission required' }, 400)
    const { data: tx } = await admin.from('realty_transactions').select('id, agent_id, status').eq('id', txId).maybeSingle()
    if (!tx) return j({ error: 'not found' }, 404)
    if (tx.agent_id !== user.id) return j({ error: 'forbidden' }, 403)
    if (tx.status !== 'draft') return j({ error: 'gross commission is locked after submit; the broker confirms it at payout' }, 403)
    await admin.from('realty_transactions').update({ gross_commission: round2(gross), updated_at: new Date().toISOString() }).eq('id', txId)
    await audit(user.id, actorType, 'realty_tx_set_gross', 'realty_transactions', txId, { gross }, req)
    return j({ ok: true })
  }

  // ---------------- upload_doc ----------------
  if (action === 'upload_doc') {
    const docId = String(body.document_id ?? '')
    const fileName = sanitize(String(body.file_name ?? ''))
    const b64 = String(body.data_b64 ?? '')
    if (!docId || !b64) return j({ error: 'document_id and data_b64 required' }, 400)

    const { data: doc } = await admin.from('realty_tx_documents').select('*, realty_transactions!inner(id, agent_id, status)').eq('id', docId).maybeSingle()
    if (!doc) return j({ error: 'document not found' }, 404)
    const tx = (doc as any).realty_transactions
    if (tx.agent_id !== user.id && !isBroker) return j({ error: 'forbidden' }, 403)

    const draftOk = tx.status === 'draft' && doc.status !== 'approved'
    const rejectedOk = (tx.status === 'submitted' || tx.status === 'approved') && doc.status === 'rejected'
    if (!draftOk && !rejectedOk) {
      await audit(user.id, actorType, 'realty_tx_upload_blocked', 'realty_tx_documents', docId, { tx_status: tx.status, doc_status: doc.status }, req)
      return j({ error: 'This transaction is locked. You can only replace documents the broker has rejected.' }, 403)
    }

    let bytes: Uint8Array
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) } catch { return j({ error: 'invalid file data' }, 400) }
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return j({ error: 'file must be between 1 byte and 15 MB' }, 400)

    const version = (doc.version ?? 0) + 1
    const path = `${tx.id}/${doc.doc_key}/v${version}_${fileName}`
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: String(body.content_type ?? 'application/octet-stream'), upsert: false })
    if (upErr) return j({ error: 'storage: ' + upErr.message }, 500)

    const { error: updErr } = await admin.from('realty_tx_documents').update({
      status: 'uploaded', storage_path: path, file_name: fileName, version, uploaded_at: new Date().toISOString(),
      review_note: null, reviewed_by: null, reviewed_at: null,
    }).eq('id', docId)
    if (updErr) return j({ error: updErr.message }, 500)

    await audit(user.id, actorType, 'realty_tx_upload', 'realty_tx_documents', docId, { path, version, tx_status: tx.status }, req)

    if (tx.status !== 'draft') {
      const { data: fullTx } = await admin.from('realty_transactions').select('property_address').eq('id', tx.id).single()
      for (const b of await activeBrokers()) {
        await notify(b.user_id, 'doc_reuploaded', `${member.full_name} re-uploaded \"${doc.label}\" — ${fullTx?.property_address}`, tx.id, docId)
        await email(b.email, 'Hub: document re-uploaded', `${member.full_name} re-uploaded \"${doc.label}\" for ${fullTx?.property_address}. It is waiting for your review.`)
      }
    }
    return j({ ok: true, version, status: 'uploaded' })
  }

  // ---------------- submit ----------------
  if (action === 'submit') {
    const txId = String(body.transaction_id ?? '')
    const { data: tx } = await admin.from('realty_transactions').select('*').eq('id', txId).maybeSingle()
    if (!tx) return j({ error: 'not found' }, 404)
    if (tx.agent_id !== user.id) return j({ error: 'forbidden' }, 403)
    if (tx.status !== 'draft') return j({ error: 'already submitted' }, 400)

    const { data: docs } = await admin.from('realty_tx_documents').select('doc_key,label,required,status').eq('transaction_id', txId)
    const missing = (docs ?? []).filter((d) => d.required && !['uploaded', 'approved'].includes(d.status))
    if (missing.length) return j({ error: 'Missing required documents: ' + missing.map((m) => m.label).join(', ') }, 400)

    await admin.from('realty_transactions').update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', txId)
    await audit(user.id, actorType, 'realty_tx_submit', 'realty_transactions', txId, { address: tx.property_address }, req)
    for (const b of await activeBrokers()) {
      await notify(b.user_id, 'tx_submitted', `${member.full_name} submitted ${TYPE_LABELS[tx.tx_type]} — ${tx.property_address}`, txId, null)
      await email(b.email, 'Hub: new transaction submitted', `${member.full_name} submitted a ${TYPE_LABELS[tx.tx_type]} for ${tx.property_address}. Review it in the Broker Control Panel.`)
    }
    return j({ ok: true, status: 'submitted' })
  }

  // ---------------- review_doc (broker) ----------------
  if (action === 'review_doc') {
    if (!isBroker) return j({ error: 'forbidden' }, 403)
    const docId = String(body.document_id ?? '')
    const decision = String(body.decision ?? '')
    const note = String(body.note ?? '').trim()
    if (!docId || !['approve', 'reject'].includes(decision)) return j({ error: 'document_id and decision (approve|reject) required' }, 400)
    if (decision === 'reject' && !note) return j({ error: 'A note is required when rejecting a document.' }, 400)

    const { data: doc } = await admin.from('realty_tx_documents').select('*, realty_transactions!inner(id, agent_id, status, property_address, tx_type)').eq('id', docId).maybeSingle()
    if (!doc) return j({ error: 'document not found' }, 404)
    const tx = (doc as any).realty_transactions
    if (doc.status !== 'uploaded') return j({ error: 'only uploaded documents can be reviewed (current: ' + doc.status + ')' }, 400)
    if (tx.status === 'paid') return j({ error: 'transaction already paid' }, 400)

    const now = new Date().toISOString()
    const newStatus = decision === 'approve' ? 'approved' : 'rejected'
    await admin.from('realty_tx_documents').update({ status: newStatus, review_note: note || null, reviewed_by: user.id, reviewed_at: now }).eq('id', docId)
    if (note) {
      await admin.from('realty_tx_messages').insert({ document_id: docId, transaction_id: tx.id, sender_id: user.id, sender_role: 'broker', sender_name: member.full_name, body: note })
    }
    await audit(user.id, actorType, 'realty_tx_review', 'realty_tx_documents', docId, { decision, note: note || null }, req)

    const { data: agentRow } = await admin.from('realty_members').select('email, full_name').eq('user_id', tx.agent_id).single()

    if (decision === 'reject') {
      if (tx.status === 'approved') await admin.from('realty_transactions').update({ status: 'submitted', approved_at: null, updated_at: now }).eq('id', tx.id)
      await notify(tx.agent_id, 'doc_rejected', `\"${doc.label}\" was rejected — ${tx.property_address}. Broker note: ${note}`, tx.id, docId)
      await email(agentRow?.email ?? null, 'Hub: document rejected', `Your document \"${doc.label}\" for ${tx.property_address} was rejected.\n\nBroker note: ${note}\n\nReply in the thread or re-upload the corrected document in the Agent Hub.`)
      return j({ ok: true, status: 'rejected' })
    }

    await notify(tx.agent_id, 'doc_approved', `\"${doc.label}\" approved — ${tx.property_address}`, tx.id, docId)
    const { data: remaining } = await admin.from('realty_tx_documents').select('id').eq('transaction_id', tx.id).eq('required', true).neq('status', 'approved')
    if ((remaining ?? []).length === 0 && tx.status === 'submitted') {
      await admin.from('realty_transactions').update({ status: 'approved', approved_at: now, updated_at: now }).eq('id', tx.id)
      await notify(tx.agent_id, 'tx_approved', `All documents approved — ${tx.property_address}. Commission is being processed.`, tx.id, null)
      await email(agentRow?.email ?? null, 'Hub: all documents approved', `All required documents for ${tx.property_address} are approved. Your commission is now being processed.`)
      await audit(user.id, actorType, 'realty_tx_all_approved', 'realty_transactions', tx.id, {}, req)
      return j({ ok: true, status: 'approved', transaction_status: 'approved' })
    }
    return j({ ok: true, status: 'approved' })
  }

  // ---------------- reply ----------------
  if (action === 'reply') {
    const docId = String(body.document_id ?? '')
    const text = String(body.body ?? '').trim()
    if (!docId || !text) return j({ error: 'document_id and body required' }, 400)
    const { data: doc } = await admin.from('realty_tx_documents').select('*, realty_transactions!inner(id, agent_id, status, property_address)').eq('id', docId).maybeSingle()
    if (!doc) return j({ error: 'document not found' }, 404)
    const tx = (doc as any).realty_transactions
    if (tx.agent_id !== user.id && !isBroker) return j({ error: 'forbidden' }, 403)
    if (!isBroker) {
      const { count } = await admin.from('realty_tx_messages').select('*', { count: 'exact', head: true }).eq('document_id', docId)
      if (!count) return j({ error: 'no thread exists on this document yet' }, 400)
    }
    await admin.from('realty_tx_messages').insert({ document_id: docId, transaction_id: tx.id, sender_id: user.id, sender_role: isBroker ? 'broker' : 'agent', sender_name: member.full_name, body: text })
    await audit(user.id, actorType, 'realty_tx_message', 'realty_tx_documents', docId, {}, req)
    if (isBroker) {
      await notify(tx.agent_id, 'doc_message', `Broker replied on \"${doc.label}\" — ${tx.property_address}`, tx.id, docId)
    } else {
      for (const b of await activeBrokers()) await notify(b.user_id, 'doc_message', `${member.full_name} replied on \"${doc.label}\" — ${tx.property_address}`, tx.id, docId)
    }
    return j({ ok: true })
  }

  // ---------------- mark_paid (broker, Stage 1.5 engine) ----------------
  if (action === 'mark_paid') {
    if (!isBroker) return j({ error: 'forbidden' }, 403)
    const txId = String(body.transaction_id ?? '')
    const { data: tx } = await admin.from('realty_transactions').select('*').eq('id', txId).maybeSingle()
    if (!tx) return j({ error: 'not found' }, 404)
    if (tx.status !== 'approved') return j({ error: 'all required documents must be approved first (status: ' + tx.status + ')' }, 400)

    const gross = body.gross_commission !== undefined && body.gross_commission !== null && body.gross_commission !== '' ? Number(body.gross_commission) : Number(tx.gross_commission)
    if (!(gross > 0)) return j({ error: 'Gross commission is required before marking paid. Confirm it against the approved CDA.' }, 400)

    const isCompanyLead = body.is_company_lead !== undefined ? !!body.is_company_lead : !!tx.is_company_lead
    let split: number | null = null
    if (!isCompanyLead) {
      const { data: agentMember } = await admin.from('realty_members').select('commission_plan, agent_split, email, full_name').eq('user_id', tx.agent_id).single()
      split = resolveAgentSplit(agentMember)
      if (split === null || !(split > 0)) return j({ error: 'This agent has no split on file. Set their plan in the Control Panel roster first.' }, 400)
    }
    const { data: agentRowForEmail } = await admin.from('realty_members').select('email, full_name').eq('user_id', tx.agent_id).single()

    const feeRes = resolveTransactionFee(tx.tx_type, tx.closing_date, body.transaction_fee ?? tx.transaction_fee)
    if (feeRes.fee === null) return j({ error: 'transaction_fee could not be resolved: ' + feeRes.source }, 400)

    const referralAmount = body.referral_amount !== undefined && body.referral_amount !== null && body.referral_amount !== ''
      ? round2(Number(body.referral_amount))
      : (body.referral_pct !== undefined ? round2(gross * Number(body.referral_pct) / 100) : round2(Number(tx.referral_amount ?? 0)))
    if (referralAmount < 0) return j({ error: 'referral_amount cannot be negative' }, 400)
    const otherDed = round2(Number(body.other_deductions ?? tx.other_deductions ?? 0) || 0)
    if (otherDed < 0) return j({ error: 'other_deductions cannot be negative' }, 400)

    let calc
    try { calc = computeCommission({ gross_commission: round2(gross), referral_amount: referralAmount, agent_split: split, transaction_fee: feeRes.fee, other_deductions: otherDed, is_company_lead: isCompanyLead }) }
    catch (e) { return j({ error: (e as Error).message }, 400) }
    if (calc.net_to_agent < 0) return j({ error: 'Net to agent computes negative ($' + calc.net_to_agent + '). Check gross, referral, and fee before marking paid.' }, 400)

    const now = new Date().toISOString()
    await admin.from('realty_transactions').update({
      status: 'paid', paid_at: now, paid_by: user.id, updated_at: now,
      gross_commission: round2(gross), plan_code: isCompanyLead ? null : (body.commission_plan_snapshot ?? tx.plan_code),
      agent_split: isCompanyLead ? tx.agent_split : split, split_pct_applied: isCompanyLead ? null : split,
      is_company_lead: isCompanyLead, referral_pct: body.referral_pct !== undefined ? Number(body.referral_pct) : tx.referral_pct,
      referral_amount: referralAmount, referral_to: (body.referral_to && String(body.referral_to).trim()) || tx.referral_to,
      lead_source: (body.lead_source && String(body.lead_source).trim()) || tx.lead_source,
      transaction_fee: feeRes.fee, other_deductions: otherDed,
      company_fee: calc.company_dollar, net_commission: calc.net_to_agent, commission_computed_at: now,
    }).eq('id', txId)
    await audit(user.id, actorType, 'realty_tx_paid', 'realty_transactions', txId, { address: tx.property_address, gross: round2(gross), split, referral: referralAmount, fee: feeRes.fee, deductions: otherDed, company_dollar: calc.company_dollar, net: calc.net_to_agent, formula: calc.formula }, req)
    await notify(tx.agent_id, 'tx_paid', `Commission marked PAID — ${tx.property_address}`, txId, null)
    await email(agentRowForEmail?.email ?? null, 'Hub: commission paid', `Your commission for ${tx.property_address} has been marked paid by the broker. See My Production in the Agent Hub for the breakdown.`)
    return j({ ok: true, status: 'paid', gross: round2(gross), agent_split: split, transaction_fee: feeRes.fee, referral_amount: referralAmount, other_deductions: otherDed, company_dollar: calc.company_dollar, net_commission: calc.net_to_agent })
  }

  // ---------------- dashboard (self) ----------------
  if (action === 'dashboard') {
    // 2026-07-29 · legacy_source is null excludes personal-history rows backfilled from crm_transactions from My Production totals.
    const { data: deals } = await admin.from('realty_transactions')
      .select('id, property_address, tx_type, price, closing_date, paid_at, gross_commission, plan_code, agent_split, off_top_deductions, company_fee, net_commission')
      .eq('agent_id', user.id).eq('status', 'paid').is('legacy_source', null).order('paid_at', { ascending: false })
    const ytd = (deals ?? []).filter((d) => d.paid_at >= yearStart())
    const sum = (arr: any[], f: string) => round2(arr.reduce((a, d) => a + (Number(d[f]) || 0), 0))
    const plan = member.commission_plan
    const rawSplit = member.agent_split
    const dSplit = (rawSplit !== undefined && rawSplit !== null) ? Number(rawSplit) : (plan && PLAN_SPLIT[plan] ? PLAN_SPLIT[plan] : null)
    const planLabel = plan && PLAN_INFO[plan] ? PLAN_INFO[plan].label : (dSplit !== null ? (Math.round(dSplit * 100) + ' / ' + Math.round((1 - dSplit) * 100) + ' Split') : null)
    return j({
      plan: dSplit !== null ? {
        code: plan ?? null,
        label: planLabel,
        split: dSplit,
        monthly_fee: member.fee_exempt ? null : (plan && PLAN_INFO[plan] ? PLAN_INFO[plan].monthly : null),
        quarterly_fee: member.fee_exempt ? null : QUARTERLY_FEE,
        fee_exempt: !!member.fee_exempt,
      } : null,
      ytd: { units: ytd.length, volume: sum(ytd, 'price'), gross: sum(ytd, 'gross_commission'), net: sum(ytd, 'net_commission') },
      lifetime: { units: (deals ?? []).length, volume: sum(deals ?? [], 'price'), gross: sum(deals ?? [], 'gross_commission'), net: sum(deals ?? [], 'net_commission') },
      deals: deals ?? [],
    })
  }

  // ---------------- leaderboard (sanitized: rank, name, volume, units ONLY) ----------------
  if (action === 'leaderboard') {
    // 2026-07-29 · legacy_source is null excludes personal-history rows backfilled from crm_transactions from the leaderboard.
    const { data: paid } = await admin.from('realty_transactions').select('agent_id, price').eq('status', 'paid').is('legacy_source', null).gte('paid_at', yearStart())
    const { data: members } = await admin.from('realty_members').select('user_id, full_name').eq('status', 'active')
    const agg: Record<string, { volume: number; units: number }> = {}
    for (const m of members ?? []) agg[m.user_id] = { volume: 0, units: 0 }
    for (const p of paid ?? []) {
      if (!agg[p.agent_id]) continue
      agg[p.agent_id].volume += Number(p.price) || 0
      agg[p.agent_id].units += 1
    }
    const rows = (members ?? []).map((m) => ({ name: m.full_name, volume: round2(agg[m.user_id].volume), units: agg[m.user_id].units, you: m.user_id === user.id }))
      .sort((a, b) => b.volume - a.volume || b.units - a.units)
      .map((r, i) => ({ rank: i + 1, ...r }))
    return j({ year: new Date().getFullYear(), leaderboard: rows })
  }

  // ---------------- production (broker) ----------------
  if (action === 'production') {
    if (!isBroker) return j({ error: 'forbidden' }, 403)
    const agentId = String(body.agent_id ?? '')
    if (agentId) {
      // 2026-07-29 · legacy_source is null excludes personal-history rows backfilled from crm_transactions from per-agent production detail.
      const { data: deals } = await admin.from('realty_transactions')
        .select('id, property_address, tx_type, price, paid_at, gross_commission, plan_code, agent_split, off_top_deductions, company_fee, net_commission')
        .eq('agent_id', agentId).eq('status', 'paid').is('legacy_source', null).order('paid_at', { ascending: false })
      return j({ deals: deals ?? [] })
    }
    const { data: members } = await admin.from('realty_members').select('user_id, full_name, role, status, commission_plan, agent_split, fee_exempt')
    // 2026-07-29 · legacy_source is null excludes personal-history rows backfilled from crm_transactions from the roster production table.
    const { data: paid } = await admin.from('realty_transactions').select('agent_id, price, gross_commission, net_commission, paid_at').eq('status', 'paid').is('legacy_source', null)
    const ys = yearStart()
    const rows = (members ?? []).map((m) => {
      const mine = (paid ?? []).filter((p) => p.agent_id === m.user_id)
      const ytd = mine.filter((p) => p.paid_at >= ys)
      const s = (arr: any[], f: string) => round2(arr.reduce((a, d) => a + (Number(d[f]) || 0), 0))
      return {
        user_id: m.user_id, name: m.full_name, role: m.role, status: m.status,
        plan: m.commission_plan, agent_split: m.agent_split, fee_exempt: m.fee_exempt,
        ytd_units: ytd.length, ytd_volume: s(ytd, 'price'), ytd_gross: s(ytd, 'gross_commission'), ytd_net: s(ytd, 'net_commission'),
        total_units: mine.length, total_volume: s(mine, 'price'), total_gross: s(mine, 'gross_commission'), total_net: s(mine, 'net_commission'),
      }
    }).sort((a, b) => b.ytd_volume - a.ytd_volume)
    return j({ agents: rows })
  }

  // ---------------- get / list_mine / queue ----------------
  if (action === 'get') {
    const txId = String(body.transaction_id ?? '')
    const { data: tx } = await admin.from('realty_transactions').select('*').eq('id', txId).maybeSingle()
    if (!tx) return j({ error: 'not found' }, 404)
    if (tx.agent_id !== user.id && !isBroker) return j({ error: 'forbidden' }, 403)
    const { data: docs } = await admin.from('realty_tx_documents').select('*').eq('transaction_id', txId).order('sort')
    const { data: msgs } = await admin.from('realty_tx_messages').select('*').eq('transaction_id', txId).order('created_at')
    const { data: agentRow } = await admin.from('realty_members').select('full_name, email, commission_plan, agent_split').eq('user_id', tx.agent_id).single()
    return j({ transaction: tx, documents: docs ?? [], messages: msgs ?? [], agent: agentRow })
  }

  if (action === 'list_mine') {
    // 2026-07-30 · legacy_source is null excludes personal-history rows backfilled from crm_transactions from the agent's My Transactions list.
    const { data: txs } = await admin.from('realty_transactions').select('*').eq('agent_id', user.id).is('legacy_source', null).order('created_at', { ascending: false })
    const out = []
    for (const t of txs ?? []) {
      const { data: docs } = await admin.from('realty_tx_documents').select('required,status').eq('transaction_id', t.id)
      out.push({ ...t, doc_total: (docs ?? []).filter((d) => d.required).length, doc_approved: (docs ?? []).filter((d) => d.required && d.status === 'approved').length, doc_rejected: (docs ?? []).filter((d) => d.status === 'rejected').length })
    }
    return j({ transactions: out })
  }

  if (action === 'queue') {
    if (!isBroker) return j({ error: 'forbidden' }, 403)
    // 2026-07-30 · legacy_source is null excludes personal-history rows backfilled from crm_transactions from the broker compliance review queue.
    const { data: txs } = await admin.from('realty_transactions').select('*').neq('status', 'draft').is('legacy_source', null).order('submitted_at', { ascending: true })
    const out = []
    for (const t of txs ?? []) {
      const { data: docs } = await admin.from('realty_tx_documents').select('required,status').eq('transaction_id', t.id)
      const { data: ag } = await admin.from('realty_members').select('full_name').eq('user_id', t.agent_id).single()
      out.push({
        ...t, agent_name: ag?.full_name ?? '?',
        doc_total: (docs ?? []).filter((d) => d.required).length,
        doc_approved: (docs ?? []).filter((d) => d.required && d.status === 'approved').length,
        doc_pending: (docs ?? []).filter((d) => d.status === 'uploaded').length,
        doc_rejected: (docs ?? []).filter((d) => d.status === 'rejected').length,
      })
    }
    return j({ transactions: out })
  }

  // ---------------- download ----------------
  if (action === 'download') {
    const docId = String(body.document_id ?? '')
    const { data: doc } = await admin.from('realty_tx_documents').select('*, realty_transactions!inner(agent_id)').eq('id', docId).maybeSingle()
    if (!doc || !doc.storage_path) return j({ error: 'no file' }, 404)
    if ((doc as any).realty_transactions.agent_id !== user.id && !isBroker) return j({ error: 'forbidden' }, 403)
    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300)
    if (sErr || !signed) return j({ error: sErr?.message ?? 'sign failed' }, 500)
    await audit(user.id, actorType, 'realty_tx_download', 'realty_tx_documents', docId, { path: doc.storage_path }, req)
    return j({ url: signed.signedUrl })
  }

  return j({ error: 'unknown_action' }, 400)
})
