-- Public records parcel lookups, cached and audited.
--
-- Transcribed from the live table on 5 September 2026 so the repository and the
-- database say the same thing. There is one definition of this table, not two.
--
-- TWO JOBS, NOT ONE. The obvious one is the cache: the same address is looked
-- up repeatedly while an offer is being written, and there is no reason to ask
-- the county four times in ten minutes.
--
-- The other job is the audit. Every row records what was asked, which layer
-- answered, how long it took, and what came back, including the failures. A
-- blank field on a contract has to be explainable months later, and "Hendry did
-- not answer at 09:26 on 5 September" is an explanation. An empty field with
-- nothing behind it is not.
create table if not exists realty_parcel_lookups (
  id                  uuid primary key default gen_random_uuid(),
  address_query       text not null,
  county              text not null,

  -- Every outcome is named. A field left blank always carries one of these.
  outcome             text not null check (outcome in
                        ('found','not_found','ambiguous','county_unsupported','timeout','blocked','error')),

  source              text,
  source_url          text,

  -- The owner name is only as current as the roll it came from, so the roll
  -- year sits beside it and is always rendered with it.
  roll_year           text,

  -- Paragraph 1(b).
  parcel_id           text,

  -- Paragraph 1(c). Only Lee publishes a legal description long enough to put
  -- in a contract. The FDOR roll's S_LEGAL is a stub, 17 characters on the
  -- Punta Gorda probe, so it is stored but flagged and never offered for 1(c).
  legal_description   text,
  legal_is_short_form boolean not null default false,

  owner_of_record     text,
  year_built          text,
  acres               numeric,
  matched_address     text,

  -- 0 on a miss, so a not_found row states the count rather than leaving it null.
  candidates          integer not null default 0,

  error_detail        text,
  duration_ms         integer,
  raw                 jsonb,
  fetched_at          timestamptz not null default now()
);

create index if not exists realty_parcel_lookups_query_idx
  on realty_parcel_lookups (lower(address_query), county, fetched_at desc);

-- Service role only: RLS on, no policies. The edge function reads and writes it
-- through the service key; nothing in the browser touches it directly.
alter table realty_parcel_lookups enable row level security;
