# Instagram tier benchmark (Mode B)

Compares one Instagram account against the 2026 Metricool Instagram Study.
Field IDs and API quirks live in `reference/metricool-fields.md` — read that first.

## Step 1 — Date range

Default window: **last 30 days**. Honor any window the user names ("last 60 days",
"April only", "this quarter"), parsed against `date +%F`. State the window at the
top of the output.

## Step 2 — Pick a brand

Call `getBrandSettings`. Instagram brands are those with a non-empty
`networksData.instagramData`.

Known Aari brands:

| Brand | ID | Instagram |
|-------|-----|-----------|
| aari.realty | 6748479 | @aari.realty |
| aari.transactions | 6752039 | @aari.transactions |

Always re-read `getBrandSettings` rather than trusting these IDs — brands get added.

- One Instagram brand → use it.
- Multiple → ask: one, some, or all. If multiple, run the full analysis per brand
  and close with a combined scorecard (one row per brand).

**Tier mapping:**

| Tier   | Followers          |
|--------|--------------------|
| tiny   | < 2,000            |
| small  | 2,000 – 9,999      |
| medium | 10,000 – 99,999    |
| big    | 100,000 – 999,999  |
| huge   | 1,000,000+         |

Follower count is not in brand settings. Pull it from the evolution connector
(`metrics: ["IGEV01"]`, one-day window is enough). If that fails, ask.

## Step 3 — Pull analytics

`getAnalyticsDataByMetrics`, network `instagram`, for the selected window.

Parameters are `from` and `to` (not `startDate`/`endDate`), formatted
`YYYY-MM-DDTHH:MM:SSZ` — the `Z` is required, bare dates are rejected.
Example: `from: "2026-08-01T00:00:00Z"`, `to: "2026-08-31T23:59:59Z"`.

Pull all four formats in parallel:

**Reels** — connector `reels` — `["IGRE01","IGRE07","IGRE09","IGRE10","IGRE11","IGRE12","IGRE21","IGRE23","IGRE24"]`
→ Date, Comments, Interactions, Likes, Reach, Saved, Shares, Views, AvgWatchTime

**Posts** — connector `posts` — `["IGPO01","IGPO07","IGPO08","IGPO12","IGPO13","IGPO14","IGPO15","IGPO27","IGPO28"]`
→ Date, Type, Comments, Interactions, Likes, Reach, Saved, Shares, Views
Split by `Type`: `FEED_CAROUSEL_ALBUM` → carousels, `FEED_IMAGE` → single-image.

**Stories** — connector `stories` — `["IGST01","IGST08","IGST09","IGST10","IGST11","IGST12","IGST13"]`
→ Date, Exits, Impressions, Reach, Replies, TapsBack, TapsForward
Drop rows where reach = 0 (incomplete or very recent frames).

If a format has 0 posts, note it — do not abort. If a metric ID errors, call
`getAnalyticsAvailableMetrics` for that connector and substitute the suggested
replacement rather than dropping the metric silently.

## Step 4 — Calculate

Per format: post count, posts/week (`count / (window_days / 7)`), and per-metric
averages (`sum ÷ count`, skipping nulls).

- Reels: avg_interactions, avg_reach, avg_views, avg_watch_time
  (API returns seconds — multiply ×1000 for the `avg_watch_time_ms` benchmark)
- Carousels / images: avg_interactions, avg_reach, avg_saved, avg_shares
- Stories: avg_reach, avg_replies, freq_weekly

**Engagement rate** (Reels, carousels, images — not Stories):
`(avg_interactions / avg_reach) × 100`, one decimal. Compare against
`engagement_reach_pct` for the matching format + tier.

## Step 5 — Outlier detection

For each format with ≥ 3 posts:

1. Find the top 2 posts by interactions (reach for Stories).
2. Recompute the average without them.
3. If dropping the top post moves the interactions average by > 30%, flag it:
   *"Your average is carried by one post."*
4. Note the top post's date (and URL if available).
5. Hypothesize why it worked, only where the data supports it:
   high watch time → strong hook · high saves → reference/educational ·
   high shares → relatable or opinionated · high comments → question in caption ·
   high reach + low engagement → distribution landed, CTA did not.
   If the data does not say, say "hard to tell without seeing the content."

## Step 6 — Score

Read `benchmarks.json`; use `reels[tier]`, `carousels[tier]`, `images[tier]`,
`stories[tier]`.

`delta_pct = (user - benchmark) / benchmark × 100`

- 🟢 **above** — delta ≥ +10%
- 🔵 **on track** — −10% to +10%
- 🔴 **below** — delta ≤ −10%

Overall format status = the interactions delta. In delta columns use ▲ positive,
▼ negative, → on-track.

## Step 7 — Output

---

