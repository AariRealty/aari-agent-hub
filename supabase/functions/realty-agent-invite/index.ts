// realty-agent-invite · send one agent their Hub login, on the broker pressing a
// button and never on its own.
//
// realty-agent-welcome already does something close, but it sends two emails
// and the first one says the agent's Independent Contractor Agreement is
// signed and on file. For the people who need inviting that is not true: they
// have an account with no password and no signature against the current ICA.
// Telling someone in writing that they have signed something they have not is
// not a rough edge, so this sends the login email alone and says nothing about
// an agreement. The ICA gate asks them for it when they arrive.
//
// Broker only, checked against realty_members on every call, same shape as
// realty-provision-pending-agent. Nothing here runs on a schedule.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const RESEND = Deno.env.get('REALTY_RESEND_API_KEY') ?? ''
const HUB_URL = 'https://aari-agent-hub.netlify.app'
const FROM = 'Aari Realty <onboarding@aarirealty.com>'
const REPLY = 'marlenyi@aarirealty.com'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
function esc(s: string) { return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string)) }
function firstName(f: string) { return String(f || '').trim().split(/\s+/)[0] || 'there' }

// Ambiguous characters are left out of the alphabet on purpose: this password
// gets read off a screen and typed by hand, so no O next to 0 and no l next to 1.
function tempPassword(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const b = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(b).map((x) => a[x % a.length]).join('')
}

async function audit(actorId: string, action: string, targetId: string | null, details: Record<string, unknown>, req: Request) {
  try {
    await admin.from('audit_log').insert({
      actor_id: actorId, actor_type: 'realty_broker', action,
      target_table: 'realty_members', target_id: targetId, details,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent') || null,
    })
  } catch (_e) { /* an invite that sent must not fail on its audit row */ }
}

const TOP = `<div style="background:#141210;padding:18px 30px"><div style="font-family:Fraunces,Georgia,serif;font-weight:600;font-size:20px;color:#fff;letter-spacing:-.3px">Aari Realty</div><div style="font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#a59d90;font-weight:600;margin-top:2px">Florida Licensed Brokerage</div></div>`
const FOOT = `<div style="text-align:center;padding:18px;font-size:11px;color:#a7a29a;line-height:1.6">Aari Realty LLC, Florida Licensed Real Estate Brokerage<br>Broker of Record: Marlenyi L. Paredes, License BK3530153</div>`
function loginHtml(first: string, email: string, pw: string) {
  const body = `<div style="padding:34px 30px 4px"><div style="font-size:10px;letter-spacing:2.2px;text-transform:uppercase;color:#b0a06a;font-weight:700">Your hub is ready</div><div style="font-family:Fraunces,Georgia,serif;font-weight:600;font-size:32px;line-height:1.02;letter-spacing:-.6px;color:#141210;margin:12px 0 0">Let's get you <span style="font-style:italic;font-weight:500">inside</span>, ${esc(first)}.</div><div style="font-family:Fraunces,Georgia,serif;font-style:italic;font-weight:500;font-size:18px;color:#8a7f6a;margin:10px 0 0;line-height:1.3">No badge to wait for. No gatekeeper.</div></div><div style="font-size:15px;line-height:1.62;color:#4a453d;padding:18px 30px 0">Your Agent Hub is live. Sign in below, set your own password on the way in, and have a look around. Your transactions, your split, your training and the brokerage calendar are all in there.</div><div style="margin:16px 30px 0;border:1px solid #eceae4;border-radius:14px;padding:20px 22px"><div style="background:#f5f1e8;border-left:3px solid #141210;border-radius:8px;padding:12px 16px;font-size:13.5px;color:#2a2620;line-height:1.9"><div><span style="color:#8a857c">Email:</span> ${esc(email)}</div><div><span style="color:#8a857c">Temporary password:</span> <span style="font-size:16px;font-weight:700;letter-spacing:1px;color:#141210">${esc(pw)}</span></div></div><a href="${HUB_URL}" style="display:inline-block;background:#141210;color:#fff;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;padding:14px 28px;border-radius:50px;margin-top:16px">Sign in to your hub</a><div style="font-size:11.5px;color:#a89f8e;margin-top:14px">This account is yours. Don't share it. Change your password the second you land.</div></div>`
  return `<div style="margin:0;background:#f2f1ef;padding:24px 12px;font-family:Inter,Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #eceae4;border-radius:18px;overflow:hidden">${TOP}${body}<div style="padding:24px 30px 30px;font-size:14px;color:#4a453d;line-height:1.6">See you inside.<br><br><span style="font-family:Fraunces,Georgia,serif;font-weight:600;color:#141210;font-size:16px">Marlenyi Paredes</span><br><span style="color:#8a857c;font-size:12.5px">Qualifying Broker, Aari Realty LLC</span></div></div>${FOOT}</div>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)
    const { data: caller } = await admin.from('realty_members').select('user_id, role, status').eq('user_id', user.id).maybeSingle()
    if (!caller || caller.role !== 'broker' || caller.status !== 'active') {
      await audit(user.id, 'realty_agent_invite_denied', user.id, { role: caller?.role ?? 'none' }, req)
      return json({ error: 'forbidden' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const userId = String(body?.user_id ?? '').trim()
    const preview = body?.preview === true
    if (!userId) return json({ error: 'user_id required' }, 400)

    // Addressed by user_id, not by an email typed into the page. The email the
    // invite goes to is the one on the roster row, which is the same address
    // the account signs in with, so a wrong address in a button cannot send an
    // invite somewhere the account does not exist.
    const { data: m } = await admin.from('realty_members')
      .select('user_id, full_name, email, role, status').eq('user_id', userId).maybeSingle()
    if (!m) return json({ error: 'no roster member with that id' }, 404)
    if (m.status !== 'active') return json({ error: 'that member is ' + m.status + ', reactivate them first' }, 400)
    if (m.role === 'broker') return json({ error: 'the broker does not need an invite' }, 400)
    if (!m.email) return json({ error: 'that roster row has no email on it' }, 400)
    if (!RESEND) return json({ error: 'REALTY_RESEND_API_KEY not set, no email would be sent' }, 500)

    const pw = tempPassword()
    if (!preview) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(m.user_id, { password: pw, email_confirm: true })
      if (pwErr) return json({ error: 'could not set the password: ' + pwErr.message }, 500)
      await admin.from('realty_members').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('user_id', m.user_id)
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [m.email], reply_to: REPLY,
        subject: 'Your keys to the Aari hub are inside.',
        html: loginHtml(firstName(m.full_name), m.email, preview ? 'SAMPLE-Kd7mPq2wRxT9' : pw),
      }),
    })
    const rj = await r.json().catch(() => ({}))

    // The password is already changed by this point. Saying the email sent when
    // it did not would leave the broker thinking the agent had been invited
    // while their old password had quietly stopped working.
    if (!r.ok) {
      await audit(user.id, 'realty_agent_invite_email_failed', m.user_id, { email: m.email, detail: rj }, req)
      return json({ ok: false, emailed: false, password_changed: !preview, error: 'the password was reset but the email did not send: ' + JSON.stringify(rj).slice(0, 200) }, 502)
    }

    if (!preview) await audit(user.id, 'realty_agent_invite_sent', m.user_id, { email: m.email }, req)
    return json({ ok: true, emailed: true, preview, email: m.email, full_name: m.full_name, message_id: (rj as { id?: string }).id ?? null })
  } catch (e) { return json({ error: String((e as Error)?.message || e) }, 500) }
})
