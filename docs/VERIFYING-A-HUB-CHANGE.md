# Verifying a Hub change

Written 5 September 2026, after a day was spent diagnosing a module as unwired
when it was wired correctly and simply not in the document being measured.

Read this before you conclude that a change did not land.

## 1. Know which document you are looking at

There are two Hubs and they are different files.

| | Inline script | Tell |
|---|---|---|
| `hub_payload.html`, the old Hub | 870,230 chars | contains `BROKER_SLOT`, no "not connected yet" |
| `hub_next.html`, the new Hub | 489,272 chars | 16 occurrences of "not connected yet", no slots at all |

Measure `document.querySelectorAll('script')` and total the lengths. That number
alone tells you which one you have.

`hub.joinaari.com/` currently serves **`hub_next`** to a broker, because
`index.html` hardcodes `let wantsNext = true` and appends `&preview=next`. Only
a broker gets it: `realty-hub` ignores the preview flag for anyone else, so
agents receive `hub_payload` with all three modules injected.

To force the old Hub: `hub.joinaari.com/?hub=live`. That sets
`sessionStorage['aari-hub']='live'`, which lasts for that browser session only
and is gone when the browser closes.

## 2. The five minute cache

Two separate things delay a change by up to five minutes.

- `realty-hub` answers with `Cache-Control: private, max-age=300, must-revalidate`.
- `index.html` buckets its cache-busting parameter into five minute windows:
  `Math.floor(Date.now() / (5 * 60 * 1000))`.

**A fix checked inside that window will look like it failed.** Wait for the
bucket to roll, or hard reload with the cache disabled in DevTools. This is the
single most common reason a correct change appears not to have deployed.

The preview route is the exception: it answers `no-store`, so `hub_next`
changes appear immediately.

## 3. Where a module actually comes from

`realty-hub` downloads each module from the `realty-hub` storage bucket **on
every request**. No function redeploy is needed to pick up a new module. The
publish workflow uploads the file to the bucket and that is the whole
deployment.

So to check whether a module shipped, query the bucket, not the repository:

```sql
select name, updated_at, (metadata->>'size')::int as bytes
from storage.objects where bucket_id = 'realty-hub' order by name;
```

Compare the byte count against `wc -c` on the repo file. They should match
exactly.

## 4. An empty module used to be silent

`loadModule` returns `''` when a download fails or the object is missing, and
`inject` then returns the HTML unchanged with no error. The page renders
perfectly well without the module, so a failed download and a module that was
never wired looked identical from the browser. That ambiguity is what caused
the wrong diagnosis.

Since 5 September an empty or failed module download writes an audit row:

```sql
select created_at, details from audit_log
where action = 'realty_hub_module_empty' order by created_at desc limit 20;
```

`details` carries the module name and the storage error. **Check this before
concluding anything about wiring.** No rows means every module downloaded with
content in it.

## 5. The order to check things in

1. Which document am I looking at. Total the inline script length.
2. Has the five minute window rolled since the change.
3. Is the file in the bucket, at the right byte count.
4. Any `realty_hub_module_empty` rows.
5. Only then look at the code.
