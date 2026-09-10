---
name: social-benchmark
description: Pull and report Aari social performance from Metricool across every connected network — Instagram, TikTok, Facebook, LinkedIn, Threads, Pinterest, YouTube, Google Business. Two modes: a weekly all-network scorecard with week-over-week deltas and flagged engagement drops, and a deeper Instagram tier benchmark against the 2026 Metricool Instagram Study. Use for a weekly social report, a cross-network roll-up, week-over-week comparison, best-time-to-post scheduling, an Instagram scorecard, or to diagnose why reach or engagement is flat.
---

# social-benchmark

Reports Aari social performance from the Metricool MCP. Output goes into chat as
tables unless asked for a file.

**Read `reference/metricool-fields.md` before any pull.** It holds every field
ID, the real tool names, the brand IDs, and the API quirks that will otherwise
cost a dozen wasted calls.

## Pick a mode

| Ask | Mode |
|-----|------|
| "weekly report", "how did we do this week", "all networks", "week over week", cross-network roll-up | **A — Weekly all-network** (below) |
| "benchmark Instagram", "how do we compare", "scorecard", "vs similar accounts" | **B — Instagram tier benchmark** → `reference/instagram-tier-benchmark.md` |
| "best time to post", "build me a calendar" | **C — Scheduling** (below) |

When the ask is ambiguous, run Mode A. It is faster and surfaces whether a
deeper Instagram dive is even warranted.

---

# Mode A — Weekly all-network report

## A1. Windows

Current = the last 7 days ending today. Prior = the 7 days before that.
Get today from `date +%F`. State both windows explicitly in the output.

Metricool lags 1–2 days. **Count the distinct dates each pull returns** and
report the real window ("6 days of data available"). Never present a 6-day
window against a 7-day one without saying so.

## A2. Brands and networks

`getBrandSettings`. A network is connected when its `networksData` key is
non-empty. Skip brands with an empty `networksData` — say they are empty
shells rather than silently dropping them.

## A3. Pull

**Cross-network layer** — `brandSummary` posts, both windows, per brand:
`["BSPO01","BSPO02","BSPO06","BSPO07","BSPO09"]`
Gives per-post network, timestamp, impressions, interactions, post type. Group
by `BSPO01` to get per-network post counts and totals in one call.

**Per-network layer** — `evolution` connector, both windows, for each network
with posts in either window. Field IDs per network are in
`reference/metricool-fields.md`. Pull followers, impressions, reach,
interactions, post count.

Run the two windows in parallel. Do not pull networks that had zero posts in
both windows — report them as dark instead.

## A4. Compute

Per brand × network:

- **Impressions**, **reach**, **followers** (latest non-null value in window)
- **Engagement rate** = interactions ÷ reach × 100
- **Δ%** = (current − prior) ÷ prior × 100, for each of the above

Facebook has no reach metric. Report its reach and ER as `n/a`, never 0.

Flag any network whose **ER fell more than 10%**. Flag separately any network
that posted in the prior window and zero in the current one — that is a
publishing stoppage, not an engagement problem.

## A5. Output

One table, Notion-pasteable:

`Brand | Network | Followers | Impressions | Reach | Eng. Rate | Prior ER | ER Δ | Flag`

Then a per-brand roll-up row across networks. Then a flagged-drops table
naming, for each flag, what actually changed (post count, interactions, reach)
rather than just restating the delta.

**Always check post volume before diagnosing engagement.** If output fell,
say so first — every downstream ER flag is a symptom of it, and recommending
engagement tactics on top of a publishing stoppage is the wrong advice.

Close with the data caveats that actually apply (lag, missing Facebook reach,
empty brands, story row caps).

---

# Mode C — Scheduling

`getBestTimeToPostByNetwork` per network. Accepts only `twitter, facebook,
instagram, linkedin, youtube, tiktok` — Threads, Pinterest and Google Business
have no best-time endpoint. Pass the brand's timezone from `getBrandSettings`.

**`dayOfWeek` is 1 = Sunday through 7 = Saturday** (inferred — see the field
reference). Scores are network-relative: never rank Facebook against Instagram
by raw score. Report each slot as a % of that network's own peak.

For a calendar, take each day's peak hour per network, then resolve collisions
by moving to that day's 2nd or 3rd slot — and say which slots you moved and
what the move cost in score. A network whose peak is a sharp singular spike
(LinkedIn at 11 AM) keeps its slot; a network with a flat plateau (Instagram
midday) is the one that yields.

Do not put a network on the calendar just because it was asked for. If a
network has negligible audience, say it does not earn a daily slot and propose
cross-posting instead.

---

## Aari context for every mode

- **X / Twitter is not connected.** A `twitter` call returns 403. Report it as
  not connected, not as a permissions problem to work around.
- **TikTok carries the most consistent volume** and cannot be benchmarked
  against competitors — Metricool does not support TikTok competitors.
- **aari.realty is consumer-facing; aari.transactions is agent-facing.** Do not
  recommend merging their content strategies without flagging the tradeoff.
- **LinkedIn is Marlenyi's personal profile** (`urn:li:person`), not a company
  page — treat it as broker-owner authority content, not brand marketing.
- Keep every suggested caption or CTA compliant: no fair housing risk, no
  implied guarantees, brokerage name where required.

## Never

- Never publish, schedule, or send anything to Metricool without explicit
  approval from Marlenyi.
- Never report a tool failure when a connector returns zero rows because
  nothing is configured (competitors, empty brands). Say what is unconfigured.
- Never dump `data/benchmarks.json` verbatim. It is licensed Metricool study
  data for internal comparison; point to the
  [2026 Metricool Instagram Study](https://metricool.com/instagram-study/).
- Never invent handles, follower counts, or metrics that a pull did not return.
