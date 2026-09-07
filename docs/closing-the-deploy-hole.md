# Closing the deploy hole

**Written 7 September 2026.** This repository is public. No credential value appears here.

The hole, stated once: **deploying an edge function to Supabase needs no merge and no
push.** Production moves, the repository does not, nothing fails and nothing warns. Every
symptom found this week is that one hole: `public-submit` with no source,
`realty-agent-welcome` with no source, the v7 Initial column never landing, the web signing
token caller left behind, and 161 deployed functions the repository cannot show you.

---

## 1. Where the numbers actually stand

| | Count |
|---|---|
| Deployed edge functions | 174 |
| With handler source in `main` before today | 9 |
| Landed today from stranded branches | 4 |
| **With handler source in `main` now** | **13** |
| **Without any source anywhere** | **161** |

Four functions landed: `realty-ica-notice`, `realty-clause-register`,
`realty-parcel-lookup`, `realty-heartbeat`. A fifth, `extract-contract-fields`, was not
landed and section 4 explains why.

---

## 2. Proposed shape: CI as the only path to a deployed function

Three parts. The first two are the rule, the third is the alarm. None of it can be built
until `SUPABASE_ACCESS_TOKEN` exists, because that is what the workflow authenticates with,
and today CI fails on every push that touches `supabase/functions/**` for exactly that
reason.

### 2.1 One path in

`.github/workflows/deploy-edge-functions.yml` already deploys `supabase/functions/**` on
push to `main`. Once its token exists it works, and the rule becomes: a function reaches
production by being merged to `main`, and by no other route.

That rule cannot be enforced by the platform. Supabase has no setting that says "refuse
deploys except from this token", and the account owner can always deploy from a laptop.
**So the rule is a convention, and the third part below is what makes breaking it visible
rather than silent.** Any proposal that claims to make the platform enforce it would be
claiming something Supabase does not offer.

### 2.2 A deploy whose source is not in `main` fails

The workflow should refuse rather than proceed when what it is about to deploy is not what
`main` holds:

- Deploy only functions that have an `index.ts` under `supabase/functions/<slug>/`.
- Refuse to run at all from a branch that is not `main`.
- After each deploy, read the function back and compare it to the file that was just
  deployed. A mismatch fails the job.

The third point matters more than it looks. It is the only step that closes the loop, and
it is the check that would have caught `extract-contract-fields` drifting eight hours after
its branch commit.

### 2.3 The drift alarm, which has never existed

A scheduled job, hourly or daily, that answers one question: **which deployed functions
have no source in `main`, and which have source that does not match what is deployed?**

The estate already has the right machine for this. `realty-heartbeat` runs hourly, calls
`record_job_health`, and `record_job_health` writes an alert row only on a state change, so
"once per incident, never per run" is a property of the schema rather than of whoever
remembered to check. A drift check belongs there as one more probe, named something like
`function-source-drift`, reporting:

- deployed count,
- count with source in `main`,
- count without,
- the names of any function whose deployed body differs from `main`.

It needs to read the repository, so it needs a read token for a public repository plus the
Supabase Management API to list and read functions. Both are reads. Nothing in the drift
check should ever deploy anything.

**Baseline problem, stated honestly.** On the day it is switched on, 161 functions have no
source, so the check fires immediately and stays red. That is accurate and it is useless as
an alarm. It should therefore be switched on with the current 161 recorded as a known
baseline, alarming only on the number going **up**, or on a function whose source exists
and no longer matches. As the 161 shrinks, the baseline shrinks with it.

---

## 3. What it would take to establish source for the other 161

**Scoped here, not started.**

### 3.1 The only route in, and its cost

`get_edge_function` returns a function's deployed source. There is no bulk export and no
deploy-from-path, so recovering the estate means 161 individual reads. That is the entire
mechanical cost and it is not small: the four functions verified today ran between four and
twenty five kilobytes each, so the estate is plausibly one to two megabytes of source.

Two things make it cheaper than it sounds:

- **It is a read, not a deploy.** Nothing in production changes. There is no rollback
  question, which is the risk that stopped `public-submit` being reproduced from memory.
- **It can be committed exactly.** A recovered file is the deployed bytes, not a
  transcription, provided it is written from the tool result rather than retyped.

### 3.2 Triage first, because a large fraction is dead

Recovering 161 functions is the wrong goal if a third of them are retired. Establishing
which are live is cheaper than recovering them and should come first.

**Four signals, cheapest first:**

1. **Name.** Ten are `temp-*` or `hub-inject-*`: `temp-hub-peek`, `temp-hub-write`,
   `temp-money-fix`, `temp-money-grep`, `temp-upload-pdf`, and the five `hub-inject-*`.
   These are scaffolding by their own naming and several were already found returning 410.
