// realty-parcel-lookup · public records parcel lookup for Lee, Charlotte,
// Collier and Hendry.
//
// WHAT THIS IS FOR. An address in, and back: the parcel or tax id for FR/BAR
// Paragraph 1(b), the legal description for 1(c) where a usable one exists,
// the owner of record for a seller name cross check, year built and acreage.
//
// THREE RULES IT HOLDS.
//
// 1. Nothing fails silently. Every outcome is named: found, not_found,
//    ambiguous, county_unsupported, timeout, blocked, error. A field left blank
//    always carries the reason and the time. An empty field with no explanation
//    is not a state this function can produce.
//
// 2. Never authoritative. Every value comes back with its source, the url that
//    served it, when it was read, and the assessment roll year where one
//    applies. The agent can always overwrite it.
//
// 3. Paragraph 1(c) is filled ONLY from a full legal description. FDOR's
//    S_LEGAL is a stub: 17 characters on the Punta Gorda probe, 28 on the
//    Naples one. A truncated legal in a contract is a defect, not a shortcut,
//    so outside Lee the legal is returned marked short_form and the caller must
//    not put it in 1(c).
//
// THE DANGEROUS FAILURE IS NOT AN OUTAGE. It is a layer that confidently
// returns data about somewhere else. This has now happened twice.
//
//   Once with a layer named "Charlotte County Parcel" that was not Charlotte
//   County Florida, caught because Punta Gorda returned zero rows.
//
//   Once here, in this file. Hendry was configured as CO_NO 32, read off a
//   live query filtered to PHY_CITY 'LABELLE'. LaBelle is a mailing city that
//   straddles the county line, so it appears under 32 and under 36. 32 is
//   Glades: its city list is Moore Haven, Palmdale, Venus, Lake Placid. Hendry
//   is 36: Clewiston, LaBelle, Felda, Harlem, Montura Ranches, Port LaBelle.
//   The first version of the smoke test asserted the city and passed while
//   pointing at the wrong county.
//
// So a city is not a county discriminator and the smoke test no longer uses
// one. Each county carries a named public address and the exact parcel id that
// address must return. A parcel id cannot be shared across counties, so a
// swapped or repointed layer fails the check immediately.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }) }

const FDOR = 'https://services1.arcgis.com/nRHtyn3uE1kyzoYc/arcgis/rest/services/FDORCadastral_SouthDistrict/FeatureServer/0/query'
const FDOR_OUT = 'PARCEL_ID,S_LEGAL,OWN_NAME,ACT_YR_BLT,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,CO_NO,ASMNT_YR,LND_SQFOOT'

// County codes read from live data on 5 September 2026 by listing the distinct
// cities under each code, not by assuming an alphabetical position and not by
// sampling one city. Recorded here because both earlier attempts to derive them
// were wrong.
type County = {
  label: string; source: string; url: string; out: string;
  addr: string; city: string; fullLegal: boolean; coNo?: number;
  // The permanent wrong-county guard: a named public address and the parcel id
  // it must return. Both are verifiable by anyone with a browser.
  probeName: string; probeAddress: string; probeWhere: string; probeParcelId: string;
}
const COUNTIES: Record<string, County> = {
  lee: {
    label: 'Lee', source: 'Lee County Parcels',
    url: 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0/query',
    out: 'STRAP,FOLIOID,LEGAL,O_NAME,MINBUILTY,GISACRES,SITEADDR,SITECITY,SITEZIP',
    addr: 'SITEADDR', city: 'SITECITY', fullLegal: true,
    probeName: 'Cape Coral City Hall',
    probeAddress: '1015 Cultural Park Blvd S, Cape Coral',
    probeWhere: "UPPER(SITEADDR) LIKE '1015 CULTURAL PARK BLVD%'",
    probeParcelId: '244423C2011980020',
  },
  charlotte: {
    label: 'Charlotte', source: 'FDOR South District cadastral', url: FDOR, out: FDOR_OUT,
    addr: 'PHY_ADDR1', city: 'PHY_CITY', fullLegal: false, coNo: 18,
    probeName: "Fishermen's Village, Punta Gorda",
    probeAddress: '1200 W Retta Esplanade, Punta Gorda',
    probeWhere: "UPPER(PHY_ADDR1) LIKE '1200 W RETTA ESPLANADE%'",
    probeParcelId: '412212126001',
  },
  collier: {
    label: 'Collier', source: 'FDOR South District cadastral', url: FDOR, out: FDOR_OUT,
    addr: 'PHY_ADDR1', city: 'PHY_CITY', fullLegal: false, coNo: 21,
    probeName: 'Naples City Hall',
    probeAddress: '735 8th St S, Naples',
    probeWhere: "UPPER(PHY_ADDR1) LIKE '735 8TH ST S%'",
    probeParcelId: '14044720002',
  },
  hendry: {
    label: 'Hendry', source: 'FDOR South District cadastral', url: FDOR, out: FDOR_OUT,
    addr: 'PHY_ADDR1', city: 'PHY_CITY', fullLegal: false, coNo: 36,
    probeName: '344 E Sugarland Hwy, Clewiston',
    probeAddress: '344 E Sugarland Hwy, Clewiston',
    // The roll holds a double space in this address, so the probe spans it.
    probeWhere: "UPPER(PHY_ADDR1) LIKE '344 E%SUGARLAND HWY%'",
    probeParcelId: '3 34 43 01 010 0362-012.0',
  },
}

