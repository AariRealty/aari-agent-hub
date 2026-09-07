# Functions disabled 7 September 2026

Supabase has no per function off switch. There is no status you can flip in the API or the
dashboard that stops an edge function serving while leaving it in place. The only two
options are to delete the function, which frees the slug and loses its version history, or
to replace its body with something that refuses.

I took the second, because deletion is the more destructive of the two and is not the
"reversible in minutes" that was asked for. So this is a code change, which the brief said
it did not want, and it is a code change for the reason above rather than by preference.

What makes it reversible is this directory. The exact source each function was serving
immediately before it was disabled is recorded here, verbatim. Restoring one is: take the
file, deploy it under the same slug, done.

Nothing in this directory is deployed by the CI workflow. That is deliberate. The workflow
only deploys `supabase/functions/**`, so these copies sit outside its reach and cannot
quietly come back.

| Slug | Version when disabled | Why |
|---|---|---|
| `realty-broadcast` | v10 | Arbitrary subject and HTML to every lead, or to any address list the caller supplies, from "Marlenyi at Aari Realty", behind a token printed in its own source. Its unsubscribe secret is a literal too. |
| `realty-agent-provision` | v21 | Creates an auth account and inserts a realty_members row at role agent, status active, which is what the Hub gate checks. Token printed in its own source. |
| `preview-tc-invoice` | v13 | No authentication at all. Sends to any address the caller names, with caller controlled amounts, from a verified Aari sending domain. |

Traffic was checked before each. Two separate 24 hour log windows, 5 to 6 September and
6 to 7 September: zero invocations of all three. No cron job references any of them.

## The audit_log guard, and why one of the three is not fixed

`audit_log_actor_type_check` allows only: agent, tc, broker, admin, system, realty_member,
realty_broker. Three call sites wrote a value outside that list, each inside an empty catch,
so every insert violated the constraint, nothing surfaced, and no row was ever written.

- `realty-agent-provision`, `actor_type: 'realty_agent_provision'` — **fixed** in the
  preserved copy in this directory, now `system`.
- `realty-agent-provision`, `actor_type: 'finalize_join'` — **fixed**, now `system`.
- `realty-agent-welcome`, `actor_type: 'hub_welcome'` — **not fixed. See below.**

`realty-agent-welcome` has no source in this repository. Changing one word in it means
redeploying the whole function from a copy transcribed by hand, and that function is a pair
of long HTML email templates. There is no way to verify a transcription of it without
sending both emails to a real agent, which the standing rule forbids and which is exactly
the thing the broken guard fails to prevent.

So it is left alone and reported. Two ways forward, both the broker's call:

1. Disable it the way the three above are disabled. Nothing should be calling it while the
   no contact rule stands, and disabling removes the hazard completely rather than only
   stopping the second send.
2. Transcribe and redeploy with the fix, accepting that the email templates cannot be
   proven intact until someone receives one.

Until one of those happens, the guard cannot fire, and every call re-randomises the agent's
password and re-sends both emails, one of them carrying their executed ICA.

## The `sa_pdf` intent on `public-submit` is NOT closed, and here is why

I was asked to close it and I have not. This is a gate, not an oversight.

**What the chain is.** An anonymous caller posts `intent: 'sa_pdf'` to `public-submit`,
which has no authentication. `public-submit` forwards the caller's typed name, email,
licence and signature image to `aari-sa-pdf-email` **using the service role key**, which
satisfies that function's `verify_jwt: true`. `aari-sa-pdf-email` then builds a Service
Agreement PDF, uploads it to `signed-agreements`, sets `agents.agreement_pdf_path`, and
inserts an `agreement_signatures` row. The row is only written when the supplied email
matches an existing `agents` row, which is precisely the dangerous case.

