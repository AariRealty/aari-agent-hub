# ICA v8 change summary

**Built 7 September 2026. Effective 8 September 2026. Published and current.**
v7 and v6 remain in the table, untouched apart from v7's `is_current` flag.

This repository is public. No agent is named in this document and no per agent billing
state is written into it. Those figures were reported to the broker directly.

---

## 1. What v8 is

**v8 is v7, plus a fee correction, plus the anniversary progression.** Nothing else.
It is not a return to any earlier version and it removes nothing that v7 carried.

Carried forward and confirmed by count against the rendered document:

| Carried forward | Confirmed |
|---|---|
| The 87 August amendments | Yes. 15 Aug 6, 16 Aug 18, 17 Aug 28, 18 Aug 11, 19 Aug 21, 20 Aug 3. Total 87 |
| The Exhibit A §38.1 Initial column | Yes. One `Initial` header cell, three blank rules, one per plan row |
| Exhibit A §41.2, the $199.00 annual E&O and Compliance Fee | Yes, untouched |
| The Version History block | Yes. Everything already in it is byte identical at 91,463 bytes; two new entries were added for v7 and v8, see section 9 |

---

## 2. The fee

**$99.00, quarterly, flat, on every plan.** Replacing three monthly rates of $59.00,
$79.00 and $99.00 that varied by plan.

The defined term changed with the amount. `Monthly Brokerage Fee` became
`Quarterly Brokerage Fee` everywhere the term is operative, because leaving the term
in place while changing its meaning would have left the agreement contradicting itself.

### The fifteen occurrences

The term appeared fifteen times. Twelve changed. Three did not.

| Anchor | Count | What changed |
|---|---|---|
| `s-68-1` | 5 | Due date, first period waiver, non refundable rule, termination cycle |
| `s-41-1` | 3 | Heading, table, prose beneath |
| `s-42` | 1 | Grace period sentence. The $25 late fee is unchanged |
| `s-41-2` | 2 | Cross references only. **The $199.00 is unchanged** |
| `s-38-2` | 1 | The prose that named all three monthly rates |
| `s-version-history` | 3 | **Not touched.** Historical record of past amendments |

The three that remain describe amendments made on 19 August 2026 to the fee language as
it then stood. Rewriting them would falsify the change record. They were excluded by
matching on the exact surrounding sentence rather than on the term, and the whole
Version History block was compared byte for byte afterwards to prove it did not move.

### What §41.1 says now

One row instead of three:

| Fee | Amount | Billing Schedule |
|---|---|---|
| Quarterly Brokerage Fee | $99.00 per quarter | Billed quarterly, beginning the quarter after onboarding; applies to all plans |

The phrase `Billed monthly, beginning the month after onboarding` appeared three times,
once per plan row. It appears nowhere now.

### One rule that had to be generalised

§68.1 carried a rollover rule for onboarding dates on the thirty first, so that a monthly
fee anchored to the thirty first still had a due date in a thirty day month. Quarterly
billing anchored to the onboarding day raises the same problem for the twenty ninth and
thirtieth as well, because a quarter can land in February.

The rule now reads: where the Associate's onboarding day of the month does not occur in a
month in which the fee falls due, the fee is due on the first day of the following month.
That produces the same outcome the old sentence produced for the thirty first and extends
it to the two days the monthly version never had to handle.

**This is the one place where the fee change forced a rule the previous version did not
need.** It is flagged rather than buried.

---

## 3. Plan naming

§38.1 called them `Growth` and `Max`. §41.1 called them `Aari Growth` and `Aari Max`.
Standardised on the full names, which are the brand names and what the plan cards say.

Three occurrences changed: the two §38.1 table rows, and the §38.3 Downgrade Rule
sentence. Everywhere else already used the full names.

**`planInfo()` did not need to change for the naming.** It lowercases its input and
matches on a substring, so `Aari Growth` matches the same pattern the short form did.
It did need to change for the fee, which is a separate matter and is in section 6 below.

---

## 4. The anniversary progression, new §38.4

The agreement now states the progression an Associate is agreeing to, which it previously
did not:

| Current plan | Next plan | When |
|---|---|---|
| A plan carried over from a prior agreement | Mentorship Path, 75% / 25% | First anniversary |
| Mentorship Path, 75% / 25% | Aari Growth, 85% / 15% | Next anniversary |
| Aari Growth, 85% / 15% | Aari Max, 100% | Next anniversary |
| Aari Max, 100% | No further step | Top of the progression |

**One step per anniversary. The step takes effect at signature, not at approval.**
An Associate already on Aari Max signs the then current version at their anniversary with
no change of plan and no change of split.

Two drafting decisions worth recording:

**The first row does not name a split.** The progression begins from splits that predate
this Agreement and are not offered plans. Those splits stay out of the document, so the
row describes the position rather than naming it. The section also states that a step
never moves an Associate to a lower Associate percentage, which is what stops the first
row reading as a downgrade for someone who started at Aari Growth.

**§38.4 does not assume simultaneous adoption.** A revision takes effect for an Associate
only when that Associate executes it. The section says so, and says that Associates
therefore hold different versions and different fee schedules at the same time, and that
this is the intended operation rather than an inconsistency.

