# realty-agent-welcome, disabled 7 September 2026

## The guard in this function is broken and MUST be fixed before it is ever restored

Its dedup reads `audit_log` for a row with action `realty_agent_welcome_sent` and returns
`{already: true}` if one exists. The write that would create that row uses
`actor_type: 'hub_welcome'`, which is not in `audit_log_actor_type_check`
(agent, tc, broker, admin, system, realty_member, realty_broker). Every insert violates the
constraint, the empty `catch(_e){}` swallows it, and no row has ever been written.
Confirmed: zero rows with that action, ever.

So the guard cannot fire. **Every call re-randomises the agent's auth password, locking out
anyone signed in with the old one, and re-sends both emails, one of which attaches their
executed Independent Contractor Agreement.** There is no limit on how many times.

Change `'hub_welcome'` to `'system'` before restoring. Nothing else in this function is
safe to rely on until that is done.

## The second trap

`preview: true` still **sends both emails** to the roster address. It only substitutes a
sample password and skips the password change. It previews the content, not the sending.
There is no way to see what this function sends without an agent receiving it.

## Why the source is not reproduced here

Unlike the other three in this directory, this function's original source is NOT preserved.
It is two long HTML email templates and roughly sixty lines of logic, and it has no source
in any repository. Reproducing it by hand would produce a copy that cannot be verified
without sending both emails to a real agent, which the standing no contact rule forbids.
A preserved copy that might be subtly wrong is worse than none, because it would be trusted.

To restore it, recover the real source from the Supabase dashboard's deployment history for
version 10, apply the `actor_type` fix, and only then deploy.

## What it did

Gated on `realty_config.digest_cron_secret` (a real gate, no literal in source). Given an
email address, it looked up the `realty_members` row, found that member's most recent
`realty_agreement_signatures` row by agent id then by email, downloaded the executed PDF
from the `signed-agreements` bucket, reset the member's auth password to a fresh 14
character value, set `must_change_password`, and sent two emails from
`Aari Realty <onboarding@aarirealty.com>`: one titled "It's official. Your Aari agreement is
signed." with the executed ICA attached, and one titled "Your keys to the Aari hub are
inside." carrying the temporary password in plain text.

## Traffic before disabling

Two 24 hour windows, 5 to 6 and 6 to 7 September: zero invocations. No cron job calls it.
