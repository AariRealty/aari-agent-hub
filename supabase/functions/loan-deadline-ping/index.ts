// loan-deadline-ping · daily 8am Eastern SMS escalation for the loan approval deadline,
// the one deadline that can kill a deal (FAR/BAR Day 30 from Effective).
//
// 7 September 2026. Authentication added, and the force bypass closed.
//
// This function had no authentication of any kind. Its only gate was an hour check, and
// { "force": true } skipped that, so anyone who knew the URL could make the brokerage send
// SMS to its coordinators and to the broker, at any hour. It is partly self limiting, because
// loan_ping_last_sent_at stops a second burst the same day, but the first burst was real.
//
// It now requires the shared cron secret, compared in constant time, on every call including
// the scheduled one. force still exists, because testing needs it, but it is behind the same
// gate as everything else rather than in front of it.
//
// This file is also the first copy of this function that has ever existed in a repository.
// It was deployed from here, so from now on it is reviewable and revertible like anything else.
//
// Cron fires daily 12:00 and 13:00 UTC with :10 retry sweeps; the America/New_York hour gate
// below only lets a run proceed at 8am ET, which is DST proof.
//
// SMS goes to the assigned TC's phone. No assigned TC, or a TC with no phone, sends to the
// broker instead. Dedup is loan_ping_last_sent_at, max one ping per file per ET day, stamped
// only AFTER a successful send so a Twilio failure leaves the file unstamped for the retry.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---- FL deadline math · mirrors /js/deadline-engine.js (keep in sync) ----
const FED_HOLIDAYS = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19","2026-07-03",
  "2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18","2027-07-05",
  "2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
]);
const ymd = (d: Date) => d.toLocaleDateString("en-CA");
function flBusinessDay(d: Date): Date {
  const x = new Date(d.getTime());
  for (let i = 0; i < 10; i++) {
    const day = x.getDay();
    if (day !== 0 && day !== 6 && !FED_HOLIDAYS.has(ymd(x))) return x;
    x.setDate(x.getDate() + 1);
  }
  return x;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base.getTime()); d.setDate(d.getDate() + n); return d;
}
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? null : d;
}

// ---- time helpers (America/New_York) ----
function nyHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })
    .formatToParts(new Date());
  return parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
}
function nyToday(): Date {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setHours(0, 0, 0, 0);
  return et;
}
const nyDayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

// deno-lint-ignore no-explicit-any
function isActiveSaleFile(f: any): boolean {
  if ((f.file_type || "sale") !== "sale") return false;
  if (["closed", "cancelled", "archived"].includes(f.status)) return false;
  if (f.transaction_stage === "closed") return false;
  return true;
}
// Cash detection · mirrors isCashFile in files.html (keep in sync).
// deno-lint-ignore no-explicit-any
function isCashFile(f: any): boolean {
  const raw = (f.raw_form_data && typeof f.raw_form_data === "object") ? f.raw_form_data : {};
  if (raw.lender_is_cash === "1" || raw.lender_is_cash === 1 || raw.lender_is_cash === true) return true;
  if (raw.financing_type === "cash" || raw.cash_offer === "yes") return true;
  if (!f.lender_contact && !raw.lender_name && !raw.pa_lender) return true;
  return false;
}