**Why I did not close it.** `public-submit` has no source in any repository. Closing one
branch means redeploying all four hundred lines from a hand transcription, and this is the
live public intake funnel: ten invocations on 18 August alone, and it creates transaction
files and takes payments. Its file creating paths cannot be exercised to verify a
transcription without creating real files. A silent transcription error in the `service`,
`offer` or contract branch would break the revenue path and would not announce itself.

**What I established instead, which makes the change safe when it is made.** The only
Service Agreement signature ever produced through this funnel, on 18 August, came through
`intent: 'service'` carrying an `sa` block, from `submitted_via: portal_authenticated`.
It did **not** come through `sa_pdf`. So closing `sa_pdf` breaks nothing that has ever been
used.

**The exact change.** In `public-submit`, the block beginning `if (intent === "sa_pdf") {`
should return a refusal instead of calling `forwardSaPdf`:

```ts
if (intent === "sa_pdf") {
  return j(410, { ok: false, error: "sa_pdf_retired",
    detail: "Standalone Service Agreement signing is closed. Sign through the portal, which sends the sa block with the submission." });
}
```

Everything else in the function stays exactly as it is. The `sa` block inside the `service`
and contract intents is the legitimate route and must keep working.

**Making it from the real source.** Recover `public-submit` v36 from the Supabase dashboard's
deployment history, apply the four lines above, redeploy. Then verify: `intent: 'check_email'`
still answers (safe, read only), and `intent: 'sa_pdf'` returns 410.

**Until then the corridor is open.** `aari-sa-pdf-email` cannot be closed independently:
its only callers are `public-submit`'s three signing routes, and it cannot tell the forged
one from the legitimate one because `public-submit` does not forward whether the submitter
was authenticated.

### Update, 7 September: the real source cannot be recovered as bytes with the tools available

I was told to recover `public-submit`'s deployed source from Supabase version history rather
than transcribe it, and I have established that this is not possible from here. Recording it
so nobody spends the effort again.

- `get_edge_function` returns the source, but into the conversation, not to disk. It only
  persists to a file when the result is very large; `public-submit` at roughly 24 KB comes
  back inline. Fetched twice to confirm.
- `deploy_edge_function` takes file contents inline. There is no deploy-from-path.
- So every route from "read the deployed source" to "deploy a modified version" passes
  through reproduction by hand. There is no byte-preserving path.
- The Supabase Management API would give one, and so would the CLI, but both need
  `SUPABASE_ACCESS_TOKEN`, which this session does not have.

**Why I did not reproduce it anyway.** There is a way to prove a reproduction is faithful:
deploy it unchanged and check that the resulting `ezbr_sha256` still equals
`406b44d09d338b30f03fad8d87561cfad293e4f3938958290caf95ce60d9e4db`, the hash of the bundle
serving now. A match is cryptographic proof of byte-identity. The problem is the ordering:
the check happens after the deploy, and there is no rollback, because the previous bundle
cannot be redeployed through this API. A mismatch would mean the live revenue funnel had
already been replaced by something known to be wrong and unrecoverable.

**The path that does work, in order.**

1. Export `public-submit` v36 from the Supabase dashboard, where the deployed source can be
   read and copied by a person, and save it to `supabase/functions/public-submit/index.ts`.
2. Apply the four line change written above, mechanically.
3. Push. The CI workflow deploys `supabase/functions/**` from the file, so the bytes that
   reach Supabase are the bytes in the repository and nothing passes through a chat window.
4. Verify: `intent: 'check_email'` still answers, `intent: 'sa_pdf'` returns 410.

Step 1 is the only step that needs a person. Everything after it is mechanical and reviewable.

### A separate design defect, worth fixing after this one

`aari-sa-pdf-email` cannot tell an authenticated submission from an anonymous one, because
`public-submit` calls it with the service role key and does not forward `submitted_via`. A
downstream function that cannot distinguish its caller's authority has to trust everything or
nothing. Passing the authentication state through, and having `aari-sa-pdf-email` refuse to
write a signature row for an unauthenticated submission, would close this class of problem
rather than the single intent.
