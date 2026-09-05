# The Contracts screen, an honest accounting
Written 5 September 2026. Counts read from the live database the same day.
No client names or addresses appear here.

---

## One. Element by element against their screen

| Their element | Ours | Where |
| --- | --- | --- |
| Left rail, list of contracts | **Built** | `tx_module.html` around 960 |
| Rail shows file name and date | **Built** | same |
| Rail status mark, analysed or not | **Built** | same, drives off `raw_form_data.extracted_contract` |
| Rail delete control | **Deliberately not built** | refused in the spec, and it should stay refused |
| Centre pane, the PDF | **Built**, `ctrPdf()` on vendored pdf.js | `tx_module.html` around 1500, `vendor/pdfjs-3.11.174.min.js` |
| Zoom, percentage readout, page navigation | **Built**, `ctr-zoom`, `ctr-pos`, `ctr-prev`, `ctr-next` | same |
| Four tabs across the top | **Built**, the Hub's own `.subtabs` | `tx_module.html:1147` |
| Language toggle, English and Espanol | **Built and complete**, 25 of 25 flag ids translated | `CTR_ES` at `tx_module.html:754` |
| Summary tab, Contract Details | **Partial**, 7 fields shown of 35 extracted | `CTR_FIELDS` at `tx_module.html:823` |
| Parties | **Built**, buyer and seller | `CTR_PARTIES` at `tx_module.html:831` |
| Risk Flags as cards | **Built as a screen, empty on every file** | `ctrFlagCard`, and see below |
| Per flag paragraph of reasoning | **Partial**, authored text not generated | `flags.js`, each rule's `detail` |
| "Go to page N" on every flag | **Partial by design**, document level only | `tx_module.html:1421` |
| Track deadlines prompt and button | **Built** | `ctrTrackDeadlines`, `ctrSchedule` |
| Actions tab | **Built** | `ctrActionsHtml` |
| Clauses tab | **Not built, needs a model** | stub at `tx_module.html:1149` |
| Chat tab | **Not built, needs a model** | same stub |

### Being specific about the partials

**Risk Flags is the important one.** The screen is finished and correct. The
data behind it does not exist: **0 of 24 extracted files carry a stored flag
set.** No `flags` key and no `flags_at` key on any row. The pass has never been
run. Every file therefore renders the never evaluated empty state rather than
the clean state, which is the distinction that was built after the "no flags
reads as clean" correction, and it is currently doing its job on 100 percent of
the book.

**Contract Details shows 7 fields.** The extractor emits **35 distinct fields**
across the book. The screen deliberately mirrors their eight plus
`effective_date`. The other 28 are extracted, stored, and not on screen.

**The Actions tab works on 10 files out of 64.** It computes from
`effective_date`, and only **10 of 24** extracted files have one. The other 14
correctly return the single `deadlines_not_computable` stop. Nobody has used it
yet: **0 files carry `deadline_periods`**, so no coordinator has entered the
five numbers on any file.

**Track deadlines fills blanks, it does not create rows.** There are 698
`file_deadlines` rows across 31 files, **635 of them with no date**. The write
only fills an existing empty row and never inserts, so a file with no deadline
rows gets nothing from the button.

**Page links are document level only.** A flag about the compensation document
links to that sub document's first page. A field level flag such as
`price_missing` gets no link at all rather than a fabricated one. This is a
real difference from their screen and it was chosen.

---

## Two. What we have that they do not

Four claims, checked against code and data.

**"29 fields to their 8."** Understated. The extractor emits **35 distinct
fields**, counted across every stored extraction. Their Summary shows 8. The
gap is larger than claimed, though only 7 of ours are on screen.

**"We split packets into sub documents."** Confirmed and stronger than it
sounds. **22 of 24** extracted files carry a `documents` array, **12 are split
into more than one**, the largest into **7**. Five kinds are recognised:
Contract, Addendum, Rider, Compensation, Proof of Funds. Each sub document
carries a real start page and its own split PDF in storage. Their screen treats
an upload as one document.

**"Document level flags they have no equivalent for."** Confirmed. 25 rules in
`supabase/functions/extract-contract-fields/flags.js`: 14 risk, 5 document, 6
deadline. The document ones are the distinct class, `no_contract_attached`,
`contract_not_readable`, `zip_mismatch`, `certificate_of_occupancy`,
`compensation_agreement_referenced_not_attached`. They reason about the packet,
not the deal, and their product has nothing at that level.