const TIMEOUT_MS = 25000
const CACHE_DAYS = 30
// Rows asked of the layer. Above 1 so ambiguity is visible rather than
// silently resolved to whichever parcel happened to come back first, and well
// above 1 because the cap applies before duplicate geometries are collapsed.
const ROW_CAP = 12

async function arcgis(url: string, where: string, out: string, limit: number) {
  const q = url + '?where=' + encodeURIComponent(where)
    + '&outFields=' + encodeURIComponent(out)
    + '&returnGeometry=false&resultRecordCount=' + limit + '&f=json'
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    const res = await fetch(q, { signal: ctl.signal })
    const ms = Date.now() - started
    if (res.status === 403 || res.status === 429) return { outcome: 'blocked', http: res.status, ms }
    if (!res.ok) return { outcome: 'error', http: res.status, ms, detail: 'HTTP ' + res.status }
    const body = await res.json()
    // ArcGIS answers 200 with an error object. Treat that as an error, not as
    // an empty result, or an outage reads as "this address does not exist".
    if (body && body.error) return { outcome: 'error', ms, detail: String(body.error.message || 'ArcGIS error') }
    return { outcome: 'ok', ms, features: (body && body.features) || [] }
  } catch (e) {
    const ms = Date.now() - started
    const aborted = (e as Error)?.name === 'AbortError'
    return { outcome: aborted ? 'timeout' : 'error', ms, detail: aborted ? ('no answer in ' + TIMEOUT_MS + 'ms') : String((e as Error)?.message || e) }
  } finally { clearTimeout(timer) }
}

// "1130 NW 14th Ter, Cape Coral, FL 33993" -> street "1130 NW 14TH TER",
// city "CAPE CORAL". The county layers hold the street line and the city
// separately, so a single string has to be split before it can be matched.
function splitAddress(input: string) {
  const s = String(input || '').trim().replace(/\s+/g, ' ')
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean)
  const street = (parts[0] || '').toUpperCase()
  let city = (parts[1] || '').toUpperCase()
  city = city.replace(/\s+(FL|FLORIDA)$/i, '').trim()
  return { street, city }
}