const fmtD = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) { console.error("[loan-ping] Twilio env missing"); return false; }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    });
    if (!res.ok) { console.error("[loan-ping] Twilio", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("[loan-ping] Twilio fetch failed", e);
    return false;
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // Authentication first, before the hour gate, before force, before anything reads a file.
  const { data: cfg } = await supabaseAdmin.from("realty_config").select("value").eq("key", "digest_cron_secret").maybeSingle();
  const secret = String(cfg?.value ?? "");
  if (!secret) {
    return json({ ok: false, error: "cron_secret_not_configured",
      detail: "realty_config.digest_cron_secret is not set. This function sends SMS to coordinators and to the broker, so it sends nothing without a way to tell a real caller from anyone else." }, 503);
  }
  if (!sameSecret(req.headers.get("x-aari-cron") ?? "", secret)) return json({ ok: false, error: "unauthorized" }, 401);

  let force = false;
  try { const b = await req.json(); force = !!b?.force; } catch { /* cron sends {} */ }

  const hour = nyHour();
  if (!force && hour !== 8) {
    return json({ ok: true, skipped: "outside_window", ny_hour: hour });
  }

  const today = nyToday();
  const dayKey = nyDayKey();

  const { data: files, error: fErr } = await supabaseAdmin
    .from("files")
    .select("id, property_address, file_type, status, transaction_stage, effective_date, closing_date, deadline_overrides, logistics, loan_approval_confirmed, loan_ping_last_sent_at, assigned_tc_id, raw_form_data, lender_contact")
    .not("status", "in", '("closed","cancelled","archived")');
  if (fErr) return json({ ok: false, error: fErr.message }, 500);

  const { data: brokers } = await supabaseAdmin
    .from("agents").select("phone").eq("role", "broker").not("phone", "is", null);
  const brokerPhones = (brokers ?? []).map(b => b.phone as string).filter(Boolean);

  const tcPhones: Record<string, string | null> = {};
  const results: Record<string, string> = {};
  let sent = 0, failed = 0;

  for (const f of files ?? []) {
    if (!isActiveSaleFile(f)) continue;
    if (isCashFile(f)) continue; // no loan, no ping

    const lg = (f.logistics && typeof f.logistics === "object") ? f.logistics : {};
    if (lg.loan_approval_status === "approved" || f.loan_approval_confirmed) continue;

    const ov = (f.deadline_overrides && typeof f.deadline_overrides === "object") ? f.deadline_overrides : {};
    let dl = parseDate(ov.loan_approval ?? null);
    if (!dl) {
      const eff = parseDate(f.effective_date ? String(f.effective_date).slice(0, 10) : null);
      if (!eff) continue;
      dl = flBusinessDay(addDays(eff, 30));
    }
    dl.setHours(0, 0, 0, 0);
    const days = Math.round((dl.getTime() - today.getTime()) / 86400000);

    let action: string | null = null;
    if (days === 5) action = "Push the lender daily.";
    else if (days === 3) action = "Escalate now.";
    else if (days === 1 || days === 0) action = "Confirm written approval today.";
    else if (days < 0) action = "Buyer written notice required today.";
    if (!action) continue;

    if (f.loan_ping_last_sent_at &&
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(f.loan_ping_last_sent_at)) === dayKey) {
      results[f.id] = "deduped"; continue;
    }

    const street = (f.property_address || "Untitled file").split(",")[0].trim();
    const when = days < 0
      ? `passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago (${fmtD(dl)})`
      : days === 0 ? `is TODAY (${fmtD(dl)})`
      : `in ${days} day${days === 1 ? "" : "s"} (${fmtD(dl)})`;
    const body = `Aari · ${street} — loan approval deadline ${when}. ${action}`;

    let phones: string[] = [];
    if (f.assigned_tc_id) {
      if (!(f.assigned_tc_id in tcPhones)) {
        const { data: tc } = await supabaseAdmin
          .from("agents").select("phone").eq("id", f.assigned_tc_id).single();
        tcPhones[f.assigned_tc_id] = tc?.phone ?? null;
      }
      const p = tcPhones[f.assigned_tc_id];
      if (p) phones = [p];
    }
    if (!phones.length) phones = brokerPhones;

    if (!phones.length) { results[f.id] = "no_recipient"; failed++; continue; }

    let okAll = true;
    for (const p of phones) {
      const ok = await sendSms(p, body);
      if (!ok) okAll = false;
    }

    if (okAll) {
      await supabaseAdmin.from("files")
        .update({ loan_ping_last_sent_at: new Date().toISOString() })
        .eq("id", f.id);
      results[f.id] = `sent_${days}d`;
      sent++;
    } else {
      results[f.id] = "sms_failed";
      failed++;
    }
  }

  return json({ ok: true, sent, failed, results });
});
