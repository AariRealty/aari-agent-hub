// ============================================================================
// Aari Transactions · effective-date-confirm  (reply-based Emails 1 + 2, claim, reply reader)
// v16: warmer agent ack (Alex voice). v15: flagForReview writes tc_notifications row.
// v14: address street-only, Email 2 keyword CONFIRMED. v13: Email 2 drops loan app/survey/
// walk-through, bolds deposit+inspection, day counts, loan approval capped, overrides,
// no-inspection heads-up, preview_deadlines op.
//
// v17 · 7 September 2026 · AUTHENTICATION. verify_jwt is false on this function, so until
// now four of its operations took no credential at all and three of those reach real people:
//
//   preview_deadlines  sent the deadline email to the file's agent, or to any address the
//                      caller named in `to`. An anonymous open relay against real agents.
//   the default path   (a bare file_id) sent Email 1 to the file's agent. Nobody had noticed
//                      this one; it was not in the finding that prompted this change.
//   dupcheck           returned a file id, its property address and an agent's name to
//                      anyone who asked.
//
// Those three now require a caller: either a signed-in user or the service role. The TC
// portal already sends the signed-in TC's token through functions.invoke, so it is unaffected.
//
// Two operations are deliberately left as they were, and the reasons matter:
//
//   reply      is gated by effective_date_confirm_token, a per-file secret that only reaches
//              the agent by email. That is the correct gate for a path an email robot calls,
//              and it was already right.
//   heartbeat  is called by the Gmail Apps Script reply reader, which holds no credential
//              beyond the public anon key and cannot be updated from here. It writes one row
//              to system_pings and sends nothing. Leaving it open means an anonymous caller
//              can assert the reply reader is alive when it is not, which weakens a dead
//              man's switch; it does not reach anybody. It closes when that script can be
//              given a credential, and not before, because closing it first would silence
//              the reply reader instead of securing it.
//
// `to` on preview_deadlines is no longer free text. A preview goes to the caller's own
// address or to the file's agent, so the operation can still be previewed and can no longer
// be aimed.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <hello@aaritransactions.com>";
const REPLY_TO = "marlenyi@aarirealty.com";

const admin = createClient(SUPABASE_URL, SERVICE);
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" };

// The service role key arrives as a JWT carrying role=service_role. Read the claim rather
// than comparing the key string: the value in the vault and the value in the environment are
// not guaranteed to be the same string, and comparing them cost realty-heartbeat a 403
// against its own cron on first deploy.
function isServiceRole(token: string): boolean {
  if (!token) return false;
  if (token === SERVICE) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const pad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(pad + "=".repeat((4 - pad.length % 4) % 4)));
    return claims?.role === "service_role";
  } catch { return false; }
}

// A real signed-in person, or the service role. The public anon key is neither: it carries
// role=anon and resolves to no user, which is exactly the caller these operations were open
// to before.
async function caller(req: Request): Promise<{ ok: true; user_id: string | null; email: string | null } | { ok: false }> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return { ok: false };
  if (isServiceRole(token)) return { ok: true, user_id: null, email: null };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false };
  return { ok: true, user_id: data.user.id, email: data.user.email ?? null };
}

const P = 'font-size:15px;line-height:1.55;margin:0 0 18px';
const DIS = 'font-size:12.5px;color:#6b6b6b;line-height:1.55;margin:14px 0 0';
const FOOT = 'font-size:12px;color:#6b6b6b;line-height:1.7;margin:20px 0 0;padding-top:16px;border-top:1px solid #eee';
const ACT = 'background:#f5f0e8;border-radius:10px;padding:15px 18px;margin:4px 0 6px';
const LEAD = 'font-size:15px;font-weight:700;margin:0 0 6px';
const KW = 'background:#0f0f0f;color:#ffffff;border-radius:6px;padding:1px 9px';
const ALT = 'font-size:13px;color:#5f5e5a;line-height:1.5;margin:0';
const FMT = 'display:inline-block;background:#ffffff;border:1px solid #e0dbce;border-radius:6px;padding:1px 7px;font-family:ui-monospace,Menlo,monospace;font-size:13px';
const DEFSTYLE = 'font-size:12.5px;color:#6b6b6b;line-height:1.55;margin:0 0 18px';
const REFSTYLE = 'font-size:10px;color:#cfc9bd;margin:12px 0 0';
const METAL = 'font-size:11px;letter-spacing:0.04em;color:#9b9591;white-space:nowrap;margin-left:14px';
const WRAP = '<div style="font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;max-width:500px;margin:0 auto;color:#0f0f0f;padding:8px 0">';
const FOOTER = '<div style="' + FOOT + '">Aari Transactions · 239.688.1770</div>';
const DISCLAIMER = '<p style="' + DIS + '">Your coordinator also reviews every date for accuracy, so you\'re covered either way. If anything looks off, just reply here and we\'ll take care of it.</p>';
const DEF_LINK = "https://aaritransactions.com/contract-guide.html";