// An apostrophe in an address would end the ArcGIS string literal.
function esc(s: string) { return String(s).replace(/'/g, "''") }

// The roll does not keep its own addresses tidy. 344 E Sugarland Hwy in
// Clewiston is stored as "344 E  SUGARLAND HWY", with two spaces, so an agent
// typing it normally got not_found for a property that plainly exists. That is
// worse than an honest failure: it tells the agent the property is not there.
//
// So a miss on the exact pattern is retried with the spaces loosened. The
// street number stays anchored and followed by a real space, which keeps 344
// from matching 3445, and the tokens stay in order. A relaxed pattern that
// matches more than one parcel still comes back as ambiguous, so loosening can
// widen the search but can never quietly pick the wrong parcel.
function relaxedPattern(street: string) {
  const parts = street.split(' ').filter(Boolean)
  if (parts.length < 2) return null
  return parts[0] + ' %' + parts.slice(1).join('%') + '%'
}

function pick(a: Record<string, unknown>, c: County) {
  const g = (k: string) => { const v = a[k]; return (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim() }
  const acresRaw = c.fullLegal ? g('GISACRES') : g('LND_SQFOOT')
  let acres: number | null = null
  if (acresRaw) {
    const n = Number(acresRaw)
    if (!isNaN(n) && n > 0) acres = c.fullLegal ? Math.round(n * 10000) / 10000 : Math.round((n / 43560) * 10000) / 10000
  }
  const yr = c.fullLegal ? g('MINBUILTY') : g('ACT_YR_BLT')
  return {
    parcel_id: c.fullLegal ? (g('STRAP') || g('FOLIOID')) : g('PARCEL_ID'),
    legal: c.fullLegal ? g('LEGAL') : g('S_LEGAL'),
    owner_of_record: c.fullLegal ? g('O_NAME') : g('OWN_NAME'),
    // A year of 0 means no building, not a building from year zero.
    year_built: (yr && yr !== '0') ? yr : null,
    acres,
    matched_address: g(c.addr),
    matched_city: g(c.city),
    roll_year: c.fullLegal ? null : g('ASMNT_YR'),
    co_no: g('CO_NO'),
  }
}

// FDOR carries one row per geometry, not one per parcel, so a single parcel can
// come back several times. 850 Central Ave in Naples returns the same parcel id
// five times. Without this, one property reads as five and the lookup reports
// ambiguous when there is nothing ambiguous about it.
function dedupe(feats: Array<{ attributes: Record<string, unknown> }>, c: County) {
  const seen = new Set<string>()
  const out: Array<{ attributes: Record<string, unknown> }> = []
  for (const f of feats) {
    const id = pick(f.attributes, c).parcel_id
    const k = id || JSON.stringify(f.attributes)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}

async function record(row: Record<string, unknown>) {
  try { await admin.from('realty_parcel_lookups').insert(row) } catch (_e) { /* the lookup still answers */ }
}

async function lookup(address: string, countyKey: string, useCache: boolean) {
  const c = COUNTIES[countyKey]
  if (!c) {
    return { outcome: 'county_unsupported', county: countyKey,
      message: 'Aari does not look up ' + countyKey + '. Covered counties are Lee, Charlotte, Collier and Hendry.' }
  }
  const { street, city } = splitAddress(address)
  if (!street || !/\d/.test(street)) {
    return { outcome: 'error', county: c.label, message: 'That address has no street number, so there is nothing to match on.' }
  }

  if (useCache) {
    const since = new Date(Date.now() - CACHE_DAYS * 86400000).toISOString()
    const { data: hit } = await admin.from('realty_parcel_lookups')
      .select('*').eq('county', countyKey).eq('outcome', 'found')
      .ilike('address_query', address.trim().replace(/[%_\\]/g, '\\$&')).gte('fetched_at', since)
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle()
    if (hit) return { ...shape(hit as Record<string, unknown>, c), from_cache: true }
  }

  const tail = (city ? ' AND UPPER(' + c.city + ")='" + esc(city) + "'" : '')
    + (c.coNo ? ' AND CO_NO=' + c.coNo : '')
  const whereFor = (pat: string) => 'UPPER(' + c.addr + ") LIKE '" + esc(pat) + "'" + tail

  let matchMode = 'exact'
  let r = await arcgis(c.url, whereFor(street + '%'), c.out, ROW_CAP)
  let ms = (r as { ms?: number }).ms ?? 0
  if (r.outcome === 'ok' && !((r as { features: unknown[] }).features || []).length) {
    const loose = relaxedPattern(street)
    if (loose) {
      const r2 = await arcgis(c.url, whereFor(loose), c.out, ROW_CAP)
      ms += (r2 as { ms?: number }).ms ?? 0
      if (r2.outcome === 'ok' && ((r2 as { features: unknown[] }).features || []).length) { r = r2; matchMode = 'relaxed' }
      else if (r2.outcome !== 'ok') r = r2
    }
  }

  const base = { address_query: address.trim(), county: countyKey, source: c.source, source_url: c.url, duration_ms: ms }

  if (r.outcome !== 'ok') {
    const msg = r.outcome === 'timeout'
      ? c.label + ' public records did not answer in time. The field is blank because the lookup failed, not because the property has no record.'
      : r.outcome === 'blocked'
      ? c.label + ' public records refused the request. The field is blank because the lookup was refused, not because the property has no record.'
      : c.label + ' public records returned an error. The field is blank because the lookup failed, not because the property has no record.'
    await record({ ...base, outcome: r.outcome, error_detail: (r as { detail?: string }).detail ?? null })
    return { outcome: r.outcome, county: c.label, message: msg, detail: (r as { detail?: string }).detail ?? null, fetched_at: new Date().toISOString() }
  }

  const rawFeats = (r as { features: Array<{ attributes: Record<string, unknown> }> }).features
  // The row cap is a cap, not a count. A condo tower returns 12 because 12 is
  // what we asked for, so saying "12 parcels match" would be a figure the data
  // does not support.
  const truncated = rawFeats.length >= ROW_CAP
  const feats = dedupe(rawFeats, c)
  if (!feats.length) {
    await record({ ...base, outcome: 'not_found', candidates: 0 })
    return { outcome: 'not_found', county: c.label,
      message: 'No parcel in ' + c.label + ' County matches that address, on the exact spelling or on a loosened one. Check the street number and spelling, or the property may be in another county.',
      fetched_at: new Date().toISOString() }
  }

  // The wrong county check, on every real lookup and not only in smoke mode.
  // Applied across every candidate, so an ambiguous answer cannot quietly mix
  // one county's parcels with another's.
  if (c.coNo) {
    const strays = feats.map((f) => pick(f.attributes, c).co_no).filter((n) => n && Number(n) !== c.coNo)
    if (strays.length) {
      await record({ ...base, outcome: 'error', error_detail: 'county code mismatch: expected ' + c.coNo + ', layer returned ' + strays.join(',') })
      return { outcome: 'error', county: c.label,
        message: 'The records source answered with a parcel in a different county and the result was discarded.',
        detail: 'expected CO_NO ' + c.coNo + ', got ' + strays.join(','), fetched_at: new Date().toISOString() }
    }
  }

  if (feats.length > 1) {
    await record({ ...base, outcome: 'ambiguous', candidates: feats.length, candidates_truncated: truncated })
    return { outcome: 'ambiguous', county: c.label, candidates: feats.length, candidates_truncated: truncated,
      message: (truncated ? feats.length + ' or more' : String(feats.length))
        + ' parcels in ' + c.label + ' County match that address. Add the unit or pick from the list rather than guessing.'
        + (truncated ? ' The source returned its maximum of ' + ROW_CAP + ' rows, which collapsed to ' + feats.length
            + ' distinct ' + (feats.length === 1 ? 'parcel' : 'parcels') + ', so there may be more beyond them.' : ''),
      options: feats.map((f) => { const p = pick(f.attributes, c); return { parcel_id: p.parcel_id, matched_address: p.matched_address } }),
      fetched_at: new Date().toISOString() }
  }

  const p = pick(feats[0].attributes, c)
  const row = {
    ...base, outcome: 'found', candidates: 1, match_mode: matchMode,
    roll_year: p.roll_year, parcel_id: p.parcel_id,
    legal_description: p.legal, legal_is_short_form: !c.fullLegal,
    owner_of_record: p.owner_of_record, year_built: p.year_built,
    acres: p.acres, matched_address: p.matched_address, raw: feats[0].attributes,
  }
  await record(row)
  return shape(row, c)
}

// One shape for a found result, whether it came from the layer or the cache,
// so a cached answer can never present differently from a fresh one.
function shape(row: Record<string, unknown>, c: County) {
  const shortForm = !!row.legal_is_short_form
  return {
    outcome: 'found',
    county: c.label,
    source: row.source, source_url: row.source_url,
    fetched_at: row.fetched_at ?? new Date().toISOString(),
    roll_year: row.roll_year ?? null,
    // Paragraph 1(b).
    parcel_id: row.parcel_id ?? null,
    // Paragraph 1(c). Only offered when it is a full description.
    legal_description: shortForm ? null : (row.legal_description ?? null),
    legal_for_contract: !shortForm && !!row.legal_description,
    legal_note: shortForm
      ? c.label + ' County publishes a short form legal description, which is a stub and is not sufficient for a contract. Take the full description from the deed or the title commitment.'
      : null,
    owner_of_record: row.owner_of_record ?? null,
    // A name that can be a year old must never render bare.
    owner_note: row.roll_year
      ? 'Owner of record per the ' + row.roll_year + ' assessment roll. A sale recorded after that roll will not appear here.'
      : (row.owner_of_record ? 'Owner of record per ' + c.source + '.' : null),
    year_built: row.year_built ?? null,
    acres: row.acres ?? null,
    matched_address: row.matched_address ?? null,
    match_mode: row.match_mode ?? 'exact',
    // A relaxed match is never passed off as an exact one.
    match_note: row.match_mode === 'relaxed'
      ? 'The roll stores this address with irregular spacing, so it was matched on a loosened pattern. Check the matched address reads as you expect before using it.'
      : null,
    editable: true,
    authoritative: false,
  }
}

// Smoke mode. Proves each layer still answers AND still answers about the right
// county. The assertion is the parcel id, not the city: a city can straddle a
// county line and one of them does, which is how the wrong Hendry code survived
// the first version of this check.
async function smoke() {
  const out: Record<string, unknown>[] = []
  for (const key of Object.keys(COUNTIES)) {
    const c = COUNTIES[key]
    const r = await arcgis(c.url, c.probeWhere + (c.coNo ? ' AND CO_NO=' + c.coNo : ''), c.out, ROW_CAP)
    const head = { county: c.label, probe: c.probeName, probe_address: c.probeAddress, expected_parcel_id: c.probeParcelId }
    if (r.outcome !== 'ok') {
      out.push({ ...head, pass: false, reason: r.outcome, detail: (r as { detail?: string }).detail ?? null, ms: (r as { ms?: number }).ms ?? null })
      continue
    }
    const feats = dedupe((r as { features: Array<{ attributes: Record<string, unknown> }> }).features, c)
    if (!feats.length) {
      out.push({ ...head, pass: false, reason: 'known_address_returned_nothing', ms: (r as { ms?: number }).ms ?? null })
      continue
    }
    const p = pick(feats[0].attributes, c)
    const idOk = p.parcel_id === c.probeParcelId
    const oneRow = feats.length === 1
    const countyOk = c.coNo ? Number(p.co_no) === c.coNo : true
    const reason = !idOk ? 'parcel_id_changed' : !oneRow ? 'probe_no_longer_unique' : !countyOk ? 'wrong_county_code' : null
    out.push({
      ...head, pass: !reason, reason,
      got_parcel_id: p.parcel_id, got_address: p.matched_address, got_city: p.matched_city,
      expected_co_no: c.coNo ?? null, got_co_no: p.co_no,
      full_legal_expected: c.fullLegal, legal_chars: p.legal ? p.legal.length : 0,
      rows_after_dedupe: feats.length, ms: (r as { ms?: number }).ms ?? null,
    })
  }
  return { ok: out.every((x) => x.pass), counties: out }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user } } = await admin.auth.getUser(token)
  const body = await req.json().catch(() => ({}))

  if (body?.smoke === true) return json(await smoke())

  // Metered probe. Same discipline as the contract probe: a shared secret held
  // in realty_config, service role only, so a real lookup can be run and timed
  // without a signed-in browser session. It runs the ordinary lookup path,
  // cache included, so what it measures is what an agent would get.
  if (typeof body?.probe_secret === 'string' && body.probe_secret) {
    const { data: cfg } = await admin.from('realty_config').select('value').eq('key', 'parcel_probe_secret').maybeSingle()
    if (!cfg?.value || cfg.value !== body.probe_secret) return json({ error: 'bad_probe_secret' }, 403)
    const a = String(body?.address ?? '').trim()
    const cty = String(body?.county ?? '').trim().toLowerCase()
    if (!a || !cty) return json({ error: 'address and county required' }, 400)
    const t0 = Date.now()
    const res = await lookup(a, cty, body?.fresh !== true)
    return json({ ...res, probe_total_ms: Date.now() - t0 })
  }

  // Agents write offers, so this is not broker and TC only. It still needs an
  // active member: public records are public, our rate against them is not.
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { data: member } = await admin.from('realty_members').select('status').eq('user_id', user.id).maybeSingle()
  if (!member || member.status !== 'active') return json({ error: 'forbidden' }, 403)

  const address = String(body?.address ?? '').trim()
  if (!address) return json({ error: 'address required' }, 400)
  const county = String(body?.county ?? '').trim().toLowerCase()
  if (!county) return json({ error: 'county required', supported: Object.keys(COUNTIES) }, 400)

  return json(await lookup(address, county, body?.fresh !== true))
})