**§38.4 is separate from §38.3.** §38.3 governs a plan change the Associate requests
between anniversaries. §38.4 states that an anniversary step is not a §38.3 request: it
does not require the qualifying transactions, does not use the Plan Change Activation
Date, and does not count against the frequency limit.

---

## 5. The stamp coordinates, measured

Measured from the final rendered v8 document at 150 dpi, not carried from v7.

The three blank initial rules on the Exhibit A §38.1 table sit at x 141.12 to 190.56, with
tops at 384.00, 445.44 and 490.56, on **page 32 of 110**.

| Key | Page | x | y |
|---|---|---|---|
| `75_25` | 32 | 150 | 410.50 |
| `85_15` | 32 | 150 | 349.06 |
| `100_max` | 32 | 150 | 303.94 |

**These are identical to v7's, and that is a measured result rather than a carried one.**
Every fee edit falls after §38.1 in document order, including the §38.2 prose on the same
page, so nothing reflowed the table above them.

The document is 110 pages where v7 was 109, because the Version History gained two entries.
That did not move the table either, and it was re-measured from the final file to prove it
rather than assumed: the Version History sits after page 32.

One test stamp per plan was generated from the final file and checked. Each initial lands
on its own rule and on no other row.

---

## 6. Two things outside the document that move with it

**`planInfo()` in `realty-sign-ica`.** It carried a per plan fee string, `$59.00/month`,
`$79.00/month`, `$99.00/month`, which it writes into the signature confirmation. Those are
now `$99.00/quarter` on all three. This has to go live at the same moment v8 becomes
current: deployed earlier it states a fee no signed agreement contains, left behind it
states the superseded one. **It is not deployed. `SUPABASE_ACCESS_TOKEN` is not set, so
CI fails on every push that touches a function.**

**`PLAN_INFO` and `QUARTERLY_FEE` in `realty-tx`.** The Hub dashboard already returns both
a per plan `monthly_fee` of 59, 79 or 99 and a flat `quarterly_fee` of $99 labelled
effective 1 August 2026. Two fee schedules are already being reported to agents side by
side. v8 resolves that in favour of the quarterly one, but **not for every agent at once**,
which is section 7. `realty-tx` has no source in this repository and was not changed.

---

## 7. Two fee schedules run in parallel until the roster is fully executed

This is the operational cost of the rule that an Associate hears from the brokerage on
their anniversary and on no other day. It is written down here because it will outlive the
conversation that produced it.

**First cost: a mixed roster is correct, not drift.** Between now and the point at which
every Associate has signed v8 at their own anniversary, some Associates are billed
quarterly under v8 and others are billed under the schedule in the version they actually
signed. Anyone reconciling the external billing system against `realty_agent_subscriptions`
will find rows that disagree with each other, and every one of those disagreements is
correct. The subscription table, not the billing system, holds the two schedules: each
row keeps its current `frequency` and `fee_amount` until the moment that Associate signs,
and the signing transaction moves `frequency` and `fee_amount` in the same write that
moves `commission_plan` and `agent_split`.

**Second cost: the fee constants have to become per agent state.** `PLAN_INFO` in
`realty-tx` is a module level constant, the same for every caller. So long as it is a
constant it will disagree with the agreement whichever value it holds, because during this
period there is no single right answer. It has to read the agent's own subscription row,
or it has to disappear and the dashboard read the fee from that row directly. Until then
the Hub will show at least some agents a fee their executed agreement does not contain.

---

## 8. Publication, and what is still open

**Published 7 September 2026, effective 8 September 2026.** v8 is `is_current`.

| Step | Result |
|---|---|
| Base PDF uploaded | `Aari-Realty-ICA-v8-2026-09-08.pdf`, 652,373 bytes, sha256 `f448b4bc…` returned by the write path and matching the rendered file |
| Row inserted | `is_current` false at insert, so nothing changed under anyone mid-write |
| `is_current` moved | Two scoped updates by id, each returning exactly **1** row changed |
| v6 and v7 | Untouched apart from v7's `is_current` flag |
| Audit trigger | Fired on all three writes, `actor_type` `system` |

The filename carries the date because the write path refuses to overwrite an existing
agreement version, answering 409 rather than letting a document somebody may have signed
change underneath them. A new version is a new key.

The transfer never passed through a transcription. The database fetched the PDF base64 from
the public repository itself, decoded and hashed it to confirm it was the rendered file
before anything was written, and posted it from there.

### Still open

- **`planInfo()` is corrected in the repository and not deployed.** The signature
  confirmation therefore still states a per plan monthly fee while the current agreement
  states a flat quarterly one. **It is not urgent: the next signature by anyone is
  30 September**, and it should reach production through CI rather than by hand, which is
  the whole point of `closing-the-deploy-hole.md`. Deploying it by hand to save three weeks
  would be repeating the behaviour that created the hole.
