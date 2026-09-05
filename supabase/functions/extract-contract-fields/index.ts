// ============================================================================
// Aari Transactions · extract-contract-fields
// ============================================================================
// FREE contract field extraction. No AI, no per-file cost. Reads the PDF text
// layer with pdf.js, rebuilds page lines by position, then pattern-matches the
// standard FR/BAR "AS IS" fields. It NEVER writes a confirmed value; output is a
// draft the TC confirms in the Contract terms + Parties steppers.
//
// v16 · also derives files.client_type (buyer/seller) from the Paragraph 19 broker
// block. See sideFromContract below for why and how.
//
// v18 · 5 September 2026 · write extraction_attempted_at before reading the PDF,
// so a parse that succeeds and a write that fails stops presenting as a file
// that was never read. See the attempt marker block in the handler.
//
// v17 · 5 September 2026 · strip C0 control characters from every matched field.
// A PDF text layer can carry a NUL, and this function passed it straight into a
// field value. Postgres cannot store U+0000 in jsonb, so the files update was
// rejected and the handler turned that into a 500 with "Draft save failed:
// unsupported Unicode escape sequence". Two of four real FR/BAR packets failed
// that way on 5 September, each losing a complete and correct extraction of 25
// fields and three or four split sub documents. See NULL-BYTE-FIX.md.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = Deno.env.get("AARI_CONTRACT_BUCKET") ?? "transaction-files";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// A PDF text layer is not guaranteed to be printable. NUL and the other C0
// controls arrive intact from pdf.js and travel through every regex here
// untouched, because none of them match \s or a character class that excludes
// them. Tab, newline and carriage return are deliberately kept: they are legal
// in jsonb and a legal description occasionally carries one.
function stripCtl(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

async function pdfToPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(bytes);
  const TOL = 5;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as any[])
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str, w: it.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: any[] }[] = [];
    for (const it of items) {
      let row = rows.find((r) => Math.abs(r.y - it.y) <= TOL);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    const out: string[] = [];
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let line = "", lastEnd: number | null = null;
      for (const it of row.items) {
        if (lastEnd != null) {
          const gap = it.x - lastEnd;
          if (gap > 6) line += "  "; else if (line && !/\s$/.test(line)) line += " ";
        }
        line += it.s; lastEnd = it.x + (it.w || it.s.length * 4);
      }
      out.push(line);
    }
    pages.push(out.join("\n"));
  }
  return pages;
}

