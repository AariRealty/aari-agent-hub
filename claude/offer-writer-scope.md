# Guided offer writing: scope before code

Written 5 September 2026. Nothing built. Every reachability and schema claim
below was tested today, not assumed.

## The one design decision everything else follows from

**The model conducts the interview. Code owns every value.**

The model is allowed to decide what to ask next and how to word it. It is never
allowed to produce a value that lands in a contract field. Every answer is
parsed, validated and resolved by code, and the model is handed back the
resolved value to echo.

That single boundary kills four of the seven failures outright:

- **Failure 1, the date.** The model never writes a date. Code is handed today
  from a clock, resolves "Sep 30" against it, and returns an ISO date. A date
  the model emits is not accepted at all, so it cannot be wrong by a year.
- **Failure 2, validation.** Ranges are code, not judgement. Closing after
  effective, closing in the future, periods fitting inside the window.
- **Failure 3, the carried answer.** State lives in code, keyed by field. A
  rejected answer never enters state, so it cannot reappear attached to a
  different fact.
- **Failure 6, the form code.** Codes and revisions are read from the register
  and injected into the reply. The model is given the strings, never asked for
  them.

Failures 4, 5 and 7 are interface and content decisions, handled below.

## What this touches

**New table, `realty_forms`.** The register does not exist today. No table in
the schema holds a FAR/BAR form. It carries: form code, revision, effective
date, the storage path of the blank PDF, and the field map from our field ids
to the PDF's own field names. Form sequences per task live here too.

**New table or reuse, for the drafts.** The answers in progress. See the
collision section: this must NOT be written into `extracted_contract`.

**New edge function, `realty-offer-writer`.** Holds the API key, the interview
state machine, the validators and the clock. The browser never calls a model.

**New edge function, `realty-parcel-lookup`.** County lookups, one per county,
behind one interface.

**Existing table, `file_agent_actions`.** Next steps become rows here. It
already exists with exactly the right shape, `file_id, action_type, label,
detail, due_date, status, resolved_at, resolved_by`, and it holds zero rows
today. No new table needed for failure 7.

**Existing column, `files.deadline_periods`.** The five period numbers the
interview collects are the same five the Actions tab already reads. They go
there. No second store.

**New screen in `tx_module.html`,** or its own module. Not part of the
Contracts screen. See collisions.

## What this does not touch

`extract-contract-fields`. `flags.js`. The Contracts screen's Summary, Parties,
Risk Flags and Actions tabs. The rail, the PDF viewer, the tab bar.
`hub_payload.html`. `realty_transactions`. `realty-hub`. The shell. The domain.
The Clauses and Chat stubs.

## Where the form register lives, and the blocker under it

`realty_forms`, new. Populated by hand, not by a model, and never guessed.

**The blocker: we do not hold a single blank FAR/BAR form.** Storage has twelve
buckets and nothing that looks like one. Filling a form requires the blank, and
FAR/BAR forms are copyright Florida Realtors and The Florida Bar, licensed to
members. Before any of this is worth building:

1. Confirm the licence permits programmatic filling and storing the blank in
   our own system.
2. Confirm the blanks we obtain carry real AcroForm fields. If they arrive
   flattened, filling means drawing text at coordinates per revision, which is
   a different and much larger job.

**And a drift risk that is exactly the rule you have been enforcing.** A blank
form in our bucket is a copy of a document Florida Realtors maintains and
revises. The competitor's own failure was labelling ASIS-5 while filling
ASIS-7x Rev. 2/26. The register must carry the revision, and there must be a
deliberate process for noticing a new one. A stale blank is a compliance
problem, not a cosmetic one.

## How the county lookups work, and what happens when one is down

Tested today from inside Supabase's network, which is the path production would
use. This session's own proxy blocks general internet, so none of this is
testable from the build container.

