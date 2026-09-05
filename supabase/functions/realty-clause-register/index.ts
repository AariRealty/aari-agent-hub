// realty-clause-register · reads a contract and lists its clauses.
//
// WHAT IT IS FOR. A coordinator opening an unfamiliar contract should be able
// to see what its terms are, where to read each one, and which of them were
// bargained rather than printed, without reading all twenty pages.
//
// TWO RULES, AND HOW EACH IS ENFORCED RATHER THAN PROMISED.
//
// 1. CLAUSE SEVERITY NEVER MERGES WITH RISK FLAGS.
//    Risk flags say "this file has a defect and someone must act". Their
//    vocabulary is stop and check, enforced in build/test-flags.js by
//    /^(stop|check)$/. Clause severity says "this term reads like this, here is
//    the page": standard, negotiated, unusual. The two sets share no word, so
//    the merge is impossible in the data and not merely discouraged. A
//    negotiated closing date is not a defect, and if it ever rendered beside a
//    stop it would start to look like one.
//
// 2. THE MODEL CLASSIFIES AND LOCATES, IT NEVER INVENTS.
//    The model is asked for a quote and a page with every clause. Nothing is
//    stored until this code has found that quote in that page's own text. A
//    clause it describes but cannot be located is discarded and counted. That
//    count is written to the run, so "how much did it make up" is a number in
//    the database rather than a matter of trust.
//
// WHAT IT DOES NOT DO. It does not write to files, it does not touch
// raw_form_data, it does not produce risk flags, and it never edits a contract
// value. It reads and it lists.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = Deno.env.get('AARI_CONTRACT_BUCKET') ?? 'transaction-files'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const MODEL = 'claude-sonnet-5'
const API = 'https://api.anthropic.com/v1/messages'
const USD_IN = 3.0, USD_OUT = 15.0

// The clause vocabulary. Disjoint from the risk flag vocabulary by
// construction, and asserted disjoint in build/test-clauses.js.
const SEVERITIES = ['standard', 'negotiated', 'unusual'] as const
const CATEGORIES = ['price', 'financing', 'deposit', 'inspection', 'title', 'closing',
                    'possession', 'fees', 'disclosure', 'brokerage', 'other'] as const

// A quote shorter than this is not evidence. "the Buyer" appears on every page,
// so a short string would verify against almost anything and the check would
// stop meaning what it claims to mean.
const MIN_QUOTE = 24
const MAX_CLAUSES = 25

// A PDF text layer can carry a NUL. Postgres cannot store U+0000, and this is
// exactly how two of four real packets lost a complete extraction on
// 5 September. Tab, newline and carriage return are deliberately kept.
// The C0 control range, written by codepoint so this file contains none of
// the characters it strips.
const CTL_RE = new RegExp('[' +
  '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F' + ']', 'g')

function stripCtl(s: string): string {
  return String(s ?? '').replace(CTL_RE, '')
}

// Position-aware page text, the same approach the extractor uses, because the
// register's whole value depends on knowing which page a term is on.
async function pdfToPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(bytes)
  const TOL = 5
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = (tc.items as Array<Record<string, unknown>>)
      .filter((it) => it.str && String(it.str).trim())
      .map((it) => ({ x: (it.transform as number[])[4], y: (it.transform as number[])[5], s: String(it.str), w: Number(it.width) }))
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const rows: { y: number; items: typeof items }[] = []
    for (const it of items) {
      let row = rows.find((r) => Math.abs(r.y - it.y) <= TOL)
      if (!row) { row = { y: it.y, items: [] }; rows.push(row) }
      row.items.push(it)
    }
    const out: string[] = []
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      let line = '', lastEnd: number | null = null
      for (const it of row.items) {
        if (lastEnd != null) {
          const gap = it.x - lastEnd
          if (gap > 6) line += '  '; else if (line && !/\s$/.test(line)) line += ' '
        }
        line += it.s; lastEnd = it.x + (it.w || it.s.length * 4)
      }
      out.push(line)
    }
    pages.push(stripCtl(out.join('\n')))
  }
  return pages
}

