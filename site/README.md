# aarirealty.com — rebuild

Client-facing site for Aari Realty, built on **joinaari.com's** design system.

joinaari.com is the agent-recruiting site. This is the client-facing site. Same
brand, same system, different audience.

## How this is built

`css/aari.css` is copied **verbatim** from `AariRealty/Recruiting2`,
`joinaari/index.html`. Do not fork it — re-copy it when joinaari changes.
`css/aari-forms.css` is the only hand-written sheet: forms, guide prose, tables
and the agent chip, all built from that system's tokens.

```
Fonts   Cormorant Garamond (display, italics) + Montserrat (body, UI)
Tokens  --ink #141210  --black #0a0a0a  --off/--card #f5f4f1
        --mid #6b6b6b  --lite #9b948a  --border #e2e0d8  --green #2f6b46
Radii   --r 18px   --r-pill 50px  (buttons are pills)
```

The homepage reuses joinaari's sections in the same order: hero with the drifting
dot field and the offset aside card, the SVG wave dividers between every section,
the black trustbar with its scrolling marquee, the `team` face cluster, the
`founder` panel, the `testi` cards, the auto-advancing `how` tabs, `freebies`
panels, the FAQ accordion and the footer. `js/site.js` is ported from joinaari's
inline scripts so the motion matches.

## Pages
| Old | New |
|---|---|
| 13 buyer-funnel pages | `buy.html` — two numbers, 8 steps, loan table, closing-cost table, agent-vs-alone, FAQ |
| 5 seller pages + Flat Fee MLS | `sell.html` — valuation, pricing strategy, 6 steps, marketing plan, full-service vs flat-fee table, net sheet, FAQ |
| Help Me Relocate | `relocate.html` — area table, six Florida differences, remote-buying steps, referring-agent block |
| About Us + About Marlenyi + Meet the Team + Project Management | `about.html` — editorial poster letter, the Aari Standard, team, four brands |
| Join Us | `join.html` |
| Contact Us | `contact.html` |
| Privacy Policy | `privacy.html` — privacy + terms + accessibility + fair housing |

`_redirects` maps every old URL to its replacement, plus extensionless clean URLs.

```
site/
├── index.html buy.html sell.html relocate.html about.html join.html
├── contact.html privacy.html 404.html
├── robots.txt  sitemap.xml  _redirects
├── css/aari.css
└── images/aari-logo.png  marlenyi-portrait.jpg  marlenyi-square.jpg
```

## Before launch

**1. Form endpoints.** Five Formspree placeholders:

```bash
grep -rn "FORMSPREE_ID" .
```

| File | Placeholder |
|---|---|
| `buy.html` | `FORMSPREE_ID_BUYER` |
| `sell.html` | `FORMSPREE_ID_SELLER` |
| `relocate.html` | `FORMSPREE_ID_RELOCATION` |
| `join.html` | `FORMSPREE_ID_AGENT` |
| `contact.html` | `FORMSPREE_ID_CONTACT` |

**2. Confirm the contact details.** Phone `239.688.1770` was taken from the live
Aari Transactions footer. Email is `hello@aarirealty.com` — your other live
addresses are `marlenyi@`, `listing@`, `referrals@` and `broker@aarirealty.com`,
so change it if a different one should be public.

```bash
grep -rn "2396881770\|hello@aarirealty" .
```

**3. License numbers.** `privacy.html` carries a `TODO` for the brokerage and
broker license numbers.

**4. Legal review.** `privacy.html` is a solid plain-language draft. It is **not**
attorney-reviewed. Have Cristen review it before launch.

**5. Agent roster — verify every row.** The roster lives in one place:
`js/agents.js`. It drives the homepage face row, the modal, the `agents.html`
picker, and the agent pre-selected on the contact form. Seeded from the nine
headshots in the Transactions repo, minus Eileen Hernandez and Milennys Vargas
(transaction coordinators, not selling agents — deliberately not on a consumer
"choose your agent" list).

Before launch, confirm for each row: the person is currently affiliated, their
Florida license is active and on file, and the `fit` line is what *they* would
say about themselves. Only Marlenyi's `fit` and `bio` are written — every other
row has an empty `fit` with a `TODO`, because inventing a specialty for someone
is a false-advertising problem. Empty rows fall back to a neutral line, so the
page works today and gets better the moment you fill them in.

**6. Fees.** The word "flat" appears nowhere. The second service level is
"listing only" and every fee is described as negotiated and put in writing.
No figure appears anywhere on the site.

**6b. Old note on pricing.** `sell.html` describes what flat-fee includes and excludes
but quotes no number — add it or leave it as "quoted in writing."

**7. OG image.** Pages reference `/images/og-cover.jpg` (the convention used on
aaritransactions.com). Add a 1200×630 cover image at that path.

**8. Analytics.** Nothing installed. Add your tag before `</body>`.

## Deploying

```bash
netlify deploy --dir=site --prod
```

Netlify and Cloudflare Pages read `_redirects` natively. On a host that doesn't,
recreate those rules in its own config — that's the existing site's SEO equity.

## Editing

Plain HTML, no build step. Nav and footer are inline in all nine files; change one
and `grep -l 'nav-links' *.html` finds the rest. All styling goes in `css/aari.css`
— never inline a color.

Compliance language that must stay: commissions negotiable and not set by law; no
guarantee of results or income; guides are general information, not legal/tax/
lending advice; Equal Housing Opportunity in every footer.

## On pricing

**6. Fees.** The word "flat" appears nowhere. The second service level is
"listing only" and every fee is described as negotiated and put in writing.
No figure appears anywhere on the site.

**6b. Old note on pricing.** No price appears anywhere on the site. A brokerage can't post
a commission — it's negotiable by law — so the homepage cards carry what you commit
to (compensation agreed in writing, both service levels quoted before signing)
rather than a figure. Flat-fee MLS is the one number you *could* publish: if you
want it shown, it drops into `.pricev2-card-feeline` on the Seller Listing card in
`index.html`.
