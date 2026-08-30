-- realty_members.start_date: make it required.
--
-- NOT APPLIED. It cannot be, yet.
--
-- start_date is null on all 8 members, agents and broker alike. It has never
-- been populated once. It is also the field that answers whether an agent is
-- on a grandfathered plan or a stale one, which is the question that could
-- not be settled from the database on 29 August.
--
-- NOT NULL cannot go on until the 8 existing rows carry a real date, and
-- there is nowhere in the Hub to get one from: the signed ICA is the system
-- of record. Backfill from the ICAs first, then run this.
--
-- Deliberately no default. A default here would silently stamp today's date
-- on a backfilled agent and make a wrong answer look like a real one, which
-- is exactly the failure this column is meant to prevent.

begin;

-- Refuses to run until every row has a date, rather than filling one in.
do $$
declare missing int;
begin
  select count(*) into missing from realty_members where start_date is null;
  if missing > 0 then
    raise exception 'start_date is null on % member row(s). Backfill from the signed ICAs before running this migration.', missing;
  end if;
end $$;

alter table realty_members
  alter column start_date set not null;

comment on column realty_members.start_date is
  'The date the agent started with the brokerage, taken from the signed ICA, which is the system of record. Required. Determines which commission structure applied when they joined.';

commit;
