# The NUL byte that threw away two extractions

5 September 2026.

## What happened

The extractor was run on the four unextracted FR/BAR packets. Two returned
`500 Draft save failed: unsupported Unicode escape sequence` and **both lost a
complete, correct extraction**: 25 fields and 3 or 4 split sub documents each,
parsed successfully and then discarded.

The cause is one character. A PDF text layer can carry a NUL (`U+0000`), and
`pdfToPages` passes it straight through into a matched field, in these two
cases inside a party name. Postgres cannot store `U+0000` in `jsonb`, so the
`files` update is rejected, and the handler turns that into a 500:

    const { error } = await admin.from("files").update(patch).eq("id", body.file_id);
    if (error) return j(500, { ok: false, fields, documents,
      error: "Draft save failed: " + error.message });

The fields were still in the response body, which is how both were recovered
without re-reading the PDFs.

## Why it matters more than it looks

**Two of four real contracts failed.** This is not a rare document. Any
contract whose text layer carries a control character fails the same way, and
it fails silently from the coordinator's point of view: the screen shows a file
that has never been extracted, with nothing to say that a parse succeeded and
the save was thrown away.

## The fix

Strip C0 control characters at the parser's own output, so the returned draft
and the stored draft can never disagree:

    function stripCtl(s: string): string {
      return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    }

Tab, newline and carriage return are deliberately left alone. They are legal in
`jsonb`, and a legal description occasionally carries one.

## The two files

Recovered from the response bodies rather than re-parsed, written with the
control character removed, and marked
`source: "extract-contract-fields/v16 (rescued, null byte stripped)"` so nobody
later reads them as ordinary extractor output. Two `audit_log` rows record it
under `extraction_rescued`.

## Deployed

v38, 5 September 2026. Verified by re-running both cases rather than by
reading the diff: the file that returned 500 now returns 200 and writes, and
the file that already worked returns a byte identical body, so the change
did not alter what the parser reads. All four are now ordinary v17 output with
their sub documents split into storage; none carries the rescued marker any
more.

`index.ts` is now in this folder. It had existed only as a deployed artifact,
which is exactly how the two copies of `flags.js` came to drift.

## Spot check against the source PDFs

The two recovered files never completed a clean round trip, so nothing was
signed off on the strength of a recovered response body. Two checks were run.

**One, against the failed response.** The fields v38 saved were compared key by
key with what the 500 body had returned under v37. **25 of 25 identical on both
files, zero differences.**

**Two, against the documents themselves.** A `verify_stored` mode was added to
`realty-contract-probe` (v5) which re-reads the source PDF and checks that each
stored value actually occurs in it. Values stay in the database; the mode
returns field names and counts only. Both sides are folded to letters and
digits first, so a comma, an underscore or a line break cannot make a correct
value look absent.

| File | Pages | Verbatim fields checked | Found | Missing | Sub documents |
| --- | --- | --- | --- | --- | --- |
| 1 | 13 | 20 | **20** | 0 | 1 |
| 2 | 18 | 22 | **22** | 0 | 3 |
| 3 | 18 | 22 | **22** | 0 | 3 |
| 4 | 18 | 22 | **22** | 0 | 4 |

**86 of 86 stored values were found in the source documents. Nothing is
missing and nothing was invented.**

### What this sign off does NOT cover, and it matters

This check proves a stored value **appears in the document**. It does not prove
it appears in the **right place**.

`title_phone` holding a party's telephone number instead of the closing
agent's would pass this check, because the number really is in the document.
That exact bug has happened before and the parser carries a comment about it:
the first phone in a contract is usually a party's or an agent's, not the
closing agent's, which is why the escrow block is scoped by hand.

So the four files are signed off as **containing nothing invented**. They are
**not** signed off as **correctly attributed**. Anyone reading "86 of 86
verified" as the stronger claim is reading it wrong.

Testing attribution rather than containment is a separate piece of work and is
not done.

Twelve fields were excluded from the verbatim check by name, three per file:
`contract_type`, `financing_type` and `flag_home_warranty`. Those are labels
the parser chooses rather than text it lifts, so their absence from the page
is correct rather than a miss.

Three of the four now carry `v17`. The fourth is still `v16` because it
succeeded first time and never needed re-running, and its 22 fields verify
just the same.

## The deeper bug, fixed separately

A parse that succeeded and a write that failed presented as a file that had
never been read. Those are different facts and a coordinator could not tell
them apart.

v39 writes `extraction_attempted_at` to the row after it knows there is a
contract to read and **before the download**, so no PDF text exists yet and it
cannot fail for the reason the real write fails. It sits before the download on
purpose: a missing or unreadable object is a failed attempt too. It is
deliberately after the no-contract-path return, because a file with no contract
on it has genuinely not been attempted.

Proven live rather than by reading the diff:

| Case | HTTP | attempt_marked | Marker on the row | Extraction | State the screen shows |
| --- | --- | --- | --- | --- | --- |
| Forced failure, object not found | 422 | true | yes | no | **could not be saved** |
| Real contract | 200 | true | yes | yes | **extracted** |

The forced failure was run against a test pool row, not a client file. Before
this change that first row would have read "never run".

## Book after

| | Before | After |
| --- | --- | --- |
| Files with an extraction | 24 | **28** |
| Files with a pointer never run | 7 | **3** |

The remaining three are the ones no code can help: a listing agreement that
will yield listing fields only, a 10 page document at 660 characters a page
that matched no form phrase, and a two page scan with no text layer at all.
