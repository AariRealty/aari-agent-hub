-- REVERTED 5 September 2026, an hour after it was applied. Read
-- ops/20260905_contract_pointer_repair_reverted.sql before this file.
--
-- This change was wrong. The four documents are MLS reports filed correctly in
-- their own logistics slot, not lost contracts, and their pointer was never
-- missing: files.logistics.mls_report_path held the same storage key the whole
-- time. Writing contract_path at them made the Hub claim a contract that does
-- not exist on four live client files. The rows are back to contract_path = ''
-- and both the repair and the reversal are in audit_log.
--
-- Everything below is kept as the record of what was run. Do not re-run it.
--
-- Applied 5 September 2026. This one writes. Four rows in files, and four
-- rows in audit_log recording that it happened.
--
-- WHAT WAS BROKEN
--
-- Four files carried a PDF in storage under their own file id and no pointer
-- to it on the row. Both contract_path and contract_url were present as keys
-- holding empty strings, so the upload had succeeded and the row write had
-- recorded blanks. All four are mls_setup at intake_received, all four have
-- the object created the same day as the row, and all four landed between
-- 30 July and 4 August. One PDF each, 316 KB to 364 KB, no split parts.
--
-- WHAT THEY ACTUALLY ARE, AND THIS CHANGES HOW TO READ THE EARLIER RECORD
--
-- The breakdown filed earlier today called these four the one code problem
-- among the five causes. That is still true, a row did lose the pointer to
-- its own document. But it left the impression that four purchase contracts
-- had gone missing, and they had not.
--
-- Probed with realty-contract-probe v4, probe_orphans, which resolves the
-- object itself so the storage keys, which carry property addresses, never
-- leave the database. It reads and returns numbers and booleans only and it
-- writes nothing. All four came back identical in shape:
--
--   2 pages, 7.2k to 7.8k characters
--   Exclusive Right to Sell named once, MLS named once
--   AS IS Residential, Residential Contract For Sale and Purchase and Sale
--     all zero
--   Effective Date zero, Closing Date once
--
-- They are two page listing agreements on MLS setup jobs, which is the right
-- document for that service. No purchase contract was lost. What was lost was
-- four listing agreements, which still matters, because a file whose own
-- document cannot be found from its row is a file that cannot be produced on
-- request.
--
-- Expect them to read thin on the Contracts screen and expect the field level
-- stops to fire on them. That is correct behaviour on a listing agreement and
-- it is what document_type_unknown and price_implausible_for_type were built
-- for after the $399 finding. It is not a new defect.
--
-- HOW THE POINTER WAS SHAPED
--
-- Every one of the 30 rows that already worked stores the bare storage key.
-- None stores a bucket prefix, none stores a URL. So the repair writes the
-- bare key and nothing else. contract_url was left as it was, empty, because
-- a signed URL would expire and minting one would be inventing a value.
--
-- contract_path_source records where the value came from, so nobody later
-- reads a repaired pointer as one the intake form wrote.
--
-- GUARDS
--
-- The update only fires on a row whose pointer is currently empty and whose
-- file id prefix holds exactly one PDF. It cannot overwrite a real pointer and
-- it cannot guess between two documents. Verified idempotent: a second run
-- touches zero rows.
--
-- AFTER
--   4 rows repaired, 4 pointers resolve to a real object, 4 audit rows
--   The book moved from 31 pointers to 35, and from 33 with none to 29
--   Files with a pointer never run went from 7 to 11
--   24 extracted is unchanged, because this writes no extraction. Running the
--     pass is the broker's button, not this script's job.
--
-- STILL OPEN, AND DELIBERATELY NOT TOUCHED HERE
--
-- Seven rows still carry contract_path as an empty string. None of them has
-- anything in storage to point at, so there is no repair to make, only a
-- decision about whether an empty string should be a null. Left alone. It is
-- the reason the first count of this book came out 22 and 18 instead of 33
-- and 7, so it is worth closing eventually, but it is not this change.
--
-- The intake path that wrote the blanks is not fixed by this either. This
-- repairs four rows, it does not stop a fifth.

begin;

with f as (
  select id, id::text fid, raw_form_data r,
    nullif(trim(coalesce(raw_form_data->>'contract_path', raw_form_data->>'contract_url','')),'') ptr
  from files
), pdfs as (
  select split_part(name,'/',1) fid, name
  from storage.objects
  where bucket_id='transaction-files' and name ilike '%.pdf' and name not ilike '%/split/%'
), one as (
  select fid, min(name) name from pdfs group by fid having count(*) = 1
), target as (
  select f.id, one.name as key from f join one on one.fid = f.fid where f.ptr is null
)
update files SET raw_form_data =
    jsonb_set(
      jsonb_set(files.raw_form_data, '{contract_path}', to_jsonb(target.key), true),
      '{contract_path_source}',
      to_jsonb('repaired_from_storage_2026_09_05'::text), true)
from target
where files.id = target.id
  and nullif(trim(coalesce(files.raw_form_data->>'contract_path', files.raw_form_data->>'contract_url','')),'') is null;

insert into audit_log (actor_type, action, target_table, target_id, details)
select 'system', 'contract_pointer_repaired', 'files', f.id,
  jsonb_build_object(
    'reason', 'Upload succeeded and the row recorded an empty string. Pointer rebuilt from the single PDF under the file id prefix.',
    'document_kind', 'Exclusive Right to Sell listing agreement, confirmed by probe before the write',
    'pointer_length', length(f.raw_form_data->>'contract_path'),
    'repaired_at', now()
  )
from files f
where f.raw_form_data->>'contract_path_source' = 'repaired_from_storage_2026_09_05';

commit;

-- Verification actually run after the commit above.
with f as (
  select id::text fid, raw_form_data r,
    nullif(trim(coalesce(raw_form_data->>'contract_path', raw_form_data->>'contract_url','')),'') ptr,
    (raw_form_data ? 'extracted_contract') ever_ran
  from files
)
select
  (select count(*) from f where r->>'contract_path_source' = 'repaired_from_storage_2026_09_05') as rows_repaired,
  (select count(*) from f where r->>'contract_path_source' = 'repaired_from_storage_2026_09_05'
      and exists (select 1 from storage.objects o where o.bucket_id='transaction-files' and o.name = f.ptr)) as pointers_that_resolve,
  (select count(*) from audit_log where action='contract_pointer_repaired') as audit_rows,
  (select count(*) from f where ptr is not null) as pointer_now,
  (select count(*) from f where ptr is null) as no_pointer_now,
  (select count(*) from f where ptr is not null and not ever_ran) as pointer_never_run_now;
-- returned 4, 4, 4, 35, 29, 11