// Which sub document a page belongs to, so a clause can say "Rider, page 14"
// rather than only "page 14". Same rule order as the extractor: specific types
// before the generic Contract rule, because riders carry the contract's name.
function documentAt(pages: string[]): (p: number) => string | null {
  const rules: Array<[RegExp, string]> = [
    [/Comprehensive Rider|Rider to the .{0,40}Contract|\bRider\b.{0,25}Contract For Sale/i, 'Rider'],
    [/Financing Addendum|FHA\/?VA|FHA Amendatory|Amendatory Clause|Appraisal Contingency|Inspection Addendum|Association Addendum|Condominium Addendum|Addendum to (the )?(Sale|Purchase|Contract)|Addendum\s*No\.?|Addendum\s*#/i, 'Addendum'],
    [/Compensation Agreement|Broker Compensation|Cooperating Broker Compensation/i, 'Compensation'],
    [/AS[\s-]?IS.{0,8}Residential Contract For Sale|Vacant Land Contract|Commercial Contract|Residential Contract For Sale And Purchase/i, 'Contract'],
  ]
  const marks: Array<{ page: number; title: string }> = []
  pages.forEach((pg, i) => {
    const top = pg.split('\n').slice(0, 18).join(' ')
    for (const [re, title] of rules) {
      if (re.test(top)) {
        if (!marks.length || marks[marks.length - 1].title !== title) marks.push({ page: i + 1, title })
        break
      }
    }
  })
  return (p: number) => {
    let cur: string | null = null
    for (const m of marks) { if (m.page <= p) cur = m.title; else break }
    return cur
  }
}

// Whitespace and case are the only things normalised. Nothing is stripped that
// could change meaning, because a loose comparison here would let an invented
// quote through and rule two would quietly stop holding.
const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

async function anthropic(body: Record<string, unknown>) {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return { ok: false, unavailable: true, error: 'ANTHROPIC_API_KEY is not set on this project' }
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, ...body }),
    })
  } catch (e) {
    return { ok: false, error: 'network: ' + String((e as Error)?.message || e), ms: Date.now() - started }
  }
  const ms = Date.now() - started
  const text = await res.text()
  if (!res.ok) {
    return { ok: false, http: res.status, unavailable: res.status === 401 || res.status === 404,
             error: text.slice(0, 400), ms }
  }
  try { return { ok: true, ms, body: JSON.parse(text) } }
  catch { return { ok: false, error: 'response was not JSON', ms } }
}

const PROMPT = [
  'You are reading a Florida residential real estate contract packet for a transaction coordinator.',
  '',
  'List the clauses that describe the deal. For each one give:',
  '  title     a short name for the term, in plain words',
  '  category  one of: ' + CATEGORIES.join(', '),
  '  severity  exactly one of:',
  '              standard    the printed form term, nothing bargained',
  '              negotiated  a blank filled in, or a printed term altered',
  '              unusual     a term that departs from what the form contemplates',
  '  page      the page number the term appears on, as marked by [[PAGE n]]',
  '  quote     at least ' + MIN_QUOTE + ' characters copied EXACTLY from that page',
  '  note      one or two sentences on what it means for this deal',
  '',
  'RULES.',
  '1. The quote must be copied character for character from the page you name.',
  '   Do not paraphrase it, do not tidy it, do not join separated words.',
  '   Every clause whose quote cannot be found on its page will be discarded.',
  '2. Only list terms that are actually in the document. If something a contract',
  '   usually has is absent, do not list it. Absence is not a clause.',
  '3. severity describes the TERM, not the risk. A filled-in closing date is',
  '   negotiated, not a problem. Do not warn, do not advise, do not rank danger.',
  '4. At most ' + MAX_CLAUSES + ' clauses. Prefer the ones a coordinator would need to read.',
  '',
  'Reply with JSON only, no prose and no code fence:',
  '{"clauses":[{"title":"","category":"","severity":"","page":1,"quote":"","note":""}]}',
].join('\n')

type Clause = { title?: string; category?: string; severity?: string; page?: number; quote?: string; note?: string }