| County | Host | Result |
| --- | --- | --- |
| Lee | www.leepa.org | **200**, reachable |
| Charlotte | www.ccappraiser.com | **200**, reachable |
| Collier | www.collierappraiser.com | **200**, reachable |
| Hendry | hendryprop.com | **403, Cloudflare challenge** |

`pa.collier.gov` does not resolve. The working Collier host is
`collierappraiser.com`.

**Hendry is behind a bot challenge** and returns "Just a moment..." to a
server. A User-Agent header did not help. Server to server access is blocked
unless they publish an API. Hendry is therefore out of scope as an automatic
lookup until that is solved, and the honest behaviour is to say so on screen.

**When a lookup fails, the field stays blank and the screen says which county
was unreachable and when.** Your rule: an empty field is a correct answer. No
retry loop that hides a persistent outage, and never a guessed parcel.

**Everything from public records is labelled and editable.** Source, county and
fetched-at travel with the value. Owner of record populates a suggested seller
name and raises a mismatch note when the agent types something different. It
never overwrites what a human typed.

## Where this collides with what you have approved

**One real collision, and it needs a hard boundary.**

The Contracts screen reads `raw_form_data.extracted_contract.fields`, which
means "what we read out of a document somebody signed". Offer writing produces
the same field names travelling the other way: what we are about to propose.

**Offer drafts must never be written into `extracted_contract`.** If they are,
the Contracts screen will show a draft the buyer has not signed as though it
were an executed term, and the flag engine will evaluate a proposal as a deal.
A separate key, and the screen shows drafts as drafts.

**Two near misses that are not collisions if handled deliberately:**

- The five period numbers exist already in `files.deadline_periods`. Write
  there. A second copy would drift.
- Personal property, Paragraph 1(d), and free text into Paragraph 20 both feed
  the same contract the extractor later reads back. That is fine, they are
  different directions through the same document, as long as the draft and the
  executed version are never the same record.

**No collision with:** risk flags, which stay authored, free and deterministic.
Clause severity, which stays separate from risk flags. The Actions tab, which
keeps computing from Effective Date and refusing without one, which is the same
rule this feature must follow.

## The interface decisions, failures 4, 5 and 7

**Closed sets are buttons.** Yes/No. Cash, Conventional, FHA, VA. Buyer,
Seller, Both. Where the contract has a default, the chip is pre-filled and
labelled as the default so an agent sees what they are deviating from:
inspection 15, loan approval 30, additional deposit 10, title evidence 15. Open
text stays open for names, addresses and amounts, and every one is validated.

**Personal property leads with washer and dryer**, because they are the items
agents assume convey and they are not in the printed Paragraph 1(d) list.

**Next steps are rows in `file_agent_actions`**, with a status, visible on the
file, surviving the conversation. Not a chat message that scrolls away.

## Cost

Roughly **15 cents per completed offer** at Sonnet class, on a 20 question
interview with the register and system prompt cached: about 7 cents of input
with cache reads, about 6 cents of output, plus the final field sheet. Thirty
offers a month is about **$4.50**.

That is a real number in the same shape as the Clauses estimate, and it should
be checked against a metered first run rather than trusted.

## What I need from you before code

1. **The blank forms.** Which forms, obtained how, and confirmation the licence
   permits storing and filling them. Nothing works without this.
2. **Whether the blanks have real form fields.** If you can send one blank
   ASIS PDF I can answer this in ten minutes.
3. **The API key**, still outstanding from Clauses. Edge function secret.
4. **Who can use it.** The Contracts screen is broker and TC only. Agents write
   offers, so I assume agents too, which is a wider audience than anything on
   that screen today. Say if that is wrong.
5. **Hendry.** Accept "not available in Hendry" for now, or hold the feature
   until all four counties work.

## What I would do first

Build the county lookup and nothing else. It is the differentiator, it needs no
API key, no blank forms and no model, and it is independently useful: it fills
Paragraph 1(b) and 1(c) on files you already have. It also proves the hardest
external dependency before a line of interview code exists.
