# Aari industry news watch

A scheduled Routine that checks the industry sources Marlenyi cares about once a
day and sends a push + email digest of anything new worth passing to Aari agents.

- **Runs:** 07:00 America/New_York, every day
- **Delivers:** phone push + email to marlenyi@aarirealty.com
- **Dedup ledger:** `state.json` on the `aari/news-watch` branch

## What it watches

| # | Source | What counts as news |
|---|--------|---------------------|
| 1 | [NAR annual report](https://www.nar.realtor/about-nar/2025-nar-annual-report) | A report newer than the 2025 edition appears |
| 2 | [Florida Realtors Law & Ethics](https://www.floridarealtors.org/law-ethics) | New articles under `/news-media/news-articles/YYYY/MM/` |
| 3 | [Florida Realtors Legal News](https://www.floridarealtors.org/law-ethics/florida-realtors-legal-news) | Contract/forms changes, legal alerts |
| 4 | FREC / DBPR + NAR policy | Rule changes, license law updates, Code of Ethics and settlement-related practice changes |

## Baseline at setup (15 Aug 2026)

The NAR annual report cadence is: the report for year N publishes in **January of
year N+1**. The 2025 report was released 20 Jan 2026, so the **2026 report is
expected around January 2027**. Anything labelled 2026 or later is news.

Articles already known at setup, so they are not reported as new:

- `2026/08/spotting-legal-risks-they-escalate`
- `2026/07/crsp-contract-flying-under-radar`
- `2026/06/legal-summit-puts-risk-readiness-focus`
- `2026/03/closer-look-code-ethics-hearings`
- `2026/02/closer-look-frec-discipline`
- `2026/04/spanish-contract-translations-released`

## Known constraint: these domains are egress-blocked

`nar.realtor` and `floridarealtors.org` are **blocked by the Claude Code network
egress policy** for this environment, so `WebFetch` on them fails with
`EGRESS_BLOCKED`. The watch therefore runs on **WebSearch**, which reaches both
sites through a different path and returns headlines, URLs and dates — but not
full article bodies.

Practical effect: the digest gives you headline, link, date and a gist. It cannot
quote an article at length or summarise a page you haven't opened.

**To lift this**, an admin can add both domains to the environment's network
allowlist in the Claude Code environment settings — see
https://code.claude.com/docs/en/claude-code-on-the-web. Once allowed, the daily
run can read full articles and the digests get materially better. Nothing else
about the setup needs to change.

## Changing it

The Routine is managed through the Claude Code Routines API. Ask Claude to
"change my news watch to 8am" or "stop the daily news watch" and it will update
or delete the trigger. To change *what* it watches, the Routine's prompt is the
single source of truth — it is standalone by design, because each run starts in a
fresh session with no memory of previous runs beyond `state.json`.

## Daylight saving

The schedule is stored as a UTC cron expression (`0 11 * * *` = 07:00 EDT). Cron
does not follow DST, so when Florida falls back to EST in early November the run
drifts to **06:00 ET** until it is moved to `0 12 * * *`. Same again in March.
