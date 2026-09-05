-- Applied 5 September 2026. This writes. 11 rows in files, 11 in audit_log.
--
-- The data half of the fix pushed to AariRealty/aari-transactions-landing on
-- branch claude/contract-key-absent-when-no-contract. That branch stops new
-- rows being written this way. This clears the rows already written.
--
-- WHAT WAS WRONG
--
-- The new file drawer in that repo's files.html initialises three variables to
-- empty strings and only fills them when a contract is actually attached:
--
--   var safe = '', path = '', signed = '';
--   if(_nfFile){ ... }
--   var _rawForm = { ..., contract_url:signed, contract_filename:safe,
--                    contract_path:path, ... };
--
-- So a file created with no contract stored contract_path:'', contract_url:''
-- and contract_filename:''. Eleven rows carry all three.
--
-- Every reader tests truthiness and coped. What did not cope is anything
-- asking whether the key is present, which is a fair question to ask of a
-- jsonb column and the one I asked. It is why the first count of this book
-- came out 22 with no contract and 18 with a contract never run, when the
-- truth is 33 and 7, and that miscount is what led to a repair that put a
-- contract_path on four live client files pointing at an MLS report. Reverted
-- in ops/20260905_contract_pointer_repair_reverted.sql.
--
-- WHY REMOVING THE KEY IS THE RIGHT SHAPE, NOT A PREFERENCE
--
-- Removing a contract from a file in that same files.html already does
--
--   delete raw.contract_url; delete raw.contract_filename; delete raw.contract_path;
--
-- so an absent key is already this system's way of saying there is no
-- contract. Creation simply did not match removal. This makes them agree.
--
-- GUARDS
--
-- Each key is dropped only where it holds an empty string. A key holding a
-- real value is never touched, and the three are evaluated independently, so a
-- row with a real path and a blank filename would keep its path. Re-running
-- changes nothing.
--
-- BEFORE AND AFTER
--   contract_path  empty on 11 rows, now 0
--   contract_url   empty on 11 rows, now 0
--   contract_filename empty on 11 rows, now 0
--   rows carrying a contract_path key: 30, every one of them a real value
--   rows with a real pointer: 31 before and 31 after, so nothing was lost
--   24 extracted, unchanged, because this runs no extraction
--   the 5 logistics.mls_report_path pointers are untouched and all 5 resolve
--
-- The key test and the value test now give the same answer on every row, which
-- is the whole point of the change.

begin;

create temporary table _blank_ids on commit drop as
select id from files
where trim(coalesce(raw_form_data->>'contract_path','x')) = ''
   or trim(coalesce(raw_form_data->>'contract_url','x')) = ''
   or trim(coalesce(raw_form_data->>'contract_filename','x')) = '';

update files f
set raw_form_data =
  (case when trim(coalesce(f.raw_form_data->>'contract_path','x'))     = '' then f.raw_form_data - 'contract_path'     else f.raw_form_data end)
   - (case when trim(coalesce(f.raw_form_data->>'contract_url','x'))      = '' then 'contract_url'      else '__keep__' end)
   - (case when trim(coalesce(f.raw_form_data->>'contract_filename','x')) = '' then 'contract_filename' else '__keep__' end)
where f.id in (select id from _blank_ids);

insert into audit_log (actor_type, action, target_table, target_id, details)
select 'system', 'empty_contract_keys_removed', 'files', b.id,
  jsonb_build_object(
    'reason', 'The new file drawer wrote contract_path, contract_url and contract_filename as empty strings when no contract was attached. An empty string reads as a contract to anything testing for the key rather than the value. Keys removed so absence means absence, matching what removing a contract from a file already does.',
    'source_fix', 'aari-transactions-landing branch claude/contract-key-absent-when-no-contract',
    'removed_at', now()
  )
from _blank_ids b;

commit;
