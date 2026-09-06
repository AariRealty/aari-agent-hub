# Cutover pre flight

Two of three sections. The feature inventory, old build against new, is held
until the signed in browser checks come back.

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
