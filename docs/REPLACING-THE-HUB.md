# Replacing hub_payload with hub_next

Decision taken 5 September 2026: hub_next replaces hub_payload rather than
sitting beside it. This is what that costs, measured rather than estimated.

## The part that was already understood

`realty-hub` serves `hub_payload.html` and injects three things into it: the
transaction module, the broker module for brokers only, and the ICA gate. The
preview route returns `hub_next.html` early and deliberately, before any of
them, which is why a broker at the bare URL sees no broker side at all.

hub_next carried only `<!--ICA_GATE_SLOT-->`. It now carries all three, written
by `build/hub_next.js` and asserted by the build, and `build/test-gate-slot.js`
proves in a browser that a script at each of the three actually executes and
can read `window.SB_URL`.

## The part that was not, and it is the whole job

**A slot is somewhere to put a module. It is not the wiring.**

Both modules attach themselves through hub_payload's sidebar contract. hub_next
does not have that contract. Counted in the built files:

| What the modules attach to | hub_payload | hub_next |
|---|---|---|
| `.sidebar-item` | 59 | **0** |
| `data-panel` | 34 | **0** |
| `.sidebar-group-label` | 23 | **0** |
| `setPanel` defined | 1 | **0** |

hub_next routes on `HUBNAV`, a different model: groups of label, section and
index triples driven by 29 `page*()` functions and the section rail. There is
no overlap.

So injecting the modules into hub_next today would load about 200KB of script
that finds nothing to attach to. `goTo()` would miss, the nav entries would
never appear, and Contract Flags and the Contracts screen would be exactly as
unreachable as they are now, with the added cost that nothing would say so.
That is the "two engines nobody can reach" state the deadline spec warns about,
which is the state we have already been in once.

## The integration surface, in full

The good news is that it is small and countable. Everything the two modules
need from the host page:

- `.content`, the container they append their panels to
- `.sidebar-item`, and `.sidebar-item[data-panel="X"]` for 13 named panels
- `.sidebar-group-label`, to find the group to add to
- `setPanel(...)`, called 26 times, the router
- `ME`, the member object
- `hubInit`, once

Six things. Not thirty.

## Three ways to close it

**One. A nav bridge.** Give hub_next a compatibility layer that synthesises the
six above on top of HUBNAV, and inject both modules unchanged.
Cost: fastest by a wide margin, and nothing disappears the day the switch is
flipped. But the modules' panels were built against hub_payload's stylesheet
and would render inside the v6 design, so the broker side would work and look
like the old Hub bolted into the new one until each panel is restyled.

**Two. Port both screens natively.** Rewrite Contracts and Contract Flags as
`page*()` functions in hub_next's own idiom, keeping the logic and dropping the
old chrome.
Cost: correct at the end and one system rather than two, but it is roughly
200KB of module to work through, and until it lands the broker side stays
unreachable. It also blocks Part B, which sits on top of the Contracts screen.

**Three. Bridge first, port behind it.** Ship the bridge so the broker side is
reachable the moment the switch flips, then port screen by screen, Contracts
first because that is the live work, deleting bridge surface as each screen
stops needing it.
Cost: the bridge is throwaway code, and there is a window where the two designs
sit side by side on the same screen.

## Recommendation

Three, and the honest cost is that you will see the old Hub's styling inside
the new one for a while, on the broker and TC screens only.

The reason is the ordering risk, not the effort. Option two leaves the broker
side dark for the whole port, and the switch cannot be flipped until it is
done, so agents stay on the old Hub too. Option one alone leaves the throwaway
bridge in place permanently, because there is never a reason to come back for
it. Option three is the only one where the switch can be flipped early and the
look converges rather than being promised.

What it is not is a small change. The slots landed today. The bridge has not
been written and `realty-hub` has not been touched: it still serves
hub_payload on the main route and hub_next on the preview route, exactly as
before, so nothing about what anyone sees has changed yet.

## One thing found on the way

`hub_payload.html` in this repo contains only `<!--BROKER_SLOT-->`. It has no
`TX_SLOT` and no `ICA_GATE_SLOT`. Those two reach it through `inject()`'s
fallback, which appends before `</body>` when the slot is missing. It works,
and it is a silent dependency on a closing tag, which is the same fragility the
builder comment already calls out on the hub_next side.
