-- The assessment roll does not keep its own addresses tidy. 344 E Sugarland Hwy
-- in Clewiston is stored with a double space, so an agent typing the address
-- normally got not_found for a property that plainly exists. A wrong not_found
-- is worse than an honest failure: it tells the agent the property is not there.
--
-- The lookup now retries with a relaxed pattern when the exact one finds
-- nothing, and records which pattern produced the answer, so a relaxed match is
-- never passed off as an exact one.
alter table realty_parcel_lookups
  add column if not exists match_mode text
    check (match_mode in ('exact','relaxed'));

comment on column realty_parcel_lookups.match_mode is
  'exact: the address matched the roll as typed. relaxed: it matched only after the internal spacing was loosened, because the roll stores irregular whitespace.';
