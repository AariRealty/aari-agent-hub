# ICA v8 change summary

**Built 7 September 2026. Rendered with an effective date of 8 September 2026.**
Not published. Not current. v7 remains `is_current`.

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
| The Version History block | Yes, byte identical. 91,463 bytes before and after |

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

Measured from the rendered v8 document at 150 dpi, not carried from v7.

The three blank initial rules on the Exhibit A §38.1 table sit at x 141.12 to 190.56, with
tops at 384.00, 445.44 and 490.56, on **page 32 of 109**.

| Key | Page | x | y |
|---|---|---|---|
| `75_25` | 32 | 150 | 410.50 |
| `85_15` | 32 | 150 | 349.06 |
| `100_max` | 32 | 150 | 303.94 |

**These are identical to v7's, and that is a measured result rather than a carried one.**
Every fee edit falls after §38.1 in document order, including the §38.2 prose on the same
page, so nothing reflowed the table above them. The page count is unchanged at 109.

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

## 8. What has not been done

- **v8 is not published and not current.** v7 remains `is_current`.
- The rendered file carries an effective date of 8 September 2026. v7 is effective
  7 September 2026, so 8 September is the earliest date v8 can take without two versions
  sharing an effective date. **If it goes current on a later date the date has to be
  changed and the document re-rendered, and the coordinates re-measured from the new
  render rather than copied from this one.**
- **No agent has been contacted and nothing has been triggered.** v8 going current
  triggers nothing. Each Associate meets it at their own anniversary.
- One active Associate is on a billing frequency that the flat rule would change. It was
  reported to the broker and deliberately not changed, and it is not batched with anything.
- The Version History block carries no entry for v7 and none for v8. v7 was published the
  same way. Whether to add both together is the broker's call, and no entry was written
  without it.
