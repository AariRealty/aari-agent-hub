import { createClient } from 'jsr:@supabase/supabase-js@2'

// Records that the agreement notice was shown, and that an agent chose to
// continue past it. Its own function rather than another action on realty-hub,
// because realty-hub is 36KB of business logic that serves every page load and
// this is fifty lines that must not put a scratch on it.
//
// Why this exists at all. The hard gate produced no record: an agent who could
// not get in either did nothing or worked outside the system, and neither
// leaves a trace. The softened gate is only defensible if it produces better
// evidence than the lockout did, so the logging is the point rather than a
// courtesy.
//
// Every field in details is derived here, from the tables, not taken from the
// caller. A client that asserts which version it showed is a client that can
// assert the wrong one.
//
// verify_jwt is false and the check is done in the body, the same shape
// realty-sign-ica uses: the gate posts a user token and this reads the user
// from it, so an anonymous or absent token is rejected here with a reason
// rather than by the gateway with none.

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const EVENTS: Record<string, string> = {
  shown: 'realty_ica_notice_shown',
  dismissed: 'realty_ica_notice_dismissed',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user }, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !user) return json({ error: 'unauthorized' }, 401)

  const { data: member } = await admin.from('realty_members')
    .select('user_id, role, status, full_name').eq('user_id', user.id).maybeSingle()
  if (!member || member.status !== 'active') return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = EVENTS[String(body?.event ?? '')]
  if (!action) return json({ error: 'event must be shown or dismissed' }, 400)

  const { data: ver } = await admin.from('realty_agreement_versions')
    .select('id, version_label, effective_date, materiality').eq('is_current', true).maybeSingle()
  if (!ver) return json({ ok: true, recorded: false, reason: 'no_current_version' })

  const { data: sigs } = await admin.from('realty_agreement_signatures')
    .select('version_id, version_label, signed_at').eq('agent_id', user.id)
    .order('signed_at', { ascending: false })
  const rows = sigs ?? []
  const signedCurrent = rows.some((r) => r.version_id === ver.id)

  // Already current means no notice was required, so there is nothing to
  // record. Writing a row here would put noise in the evidence.
  if (signedCurrent) return json({ ok: true, recorded: false, reason: 'already_signed_current' })

  const everSigned = rows.length > 0
  const reason = everSigned ? 'version_update' : 'never_signed'

  const details = {
    version_label: ver.version_label,
    version_id: ver.id,
    effective_date: ver.effective_date,
    materiality: ver.materiality,
    reason,
    ever_signed: everSigned,
    last_signed_version: everSigned ? rows[0].version_label : null,
    last_signed_at: everSigned ? rows[0].signed_at : null,
    // A member who has never signed anything cannot dismiss. The notice is
    // still recorded for them, and today that record does not exist at all.
    hard_blocked: !everSigned,
  }

  try {
    await admin.from('audit_log').insert({
      actor_id: user.id,
      actor_type: 'realty_member',
      action,
      target_table: 'realty_agreement_versions',
      target_id: ver.id,
      details,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent') || null,
    })
  } catch (e) {
    // The notice is evidence. If it cannot be written, say so rather than
    // answering ok and leaving a gap nobody can see.
    return json({ ok: false, recorded: false, error: String((e as Error)?.message ?? e) }, 500)
  }

  return json({ ok: true, recorded: true, event: action, reason, hard_blocked: !everSigned, version_label: ver.version_label })
})
