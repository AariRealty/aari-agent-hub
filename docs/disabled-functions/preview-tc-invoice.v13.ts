// Preview sender for the coordinator invoice email (centered, TABLE-based, LIGHT background).
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_PRIMARY = 'Aari Transactions <invoices@aaritransactions.com>';
const FROM_FALLBACK = 'Aari Transactions <onboarding@resend.dev>';
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function money(c){ return '$' + (Math.round(c)/100).toLocaleString('en-US',{ minimumFractionDigits:2, maximumFractionDigits:2 }); }
function row2(left, right, opts){
  opts = opts || {};
  const bt = opts.border ? 'border-top:0.5px solid #f0ebe0;' : '';
  const rc = opts.rightColor || '#0f0f0f';
  const rw = opts.rightWeight || '600';
  const rs = opts.rightSize || '12.5px';
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='${bt}'><tr><td valign='top' style='padding:10px 0'>${left}</td><td valign='top' align='right' style='padding:10px 0;white-space:nowrap;font-size:${rs};font-weight:${rw};color:${rc}'>${right}</td></tr></table>`;
}

function invoiceEmailHtml(o){
  const paid = o.items.filter(it=>!it.covered);
  const covered = o.items.filter(it=>it.covered);
  const total = o.total_cents != null ? o.total_cents : paid.reduce((s,it)=>s+(Number(it.amount_cents)||0),0);
  const paidRows = paid.map(it=>row2(`<div style='font-size:12.5px;font-weight:500;color:#0f0f0f'>${esc(it.address||'File')}${it.over?' &middot; over limit':''}</div><div style='font-size:11px;color:#8a857c'>${esc(it.service||'')}</div>`, money(Number(it.amount_cents)||0), { border:true })).join('');
  let coveredHtml='';
  if(covered.length){
    const byClient={};
    covered.forEach(it=>{ const k=it.client||'Client'; (byClient[k]=byClient[k]||[]).push(it); });
    coveredHtml = `<div style='font-size:10px;letter-spacing:1px;color:#a39e93;margin:16px 0 6px'>COVERED &middot; NO PAY (ON THE RECORD)</div>` + Object.keys(byClient).map(cl=>{
      const list=byClient[cl];
      const dots=list.map(()=>`<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:#0f0f0f;margin:0 2px'></span>`).join('');
      const rows=list.map(it=>`<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td style='padding:3px 0;font-size:11.5px;color:#a39e93'>${esc(it.address||'')}${it.credit_no?` &middot; credit ${it.credit_no}`:''}</td><td align='right' style='padding:3px 0;font-size:11.5px;color:#a39e93'>$0.00</td></tr></table>`).join('');
      return `<div style='background:#faf9f6;border:0.5px solid #ece8e0;border-radius:9px;padding:12px 13px'><div style='text-align:center;margin-bottom:9px'>${dots}<div style='font-size:11px;color:#8a857c;margin-top:6px'>${esc(cl)} &middot; ${list.length} of ${list.length} credits used</div></div>${rows}</div>`;
    }).join('');
  }
  const fromTo = `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:20px'><tr><td valign='top'><div style='font-size:9.5px;letter-spacing:1px;color:#a39e93;margin-bottom:4px'>FROM</div><div style='font-size:13px;font-weight:500;color:#0f0f0f'>${esc(o.tc_name||'Coordinator')}</div><div style='font-size:11.5px;color:#5f5e5a'>Coordinator</div></td><td valign='top' align='right'><div style='font-size:9.5px;letter-spacing:1px;color:#a39e93;margin-bottom:4px'>BILL TO</div><div style='font-size:13px;font-weight:500;color:#0f0f0f'>Aari Transactions LLC</div><div style='font-size:11.5px;color:#5f5e5a'>Marlenyi Paredes</div></td></tr></table>`;
  const totalRow = `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-top:1.5px solid #0f0f0f;margin-top:18px'><tr><td style='padding-top:14px;font-size:13px;font-weight:bold;color:#0f0f0f'>Total due</td><td align='right' style='padding-top:14px;font-family:Georgia,serif;font-size:24px;color:#0f0f0f'>${money(total)}</td></tr></table>`;
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f5f5f3'><tr><td align='center' style='padding:26px 12px'>`+
    `<table role='presentation' width='440' cellpadding='0' cellspacing='0' style='max-width:440px;width:100%;background:#ffffff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:30px 26px;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f'>`+
    `<div style='text-align:center;padding-bottom:20px;border-bottom:0.5px solid #ece8e0;margin-bottom:20px'><div style='font-family:Georgia,serif;font-size:22px'>Aari Transactions</div><div style='font-size:9.5px;letter-spacing:2px;color:#8a857c;margin-top:7px'>COORDINATOR INVOICE &middot; ${esc(o.invoice_number||'A-1042')}</div><div style='font-size:11px;color:#a39e93;margin-top:4px'>${esc(o.period||'')}</div></div>`+
    fromTo+
    `<div style='background:#0f0f0f;border-radius:11px;padding:18px;margin-bottom:20px;text-align:center'><div style='font-size:11px;color:#b8b8b8'>Due to you this week</div><div style='font-family:Georgia,serif;font-size:34px;color:#ffffff;line-height:1.1;margin-top:3px'>${money(total)}</div><div style='font-size:11.5px;color:#9a9a9a;margin-top:4px'>${paid.length} paid &middot; ${covered.length} covered by client credits</div></div>`+
    (paid.length?`<div style='font-size:10px;letter-spacing:1px;color:#3e7d57;margin-bottom:2px'>YOU&rsquo;RE OWED</div>${paidRows}`:'')+
    coveredHtml+
    totalRow+
    `<div style='text-align:center;margin-top:20px'><a href='https://aaritransactions.com/files.html' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px'>Review and mark paid</a></div>`+
    `<div style='font-size:10.5px;color:#a39e93;margin-top:16px;line-height:1.5;text-align:center'>${o.items.length} files this week &middot; ${paid.length} paid, ${covered.length} covered by membership credits.</div>`+
    `</td></tr></table></td></tr></table>`;
}

