# Credential exposure. Read this before anything else in this repository.

## `AariRealty/aari-agent-hub` is a PUBLIC GitHub repository

Confirmed 7 September 2026. Six other AariRealty repositories are also public:
`Recruiting2`, `aari-transactions-landing`, `Cockpit`, `Aari-Hub`, `Join-Aari-`,
`Transactions`. Three are private: `aari-financial-hub`, `aari-realty-crm`,
`aari-catherine-hub`.

The question "who has ever had read access to these repositories" therefore has an answer,
and it is not a list of people. It is everyone. The current collaborator list on
`aari-agent-hub` shows one entry, `AariRealty` with admin, and no outside collaborators,
but on a public repository that list is irrelevant to read access.

## What has been public, and for how long

**The SkySlope Books token.** In `hub_payload.html`, in 571 commits, across more than 120
branch tips including remotes, from `eb1cb6f` on 30 July 2026 until `481f554` on
7 September 2026. Thirty nine days in a public repository, findable by GitHub code search.
It returns every SkySlope Books deal for the company with gross commission, company net and
per agent payout.

**Eleven further credentials, put there by me, on 7 September 2026.** Commit `8a89886`
added `docs/security-sweep-verify-jwt.md`, which quoted in full the literal secrets found
during the edge function sweep. `481f554` extended it. Both were pushed to this public
repository. They were redacted in the commit that added this file. Redaction does not
remove them from history.

That was my error. The sweep notes existed to make the findings reproducible, and quoting
the values was neither necessary for that nor consistent with the instruction I had been
given not to quote secrets. It turned a set of credentials that were exposed only inside
deployed edge function source into credentials that were exposed publicly.

## Everything on this list must be rotated

Ordered by what it opens.

| Credential | Where it lives | What it opens |
|---|---|---|
| SkySlope Books sync token | was a literal in `books-sync` and in `hub_payload.html`; now environment only | The whole company commission book |
| `realty-agent-provision` token | literal in that function and in `realty-agent-join` | Creates an active brokerage member |
| `realty-agent-provision` manual key | literal in the same function | Bypasses the Mentorship Path block |
| `realty-broadcast` token | literal in that function | Email anything to any address list as the broker |
| `realty-broadcast` unsubscribe secret | literal in that function | Forge anyone's unsubscribe link |
| `dev-hub-fetch` secret | literal in that function | Read any object in any bucket |
| Hub injector UUID | literal in three functions and in the `realty-drip-daily` cron row | Add or remove script in every agent's Hub |
| `import-contract-from-email` secret | literal in that function and a Google Apps Script | Create files, attach documents, archive files |
| `email-flag` secret | literal in that function and an Apps Script | Insert flag rows against any file |
| `hub-diag3` and `hub-repair-body` phrase | literal in both | Read `hub_payload.html` structure |
| `admin-resend-domains` token | literal, accepted in the query string | List Resend sending domains |

`realty_config.digest_cron_secret`, `broadcast_token`, `contract_probe_secret`,
`daily_digest_cron_secret`, `gcal_share_secret` and `parcel_probe_secret` were never in this
repository. They live in a table only service_role can read. They are not on this list, but
`digest_cron_secret` is shared by many functions and has no rotation path, which is its own
problem.

## What redaction does and does not do

It stops the next person browsing the repository from reading them. It does nothing about
clones, forks, the GitHub API, code search indexes, or anyone who already looked. The only
remedy that works is issuing new values and revoking the old ones.

Rewriting git history would remove them from this repository's future clones. It would not
remove them from existing clones or from anything that already indexed the repository, and
it rewrites 571 commits across 120 branches. It is not a substitute for rotation. Consider
it only after every value above has been rotated, and only if the broker wants it.

## The prior question

Whether making these repositories private is the right move is a decision for the broker.
Making them private now reduces future exposure and changes nothing about what has already
been read.
