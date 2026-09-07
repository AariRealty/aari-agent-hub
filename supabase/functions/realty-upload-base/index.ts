// realty-upload-base · RETIRED 7 September 2026.
//
// This function took the bucket and the path from its caller and had a `delete`
// field that removed any object from any bucket. One header, matching
// realty_config.digest_cron_secret, unlocked read, overwrite and delete across
// signed-agreements, transaction-files and signatures. That secret is an ordinary
// cron secret shared with several routine scheduled jobs, so the widest authority
// in the estate sat behind one of the most widely handed out credentials.
//
// Nothing called it. No reference in any of six repositories, no cron job, and no
// deploy since early July 2026. Narrowing a capability nobody uses is work spent
// on a capability that should not exist, so it was retired rather than scoped.
//
// The safe replacement already exists. hub-file-io writes to a fixed bucket per
// route prefix, takes the key from a pattern that cannot climb out of the bucket
// root, and refuses to overwrite an existing agreement version rather than letting
// a document somebody may have signed change underneath them.
//
// The full previous source is preserved at
// docs/disabled-functions/realty-upload-base.v12.ts, with the reasoning.
//
// This answers 410 Gone to everything, including OPTIONS preflight, so a caller
// that still exists somewhere unknown gets a clear and permanent answer rather
// than a timeout or a confusing 401.

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-aari-cron",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400",
};

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "retired",
      detail:
        "realty-upload-base was retired on 7 September 2026. It accepted the bucket and path from its caller and could delete any object in any bucket, behind a cron secret shared with several scheduled jobs. Nothing called it. Use hub-file-io, which writes to a fixed bucket per route and will not overwrite a published agreement version.",
    }),
    { status: 410, headers: { ...CORS, "Content-Type": "application/json" } },
  )
);