const SAMPLE = [
  { address:'123 Main St, Cape Coral', service:'Full TC · one side · 50% of $399', amount_cents:19950 },
  { address:'456 Oak Ave, Lehigh Acres', service:'File Organization · flat', amount_cents:8000 },
  { address:'MLS Setup', service:'Samantha pays $149 · 50%', amount_cents:7450, over:true },
  { address:'MLS Setup', service:'Samantha pays $149 · 50%', amount_cents:7450, over:true },
  { address:'Listing Docs', client:'Samantha Rivera', amount_cents:0, covered:true, credit_no:1 },
  { address:'MLS Setup', client:'Samantha Rivera', amount_cents:0, covered:true, credit_no:2 },
  { address:'Offer Prep · Basic', client:'Samantha Rivera', amount_cents:0, covered:true, credit_no:3 },
  { address:'File Organization', client:'Samantha Rivera', amount_cents:0, covered:true, credit_no:4 }
];

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{ headers:CORS });
  let body={}; try { body = await req.json(); } catch(_){ body={}; }
  const to = body.to || 'marlenyi@aarirealty.com';
  const items = (Array.isArray(body.items) && body.items.length) ? body.items : SAMPLE;
  const html = invoiceEmailHtml({ invoice_number: body.invoice_number || 'A-1042', period: body.period || 'Jul 3 – Jul 9, 2026', tc_name: body.tc_name || 'Eileen Hernandez', items });
  if(!RESEND) return new Response(JSON.stringify({ ok:false, error:'no RESEND key' }),{ status:500, headers:{...CORS,'Content-Type':'application/json'} });
  let last='';
  for(const from of [FROM_PRIMARY, FROM_FALLBACK]){
    try {
      const r = await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':`Bearer ${RESEND}`, 'Content-Type':'application/json' }, body: JSON.stringify({ from, to:[to], subject:'Invoice preview · coordinator invoice A-1042', html }) });
      if(r.ok){ const j = await r.json().catch(()=>({})); return new Response(JSON.stringify({ ok:true, id:j.id, from, to }),{ headers:{...CORS,'Content-Type':'application/json'} }); }
      last = 'Resend ' + r.status + ': ' + (await r.text()).slice(0,200);
      if(!/not verified|domain|403|422/i.test(last)) break;
    } catch(e){ last = String(e); }
  }
  return new Response(JSON.stringify({ ok:false, error:last }),{ status:502, headers:{...CORS,'Content-Type':'application/json'} });
});
