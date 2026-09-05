# The net.http_post gap, scoped

Not built. This is what it would cost and what it touches.

---

## The disease, stated plainly

A cron job whose command is a `net.http_post` records `succeeded` when the
**post** succeeds, whatever the edge function then returns. Verified on live
data: `payment_reminder_hourly` and `ics-sync-hourly` both record status
`succeeded` with `return_message` "1 row", because posting worked.

So an edge function that returns 500 forever reads as perfectly healthy. That is
how `morning-briefing-sms` showed `ok` in the heartbeat's scan while having sent
nothing for 82 days. I found that by reading `sms_log`, not by monitoring.

## Why it is not one query

`net._http_response` holds `id, status_code, content_type, headers, content,
timed_out, error_msg, created`. **It does not hold the URL.** The only link
between a request and the job that made it is the request id that
`net.http_post` returns, and cron does not keep it: `job_run_details.return_message`
is "1 row", not the value.

Retention is about **six hours** (measured: oldest response 04:05, newest 09:35).
So any correlation has to happen within six hours of the call, which the hourly
heartbeat already satisfies.

## The shape of the estate

24 active jobs, three shapes:

| Shape | Jobs | Covered today? |
|---|---|---|
| Pure SQL | 5 | **Yes.** A raised exception marks the run failed, which is how the purge was caught. |
| Edge via `call_edge_function` | 15 | No, but coverable by changing one function. |
| Edge via direct `net.http_post` | 5 | No. Each cron command needs rewriting. |

### The five that need their commands rewritten

1. `ics-sync-hourly`
2. `realty-drip-daily`
3. `realty-weekly-digest`
4. `tc-invoice-thursday`
5. `tc-invoice-unpaid-reminder-weekly`

A sixth, `morning-briefing-sms`, was in this group and is now disabled at your
instruction, so it drops out until you decide about it.

Each embeds its own auth: three paste an anon or service key inline as a
literal, and `realty-drip-daily` uses an `x-aari-cron` header secret. Rewriting
them onto `call_edge_function` would also remove four hardcoded key literals
from cron definitions, which is worth having on its own.

## What building it looks like

**One new table.** `realty_edge_calls`: request id, function name, called at,
plus status code, ok, and error once resolved. Small, and prunable at seven days.

**One changed function.** `call_edge_function` records the request id it gets
back before returning it. Six lines. It is `SECURITY DEFINER` and already the
single door for 15 jobs, so this is the cheap half of the work.

**Five rewritten cron commands.** Each becomes
`select public.call_edge_function('<fn>', '{}'::jsonb);`, which means moving
three inline keys and one header secret into the function or the vault. This is
the fiddly half: `realty-drip-run` expects its secret in a header that
`call_edge_function` does not send, so either that function learns to accept the
secret in the body, or `call_edge_function` grows an optional headers argument.
I would give it the optional headers argument; it is the smaller change and does
not touch a working function's contract.

**One sweep in the heartbeat.** Join `realty_edge_calls` to
`net._http_response` on the request id, resolve anything unresolved, and feed a
non-2xx into `record_job_health` as `failing` for that job. It reuses the whole
alerting path already built, so once-per-incident, the phone-shaped message and
the recovery notice all come for free.

**Tests.** Extend `build/test-heartbeat.js`: a resolved 200 is ok, a resolved
500 is failing, an unresolved call older than retention is its own state and not
silently ok, and the correlation cannot mark a job healthy on someone else's
request id.

## Cost

**About a day**, in the same shape as the heartbeat: half of it the five cron
rewrites and their secrets, not the correlation logic.

**Running cost is nil.** No new network calls. One insert per edge cron call,
about 400 rows a day, joined once an hour against a table that already exists.

## The honest limits it will still have

- **Six hour retention.** If the heartbeat misses more than six hours of beats,
  those calls resolve to nothing. That must record as `unknown`, never as ok.
- **A 200 is not correctness.** `send-morning-briefing-sms` returns HTTP 200
  with `{ok: false, error: "..."}` when Quo refuses, because it answers 500 only
  on a send failure it treats as fatal. Correlating status codes would **not**
  have caught the credit problem. Catching that needs the function to report its
  own verdict, the way the parcel probe does. I would rather tell you that now
  than have you find it later.
- Which means the real fix is two-layered: status codes catch crashes and
  timeouts, self-reported verdicts catch "ran fine, did nothing". The first is
  this day of work. The second is a convention every notifying function would
  have to adopt, and it is a bigger conversation.

## One more thing the scan does not do

A job that is **disabled** drops out of the scan entirely, because it filters on
`j.active`. Disabling `morning-briefing-sms` would have left its health row
sitting at `ok` for ever, so I wrote it to `unknown` with the reason. But an
accidental disable would go unnoticed the same way. Making the scan notice a job
that was active yesterday and is not today is a small addition and I would fold
it into this work.

---

# Name versus transport, audited

You asked for a list, not a fix. Every function with `sms` in its name, checked
by reading the source rather than trusting the name.

| Function | Name says | Actually sends | Verdict |
|---|---|---|---|
| `send-morning-briefing-sms` | SMS | **SMS** via Quo | Correct. Now disabled. |
| `send-tc-acceptance-sms` | SMS | **SMS** via Quo | Correct. Silently failing since 15 June. |
| `send-tc-assignment-sms` | SMS | **Email** via Resend | **Misnamed** |
| `send-file-submitted-sms-to-agent` | SMS | **Email** via Resend | **Misnamed** |
| `send-broker-escalation-sms-to-agent` | SMS | **Email** via Resend | **Misnamed** |

Three of five are misnamed. All three carry a header comment saying "(EMAIL
transport)" and "Free (Resend), replaces the paid SMS", so this was a deliberate
migration where the slug was kept for backward compatibility with a database
trigger. Understandable, and still a trap: I read the estate for an hour on the
assumption that a name meant something.

**`send-tc-acceptance-sms` is the one that matters.** It is genuinely SMS, it is
genuinely wired, and it has been failing on Quo credits since 15 June alongside
the briefing. Every "your TC accepted your file" text to an agent has silently
not arrived for 82 days. Topping up Quo will bring this one back too, which you
may or may not want.

## A second copy that has already drifted

`_shared/quo-sms.ts` is bundled separately into each function that uses it, and
the copies are **not the same**. The one in `send-morning-briefing-sms` accepts a
`from` override so the briefing can send from the Aari Realty number. The one in
`send-tc-acceptance-sms` does not, and always uses `QUO_FROM_NUMBER`.

So the two live SMS senders send from different numbers, and nothing says so.
That is a second copy of a fact that can drift, and it already has. Not fixed,
listed.

## Corroboration from the data

`sms_log` carries only three template tags in its whole history: `morning_briefing`
(111), `job_alert` (1, mine, today), and 203 untagged rows that stop on 8 July
with bodies like "New file 8504 from Marlenyi Paredes" and "File 2513 (your file)
is in, routing to...". Those are the file-notification texts, and they stop
exactly where those functions were converted to email. The log agrees with the
source read.
