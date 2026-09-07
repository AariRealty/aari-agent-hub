# The county lookup, built

5 September 2026. `realty-parcel-lookup` v6 is deployed and all four counties
answer. This is what it touches, where the results live, what happens when a
county is down, and what a run actually costs.

---

## What it does

An address in, and back: the parcel or tax id for FR/BAR Paragraph 1(b), the
legal description for 1(c) where a usable one exists, the owner of record for a
seller name cross check, the year built and the acreage.

Four counties, each proven with a real query against its own layer before it was
promised:

| County | Source | Legal for 1(c) | Roll |
|---|---|---|---|
| Lee | Lee County Parcels, the county's own layer | Yes, full | Live layer |
| Charlotte | FDOR South District cadastral | No, short form | 2025 |
| Collier | FDOR South District cadastral | No, short form | 2025 |
| Hendry | FDOR South District cadastral | No, short form | 2025 |

---

## What it touches

**Adds:** the edge function `realty-parcel-lookup`, the table
`realty_parcel_lookups`, and the check `build/test-parcel-lookup.js`.

**Does not touch:** `realty_transactions`, `realty_tx_documents`, `files`,
`hub_payload.html`, `hub_next.html`, `tx_module.html`, the Contracts screen, the
extractor, or any approved card. Nothing on a screen changes. The function is a
dependency the offer writer will call; it has no user interface of its own yet.

**Writes to exactly one table**, its own. It never writes a transaction.

---

## Where the results live

`realty_parcel_lookups`, one row per lookup. RLS on, no policies, so the edge
function reaches it with the service key and nothing in the browser can.

The table does two jobs. The cache is the obvious one: the same address gets
looked up repeatedly while an offer is written, and asking the county four times
in ten minutes is pointless. Cache window is 30 days, keyed on county plus the
address as typed, and only a `found` row is ever served from it. `fresh: true`
bypasses it.

The second job matters more. Every row records what was asked, which layer
answered, how long it took, and what came back, **including the failures**. A
blank field on a contract has to be explainable months later. "Hendry did not
answer at 09:26 on 5 September" is an explanation. An empty field with nothing
behind it is not.

A cached answer and a fresh one go through the same `shape()` function, so a
cache hit can never present differently from a live read. It only adds
`from_cache: true`.

---

## What happens when a county is down

Seven named outcomes. There is no eighth, and there is no silent one.

| Outcome | When | What the agent is told |
|---|---|---|
| `found` | One parcel matched | The values, with source, url, fetched-at and roll year |
| `not_found` | Nothing matched, on the exact spelling or a loosened one | To check the number and spelling, or that it may be another county |
| `ambiguous` | More than one distinct parcel matched | The candidate list, and to add the unit rather than guess |
| `timeout` | No answer in 25 seconds | That **the lookup failed, not that the property has no record** |
| `blocked` | HTTP 403 or 429 | That **the request was refused, not that the property has no record** |
| `error` | HTTP 5xx, or ArcGIS returned an error object inside a 200 | That the lookup failed, with the detail |
| `county_unsupported` | Not one of the four | Which four are covered |

The distinction between a timeout and a not_found is the whole point. A timeout
that rendered as "no record" would quietly tell an agent a property does not
exist. Every failure message says explicitly that the field is blank because the
lookup failed and not because the record is absent.

ArcGIS answers **HTTP 200 with an error object** when it is unhappy. That is
treated as an error, not as an empty result, or an outage would read as "this
address does not exist".

---

## How source, county and fetched-at reach the agent

Every `found` result carries `source`, `source_url`, `fetched_at`, `county`,
`editable: true` and `authoritative: false`. Nothing is ever presented as
settled. Two fields carry their own sentence:

**Paragraph 1(c), outside Lee.** The field comes back null with:

> Charlotte County publishes a short form legal description, which is a stub and
> is not sufficient for a contract. Take the full description from the deed or
> the title commitment.

Not "unavailable". The agent is told where to go next. Measured on the live
probes: Lee 188 characters, Charlotte 17, Collier 28, Hendry 30. A 17 character
legal in a contract is a defect, not a shortcut.

**The owner name, always.**

> Owner of record per the 2025 assessment roll. A sale recorded after that roll
> will not appear here.

A name that can be a year old never renders bare. Same discipline as the middle
dot over a zero.

---

## The wrong-county guard, made permanent

The dangerous failure is not an outage. It is a layer that confidently returns
data about somewhere else. **It has now happened twice.**

Once with a layer named "Charlotte County Parcel" that was not Charlotte County
Florida, caught only because Punta Gorda returned zero rows.

Once in this file, by me. Hendry was configured as `CO_NO` 32, read off a live
query filtered to `PHY_CITY = 'LABELLE'`. LaBelle is a mailing city that
straddles the county line, so it appears under 32 and under 36. **32 is Glades**:
Moore Haven, Palmdale, Venus, Lake Placid. **Hendry is 36**: Clewiston, LaBelle,
Felda, Harlem, Montura Ranches, Port LaBelle. The first version of the smoke test
asserted the city and passed while pointing at the wrong county.

So a city is not a county discriminator, and the check no longer uses one. Each
county carries a named public address and the exact parcel id that address must
return. A parcel id cannot be shared between counties, so a swapped or repointed
layer fails immediately.

| County | Probe address | Must return |
|---|---|---|
| Lee | 1015 Cultural Park Blvd S, Cape Coral, Cape Coral City Hall | `244423C2011980020` |
| Charlotte | 1200 W Retta Esplanade, Punta Gorda, Fishermen's Village | `412212126001` |
| Collier | 735 8th St S, Naples, Naples City Hall | `14044720002` |
| Hendry | 344 E Sugarland Hwy, Clewiston | `3 34 43 01 010 0362-012.0` |