**"We scan the whole book, they do one file at a time."** Confirmed.
`window.bflagsRun` in `broker_module.html:155` calls `realty-contract-flags`
with `{all:true}`, batched and resumable, reporting how many remain. Their
screen analyses the file in front of you.

**One more not on the list.** The Spanish toggle is a lookup over authored
strings, all 25 flag ids covered. Theirs re-renders a generated analysis, which
costs them a call every time it is pressed. Ours costs nothing and cannot drift
from the English.

---

## Three. What is genuinely missing

If a coordinator sat with both screens on the same contract, four things they
could do on theirs and cannot do on ours.

1. **Ask the document a question.** No Chat tab. This is the single largest
   gap and it is the one a coordinator would reach for first on an unfamiliar
   contract.
2. **Read a clause register.** No Clauses tab. Twenty clauses with severity and
   page, which is how their screen explains an unusual contract without the
   coordinator reading all twenty pages.
3. **Jump to the exact page a finding came from.** Ours anchors to the sub
   document, theirs to the page. `parseContract` joins pages before matching
   and discards provenance, so this is a parser change, not a UI one.
4. **Read reasoning written about this contract.** Our `detail` text is
   authored once per rule and is identical on every file it fires on. Theirs is
   generated per contract and names the specific dates and parties. Ours is more
   trustworthy and less useful in the same breath.

---

## Four. What the two model features cost

Measured, not guessed. The probe read four real FR/BAR AS IS packets:
71,131, 89,454, 88,560 and 82,870 characters over 13 to 18 pages. That is
**4,955 characters per page**, so a 20 page packet with addenda is about
**99,000 characters**, roughly **27,500 tokens**, call it **28,300 input**
with the instructions.

Output: a 20 clause register with severity, page and two sentences each is
about **2,500 output tokens**. One chat answer is about **400**.

Chat assumes prompt caching, so the contract is paid for in full once per
session and read back at a tenth for each following question. A session below
means one register plus ten questions.

| Model | Clause register, per contract | Chat question after the first | 30 contracts a month | 100 contracts a month |
| --- | --- | --- | --- | --- |
| Haiku 4.5 | **$0.04** | $0.005 | **$3.65** | **$12.17** |
| Sonnet class | **$0.12** | $0.015 | **$10.96** | **$36.52** |
| Opus class | **$0.61** | $0.073 | **$54.78** | **$182.61** |

Clause register alone, no chat at all:

| Model | 30 a month | 100 a month |
| --- | --- | --- |
| Haiku 4.5 | $1.22 | $4.08 |
| Sonnet class | $3.67 | $12.25 |
| Opus class | $18.37 | $61.25 |

Four things that make the real number lower than the table.

- It applies to files that have a readable contract, not to all 64. Today that
  is **31 with a pointer, 24 parsed**.
- A scan with no text layer costs nothing to send and returns nothing. One in
  ten of the packets probed was a scan.
- Only 3 of 10 packets probed were full FR/BAR contracts. A 5 page listing
  agreement is a quarter of the tokens.
- Caching means a coordinator working one contract all afternoon pays the big
  number once.

**These are list API prices and should be confirmed before committing.** The
token counts are measured from your own files and survive a price change.

---

## Five. The honest read

**You have something worth using, and it is one button press away from proving
it.**

The screen is real. The viewer, the rail, the tabs, the bilingual toggle and
the Actions tab are all built and working, and in three respects it is ahead of
the reference: more fields, packet splitting into sub documents, and a whole
book pass instead of one file at a time.

**What would embarrass you in front of Eileen is not the missing tabs. It is
the empty ones.** On a random file she opens today, the most likely outcome is
an empty state, and not because the screen is wrong:

- **0 of 24** files have flags stored, so Risk Flags, the centrepiece, is blank
  everywhere until the pass is run.
- **24 of 64** files have any extraction at all.
- **10 of 24** have the effective date the Actions tab needs.
- **0** files have the five periods entered, so no schedule has ever been
  computed.

Multiply those and the honest expectation for an arbitrary file is: it opens,
it shows the PDF, and most panels say the Hub does not know. That reads as a
half built screen even though the screen is not the problem.

**So the ranking is not what it looks like.** Running the flag pass is worth
more today than the Clauses tab, and it is free. Getting extraction onto the
other 7 files that have a readable contract is worth more than Chat. The two
model features are worth having and now cost a known ten to thirty seven
dollars a month, which is not the decision it felt like at midnight.

The one thing I would not ship without is the Chat tab, eventually. Not because
the screen looks thin without it, but because it is the only feature on their
side that changes what a coordinator can find out, rather than how quickly they
can see what we already extracted.
