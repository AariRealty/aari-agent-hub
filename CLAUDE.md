# Working with Marlenyi on the Aari Hub

## Always give three options

**Every design decision comes as three mockups, not one.** This is a standing
rule, not a per-request one. It applies to a whole page, a single card, a
re-arrangement, a piece of copy — anything with a look to it. Do not build one
version and ask whether it is right.

Two things that have gone wrong before and must not repeat:

- **The three have to be genuinely different.** If a section appears in all
  three, it must be designed three different ways. Three arrangements of the
  same card is not three options, and she will say so.
- **Say which one you would pick, and why, in measured terms.** She asks for a
  recommendation nearly every time. Give it without being asked, and give the
  honest cost of the one you are recommending.

## Do not redesign what is already approved

When she asks for something to be **added**, add it. Existing cards, layout and
styling stay exactly as they are. Build new cards out of patterns already on the
page rather than inventing new ones — the file has a deep set of them.

Approved and settled so far: the broker dashboard's Option A shape, the
Who-to-call card, the Needs-you ledger, the What-is-coming card, the numbered
route on Path to first close, and the section rail.

## Never invent data

Every figure on a card comes from the Aari database (Supabase project
`fnlrgmuvtgwzjsihqxcn`) or from a source she has provided, and the card says
where it came from. If the Hub does not hold something, the card says that
rather than showing a plausible number. Illustrative figures have caused real
confusion — she has read invented dates as real ones.

Check more than one table before concluding the Hub does not know something.
Agent join dates were declared uncomputable because `realty_members.start_date`
is null; they were in `realty_agent_subscriptions.notes` the whole time.

## A phone change is a phone change

When she asks for something to happen "on mobile", the desktop must come back
byte-identical — same card positions, same sizes, same spans, same words. Do
not take the opportunity to tidy the desktop at the same time.

The break is `max-width:720px`. At 721px and above nothing may move.

Prove it rather than asserting it: `mockups/test-desktop-untouched.js` builds
the pre-change source out of git and diffs both roles at 1440, 1280, 1100, 900,
760 and 721px. It must report zero desktop differences before the change is
pushed. This holds for every mobile-only request from here on, not just the one
that prompted it.

## Check the build she actually sees

The published artifact is not built by `mockups/build.js`. It is built in the
scratchpad from `mp.txt`, a 520x700 JPEG, while the repo build inlines
`assets/headshots/marlenyi.png` at 1060x1484. Different shape, so anything
sized against the photograph can look right locally and wrong on her phone.

That is exactly how a hard line across the cover survived being "fixed": the
picture was sized by width, so the shorter published copy ended partway down
the screen and its own top edge showed. In the taller local copy the edge fell
almost off the top and was invisible.

Prefer sizing that does not care about the source shape (`object-fit: cover`
over a width percentage). When something does depend on the image, screenshot
`scratchpad/artifact/aari-hub-v6.html`, not `mockups/dashboard-v6.html`.

The scratchpad build used to read its own copy of the source, `v6.src.html`,
rather than the repo's. The copies were byte-identical, so the split was
invisible until a change was made to the repo source, verified, published, and
simply was not there on the phone. `build6.js` now reads
`mockups/dashboard-v6.src.html` directly and mirrors it back to the old name.
There is one source. Do not reintroduce a second.

Better still, close the gap. The logo had the same split — `logo.png` carries an
opaque white ground, the published `logo.txt` is trimmed to the letters — which
would have inverted into a black block locally and looked fine published.
`assets/logo-mark.png` is now the trimmed copy, both builds read it through
`__AARI_MARK__`, and the two agree.

## Two systems, not one

The Hub and the public sites do not share a look, and using the wrong one has
cost three rounds. Anything an agent or client sees outside the Hub — a
letter to a database, a landing page, a document — follows the **site**:

- pure black `#000000`, white `#ffffff`, muted grey `#a0a0a0`,
  rules at `rgba(255,255,255,.12)`. Black and white only.
- **Cormorant Garamond** for headlines at weight 300, **Montserrat** for
  everything else. Not Playfair, not Poppins — those are the Hub's.
- buttons outlined white on black, `4px` radius, 12–13px, `letter-spacing:2px`,
  uppercase; hover inverts to filled white on black.
- eyebrow labels above each section: 10–11px, `letter-spacing:3px`, uppercase,
  in the muted grey. This is how the site divides its sections.
- the `A` watermark in Cormorant at `opacity:.04` behind hero and closing bands.
- CTAs come from a fixed list. For a consumer audience it is
  `LET'S CHAT` → `https://wa.me/12392018950`.

The spec lives in the `aari-landing-page` skill, and its
`references/recruiting-page-reference.md` describes joinaari.com section by
section. Read it before styling anything outward-facing. Do not try to fetch
joinaari.com from a session — the egress proxy answers 403 to the CONNECT for
that host, on both the bare and `www` names.

## House style

- No yellow or gold anywhere in the palette. One deliberate exception, agreed
  on 23 August 2026: the bar's three controls are the colour emoji she chose
  herself, and 🙋 is a yellow face. The exception covers those three glyphs and
  nothing else — no yellow enters the palette, the type or any card.
- Easy on the emoji. The exception is the bar: Ask, announcements and settings
  are 🙋 📧 ⚙️ as literal colour emoji, not the monochrome characters that
  resemble them. Building `&#9993;` when she asked for 📧 cost a whole round.
- FREC meeting dates are never derived from a "third Wednesday" rule.
- Do not put a model identifier in commits, PRs, code comments, or anything
  else pushed to the repository.
