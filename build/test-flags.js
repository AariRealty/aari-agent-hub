// Contract risk flags. Deterministic rules over the fields the extractor
// already lifts off the FR/BAR, so this tests the shipped rule file directly
// rather than a copy of it.
//
// The line that matters is severity. "stop" means a deadline, a payment or a
// legal requirement cannot be established and somebody has to open the PDF.
// "check" means the file is workable and one thing needs confirming. A rule
// that drifts across that line turns a queue of real blockers into noise, so
// every case below asserts the severity, not just that something fired.
const path = require('path');
const SRC = path.join(__dirname, '..', 'supabase', 'functions', 'extract-contract-fields', 'flags.js');

(async () => {
  const { riskFlags, documentFlags, flagSummary } = await import('file://' + SRC);

  // A contract with everything on it. The most important case: a rule set that
  // fires on a clean file is worse than no rule set, because it gets ignored.
  const FULL = {
    contract_type: 'AS IS Residential',
    buyer: 'Jane Doe', seller: 'John Roe',
    address: '123 Example St, Cape Coral, FL 33904', legal: 'LOT 1 BLK 2',
    price: '350,000.00', emd: '5,000.00', loan_amount: '280,000.00',
    financing_type: 'fha',
    title_name: 'Sandbar Title', title_email: 'ops@example.test',
    effective_date: 'July 12, 2026', closing_date: 'August 30, 2026',
  };
  const DOCS = [{ title: 'Contract' }, { title: 'Addendum' }, { title: 'Compensation' }];
  const CTX = { client_type: 'buyer' };

  const ids = (f, d, c) => riskFlags(f, d, c).map(x => x.id);
  const sev = (f, d, c, id) => (riskFlags(f, d, c).find(x => x.id === id) || {}).severity;
  const drop = (k) => { const o = Object.assign({}, FULL); delete o[k]; return o; };

  const checks = [];
  const clean = riskFlags(FULL, DOCS, CTX);
  checks.push(['a complete contract raises nothing at all', clean.length === 0]);

  checks.push(['no effective date stops the file',
    sev(drop('effective_date'), DOCS, CTX, 'effective_date_missing') === 'stop']);
  checks.push(['no closing date stops the file',
    sev(drop('closing_date'), DOCS, CTX, 'closing_date_missing') === 'stop']);
  checks.push(['no price stops the file',
    sev(drop('price'), DOCS, CTX, 'price_missing') === 'stop']);

  // Nowhere to send the deposit. Only when BOTH are gone: one is enough to act on.
  const noName = drop('title_name');
  checks.push(['an escrow agent with an email but no name is not a blocker',
    ids(noName, DOCS, CTX).indexOf('escrow_agent_missing') < 0]);
  const noEscrow = drop('title_name'); delete noEscrow.title_email;
  checks.push(['no escrow agent at all stops the file',
    sev(noEscrow, DOCS, CTX, 'escrow_agent_missing') === 'stop']);

  const backwards = Object.assign({}, FULL, { closing_date: 'June 1, 2026' });
  checks.push(['a closing date before the effective date stops the file',
    sev(backwards, DOCS, CTX, 'closing_before_effective') === 'stop']);

  checks.push(['a missing deposit is a check, not a stop',
    sev(drop('emd'), DOCS, CTX, 'deposit_missing') === 'check']);
  checks.push(['a missing party is a check',
    sev(drop('buyer'), DOCS, CTX, 'party_missing') === 'check']);
  checks.push(['a missing legal description is a check',
    sev(drop('legal'), DOCS, CTX, 'legal_description_missing') === 'check']);

  // Post NAR settlement. Its absence is reported, never asserted as unsigned.
  checks.push(['a packet with no compensation agreement is flagged',
    sev(FULL, [{ title: 'Contract' }], CTX, 'no_compensation_document') === 'check']);
  checks.push(['and the flag names what the packet did contain',
    /Contract/.test((riskFlags(FULL, [{ title: 'Contract' }], CTX)
      .find(x => x.id === 'no_compensation_document') || {}).detail || '')]);
  checks.push(['a packet that was never split is not accused of missing one',
    ids(FULL, [], CTX).indexOf('no_compensation_document') < 0]);

  // The extractor leaves conventional and cash blank rather than read a
  // checkbox it cannot see, so this has to read as a prompt and not a fault.
  const noProgram = drop('financing_type');
  const fin = riskFlags(noProgram, DOCS, CTX).find(x => x.id === 'financing_program_unconfirmed');
  checks.push(['a loan with no programme is a check', fin && fin.severity === 'check']);
  checks.push(['and it does not claim a contingency is missing',
    !!fin && !/missing|no financing contingency/i.test(fin.label)]);
  const cash = drop('loan_amount'); delete cash.financing_type;
  checks.push(['a cash contract raises no financing flag',
    ids(cash, DOCS, CTX).indexOf('financing_program_unconfirmed') < 0]);

  const overLoan = Object.assign({}, FULL, { loan_amount: '400,000.00' });
  checks.push(['a loan at or above the price is a check',
    sev(overLoan, DOCS, CTX, 'loan_not_below_price') === 'check']);

  checks.push(['an untagged side is a check',
    sev(FULL, DOCS, {}, 'side_unknown') === 'check']);
  checks.push(['a tagged side raises nothing',
    ids(FULL, DOCS, { client_type: 'seller' }).indexOf('side_unknown') < 0]);

  // Money arrives off the PDF as strings with commas, and a zero deposit is
  // absent for this purpose rather than present.
  checks.push(['a zero deposit counts as no deposit',
    ids(Object.assign({}, FULL, { emd: '0.00' }), DOCS, CTX).indexOf('deposit_missing') >= 0]);
  checks.push(['a comma in a figure does not break the comparison',
    ids(Object.assign({}, FULL, { price: '1,250,000.00', loan_amount: '900,000.00' }), DOCS, CTX).length === 0]);

  // Nothing at all should not throw, and should read as unworkable.
  const empty = riskFlags({}, null, {});
  checks.push(['an empty extraction does not throw and stops the file',
    empty.length > 0 && flagSummary(empty).stop >= 4]);

  const s = flagSummary(riskFlags(drop('effective_date'), [{ title: 'Contract' }], {}));
  checks.push(['the summary counts stop and check separately',
    s.total === s.stop + s.check && s.stop >= 1 && s.check >= 1]);

  // Every flag has to be renderable and readable, not just present.
  const shapes = riskFlags({}, [{ title: 'Contract' }], {});
  checks.push(['every flag carries an id, a severity, a label and a reason',
    shapes.every(x => x.id && /^(stop|check)$/.test(x.severity) && x.label && x.detail)]);
  checks.push(['no flag label is written as a claim about the deal',
    shapes.every(x => !/\bis missing from the contract\b|\bhas no financing contingency\b/i.test(x.label))]);

  // ---- document level flags -----------------------------------------------
  // Each of these was measured against ten real contracts before it became a
  // rule. Two candidates, the inspection period and the loan approval period,
  // were dropped at that stage: the FR/BAR's margin line numbers sit next to
  // the phrase in the text layer, so every contract probed returned 263 to 267
  // near "Inspection Period". These assert the survivors behave.
  const OKDOC = { has_contract_path: true, readable: true, zips: ['33974'],
    has_certificate_of_occupancy: false, says_compensation_agreement: false, has_compensation_doc: true };
  const dids = (d) => documentFlags(Object.assign({}, OKDOC, d)).map(x => x.id);
  const dsev = (d, id) => (documentFlags(Object.assign({}, OKDOC, d)).find(x => x.id === id) || {}).severity;

  checks.push(['a readable contract with one zip raises nothing', documentFlags(OKDOC).length === 0]);

  // The two that say "we know nothing" rather than "nothing is wrong". Both
  // return alone, because every other flag on such a file would be silence
  // dressed up as an all clear.
  const noFile = documentFlags(Object.assign({}, OKDOC, { has_contract_path: false, zips: ['1','2'] }));
  checks.push(['a file with no contract stops, and says only that',
    noFile.length === 1 && noFile[0].id === 'no_contract_attached' && noFile[0].severity === 'stop']);
  const scanned = documentFlags(Object.assign({}, OKDOC, { readable: false, zips: ['1','2'] }));
  checks.push(['a scanned contract stops, and says only that',
    scanned.length === 1 && scanned[0].id === 'contract_not_readable' && scanned[0].severity === 'stop']);
  checks.push(['and it says what to do about a scan',
    /OCR|re-saving/i.test(scanned[0].detail)]);

  checks.push(['two zips in the packet is a check',
    dsev({ zips: ['33974', '33936'] }, 'zip_mismatch') === 'check']);
  checks.push(['and the flag names both of them',
    /33974 and 33936/.test((documentFlags(Object.assign({}, OKDOC, { zips: ['33974','33936'] }))
      .find(x => x.id === 'zip_mismatch') || {}).detail || '')]);
  checks.push(['one zip is not a mismatch', dids({ zips: ['33974'] }).indexOf('zip_mismatch') < 0]);
  checks.push(['no zip at all is not a mismatch', dids({ zips: [] }).indexOf('zip_mismatch') < 0]);

  checks.push(['a certificate of occupancy reference is a check',
    dsev({ has_certificate_of_occupancy: true }, 'certificate_of_occupancy') === 'check']);
  checks.push(['and it does not claim the work was unpermitted',
    !/\bis unpermitted\b|\bunpermitted work exists\b/i.test(
      (documentFlags(Object.assign({}, OKDOC, { has_certificate_of_occupancy: true }))
        .find(x => x.id === 'certificate_of_occupancy') || {}).detail || '')]);

  checks.push(['a compensation agreement named but not attached is a check',
    dsev({ says_compensation_agreement: true, has_compensation_doc: false },
      'compensation_agreement_referenced_not_attached') === 'check']);
  checks.push(['named and attached raises nothing',
    dids({ says_compensation_agreement: true, has_compensation_doc: true }).length === 0]);

  checks.push(['document flags carry the same shape as the field flags',
    documentFlags({ has_contract_path: false }).every(x =>
      x.id && /^(stop|check)$/.test(x.severity) && x.label && x.detail)]);
  checks.push(['an empty document summary does not throw', Array.isArray(documentFlags({}))]);
  checks.push(['and neither does no argument at all', Array.isArray(documentFlags())]);

  // The panel that shows these. Same technique as test-invite: lift the render
  // out of the shipped module and run it, rather than testing a copy.
  const fs = require('fs');
  const MODULE = fs.readFileSync(path.join(__dirname, '..', 'broker_module.html'), 'utf8');
  const from = MODULE.indexOf('function flagRow(f){');
  const to = MODULE.indexOf('async function loadContractFlags()');
  checks.push(['the broker panel ships a flagRow reader', from >= 0 && to > from]);
  if (from >= 0 && to > from) {
    const src = MODULE.slice(from, to);
    const flagRow = new Function(src + '\nreturn flagRow;')();
    const parsedRow = flagRow({ id: 'f1', client_type: 'buyer',
      raw_form_data: { extracted_contract: { fields: { address: '1 Example St' },
        flags: [{ id: 'x', severity: 'stop', label: 'L', detail: 'D' }] } } });
    checks.push(['it reads an address and the stored flags off a file',
      parsedRow.parsed === true && parsedRow.where === '1 Example St' && parsedRow.flags.length === 1]);
    // The distinction the panel exists to preserve.
    const neverRun = flagRow({ id: 'f2', client_type: null, raw_form_data: {} });
    checks.push(['a file the extractor never touched reads as unparsed, not as clean',
      neverRun.parsed === false && neverRun.flags === null]);
    const parsedNotFlagged = flagRow({ id: 'f3', client_type: 'seller',
      raw_form_data: { extracted_contract: { fields: {} } } });
    checks.push(['a parsed file with no flags yet is parsed but unflagged',
      parsedNotFlagged.parsed === true && parsedNotFlagged.flags === null]);
    checks.push(['a file with no raw_form_data at all does not throw',
      flagRow({ id: 'f4', client_type: null, raw_form_data: null }).parsed === false]);
  }
  checks.push(['the panel runs the flag pass through the broker gated function',
    /apiCall\('realty-contract-flags',\{all:true\}\)/.test(MODULE)]);
  checks.push(['and it never writes flags in the browser',
    !/\.update\(\s*\{\s*raw_form_data/.test(MODULE)]);

  let bad = 0;
  for (const [n, ok] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
  console.log(bad ? '\nFAIL' : '\nPASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL  ' + e.message); process.exit(1); });
