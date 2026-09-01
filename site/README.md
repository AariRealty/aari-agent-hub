# aarirealty.com — rebuild

Static, dependency-free rebuild of the Aari Realty public site, built on the same
design system as **aaritransactions.com** and **aarireferrals.com** so all three
properties read as one brand.

No build step, no framework, no CMS. Eight HTML files, one stylesheet, one 30-line
script. Drop the folder on any host and it runs.

---

## What changed, and why

The old WordPress site was ~30 pages of template boilerplate. The buyer journey alone
was spread across thirteen near-empty pages ("Deciding to Buy," "Getting Started,"
"Know the Numbers," "Shop for a Loan"…). Nobody reads thirteen pages. Search engines
read them as thin content, and buyers bounce.

This rebuild consolidates all of it into **five pages that are actually worth reading**,
plus about, contact and legal:

| Old | New |
|---|---|
| 13 buyer-funnel pages | `buy.html` — one guide: two numbers, 8 steps, loan comparison, closing-cost table, FAQ |
| 5 seller pages incl. Flat Fee MLS | `sell.html` — valuation, pricing strategy, 6 steps, marketing plan, full-service vs flat-fee table, net sheet, FAQ |
| Help Me Relocate | `relocate.html` — area comparison table, what's different in Florida, remote-buying process, referring-agent section |
| About Us + About Marlenyi + Meet the Team + Project Management | `about.html` — story, broker bio, the Aari Standard, team, the four Aari operations |
| Join Us | `join.html` — pain, six support pillars, big-box comparison table, fit filter, application |
| Contact Us | `contact.html` |
| Privacy Policy | `privacy.html` — privacy + terms + accessibility + fair housing |

Every old URL is mapped in `_redirects` so nothing that is currently indexed or linked
will 404.

---

## Files

```
site/
├── index.html        Home
├── buy.html          Buyer guide
├── sell.html         Seller guide + flat-fee comparison
├── relocate.html     Relocation guide + referring-agent section
├── about.html        Company, broker, standard, team, group
├── join.html         Agent recruiting
├── contact.html      Contact
├── privacy.html      Privacy / terms / accessibility / fair housing
├── 404.html          Not found
├── robots.txt
├── sitemap.xml
├── _redirects        Old WordPress URL → new URL (Netlify / Cloudflare Pages)
└── assets/
    ├── site.css      The whole design system. Change a token, it changes everywhere.
    ├── site.js       Mobile nav + current-page highlight. That's all.
    ├── logo.png
    └── marlenyi.jpg
```

---

## Design system

Tokens live at the top of `assets/site.css` and match the Transactions and Referrals
sites exactly. Do not add colors, fonts or radii outside that block.

```
--black #0f0f0f   --white #ffffff   --off #f5f4f1
--mid   #6b6b6b   --lite  #9b9b9b   --border #e2e0d8
--r 20px (cards)  --r-sm 10px (inputs)  --r-pill 50px (buttons)
Cormorant Garamond → headings.  Montserrat → everything else.
Sections alternate white / --off.  Footer is black.
```

---

## Before it goes live

**1. Forms.** Every form posts to a Formspree placeholder. Create four forms and
replace the IDs:

| File | Placeholder | Purpose |
|---|---|---|
| `buy.html` | `FORMSPREE_ID_BUYER` | Buyer inquiries |
| `sell.html` | `FORMSPREE_ID_SELLER` | Valuation requests |
| `relocate.html` | `FORMSPREE_ID_RELOCATION` | Relocation inquiries |
| `join.html` | `FORMSPREE_ID_AGENT` | Agent applications |
| `contact.html` | `FORMSPREE_ID_CONTACT` | General contact |

```bash
grep -rn "FORMSPREE_ID" .   # find them all
```

**2. Contact details — verify these.** They were reconstructed from public listings,
not confirmed by you:

- Phone: `(239) 201-8950` (used for call, text and WhatsApp)
- Email: `hello@aarirealty.com`
- Office: 5471 Lee St, Unit 102, Lehigh Acres, FL 33971
- Hours: Mon–Fri 9:00–6:00

```bash
grep -rn "2392018950\|hello@aarirealty" .
```

**3. License numbers.** `privacy.html` has a `TODO` for the brokerage and broker
license numbers. Florida advertising rules expect the brokerage name on the site;
add the license numbers to the footer if you want them displayed there too.

**4. Legal review.** `privacy.html` is a solid plain-language draft covering privacy,
terms, accessibility and fair housing. It has **not** been reviewed by counsel. Have
Cristen review it against your actual data practices and CRM/lead vendors before launch.

**5. Team.** `about.html#team` has a commented-out agent card template. Add agents as
they come on — never publish one before their license is active and on file.

**6. Flat-fee pricing.** `sell.html` describes what flat-fee includes and excludes but
deliberately quotes no price, since the current number wasn't confirmed. Add it, or
leave it as "quoted in writing" — both are compliant.

**7. Analytics.** Nothing is installed. Add your tag before `</body>` in each file, or
add it to `site.js` if you want it in one place.

---

## Deploying

Any static host works. Netlify or Cloudflare Pages are the easy ones because both
read `_redirects` natively.

```bash
# Netlify CLI
netlify deploy --dir=site --prod
```

If you deploy somewhere that ignores `_redirects` (e.g. plain S3, GitHub Pages),
recreate the 30 redirects in that host's own config. Do not skip them — that is
the SEO equity of the existing site.

---

## Editing

It is plain HTML. Open the file, change the words, save.

- **Nav or footer change** → they're inline in all nine HTML files. Change one, then:
  `grep -l 'nav-right' *.html` to find the rest.
- **Any style change** → `assets/site.css` only. Never inline a color.
- **New page** → copy `contact.html`, strip the body, keep the head/nav/footer.

Compliance rules that are baked into the copy and should stay: commissions are
negotiable and not set by law; no guarantee of results or income; guides are general
information, not legal/tax/lending advice; equal housing opportunity on every page.
