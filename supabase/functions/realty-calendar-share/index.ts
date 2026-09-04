// realty-calendar-share · put the shared "Aari Events & Trainings" calendar on
// every active member's own Google calendar, and take it off anyone who is no
// longer active.
//
// The service account owns that calendar, so only it can change who may see it.
// The broker's own account is a writer, and a writer cannot edit an access list.
// That is why this runs here rather than in the browser.
//
// Auth is two locks. verify_jwt is true, so the Supabase gateway has already
// required a valid project key to reach this code. On top of that, changing who
// can see the brokerage calendar needs the secret held in realty_config under
// gcal_share_secret. That table has RLS on and no policies, so only the service
// role can read it: the same shape as the other job secrets already in there.
//
// Safe to run repeatedly. Someone who already has reader access is left alone,
// and only an email the roster knows and has marked not active is ever revoked,
// so an outside collaborator the broker added by hand is never touched.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-share-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } }) }

function b64urlStr(s: string): string { return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function b64urlBytes(bytes: Uint8Array): string { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function pemToDer(pem: string): Uint8Array { const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, ''); const bin = atob(body); const der = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i); return der }

// The read-only scope the other calendar functions use is not enough here:
// editing an access list needs the full calendar scope.
async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const signingInput = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlStr(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)))
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(signingInput + '.' + b64urlBytes(sig)) })
  const j = await res.json()
  if (!j.access_token) throw new Error('token error: ' + JSON.stringify(j))
  return j.access_token as string
}

// Hashed before comparing, then compared in full. A plain loop over two strings
// of different lengths would leak the length of the real secret through timing.
async function secretMatches(given: string, want: string): Promise<boolean> {
  if (!given || !want) return false
  const enc = new TextEncoder()
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(given)))
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(want)))
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function callerIsServiceRole(req: Request): boolean {
  const m = (req.headers.get('Authorization') || '').match(/Bearer (.+)/)
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return !!(m && svc && m[1] === svc)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))

    const { data: secretRow } = await admin.from('realty_config').select('value').eq('key', 'gcal_share_secret').maybeSingle()
    const allowed = callerIsServiceRole(req) ||
      await secretMatches(req.headers.get('x-share-secret') || '', secretRow?.value || '')
    if (!allowed) return json({ ok: false, error: 'not allowed' }, 403)

    const { data: calRow } = await admin.from('realty_config').select('value').eq('key', 'events_calendar_id').maybeSingle()
    const calId = body.calendarId || calRow?.value
    if (!calId) return json({ ok: false, error: 'events_calendar_id is not set' })

    const raw = Deno.env.get('GCAL_SA_KEY')
    if (!raw) return json({ ok: false, error: 'GCAL_SA_KEY not set' })
    let sa: { client_email: string; private_key: string }
    try { sa = JSON.parse(raw) } catch { return json({ ok: false, error: 'GCAL_SA_KEY is not valid JSON' }) }

    const { data: members, error: mErr } = await admin.from('realty_members').select('full_name, email, status')
    if (mErr) return json({ ok: false, error: 'roster read failed: ' + mErr.message })

    const norm = (e: unknown) => String(e || '').trim().toLowerCase()
    const keep = new Map<string, string>()
    const drop = new Map<string, string>()
    for (const m of (members || [])) {
      const rec = m as { full_name?: string; email?: string; status?: string }
      const e = norm(rec.email)
      if (!e || !e.includes('@')) continue
      if (rec.status === 'active') keep.set(e, rec.full_name || e)
      else drop.set(e, rec.full_name || e)
    }
    // A reinstated member can appear on both lists from an older row. Access wins.
    for (const e of keep.keys()) drop.delete(e)

    const token = await getAccessToken(sa)
    const authHdr = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    const aclBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/acl`

    const listRes = await fetch(aclBase + '?maxResults=250', { headers: { Authorization: 'Bearer ' + token } })
    const listJson = await listRes.json().catch(() => ({}))
    if (!listRes.ok) return json({ ok: false, error: 'acl list failed', status: listRes.status, detail: listJson })
    const existing = new Map<string, { id: string; role: string }>()
    for (const r of (Array.isArray(listJson.items) ? listJson.items : [])) {
      const sc = r.scope || {}
      if (sc.type !== 'user') continue   // never touch a default or whole-domain rule
      if (r.role === 'owner') continue   // never touch an owner, the service account included
      existing.set(norm(sc.value), { id: r.id, role: r.role })
    }

    const dryRun = body.dry_run === true
    const notify = body.notify !== false  // Google emails an invitation unless told not to
    const granted: string[] = [], already: string[] = [], revoked: string[] = [], failed: unknown[] = []

    for (const [email, name] of keep) {
      const have = existing.get(email)
      // A writer or owner already sees more than a reader would. Leave them.
      if (have) { already.push(name + ' (' + have.role + ')'); continue }
      if (dryRun) { granted.push(name); continue }
      const r = await fetch(aclBase + '?sendNotifications=' + (notify ? 'true' : 'false'), {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({ role: 'reader', scope: { type: 'user', value: email } }),
      })
      if (r.ok) granted.push(name)
      else failed.push({ who: name, status: r.status, detail: await r.json().catch(() => ({})) })
    }

    for (const [email, name] of drop) {
      const have = existing.get(email)
      if (!have) continue
      if (dryRun) { revoked.push(name); continue }
      const r = await fetch(`${aclBase}/${encodeURIComponent(have.id)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
      if (r.ok || r.status === 404 || r.status === 410) revoked.push(name)
      else failed.push({ who: name, status: r.status })
    }

    return json({ ok: failed.length === 0, calendarId: calId, dry_run: dryRun, granted, already, revoked, failed })
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message || e) }, 500) }
})
