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

## Book after

| | Before | After |
| --- | --- | --- |
| Files with an extraction | 24 | **28** |
| Files with a pointer never run | 7 | **3** |

The remaining three are the ones no code can help: a listing agreement that
will yield listing fields only, a 10 page document at 660 characters a page
that matched no form phrase, and a two page scan with no text layer at all.
