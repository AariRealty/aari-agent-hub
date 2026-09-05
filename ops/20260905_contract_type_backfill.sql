-- Wire the extractor to the deadline engine. 5 September 2026.
--
-- The extractor writes a human label ("AS IS Residential") into
-- raw_form_data.extracted_contract.fields.contract_type. The engine reads
-- files.contract_type and needs a code key ("frbar_asis"). The translator
-- already existed at files.html:20544 in aari-transactions-landing and was only
-- ever used as a render-time display fallback; it never persisted anything.
--
-- mapContractForm below is transcribed from that function for the backfill
-- only. The extractor itself got the JavaScript original, verbatim, so there is
-- one implementation copied rather than two written.
--
-- ONLY WHERE THE COLUMN IS NULL. A TC who picked frbar_standard over the
-- extractor's guess must survive a re-extraction.
--
-- Result: 8 rows. 5 frbar_asis, 3 frbar_standard. Column count 15 -> 23.
-- No pre-existing value changed: every backfilled row carries a
-- contract_type_source marker and none of the original 15 has one.
create or replace function pg_temp.map_contract_form(label text) returns text
language plpgsql immutable as $$
declare s text := lower(coalesce(label,''));
begin
  if s = '' then return ''; end if;
  if position('builder' in s)>0 or position('construction' in s)>0
     or position('to be built' in s)>0 or position('to be constructed' in s)>0 then return 'builder'; end if;
  if position('vac' in s)>0 or position('vacant' in s)>0 then
    return case when position('nabor' in s)>0 or position('088' in s)>0 then 'nab088' else 'vac_15' end; end if;
  if position('commercial' in s)>0 or position('cc-6' in s)>0 or position('cc6' in s)>0 then return 'cc_6'; end if;
  if position('crsp' in s)>0 then return 'frbar_crsp'; end if;
  if position('nabor' in s)>0 or position('nab089' in s)>0 or position('089' in s)>0 then
    return case when position('as-is' in s)>0 or position('as is' in s)>0 or position('089' in s)>0
                then 'nab089' else 'nabor' end; end if;
  if position('vlla' in s)>0 then return 'vlla_6'; end if;
  if position('ers' in s)>0 or (position('listing' in s)>0 and position('vacant' in s)=0) then return 'ers_21tn'; end if;
  if position('cl-11' in s)>0 or position('contract to lease' in s)>0 then return 'cl_11'; end if;
  if position('lease' in s)>0 then return 'rlhd_3x'; end if;
  if position('bba' in s)>0 or position('buyer' in s)>0 then
    return case when position('non' in s)>0 then 'bbe_2' else 'bbe_1' end; end if;
  if position('standard' in s)>0 then return 'frbar_standard'; end if;
  if position('fr/bar' in s)>0 or position('frbar' in s)>0 or position('far/bar' in s)>0
     or position('as-is' in s)>0 or position('as is' in s)>0 then return 'frbar_asis'; end if;
  return '';
end $$;

with tgt as (
  select id,
         pg_temp.map_contract_form(raw_form_data->'extracted_contract'->'fields'->>'contract_type') as key,
         raw_form_data->'extracted_contract'->'fields'->>'contract_type' as label
  from files
  where contract_type is null
    and nullif(pg_temp.map_contract_form(raw_form_data->'extracted_contract'->'fields'->>'contract_type'),'') is not null
)
update files f
set contract_type = t.key,
    raw_form_data = jsonb_set(coalesce(f.raw_form_data,'{}'::jsonb), '{contract_type_source}',
      jsonb_build_object('from','extractor_label','label',t.label,'mapped_to',t.key,
                         'via','mapContractForm files.html:20544','at', now()))
from tgt t
where f.id = t.id and f.contract_type is null;

-- Worth knowing before anyone expects schedules to appear: none of the 8 has an
-- effective_date, so none computes a schedule yet. The backfill moves them from
-- "Pick a contract type" to "Enter both Effective and Closing dates", which is a
-- more accurate empty state, not a filled one. 14 files of 64 compute a full
-- schedule today.
