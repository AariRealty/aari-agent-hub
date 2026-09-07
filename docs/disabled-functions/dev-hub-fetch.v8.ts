import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// SECRET REDACTED IN THIS PRESERVED COPY. v8 had the literal here, accepted either as the
// ?secret= query parameter or the x-aari-dev header. It is on the rotation list and must not
// be restored as a literal.
const SECRET = Deno.env.get('AARI_DEV_FETCH_SECRET') ?? '';
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if ((url.searchParams.get('secret') || req.headers.get('x-aari-dev')) !== SECRET) return new Response('forbidden', { status: 403 });
  const bucket = url.searchParams.get('bucket') || 'realty-hub';
  const file = url.searchParams.get('file') || 'hub_payload.html';
  const pattern = url.searchParams.get('pattern');
  const before = Number(url.searchParams.get('before') || 200);
  const after = Number(url.searchParams.get('after') || 400);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.storage.from(bucket).download(file);
  if (error || !data) return new Response('error: ' + (error?.message || 'not found'), { status: 500 });
  const text = await data.text();
  if (!pattern) return new Response('BUCKET: ' + bucket + '\nFILE: ' + file + '\nLENGTH: ' + text.length + '\n', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const results: string[] = [];
  let idx = 0, count = 0;
  const max = Number(url.searchParams.get('max') || 5);
  while (count < max) {
    const found = text.indexOf(pattern, idx);
    if (found === -1) break;
    const start = Math.max(0, found - before);
    const end = Math.min(text.length, found + pattern.length + after);
    results.push('=== MATCH #' + (count + 1) + ' at offset ' + found + ' ===\n' + text.slice(start, end));
    idx = found + pattern.length;
    count++;
  }
  const body = 'BUCKET: ' + bucket + '\nFILE: ' + file + '\nLENGTH: ' + text.length + '\nPATTERN: ' + pattern + '\nMATCHES: ' + count + '\n\n' + results.join('\n\n');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
});
