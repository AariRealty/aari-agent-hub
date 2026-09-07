// realty-hub-fileio · read, grep, slice and patch objects in a storage bucket.
//
// This function used to authenticate on realty_config.digest_cron_secret, which
// is the same value at least eight other functions read. That made it a second
// door onto every bucket in the project: action 'write' takes the bucket name
// from the request body, so 'signed-agreements' plus the path of an executed
// agreement plus a base64 body overwrote that agreement. Publishing was closed
// at hub-file-io while this stood open on a credential that was already set.
//
// Bucket write access is now on its own credential, the same pair hub-file-io
// uses, presented in the same header. There is no default and no literal: unset
// means this function does nothing and says why. Rotating it is the procedure
// written on hub-file-io, both values accepted while both are present.
import { createClient } from 'jsr:@supabase/supabase-js@2';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS: Record<string,string> = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-io-secret', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
function json(b: unknown, s=200){ return new Response(JSON.stringify(b), { status:s, headers:{...CORS,'Content-Type':'application/json'} }); }

async function acceptedSecrets(): Promise<string[]> {
  const { data } = await admin.from('realty_config').select('key,value').in('key',['hub_io_secret','hub_io_secret_next']);
  const out: string[] = [];
  for (const r of data ?? []) { const v = String((r as {value?: string}).value ?? ''); if (v) out.push(v); }
  return out;
}

async function readFile(bucket: string, name: string): Promise<string|null> {
  const { data } = await admin.storage.from(bucket).download(name);
  if (!data) return null;
  return await data.text();
}
async function writeFile(bucket: string, name: string, text: string, contentType = 'text/html; charset=utf-8') {
  const bytes = new TextEncoder().encode(text);
  const { error } = await admin.storage.from(bucket).upload(name, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return bytes.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:CORS});
  if (req.method !== 'POST') return json({error:'method_not_allowed'},405);

  const accepted = await acceptedSecrets();
  if (!accepted.length) {
    return json({ error:'io_secret_not_configured',
                  detail:'No hub_io_secret in realty_config. This function reads and writes storage buckets and will do neither until realty_config.hub_io_secret is set to a freshly generated value. It no longer accepts the shared cron secret.' }, 503);
  }
  const presented = req.headers.get('x-io-secret') ?? '';
  if (!presented || !accepted.includes(presented)) return json({error:'forbidden'},403);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');
  const bucket = String(body?.bucket ?? 'realty-hub');
  const name = String(body?.name ?? '');
  if (!name) return json({error:'name required'},400);

  if (action === 'read') {
    const text = await readFile(bucket, name);
    if (text === null) return json({error:'not found'}, 404);
    return json({ ok:true, name, bytes: text.length, content_b64: btoa(unescape(encodeURIComponent(text))) });
  }

  if (action === 'write') {
    const contentB64 = String(body?.content_b64 ?? '');
    if (!contentB64) return json({error:'content_b64 required'},400);
    const text = decodeURIComponent(escape(atob(contentB64)));
    const bytes = await writeFile(bucket, name, text, String(body?.content_type ?? 'text/html; charset=utf-8'));
    return json({ ok:true, name, bytes });
  }

  // Grep: find lines matching a needle (plain substring), return line numbers with N lines of context.
  if (action === 'grep') {
    const needle = String(body?.needle ?? '');
    if (!needle) return json({error:'needle required'},400);
    const ctx = Math.max(0, Math.min(20, Number(body?.context ?? 3)));
    const limit = Math.max(1, Math.min(50, Number(body?.limit ?? 10)));
    const text = await readFile(bucket, name);
    if (text === null) return json({error:'not found'}, 404);
    const lines = text.split(/\r?\n/);
    const hits: Array<{ line: number; excerpt: string }> = [];
    for (let i=0; i<lines.length && hits.length<limit; i++) {
      if (lines[i].includes(needle)) {
        const from = Math.max(0, i-ctx);
        const to = Math.min(lines.length, i+ctx+1);
        const excerpt = lines.slice(from,to).map((l,idx) => (from+idx+1).toString().padStart(5,' ') + (from+idx===i?' > ':'   ') + l).join('\n');
        hits.push({ line: i+1, excerpt });
      }
    }
    return json({ ok:true, name, total_lines: lines.length, matches: hits.length, hits });
  }

  // Slice: return a specific line range so we can inspect a section without downloading the whole file.
  if (action === 'slice') {
    const start = Math.max(1, Number(body?.start ?? 1));
    const end = Math.max(start, Number(body?.end ?? start+40));
    const text = await readFile(bucket, name);
    if (text === null) return json({error:'not found'}, 404);
    const lines = text.split(/\r?\n/);
    const slice = lines.slice(start-1, end).join('\n');
    return json({ ok:true, name, total_lines: lines.length, start, end: Math.min(end, lines.length), content: slice });
  }

  // Patch: server-side find-and-replace with automatic timestamped backup.
  // Requires the old string to be UNIQUE in the file to prevent accidental multi-hits.
  if (action === 'patch') {
    const oldB64 = String(body?.old_b64 ?? '');
    const newB64 = String(body?.new_b64 ?? '');
    if (!oldB64) return json({error:'old_b64 required'},400);
    const oldStr = decodeURIComponent(escape(atob(oldB64)));
    const newStr = decodeURIComponent(escape(atob(newB64)));
    const text = await readFile(bucket, name);
    if (text === null) return json({error:'not found'}, 404);
    const idx1 = text.indexOf(oldStr);
    if (idx1 < 0) return json({error:'old string not found'}, 404);
    const idx2 = text.indexOf(oldStr, idx1 + oldStr.length);
    if (idx2 >= 0 && !body?.allow_multiple) return json({error:'old string is not unique (found at multiple locations); pass allow_multiple:true if intentional'}, 409);
    const updated = body?.allow_multiple ? text.split(oldStr).join(newStr) : text.slice(0, idx1) + newStr + text.slice(idx1 + oldStr.length);
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const backupName = name + '.BACKUP-' + stamp;
    await writeFile(bucket, backupName, text);
    const bytes = await writeFile(bucket, name, updated);
    return json({ ok:true, name, bytes, backup: backupName, old_bytes: text.length, delta: bytes - text.length });
  }

  return json({error:'unknown_action'},400);
});
