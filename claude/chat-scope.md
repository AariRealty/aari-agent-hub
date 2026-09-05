# Chat, scoped before it is written

5 September 2026. Phase 3. Not built yet.

---

## The thing that changes the design

The Actions tab already holds the answer to your acceptance question, in both
languages, authored:

> Without an effective date, deadlines cannot be calculated. Every deadline in
> this contract runs from the effective date. Until the last party signs and
> delivers, there is no schedule.

That string is `deadlines_not_computable` in `CTR_T`, and it already has an
English and a Spanish version.

So when someone asks "when is the inspection deadline" on a contract with no
effective date, **the model should never be asked**. Code checks the
precondition, code answers, and the answer is the one the Actions tab already
gives. Same words, same rule, no cost, no chance of invention.

That is the same rule you set for the offer writer: the model conducts the
interview, code owns every value. Here it is the model explains, code answers
anything that is a computed value.

It also means the acceptance criterion is met by construction rather than by
hoping the model behaves.

---

## What Chat touches

**Adds:** `realty-contract-chat` edge function, `realty_chat_turns` (question,
answer, citations, tokens, cost), and a Chat panel in `tx_module.html`.

**Reads:** the contract PDF pages, `raw_form_data.extracted_contract`,
`realty_contract_clauses`, `deadline_periods`, and the risk flags once the pass
has run.

**Does not touch:** `files`, `realty_transactions`, the clause register, the
flag pass, the extractor, or any contract value. Chat answers. It never writes
a value anyone acts on.

---

## Page citations, verified rather than trusted

Every factual answer names the page it came from. The model returns the answer
plus one or more `{page, quote}` citations, and **code checks each quote is
actually on that page before the citation is shown**, exactly as the register
does.

This is not theoretical caution. On the register, **8 of 92 clause pages came
back wrong** and were corrected against the text. An uncorrected citation is a
page jump that lands somewhere plausible and wrong, which is worse than no
citation at all.

What happens to a citation that cannot be verified:

- The citation is dropped and counted, never shown.
- The answer is still shown, marked as having no located source.
- If **every** citation dropped on a question that asked for a fact, the answer
  says the source could not be located rather than presenting an uncited claim
  as sourced.

A question that is not factual, "what is this contract", does not need a
citation and is not penalised for lacking one.

---

## The Español toggle

`CTR_LANG` is already `en` or `es` and every authored string has both. Chat is
the one place the toggle costs a call, because the answer is generated.

The model is told which language to answer in. The guardrail answers, the
no-effective-date one included, come from the existing authored strings, so
they are already correct in both languages and cost nothing.

---

## Cost, and the caveat that matters

Their version is a bare textarea. Ours is a cached read of a contract.

| | Tokens | Cost |
|---|---|---|
| First question on a contract | ~30,000 in, cache write at 1.25x | **$0.11** |
| Each following question, cache warm | ~3,000 effective, 400 out | **$0.015** |
| A question after the cache expires | full read again | **$0.10** |

**The caveat: prompt caching has a five minute window by default.** A session of
questions asked together is cheap. One question now and another after lunch is
two full reads. So the honest figure is not "$0.015 a question", it is "$0.11
to open a contract and $0.015 a question while you stay in it".

At 30 contracts a month with five questions each in one sitting, that is about
**$5.50 a month**. If every question were asked cold it would be **$16.50**.

I would buy the one hour cache option if the volume ever makes that gap matter,
and tell you when it does rather than waiting to be asked.

---

## What it will refuse to do

- Answer a deadline question with no effective date. Code answers instead.
- Compute a date. The Actions tab owns arithmetic; Chat points at it.
- Produce a value that lands in a contract field.
- Give legal advice. It reads what the document says and names the page.

---

## Open, and my default if you do not say otherwise

**When a question has no verifiable citation.** My default is to show the answer
and say plainly that no page could be located for it, rather than hide the
answer or present it as sourced. The alternative, refusing to answer, would make
Chat useless for the general questions it is best at.
