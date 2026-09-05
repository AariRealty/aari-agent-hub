// ============================================================================
// Aari Transactions · contract risk flags
// ============================================================================
// Deterministic. No AI, no per-file cost, and no contract text leaves the
// system to produce these. Every flag is computed from fields the extractor
// already lifted off the FR/BAR plus the documents it detected in the packet.
//
// Written against the parsed fields rather than fresh regex over the contract
// text on purpose. The fields have been validated on 24 real files; a new
// pattern run over PDFs nobody has looked at is how you get a flag that fires
// on nothing, or on everything.
//
// Two severities and the line between them is not decorative:
//   stop  · a deadline, a payment or a legal requirement cannot be established
//           from this contract. Somebody has to open the PDF.
//   check · the contract is workable, a human should confirm one thing.
//
// A flag never asserts a fact about the deal. It says what the contract did
// not tell us. "No financing contingency" would be a claim; "the financing
// program is not confirmed" is what is actually known, because the extractor
// deliberately leaves conventional and cash blank rather than guess a
// checkbox.
// ============================================================================

function has(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

// "1,234.56" and "$1,234" both arrive as strings off the PDF.
function money(v) {
  if (!has(v)) return null;
  var n = Number(String(v).replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

function day(v) {
  if (!has(v)) return null;
  var t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}

function docTitles(documents) {
  return (Array.isArray(documents) ? documents : [])
    .map(function (d) { return d && d.title; })
    .filter(Boolean);
}

/**
 * @param fields     the extractor's field object
 * @param documents  the documents it detected in the packet
 * @param context    { client_type } from the file row, which is not a field
 * @returns array of { id, severity, label, detail }
 */
function riskFlags(fields, documents, context) {
  var f = fields || {};
  var ctx = context || {};
  var titles = docTitles(documents);
  var out = [];
  function flag(id, severity, label, detail) {
    out.push({ id: id, severity: severity, label: label, detail: detail });
  }

  // ---- things that stop the file moving -----------------------------------

  // The effective date is the spine. Every FR/BAR deadline counts from it, so
  // without it there is no inspection period, no loan approval date and no
  // deposit due date. The extractor only emits it when every signature block
  // that carries a Date field is actually dated, so a blank here usually means
  // a signer left their date line empty.
  if (!has(f.effective_date)) {
    flag('effective_date_missing', 'stop', 'No effective date',
      'Every deadline on this contract counts from the effective date. One of the signature blocks has no date on it, so none of them can be calculated.');
  }

  if (!has(f.closing_date)) {
    flag('closing_date_missing', 'stop', 'No closing date',
      'Paragraph 3 did not yield a closing date.');
  }

  if (!money(f.price)) {
    flag('price_missing', 'stop', 'No purchase price',
      'Paragraph 2 did not yield a price, so nothing downstream can be checked against it.');
  }

  // Nowhere to send the deposit is not a paperwork problem.
  if (!has(f.title_name) && !has(f.title_email)) {
    flag('escrow_agent_missing', 'stop', 'No escrow agent',
      'Neither a name nor an email came off the escrow block, so there is nobody to send the deposit to.');
  }

  var eff = day(f.effective_date), clo = day(f.closing_date);
  if (eff !== null && clo !== null && clo < eff) {
    flag('closing_before_effective', 'stop', 'Closing date is before the effective date',
      'One of the two dates was read wrong, or the contract carries a date that cannot be right. Both need checking against the PDF.');
  }

  // ---- things a person should confirm -------------------------------------

  if (!money(f.emd)) {
    flag('deposit_missing', 'check', 'No initial deposit stated',
      'Paragraph 2(a) did not yield an initial deposit. That is legitimate on some contracts and an omission on most.');
  }

  if (!has(f.buyer) || !has(f.seller)) {
    flag('party_missing', 'check', 'A party name is missing',
      (has(f.buyer) ? 'The seller' : has(f.seller) ? 'The buyer' : 'Neither party') +
      ' could not be read off the first page.');
  }

  if (!has(f.legal)) {
    flag('legal_description_missing', 'check', 'No legal description',
      'Title will ask for it and it is not on the parsed contract.');
  }

  // Post NAR settlement, what the cooperating side is paid is its own signed
  // document. Its absence from the packet is worth seeing, not asserting: it
  // may exist and simply not have been sent with the contract.
  if (Array.isArray(documents) && documents.length && titles.indexOf('Compensation') < 0) {
    flag('no_compensation_document', 'check', 'No compensation agreement in the packet',
      'The packet split into ' + titles.join(', ') + '. If a compensation agreement was signed, it did not come with the contract.');
  }

  // The extractor asserts a program only on a strong signal, an addendum or
  // explicit programme text, and leaves conventional and cash blank rather
  // than read a checkbox it cannot see. So this is a prompt, not a fault.
  if (money(f.loan_amount) && !has(f.financing_type)) {
    flag('financing_program_unconfirmed', 'check', 'Financing programme not confirmed',
      'A loan amount was found but no FHA, VA or USDA addendum. Conventional and cash are left blank on purpose, so this needs a person to confirm which it is.');
  }

  var loan = money(f.loan_amount), price = money(f.price);
  if (loan !== null && price !== null && loan >= price) {
    flag('loan_not_below_price', 'check', 'Loan amount is not below the purchase price',
      'Read as ' + f.loan_amount + ' against a price of ' + f.price + '. Usually a parsing error, occasionally a real term.');
  }

  if (!has(ctx.client_type)) {
    flag('side_unknown', 'check', 'Which side we represent is not set',
      'Paragraph 19 did not match our agent to either the cooperating or the listing associate, so the file is not tagged buyer or seller.');
  }

  return out;
}

// ---------------------------------------------------------------------------
// Document level flags. These need the PDF itself rather than the extracted
// fields, so they take a small summary object the caller builds once per file.
//
// Everything here was measured against ten real contracts before it became a
// rule. Two candidates were dropped at that stage and are worth recording so
// nobody spends the afternoon again:
//
//   Inspection period against the form default of 15 days. The FR/BAR carries
//   numbered lines down the margin, and the text layer puts those numbers next
//   to the phrase. Every contract probed returned 263, 264, 265, 266, 267 near
//   "Inspection Period", which are line numbers, not days. The filled value
//   sits on a blank the text layer does not associate with the label.
//
//   Loan approval period. Same problem, worse: 59, 7, 60, 61, 100, 101 and so
//   on, identical across all three contracts because it is the blank form text
//   being read, not the filled value.
//
// Guessing a pattern for either would produce a rule that fires on the form
// rather than on the deal, which is worse than not having it.
// ---------------------------------------------------------------------------

/**
 * @param doc {
 *   has_contract_path, readable, zips, property_zip,
 *   has_certificate_of_occupancy, says_compensation_agreement, has_compensation_doc
 * }
 */
function documentFlags(doc) {
  var d = doc || {};
  var out = [];
  function flag(id, severity, label, detail) {
    out.push({ id: id, severity: severity, label: label, detail: detail });
  }

  // Half the files probed had no contract on them at all. A file with no
  // contract is not a clean file, and until now nothing said which it was.
  if (d.has_contract_path === false) {
    flag('no_contract_attached', 'stop', 'No contract on the file',
      'Nothing has been attached to extract from, so every other flag on this file is silence rather than an all clear.');
    return out;
  }

  // A scanned contract. One in ten of the files probed is a photograph of a
  // document with no text in it, and the extractor returns nothing without
  // ever saying why.
  if (d.readable === false) {
    flag('contract_not_readable', 'stop', 'The contract has no text in it',
      'This PDF is a scan or a photograph, so there is no text to read. Nothing can be extracted from it and nothing can be flagged. It needs re-saving from the original or running through OCR.');
    return out;
  }

  // A lender letter or pre approval carrying a different zip from the property
  // is worth a look. Three of the ten probed carry more than one.
  var zips = Array.isArray(d.zips) ? d.zips.filter(Boolean) : [];
  if (zips.length > 1) {
    flag('zip_mismatch', 'check', 'The packet carries more than one zip code',
      'Found ' + zips.join(' and ') + '. Usually a lender letter or a form for a different property came in with the contract. Worth confirming which one the deal is.');
  }

  if (d.has_certificate_of_occupancy) {
    flag('certificate_of_occupancy', 'check', 'A certificate of occupancy is referenced',
      'Additional terms mention a certificate of occupancy, which usually means work was done that needs permits closed before closing.');
  }

  // Stronger than the packet based version: the contract itself says a
  // compensation agreement exists and it did not arrive with it.
  if (d.says_compensation_agreement && d.has_compensation_doc === false) {
    flag('compensation_agreement_referenced_not_attached', 'check',
      'The contract refers to a compensation agreement that is not in the packet',
      'The contract text mentions a compensation agreement but no such document was found when the packet was split.');
  }

  return out;
}

function flagSummary(flags) {
  var list = Array.isArray(flags) ? flags : [];
  return {
    total: list.length,
    stop: list.filter(function (x) { return x.severity === 'stop'; }).length,
    check: list.filter(function (x) { return x.severity === 'check'; }).length
  };
}

export { riskFlags, documentFlags, flagSummary };
