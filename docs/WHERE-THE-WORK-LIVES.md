# Which Hub is which, and what is in each

**7 September 2026.** Written because the honest answer to "is this in the old Hub or the
new one" was not written down anywhere, and guessing at it wasted a morning.

This repository is public. No person is named here and no billing or signature state
appears.

---

## 1. There are two Hubs. The URL decides.

| You type | You get | Who |
|---|---|---|
| `hub.joinaari.com` | **`hub_payload`**, the working Hub | Everyone |
| `hub.joinaari.com/?hub=next` | **`hub_next`**, the new build | Broker only |
| `hub.joinaari.com/?hub=live` | back to `hub_payload` | Everyone |

The opt-in sticks for the browser session, so moving around inside the preview does not
drop you back.

**Everything built for the brokerage up to now is in `hub_payload`.** The new build is a
separate document that was started fresh, not a restyle of the old one, so work does not
move between them by itself. Anything added to one has to be added to the other.

---

## 2. The working Hub: 34 screens

`hub_payload` is assembled from three files at request time. `realty-hub` downloads all
three and injects two of them into the first.

| Piece | Screens | What is in it |
|---|---|---|
| `hub_payload.html` | 14 of its own | Today, Database, Pipeline, Pop bys, Calendar, Numbers, Goal Engine, Academy, Scripts, Docs and Compliance, Brand and Tools, Updates and Contact, Review, Settings |
| `broker_module.html` | 10 | Control Panel, Announcements, Blog, Team Email, Broker Email, **Contract Flags**, Onboarding, Production, Training, **Transaction Queue** |
| `tx_module.html` | 4 | **TC Portal**, **Contract Guide**, Financial Hub, Onboarding |

Plus six shared between them: Home, Start Here, TC Files, Transactions list, Transaction
Announcements, Transaction Training.

**This is where the compliance work, the Contracts screen, the flag pass, the transaction
queue and the TC portal live.** None of it exists in the new build.

---

## 3. The new build: half of it is a placeholder

`hub_next` is a phone-shaped rebuild with its own navigation. It is not missing screens
because nobody got to them; **fifteen of its page functions have their bodies deleted by
the build script** and replaced with a card that says "Not connected yet". The list of
which ones is checked into `build/hub_next.soon.json`.

### What an agent would get

| Screen | State |
|---|---|
| Today, My day | Built |
| Deals, Pipeline | Built, 7 September |
| Deals, **Transactions** | **Not built, and blocked.** See below |
| People, Database | Built |
| People, Pop bys | Built, 7 September |
| Toolbox | Built |
| Money, Goal Engine | Built, 7 September |
| Money, My plan | Built |
| Reach, Announcements | Built |
| Reach, Classes | Built |

**One of ten**, down from four on 7 September.

The one left is not waiting on somebody getting to it. Transactions is a review
inbox for a weekly SkySlope import: each file waits on the agent to accept it,
send it back with a correction, or say it is not theirs. `realty_transactions`
has no column for that answer and there is no import queue table, so nothing on
that screen could be saved. It needs a schema decision before it needs code. The
agent's own files are on Pipeline, which reads them from the database.

### What the broker would get

| Screen | State |
|---|---|
| Today, Overview | **Empty, no page at all** |
| Today, **Needs you** | **Placeholder** |
| Deals, **Files** | **Placeholder** |
| Deals, **Review** | **Placeholder** |
| Deals, **Deadlines** | **Placeholder** |
| Deals, Listings | Built |
| Deals, **Compliance** | **Placeholder** |
| People: Team, Roster, Recruits, Onboarding, Toolbox | Built |
| People, **Accounts** | **Placeholder** |
| Money, **Overview** | **Placeholder** |
| Money: Costs, Production | Built |
| Reach: Announcements, Team Email, Newsletter, Blog, Classes | Built |

**Eight of twenty one.**

---

## 4. The part that matters more than the missing screens

**The new build reads. It does not write.**

| | Saves to the database |
|---|---|
| `hub_payload` | **61** |
| `hub_next` | **5**, up from 3 on 7 September |

Its own footnotes say so, in its own words: "Accept, send back and add all save to this
browser only", "Saving here writes to this browser, not to the table", "RSVPs are live in
the browser only". Nineteen notes of that kind. The working Hub has none.

So a person could spend a day in the new Hub, log conversations, accept files and save a
goal, and none of it would be there tomorrow. **That is why it is a preview and not the
default**, and it is a bigger obstacle than the missing screens, because a missing screen
announces itself and a lost save does not.

---

## 5. What it would take to make the new build the only Hub

Three pieces of work, in the order that makes each one useful:

1. **Connect the placeholder pages.** Three of the four an agent hits were done on
   7 September: Pipeline, Pop bys and the Goal Engine. Eleven remain, all of them on the
   broker's side, plus Transactions, which needs a schema decision first.
2. **Wire the writes.** Five to something near sixty one. Until this is done, most of
   what anyone does in the new Hub does not survive a refresh.
3. **The navigation bridge**, so the broker and transaction modules attach at all. The
   detail is in `REPLACING-THE-HUB.md`. It is last on purpose: there is no point routing
   to screens that cannot save.

**Only the third was previously written down**, which is why the job looked smaller than
it is.

---

## 6. How to check any of this yourself

- Which Hub am I on? The working Hub has the coloured pill bar across the top, MONEY, TC,
  BROKER, AGENT. The new build does not.
- Is a screen real or a placeholder? A placeholder says "Not connected yet" on the page.
- Which screens are placeholders? `build/hub_next.soon.json`, fifteen entries by name.
  Three of them carry a fourth field reading `wired`: their frozen markup still comes out
  at build time, because it held real addresses and figures, but a data layer file
  replaces the function afterwards, so the placeholder never draws.
