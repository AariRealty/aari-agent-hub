// PRESERVED COPY, with two fixes already applied relative to deployed v21.
// Both audit_log inserts used an actor_type outside audit_log_actor_type_check
// ('realty_agent_provision' and 'finalize_join'), so every insert violated the constraint,
// was swallowed by its empty catch, and no row was ever written. Confirmed: zero rows for
// actions 'realty_agent_auto_join' and 'mentorship_public_signup_blocked', ever. Both now
// read 'system'. The empty catches are left as they were, deliberately, so this file stays
// a faithful record of the rest of v21; see the note in README.md about that pattern.
import { createClient } from 'jsr:@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const REALTY_RESEND_API_KEY = Deno.env.get('REALTY_RESEND_API_KEY') ?? ''
const REALTY_FROM = 'Aari Realty <onboarding@aarirealty.com>'
const HUB_URL = 'https://hub.joinaari.com'
const BROKER_EMAIL = 'marlenyi@aarirealty.com'
// SECRET REDACTED IN THIS PRESERVED COPY. v21 had the literal provision token here, and the
// same literal appears in realty-agent-join. Restoring must not restore the literal.
const PROVISION_TOKEN = Deno.env.get('PROVISION_TOKEN') ?? ''
// SECRET REDACTED. v21 had the literal manual provision key here, four lines below a comment
// claiming the key was known only to realty-provision-pending-agent.
const MANUAL_PROVISION_KEY = Deno.env.get('MANUAL_PROVISION_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const CORS: Record<string,string> = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' }
const PLAN_INFO: Record<string, { code: string; split: number }> = {
  'Mentorship Path': { code: '75_25', split: 0.75 },
  'Aari Growth': { code: '85_15', split: 0.85 },
  'Aari Max': { code: '100_max', split: 1.0 }
}
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type':'application/json' } }) }
function esc(x: string){ return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!)) }
function firstName(f: string){ return String(f ?? '').trim().split(/\s+/)[0] || '' }
function tempPassword(): string { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; const b = crypto.getRandomValues(new Uint8Array(14)); return Array.from(b).map((x) => a[x % a.length]).join('') }
function row(label: string, value: string, style?: string) { return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;"><span style="color:#888;">' + label + '</span><span style="color:#1a1a1a;font-weight:600;text-align:right;' + (style || '') + '">' + value + '</span></div>' }
const HEADER = '<div style="max-width:640px;margin:0 auto;background:#ffffff;font-family:\'Helvetica Neue\',Arial,sans-serif;"><div style="background:#0a0a0a;padding:32px;text-align:center;"><img src="https://joinaari.com/logo.png" alt="Aari Realty" style="height:48px;width:auto;filter:brightness(0)invert(1);" /></div><div style="padding:32px;">'
const FOOTER = '</div><div style="background:#0a0a0a;color:rgba(255,255,255,0.5);padding:24px 32px;text-align:center;font-size:11px;line-height:1.8;">Aari Realty LLC &middot; 9160 Forum Corporate Pkwy Suite 350, Fort Myers, FL 33905<br>(239) 688-1770 &middot; join@aarirealty.com</div></div>'
const SECTION = (title: string) => '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #0a0a0a;">' + title + '</div>'
async function sendEmail(to: string, subject: string, html: string){
  const useRealty = !!REALTY_RESEND_API_KEY
  const key = useRealty ? REALTY_RESEND_API_KEY : RESEND_API_KEY
  if(!key) return { ok:false }
  try {
    let FROM: string
    if (useRealty) {
      FROM = REALTY_FROM
    } else {
      const { data: cfg } = await admin.from('realty_config').select('value').eq('key','digest_from').maybeSingle()
      FROM = cfg?.value || 'Aari Realty <onboarding@aaritransactions.com>'
    }
    const r = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body: JSON.stringify({ from: FROM, to:[to], subject, html }) })
    return { ok: r.ok }
  } catch(_e){ return { ok:false } }
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error:'method_not_allowed' }, 405)
  const b = await req.json().catch(()=>({}))
  if (b?.token !== PROVISION_TOKEN) return json({ error:'forbidden' }, 403)
  const email = String(b?.email ?? '').trim().toLowerCase()
  const fullName = String(b?.full_name ?? '').trim()
  const license = String(b?.license_number ?? '').trim() || null
  const phone = String(b?.phone ?? '').trim() || null
  const planName = String(b?.plan ?? '').trim()
  const info = PLAN_INFO[planName] || null
  const planCode = info ? info.code : null
  const split = info ? info.split : null
  if (!email || !fullName) return json({ error:'email and full_name required' }, 400)
  if (planCode === '75_25' && b?.broker_key !== MANUAL_PROVISION_KEY) {
    try { await admin.from('audit_log').insert({ actor_id:null, actor_type:'system', action:'mentorship_public_signup_blocked', target_table:'realty_members', target_id:null, details:{ email, full_name: fullName, plan: planName } }) } catch(_e){ /* */ }
    await sendEmail(BROKER_EMAIL, 'Mentorship signup blocked — check for a Stripe charge', '<p>' + esc(fullName) + ' (' + esc(email) + ') attempted to join on Mentorship Path through the public/self-serve flow. This plan is broker-assigned only, so no account was created.</p><p><strong>If Stripe already charged this person, they paid and got nothing — check Stripe and either refund or provision them manually via the broker roster tool.</strong></p>')
    return json({ error:'mentorship_path_not_self_serve' }, 403)
  }

  const { data: existing } = await admin.from('realty_members').select('user_id').eq('email', email).maybeSingle()
  if (existing) return json({ ok:true, already_exists:true })

  const pw = tempPassword()
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password: pw, email_confirm:true, user_metadata:{ realty_member:true, full_name: fullName } })
  if (cErr || !created?.user) { await sendEmail(BROKER_EMAIL, 'Aari join, account creation failed', '<p>Payment finalized for '+esc(fullName)+' ('+esc(email)+') but the account could not be created: '+esc(cErr?.message||'unknown')+'. Create it manually.</p>'); return json({ error: cErr?.message || 'createUser failed' }, 500) }
  const uid = created.user.id
  const { error: mErr } = await admin.from('realty_members').insert({ user_id: uid, email, full_name: fullName, license_number: license, phone, role:'agent', status:'active', must_change_password:true, invited_at:new Date().toISOString(), activated_at:new Date().toISOString(), commission_plan: planCode, agent_split: split })
  if (mErr) { await admin.auth.admin.deleteUser(uid); await sendEmail(BROKER_EMAIL, 'Aari join, member record failed', '<p>'+esc(fullName)+' ('+esc(email)+') paid but the member record failed: '+esc(mErr.message)+'. Create manually.</p>'); return json({ error: mErr.message }, 500) }
  try { await admin.from('audit_log').insert({ actor_id:null, actor_type:'system', action:'realty_agent_auto_join', target_table:'realty_members', target_id: uid, details:{ email, full_name: fullName, plan: planName } }) } catch(_e){ /* */ }

  const first = firstName(fullName)
  const agentSubject = first ? 'You\'re in, ' + first + '. Here\'s your Aari Hub login.' : 'You\'re in. Here\'s your Aari Hub login.'
  const greeting = first ? 'You&rsquo;re in, ' + esc(first) + '.' : 'You&rsquo;re in.'
  const agentHtml = HEADER + '<p style="font-size:22px;font-weight:600;margin:0 0 10px;color:#1a1a1a;line-height:1.3;">' + greeting + '</p><p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">Your Agent Hub is ready when you are&hellip; here&rsquo;s how to get in.</p><div style="margin-bottom:28px;">' + SECTION('Your Login') + row('Email', esc(email)) + row('Temporary Password', esc(pw), 'font-size:15px;letter-spacing:1px;') + '</div><p style="font-size:14px;color:#888;line-height:1.7;margin:0 0 24px;">First time in, you&rsquo;ll set a new password (something you&rsquo;ll actually remember). Your signed agreement is on file, and a copy is already sitting in your inbox.</p><div style="text-align:center;margin:24px 0;"><a href="' + HUB_URL + '" style="background:#0a0a0a;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:14px 32px;border-radius:6px;display:inline-block;">Step into the Hub &rarr;</a></div><p style="font-size:14px;color:#555;line-height:1.7;margin:24px 0 0;">So glad you&rsquo;re here.</p>' + FOOTER
  const agentRes = await sendEmail(email, agentSubject, agentHtml)
  return json({ ok:true, user_id: uid, emailed_agent: agentRes.ok })
})
