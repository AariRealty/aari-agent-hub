// PRESERVED SOURCE. hotfix-broker-module-2026-08-12 as deployed, version 1,
// deployed once on 12 August 2026 and never redeployed. Retired 7 September 2026;
// the live function now returns 410.
//
// WHY IT EXISTED. On 12 August broker_module.html shipped with a missing catch
// clause and an unclosed function, so hub.joinaari.com served a blank page to the
// broker. This was written to push a corrected file into the realty-hub bucket
// without waiting for anything else.
//
// WHY IT IS RETIRED. It is well made for what it is: it requires an active
// broker, refuses any filename but broker_module.html, refuses a body under 1000
// bytes or one missing the expected marker and closing tag, backs up the current
// file before overwriting, and writes an audit row. None of that is the problem.
//
// The problem is that it is a standing ability to overwrite the file every broker
// loads, built for one afternoon and still live three weeks later. Well built is
// not the same as should exist. hub-file-io covers the same need through a
// reviewable path with a rotatable credential.
//
// It also carried the swallowing catch this project keeps producing: catch (_e)
// with an empty body around its own audit write, so a failed audit left no trace
// of a file overwrite. That is fixed in the tombstone by there being nothing to
// audit, and it is recorded here because the pattern is the finding.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } }) }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user }, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !user) return json({ error: 'unauthorized' }, 401)
  const { data: member } = await admin.from('realty_members').select('user_id, role, status').eq('user_id', user.id).maybeSingle()
  if (!member || member.status !== 'active' || member.role !== 'broker') return json({ error: 'forbidden' }, 403)

  const filename = req.headers.get('x-hotfix-filename') || ''
  if (filename !== 'broker_module.html') return json({ error: 'unexpected_filename' }, 400)

  const body = await req.text()
  if (!body || body.length < 1000) return json({ error: 'body_too_small' }, 400)
  if (!body.includes('<!--AARI_BROKER_MODULE-->') || !body.trim().endsWith('</script>')) return json({ error: 'body_shape_unexpected' }, 400)

  // Backup current live file before overwriting
  const { data: current } = await admin.storage.from('realty-hub').download(filename)
  if (current) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await admin.storage.from('realty-hub').upload(`broker_module.html.BACKUP-${stamp}`, current, { contentType: 'text/html', upsert: false })
  }

  const { error: upErr } = await admin.storage.from('realty-hub').upload(filename, body, { contentType: 'text/html', upsert: true })
  if (upErr) return json({ error: upErr.message }, 500)

  try {
    await admin.from('audit_log').insert({ actor_id: user.id, actor_type: 'realty_member', action: 'hotfix_broker_module_deployed', target_table: 'storage.realty-hub', target_id: filename, details: { reason: 'missing catch clause + unclosed function caused SyntaxError: Missing catch or finally after try, blank page on hub.joinaari.com', new_length: body.length }, ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, user_agent: req.headers.get('user-agent') || null })
  } catch (_e) { /* non-fatal */ }

  return json({ ok: true, filename, length: body.length, backed_up: !!current })
})
