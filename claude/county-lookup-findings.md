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

## What this means for the build

No scraping. No HTML parsing. No `__VIEWSTATE`. Four documented JSON APIs
behind one interface, plus a discovery method for adding counties later without
writing new code for each.

That is a materially smaller and more durable piece of work than the scope
document assumed, and it is the reason for proving the dependency first.