- **`realty_config.hub_io_secret` now exists.** It was unset, which fail-closed the publish
  path. The value was generated by a SQL expression inside the database and never read back,
  so it appears in no transcript, no report and no repository. **It must be replaced with a
  value the broker holds**, because CI publishing needs the same value in the `HUB_IO_SECRET`
  repository secret and nobody can set a value they do not know. One `update` to that row.
- **`realty-tx` still returns two fee schedules.** Section 7 below, and the proposed fix in
  section 11.
- **No agent has been contacted and nothing has been triggered.** v8 going current triggers
  nothing. Each Associate meets it at their own anniversary.
- One active Associate is on a billing frequency the flat rule would change. Reported to the
  broker, deliberately not changed, not batched with anything.


---

## 9. The Version History entries

The block stopped at 20 August, so it recorded neither v7 nor v8. Both entries were added in
one edit.

**v7:** the restored per plan Initial column on Exhibit A §38.1, the six columns the table
now carries, and the sentence stating the Associate initials one row and not the other two.

**v8:** the fee moving from three monthly rates to one flat quarterly fee, the defined term
changing with it, the twelve occurrences amended and the three left alone, the new §38.4
progression, the plan names standardised, and §41.2 amended only in its cross references.
It states explicitly that the §68.1 rollover rule was generalised rather than translated,
and why, because a generalised rule that arrives silently is what confuses whoever reads
this in two years.

**Everything already in the block is byte identical**, proved by removing the two inserted
entries from the new block and comparing the result to the old one: 91,463 bytes, equal.

One consequence worth stating so it does not read as a contradiction later: the term
`Monthly Brokerage Fee` now appears **four** times rather than three. All four are inside
this block. The fourth is in the v8 entry, which has to name the term it renamed.

## 10. The document as finally rendered

Re-rendered after the Version History entries were added, so the published file is the one
that contains them.

| | |
|---|---|
| File | `Aari-Realty-ICA-v8-2026-09-08.pdf` |
| Bytes | 652,373 |
| sha256 | `f448b4bcd3a2d7a7992bd95cf45e353904457e27e09d923d618076b8f9dd6542` |
| Pages | 110 |
| §38.1 table | page 32 |

The page count rose from 109 to 110 because the Version History grew. **The coordinates did
not move**, and that was re-measured from this final file rather than assumed: the Version
History sits after page 32, so it cannot displace the table. The three rules measure x
141.12 to 190.56 with tops at 384.00, 445.44 and 490.56, giving the same three stamp points
as before.

The three test stamps in `agreements/ica-v8-plan-initial-test-stamps.png` were regenerated
from this final file, not from the earlier render.

---

## 11. The `realty-tx` fee constants: the fix, proposed not built

**The defect.** `realty-tx` holds `PLAN_INFO`, a module level constant mapping each plan to
a monthly figure of 59, 79 or 99, beside `QUARTERLY_FEE`, a constant of $99 labelled
effective 1 August 2026. The `dashboard` action returns both to the agent, as `monthly_fee`
and `quarterly_fee`. Agents have therefore been shown two fee schedules side by side for
over a month.

**Why a constant cannot be repaired by changing the constant.** From today until the last
Associate signs v8 at their own anniversary, different Associates hold different agreements
with different fee schedules. A module level constant is the same for every caller, so
whichever value it holds it will be wrong for some of them. Changing 59, 79 and 99 to a flat
99 would only move which agents see a figure their executed agreement does not contain.

**What it should read instead.** The agent's own subscription row. `realty_agent_subscriptions`
already carries `fee_amount` and `frequency` per agent, and `realty-billing` already treats
that table as the place those two values live. The dashboard should read the row for the
signed-in agent and return one fee with its frequency, rather than two constants.

**Where the value should come from, and whether it can derive from the version signed.**
It can, and that is the better answer, but it is one step further than the fix above.
`realty_agreement_signatures` records which version each agent signed. A fee derived from
that is correct by construction and cannot drift, because the agreement and the figure come
from the same fact. Two things stand in the way today, both small:
`realty_agreement_versions` has no column stating the fee that version charges, and the
subscription row is what billing actually acts on, so a derived figure would have to agree
with it or there would be two answers again.

**So the recommended order is:**

1. **Now, small.** Remove the monthly figures from `PLAN_INFO` and remove `QUARTERLY_FEE`,
   and have `dashboard` return `fee_amount` and `frequency` from the agent's subscription
   row, with `fee_exempt` still suppressing it. One fee, per agent, from the table billing
   uses. This ends the two schedules on the dashboard immediately and stays correct
   throughout the mixed period.
2. **With the signing transaction.** When an Associate signs, the same transaction that
   moves `commission_plan` and `agent_split` also moves `frequency` and `fee_amount`. That
   is what keeps the subscription row true as each agent crosses over.
3. **Later, if it is worth it.** Put the fee on `realty_agreement_versions` and derive the
   subscription row from the version signed, so the agreement is the single source and the
   subscription row is its consequence rather than a parallel record.

**This is the same shape as the FEE_ROSTER problem, and step 3 is the one answer to both:**
the agreement each agent has actually signed is the fact, and every other copy should be
derived from it rather than maintained beside it.