All four are addresses you can look up yourself.

The guard runs in two places. `{"smoke": true}` checks all four layers at once,
and every real lookup rechecks the county code on every candidate, so an
ambiguous answer cannot quietly mix one county's parcels with another's.

### Why the live smoke is not in `npm run check`

The build container's egress proxy blocks the general internet and `supabase.co`
both. A live probe inside `npm run check` would have to be skipped or faked, and
a check that quietly skips is worse than no check at all.

So the live smoke runs as a mode on the function, from inside Supabase's network.
`build/test-parcel-lookup.js` is in `npm run check` and asserts the 66 things
that go wrong in the source rather than on the wire, which is where both real
failures came from: the wrong county code sitting in the config, and a probe too
weak to notice it. It was proved by reintroducing four regressions one at a time,
including the Glades code, and confirming each one fails the suite.

Run the live one from SQL:

```sql
select net.http_post(
  url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/realty-parcel-lookup',
  headers := jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer <anon jwt>'),
  body := '{"smoke":true}'::jsonb, timeout_milliseconds := 180000);
```

---

## Two things the metered run found

**Hendry answered `not_found` for a property that plainly exists.** The roll
stores `344 E  SUGARLAND HWY` with a double space. Normalising an agent's typing
to single spaces made the match miss. That is worse than an honest failure: it
tells the agent the property is not there. A miss on the exact pattern is now
retried with the spacing loosened, the street number stays anchored and followed
by a real space so 344 cannot match 3445, and a relaxed match is labelled
`match_mode: relaxed` with a note rather than passed off as exact.

**One parcel was reading as five.** FDOR carries one row per geometry, not one
per parcel. 850 Central Ave in Naples returns the same parcel id repeatedly, so
a single property was reporting as ambiguous when there was nothing ambiguous
about it. Duplicates are now collapsed on parcel id before the ambiguity
decision.

A third, smaller: the row cap is a cap, not a count. A condo tower returned 12
because 12 is what was asked for, and the message said "12 parcels match", which
is a figure the data does not support. A capped result now says "12 or more" and
explains that the source returned its maximum.

---

## The metered run

Every call below is real, against live layers, on 5 September 2026.

| Call | Outcome | Time |
|---|---|---|
| Smoke, all four counties | pass, 4 of 4 on exact parcel id | 159 to 206 ms each |
| Lee, cold | found, full 188 char legal | 258 ms |
| Charlotte, cold | found, short form flagged | 369 ms |
| Collier, cold | found, short form flagged | 279 ms |
| Hendry, cold | found via relaxed match | 351 ms |
| Lee, cached | found, `from_cache: true` | **43 ms** |
| Address with no match | not_found, two patterns tried | 646 ms |
| Address with no street number | error, no network call | 0 ms |
| County not covered | county_unsupported, no network call | 0 ms |
| Condo tower | ambiguous, 12 or more, capped | 519 ms |
| Duplicate geometry address | ambiguous, 3 distinct after collapse | 447 ms |
| Wrong probe secret | 403 | immediate |

**What a lookup costs.**

- **Model tokens: none.** This is the point. The county lookup is HTTP and
  string handling, no model in the path. It is the differentiator and it is
  free of the per-file cost that the extractor carries.
- **ArcGIS: nothing.** Both layers are free public services with no key and no
  published quota. `blocked` exists for the day that stops being true.
- **Supabase: one edge function invocation, one insert, and on a cold miss two
  outbound requests.** At Aari's volume this does not register against the
  plan.

The real budget is **time, not money**: about a third of a second cold, 43 ms
cached. An offer with four or five address-derived fields costs one lookup, not
five, because the cache is keyed on the address rather than the field.

---

## The performance boundary

Worth recording, because it is why the source is what it is.

The **statewide** DOR parcel layer holds **10.8 million rows and is not queryable
by address**. Three access patterns were tried and all three failed: a plain
`where` on the address field, a paged scan, and a filtered count. The layer
serves geometry, not attribute search, at that size.

The **FDOR South District** layer holds **1.64 million rows and answers in about
200 ms**, which is where the three FDOR counties are served from.

**Lee's own layer is better than either** and is used in preference: it is the
only one of the four that publishes a full legal description, 188 characters on
the probe against 17 for Charlotte.

So the boundary sits somewhere between 1.6 and 10.8 million rows. If a future
county has to come from a statewide source, expect it not to work, and plan on
the county's own layer or a nightly extract instead of a live query.

The **Census geocoder** stays documented and unwired, as agreed. It is a fallback
worth having on the day a county layer goes dark, not a second source running in
parallel that could disagree with the first.

---

## Access

Any **active** member, agent or broker. Public records are public; our rate
against them is not, so the function requires a signed-in active member.

A **metered probe** path exists alongside it, guarded by `parcel_probe_secret` in
`realty_config`, service role only, on the same pattern as the contract probe.
It runs the ordinary lookup path, cache included, so what it measures is what an
agent would get. It is how the table above was produced.

---

## Still open

- **A blank FAR/BAR form is not stored**, and will not be until the licensing
  answer is in writing. That gate is unchanged.
- **The offer writer itself is not built.** This function is its first
  dependency and stands alone.
- **A process for noticing a new FAR/BAR revision** is still to be designed.
- **A roll-year watch.** The three FDOR counties are on the 2025 roll. When they
  roll to 2026 the owner notes will say so on their own, because the year is read
  from the data rather than written down, but nothing yet tells you the roll
  changed.