async function register(fileId: string, dryRun: boolean) {
  const started = Date.now()
  const fail = async (outcome: string, detail: string | null, extra: Record<string, unknown> = {}) => {
    if (!dryRun) {
      await admin.from('realty_clause_runs').insert({
        file_id: fileId, outcome, model: MODEL, error_detail: detail,
        duration_ms: Date.now() - started, ...extra,
      })
    }
    return { outcome, file_id: fileId, detail, ...extra }
  }

  const { data: f } = await admin.from('files').select('id, raw_form_data').eq('id', fileId).maybeSingle()
  if (!f) return await fail('error', 'File not found')
  const path = f.raw_form_data?.contract_path || f.raw_form_data?.executed_contract_path
  if (!path || !String(path).trim()) {
    return await fail('no_contract',
      'No contract is attached to this file, so there is nothing to read. This is not a failed read.')
  }

  const key = String(path).replace(/^.*\/transaction-files\//, '').replace(/^\/+/, '')
  const dl = await admin.storage.from(BUCKET).download(key)
  if (dl.error) return await fail('unreadable', 'Contract download failed: ' + dl.error.message)

  let pages: string[]
  try { pages = await pdfToPages(new Uint8Array(await dl.data.arrayBuffer())) }
  catch (e) { return await fail('unreadable', 'PDF parse failed: ' + String((e as Error)?.message || e)) }

  const docAt = documentAt(pages)
  const marked = pages.map((p, i) => '[[PAGE ' + (i + 1) + ']]\n' + p).join('\n\n')
  const chars = marked.length

  // Structured output through a forced tool call, not through asking politely.
  //
  // Two earlier shapes were tried and are recorded here so nobody repeats them.
  // "Reply with JSON only" produced unparseable text and cost $0.13 for a run
  // that produced nothing. Prefilling the assistant turn with an opening brace
  // was rejected outright: this model does not support assistant prefill.
  //
  // A tool schema is the version that actually constrains. It also pins the
  // severity enum at the API boundary, so rule one is enforced one step earlier
  // than the code check below, which stays as well.
  const TOOL = {
    name: 'clause_register',
    description: 'Record the clauses found in this contract packet.',
    input_schema: {
      type: 'object',
      properties: {
        clauses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title:    { type: 'string', description: 'Short plain name for the term' },
              category: { type: 'string', enum: CATEGORIES as unknown as string[] },
              severity: { type: 'string', enum: SEVERITIES as unknown as string[] },
              page:     { type: 'integer', description: 'Page number as marked by [[PAGE n]]' },
              quote:    { type: 'string', description: 'At least ' + MIN_QUOTE + ' characters copied exactly from that page' },
              note:     { type: 'string', description: 'One or two sentences on what it means for this deal' },
            },
            required: ['title', 'category', 'severity', 'page', 'quote'],
          },
        },
      },
      required: ['clauses'],
    },
  }

  const r = await anthropic({
    max_tokens: 8000,
    system: PROMPT,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: marked }],
  })
  if (!r.ok) {
    const unavailable = (r as { unavailable?: boolean }).unavailable
    return await fail(unavailable ? 'model_unavailable' : 'model_error',
      (r as { error?: string }).error ?? 'model call failed', { pages: pages.length, chars })
  }

  const b = (r as { body: Record<string, unknown> }).body
  const usage = (b?.usage ?? {}) as Record<string, number>
  const inTok = usage.input_tokens ?? 0, outTok = usage.output_tokens ?? 0
  const usd = Number(((inTok / 1e6) * USD_IN + (outTok / 1e6) * USD_OUT).toFixed(6))
  const stop = String(b?.stop_reason ?? '')

  // The tool block arrives already parsed. Nothing to unwrap from prose.
  const blocks = (b?.content ?? []) as Array<Record<string, unknown>>
  const tool = blocks.find((x) => x?.type === 'tool_use')
  // input is normally an object. Accept a JSON string too rather than failing
  // on a shape difference that costs a dollar to discover.
  let input: unknown = tool?.input
  if (typeof input === 'string') { try { input = JSON.parse(input) } catch { /* leave as is */ } }
  const parsed = (input ?? null) as { clauses?: Clause[] } | null
  if (!parsed || !Array.isArray(parsed.clauses)) {
    // A failure here has to be diagnosable. Naming the block types and the keys
    // that did arrive is the difference between fixing it and paying for
    // another run to find out what happened.
    const shape = parsed && typeof parsed === 'object'
      ? 'keys=' + (Object.keys(parsed).join(',') || 'none')
      : 'input=' + (input === undefined ? 'undefined' : typeof input)
    return await fail('model_error',
      'the clause_register tool call could not be read. stop_reason=' + (stop || 'unknown')
      + ' blocks=' + (blocks.map((x) => String(x?.type)).join(',') || 'none')
      + ' ' + shape,
      { pages: pages.length, chars, input_tokens: inTok, output_tokens: outTok, usd })
  }
  // A truncated tool call is a partial register presented as a whole one.
  if (stop === 'max_tokens') {
    return await fail('model_error',
      'the register was cut off at the token limit, so it would have been incomplete. Nothing was stored.',
      { pages: pages.length, chars, input_tokens: inTok, output_tokens: outTok, usd })
  }

  const returned = (parsed.clauses ?? []).slice(0, MAX_CLAUSES)
  if (!returned.length) {
    return await fail('no_clauses_found', 'The model read the document and listed no clauses.',
      { pages: pages.length, chars, input_tokens: inTok, output_tokens: outTok, usd })
  }

  // ---- Rule two, enforced ---------------------------------------------------
  // Find every quote in the page text before anything is kept. A clause that
  // cannot be located is discarded, whatever it says about itself.
  const normPages = pages.map(norm)
  const kept: Array<Record<string, unknown>> = []
  const rejected: Array<{ title: string; reason: string }> = []

  returned.forEach((c) => {
    const title = stripCtl(String(c.title ?? '')).trim()
    const quote = stripCtl(String(c.quote ?? '')).trim()
    if (!title) { rejected.push({ title: '(untitled)', reason: 'no title' }); return }
    if (norm(quote).length < MIN_QUOTE) {
      rejected.push({ title, reason: 'quote shorter than ' + MIN_QUOTE + ' characters' }); return
    }
    const nq = norm(quote)
    const claimed = Number(c.page)
    let found = -1
    if (Number.isFinite(claimed) && claimed >= 1 && claimed <= pages.length
        && normPages[claimed - 1].includes(nq)) {
      found = claimed
    } else {
      const i = normPages.findIndex((p) => p.includes(nq))
      if (i >= 0) found = i + 1
    }
    if (found < 0) { rejected.push({ title, reason: 'quote not found anywhere in the document' }); return }

    const severity = String(c.severity ?? '').toLowerCase()
    if (!(SEVERITIES as readonly string[]).includes(severity)) {
      rejected.push({ title, reason: 'severity "' + severity + '" is not one of ' + SEVERITIES.join(', ') }); return
    }
    const category = String(c.category ?? '').toLowerCase()
    kept.push({
      ordinal: kept.length + 1,
      title, severity,
      category: (CATEGORIES as readonly string[]).includes(category) ? category : 'other',
      page: found,
      page_corrected: Number.isFinite(claimed) && claimed !== found,
      document: docAt(found),
      quote, quote_verified: true,
      note: stripCtl(String(c.note ?? '')).trim() || null,
    })
  })

  const base = {
    file_id: fileId, model: MODEL, pages: pages.length, chars,
    clauses_returned: returned.length, clauses_kept: kept.length, clauses_rejected: rejected.length,
    input_tokens: inTok, output_tokens: outTok, usd, duration_ms: Date.now() - started,
  }

  if (!kept.length) {
    return await fail('all_rejected',
      'The model returned ' + returned.length + ' clauses and none could be located in the document.',
      base)
  }

  if (dryRun) {
    return { outcome: 'registered', dry_run: true, ...base, clauses: kept, rejected }
  }

  const { data: run, error: runErr } = await admin.from('realty_clause_runs')
    .insert({ ...base, outcome: 'registered' }).select('id').single()
  if (runErr) return { outcome: 'error', detail: 'run insert failed: ' + runErr.message, ...base }

  const rows = kept.map((k) => ({ ...k, run_id: run.id, file_id: fileId }))
  const { error: cErr } = await admin.from('realty_contract_clauses').insert(rows)
  if (cErr) {
    await admin.from('realty_clause_runs').update({ outcome: 'error', error_detail: 'clause insert failed: ' + cErr.message }).eq('id', run.id)
    return { outcome: 'error', detail: 'clause insert failed: ' + cErr.message, run_id: run.id, ...base }
  }

  return { outcome: 'registered', run_id: run.id, ...base, rejected }
}

async function selftest() {
  const r = await anthropic({ max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] })
  if (!r.ok) {
    return { ok: false, model: MODEL,
      reason: (r as { http?: number }).http === 401 ? 'key rejected'
            : (r as { http?: number }).http === 404 ? 'model not available to this account' : 'call failed',
      http: (r as { http?: number }).http ?? null, detail: (r as { error?: string }).error ?? null }
  }
  const b = (r as { body: Record<string, unknown> }).body
  const u = (b?.usage ?? {}) as Record<string, number>
  return {
    ok: true, model_requested: MODEL, model_served: b?.model ?? null,
    reply: String((((b?.content ?? []) as Array<Record<string, unknown>>)[0]?.text ?? '')).trim(),
    input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0,
    usd: Number((((u.input_tokens ?? 0) / 1e6) * USD_IN + ((u.output_tokens ?? 0) / 1e6) * USD_OUT).toFixed(6)),
    ms: (r as { ms?: number }).ms ?? null,
  }
}

function isServiceRole(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return false
  if (token === SERVICE_ROLE) return true
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
  const fileId = String(body?.file_id ?? '').trim()
  if (!fileId) return json({ error: 'file_id required' }, 400)
  return json(await register(fileId, body?.dry_run === true))
})