function esc(s: string){ return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmtDate(iso: string | null){ if(!iso) return ""; const d = new Date(String(iso).slice(0,10) + "T12:00:00Z"); if(isNaN(d.getTime())) return String(iso); return d.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric", timeZone:"UTC" }); }
function fmtShort(d: Date){ return d.toLocaleDateString("en-US", { month:"short", day:"numeric", timeZone:"UTC" }); }
function mdyFromIso(iso: string | null){ if(!iso) return "07/15/2026"; const p = String(iso).slice(0,10).split("-"); return p.length===3 ? (p[1] + "/" + p[2] + "/" + p[0]) : "07/15/2026"; }
function shortAddr(a: string | null){ const s = String(a || "").split(",")[0].trim(); return s || "your file"; }
function norm(s: string){ return String(s || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim(); }
function refLine(token: string){ return '<div style="' + REFSTYLE + '">Ref ED-' + esc(token) + '</div>'; }
function defBlock(){ return '<p style="' + DEFSTYLE + '">New to this? Your effective date is the day the fully signed contract was delivered to everyone, which is not always the day it was signed. <a href="' + DEF_LINK + '" style="color:#8a6d1b;font-weight:600;text-decoration:underline">Here is the 30 second version.</a></p>'; }
function dayCount(date: Date, today: Date){ const n = Math.round((date.getTime()-today.getTime())/86400000); if(n<0){ const a=Math.abs(n); return a + (a===1?" day ago":" days ago"); } if(n===0) return "today"; return "in " + n + (n===1?" day":" days"); }

const NEG = /\b(off|wrong|no|nope|not|isn'?t|isnt|aren'?t|incorrect|change|changed|fix|correction|bad|issue|mistake|error|different|later|delay|delayed|revise|update)\b/;
const AFFIRM = /\b(yes|yep|yup|yeah|ya|correct|confirm|confirmed|confirming|right|good|perfect|great|approve|approved|ok|okay|looks good|look good|looks right|all good)\b/;
function hasNeg(t: string){ return NEG.test(t); }
function hasAffirm(t: string){ return AFFIRM.test(t); }

const FED_HOLIDAYS = new Set(["2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25","2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18","2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24"]);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function flBusinessDay(d: Date){ const x = new Date(d.getTime()); for(let i=0;i<10;i++){ const day = x.getUTCDay(); if(day!==0 && day!==6 && !FED_HOLIDAYS.has(ymd(x))) return x; x.setUTCDate(x.getUTCDate()+1); } return x; }
const addDays = (b: Date, n: number) => { const d = new Date(b.getTime()); d.setUTCDate(d.getUTCDate()+n); return d; };
const parseD = (s: string | null) => { if(!s) return null; const d = new Date(String(s).slice(0,10) + "T12:00:00Z"); return isNaN(d.getTime()) ? null : d; };
const DEADLINE_DEFS = [
  { key:"emd_initial", label:"Initial deposit due", from:"effective", offset:3 },
  { key:"loan_app", label:"Loan application due", from:"effective", offset:5 },
  { key:"emd_additional", label:"Additional deposit due", from:"effective", offset:10 },
  { key:"inspection_end", label:"Inspection period ends", from:"effective", offset:15 },
  { key:"loan_approval", label:"Loan approval deadline", from:"effective", offset:30 },
  { key:"title_commitment", label:"Title commitment deadline", from:"closing", offset:-15 },
  { key:"estoppel", label:"Estoppel letter deadline", from:"closing", offset:-10 },
  { key:"survey", label:"Survey deadline", from:"closing", offset:-5 },
  { key:"walkthrough", label:"Walk-through", from:"closing", offset:-1 },
];
// deno-lint-ignore no-explicit-any
function fileDeadlines(file: any){
  const eff = parseD(file.effective_date); const close = parseD(file.closing_date);
  const ovRaw = (file.deadline_overrides && typeof file.deadline_overrides === "object") ? file.deadline_overrides : {};
  const ovDates = (ovRaw._dates && typeof ovRaw._dates === "object") ? ovRaw._dates : {};
  const ov = (k: string) => ovDates[k] || ovRaw[k] || null;
  const hasHOA = !!(file.logistics && (file.logistics.assoc_type || file.logistics.hoa || file.logistics.hoa_name));
  const rfd = (file.raw_form_data && typeof file.raw_form_data === "object") ? file.raw_form_data : {};
  const fo = (rfd.field_overrides && typeof rfd.field_overrides === "object") ? rfd.field_overrides : {};
  const addlRaw = String(fo.additional_deposit || rfd.additional_deposit || "").replace(/[^0-9.]/g, "");
  const hasAddl = (parseFloat(addlRaw) > 0) || !!ov("emd_additional");
  const out: { key: string; label: string; date: Date }[] = [];
  for(const def of DEADLINE_DEFS){
    if(def.key === "estoppel" && !hasHOA) continue;
    if(def.key === "emd_additional" && !hasAddl) continue;
    const o = ov(def.key);
    if(o){ const od = parseD(o); if(od){ out.push({ key:def.key, label:def.label, date:od }); continue; } }
    const base = def.from === "effective" ? eff : close; if(!base) continue;
    let d = flBusinessDay(addDays(base, def.offset));
    if(def.key === "loan_approval" && close){ const cap = flBusinessDay(addDays(close, -10)); if(cap.getTime() < d.getTime()) d = cap; }
    out.push({ key:def.key, label:def.label, date: d });
  }
  out.sort((a,b)=>a.date.getTime()-b.date.getTime());
  return out;
}
const HIDE = new Set(["loan_app","survey","walkthrough"]);
const BOLD = new Set(["emd_initial","inspection_end"]);

function htmlPage(inner: string, status = 200){ const doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#faf8f4;font-family:-apple-system,Arial,sans-serif;color:#0f0f0f"><div style="max-width:440px;margin:0 auto;padding:40px 18px"><div style="background:#fff;border:0.5px solid #ece8e0;border-radius:16px;overflow:hidden">' + inner + '</div><p style="text-align:center;font-size:11px;color:#a39e95;margin-top:16px">Aari Transactions</p></div></body></html>'; return new Response(doc, { status, headers: { ...cors, "Content-Type":"text/html; charset=utf-8" } }); }
function okPage(title: string, msg: string){ return htmlPage('<div style="padding:34px 26px;text-align:center"><div style="width:52px;height:52px;border-radius:50%;background:#eef3ea;border:1.5px solid #cfe0c6;color:#3e7d57;font-size:26px;line-height:50px;margin:0 auto 16px">&#10003;</div><div style="font-size:20px;font-weight:700;margin:0 0 10px">' + esc(title) + '</div><p style="font-size:13.5px;color:#5f5e5a">' + esc(msg) + '</p></div>'); }
function errPage(){ return htmlPage('<div style="padding:34px 26px;text-align:center"><div style="font-size:18px;font-weight:700;margin:0 0 8px">Link not recognized</div><p style="font-size:13.5px;color:#5f5e5a">This link is not valid or has expired. Reply to your Aari email and we\'ll sort it out.</p></div>', 404); }

async function fileByToken(token: string){ const { data } = await admin.from("files").select("id, property_address, effective_date, effective_date_confirmed_at, effective_date_confirm_token, closing_date, agent_id, assigned_tc_id, deadline_overrides, logistics, deadlines_confirmed_at").eq("effective_date_confirm_token", token).maybeSingle(); return data; }

// deno-lint-ignore no-explicit-any
async function flagForReview(f: any, reason: string, text: string){
  try {
    const lg = (f.logistics && typeof f.logistics === "object") ? f.logistics : {};
    lg.reply_review = { reason, text: String(text || "").slice(0, 500), at: new Date().toISOString() };
    await admin.from("files").update({ logistics: lg }).eq("id", f.id);
  } catch(e){ console.error("[edc] flag update failed", e); }
  try {
    await admin.from("tc_notifications").insert({
      recipient_id: f.assigned_tc_id || null,
      file_id: f.id,
      kind: "reply_review",
      title: "Agent flagged a date · " + shortAddr(f.property_address),
      body: String(text || "").slice(0, 300)
    });
  } catch(e){ console.error("[edc] notif insert failed", e); }
  try {
    if(!f.assigned_tc_id) return;
    const { data: tc } = await admin.from("agents").select("first_name, email").eq("id", f.assigned_tc_id).maybeSingle();
    if(!tc?.email) return;
    const addr = esc(shortAddr(f.property_address));
    const html = WRAP +
      '<p style="' + P + '">Hi ' + esc(tc.first_name || "there") + ', an agent reply on <b>' + addr + '</b> needs your eyes.</p>' +
      '<p style="' + P + '">They did not reply with a clean confirmation, so nothing was changed automatically.</p>' +
      '<div style="' + ACT + '"><p style="' + ALT + '">Their reply:</p><p style="' + LEAD + ';margin:4px 0 0">' + esc(String(text || "").slice(0, 300)) + '</p></div>' +
      '<p style="' + P + '">Open the file, confirm the correct dates, and update it.</p>' + FOOTER + '</div>';
    await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":"Bearer "+RESEND_KEY, "Content-Type":"application/json" }, body: JSON.stringify({ from:FROM, to:[tc.email], reply_to:REPLY_TO, subject:"Reply needs your review · " + shortAddr(f.property_address), html }) });
  } catch(e){ console.error("[edc] TC review email failed", e); }
}

// deno-lint-ignore no-explicit-any
async function sendAgentAck(f: any){
  try {
    if(!f.agent_id) return;
    const { data: agent } = await admin.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle();
    if(!agent?.email) return;
    const addr = esc(shortAddr(f.property_address));
    const html = WRAP +
      '<p style="' + P + '">Hi ' + esc(agent.first_name || "there") + ',</p>' +
      '<p style="' + P + '">You&rsquo;re all set! &#127881;</p>' +
      '<p style="' + P + '">Your timeline for <b>' + addr + '</b> is locked in, and your coordinator has everything.</p>' +
      '<p style="' + P + '">From here, we watch every date for you.</p>' +
      '<p style="' + P + '">You&rsquo;ll hear from us as each one gets close&hellip; nothing for you to chase.</p>' +
      '<p style="' + P + '">Talk soon,</p><p style="' + P + '">Marlenyi</p>' + FOOTER + '</div>';
    await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":"Bearer "+RESEND_KEY, "Content-Type":"application/json" }, body: JSON.stringify({ from:FROM, to:[agent.email], reply_to:REPLY_TO, subject:"You're all set ✨ · " + shortAddr(f.property_address), html }) });
  } catch(e){ console.error("[edc] agent ack failed", e); }
}

// deno-lint-ignore no-explicit-any
async function sendDeadlineEmail(f: any, toOverride?: string){
  try {
    let toEmail = toOverride || ""; let firstName = "there";
    if(f.agent_id){ const { data: agent } = await admin.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle(); if(agent){ firstName = agent.first_name || "there"; if(!toEmail) toEmail = agent.email || ""; } }
    if(!toEmail) return;
    const noInspection = !!((f.logistics && f.logistics.inspection_waived) || (f.raw_form_data && f.raw_form_data.inspection_waived));
    const all = fileDeadlines(f);
    const dls = all.filter(d => !HIDE.has(d.key) && !(noInspection && d.key === "inspection_end"));
    if(!dls.length) return;
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const rows = dls.map(d => {
      const bold = BOLD.has(d.key) ? 700 : 400;
      const label = esc(d.label) + " · " + esc(fmtShort(d.date));
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-top:0.5px solid #f0ebe0"><span style="font-size:14px;color:#0f0f0f;font-weight:' + bold + '">' + label + '</span><span style="' + METAL + '">' + esc(dayCount(d.date, today)) + '</span></div>';
    }).join("");
    const addr = esc(shortAddr(f.property_address));
    const inspNote = noInspection
      ? '<p style="' + P + '">&#9888;&#65039; No inspection period on this one. It&rsquo;s AS IS with inspection waived, so there&rsquo;s no window to cancel for condition. Keep that front of mind.</p>'
      : "";
    const focus = noInspection
      ? '<p style="' + P + '">Keep your eye on that deposit&hellip; that&rsquo;s the one that moves right away.</p>'
      : '<p style="' + P + '">Keep your eye on that deposit and the inspection window&hellip; those two move the deal.</p>';
    const emailHtml = WRAP +
      '<p style="' + P + '">Hi ' + esc(firstName) + ',</p>' +
      '<p style="' + P + '">Your effective date is locked in! &#127881;</p>' +
      '<p style="' + P + '">Here&rsquo;s your timeline for <b>' + addr + '</b>:</p>' +
      '<div style="background:#faf9f5;border:1px solid #ece8e0;border-radius:10px;padding:2px 16px;margin:6px 0 18px">' + rows + '</div>' +
      inspNote + focus +
      '<p style="' + P + '">Reply <b>CONFIRMED</b> and we&rsquo;re set.</p>' +
      '<p style="' + P + '">A date looks off? Just reply with the fix.</p>' +
      '<p style="' + P + '">Talk soon,</p><p style="' + P + '">Marlenyi</p>' + FOOTER + refLine(f.effective_date_confirm_token) + '</div>';
    await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":"Bearer "+RESEND_KEY, "Content-Type":"application/json" }, body: JSON.stringify({ from:FROM, to:[toEmail], reply_to:REPLY_TO, subject:"Your timeline is set ✨ · " + shortAddr(f.property_address), html: emailHtml }) });
  } catch(e){ console.error("[edc] deadline email failed", e); }
}

Deno.serve(async (req) => {
  if(req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if(req.method === "POST"){
    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return json(400, { ok:false, error:"bad json" }); }

    // Open on purpose. Writes one row, sends nothing. See the header note.
    if(body && body.op === "heartbeat"){
      try { await admin.from("system_pings").upsert({ name:"reply_reader", last_at: new Date().toISOString() }); } catch(_){}
      return json(200, { ok:true });
    }

    // Gated on purpose: this one emails a real agent.
    if(body && body.op === "preview_deadlines"){
      const who = await caller(req);
      if(!who.ok) return json(401, { ok:false, error:"unauthorized", detail:"preview_deadlines sends an email to a real person, so it needs a signed-in caller. The public anon key is not one." });
      const { data: pf } = await admin.from("files").select("id, property_address, agent_id, effective_date, closing_date, deadline_overrides, logistics, effective_date_confirm_token, raw_form_data").eq("id", String(body.file_id || "")).maybeSingle();
      if(!pf) return json(404, { ok:false, error:"file not found" });
      // A preview goes to the person asking for it, or to the file's own agent. It is not a
      // free text destination, because that made this an open relay for anyone who could
      // reach the function.
      let to: string | undefined = undefined;
      if(body.to){
        const wanted = String(body.to).trim().toLowerCase();
        const self = String(who.email || "").trim().toLowerCase();
        if(!self || wanted !== self) return json(403, { ok:false, error:"to_not_allowed", detail:"A preview can only be sent to your own address or to the file's agent. Omit `to` to send it to the agent." });
        to = String(body.to);
      }
      await sendDeadlineEmail(pf, to);
      return json(200, { ok:true, preview:true });
    }

    // Gated on purpose: this returns a file id, an address and an agent's name.
    if(body && body.op === "dupcheck"){
      const who = await caller(req);
      if(!who.ok) return json(401, { ok:false, error:"unauthorized", detail:"dupcheck returns file and agent details, so it needs a signed-in caller." });
      const address = String(body.address || "").trim(); const excl = String(body.exclude_id || ""); const ft = body.file_type ? String(body.file_type) : null;
      if(!address) return json(200, { duplicate: null });
      const key = norm(address);
      const firstTok = key.split(" ")[0] || "";
      let q = admin.from("files").select("id, property_address, agent_id, created_at, file_type, status, logistics").neq("id", excl);
      if(firstTok && firstTok.length >= 2) q = q.ilike("property_address", "%" + firstTok + "%");
      const { data: rows } = await q;
      // deno-lint-ignore no-explicit-any
      const dup = (rows || []).find((r: any) => r.status !== "archived" && String((r.logistics && r.logistics.archived) || "") !== "true" && norm(r.property_address) === key && (!ft || String(r.file_type || "sale") === ft));
      if(!dup) return json(200, { duplicate: null });
      const { data: ag } = await admin.from("agents").select("first_name, last_name").eq("id", dup.agent_id).maybeSingle();
      const agentName = ag ? ((ag.first_name || "") + " " + (ag.last_name || "")).trim() : "an agent";
      return json(200, { duplicate: { id: dup.id, property_address: dup.property_address, agent_name: agentName, created_at: dup.created_at } });
    }

    // Left as it was: gated by the per-file token that only reaches the agent by email.
    if(body && body.op === "reply"){
      const ref = String(body.ref || "").trim();
      const text = String(body.text || "");
      if(!ref) return json(400, { ok:false, error:"no ref" });
      const f = await fileByToken(ref);
      if(!f) return json(404, { ok:false, error:"file not found" });
      const t = text.toLowerCase();
      const dm = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const isoFromDm = dm ? (dm[3] + "-" + String(dm[1]).padStart(2,"0") + "-" + String(dm[2]).padStart(2,"0")) : null;

      if(!f.effective_date_confirmed_at){
        const curIso = f.effective_date ? String(f.effective_date).slice(0,10) : null;
        if(isoFromDm){
          if(hasAffirm(t) && curIso && isoFromDm !== curIso){
            await flagForReview(f, "affirm_with_conflicting_date", text);
            return json(200, { ok:false, action:"needs_review", reason:"affirm_with_conflicting_date" });
          }
          await admin.from("files").update({ effective_date: isoFromDm, effective_date_confirmed_at: new Date().toISOString() }).eq("id", f.id);
          await sendDeadlineEmail({ ...f, effective_date: isoFromDm });
          return json(200, { ok:true, action:"effective_date_set", date: isoFromDm });
        }
        if(hasAffirm(t) && !hasNeg(t)){
          await admin.from("files").update({ effective_date_confirmed_at: new Date().toISOString() }).eq("id", f.id);
          await sendDeadlineEmail(f);
          return json(200, { ok:true, action:"effective_date_confirmed" });
        }
        await flagForReview(f, "unclear_effective_reply", text);
        return json(200, { ok:false, action:"needs_review", reason:"unclear_effective_reply" });
      }

      if(!f.deadlines_confirmed_at){
        if(isoFromDm || hasNeg(t)){
          await flagForReview(f, "deadline_change", text);
          return json(200, { ok:false, action:"needs_review", reason:"deadline_change" });
        }
        if(hasAffirm(t)){
          await admin.from("files").update({ deadlines_confirmed_at: new Date().toISOString() }).eq("id", f.id);
          await sendAgentAck(f);
          return json(200, { ok:true, action:"deadlines_confirmed" });
        }
        await flagForReview(f, "unclear_deadline_reply", text);
        return json(200, { ok:false, action:"needs_review", reason:"unclear_deadline_reply" });
      }
      return json(200, { ok:true, action:"already_confirmed" });
    }

    // The default path. It sends Email 1 to the file's agent and took no credential at all,
    // which was not in the finding that prompted this change and is the same defect.
    if(!body || !body.file_id) return json(400, { ok:false, error:"file_id required" });
    const who = await caller(req);
    if(!who.ok) return json(401, { ok:false, error:"unauthorized", detail:"This sends an email to a real agent, so it needs a signed-in caller. The public anon key is not one." });
    const { data: f } = await admin.from("files").select("id, property_address, agent_id, assigned_tc_id, effective_date, effective_date_confirm_token, effective_date_confirmed_at").eq("id", body.file_id).maybeSingle();
    if(!f) return json(404, { ok:false, error:"file not found" });
    if(f.effective_date_confirmed_at) return json(200, { ok:true, skipped:"already_confirmed" });
    const { data: agent } = await admin.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle();
    if(!agent?.email) return json(422, { ok:false, error:"agent has no email" });
    let tcName = "";
    if(f.assigned_tc_id){ const { data: tcp } = await admin.from("agents").select("first_name").eq("id", f.assigned_tc_id).maybeSingle(); tcName = String(tcp?.first_name || "").trim(); }
    const addr = esc(shortAddr(f.property_address));
    const dateB = f.effective_date ? ('<b>' + esc(fmtDate(f.effective_date)) + '</b>') : "the date on your contract";
    const exDate = mdyFromIso(f.effective_date);
    const greet = esc(agent.first_name || "there");
    const claimedBy = esc(String((body.claimed_by || "")).trim());
    const firstNm = claimedBy ? claimedBy.split(" ")[0] : "";
    const onit = claimedBy
      ? '<p style="' + P + '"><b>' + claimedBy + '</b> just picked up your file and is already on it.</p>'
      : '<p style="' + P + '">' + (tcName ? esc(tcName) + ' is on your file and already working it.' : 'We are on your file and already working it.') + '</p>';
    const intro = '<p style="' + P + '">Hi ' + greet + ',</p>' +
      '<p style="' + P + '">Congrats on <b>' + addr + '</b>! &#127881;</p>' + onit +
      '<p style="' + P + '">Okay&hellip; one quick thing, and it&rsquo;s the important one.</p>' +
      '<p style="' + P + '">Every deadline we track runs off your effective date.</p>' +
      '<p style="' + P + '">Here is the date we have for you: ' + dateB + '.</p>' +
      '<p style="' + P + '">If that&rsquo;s your effective date, reply <b>YES</b> and I&rsquo;ll lock your whole timeline to it.</p>' +
      '<p style="' + P + '">If it should be a different day, just reply that date, like <span style="' + FMT + '">' + exDate + '</span>.</p>';
    const emailHtml = WRAP + intro + defBlock() +
      '<p style="' + P + '">Talk soon,</p><p style="' + P + '">Marlenyi</p>' +
      FOOTER + refLine(f.effective_date_confirm_token) + '</div>';
    const subject = claimedBy ? (firstNm + " is on your file · confirm your effective date") : ("Your file is in 🎉 · " + shortAddr(f.property_address));
    const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":"Bearer "+RESEND_KEY, "Content-Type":"application/json" }, body: JSON.stringify({ from:FROM, to:[agent.email], reply_to:REPLY_TO, subject, html: emailHtml }) });
    if(!r.ok){ const tt = await r.text(); return json(500, { ok:false, error:"resend_failed", detail: tt.slice(0,200) }); }
    return json(200, { ok:true, sent:true });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t") || ""; const action = url.searchParams.get("a") || "confirm";
  if(!token) return errPage();
  const f = await fileByToken(token);
  if(!f) return errPage();
  if(action === "confirmdeadlines"){ if(!f.deadlines_confirmed_at){ await admin.from("files").update({ deadlines_confirmed_at: new Date().toISOString() }).eq("effective_date_confirm_token", token); } return okPage("Deadlines confirmed", "Your schedule is locked in. Your coordinator has it."); }
  if(action === "deadlines_issue") return okPage("Let us fix it", "Reply to your Aari email with the date that looks off and your coordinator will correct it.");
  if(action === "setdate"){ const d = url.searchParams.get("d") || ""; if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return errPage(); const was = !!f.effective_date_confirmed_at; await admin.from("files").update({ effective_date: d, effective_date_confirmed_at: new Date().toISOString() }).eq("effective_date_confirm_token", token); if(!was){ await sendDeadlineEmail({ ...f, effective_date: d }); } return okPage("Effective date confirmed", "Your deadline schedule is on its way to your inbox."); }
  if(!f.effective_date_confirmed_at){ await admin.from("files").update({ effective_date_confirmed_at: new Date().toISOString() }).eq("effective_date_confirm_token", token); await sendDeadlineEmail(f); }
  return okPage("Effective date confirmed", "Your deadline schedule is on its way to your inbox.");
});

function json(status: number, body: unknown){ return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type":"application/json" } }); }
