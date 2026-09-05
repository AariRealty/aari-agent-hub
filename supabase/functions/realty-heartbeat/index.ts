// realty-heartbeat · the thing that notices when something stops working.
//
// WHY IT EXISTS. On 5 September 2026 this project ran 23 cron jobs with nothing
// watching any of them. purge-closed-tc-documents had failed every day since
// 14 August and nobody knew, because a failed cron writes to
// cron.job_run_details and nothing reads it.
//
// WHAT IT DOES, once an hour:
//   1. Runs cron_health_scan(), pure SQL over cron's own tables.
//   2. Runs the four county parcel probes and records the verdict.
//   3. Marks itself alive, so the dead man's switch has something to watch.
//   4. Delivers any alert the scan opened or closed.
//
// Step 3 is deliberately last. A heartbeat that marks itself healthy before
// doing the work would report health it has not established.
//
// ONCE PER INCIDENT, NEVER PER RUN. This function does not decide when to
// alert. record_job_health() writes an alert row only on a state change, so
// "once per incident" is a property of the schema rather than of whoever
// remembered to check. This function only delivers what is already there.
//
// THE CHANNEL. SMS through Quo, the same transport and the same sms_log audit
// trail as the morning briefing. Email is deliberately not wired: Resend's
// domain is unverified on this project. CHANNELS below is the seam, so adding
// email later is a case arm and not a rewrite.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// How long an undelivered alert keeps trying. This was a count, five attempts,
// which gave up after five hours because the heartbeat retries hourly. It is
// now time, not tries.
const RETRY_FOR_DAYS = 7

// Some failures are not worth retrying at all. A 402 is Payment Required: the
// request was understood, authenticated and refused for want of credit, and it
// will be refused identically every hour until somebody pays a bill. Retrying
// it 168 times does not make it likelier to send, it just buries the one line
// that matters under a hundred identical ones.
//
// So a terminal failure is recorded once, the alert is marked blocked, and the
// retry stops. The alert is still there, still undelivered, and still visible.
// Clearing it is a deliberate act, because the fix is a billing decision and
// not something this function can discover by trying again.
//
// 401 and 403 are here for the same reason: a rejected key does not un-reject
// itself. 429 is deliberately NOT here, because a rate limit does clear.
const TERMINAL_HTTP = [401, 402, 403]
function isTerminal(err: string | undefined): boolean {
  if (!err) return false
  return TERMINAL_HTTP.some((code) => err.startsWith('Quo ' + code + ':'))
}
// Above this many alerts at once, send one summary instead of a text each, so
// an estate wide outage cannot turn into a wall of messages she stops reading.
const BATCH_ABOVE = 3
const PARCEL_PROBE = 'parcel-county-lookup'

// ---------------------------------------------------------------- channels

type SendResult = { ok: boolean; id?: string; error?: string }

async function sendSms(text: string): Promise<SendResult> {
  const apiKey = Deno.env.get('QUO_API_KEY')
  const from = Deno.env.get('AARI_REALTY_FROM_NUMBER') || Deno.env.get('QUO_FROM_NUMBER')
  if (!apiKey) return { ok: false, error: 'QUO_API_KEY not set' }
  if (!from) return { ok: false, error: 'no Quo from number set' }

  const { data: broker } = await admin.from('agents')
    .select('phone, sms_opt_in').eq('role', 'broker').not('phone', 'is', null).limit(1).maybeSingle()
  if (!broker?.phone) return { ok: false, error: 'no broker phone on file' }
  if (broker.sms_opt_in === false) return { ok: false, error: 'broker has opted out of SMS' }
  const to = String(broker.phone).trim().replace(/[^\d+]/g, '')
  const e164 = /^\+/.test(to) ? to : (to.length === 11 && to.startsWith('1') ? '+' + to : '+1' + to)

  let res: Response
  try {
    res = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, from, to: [e164], setInboxStatus: 'done' }),
    })
  } catch (e) {
    return await logSms(e164, text, { ok: false, error: 'network: ' + String((e as Error)?.message || e) })
  }

  if (res.status === 202) {
    let b: { data?: { id?: string } } = {}
    try { b = await res.json() } catch { /* the send still succeeded */ }
    return await logSms(e164, text, { ok: true, id: b.data?.id })
  }
  let t = ''
  try { t = await res.text() } catch { /* nothing to add */ }
  return await logSms(e164, text, { ok: false, error: 'Quo ' + res.status + ': ' + t.slice(0, 200) })
}

// Every SMS this project sends lands in one place, whoever sent it. The log is
// the fact that must not have a second copy, not the transport code.
async function logSms(to: string, body: string, r: SendResult): Promise<SendResult> {
  try {
    await admin.from('sms_log').insert({
      provider: 'quo', to_phone: to, body,
      status: r.ok ? 'sent' : 'failed',
      provider_message_id: r.id ?? null, error: r.error ?? null,
      metadata: { template: 'job_alert' },
    })
  } catch { /* a logging failure must not swallow the alert */ }
  return r
}

async function sendEmail(_text: string): Promise<SendResult> {
  // Deliberately not implemented. resend_domain_verified is false on this
  // project, and shipping onto an unverified sender would mean an alert that
  // silently does not arrive, which is the failure this whole function exists
  // to remove. The seam is here for when that is fixed.
  return { ok: false, error: 'email channel not configured (resend domain unverified)' }
}

const CHANNELS: Record<string, (t: string) => Promise<SendResult>> = { sms: sendSms, email: sendEmail }

// ---------------------------------------------------------------- delivery

