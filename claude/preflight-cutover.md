# Cutover pre flight

All three sections. The browser checks came back clean, so the feature
inventory is written from what each build actually reaches rather than from
what it is expected to.

Everything below was measured, not recalled. Times are UTC.

---

## 1. What a member who has not signed the current agreement sees on first load

### The state of the agreements right now

| | |
|---|---|
| Current version | **v6**, material, effective 2026-09-05, made current 00:51:48 today |
| Signatures on v6 | **0** |
| Signature rows in the whole table | **1**, from 27 July, on v5 |
| Active members | 7 |
| Active members unsigned on v6 | **7, all of them** |
| Active members with no commission plan | 0 |
| Active members with no licence number | 6 |

**Everyone is gated, on both builds, right now.** This is not caused by the
cutover. v6 became current at 00:51 this morning and v32 already injected the
gate into `hub_payload`, so it has been presenting all day. The first thing the
browser checks will meet is the signing overlay, not the Hub.

### The gate is not shell coupled, so it behaves the same on the new build

`ica_gate_js` is a self contained IIFE, 14,302 characters. It reads only
`window.SB_URL`, `window.SB_KEY` and `window.sb`, all three of which hub_next
defines. It appends its own `<style>` to `document.head` and its own overlay to
`document.body`, at `position:fixed; inset:0; z-index:2147483000`. It touches
none of the old shell's hooks: no `.content`, no `#sidebar`, no
`.topbar-right`. That is why it survives where `buildUi` and `brokerPanelInit`
had to stand down.

It guards on `window.__aariIcaGate`, so a double inject cannot double render.
It boots on `DOMContentLoaded`, or 300ms later if the document is already
parsed, then calls `realty-hub` with `action: 'agreement_status'` and renders
only when the answer is `required === true`.

### What renders

**Path A, no commission plan assigned.** A card that says the plan has not been
assigned, that the broker must set it before signing, and that the agreement
cannot be executed without it because the plan determines the split and the fee
schedule. The only control is Sign out. **Nobody is on this path today: all 7
active members have a plan.**

**Path B, the signing card.** This is what all 7 will see. Header is either
"Sign your Independent Contractor Agreement" or, for somebody who signed an
earlier version, "Your agreement has been updated" naming v6 and the version
they last signed. Then, in order:

1. The agreement itself, in an iframe from `joinaari.com/ica-preview.html?embed=1`
2. A "Scroll down to sign" button that jumps to the first field
3. Florida licence number, shown only when one is not on file. **6 of 7 see this**
4. Mobile number, always shown
5. Full legal name, typed
6. Initials
7. A drawn signature on a canvas
8. An ESIGN and Chapter 668 consent checkbox
9. Sign out, and Sign agreement

Submitting saves the licence number through `realty-hub` first when one is
needed, then posts to `realty-sign-ica`. Both are live: `realty-sign-ica`
answered its own 401 to an anonymous probe rather than a gateway 404, so the
signing path is intact. On success it says a copy has been emailed and reloads
after 1.8 seconds.

There is no dismiss. The only ways past it are to sign or to sign out.

### Three things to decide before agents are moved

**The gate fails open.** `boot()` ends in
`.catch(function(){ /* never block the hub on gate failure */ })`. If
`agreement_status` errors, or the session token cannot be read, no overlay
renders and the Hub loads with no agreement check at all. That is deliberate in
the script and defensible as a design choice, but it means an outage in the
edge function is also an outage in the compliance gate, and nothing records
that it happened.

**A member can sign without the document rendering.** The agreement text is an
iframe from `joinaari.com`, a third origin. If it fails to load, after five
seconds the box reads "If the agreement does not appear, refresh the page". The
Sign agreement button is not disabled by that. The validation checks the name,
the initials, the licence, the phone, that something was drawn, and the consent
box. It does not check that the agreement was displayed.

**Moving agents to the new build will produce seven signings in a day.** Not a
new build problem, but it will land at the same time and will look like one.

---

## 2. Rollback

Four tiers. Reach for the lowest one that covers the fault.

### Tier 0. Stop asking for the new build

