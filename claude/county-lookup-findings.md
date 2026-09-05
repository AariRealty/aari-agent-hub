# County parcel lookup: the dependency, proven

5 September 2026. Discovery only, no lookup code yet. Every result below was
run from inside Supabase's network, which is the path production uses. This
session's own proxy blocks general internet, so none of it is testable from the
build container.

## The answer changed twice. Both times for the better.

### First attempt: scrape the four appraiser websites

| County | Host | Result |
| --- | --- | --- |
| Lee | www.leepa.org | 200, but ASP.NET WebForms with `__VIEWSTATE` postbacks |
| Charlotte | www.ccappraiser.com | 200 |
| Collier | www.collierappraiser.com | 200. `pa.collier.gov` does not resolve |
| Hendry | hendryprop.com | **403, Cloudflare challenge.** A User-Agent did not help |

Workable for three, brittle for all of them, and Lee's postback flow is the
kind of integration that breaks on a site redesign nobody tells us about.

### Second attempt: the Florida DOR statewide layer

`Florida_Statewide_Parcel_Centroid_Version` on the state's ArcGIS org carries
exactly the right fields: `PARCEL_ID`, `S_LEGAL`, `OWN_NAME`, `ACT_YR_BLT`,
`PHY_ADDR1`, `LND_SQFOOT`, `ASMNT_YR`. One API, all 67 counties.

**It is not usable.** 10,831,924 parcels and no index that serves an address
lookup. Three access patterns, all tested:

- `LIKE` on the address, county filtered and anchored: **timeout at 45s**
- Point plus 150m distance: **rejected, invalid query parameters**
- Envelope: **timeout at 40s**

A selective query on an indexed field returns instantly, so the service is
healthy. It simply is not built for this question. Worth recording because it
is the obvious thing to reach for and it costs a day to discover the hard way.

### Third attempt, and this is the one: per county ArcGIS layers

Counties publish their own parcel layers. They are county sized, properly
indexed, documented, and return JSON.

**Discovery generalises.** The ArcGIS public search API finds them:

    https://www.arcgis.com/sharing/rest/search?q=<County>%20County%20Florida%20parcels%20type%3A%22Feature%20Service%22&f=json

| County | Layer | Status |
| --- | --- | --- |
| Lee | `services2.arcgis.com/LvWGAAhHwbCJ2GMP/.../Lee_County_Parcels` | **proven end to end** |
| Collier | `services2.arcgis.com/SlIq32SqARUHIhSx/.../Parcel` | found, not yet queried |
| Hendry | `services7.arcgis.com/8l7Qq5t0CPLAJwJK/.../Hendry_County_Parcels` | **found, and it bypasses Cloudflare** |
| Charlotte | not in the first five results | needs a different search term |

Lee also publishes `gismapserver.leegov.com/.../ParcelAddress/MapServer/0`,
built for address lookup specifically.

## Lee, proven

A live address query against `Lee_County_Parcels`, filtering
`UPPER(SITEADDR) LIKE '<number> <street>%'`, returned one parcel in seconds
carrying every field the contract needs:

| Contract need | Field | Result |
| --- | --- | --- |
| Paragraph 1(b) Property Tax ID | `STRAP`, `FOLIOID` | present |
| Paragraph 1(c) legal description | `LEGAL` | present, **188 characters** |
| Seller name cross check | `O_NAME` | present |
| Year built | `MINBUILTY` | 2001 |
| Acreage | `GISACRES` | 12.34 |

The county `LEGAL` is a **full** legal description. The statewide layer's
`S_LEGAL` is the DOR short form and is truncated, so even had it been fast it
would have been the weaker source for Paragraph 1(c).

The layer also carries `ZONING`, `BEDROOMS`, `BATHROOMS`, `POOL`, `SEAWALL`
and four sales histories. Not needed now, worth knowing it is there.

## Hendry is back in, and that reverses a decision

The instruction was to ship without Hendry because their website returns 403
behind a Cloudflare challenge. **That was the website. The GIS layer is a
different host and is open.** `Hendry_County_Parcels` needs no scraping and no
challenge solving.

So the feature can cover all four counties. It should be confirmed with a real
query before it is promised, and that is the next step, not an assumption.

## A useful spare part

The **US Census geocoder** is free, needs no key, and works from Supabase:

    https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=...&benchmark=Public_AR_Current&format=json

Tested, returned coordinates for a Cape Coral address. Not needed while address
text search works per county, but it is the fallback when an address will not
match a county's own string format, and it costs nothing to keep in reserve.

## All four counties, tested, and the honest table

Every row below was a live query, not a layer that merely exists.

| County | Source proven | Parcel ID | Legal for 1(c) | Owner | Year built | Address search |
| --- | --- | --- | --- | --- | --- | --- |
| **Lee** | `Lee_County_Parcels` | `STRAP`, `FOLIOID` | **full, 188 chars** | yes | yes | `SITEADDR` |
| **Charlotte** | FDOR South District | `PARCEL_ID` | **short form only, 18 chars** | yes | yes | `PHY_ADDR1` |
| **Collier** | FDOR South District | `PARCEL_ID` | **short form only** | yes | yes | `PHY_ADDR1` |
| **Hendry** | FDOR South District | `PARCEL_ID` | **short form only** | yes | yes | `PHY_ADDR1` |

### Why the county layers lost for three of the four

Collier and Hendry publish their own layers and both are weaker than the
regional FDOR one:

- **Collier `Parcel/2`**: `Folio, ParcelId, OwnerLine1, SiteStreetAddress`. No
  legal, no year built, and `SiteStreetAddress` came back **null** on the
  sample rows, so address lookup is unreliable.
- **Hendry `Hendry_County_Parcels/0`**: `PARCELNO, PROP_ID, OWNAME, LOCADD`. No
  legal, no year built, and `LOCADD` reads like "SEARS RD", a street name with
  no house number.

So for those two, and for Charlotte which publishes no usable public layer at
all, **FDOR South District is the better source**, not a fallback.

### The performance line, found precisely

- Statewide, 10,831,924 rows: **not queryable** by address. Three patterns, all
  failed.
- **FDOR South District, 1,642,725 rows: queryable.** An address query returns
  inside 40 seconds, and a city filtered query returned three Charlotte rows
  with `CO_NO` 18.

Somewhere between 1.6M and 10.8M rows this service stops serving ad hoc text
queries. Useful to know before anyone reaches for the statewide layer again.

### Paragraph 1(c) is filled for Lee only

The standing instruction is that a truncated legal description in a contract is
a defect, not a shortcut. FDOR's `S_LEGAL` came back at **18 characters** on a
real Charlotte parcel. That is a stub, not a legal description, and it would not
survive title review.

**So 1(c) is populated automatically for Lee and left blank for Charlotte,
Collier and Hendry**, with the screen saying that the county's published legal
is a short form unsuitable for a contract and must be taken from the deed or a
title commitment. 1(b), owner of record, year built and acreage still fill for
all four.

### One staleness fact that must reach the agent

FDOR data is the annual assessment roll. The sampled row carried
`ASMNT_YR` **2025**. Ownership that changed after that roll will not appear, so
the owner of record cross check can be up to a year behind. The roll year
travels with the value and is shown.

## What this means for the build

No scraping. No HTML parsing. No `__VIEWSTATE`. Four documented JSON APIs
behind one interface, plus a discovery method for adding counties later without
writing new code for each.

That is a materially smaller and more durable piece of work than the scope
document assumed, and it is the reason for proving the dependency first.
