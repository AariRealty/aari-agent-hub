# The ICA gate script: which copy is live, and where it should live

Determined 7 September 2026 from content, not from key names or timestamps.

## The premise was wrong, and it was my error

My previous report said the live `ica_gate_js` was not the most recently edited copy,
because two backups carry `updated_at` values later than the live row's. That inference
does not hold.

`public.realty_config` has no trigger of any kind. `updated_at` is whatever the writing
code chooses to set, so it does not track edits and cannot order these rows. The live row
still reads 27 July 2026 03:10:19 because the code that last changed its value did not
touch the column.

## What is actually in each copy

| Key | Bytes | Carries the `{token, why}` fix |
|---|---:|---|
| **`ica_gate_js`** (live) | **20,502** | **yes** |
| `ica_gate_js.BACKUP-20260727-030000-pre-htmlembed` | 14,813 | no |
| `ica_gate_js.BACKUP-20260727-025000-v2rollback` | 14,466 | no |
| `ica_gate_js_backup_20260906` | 14,302 | no |
| `ica_gate_js.BACKUP-20260727-031500-pre-remove-fs` | 14,251 | no |
| `ica_gate_js.BACKUP-20260727-032000-pre-scroll-hint` | 13,709 | no |
| `ica_gate_js.BACKUP-20260727-022256` | 12,749 | no |

All seven open with the same IIFE and the same `__aariIcaGate` guard, and all seven end
identically. The live copy and the 6 September copy diverge after 164 characters, at the
definition of `tok()`.

The live copy's `tok()` returns `{token, why}` and carries this comment:

> Never a bare empty string: an empty token that got posted anyway as
> "Authorization: Bearer " is how a diagnosable problem became the silent one.

That is the fix for the stale token 401 on the signing path. No backup contains it. The
live copy also calls `agreement_status` three times and `realty-sign-ica` twice where
every backup calls each once, which is the retry and diagnostic path that arrived with
that fix, and it accounts for the extra 6,200 bytes.

## Read

**The live copy is the intended one.** `ica_gate_js_backup_20260906` is an ordinary
pre change snapshot taken before the token fix landed, correctly named. Nothing is missing
from production and no change is proposed to the live row.

## Where it should live

`build/ica_gate.js` in this repository, composed into `realty_config.ica_gate_js` by the
publish workflow, exactly as `tx_module.html` and `broker_module.html` are published into
the `realty-hub` bucket.

Migration, when publishing reopens:

1. Read the live value out and commit it verbatim as `build/ica_gate.js`. It is the
   baseline, so the first commit must be byte identical to what is serving now.
2. Add a publish step that writes the file into `realty_config.ica_gate_js` through
   `hub-file-io`, which means giving that function a config route alongside its bucket
   routes, gated on the same `hub_io_secret`.
3. Add the same composed check `build/compose-audit.js` already runs, so a gate that fails
   to parse fails the build rather than the agent's Hub.
4. Delete the six backup keys only after step 1 is merged, so the history moves into git
   rather than being thrown away. Until then they are the only history there is.

Not run in this pass.
