// realty-clause-probe · can the clause register be built without a model?
//
// A measurement, not a feature. No model call, no cost, writes nothing.
//
// THE HYPOTHESIS. The FR/BAR AS IS is a standard form. A coordinator does not
// need to be told Paragraph 12 exists. What she needs is which riders and
// addenda are attached, which optional boxes are ticked, and what was typed
// into Additional Terms. All three are pattern matching, which the extractor
// already does.
//
// This takes the 92 clauses a model produced on four real packets and asks, of
// each one, whether the deterministic pipeline could have found it:
//
//   by_document   its page falls inside a named rider or addendum
//   by_field      its quote contains a value the extractor already extracts
//   by_addl       its quote falls inside an Additional Terms block
//
// Anything in none of those three is what a model buys.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = Deno.env.get('AARI_CONTRACT_BUCKET') ?? 'transaction-files'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const CTL_RE = new RegExp('[' + '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F' + ']', 'g')
const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

async function pdfToPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(bytes)
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
      let row = rows.find((r) => Math.abs(r.y - it.y) <= 5)
      if (!row) { row = { y: it.y, items: [] }; rows.push(row) }
      row.items.push(it)
    }
    const out: string[] = []
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      let line = '', lastEnd: number | null = null
      for (const it of row.items) {
        if (lastEnd != null) { const gap = it.x - lastEnd; if (gap > 6) line += '  '; else if (line && !/\s$/.test(line)) line += ' ' }
        line += it.s; lastEnd = it.x + (it.w || it.s.length * 4)
      }
      out.push(line)
    }
    pages.push(out.join('\n').replace(CTL_RE, ''))
  }
  return pages
}

// The free text areas of the FR/BAR AS IS and its riders. Deliberately generous:
// the question is whether a pattern CAN reach these clauses, so a loose pattern
// that over-reaches is the honest way to test the best case for the hypothesis.
const ADDL_START = /ADDITIONAL TERMS|OTHER TERMS|ADDENDA\b|Additional Terms\b|^\s*20\.\s|SPECIAL CLAUSES|OTHER PROVISIONS/i
// The block runs until the next numbered paragraph or a signature block.
const ADDL_END = /^\s*\d{1,2}\.\s+[A-Z]{3,}|STANDARDS FOR REAL ESTATE|BUYER'?S? INITIALS|SIGNATURE|^\s*Buyer:|^\s*Seller:/i

function additionalTermsRegions(pages: string[]) {
  const regions: Array<{ page: number; text: string }> = []
  pages.forEach((pg, i) => {
    const lines = pg.split('\n')
    let open = -1
    lines.forEach((l, li) => {
      if (open < 0 && ADDL_START.test(l)) { open = li; return }
      if (open >= 0 && li > open + 1 && ADDL_END.test(l)) {
        regions.push({ page: i + 1, text: lines.slice(open, li).join('\n') }); open = -1
      }
    })
    if (open >= 0) regions.push({ page: i + 1, text: lines.slice(open).join('\n') })
  })
  return regions
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  let okRole = token === SERVICE_ROLE
  if (!okRole && token.split('.').length === 3) {
    try {
      const pad = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      okRole = JSON.parse(atob(pad + '='.repeat((4 - pad.length % 4) % 4)))?.role === 'service_role'
    } catch { okRole = false }
  }
  if (!okRole) return json({ error: 'forbidden' }, 403)

  const { data: files } = await admin.from('files')
    .select('id, raw_form_data')
    .in('id', (await admin.from('realty_contract_clauses').select('file_id')).data?.map((r) => r.file_id) ?? [])

  const perFile: Record<string, unknown>[] = []
  const tally = { clauses: 0, by_document: 0, by_field: 0, by_addl: 0, reachable: 0, unreachable: 0 }
  const unreachable: Array<Record<string, unknown>> = []

  for (const f of files ?? []) {
    const ex = (f.raw_form_data?.extracted_contract ?? {}) as Record<string, unknown>
    const fields = (ex.fields ?? {}) as Record<string, string>
    const docs = (ex.documents ?? []) as Array<{ title?: string; page?: number; pages?: number }>
    const path = f.raw_form_data?.contract_path
    if (!path) continue
    const key = String(path).replace(/^.*\/transaction-files\//, '').replace(/^\/+/, '')
    const dl = await admin.storage.from(BUCKET).download(key)
    if (dl.error) { perFile.push({ file_id: f.id, error: dl.error.message }); continue }
    const pages = await pdfToPages(new Uint8Array(await dl.data.arrayBuffer()))
    const regions = additionalTermsRegions(pages)
    const addlNorm = regions.map((r) => norm(r.text))

    const { data: clauses } = await admin.from('realty_contract_clauses')
      .select('id, severity, page, quote, title').eq('file_id', f.id).order('ordinal')

    const c1 = { clauses: 0, by_document: 0, by_field: 0, by_addl: 0, reachable: 0, unreachable: 0 }
    for (const c of clauses ?? []) {
      c1.clauses++; tally.clauses++
      const nq = norm(c.quote)

      const inDoc = docs.some((d) => d.title && d.title !== 'Contract' && d.page != null
        && c.page >= d.page && c.page < d.page + Math.max(Number(d.pages) || 1, 1))
      const byField = Object.values(fields).some((v) => String(v).length >= 5 && nq.includes(norm(String(v))))
      const byAddl = addlNorm.some((t) => t.includes(nq))

      if (inDoc) { c1.by_document++; tally.by_document++ }
      if (byField) { c1.by_field++; tally.by_field++ }
      if (byAddl) { c1.by_addl++; tally.by_addl++ }
      if (inDoc || byField || byAddl) { c1.reachable++; tally.reachable++ }
      else {
        c1.unreachable++; tally.unreachable++
        unreachable.push({ severity: c.severity, page: c.page, in_addl_region_on_page: regions.some((r) => r.page === c.page) })
      }
    }
    perFile.push({ file_id: f.id, pages: pages.length, addl_regions: regions.length, ...c1 })
  }

  // What the unreachable ones have in common, as counts only.
  const bySeverity: Record<string, number> = {}
  const byPageBand: Record<string, number> = {}
  let onAPageWithAnAddlRegion = 0
  for (const u of unreachable) {
    bySeverity[String(u.severity)] = (bySeverity[String(u.severity)] ?? 0) + 1
    const band = Number(u.page) <= 5 ? 'p1_5' : Number(u.page) <= 11 ? 'p6_11' : 'p12_plus'
    byPageBand[band] = (byPageBand[band] ?? 0) + 1
    if (u.in_addl_region_on_page) onAPageWithAnAddlRegion++
  }

  return json({ tally, per_file: perFile,
    unreachable_profile: { by_severity: bySeverity, by_page_band: byPageBand,
      on_a_page_that_has_an_additional_terms_region: onAPageWithAnAddlRegion } })
})
