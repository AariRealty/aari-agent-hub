# aarirealty.com — rebuild

Static rebuild of the Aari Realty public site, built on the **live design system of
aaritransactions.com** so all Aari properties render identically.

The system was read directly out of `AariRealty/aari-transactions-landing`
(`index.html`, `about.html`, `js/aari-marketing-header.js`, `js/aari-footer.js`) —
not from a spec — so the tokens, type, components and spacing match what is
actually deployed.

## Design system (do not deviate)

```
Fonts    Inter 400–800 (body, UI, h2/h3)  ·  Cormorant Garamond 500/600 (h1, hero
         subline, pull quotes, italic accents, footer contact row)
Tokens   --ink #0f0f0f  --ink-2 #262626  --muted #6b6b6b  --muted-2 #9a9a9a
         --bg/--surface #ffffff  --soft-bg #fafaf8  --line #e8e8e6  --line-2 #d4d4d2
         --pastel-sage #a4b8a6  --pastel-sage-soft #eef2ec
         --pastel-cream #f0e9da  --pastel-blush #f0e3dd
         --gold #967a4a (eyebrows)  --cream-2 #f5f0e8
Radii    --r-sm 10px (buttons, inputs)  --r-md 16px  --r-lg 22px (cards)  --r-xl 30px
Buttons  10px radius. NOT pills. Primary = solid black, inverts to white on hover.
Sections 90px vertical (60px mobile). White → #fafaf8 → white, with full-bleed
         BLACK sections (.dark) for the standard/trust blocks.
Body     15px, line-height 1.55, antialiased.
```

Everything lives in `css/aari.css`. Change a token there and it propagates.

Key components, all named the same as on the Transactions site: `.nav` /
`.brand .mark-wordmark`, `.hero` (centered), `.why-card` (icon circle + 22px card),
`.how-step` (icon circle + cream number badge), `.vs-grid` (cream "bad" column vs
black "Aari" column), `.dark` / `.dark-card`, `.founder-grid` (grayscale portrait),
`.al-*` (editorial poster used on About), `.faq-item`, `.cta-final`, `.aari-foot`.

## Pages

The old WordPress site was ~30 template pages — the buyer journey alone was spread
across thirteen near-empty ones. Consolidated:

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

**5. Team.** `about.html#team` has a commented-out agent card template. Never
publish an agent before their license is active and on file.

**6. Flat-fee price.** `sell.html` describes what flat-fee includes and excludes
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