**When:** the new build is wrong and the old build is fine.
**How:** `?hub=live` on hub.joinaari.com, which clears the sticky flag in
sessionStorage. The shell default is already `wantsNext = false`, so no agent
is on the new build unless they opted in.
**Time to restore:** the next page load. No deploy, no publish, nothing to revert.
**Reverses:** everything about the new build, for the person who does it.

### Tier 1. Put the old fragments back

**When:** a module is broken on both builds, which means `tx_module.html` or
`broker_module.html`.
**How:** `git revert` the merge commit on `main` and push. The fragment
publisher republishes only the files that changed in that push.
**Time to restore:** 13 seconds of workflow, measured on run 228 tonight,
plus the cache below.
**The backups also exist**, written by `hub-file-io` before it overwrote
anything, and they carry the exact pre merge byte counts:

| Backup object | Bytes |
|---|---|
| `hub_next.html.BACKUP-2026-09-05T18-47-11-086Z` | 1,006,756 |
| `tx_module.html.BACKUP-2026-09-05T18-47-12-056Z` | 102,033 |
| `broker_module.html.BACKUP-2026-09-05T18-47-12-685Z` | 97,703 |

Restoring from a backup is a `hub-file-io` GET then POST per file and does not
need a git operation. Use it only if git is unavailable, because a bucket that
leads or trails `main` is how the two drift.

### Tier 2. Put realty-hub back to v32

**When:** the shared path is broken, meaning the old build fails for agents.
**How:** in `supabase/functions/realty-hub/index.ts`, replace the composition
tail with the v32 early return: before `let html = await loadModule(...)`,
restore

```
if (new URL(req.url).searchParams.get('preview') === 'next' && member.role === 'broker') {
  const next = await loadModule('hub_next.html', modCtx)
  if (!next) return json({ error: 'preview_unavailable' }, 404)
  await audit(user.id, 'realty_member', 'realty_hub_preview', 'realty_members', user.id, { build: 'hub_next.html' }, req)
  return new Response(next, { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
```

then hardcode `hub_payload.html`, drop the `build` key from the audit details
and the `gate_empty` audit, and redeploy.
**Time to restore:** the deploy itself is seconds; v33 was serving on the first
probe after it returned.
**Note:** there is no stored copy of v32 anywhere. It was deployed before the
function was in the repository, and deploying v33 replaced it. The block above
is the whole difference, and it is the only rollback path.

### Tier 3. Netlify

**When:** `index.html`, `vendor/`, or anything served from the domain rather
than from the bucket.
**How:** `git revert` and push to `main`. Netlify rebuilds from `main`.
**Time to restore:** under a minute. Measured once tonight: the vendored engine
was a 404 at 18:47:00 and served at 18:47:16, against a merge at roughly
18:46:55.

### Restore is not instant for everyone

Two different caches, and they behave differently.

**The new build is served `no-store`.** Deliberate, because it is still moving.
A rollback that only affects the preview reaches the next load, with nothing to
wait for.

**The old build is served `private, max-age=300, must-revalidate`.** So an
agent who loaded the Hub inside the last five minutes keeps the document they
have until it expires. `must-revalidate` means the browser must check with the
server once it is stale rather than serving it stale, so the worst case is
bounded at **five minutes**, not indefinite. It is private, so no shared cache
holds it and no purge is available.

A hard refresh clears it for one person immediately. There is no way to clear
it for everybody at once, so plan any rollback on the assumption that the last
agent sees the restored build up to five minutes after the fix lands.

**Fragments are not cached at all.** `loadModule` downloads from the bucket on
every request, so a tier 1 restore is live the moment the workflow finishes,
subject only to the five minute document cache above.

---

## 3. Every feature an agent can reach on the old build, and whether it exists on the new one

Read from the two documents rather than remembered: the old build's twenty
sidebar items and the four panels `tx_module` adds at runtime, against the new
build's tab structure and the pages behind it.

**The single fact that shapes this whole table.** On `hub_next` both injected
modules stand down, because `buildUi` and `brokerPanelInit` build the old
shell's DOM and the new one has none of its hooks. So everything those two
modules contribute is absent on the new build, with exactly one exception: the
TC entry, which was wired explicitly through `window.__aariTcMount`. The new
build also never calls the `realty-hub` edge function at all, so every action
that goes through it is absent too.

### Agent facing

