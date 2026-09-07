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
