-- The row cap is a cap, not a count. A condo tower returns as many rows as were
-- asked for, so an ambiguous result that hit the cap must say "or more" rather
-- than reporting the cap as a figure.
alter table realty_parcel_lookups
  add column if not exists candidates_truncated boolean not null default false;

comment on column realty_parcel_lookups.candidates_truncated is
  'true when the query returned as many rows as it asked for, so the candidate count is a floor and not a total.';
