// put-frag · upload one object into the realty-hub bucket from base64.
//
// This used to authenticate on realty_config.digest_cron_secret, the credential
// at least eight other functions share and that no rotation procedure covers.
// It writes arbitrary bytes to an arbitrary object name in the bucket the Hub is
// served from, which is a publishing capability, not a diagnostic one. It now
// takes the same dedicated bucket write credential hub-file-io does, in the same
// header, with no default and no literal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS: Record<string,string> = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-io-secret', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
function J(o: unknown, st = 200) { return new Response(JSON.stringify(o), { status: st, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

async function acceptedSecrets(): Promise<string[]> {
  const { data } = await admin.from('realty_config').select('key,value').in('key', ['hub_io_secret', 'hub_io_secret_next']);
  const out: string[] = [];
  for (const r of data ?? []) { const v = String((r as { value?: string }).value ?? ''); if (v) out.push(v); }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return J({ error: 'method_not_allowed' }, 405);
  try {
    const accepted = await acceptedSecrets();
    if (!accepted.length) {
      return J({ error: 'io_secret_not_configured',
                 detail: 'No hub_io_secret in realty_config. This function writes to the realty-hub bucket and will write nothing until realty_config.hub_io_secret is set. It no longer accepts the shared cron secret.' }, 503);
    }
    const presented = req.headers.get('x-io-secret') ?? '';
    if (!presented || !accepted.includes(presented)) return J({ error: 'forbidden' }, 403);

    const body = await req.json();
    const name = String(body?.name || '');
    if (!name || !body?.b64) return J({ error: 'name+b64 required' }, 400);
    // One path segment, no traversal, matching the shape hub-file-io enforces.
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return J({ error: 'bad path' }, 400);
    const bytes = Uint8Array.from(atob(String(body.b64)), (c) => c.charCodeAt(0));
    const { error } = await admin.storage.from('realty-hub').upload(name, bytes, { contentType: 'text/plain; charset=utf-8', upsert: true });
    if (error) return J({ error: error.message }, 500);
    return J({ ok: true, name, bytes: bytes.length });
  } catch (e) { return J({ error: String(e) }, 500); }
});
