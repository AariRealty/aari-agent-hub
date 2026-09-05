# The heartbeat

5 September 2026. Built as Option B: the whole cron estate, not just the county
lookup. Live and running.

---

## Two things it found before it was finished

**1. Your document purge has been broken since 14 August.**

`purge-closed-tc-documents` runs at 04:00 daily and has failed 22 of its last 23
runs. Last success: 14 August 2026.

```
ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead.
```

It deletes from the storage tables directly, which Supabase now blocks. Closed
TC documents have not been purged at 30 days for three weeks. **I have not
touched it**; it is a separate fix and it is now raising an alert.

**2. SMS has not worked since 15 June. This one changes your instruction.**

You said "`send-morning-briefing-sms` runs daily, so that path is proven." The
cron does run daily. The SMS does not send.

```
Quo 402: The organization does not have enough prepaid credits to send the message
```

**217 consecutive failures over 82 days.** Last successful SMS: 14 June 2026.
78 sent before that, then nothing. Your morning briefing has been failing every
morning since.

So the heartbeat is built and shipped on SMS exactly as you asked, and it is
raising alerts correctly, but **it cannot deliver one until Quo is topped up**.
Everything else works. I did not switch to email, because you ruled it out and
because switching a channel to route around an unpaid bill would hide the bill.

A third thing worth noticing: `send-broker-escalation-sms-to-agent` is named SMS
but was converted to email at some point. The naming across the estate is not
reliable evidence of transport.

---

## What it watches

Every active cron job, 24 of them, plus the four county probes.

| State | Meaning |
|---|---|
| `ok` | Ran when expected, no error since the last success |
| `failing` | A run returned an error and has not succeeded since |
| `stale` | Has not run when its own history says it should have |
| `unknown` | Active and scheduled with no retained run at all |

**Staleness comes from the job's own cadence, not from parsing its cron string.**
The median gap across its twelve most recent runs is its period; three missed
periods, floored at 90 minutes, is stale. A job that has run every five minutes
for a month states its period more reliably than a schedule string does, and
there is no cron parser to get wrong.

## Once per incident, never per run

This is a property of the schema, not of anyone remembering. `record_job_health`
writes to `realty_alerts` **only inside the state-change branch**. The heartbeat
function cannot write an alert at all; it only delivers what is already there.

Proved on the live database: four consecutive scans of a genuinely failing job
produced exactly one alert row. Then the transition table, run and rolled back:

```
ok -> failing        opened
failing -> failing   (nothing)
failing -> failing   (nothing)
failing -> ok        recovered
ok -> ok             (nothing)
```

Two messages per incident. Break and recover. Nothing in between.

## What the message says

You will read it on a phone, so it names the job, what failed, and how long.

```
Aari ALERT: purge-closed-tc-documents
Failing for 21 days (22 runs).
ERROR: Direct deletion from storage tables is not allowed. Use the
Storage API instead. HINT: This prevents accidental data loss from...
```

229 characters, two SMS segments, **$0.02**.

```
Aari OK again: purge-closed-tc-documents
Recovered after 21 days failing.
```

The recovery message had a real bug on first build: it measured from the moment
of recovery and printed "Recovered after 0 min ok", which tells you nothing. It
now reports the outage that ended, not the recovery that started.

When an outage is older than the retained cron history, the message says **"at
least"** rather than stating a figure the data does not support. Same discipline
as "12 or more" on the parcel lookup.

If more than three alerts land at once, they become **one summary text** rather
than a wall of messages. An estate-wide outage should not cost you 23 texts.

## The dead man's switch

Its own function, `heartbeat_deadman()`, its own cron at :50, **pure SQL with no
network call of any kind**, so it cannot be taken down by the thing it watches.
The test asserts that its body contains no network call, and fails if anyone
adds one.

**N is three hours.** The heartbeat runs hourly, so three hours tolerates two
missed beats before it speaks: one miss is noise, three is a pattern. The switch
itself runs hourly, so worst case from "heartbeat dies" to "you are told" is
four hours. Shorter would page on a single blip, and an alert that pages on
blips is one you stop reading, which costs more than four hours of latency.

Proved live: silent while the heartbeat is fresh, and with the heartbeat aged
nine hours it produced

```
Aari ALERT: aari-heartbeat
No run for 9 hours. Expected sooner.
The heartbeat has stopped reporting. Nothing is being monitored.
```

Detection is pure SQL. **Delivery necessarily needs a network**, so it is a
separate wrapper. If the edge runtime itself is down, the alert is still raised
and still visible, it just cannot be pushed until the runtime returns. That
limit is irreducible.

## A delivery failure is not a missing alert

`realty_alerts` tracks whether an alert exists and whether it was delivered as
**two separate facts**. A dead channel can never look like an alert that was
never raised. Right now every alert carries `delivered = false` and the Quo 402
verbatim, which is how the credit problem is legible rather than silent.
Delivery stops after five attempts so a dead channel is not hammered; the row
stays.

## What it cannot see

**An edge function that returns 500 forever looks healthy.** A cron whose
command is `net.http_post` records `succeeded` when the *post* succeeds,
whatever the function then returns. Verified on live data: `payment_reminder_hourly`
and `ics-sync-hourly` both record "succeeded" with return_message "1 row".

This is exactly why `morning-briefing-sms` shows `ok` in the scan while having
sent nothing for 82 days. **The monitor would not have caught the SMS problem.**
I found that by reading `sms_log` directly.

Closing that gap means recording the request id at call time and correlating it
against `net._http_response` within its six hour retention. It touches
`call_edge_function`, which 11 of the jobs use, and the other 6 would need their
cron commands rewritten. That is a second piece of work, not a line I can add,
and I have not done it.

The parcel probe is covered because it reports its own verdict into the same
ledger rather than relying on cron seeing it.

## Cost

- **Running: effectively zero.** 720 heartbeats and 720 dead man checks a month.
  Supabase Pro includes 2M edge invocations. 2,880 ArcGIS queries against free
  public layers.
- **Alerts: $0.01 per SMS segment.** A typical alert is two segments. Once per
  incident, so a month with three incidents costs about **$0.12**.
- **A full beat takes 3.2 seconds**, most of it the four county probes.

## Where to look

```sql
select job_name, state, since, last_error from realty_job_health order by state, job_name;
select job_name, edge, message, delivered, delivery_error from realty_alerts order by created_at desc;
```

## Checked

`build/test-heartbeat.js`, 55 checks, in `npm run check`. It cannot run the live
scan, because the build container's proxy blocks supabase.co, so it asserts the
properties that go wrong in the source. Proved by reintroducing five regressions
one at a time and confirming each fails:

1. alerting on every scan instead of on the edge
2. the recovery message measuring the wrong interval again
3. a network call added to the dead man's switch
4. an undeliverable alert marked delivered
5. the correlated subquery that made the first scan time out at 60 seconds

That last one was a real bug: the first version put `(select max(...))` inside a
`FILTER`, which re-evaluates per row. Across 48,429 run rows it did not finish
inside a minute. It is single-pass CTEs now and the whole scan takes about a
second.

---

## Yours

- **Top up Quo credits.** Nothing gets delivered until then. This is the one
  thing standing between the heartbeat and doing its job.
- **The purge fix.** It needs to go through the Storage API. Separate change,
  not started.
- **Resend domain verification**, if you want email as a fallback channel. The
  seam is in place; it is a case arm, not a rewrite.
