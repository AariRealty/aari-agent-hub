// hotfix-broker-module-2026-08-12 · RETIRED 7 September 2026.
//
// Built for one afternoon. On 12 August broker_module.html shipped with a missing
// catch clause and an unclosed function, so hub.joinaari.com served the broker a
// blank page, and this pushed a corrected file into the realty-hub bucket.
//
// It was well made: active broker only, one permitted filename, a minimum body
// size, a required marker and closing tag, a backup of the live file before
// overwriting, and an audit row. None of that is why it is gone.
//
// It is gone because it is a standing ability to overwrite the file every broker
// loads, created for one emergency and still live three weeks later. Well built
// is not the same as should exist. The same need is covered by hub-file-io,
// through a reviewable path with a credential that can be rotated.
//
// Its audit write also carried the empty catch this project keeps producing, so a
// failed audit left no trace of a file overwrite. That is moot now.
//
// Full previous source and reasoning: docs/disabled-functions/
// hotfix-broker-module-2026-08-12.v1.ts

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-hotfix-filename',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: 'retired',
      detail: 'hotfix-broker-module-2026-08-12 was retired on 7 September 2026. It was a one-off written for a blank-page incident on 12 August and it could overwrite broker_module.html, the file every broker loads. Use hub-file-io, which writes through a reviewable path with a rotatable credential.',
    }),
    { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
)
