// SkySlope sync — DISCOVERY MODE (read-only, no DB writes). Secret-gated.
// Auth handshake mirrors SkySlope's official bulk-export reference:
//   POST https://api.skyslope.com/auth/login  (HMAC-signed) -> { Session }
//   GET  https://api.skyslope.com/api/files?createdAfter=DATE  with Session header
//
// The gate secret used to be a literal in this file. Read-only is not harmless here: the
// response carries commission breakdowns and splits for real sales, so this was a third
// route to the commission book alongside skyslope-tm and the SkySlope Books token, and
// rotating the Books token closes none of the other two. It now comes from the environment
// with no default: unset means this function refuses every request and says why.
const SECRET = Deno.env.get('SKYSLOPE_SYNC_SECRET') ?? ''

// Length-independent comparison, so a caller cannot learn the secret one byte at a time.
function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false
  const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

function tsMoment(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
}
async function hmacB64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  let b = ''; const bytes = new Uint8Array(sig); for (const x of bytes) b += String.fromCharCode(x)
  return btoa(b)
}
function keysOf(o: unknown): string[] { return o && typeof o === 'object' ? Object.keys(o as Record<string, unknown>) : [] }

Deno.serve(async (req: Request) => {
  const body = await req.json().catch(() => ({}))
  if (!SECRET) {
    return new Response(JSON.stringify({
      error: 'sync_secret_not_configured',
      detail: 'SKYSLOPE_SYNC_SECRET is not set on this project. This function returns commission breakdowns for real sales, so it refuses every request until a freshly generated value is set in the Edge Function secrets. The value that used to be compiled into this function is in git history and must not be reused.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }
  if (!sameSecret(String(body?.secret ?? ''), SECRET)) return new Response(JSON.stringify({ error: 'denied' }), { status: 403 })

  const clientId = Deno.env.get('SKYSLOPE_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('SKYSLOPE_CLIENT_SECRET') ?? ''
  const accessKey = Deno.env.get('SKYSLOPE_ACCESS_KEY') ?? ''
  const accessSecret = Deno.env.get('SKYSLOPE_ACCESS_SECRET') ?? ''
  const missing = [
    !clientId && 'SKYSLOPE_CLIENT_ID', !clientSecret && 'SKYSLOPE_CLIENT_SECRET',
    !accessKey && 'SKYSLOPE_ACCESS_KEY', !accessSecret && 'SKYSLOPE_ACCESS_SECRET',
  ].filter(Boolean)
  if (missing.length) return new Response(JSON.stringify({ error: 'missing_secrets', missing, note: 'Add these four as Edge Function secrets in the Supabase dashboard, then re-run.' }, null, 2), { headers: { 'Content-Type': 'application/json' } })

  const out: Record<string, unknown> = {}
  try {
    // ---- auth ----
    const timestamp = tsMoment()
    const hmac = await hmacB64(accessSecret, `${clientId}:${clientSecret}:${timestamp}`)
    const authHeader = 'ss ' + accessKey + ':' + hmac
    const authRes = await fetch('https://api.skyslope.com/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, Timestamp: timestamp },
      body: JSON.stringify({ ClientId: clientId, ClientSecret: clientSecret }),
    })
    const authText = await authRes.text()
    out.auth_status = authRes.status
    let authJson: any = {}
    try { authJson = JSON.parse(authText) } catch { out.auth_raw = authText.slice(0, 300) }
    const session = authJson.Session ?? authJson.session ?? authJson.SessionToken ?? null
    out.session_present = !!session
    out.auth_keys = keysOf(authJson)
    if (!session) { out.hint = 'No Session returned — check credentials or timestamp format.'; return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } }) }

    // ---- data pull (bulk export / masterdata feed) ----
    const start = String(body.start ?? '2024-01-01')
    const dataTs = tsMoment()
    const dataRes = await fetch('https://api.skyslope.com/api/files?createdAfter=' + encodeURIComponent(start), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Session: session, timestamp: dataTs },
    })
    out.data_status = dataRes.status
    const dataText = await dataRes.text()
    let feed: any = null
    try { feed = JSON.parse(dataText.trim()) } catch { out.data_raw = dataText.slice(0, 400); return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } }) }
    const arr: any[] = Array.isArray(feed) ? feed : (feed.files ?? feed.data ?? feed.results ?? [])
    out.total_files = arr.length
    const sales = arr.filter((f) => (f.objectType ?? '').toLowerCase() === 'sale')
    out.sales_count = sales.length
    // status vocabulary (to identify what 'closed' is called)
    const statuses: Record<string, number> = {}
    for (const s of sales) { const k = (s.statusId ?? '?') + ' · ' + (s.status ?? '?'); statuses[k] = (statuses[k] || 0) + 1 }
    out.sale_statuses = statuses
    // sample up to 2 sales, non-PII field shapes only
    out.samples = sales.slice(0, 2).map((s) => ({
      topLevelKeys: keysOf(s),
      saleGuid: s.saleGuid, statusId: s.statusId, status: s.status, dealType: s.dealType,
      salePrice: s.salePrice, listingPrice: s.listingPrice,
      actualClosingDate: s.actualClosingDate, escrowClosingDate: s.escrowClosingDate, contractAcceptanceDate: s.contractAcceptanceDate, modifiedOn: s.modifiedOn,
      agentGuid: s.agentGuid, agent_keys: keysOf(s.agent),
      property_keys: keysOf(s.property),
      commission_keys: keysOf(s.commission),
      commissionBreakdowns_count: Array.isArray(s.commissionBreakdowns) ? s.commissionBreakdowns.length : null,
      commissionBreakdown_keys: Array.isArray(s.commissionBreakdowns) && s.commissionBreakdowns[0] ? keysOf(s.commissionBreakdowns[0]) : [],
      commissionSplits_count: Array.isArray(s.commissionSplits) ? s.commissionSplits.length : null,
      commissionSplit_keys: Array.isArray(s.commissionSplits) && s.commissionSplits[0] ? keysOf(s.commissionSplits[0]) : [],
    }))
    return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    out.exception = String(e)
    return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }
})
