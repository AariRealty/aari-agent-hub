# Metricool MCP field reference (Aari)

Everything here was discovered by probing the live API. Field IDs are
`<network><connector><index>`. Prefer this file over guessing — several
conventions are irregular (TikTok is `TK`, not `TT`).

## Tools that actually exist

The Metricool MCP exposes exactly nine tools. There is **no** `get_brands`,
`get_analytics`, `get_network_competitors`, or `get_network_competitors_posts`.

| Purpose | Tool |
|---------|------|
| List brands | `getBrandSettings` |
| Pull any metric | `getAnalyticsDataByMetrics` |
| Discover field IDs | `getAnalyticsAvailableMetrics` |
| Best time to post | `getBestTimeToPostByNetwork` |
| Read scheduled posts | `getScheduledPosts` |
| Schedule / update / review posts | `createScheduledPost`, `createScheduledPostForReview`, `updateScheduledPost`, `sendScheduledPostForReview` |

Server prefix in the Aari setup is `Metricool_Social_Media_Management`. If it
does not resolve, ToolSearch `metricool` and use the prefix that comes back.

## Brands

| Brand | ID | Networks |
|-------|-----|----------|
| aari.realty | 6748479 | Instagram, Facebook, Threads, LinkedIn, Pinterest, TikTok, Google Business, YouTube, Facebook Ads |
| aari.transactions | 6752039 | Instagram only |
| *(unnamed)* | 6751801 | none connected — empty shell |

**X / Twitter is not connected.** `getBestTimeToPostByNetwork` with
`socialNetwork: "twitter"` returns `403 AuthorizationException`. That is the
signature of a missing connection, not a permissions bug — do not retry it.

Always re-read `getBrandSettings` rather than trusting these IDs.

## Cross-network post data — `brandSummary`

The only connector that spans every network in one call. Use it for
multi-network roll-ups.

| Field | Meaning |
|-------|---------|
| BSPO01 | network |
| BSPO02 | published (date + time) |
| BSPO06 | impressions |
| BSPO07 | interactions |
| BSPO09 | post type |

No reach and no follower count — those are per-network only.

## Per-network account metrics (`evolution` connector)

| Metric | Instagram | TikTok | Facebook |
|--------|-----------|--------|----------|
| Followers | IGEV01 | TKEV07 | FBEV17 |
| Impressions / views | IGEV05 | TKEV02 | FBEV49 (page media view) |
| Reach | IGEV06 (account) · IGEV11 (posts) · IGEV18 (stories) | TKEV11 | **unavailable** |
| Interactions | IGEV38 | TKEV06 | FBEV34 |
| Post count | IGEV37 | TKEV01 | FBEV33 |
| Stories | IGEV16 / IGEV17 / IGEV18 | — | FBEV35 |

Facebook exposes only avg-reach-per-post (FBEV11 / FBEV18 / FBEV20), which
returns null on low-volume accounts. Treat Facebook reach and Facebook
engagement rate as unavailable rather than zero.

## Instagram post-level (for the tier benchmark)

- Reels: `IGRE01,07,09,10,11,12,21,23,24` → date, comments, interactions, likes, reach, saved, shares, views, avg watch time (seconds)
- Posts: `IGPO01,07,08,12,13,14,15,27,28` → date, type, comments, interactions, likes, reach, saved, shares, views
  - Type `FEED_CAROUSEL_ALBUM` = carousel, `FEED_IMAGE` = single image
- Stories: `IGST01,08,09,10,11,12,13` → date, exits, impressions, reach, replies, taps back, taps forward

## Competitors

Supported on Instagram, Facebook, Twitch, YouTube, X, Bluesky. **Not TikTok** —
the network Aari posts on most is the one that cannot be benchmarked against
anyone.

- Accounts: `IGCO02,03,07,08,09,10,12` (screen name, display name, followers, posts, likes, engagement, reels)
- Posts: `IGCP01,04,05,07,08,09,10,11` (competitor, text, published, likes, comments, interactions, engagement, url)
- Facebook: `FBCO*` · YouTube: `YTCO*`

**As of 2026-09-10 zero competitors are configured on any brand or network.**
Verified empty across IGCO/IGCP/FBCO/YTCO over a 41-day window. If a
competitor pull returns no rows, the tracking list is empty — say so instead
of reporting a tool failure.

Competitor "engagement" is interactions per 1,000 **followers** (Metricool
cannot see a competitor's reach). Own-account ER in this skill is interactions
÷ **reach**. Never compare the two numbers directly.

`IGCP` has **no post-type field**, so video/image/carousel/text cannot be split
from competitor data. The only available split is `IGCO12` (reels) against
`IGCO08` (total posts).

## `getBestTimeToPostByNetwork`

Accepts only `twitter, facebook, instagram, linkedin, youtube, tiktok`.
Returns a day × hour grid of relative scores; higher is better. Scores are
network-relative — never compare a Facebook score to an Instagram score.

**`dayOfWeek` is 1 = Sunday through 7 = Saturday.** This is inferred, not
documented: LinkedIn scores collapse on days 1 and 7 and peak on 2–6, which
only makes sense with Sunday-first. Re-validate against a known weekday
pattern before trusting a calendar built on it.

Pass the brand's own timezone from `getBrandSettings` (Aari brands are
`America/New_York`).

## Data lag

Metricool trails live by 1–2 days. A "last 7 days" pull on aari.realty
routinely returns 6 days of rows. Count the distinct dates returned and state
the real window; comparing a 6-day window against a 7-day one overstates every
volume delta by roughly a day. Ratios (ER) are unaffected.

## Other quirks

- `getAnalyticsDataByMetrics` requires `from`/`to` (not `startDate`/`endDate`)
  in ISO 8601 **with** an offset or `Z`. Bare dates are rejected.
- Never mix connectors or networks in one `metrics` array.
- Story rows cap out around 96 per response. Treat a large story count as a
  floor, not a total; per-frame averages stay valid.
- Instagram `IGPO15` (saves) has returned 0 across every feed post while Reels
  saves report normally. Flag it as reported-zero and worth a dashboard
  spot-check rather than asserting true zero.
- A null metric on a day with no post means zero for summing purposes.