function detectDocuments(pages: string[]): { title: string; page: number; pages: number }[] {
  // ORDER MATTERS. Specific document types are tested BEFORE the generic "Contract"
  // rule, because riders and addenda carry the contract's own name in their title
  // ("Comprehensive Rider to the Residential Contract For Sale And Purchase", "FHA/VA
  // Financing Addendum to the Contract ..."). Testing Contract first stamped every such
  // page as a second Contract (one live packet came out with pages 14-18 as "Contract").
  const rules = [
    { re: /Comprehensive Rider|Rider to the .{0,40}Contract|\bRider\b.{0,25}Contract For Sale/i, title: "Rider" },
    { re: /Financing Addendum|FHA\/?VA|FHA Amendatory|Amendatory Clause|Appraisal Contingency|Inspection Addendum|Permits?\s+Addendum|Open Permit|Association Addendum|Condominium Addendum|HOA Addendum|Escalation Addendum|Seller Financing Addendum|Addendum to (the )?(Sale|Purchase|Contract)|Addendum\s*No\.?|Addendum\s*#/i, title: "Addendum" },
    { re: /Compensation Agreement|Broker Compensation|Regarding.{0,25}Compensation|Cooperating Broker Compensation/i, title: "Compensation" },
    { re: /AS[\s-]?IS.{0,8}Residential Contract For Sale|Vacant Land Contract|Commercial Contract|Residential Contract For Sale And Purchase/i, title: "Contract" },
  ];
  const docs: { title: string; page: number; pages: number }[] = [];
  pages.forEach((pg, i) => {
    const top = pg.split("\n").slice(0, 18).join(" ");
    for (const r of rules) {
      if (r.re.test(top)) {
        if (!docs.length || docs[docs.length - 1].title !== r.title) docs.push({ title: r.title, page: i + 1, pages: 0 });
        break;
      }
    }
  });
  for (let k = 0; k < docs.length; k++) docs[k].pages = (k < docs.length - 1 ? docs[k + 1].page : pages.length + 1) - docs[k].page;
  return docs;
}

function parseContract(T: string): Record<string, string> {
  const lines = T.split("\n");
  const out: Record<string, string> = {};
  const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
  const stripNum = (s: string) => clean(s).replace(/^\d+:?\d*\s+/, "");
  const findLine = (re: RegExp) => { for (const l of lines) if (re.test(l)) return l; return ""; };
  const findIdx = (re: RegExp) => { for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };

  const head = lines.slice(0, 24).join(" ");
  let ct = "";
  if (/AS[\s-]?IS[\s"”']{0,3}Residential Contract For Sale/i.test(head) || /"AS IS"/i.test(head)) ct = "AS IS Residential";
  else if (/Vacant Land Contract/i.test(head)) ct = "Vacant Land";
  else if (/Commercial Contract/i.test(head)) ct = "Commercial";
  else if (/Residential Lease|Lease Agreement|Lease For|Residential Contract For Lease/i.test(head)) ct = "Lease";
  else if (/Residential Contract For Sale And Purchase|Contract For Sale And Purchase/i.test(head)) ct = "Standard Residential";
  if (ct) out.contract_type = ct;

  const reBuyer = /([A-Za-z0-9][^:"“”]{1,90}?)\s*\(\s*["“]?Buyer["”]?\s*\)/i;
  const reSeller = /([A-Za-z0-9][^:"“”]{1,90}?)\s*\(\s*["“]?Seller["”]?\s*\)/i;
  const partyName = (role: string): string => {
    const re = role === "Buyer" ? reBuyer : reSeller;
    for (const l of lines.slice(0, 12)) {
      const m = l.match(re);
      if (m) {
        const n = clean(m[1]).replace(/^.*?\)\s*and\s+/i, "").replace(/^PARTIES:\s*/i, "").replace(/^and\s+/i, "").replace(/_+/g, "").trim();
        if (n && n.length >= 2 && !/^(and|the|parties)$/i.test(n)) return n;
      }
    }
    return "";
  };
  if (/AS IS Residential|Standard Residential/i.test(ct) || !ct) {
    const bl = findLine(/\(\s*["“]?Buyer/);
    if (bl) out.buyer = stripNum(bl.replace(/\(\s*["“]?Buyer.*/, "")).replace(/^and\s+/i, "").replace(/_+/g, "").trim();
    const sl = findLine(/\(\s*["“]?Seller/);
    if (sl) out.seller = stripNum(sl.replace(/\(\s*["“]?Seller.*/, "")).replace(/^PARTIES:\s*/i, "").replace(/_+/g, "").trim();
  }
  if (!out.buyer) out.buyer = partyName("Buyer");
  if (!out.seller) out.seller = partyName("Seller");

  const al = findLine(/Street address, city, zip:/);
  if (al) out.address = clean(al.split(/zip:\s*/i)[1]);
  if (!out.address) { for (const l of lines.slice(0, 14)) { if (/Escrow/i.test(l)) continue; const am2 = l.match(/Address:\s*(.+?[A-Z]{2}\s+\d{5})/); if (am2) { out.address = clean(am2[1]).replace(/_+/g, "").trim(); break; } } }
  if (out.address) {
    const m = out.address.match(/^(.*?)[, ]+([A-Z]{2})\s+(\d{5})\b/);
    if (m) {
      out.state = m[2]; out.zip = m[3];
      const kc = (out.address.match(/(Cape Coral|Fort Myers|Lehigh Acres|North Fort Myers|Bonita Springs|Estero|Naples|Punta Gorda|Marco Island|Sanibel|Babcock Ranch)/i) || [])[0];
      if (kc) { out.city = kc; out.street = clean(m[1].slice(0, m[1].toLowerCase().lastIndexOf(kc.toLowerCase()))).replace(/[, ]+$/, ""); }
      else out.street = clean(m[1]);
    }
  }

  const tm = T.match(/\b\d{2}-\d{2}-\d{2}-[A-Za-z0-9]{2}-\d{4,5}\.\d{3,4}\b/);
  if (tm) out.tax_id = tm[0];
  const bi = findIdx(/Located in:/);
  if (bi >= 0) {
    const lb = lines[bi];
    const m = lb.match(/Located in:\s*([A-Za-z][\w .'-]{1,18}?)\s+County,\s*Florida/);
    if (m && !/_/.test(m[1])) out.county = clean(m[1]);
    if (!out.county) { const after = (lb.split(/Tax ID #:\s*/i)[1] || ""); const am = after.match(/^\s*([A-Za-z][A-Za-z .'-]{1,18}?)\b/); if (am) out.county = clean(am[1]); }
    if (!out.county && bi > 0) { const ab = stripNum(lines[bi - 1]); if (/^[A-Za-z .'-]{2,20}$/.test(ab)) out.county = ab; }
  }
  if (!out.county) { const cm = T.match(/\bof\s+([A-Za-z][A-Za-z .'-]{1,18}?)\s+County,\s*Florida/i); if (cm) out.county = clean(cm[1]); }
  const ll = findLine(/legal description is/i);
  if (ll) out.legal = clean(ll.split(/legal description is\s*/i)[1]).replace(/\s+together with.*/i, "");
  if (!out.legal) { const lgl = findLine(/Legal Description:/i); if (lgl) out.legal = clean((lgl.split(/Legal Description:\s*/i)[1] || "")).replace(/_+/g, "").trim(); }

  const dollar = (l: string) => {
    const c = clean(l);
    const m = c.match(/([\d,]+\.\d{2})/g);
    if (m) return m[m.length - 1];
    const w = c.match(/\$\s*([\d,]{4,})/);
    return w ? w[1] : "";
  };
  out.price = dollar(findLine(/2\.\s*PURCHASE PRICE/));
  if (!out.price) out.price = dollar(findLine(/Purchase Price/i));
  out.emd = dollar(findLine(/Initial deposit to be held/));
  if (!out.emd) out.emd = dollar(findLine(/Initial deposit/i));
  out.loan_amount = dollar(findLine(/\(c\)\s*Financing:/));
  out.balance_to_close = dollar(findLine(/transfer or other Collected funds/i));
  out.additional_deposit = dollar(findLine(/Additional deposit/i));

  out.flag_home_warranty = /home warranty/i.test(T) ? "yes" : "";
  out.flag_turnkey = (/\bturn[\s-]?key\b/i.test(T) || /conveyed[^.]{0,60}furnishings/i.test(T)) ? "yes" : "";

  // Financing program · asserted ONLY on a strong signal (a financing addendum or explicit
  // program text). Conventional and Cash are deliberately left blank for the TC to confirm,
  // because the checkbox layer is not reliable text and a wrong program misinforms title + lender.
  if (/USDA|Rural Development/i.test(T)) out.financing_type = "usda";
  else if (/Department of Veterans Affairs|VA Financing Addendum|\bVA\b[^.\n]{0,40}(Amendatory|Financing|Loan|Guarant)/i.test(T)) out.financing_type = "va";
  else if (/FHA\/?VA Financing Addendum|FHA Amendatory|FHA[^.\n]{0,40}(Financing|Addendum|Loan|Insured)/i.test(T)) out.financing_type = "fha";

  // Date fragment matches BOTH "July 12, 2025" and DocuSign's "7/12/2025" (M/D/YYYY).
  const DATE_FRAG = "[A-Z][a-z]+ \\d{1,2}, \\d{4}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}";
  const DATE_RE = new RegExp(DATE_FRAG);
  const ci = findIdx(/Closing shall occur on/);
  if (ci >= 0) for (let k = ci - 2; k <= ci + 1; k++) { if (k < 0 || k >= lines.length) continue; const m = clean(lines[k]).match(DATE_RE); if (m) { out.closing_date = m[0]; break; } }
  if (!out.closing_date) { const cl = findLine(/will close on/i); if (cl) { const cmd = clean(cl).match(DATE_RE); if (cmd) out.closing_date = cmd[0]; } }

  // Effective date = latest party signature date. Only emit when EVERY dated-looking
  // signature line (one carrying a "Date:" field) is actually dated; if a signer left
  // the date blank, leave it blank for the TC to confirm rather than emit a too-early date.
  const sigDateRe = new RegExp("Date:\\s*(" + DATE_FRAG + ")");
  const sig: string[] = [];
  let sigBlocks = 0, sigDated = 0;
  for (const l of lines) {
    const s = stripNum(l);
    if (/^(Buyer|Seller):/.test(s) && /Date:/.test(s)) {
      sigBlocks++;
      const m = s.match(sigDateRe);
      if (m) { sigDated++; sig.push(m[1]); }
    }
  }
  if (sig.length && sigDated === sigBlocks) {
    const ds = sig.map((d) => ({ d, t: Date.parse(d) })).filter((x) => !isNaN(x.t)).sort((a, b) => b.t - a.t);
    if (ds.length) out.effective_date = ds[0].d;
  }

  const ei = findIdx(/Escrow Agent Name:/);
  let nm = "";
  if (ei >= 0) {
    const same = lines[ei].split(/Escrow Agent Name:\s*/i)[1];
    if (same && clean(same).replace(/_/g, "").trim()) nm = clean(same).replace(/_/g, "").trim();
    if (!nm) for (let k = ei - 1; k >= ei - 2 && k >= 0; k--) { const c = stripNum(lines[k]).replace(/_/g, "").trim(); if (c && !/CHECK ONE|accompanies|deposit/i.test(c)) { nm = c; break; } }
  }
  out.title_name = nm;
  if (!out.title_name) { const en = findLine(/Escrow Agent'?s? Name:/i); if (en) out.title_name = clean((en.split(/Name:\s*/i)[1] || "")).replace(/_+/g, "").trim(); }
  // Title / closing agent email + phone must come from the ESCROW block, never the first
  // match in the whole document. The first phone (and often the first email) in a contract
  // is a party's or an agent's, not the closing agent's. One live file pulled the wrong
  // title phone exactly that way.
  const adIdx = findIdx(/Address:.*Phone:/i);
  const adL = adIdx >= 0 ? lines[adIdx] : "";
  if (adL) { const m = adL.match(/Address:\s*([^_].*?)\s*Phone:/i); if (m) out.title_address = clean(m[1]).replace(/_+/g, "").trim(); }
  // The escrow block spans from the Escrow Agent Name line to just past the Address/Phone line.
  const _anchors = [ei, adIdx].filter((x) => x >= 0);
  const _bs = _anchors.length ? Math.min(..._anchors) : -1;
  const _be = _anchors.length ? Math.max(..._anchors) + 3 : -1;
  const block = _bs >= 0 ? lines.slice(_bs, _be + 1).join("\n") : "";
  // Phone · prefer the value LABELED "Phone:" on the closing agent's line, else any phone
  // inside the escrow block. Never the whole document.
  let tph = "";
  if (adL) { const pm = adL.match(/Phone:\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i); if (pm) tph = clean(pm[1]); }
  if (!tph && block) { const pm2 = block.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/); if (pm2) tph = pm2[0]; }
  if (tph) out.title_phone = tph;
  // Email · scoped to the escrow block; fall back to the first document email ONLY when the
  // block has none (some layouts place it just outside, and a contract usually has one email).
  let tem = "";
  if (block) { const bm = block.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/); if (bm) tem = bm[0]; }
  if (!tem) { const em = T.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/); if (em) tem = em[0]; }
  if (tem) out.title_email = tem;

  // Paragraph 19 BROKER block · Cooperating = buyer side, Listing = seller side.
  const cols = (line: string) => line.split(/_{3,}/).map((s) => clean(s))
    .filter((s) => s.length > 2 && /[A-Za-z]/.test(s) && !/^\d+$/.test(s) && !/Sales Associate|Cooperating|Listing|if any|^Broker$/i.test(s));
  const sa = findIdx(/Cooperating Sales Associate/i);
  if (sa > 0) { const n = cols(lines[sa - 1]); if (n[0]) out.buyer_agent = n[0]; if (n[1]) out.seller_agent = n[1]; }
  const brI = findIdx(/Cooperating Broker, if any/i);
  if (brI > 0) { const b = cols(lines[brI - 1]); if (b[0]) out.buyer_brokerage = b[0]; if (b[1]) out.seller_brokerage = b[1]; }

  // Strip control characters LAST, so every matcher above has seen the text as
  // pdf.js produced it and only the stored value is cleaned. A field that was
  // nothing but control characters becomes empty here and is then dropped by
  // the same rule that drops every other empty field.
  for (const k of Object.keys(out)) {
    if (out[k]) out[k] = stripCtl(out[k]);
    if (!out[k]) delete out[k];
  }
  return out;
}

// ===== Which side are WE on? · derived from Paragraph 19, not guessed =====
// The contract already tells us: Cooperating Sales Associate = buyer side, Listing = seller side,
// and parseContract lifts both into buyer_agent / seller_agent. Nothing was ever mapping that to
// files.client_type, so imported files stayed untagged forever (the questionnaire asks, but email
// and SkySlope imports never do). Match OUR agent against the two names and the side falls out.
//
// Real shapes this has to survive, taken from live files:
//   a name with a license number appended after a slash
//   a name with a stray leading column number from the PDF grid
//   a name with a suffix such as PA
//   a brokerage name landing in the agent column (parser glitch), which simply
//   fails to match a person, and that is fine
function normName(s: unknown): string {
  return String(s ?? "")
    .split("/")[0]
    .replace(/\d+/g, " ")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length < 5 || b.length < 5) return false;
  return a === b || a.includes(b) || b.includes(a);
}
// Returns 'buyer' | 'seller' | null. Null whenever it is ambiguous. An unset side is a visible
// gap the coordinator can fix, a WRONG side silently files the deal under the wrong workflow.
function sideFromContract(agentName: string, fields: Record<string, string>): string | null {
  const me = normName(agentName);
  if (!me) return null;
  const inBuyer = nameMatches(me, normName(fields.buyer_agent));
  const inSeller = nameMatches(me, normName(fields.seller_agent));
  if (inBuyer && !inSeller) return "buyer";
  if (inSeller && !inBuyer) return "seller";
  return null;
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { file_id?: string; pdf_base64?: string; contract_path?: string; write?: boolean };
  try { body = await req.json(); } catch { return j(400, { ok: false, error: "Invalid JSON" }); }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let bytes: Uint8Array | null = null;
  let file: any = null;
  let attemptMarked = false;
  let attemptError: string | null = null;

  if (body.pdf_base64) {
    bytes = Uint8Array.from(atob(body.pdf_base64), (c) => c.charCodeAt(0));
  } else if (body.file_id) {
    const { data: f, error } = await admin.from("files").select("id, raw_form_data, logistics, client_type, agent_id").eq("id", body.file_id).maybeSingle();
    if (error) return j(500, { ok: false, error: "File lookup failed: " + error.message });
    if (!f) return j(404, { ok: false, error: "File not found" });
    file = f;
    const path = body.contract_path
      || f.raw_form_data?.contract_path || f.raw_form_data?.contract_file || f.raw_form_data?.contract_url || f.raw_form_data?.executed_contract_path;
    if (!path) return j(422, { ok: false, error: "No contract path on file (raw_form_data.contract_path)" });
    // ===== The attempt marker ===================================================
    // Written HERE: after we know there is a contract to read, and before the
    // download, so it cannot fail for the reason the real write fails. At this
    // point the payload is one timestamp. A NUL in a party name rejects the
    // extraction write; it cannot reject this, because no PDF text exists yet.
    //
    // It is what lets the screen tell three states apart instead of two:
    //   no marker, no extraction   never put through the extractor
    //   marker, no extraction      read was attempted and the result was lost
    //   extraction present         extracted, the marker is just the last try
    //
    // Same shape as flags_at, which the Contracts screen already uses to tell
    // "nothing was evaluated" from "nothing was found". It sits before the
    // download on purpose: a missing or unreadable object is a failed attempt
    // too, and used to present as a file nobody had ever run.
    //
    // Deliberately NOT before the no-contract-path return above. A file with no
    // contract on it has not been attempted and never run is the truth there.
    if (body.write !== false && file) {
      const attemptRaw = Object.assign({}, file.raw_form_data || {});
      attemptRaw.extraction_attempted_at = new Date().toISOString();
      const { error: aErr } = await admin.from("files").update({ raw_form_data: attemptRaw }).eq("id", body.file_id);
      if (aErr) attemptError = aErr.message;
      else { attemptMarked = true; file.raw_form_data = attemptRaw; }
    }

    const key = String(path).replace(/^.*\/transaction-files\//, "").replace(/^\/+/, "");
    const dl = await admin.storage.from(BUCKET).download(key);
    if (dl.error) return j(422, { ok: false, error: "Contract download failed: " + dl.error.message, attempt_marked: attemptMarked, attempt_error: attemptError });
    bytes = new Uint8Array(await dl.data.arrayBuffer());
  } else {
    return j(400, { ok: false, error: "Provide file_id or pdf_base64" });
  }

  let fields: Record<string, string>;
  let documents: { title: string; page: number; pages: number; path?: string }[] = [];
  try {
    const pages = await pdfToPages(bytes!);
    fields = parseContract(pages.join("\n"));
    documents = detectDocuments(pages);
  } catch (e) {
    return j(500, { ok: false, error: "Parse failed: " + (e as Error).message, attempt_marked: attemptMarked, attempt_error: attemptError });
  }

  if (body.write !== false && body.file_id && file) {
    if (documents.length > 1) {
      try {
        const srcPdf = await PDFDocument.load(bytes!);
        const total = srcPdf.getPageCount();
        for (const doc of documents) {
          const sub = await PDFDocument.create();
          const idxs: number[] = [];
          for (let p = doc.page - 1; p < doc.page - 1 + doc.pages && p < total; p++) idxs.push(p);
          const copied = await sub.copyPages(srcPdf, idxs);
          copied.forEach((pg) => sub.addPage(pg));
          const subBytes = await sub.save();
          const dpath = `${body.file_id}/split/${doc.title.toLowerCase()}-${doc.page}.pdf`;
          await admin.storage.from(BUCKET).upload(dpath, subBytes, { contentType: "application/pdf", upsert: true });
          doc.path = dpath;
        }
      } catch (_e) { /* split is best-effort */ }
    }
    const raw = Object.assign({}, file.raw_form_data || {});
    raw.extracted_contract = { fields, documents, at: new Date().toISOString(), source: "extract-contract-fields/v18" };

    // Set the side from the contract, but ONLY when the file has none. A human (or the
    // questionnaire) always wins: never overwrite an existing client_type.
    const patch: Record<string, unknown> = {};
    const existing = String(file.client_type || "").trim();
    if (!existing) {
      let agentName = String(raw.agent_name || "").trim();
      if (!agentName && file.agent_id) {
        const { data: ag } = await admin.from("agents").select("first_name, last_name").eq("id", file.agent_id).maybeSingle();
        if (ag) agentName = ((ag.first_name || "") + " " + (ag.last_name || "")).trim();
      }
      const side = sideFromContract(agentName, fields);
      if (side) {
        patch.client_type = side;
        raw.client_type_source = {
          from: "contract_p19",
          agent: stripCtl(agentName),
          buyer_agent: fields.buyer_agent || null,
          seller_agent: fields.seller_agent || null,
          at: new Date().toISOString(),
        };
      }
    }
    patch.raw_form_data = raw;
    const { error } = await admin.from("files").update(patch).eq("id", body.file_id);
    // The screen no longer has to guess what this means. attempt_marked tells the
    // caller the row already records that a read happened, so the file will read
    // as "could not be saved" rather than as "never run".
    if (error) return j(500, { ok: false, fields, documents, error: "Draft save failed: " + error.message, attempt_marked: attemptMarked, attempt_error: attemptError });
    return j(200, { ok: true, fields, documents, client_type: patch.client_type ?? existing ?? null, attempt_marked: attemptMarked });
  }
  return j(200, { ok: true, fields, documents });
});
