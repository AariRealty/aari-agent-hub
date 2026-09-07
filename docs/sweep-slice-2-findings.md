# SWEEP slice 2: the nine, worked through

**7 September 2026.** This repository is public. No credential value appears here, and no
four digit PIN either.

Status of each of the nine received findings, plus `realty-upload-base`, which was a
separate report request with a stop condition.

| # | Function | Status |
|---|---|---|
| 1a | `dev-hub-fetch` | Already disabled, before this pass |
| 1b | `quo-incoming-webhook` | **Reported, not changed.** Section 2 |
| 1c | `import-contract-from-email` | **Fix written, deliberately not deployed.** Section 3 |
| 1d | `create-listing-checkout` | **Reported, not changed.** Section 4 |
| 1e | `extract-contract-fields` | **Reported, not changed.** Section 5 |
| 1f | `resend-webhook` | **Reason established. It was never enabled.** Section 6 |
| 1g | `effective-date-confirm` | Not reached this pass. Section 10 |
| 1h | `skyslope-tm`, `realty-skyslope-sync` | **Fixed, deployed, verified by behaviour** |
| 1i | `realty-ledger` | **Reported, not changed.** Section 7 |
| 1j | Five unauthenticated senders | **Two blocked on their own cron. Section 8** |
| — | `realty-upload-base` | **Not reachable unauthenticated. No stop.** Section 9 |

---

## 1. What was actually fixed: 1h

`skyslope-tm` and `realty-skyslope-sync` were each gated by a hardcoded literal. Both now
read their gate from the environment with no default, compare it in length independent
time, and refuse everything with a 503 when it is unset.

Confirmed by behaviour rather than by the deploy reporting success: each was called and each
answered 503 with its own `not_configured` error. Neither has a caller in any repository and
neither is on a cron, so failing closed costs nothing today.

**Rotating the SkySlope Books token closes neither of these.** They authenticate to SkySlope
with four separate `SKYSLOPE_*` environment secrets and return real transaction data and real
commission breakdowns. They are a second and third route to the commission book and they need
their own rotation. That is worth saying plainly because the opposite assumption is reasonable.

They stay closed until `SKYSLOPE_TM_SYNC_TOKEN` and `SKYSLOPE_SYNC_SECRET` are set.

---

## 2. `quo-incoming-webhook`: what the vendor provides, before building anything

**Not changed.** The brief asked what Quo provides for signature verification before a fix is
built, and that question has a partial answer and a part that needs the vendor's own
documentation.

**Established here.** There is no signature check of any kind. The word does not appear in the
handler. `verify_jwt` is true, which the public anon key satisfies, so the gate is decorative
against anyone who has read the Hub's page source.

**Established about the vendor from this codebase.** Quo is OpenPhone: `realty-heartbeat`
sends through `api.openphone.com/v1/messages` with a plain `Authorization: <key>` header, not
a bearer token, which is OpenPhone's scheme.

**Not established, and it should not be guessed.** Whether OpenPhone signs its outbound
webhooks today, under which header, and with which algorithm, is a fact about their current
product. I could not reach their documentation from this environment, and inventing a scheme
would produce a verification that either rejects every real delivery or accepts every forged
one. **The next step is to read OpenPhone's webhook documentation, or to create a test webhook
in their dashboard and see whether it issues a signing key.**

**If it turns out they provide nothing**, the alternative is not a shared secret in the URL,
because webhook URLs end up in vendor dashboards, logs and screenshots. It is to treat the
webhook as untrusted intake: accept the delivery, write it to a queue table, and let a
separate authenticated job decide whether to act on it. That keeps the current behaviour of
never dropping a message while removing the part that matters, which is that **a forged
inbound message can currently change who is professionally responsible for a live closing.**
That is a supervision record, and it is the reason this one is ranked first.

---

## 3. `import-contract-from-email`: fix known, deliberately not deployed

The finding is confirmed. `SHARED_SECRET` is a literal in the deployed source, it was in a
public repository, and holding it lets anyone create a `files` intake record, upload a PDF to
`transaction-files` and attach a document to an existing client file. The comment in the
function says the same value is baked into a Gmail Apps Script.

**The fix is the `books-sync` shape and it is not the hard part.** The hard part is that the
only caller is that Apps Script, running in the aaritransactions Google Workspace. Deploying
an environment variable version today would stop contract email import for live client files
until two things happen that both need Marlenyi: the secret is set on the project, and the
Apps Script is updated with the same value.

**So this is left open on purpose and it is the one open item I am least comfortable with.**
The rule that produced the decision is her own: enumerate every caller and confirm each has
been updated before rotating anything. Here one caller cannot be updated today. Breaking a
live client intake path while she is away, to close a hole whose exposure is already historic,
is the worse of the two trades. It is first in the queue the moment she is back.

---

## 4. `create-listing-checkout`: what legitimately calls it

**Not changed.** The brief asked what calls it first, because it touches the intake funnel.

**One caller: `submit.html` in `aari-transactions-landing`**, the public listing submission
page. Nothing else in any repository references it and no cron invokes it.

That makes the finding worse rather than better. The legitimate caller is a public page, so
the base path was presumably left open because the submitter has no account yet. But the base
path takes a `file_id` from the caller and rewrites that file's `service_type` and
`mls_names`, which means **the anonymous path is not confined to files the anonymous caller
created.** An anonymous request naming an existing file's id edits that file and can open a
live Stripe Checkout Session against it.

**The fix is therefore not "authenticate the base path", which would break public submission.**
It is to stop the base path accepting a `file_id` at all: a public submitter creates a file, so
the identifier should be minted server side and returned, never accepted. Where an id must be
accepted, it should be a single use token issued with the file rather than the file's own id.
That keeps public submission working and removes the part that lets a stranger reach an
existing file.

