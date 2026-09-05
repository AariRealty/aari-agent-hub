-- Sort order set 5 September 2026: unusual first, then negotiated, then
-- standard, and within a severity the document order.
--
-- Four unusual out of ninety two across four packets is the shortlist, and a
-- shortlist at the bottom of a list of twenty five is not a shortlist.
--
-- Applied in place rather than by re-running the model. Severity and page are
-- already stored and already verified, so the display order can be derived from
-- what is there. Re-reading four contracts to change a sort would have cost
-- $0.58 and produced no new reading.
begin;
with ranked as (
  select id,
         row_number() over (
           partition by run_id
           order by case severity when 'unusual' then 0 when 'negotiated' then 1 else 2 end,
                    page, ordinal
         ) as new_ordinal
  from realty_contract_clauses
)
update realty_contract_clauses c
set ordinal = r.new_ordinal
from ranked r where r.id = c.id and c.ordinal is distinct from r.new_ordinal;

-- Nothing may sit first unless it is the most unusual thing in its run.
-- Returned 0 when applied.
select count(*) as runs_with_wrong_first
from (
  select run_id, (array_agg(severity order by ordinal))[1] as first_sev,
         bool_or(severity = 'unusual') as has_unusual,
         bool_or(severity = 'negotiated') as has_negotiated
  from realty_contract_clauses group by run_id
) t
where (has_unusual and first_sev <> 'unusual')
   or (not has_unusual and has_negotiated and first_sev <> 'negotiated');
commit;
