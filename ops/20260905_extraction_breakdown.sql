-- CORRECTED 5 September 2026, later the same day. Read this first.
--
-- The bucket below called "PDF uploaded, pointer never written" is WRONG, and
-- so is the line calling it "the only one of the five causes that is a code
-- problem". Those four documents are MLS reports filed correctly in their own
-- logistics slot, and their pointer was never missing: it is in
-- files.logistics.mls_report_path and always was. The correct cause name is
-- "an MLS report filed correctly in its own slot", and none of the five causes
-- is a code problem.
--
-- See ops/20260905_contract_pointer_repair_reverted.sql for how that was
-- established and for the repair it undoes.
--
-- Applied 5 September 2026. Measurement, not a change. Nothing here writes.
-- The record of how the "40 of 64 files have no extraction" figure breaks down
-- by cause, and of the correction that had to be made to reach it.
--
-- THE CORRECTION, FIRST, BECAUSE EVERYTHING ELSE DEPENDS ON IT
--
-- The first pass counted a file as having a contract when raw_form_data
-- carried a contract_path key. Eleven rows carry that key with an empty
-- string as its value. Counting the key rather than the value put those
-- eleven on the wrong side of the line and produced 22 with no contract
-- and 18 with a contract never run. The true split is 33 and 7.
--
-- Read the value, never the key. The form writes the key whether or not a
-- file was chosen.
--
--   coalesce is not enough on its own, because '' is not null:
--     nullif(trim(coalesce(raw_form_data->>'contract_path',
--                          raw_form_data->>'contract_url','')),'')
--
-- Also checked, and both are empty, so raw_form_data is the only pointer that
-- exists anywhere: file_documents holds 1 row across the whole book,
-- file_contracts holds 0, uploads_metadata is [] on all 64 rows, and
-- tc_document_purge_log is empty, so nothing was purged out from under us.
--
-- THE BOOK, 64 FILES
--
--   31  carry a contract pointer that has a value
--   33  carry no pointer at all
--
--   24  have been through the extractor
--    7  have a pointer and have never been run
--   33  have no pointer
--
-- THE 33 WITH NO POINTER, BY CAUSE. The partition is exact, no row falls in
-- two buckets and none falls outside.
--
--    9  document requirement waived, all mls_setup, 14 Jun to 17 Jul.
--       Waived on purpose. Not a gap.
--    4  test rows, one each of file_organization, listing, offer_prep_complete
--       and rental, 23 Jun to 1 Jul. Not real files.
--    2  duplicate rows removed, both tc_one_side, both 9 Jul. Not real files.
--    4  a PDF is sitting in storage and no pointer was ever written. All four
--       are mls_setup, all four landed between 30 Jul and 4 Aug, one PDF each,
--       316 KB to 364 KB, no split parts. The upload succeeded and the row
--       did not record it. This is a bug with a four-file blast radius and a
--       six-day window, and the documents are recoverable.
--   14  nothing was ever uploaded. 12 file_organization (27 Jun to 2 Sep)
--       and 2 mls_setup (17 to 21 Aug).
--
-- Not one of the 33 is tc_one_side except the two duplicates. The transaction
-- coordination book is not the hole. The hole is mls_setup and
-- file_organization, which are services that often have no purchase contract
-- to hold in the first place.
--
-- THE 7 WITH A POINTER, NEVER RUN. Probed with realty-contract-probe v3,
-- only_unextracted, which reads contracts and returns numbers and booleans
-- only, no names, no addresses, no snippets, and writes nothing.
--
--    4  full FR/BAR AS IS Residential packets, 13 to 18 pages, 71k to 89k
--       characters, Effective Date named 16 to 18 times and Closing Date 21
--       times each. Three of the four also carry a compensation agreement.
--       These would extract today. This is backlog, not breakage.
--    1  Exclusive Right to Sell listing agreement, 5 pages, 22.7k characters.
--       It will extract listing fields and no deal terms, which is correct.
--    1  10 pages, 6.6k characters, no form phrase matched at all. Roughly 660
--       characters a page, which is what a mostly-graphic document reads like.
--       Worth a human look before anything is concluded from it.
--    1  2 pages, 0 characters. A scan with no text layer. Nothing to extract
--       and no OCR fallback exists, so contract_not_readable is the honest
--       answer and it stays that way until OCR is a decision somebody makes.
--
-- QUALITY OF THE 24 ALREADY EXTRACTED, for scale against the above:
--    1  no_text_layer recorded true
--    2  returned zero filled fields
--    5  returned one to four fields
--   17  returned five or more, average 16.4 fields across all 24
--   12  have a contract_type, 10 an effective_date, 12 a closing_date,
--       17 a price
--
-- ONE PROBE FIELD IS A DUD AND IS RECORDED SO NOBODY READS IT AS A FINDING.
-- has_signature_block came back false on all seven, including the four full
-- AS IS packets. The pattern looks for "Buyer's Signature" and the FR/BAR
-- does not word it that way. It measures the pattern, not the contracts.
--
-- WHAT THIS MEANS FOR THE CONTRACTS SCREEN
-- The screen renders an empty state for 33 files. For 15 of those it is
-- correct to do so, because they are waived, test or duplicate rows. For 14
-- there is genuinely nothing to show. For 4 there is a document in storage
-- that the screen cannot find. That last four is the only one of the five
-- causes that is a code problem.

-- The two queries, kept so the numbers can be reproduced rather than trusted.

-- 1. The split, reading the value and not the key.
with f as (
  select id::text fid, service_type, raw_form_data r,
    nullif(trim(coalesce(raw_form_data->>'contract_path', raw_form_data->>'contract_url','')),'') ptr,
    (raw_form_data ? 'extracted_contract') ever_ran
  from files
)
select
  count(*) filter (where ever_ran) as extracted,
  count(*) filter (where not ever_ran and ptr is not null) as pointer_never_run,
  count(*) filter (where ptr is null) as no_pointer,
  count(*) as total
from f;

-- 2. The 33 with no pointer, by cause.
with f as (
  select id::text fid, service_type, created_at, raw_form_data r,
    nullif(trim(coalesce(raw_form_data->>'contract_path', raw_form_data->>'contract_url','')),'') ptr
  from files
), o as (
  select split_part(name,'/',1) fid,
         count(*) filter (where name ilike '%.pdf' and name not ilike '%/split/%') pdfs
  from storage.objects where bucket_id='transaction-files' group by 1
), np as (
  select f.*, coalesce(o.pdfs,0) pdfs,
    case when (r->>'test_pool') is not null then 'test row'
         when (r->>'dedup_removed') is not null then 'duplicate row removed'
         when (r->>'doc_requirement_waived') is not null then 'document requirement waived'
         when coalesce(o.pdfs,0) > 0 then 'PDF uploaded, pointer never written'
         else 'nothing ever uploaded' end as cause
  from f left join o on o.fid = f.fid
  where f.ptr is null
)
select cause, coalesce(service_type,'(null)') service_type, count(*) files,
       min(created_at)::date first_seen, max(created_at)::date last_seen
from np group by 1,2 order by 1, 3 desc;