2. **Cron.** Only **6** cron jobs invoke an edge function at all. Any function reached only
   by a schedule and not named in `cron.job` is not being run by a schedule.
3. **Callers.** Grep the Hub documents, `tx_module.html`, `broker_module.html` and the
   other repositories for `functions/v1/<slug>`. A function nothing calls and no cron runs
   is a candidate for retirement rather than recovery.
4. **Invocation logs.** The definitive signal, and the expensive one: `query_logs` per
   function over a window long enough to be meaningful. Worth spending only on the
   functions the first three signals leave ambiguous.

**Expected shape of the answer.** Signals 1 to 3 are cheap enough to run across all 161 in
one pass and will likely sort them into three piles: obviously dead scaffolding, clearly
live and reachable from a caller or a cron, and a middle pile needing the log check. Only
the second and third piles justify a read each.

### 3.3 Order of work

1. Triage all 161 on signals 1 to 3. One pass, no reads of function bodies.
2. Report the three piles, with the dead pile named, for a decision on deleting rather than
   recovering them.
3. Recover the live pile, source only, no redeploy, committed in batches.
4. Switch on the drift alarm with whatever remains as the baseline.

**Nothing in this is urgent in the way an exposed credential is urgent, and all of it is
prerequisite to the estate ever being reviewable.**

---

## 4. `extract-contract-fields` was not landed, and why

`claude/extractor-null-byte` carries the only repository copy of this function. It was not
merged.

The branch's file is the code's own **v18**. The deployed function is **v19**, which adds
`mapContractForm` and writes `files.contract_type` from the extracted label, roughly sixty
lines the branch has no trace of. The branch was committed on 5 September at 07:49 and the
function was deployed again at 16:25 the same day, eight hours and thirty six minutes later.

Landing it would have put a stale copy into `main` under a name that says it is the source,
which is worse than the honest absence: the next person to read it would trust it. The
correct fix is to recover v19 from the deployed source and commit that, which belongs with
the section 3 work rather than with a merge.

`claude/hub-next-slots` was also not landed, for a different reason. It carries no deployed
function; its `hub_next.html` is a composed build artefact, and `main`'s copy has moved three
commits past the branch's, including a live sign-in gate fix and the TC section landing.
Merging it would mean reconciling an older composed document against a newer one, with real
regression risk to what agents see, in exchange for no recovered source at all.

---

## 5. What landed, and how each was verified

Verification was by content against the deployed source, not by ancestry and not by
assumption.

| Function | Deployed | Branch commit | Verdict |
|---|---|---|---|
| `realty-ica-notice` | 6 Sep 22:25, still version 1 | 6 Sep 22:27 | Match, except five comment lines the deploy carried and the branch did not. Added, so the repository copy is the deployed copy |
| `realty-parcel-lookup` | 5 Sep 09:33, still version 6 | 5 Sep 09:43 | Match, including Hendry as CO_NO 36 and the four probe parcel ids |
| `realty-heartbeat` | 5 Sep 15:33, still version 4 | 5 Sep 15:33 | Match, including the retry window as days rather than tries and the terminal 401/402/403 list |
| `realty-clause-register` | 5 Sep 15:41, still version 7 | 5 Sep 15:42 | Match, including the clauses-keyed-by-index coercion and the token limit guard |
| `extract-contract-fields` | 5 Sep 16:25, version 40 | 5 Sep 07:49 | **Drifted. Not merged** |

In four of the five the branch commit follows the deploy by seconds or minutes, and the
deployed version counter has not moved since, so the deployed code could not have moved on.

### The migrations, confirmed applied before landing

Checked by object rather than by migration name, so that a name recorded without its effect
would not pass:

| Migration | Applied as | Proof |
|---|---|---|
| `parcel_lookup_cache` | 20260905091142 | `realty_parcel_lookups` exists with `outcome`, `candidates` |
| `parcel_lookup_match_mode` | 20260905092650 | `realty_parcel_lookups.match_mode` exists |
| `parcel_lookup_candidates_truncated` | 20260905093000 | `realty_parcel_lookups.candidates_truncated` exists |
| `job_health_monitor` | 20260905095859 | `realty_job_health`, `realty_alerts`, `cron_health_scan`, `record_job_health` all exist |
| `clause_register` | 20260905145041 | `realty_clause_runs`, `realty_contract_clauses` exist |

Nobody will run any of these a second time.

**One gap in the other direction.** Four migrations are applied to the database that no
branch carries, because they were written after these branches:
`job_health_scan_single_pass`, `job_health_recovery_message`, `job_health_schedule` and
`alert_delivery_blocked`. The database has the changes; the repository is short the SQL
files. That is the same hole in its migration form and it belongs on the section 3 list.
