// books-sync · reads closed deals out of SkySlope Books for the company.
//
// What it returns is the whole company commission book: per deal gross commission,
// company net, and per agent payout. There is no role check anywhere in this function
// and there never was. The shared token was the only control, and until 7 September 2026
// that token was a literal on line 5 of this file, which meant it also travelled inside
// hub_payload.html to every agent's browser. The literal is gone. The design is not fixed
// by that: whoever holds the token still gets the whole book, so the token is the
// authorisation boundary and must be treated as one.
//
// The secret now comes from BOOKS_SYNC_TOKEN in the edge function environment. There is no
// default and no fallback. Unset means this function refuses every request and says why,
// the same shape as the web signing token and hub-file-io.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN_URL = "https://id.skyslope.com/oauth2/aush1zfdxi1sIfBms4x7/v1/token";
const API = "https://books.skyslope.com/api";
const SCOPES = "books.deals.read books.ledgers.read books.agents.read books.offices.read";
const SYNC_TOKEN = Deno.env.get("BOOKS_SYNC_TOKEN") ?? "";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-sync-token, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o, null, 1), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

async function getToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: Deno.env.get("SKYSLOPE_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("SKYSLOPE_API_KEY") ?? "",
    scope: SCOPES,
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const t = await r.text();
  if (!r.ok) throw new Error("token " + r.status + ": " + t);
  return JSON.parse(t).access_token;
}

async function api(path: string, token: string, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
    const t = await r.text();
    let b: unknown;
    try { b = JSON.parse(t); } catch { b = t; }
    if (r.status !== 429) return { status: r.status, body: b };
    await sleep(1500 * (i + 1));
  }
  return { status: 429, body: "rate_limited" };
}

// Constant time compare, because the presented value is attacker controlled and this is
// the only gate the function has.
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!SYNC_TOKEN) {
      return json({
        error: "books_sync_token_not_configured",
        detail: "BOOKS_SYNC_TOKEN is not set in the edge function environment. This function returns the company commission book and will not serve a request without it. Set the secret to the value newly issued in SkySlope Books, never to the value that was previously a literal in this file.",
      }, 503);
    }
    if (!sameSecret(req.headers.get("x-sync-token") ?? "", SYNC_TOKEN)) return json({ error: "unauthorized" }, 401);

    const url = new URL(req.url);
    const startDate = url.searchParams.get("start_date") || "2026-01-01";
    const endDate = url.searchParams.get("end_date") || new Date().toISOString().slice(0, 10);
    const token = await getToken();
    const access = await api("/access-mapping/v1?limit=100", token);
    // deno-lint-ignore no-explicit-any
    const companyId = (((access.body as any)?.canAccess) || [])[0]?.companyId ?? null;
    if (!companyId) return json({ error: "no company access" });
    const d = await api("/deals/v1?companyId=" + encodeURIComponent(companyId) + "&closeDateStart=" + startDate + "&closeDateEnd=" + endDate + "&limit=100", token);
    // deno-lint-ignore no-explicit-any
    const arr = (d.body as any)?.deals || (d.body as any)?.data || [];
    const deals: unknown[] = [];
    for (const dl of arr) {
      const id = String(dl.dealId ?? dl.id ?? dl.deal_id ?? "");
      const calc = dl.dealCalculation || {};
      const gross = round2(Number(calc.grossCommission) || 0);
      const companyNet = round2(Number(calc.companyNet) || 0);
      const dealExpenses = round2(Number(calc.dealExpenses?.total) || 0);
      await sleep(800);
      const dd = await api("/deal-detail/v1?companyId=" + encodeURIComponent(companyId) + "&dealId=" + encodeURIComponent(id), token);
      // deno-lint-ignore no-explicit-any
      const agentsRaw = (dd.body as any)?.agents || [];
      let agentPayout = 0;
      const agentNames: string[] = [];
      for (const a of agentsRaw) { agentPayout += Number(a.agentCalculation?.agentNet) || 0; if (a.agentName) agentNames.push(a.agentName); }
      agentPayout = round2(agentPayout);
      const detailOk = dd.status === 200;
      const reconciles = detailOk && dealExpenses === 0;
      const flagReason = !detailOk ? "detail unavailable" : (dealExpenses > 0 ? "has a referral/deal expense of $" + dealExpenses + " — verify net" : "");
      deals.push({ dealId: id, name: dl.dealName, address: dl.dealAddress, close: dl.closeDate, propertyClass: dl.propertyClass, type: dl.type, agent: agentNames.join(", "), gross, income: companyNet, expense: agentPayout, dealExpenses, reconciles, flagReason });
    }
    return json({ ok: true, companyId, count: deals.length, generatedAt: new Date().toISOString(), deals });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