**Instagram Benchmark · @{handle} · {Tier} account ({followers} followers)**
*{window_start} → {window_end} · vs. accounts in the same tier, 2026 Metricool Instagram Study*

---

**🎬 REELS** — {status} — {count} reels

| Metric | You | Benchmark | Delta |
|--------|-----|-----------|-------|
| Avg Reach | | | |
| Avg Interactions | | | |
| Engagement Rate | | | |
| Avg Watch Time | | | |
| Avg Shares | | | |

*{One-sentence takeaway — the most actionable thing the numbers say.}*

{If outlier}: ⚠️ *Top reel ({date}) carried these numbers. Without it, avg reach is ~{X}.*
{If supported}: 💡 *Why it likely worked: {hypothesis}*

---

Repeat the same block for **🖼 CAROUSELS**, **📷 SINGLE-IMAGE POSTS**
(reach, interactions, ER, saves, shares) and **📖 STORIES** (reach, replies).

---

**Your top priorities**

Three numbered items, biggest gap first. Each: short headline, 1–2 sentences with
real numbers, and one matching link from `resources.json`.

---

**Next actions**

Exactly three, all executable from here or from Metricool:

- Two drawn from the biggest red deltas (see the table below).
- One universal finding from the study that applies.

---

**Status key:** 🟢 above (+10%+) · 🔵 on track (±10%) · 🔴 below (−10%+)
*Benchmarks: [2026 Metricool Instagram Study](https://metricool.com/instagram-study/) · 24.3M posts · 375K accounts*

---

### Priority logic

Pick in order of largest gap:

| Condition | Action |
|-----------|--------|
| Reels = 0 in window | "No Reels in {N} days. {Tier} accounts average {bm_reach} reach per Reel — the highest-reach format you are not using." |
| Reels count below benchmark freq by >30% | "You posted {count} Reels vs. a benchmark of ~{bm_freq × window_weeks}. Watch time is {status} — the gap is frequency, not quality." |
| Reels watch time 🔴 | "Avg watch time {user}s vs. {bm}s for {tier}. Tighter hooks in the first 2–3 seconds drive retention and re-serving." |
| Carousels = 0 | "No carousels in {N} days. In your tier carousels average {X}× the saves of single-image posts and get re-served for days." |
| Carousels saves 🔴 | "Carousels average {user} saves vs. {bm}. A 'save this' line on the last slide is the highest-leverage fix — no redesign." |
| Images posted more often than carousels | "You post {img_freq}/week single images vs. {car_freq}/week carousels. In your tier carousels get {X}× the saves. Flip the ratio." |
| Stories replies 🔴 | "Stories get {user} replies/frame vs. {bm}. End 2 Stories a week with a direct question ('reply below ↓')." |
| Stories freq below benchmark by >30% | "{user} Stories/week vs. {bm} for {tier}. Stories replies are up 88% platform-wide in 2026 — the most direct community channel." |
| Nothing red | Name the strength, then propose the next experiment — do not manufacture a problem. |

Universal findings to close with (pick the one that fits):

- Best posting time: 7–9 PM, any day.
- Questions in captions → +37% comments.
- Save CTAs → 2× saves; comment CTAs → 3× comments.
- Hashtags: 1–2 max. Posts with hashtags get 31% fewer views.

Executable follow-ups worth offering, when they match a red metric:

- Reels reach or interactions 🔴 → offer `getBestTimeToPostByNetwork` for real peak hours.
- Any format 🔴 → offer to pull a competitor account's data for comparison.
- Frequency 🔴 → offer to schedule the next post via `createScheduledPost`.
  **Never publish or schedule to Metricool without explicit approval from Marlenyi.**

### Multi-account scorecard

When more than one brand is analyzed, close with:

| Account | Tier | Reels | Carousels | Images | Stories | Best format |
|---------|------|-------|-----------|--------|---------|-------------|

One sentence per account naming its biggest opportunity.

## Real estate context

These accounts are brokerage accounts, not lifestyle accounts. When writing
takeaways and priorities:

- Tie recommendations to Aari content that already exists — listings, price
  improvements, open houses, just-solds, agent recruiting, buyer education.
- Keep every suggested caption or CTA compliant: no fair housing risk, no implied
  guarantees, no unlicensed advice. Brokerage name where required.
- Recruiting content and consumer content are different audiences. Do not
  recommend blending them into one feed strategy without saying so.

## Error handling

| Error | Action |
|-------|--------|
| No Metricool MCP tools | Say the MCP is not connected in this session; do not fake numbers. |
| Brand has no Instagram | Say so, offer the other brands. |
| 0 posts for a format | "No {format} published in the last {N} days" in that section. |
| Follower count missing | Ask directly. |
| `data/benchmarks.json` missing | Re-copy it from the Metricool template package. |