---

## 5. `extract-contract-fields`: confirmed, and it is the drifted one

**Not changed.** The finding is confirmed: `verify_jwt` is true and there is no ownership or
role check on `file_id`, so any authenticated agent can overwrite extracted contract data on
any file in the company. The pattern to copy is `realty-tx-file-edit`.

This is also the function whose branch had drifted, so a fix has to start from the deployed
v19 rather than from `claude/extractor-null-byte`, which is v18 and missing about sixty lines.
Landing that branch was declined this morning for the same reason.

---

## 6. `resend-webhook`: why it was commented out

**Answered, and the answer changes the fix.**

It was never enabled. The commented block is labelled `OPTIONAL`, and the function it calls,
`verifySignature`, **is defined nowhere in the repository.** The only occurrence of that name
anywhere is inside the comment itself. This is scaffolding written when the file was authored
and never implemented, not a working check disabled for a reason that might still apply.

So there is no reason to preserve and nothing to restore. There is something to write.

**And uncommenting it as written would break the function.** The commented line calls
`await req.text()`, and four lines later the live code calls `await req.json()` on the same
request. A request body can be read once. Restoring the block verbatim would make every
delivery fail to parse. Whoever does this needs to read the body once, verify against the raw
string, and parse from that string.

The finding stands regardless: anyone can currently write to `email_log`, so the record of
what was delivered and what bounced is falsifiable. Resend signs with Svix, and the signing
secret is available in the Resend dashboard under the webhook endpoint.

---

## 7. `realty-ledger`: reported before changing, because a person types this

**Not changed**, and the brief was right that it needs reporting first.

**A human does type it.** `aari-financial-hub/index.html` has a full screen PIN gate with a
password input and an Enter button, shown before the dashboard renders. So replacing the PIN
with a real credential is a change to Marlenyi's own daily workflow, not just a code change.

**Two things worth knowing before deciding.**

The client side gate is cosmetic. The PIN it compares against is a literal in the page and the
result is stored in browser storage under a single key, so anyone who can load the page can
walk past it. That is not the finding, because the page is in a private repository, but it
means **the server side check inside `realty-ledger` is the only thing actually protecting
commission, cash position and debt.** Ten thousand combinations, compared without constant
time.

**The smallest change that keeps her workflow.** Keep a typed PIN as the thing she enters, but
stop it being the credential. The page already requires a platform login; the PIN should
unlock a session server side rather than be replayed as the gate on every request, and the
comparison should be length independent. That preserves "type four digits to see the money"
while removing "ten thousand guesses reads the money".

**What it should not become** is a longer PIN. Six digits is a million combinations and still
brute forceable in an afternoon against an endpoint with no rate limit. The problem is the
shape, not the length.

---

## 8. The five unauthenticated senders, and the cron problem underneath them

**Not changed this pass, and the reason is a finding in itself.**

`tc-invoice-reminder` and `tc-invoice-unpaid-reminder` are both on **active cron**. Gating them
without fixing their schedules would silence two live weekly jobs. Their schedules cannot send
a credential today:

| Job | Sends | Consequence |
|---|---|---|
| `tc-invoice-thursday` | the anon key as `apikey`, no `Authorization` at all | Would fail the moment a real check exists |
| `tc-invoice-unpaid-reminder-weekly` | `Bearer ` plus `current_setting('app.settings.service_role_key', true)` | **That setting is NULL.** It has been sending an empty bearer token every Friday and only works because the function has no auth |

**The second row is the one to notice.** A schedule that looks authenticated in its own source
has been sending nothing for as long as it has existed, and nothing revealed that, because the
function it calls never checked.

`ics-sync-hourly` shows the pattern that works on this project: it reads the service role key
from `vault.decrypted_secrets` at fire time. Both invoice jobs should be rewritten that way,
and the fix has to be one change: **the function check and the two cron commands, together.**
Doing the functions first breaks two live weekly jobs; doing the crons first changes nothing.

`tc-invoice-reminder` is also worse than the sweep line suggests. A `to` field in the body
sends the weekly status email to any address the caller names, so it is not only "anyone can
trigger the batch", it is "anyone can aim it".

`tc-paid-notify` and `super-processor` have no source in any repository. `generate-listing-
description` sends nothing and only spends Anthropic budget, so it is last of the five.

---

## 9. `realty-upload-base`: not reachable unauthenticated, so nothing stopped

**The stop condition did not trigger.** It requires an `x-aari-cron` header matching
`realty_config.digest_cron_secret`, and if that row were missing the comparison would fail and
return 401, so it fails closed.

**What it is, though, is the widest bucket authority in the estate behind the narrowest
credential.** The caller supplies both the bucket and the path, and a `delete` field removes
any object from any bucket. So whoever holds `digest_cron_secret` can read, overwrite or
delete anything in `signed-agreements`, `transaction-files` or `signatures`, and that secret
is an ordinary cron secret shared with routine scheduled jobs. Authority that wide should not
sit behind a credential handed to that many callers.

**Nothing calls it.** No reference in any of the six repositories checked, and no cron job
invokes it. It was deployed in early July and has not been deployed since. An invocation log
query would have settled whether it has ever been used, and the logs backend returned an error
on that query, so that one is unconfirmed.

**The smallest change that scopes it** is to stop taking the bucket from the caller: an
explicit allowlist, defaulting to one bucket, rejecting anything else. **The better change,
given it has no callers, is to retire it** the way the `temp-*` family was retired. That
removes a delete-anything capability rather than narrowing it, and nothing is depending on it.

---

## 10. What was not reached

`effective-date-confirm` (1g). Not touched this pass. It is the one that **can email real
agents from an unauthenticated call**, through `preview_deadlines`, so it ranks above
everything left in section 8 and it is the first thing to pick up next.
