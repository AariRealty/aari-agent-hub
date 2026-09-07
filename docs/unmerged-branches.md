# Every unmerged branch, and what the pattern actually is

**Taken 7 September 2026 across all ten repositories.** This repository is public. No
credential, no agent name and no client data is written here.

---

## 1. The headline

**174 branches across the estate are unmerged by ancestry. That number is close to
meaningless, and the real finding is a much smaller number underneath it.**

Most unmerged branches are unmerged only because their pull request was squashed. A squash
merge writes a new commit that is not a descendant of the branch, so git reports the branch
as never merged forever afterwards, even though the work is in `main`. Testing by content
rather than by ancestry separates the two cases.

**Five branches carry live production code whose only copy is on the branch.** Those are
the finding.

---

## 2. Counts by repository

| Repository | Visibility | Branches | Unmerged by ancestry |
|---|---|---|---|
| Recruiting2 | public | 111 | 87 |
| aari-agent-hub | public | 85 | 78 |
| aari-transactions-landing | public | 12 | 9 |
| Cockpit | public | 1 | 0 |
| Transactions | public | 1 | 0 |
| Aari-Hub | public | 1 | not applicable, see below |
| Join-Aari- | public | 1 | not applicable, see below |
| aari-financial-hub | private | 2 | 0 |
| aari-realty-crm | private | 2 | 0 |
| aari-catherine-hub | private | 2 | 0 |

`Aari-Hub` and `Join-Aari-` have no `main` or `master` at all. Each holds exactly one
branch, which is also its default branch, so there is nothing to be unmerged from. They
were last written to in April 2026.

---

## 3. Why the big numbers are noise

Sampled from Recruiting2's eighty seven, the August single section ICA branches. Each was
checked by whether the text it introduced is present in `main` today, not by ancestry:

| Branch subject | Text it introduced | Present in `main` |
|---|---|---|
| §38.3 heading rename | `Plan Change Activation Date` | Yes, 4 occurrences |
| §62 rename | `Recruiting Reward Policy` | Yes, 3 occurrences |
| Exhibit A §40 scope | `Minimum Commission Allocation` | Yes, 2 occurrences |
| Exhibit A §40 hyphenation | `Referral-Sourced` | Yes, 22 occurrences |

The work landed. The branches did not. `main`'s own history shows squashed merges with pull
request numbers in the subject line, which is the mechanism.

**So "unmerged" is not the right question. "Is the work in `main`" is.**

---

## 4. The five branches that matter

Measured by taking each branch's added lines against its merge base and checking how many
of them exist in `main` today.

| Branch | Last commit | Added lines present in `main` | What is stranded |
|---|---|---|---|
| `claude/county-lookup` | 5 Sep | **0%** | `realty-parcel-lookup`, `realty-heartbeat`, four migrations, a test |
| `claude/clause-register` | 5 Sep | **0%** | `realty-clause-register`, a migration, a test |
| `claude/extractor-null-byte` | 5 Sep | **0%** | `extract-contract-fields` |
| `claude/ica-soft-gate` | 6 Sep | **0%** | `realty-ica-notice` |
| `claude/hub-next-slots` | 5 Sep | **5%** | `hub_next.html` slot work, two mockups, a build doc |

**All five of those edge functions are deployed and running in production right now.**
Checked against the live function list: `realty-parcel-lookup`, `realty-heartbeat`,
`realty-clause-register`, `extract-contract-fields` and `realty-ica-notice` are all
`ACTIVE`.

Two more branches are stranded but carry no deployed code:

| Branch | Last commit | What is stranded |
|---|---|---|
| `claude/preflight-cutover` | 6 Sep | A 409 line cutover document |
| `claude/aari-realty-redesign-s7snd9` | 2 Sep | 33 files of website redesign |

And several recent branches did land despite being unmerged by ancestry, which is the
control that makes the five above meaningful: `claude/deadline-engine` 98%,
`claude/roster-invite` 98%, `claude/payload-cdn` 100%, `claude/ica-gate-next` 85%.

---

## 5. So: coincidence or pattern

**It is a pattern, and it is bigger than the two branches that prompted the question.**

The two branches that prompted it, `claude/rotate-web-sign-token` and
`claude/ica-v7-plan-initials`, were both merged into Recruiting2's `main` on 7 September
2026. Both had carried work reported as done.

The shape underneath them is this: **an edge function can be deployed to Supabase straight
from a working tree, with no merge and no push required.** Deployment and merge are
independent, so a function goes live and its branch simply stops mattering to anyone
watching production. Nothing fails. Nothing warns.

That is the mechanism behind a fact recorded elsewhere in these notes: of 174 deployed edge
functions, only about eight have source in any repository. The five branches above are the
visible tip of it, the cases where a branch exists at all. For most deployed functions
there is no branch to find, because the source was never committed anywhere.

**The consequence is concrete.** A function that exists only in Supabase cannot be
reviewed, cannot be diffed, and cannot be restored if the deployment is lost or
overwritten. Every audit of those functions has had to read them back out of the platform
one at a time, and a change to one of them has to be reproduced by hand rather than
deployed from a file.

---

## 6. What would fix it, in order of cost

1. **Land the five branches.** Their functions are already live, so merging them is a pure
   gain: it puts a reviewable copy of running code into the repository and costs nothing in
   behaviour.
2. **Set `SUPABASE_ACCESS_TOKEN`.** CI currently fails on every push that touches
   `supabase/functions/**`, which removes the one automated signal that would have caught
   this. It is on the broker's list.
3. **Pull the remaining deployed functions into the repository**, source only, no
   redeploy. That converts an unauditable estate into an auditable one without changing a
   single running byte.
