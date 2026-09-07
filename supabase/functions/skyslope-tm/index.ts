// SkySlope Transaction Management connector. Custom auth via x-sync-token (no JWT).
//
// The sync token used to be a literal in this file. This function proxies the live SkySlope
// credentials and returns real transaction data, so the literal was a second route to the
// commission book, independent of the SkySlope Books token. Rotating the Books token does
// not close this one. It now comes from the environment with no default: unset means this
// function refuses every request and says why, rather than falling back to something a
// public repository once contained.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const SYNC_TOKEN = Deno.env.get("SKYSLOPE_TM_SYNC_TOKEN") ?? "";
const BASE = "https://api.skyslope.com";
const env = (k: string) => Deno.env.get(k) || "";

// Length-independent comparison, so a caller cannot learn the token one byte at a time.
function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacB64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  let bin = ""; const b = new Uint8Array(sig); for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}
function rfc3339(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); }

async function authHeader() {
  const cid = env("SKYSLOPE_TM_CLIENT_ID"), csec = env("SKYSLOPE_TM_CLIENT_SECRET"), ak = env("SKYSLOPE_TM_ACCESS_KEY"), asec = env("SKYSLOPE_TM_ACCESS_SECRET");
  if (!cid || !csec || !ak || !asec) throw new Error("Missing SkySlope TM secrets. Set SKYSLOPE_TM_CLIENT_ID, SKYSLOPE_TM_CLIENT_SECRET, SKYSLOPE_TM_ACCESS_KEY, SKYSLOPE_TM_ACCESS_SECRET in Edge Function secrets.");
  const ts = rfc3339();
  const hmac = await hmacB64(asec, `${cid}:${csec}:${ts}`);
  return { ts, header: `SS ${ak}:${hmac}`, cid, csec };
}
async function login() {
  const a = await authHeader();
  const res = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": a.header, "Timestamp": a.ts }, body: JSON.stringify({ clientID: a.cid, clientSecret: a.csec }) });
  const txt = await res.text();
  let j: any; try { j = JSON.parse(txt); } catch { throw new Error("Login response not JSON (" + res.status + "): " + txt.slice(0, 200)); }
  if (!res.ok || !j.Session) throw new Error("Login failed (" + res.status + "): " + txt.slice(0, 200));
  return j;
}
function parseBulk(txt: string): any[] {
  try { return JSON.parse("[" + txt.trim().replace(/,\s*$/, "") + "]"); } catch { /* fallthrough */ }
  const out: any[] = [];
  txt.split(/\},\s*\n?/).forEach((chunk) => { chunk = chunk.trim(); if (!chunk) return; if (!chunk.endsWith("}")) chunk += "}"; try { out.push(JSON.parse(chunk)); } catch { /* skip */ } });
  return out;
}
function norm(f: any) {
  const g = (...ks: string[]) => { for (const k of ks) { if (f[k] != null && f[k] !== "") return f[k]; } return ""; };
  const stage = f.stage && typeof f.stage === "object" ? (f.stage.name || f.stage.stage || "") : (f.stage || "");
  return {
    type: f.saleGuid ? "sale" : (f.listingGuid ? "listing" : (g("dealType") || "")),
    address: g("propertyAddress", "address", "streetAddress") || (f.property && (f.property.address || f.property.streetAddress)) || "",
    status: g("status"),
    checklist: g("checklistType"),
    stage: stage,
    close: g("actualClosingDate", "escrowClosingDate", "expirationDate", "contractAcceptedDate"),
    agent: (f.agent && (f.agent.name || ((f.agent.firstName || "") + " " + (f.agent.lastName || "")).trim())) || g("agentName", "listingAgent") || ""
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const J = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  if (!SYNC_TOKEN) {
    return J({ error: "sync_token_not_configured",
               detail: "SKYSLOPE_TM_SYNC_TOKEN is not set on this project. This connector returns live transaction data, so it refuses every request until a freshly generated value is set in the Edge Function secrets. The value that used to be compiled into this function is in git history and must not be reused." }, 503);
  }
  if (!sameSecret(req.headers.get("x-sync-token") ?? "", SYNC_TOKEN)) return J({ error: "unauthorized" }, 401);
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all";
    const type = url.searchParams.get("type") || "sale,listing";
    const sess = await login();
    const res = await fetch(`${BASE}/api/files?status=${encodeURIComponent(status)}&type=${encodeURIComponent(type)}`, { headers: { "Content-Type": "application/json", "Session": sess.Session } });
    const txt = await res.text();
    if (!res.ok) return J({ error: "files fetch failed (" + res.status + ")", detail: txt.slice(0, 300) }, 502);
    const raw = parseBulk(txt);
    const files = raw.map(norm);
    const byStatus: Record<string, number> = {};
    files.forEach((f) => { const s = (f.status || "unknown").toString().toLowerCase(); byStatus[s] = (byStatus[s] || 0) + 1; });
    return J({ ok: true, generatedAt: new Date().toISOString(), expiration: sess.Expiration, count: files.length, byStatus, files, sample: raw[0] || null });
  } catch (e) { return J({ error: String((e && (e as any).message) || e) }); }
});
