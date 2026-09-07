-- The clause register.
--
-- WHAT IT IS. A contract read once, listed as its terms: what each clause says,
-- where to read it, and whether it is the printed form, something bargained, or
-- something unusual. It is the thing that lets a coordinator understand an
-- unusual contract without reading all twenty pages.
--
-- RULE ONE. CLAUSE SEVERITY NEVER MERGES WITH RISK FLAGS.
--
-- They answer different questions. A risk flag says "this file has a defect and
-- someone must act": its vocabulary is stop and check, enforced in
-- build/test-flags.js by /^(stop|check)$/. A clause severity says "this term
-- reads like this, here is the page": standard, negotiated, unusual.
--
-- The two vocabularies are deliberately disjoint, so the words alone make the
-- merge impossible. A negotiated closing date is not a problem. If it ever
-- rendered next to a stop, an ordinary term would start looking like a defect,
-- and the register would make the screen less trustworthy rather than more.
-- They live in different tables and share no column.
--
-- RULE TWO. THE MODEL CLASSIFIES AND LOCATES, IT NEVER INVENTS.
--
-- Every row carries a quote and the page it was found on, and no row is stored
-- until code has found that quote in that page's own text. A clause the model
-- describes but cannot be located is discarded and counted, never stored. The
-- count is kept on the run so "how much did it make up" is a number you can
-- read rather than a matter of trust.

create table if not exists realty_clause_runs (
  id                uuid primary key default gen_random_uuid(),
  file_id           uuid not null,
  -- Every outcome is named. There is no silent one.
  outcome           text not null check (outcome in
                      ('registered','no_contract','unreadable','no_clauses_found',
                       'all_rejected','model_error','model_unavailable','error')),
  model             text,
  pages             integer,
  chars             integer,
  clauses_returned  integer not null default 0,
  clauses_kept      integer not null default 0,
  -- The "never invents" number. A clause the model described but that could not
  -- be found in the document is counted here and thrown away.
  clauses_rejected  integer not null default 0,
  input_tokens      integer,
  output_tokens     integer,
  usd               numeric(10,6),
  duration_ms       integer,
  error_detail      text,
  created_at        timestamptz not null default now()
);

create table if not exists realty_contract_clauses (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references realty_clause_runs(id) on delete cascade,
  file_id        uuid not null,
  ordinal        integer not null,
  title          text not null,
  category       text,
  -- Disjoint from the risk flag vocabulary by construction. See RULE ONE.
  severity       text not null check (severity in ('standard','negotiated','unusual')),
  -- Verified page. Never the page the model claimed unless the quote was
  -- actually found there.
  page           integer not null,
  document       text,
  quote          text not null,
  -- True on every stored row, by construction: an unverified clause is not
  -- stored at all. The column exists so the guarantee is visible in the data
  -- rather than only in the code that wrote it.
  quote_verified boolean not null default true,
  -- Set when the model named one page and the quote was found on another. The
  -- stored page is the one the text is actually on.
  page_corrected boolean not null default false,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists realty_contract_clauses_file_idx
  on realty_contract_clauses (file_id, created_at desc);
create index if not exists realty_clause_runs_file_idx
  on realty_clause_runs (file_id, created_at desc);

-- A stored clause that is not verified would be a lie the schema permits, so
-- the schema does not permit it.
alter table realty_contract_clauses
  drop constraint if exists realty_contract_clauses_verified_only;
alter table realty_contract_clauses
  add constraint realty_contract_clauses_verified_only check (quote_verified);

alter table realty_clause_runs      enable row level security;
alter table realty_contract_clauses enable row level security;