async function deliver(channel: string) {
  const send = CHANNELS[channel] ?? sendSms
  const since = new Date(Date.now() - RETRY_FOR_DAYS * 86400000).toISOString()
  const { data: pending } = await admin.from('realty_alerts')
    .select('id, job_name, edge, message, attempts, delivery_blocked')
    .eq('delivered', false).eq('delivery_blocked', false).gte('created_at', since)
    .order('created_at', { ascending: true }).limit(25)

  const list = pending ?? []
  if (!list.length) return { pending: 0, sent: 0, failed: 0 }

  const texts: Array<{ ids: string[]; text: string }> = list.length > BATCH_ABOVE
    ? [{
        ids: list.map((a) => a.id),
        text: 'Aari ALERT: ' + list.length + ' jobs changed state.\n'
            + list.slice(0, 4).map((a) => (a.edge === 'recovered' ? 'OK ' : 'DOWN ') + a.job_name).join('\n')
            + (list.length > 4 ? '\nand ' + (list.length - 4) + ' more.' : ''),
      }]
    : list.map((a) => ({ ids: [a.id], text: a.message }))

  let sent = 0, failed = 0, lastError: string | null = null
  for (const t of texts) {
    const r = await send(t.text)
    if (r.ok) sent += t.ids.length; else { failed += t.ids.length; lastError = r.error ?? 'unknown' }
    for (const id of t.ids) {
      const row = list.find((a) => a.id === id)!
      const terminal = !r.ok && isTerminal(r.error)
      await admin.from('realty_alerts').update({
        channel, attempts: (row.attempts ?? 0) + 1,
        delivered: r.ok, delivered_at: r.ok ? new Date().toISOString() : null,
        delivery_error: r.ok ? null : (r.error ?? 'unknown'),
        delivery_blocked: terminal,
        delivery_blocked_at: terminal ? new Date().toISOString() : null,
      }).eq('id', id)
    }
  }
  // The channel itself is a watched thing. If nothing can be delivered, that is
  // an incident in its own right, and when the channel comes back it recovers
  // like anything else. It cannot be pushed while it is down, by definition,
  // but it is in the ledger and it is the first thing to go out when it is up.
  await admin.rpc('record_job_health', {
    p_job: 'alert-channel-' + channel, p_kind: 'probe',
    p_state: sent > 0 || failed === 0 ? 'ok' : 'failing',
    p_fails: failed,
    p_error: failed > 0
      ? (isTerminal(lastError ?? undefined)
          ? 'Not retrying. This is a billing question, not an outage: ' + lastError
          : lastError)
      : null,
  })

  return { pending: list.length, sent, failed }
}

// ---------------------------------------------------------------- the beat

async function beat(drainOnly: boolean) {
  const started = Date.now()
  const out: Record<string, unknown> = {}

  if (!drainOnly) {
    // 1. The cron estate.
    const { data: scan, error: scanErr } = await admin.rpc('cron_health_scan')
    if (scanErr) {
      out.scan_error = scanErr.message
    } else {
      const rows = (scan ?? []) as Array<{ job_name: string; state: string; edge: string | null }>
      out.jobs_scanned = rows.length
      out.not_ok = rows.filter((r) => r.state !== 'ok').map((r) => r.job_name + ':' + r.state)
      out.edges = rows.filter((r) => r.edge).map((r) => r.job_name + ':' + r.edge)
    }

    // 2. The four county probes, through the same ledger as everything else so
    //    a county layer moving is the same kind of event as a cron dying.
    try {
      const res = await fetch(Deno.env.get('SUPABASE_URL')! + '/functions/v1/realty-parcel-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: JSON.stringify({ smoke: true }),
      })
      const smoke = await res.json()
      const bad = ((smoke?.counties ?? []) as Array<Record<string, unknown>>).filter((c) => !c.pass)
      const ok = res.ok && smoke?.ok === true
      out.parcel_smoke = ok ? 'pass' : 'FAIL'
      await admin.rpc('record_job_health', {
        p_job: PARCEL_PROBE, p_kind: 'probe', p_state: ok ? 'ok' : 'failing',
        p_fails: bad.length,
        p_error: ok ? null
          : (bad.map((c) => c.county + ': ' + (c.reason ?? 'unknown')).join('; ') || 'smoke returned no counties'),
        p_detail: smoke ?? null,
      })
    } catch (e) {
      out.parcel_smoke = 'FAIL'
      await admin.rpc('record_job_health', {
        p_job: PARCEL_PROBE, p_kind: 'probe', p_state: 'failing', p_fails: 0,
        p_error: 'probe did not answer: ' + String((e as Error)?.message || e),
      })
    }

    // 3. Only now, having done the work, mark the heartbeat alive. Doing this
    //    first would be reporting health this run has not established.
    await admin.rpc('record_job_health', {
      p_job: 'aari-heartbeat', p_kind: 'probe', p_state: 'ok', p_fails: 0,
      p_detail: { ran_ms: Date.now() - started },
    })
  }

  // 4. Deliver whatever the scan opened or closed.
  const channel = (Deno.env.get('ALERT_CHANNEL') || 'sms').toLowerCase()
  out.delivery = await deliver(channel)
  out.channel = channel
  out.ms = Date.now() - started
  return out
}

// Service role only. The gateway runs with verify_jwt on, so by the time a
// request reaches here its signature is already verified; all that is left is
// to read which role it carries. Comparing the raw key string instead looked
// simpler and was wrong: the key in the vault and the key in the environment
// are not guaranteed to be the same string, and the first deploy returned 403
// to its own cron because of it.
function isServiceRole(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return false
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(pad + '='.repeat((4 - pad.length % 4) % 4)))
    return claims?.role === 'service_role'
  } catch { return false }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const body = await req.json().catch(() => ({}))
  if (!isServiceRole(req)) return json({ error: 'forbidden' }, 403)
  return json(await beat(body?.drain_only === true))
})
