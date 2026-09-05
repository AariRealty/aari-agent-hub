// realty-clause-register · reads a contract and lists its clauses.
//
// STATUS: skeleton. selftest mode only. The register itself is not built yet.
//
// Before any of it is built, this proves the one dependency it cannot work
// without: that ANTHROPIC_API_KEY is present, valid, and answers. Twice this
// week a dependency described as proven was not. The SMS channel had been dead
// for 82 days and the Hendry county code pointed at Glades, and in both cases
// the check that should have caught it asserted something adjacent instead.
//
// So this function starts with the check, not the feature.
//
// TWO RULES IT WILL HOLD WHEN IT IS BUILT.
//
// 1. Clause severity never merges with risk flags. They are different
//    questions. A flag says "this contract has a defect". A clause severity
//    says "this term is unusual and here is where to read it". Merging them
//    would make an unusual but perfectly good term look like a problem.
//
// 2. The model classifies and locates, it never invents. A clause that is not
//    in the document does not get a register entry, and every entry carries the
//    page it came from so it can be checked in one click.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Sonnet class, as approved. Named here rather than inline so the register and
// any later cost report cannot disagree about which model was used.
const MODEL = 'claude-sonnet-5'
const API = 'https://api.anthropic.com/v1/messages'

// Sonnet class list pricing, dollars per million tokens. Recorded so a cost
// report is computed from one place rather than retyped per caller.
const USD_IN = 3.0, USD_OUT = 15.0

async function anthropic(body: Record<string, unknown>) {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY is not set on this project' }
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, ...body }),
    })
  } catch (e) {
    return { ok: false, error: 'network: ' + String((e as Error)?.message || e), ms: Date.now() - started }
  }
  const ms = Date.now() - started
  const text = await res.text()
  if (!res.ok) return { ok: false, http: res.status, error: text.slice(0, 400), ms }
  try { return { ok: true, ms, body: JSON.parse(text) } }
  catch { return { ok: false, error: 'response was not JSON', ms } }
}

// Proves the key is present, valid, and answering, and reports what a token
// actually costs on this account rather than what a price list says.
async function selftest() {
  const r = await anthropic({
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
  })
  if (!r.ok) {
    return {
      ok: false, model: MODEL,
      reason: (r as { http?: number }).http === 401 ? 'key rejected'
            : (r as { http?: number }).http === 404 ? 'model not available to this account'
            : 'call failed',
      http: (r as { http?: number }).http ?? null,
      detail: (r as { error?: string }).error ?? null,
      ms: (r as { ms?: number }).ms ?? null,
    }
  }
  const b = (r as { body: Record<string, unknown> }).body
  const usage = (b?.usage ?? {}) as Record<string, number>
  const reply = (((b?.content ?? []) as Array<Record<string, unknown>>)[0]?.text ?? '') as string
  const inTok = usage.input_tokens ?? 0, outTok = usage.output_tokens ?? 0
  return {
    ok: true,
    model_requested: MODEL,
    model_served: b?.model ?? null,
    reply: String(reply).trim(),
    input_tokens: inTok,
    output_tokens: outTok,
    usd: Number(((inTok / 1e6) * USD_IN + (outTok / 1e6) * USD_OUT).toFixed(6)),
    ms: (r as { ms?: number }).ms ?? null,
  }
}

function isServiceRole(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return false
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(pad + '='.repeat((4 - pad.length % 4) % 4)))?.role === 'service_role'
  } catch { return false }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const body = await req.json().catch(() => ({}))
  if (!isServiceRole(req)) return json({ error: 'forbidden' }, 403)
  if (body?.selftest === true) return json(await selftest())
  return json({ error: 'not_built_yet', note: 'Only selftest is implemented. The register is next.' }, 501)
})
