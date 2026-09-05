-- Applied 5 September 2026, an hour after the repair it undoes.
-- The repair in ops/20260905_contract_pointer_repair.sql was WRONG and has
-- been reverted. Read this before that file.
--
-- WHAT I GOT WRONG
--
-- I read four rows as having lost the pointer to their own document, because
-- each had a PDF in storage under its own file id and an empty contract_path.
-- I probed the documents, confirmed they were real, and wrote the pointer.
--
-- The pointer was never lost. The document was never a contract.
--
-- Going after the intake code that supposedly wrote the blanks is what found
-- it. The storage key told the story once I read it properly:
--
--   <file_id>/mls_report-<epoch>-<filename>.pdf
--
-- The slot word is mls_report. That name is written by the logistics document
-- slot handler in files.html of AariRealty/aari-transactions-landing, the
-- data-cklg-file branch of wireLogisticsDelegation:
--
--   const path = _drawerFile.id + '/' + key + '-' + Date.now() + '-' + safe;
--   lg[key] = fl.name; lg[key + '_uploaded'] = true; lg[key + '_path'] = path;
--   await _client.from('files').update({ logistics: lg }).eq('id', ...);
--
-- The pointer for that document lives in files.logistics, under its own key,
-- in its own column. Checked on all four: logistics.mls_report_path is set,
-- mls_report_uploaded is true, the key resolves to a real object, and it is
-- byte for byte the same key I had written into contract_path.
--
-- So the document was correctly filed the whole time. An MLS report on an MLS
-- setup job, stored in the MLS report slot. The empty contract_path was not a
-- blank that a bug left behind, it was the truth: these files have no contract
-- attached, because an MLS setup does not need one.
--
-- Writing contract_path at it made the Hub claim a contract that does not
-- exist, on four live client files, which is the exact failure mode the rule
-- about never inventing data exists to prevent. I caused it and I have undone
-- it.
--
-- WHAT THIS MEANS FOR THE TWO RECORDS FILED EARLIER TODAY
--
-- ops/20260905_extraction_breakdown.sql calls these four "PDF uploaded,
-- pointer never written" and "the only one of the five causes that is a code
-- problem". Both claims are withdrawn. The corrected cause is "document filed
-- in its own logistics slot, not a contract", and NONE of the five causes is a
-- code problem. The 33 files with no contract pointer break down as:
--
--    9  document requirement waived, on purpose
--   14  nothing ever uploaded
--    4  test rows
--    4  an MLS report filed correctly in its own slot
--    2  duplicate rows removed
--
-- THE ONE REAL DEFECT, AND IT IS NOT THE ONE I WENT LOOKING FOR
--
-- The new file drawer in the same files.html initialises the three contract
-- variables to empty strings and only fills them when a file is attached:
--
--   var safe = '', path = '', signed = '';
--   if(_nfFile){ ... path = uid + '/' + id + '/' + safe; ... }
--   var _rawForm = { ..., contract_url:signed, contract_filename:safe,
--                    contract_path:path, ... };
--
-- So a file created with no contract gets contract_path:'' rather than the key
-- being absent or null. That is the whole defect. It writes no wrong document
-- and loses nothing, but it makes a row that has no contract look like a row
-- that has one to any code that tests for the key instead of the value, which
-- is exactly the mistake that produced the 22 and 18 miscount this morning and
-- then led me to this repair. Worth fixing at the source, in that repo, not
-- this one. Not fixed here.
--
-- The upload path is sound. tc_one_side is 16 for 16. The one path I accused
-- of a regression, on the strength of a 29 July success and a 30 July failure,
-- was never involved: those two submissions were different features.

begin;

update files
set raw_form_data = (raw_form_data - 'contract_path_source')
                    || jsonb_build_object('contract_path', ''::text)
where raw_form_data->>'contract_path_source' = 'repaired_from_storage_2026_09_05';

insert into audit_log (actor_type, action, target_table, target_id, details)
select 'system', 'contract_pointer_repair_reverted', 'files', f.id,
  jsonb_build_object(
    'reason', 'The repair was wrong. The document is an MLS report filed in its own logistics slot, not a lost contract. Its pointer was never missing: logistics.mls_report_path already held the same storage key.',
    'restored_to', 'empty string, the value the new file drawer writes when no contract is attached',
    'reverted_at', now()
  )
from files f
where f.id in (select target_id from audit_log where action = 'contract_pointer_repaired');

commit;

-- Verified after the commit above:
--   0 rows still carry contract_path_source
--   4 rows restored to contract_path = ''
--   4 rows still carry an intact logistics.mls_report_path
--   4 audit rows for the repair, 4 for the reversal, both kept
--   the book is back to 31 pointers, 24 extracted, 64 files
