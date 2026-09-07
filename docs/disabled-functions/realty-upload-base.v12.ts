// PRESERVED SOURCE. This is realty-upload-base as it was deployed, version 12,
// last deployed early July 2026 and never redeployed. It was retired on
// 7 September 2026 and the live function now returns 410 and nothing else.
//
// WHY IT WAS RETIRED RATHER THAN SCOPED.
//
// It was not reachable unauthenticated: it required an x-aari-cron header matching
// realty_config.digest_cron_secret, and it failed closed if that row were missing.
// That is not the problem.
//
// The problem is the shape of what that one header unlocked. The caller supplies
// the bucket AND the path, and a `delete` field removes any object from any
// bucket. So whoever held digest_cron_secret could read, overwrite or delete
// anything in signed-agreements, transaction-files or signatures: executed
// agreements, client documents, signature images. That secret is an ordinary cron
// secret shared with several routine scheduled jobs. The widest authority in the
// estate sat behind one of the most widely handed out credentials.
//
// And nothing called it. No reference in any of the six repositories checked, and
// no cron job invokes it. An invocation log query would have said whether it had
// ever been used; the logs backend errored on that query, so that is unconfirmed.
//
// Scoping it to an allowlist of buckets would have been work spent narrowing a
// capability that should not exist. Retiring it removes the delete-anything path
// entirely, and nothing depends on it.
//
// The upload half of this, if it is ever wanted back, already exists in a safer
// form: hub-file-io writes to a fixed bucket per route prefix, takes the key from
// a pattern that cannot climb out of the bucket root, and refuses to overwrite an
// existing agreement version. That is the shape to restore, not this one.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await sb.from("realty_config").select("value").eq("key", "digest_cron_secret").single();
    const secret = req.headers.get("x-aari-cron");
    if (!secret || secret !== cfg?.value) return new Response("unauthorized", { status: 401 });
    const body = await req.json();
    const bucket = body.bucket || "signed-agreements";
    if (body.delete) {
      const { error } = await sb.storage.from(bucket).remove([body.delete]);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true, deleted: body.delete }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    let bytes = Uint8Array.from(atob(body.b64), (c) => c.charCodeAt(0));
    if (body.gzip) {
      const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
      bytes = new Uint8Array(await ds.arrayBuffer());
    }
    const sha = await sha256Hex(bytes);
    const { error } = await sb.storage.from(bucket).upload(body.path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, path: body.path, bytes: bytes.length, sha256: sha }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