| Old build | New build | |
|---|---|---|
| Today | Today · My day | present |
| My Dashboard | Today · Overview | present |
| Pipeline | Deals · Pipeline | present |
| Database | People · Database | present |
| Pop bys | People · Pop bys | present |
| Goal Engine | Money · Goal Engine | present, but saving writes to the browser, not `realty_agent_goals` |
| Calendar | Toolbox · Calendar panel | present, moved inside Toolbox |
| Brand + Tools | Toolbox · vendors, logos, prompts | present, reorganised |
| Announcements | Reach · Announcements | **read only.** No acknowledgement: the new build never calls `acknowledge_announcement` |
| Transactions (list) | Deals · Transactions | present to look at; accept, send back and add save to the browser only |
| **New transaction** | none | **absent.** The form, the document upload and submit all go through `realty-hub` |
| **My production** | none | **absent** |
| **My Files** | none | **absent.** The old build iframes the Aari Transactions portal |
| **Team production** | none | **absent** |
| **Training Academy** | none for an agent | **absent.** The new build reads the training tables for the broker's Compliance view; an agent cannot open an item or mark it complete |
| **Start Here checklist** | none | **absent.** `onboarding_checklist` is read on the new build, never written |
| **Numbers** | none | absent |
| **Weekly Review** | none | absent |
| **Academy Levels** | none | absent |
| **Script Vault** | none | absent |
| **Docs and Compliance** | none for an agent | absent |
| **Updates + Contact** | none | absent |
| **Settings** | none | **absent.** No licence number entry, no password change |
| **Notification bell** | none | absent, with its unread poll |
| **Broker / Agent view toggle** | a Broker/Agent switch exists | present in shape only: on the new build `role` is a manual toggle, not the signed in identity |
| **Money and TC pills** | none | absent |
| — | Money · My plan | new |
| — | Reach · Classes | new, RSVPs live in the browser only |
| — | Toolbox · Everything | new, from `realty_toolbox` |

### Broker only

Every one of the ten screens `broker_module` adds is **absent** on the new
build: Transaction Review, Contract Flags, Onboarding, Announcements, Blog
Posts, Training Academy, Team Production, Email, Team Email, Control Panel.

The new build has its own broker pages, which are not the same thing and are
mostly views: Today (Overview, Needs you), Deals (Files, Review, Deadlines,
Listings, Compliance), People (Team, Roster, Recruits, Onboarding, Accounts,
Toolbox), Money (Overview, Costs, Production), Reach (Announcements, Team
Email, Newsletter, Blog, Classes). `pageCompliance` is marked in the source as
not wired yet, with its body removed at build time.

### The Transaction Coordinator section

| | |
|---|---|
| Contracts screen | **present**, through the TC tab, gated on broker or `is_tc` |
| Clause register | present, inside that screen |
| Deadline panel | present, read only, gated on `service_type` in `tc`, `tc_one_side` |
| Contract viewer, pdf.js | present, vendored |

This is the only part of either module that reaches the new build.

### What writes, on each build

The old build writes through `realty-hub` with the service role: announcements
read and acknowledged, training completions, the onboarding checklist, the
licence number, the password flag, transactions and their documents. Plus the
handoff.

The new build writes exactly two things, both directly under RLS:
`agent_contacts` and `agent_activity`. Everything else it shows, it shows.

### What this means for the cutover

Flipping `wantsNext` today moves every agent to a build where they cannot
submit a transaction, upload a document, open their files, mark training
complete, acknowledge an announcement, work the Start Here checklist, change
their password, or set a licence number. Six of those are compliance or
payment paths, not conveniences.

The gap is not styling and it is not the shell. It is that the two modules do
not run there, and the new build has no equivalent for most of what they do.
Closing it is a piece of work in its own right: either the modules learn the
new shell, or the new build grows the screens and the `realty-hub` calls behind
them.

**The recommendation is not to flip the default yet.** The new build is now
safe to look at, which it was not this morning: it composes correctly, both
modules load without a duplicate declaration, the agreement gate fires, the
sign in gate no longer flashes, the TC section works, and the borrowed class
names paint. That is enough for the broker to use `?hub=next` deliberately. It
is not enough to move seven agents onto it.
