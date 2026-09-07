import { createClient } from 'jsr:@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const REALTY_RESEND_API_KEY = Deno.env.get('REALTY_RESEND_API_KEY') ?? ''
const REALTY_FROM = 'Marlenyi at Aari Realty <onboarding@aarirealty.com>'
const REPLY_TO = 'marlenyi@aarirealty.com'
// SECRET REDACTED IN THIS PRESERVED COPY. The deployed v10 had the literal broadcast token
// here. Restoring this function means supplying the token from realty_config.broadcast_token
// or, better, from an edge function secret, not restoring the literal.
const BROADCAST_TOKEN = Deno.env.get('BROADCAST_TOKEN') ?? ''
// SECRET REDACTED. The deployed v10 had the literal unsubscribe secret here.
const UNSUB_SECRET = Deno.env.get('UNSUB_SECRET') ?? ''
const UNSUB_URL = SUPABASE_URL + '/functions/v1/realty-lead-unsubscribe'
const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const CORS: Record<string,string> = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' }
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type':'application/json' } }) }

const P = 'font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:18px;color:#000000;font-weight:400;line-height:1.5;margin:24px 0'
const FP = 'font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#ffffff;font-weight:400;line-height:1.5;text-align:center;margin:14px 0'
function styleBody(html: string): string {
  return html.replace(/<p>/g, `<p style="${P}">`)
}
async function unsubToken(email: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase() + UNSUB_SECRET))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}
async function wrap(email: string, bodyHtml: string): Promise<string> {
  const t = await unsubToken(email)
  const link = `${UNSUB_URL}?e=${encodeURIComponent(email)}&t=${t}`
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff">`
    + `<div style="background:#ffffff"><div style="max-width:600px;margin:0 auto;padding:34px 24px 30px">${styleBody(bodyHtml)}</div>`
    + `<div style="background:#333333;padding:30px 24px">`
    + `<p style="${FP}"><em>If you'd rather not hear from me, that's cool. We'll still love you \u{1F609} Just hit unsubscribe below.</em></p>`
    + `<p style="${FP}"><a href="${link}" style="color:#ffffff">Unsubscribe</a></p>`
    + `<p style="${FP}">Marlenyi Paredes &middot; Broker of Record &middot; BK3530153<br>Aari Realty LLC &middot; 9160 Forum Corporate Pkwy Suite 350, Fort Myers, FL 33905</p>`
    + `</div></div></body></html>`
}

function normalizeSources(b: Record<string, unknown>): string[] | null {
  let list: string[] = []
  if (Array.isArray((b as any).sources)) list = (b as any).sources.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
  else if (typeof (b as any).source === 'string' && (b as any).source.trim()) list = [String((b as any).source).trim()]
  list = Array.from(new Set(list))
  return list.length ? list : null
}
function normalizeRecipients(b: Record<string, unknown>): string[] | null {
  if (!Array.isArray((b as any).recipients)) return null
  const list = Array.from(new Set((b as any).recipients.map((s: unknown) => String(s ?? '').trim().toLowerCase()).filter((s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))))
  return list.length ? list : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  if ((b as any)?.token !== BROADCAST_TOKEN) return json({ error: 'forbidden' }, 403)

  const sources = normalizeSources(b as Record<string, unknown>)
  const explicitRecipients = normalizeRecipients(b as Record<string, unknown>)

  if ((b as any)?.count_only === true) {
    if (explicitRecipients) return json({ ok: true, count: explicitRecipients.length })
    let q = admin.from('realty_leads').select('*', { count: 'exact', head: true }).is('unsubscribed_at', null)
    if (sources) q = q.in('source', sources)
    const { count } = await q
    return json({ ok: true, count: count ?? 0, sources: sources ?? null })
  }

  if ((b as any)?.sources_list === true) {
    const { data, error } = await admin.from('realty_leads').select('source').is('unsubscribed_at', null)
    if (error) return json({ error: 'list_failed' }, 500)
    const counts: Record<string, number> = {}
    for (const r of data || []) { const s = String((r as any).source || 'unspecified'); counts[s] = (counts[s] || 0) + 1 }
    const list = Object.entries(counts).map(([source, count]) => ({ source, count })).sort((a, b2) => b2.count - a.count)
    return json({ ok: true, sources: list })
  }

  const subject = String((b as any)?.subject ?? '').trim()
  const bodyHtml = String((b as any)?.html ?? '').trim()
  const testEmail = String((b as any)?.test_email ?? '').trim().toLowerCase()
  const audience = String((b as any)?.audience ?? (explicitRecipients ? 'team' : 'leads'))
  if (!subject || !bodyHtml) return json({ error: 'subject and html required' }, 400)

  const useRealty = !!REALTY_RESEND_API_KEY
  const key = useRealty ? REALTY_RESEND_API_KEY : RESEND_API_KEY
  if (!key) return json({ error: 'no_resend_key' }, 500)
  let FROM = REALTY_FROM
  if (!useRealty) { const { data: cfg } = await admin.from('realty_config').select('value').eq('key','digest_from').maybeSingle(); FROM = cfg?.value || 'Marlenyi at Aari Realty <onboarding@aaritransactions.com>' }

  let recipients: string[]
  if (testEmail) { recipients = [testEmail] }
  else if (explicitRecipients) { recipients = explicitRecipients }
  else {
    let q = admin.from('realty_leads').select('email').is('unsubscribed_at', null)
    if (sources) q = q.in('source', sources)
    const { data, error } = await q
    if (error) return json({ error: 'list_failed' }, 500)
    recipients = (data || []).map((r: any) => String(r.email).toLowerCase()).filter(Boolean)
  }
  if (recipients.length === 0) return json({ ok: true, recipient_count: 0, sent: 0, note: 'no active subscribers' })

  let sent = 0, failed = 0
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100)
    const batch = await Promise.all(chunk.map(async (em) => ({ from: FROM, to: [em], reply_to: REPLY_TO, subject, html: await wrap(em, bodyHtml) })))
    try {
      const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(batch) })
      if (r.ok) { sent += chunk.length } else { failed += chunk.length }
    } catch (_e) { failed += chunk.length }
  }

  if (!testEmail) {
    await admin.from('realty_broadcasts').insert({ subject, preview: bodyHtml.replace(/<[^>]+>/g,' ').slice(0,140), recipient_count: recipients.length, sent_count: sent, failed_count: failed, status: failed ? 'partial' : 'sent', sources: sources ? sources.join(',') : null, audience })
  }
  return json({ ok: true, test: !!testEmail, recipient_count: recipients.length, sent, failed })
})
