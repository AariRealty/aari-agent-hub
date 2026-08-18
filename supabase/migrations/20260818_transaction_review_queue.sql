-- Applied to project fnlrgmuvtgwzjsihqxcn on 18 Aug 2026.
--
-- Broker imports a weekly report; every row waits on the agent it belongs to.
-- The agent accepts it, proposes a correction, or says it is not theirs, and a
-- correction does not take effect until the broker approves it.
--
-- Strictly additive: new nullable columns and one new table. Nothing dropped,
-- no existing row rewritten.

alter table public.realty_transactions
  add column if not exists review_state  text,
  add column if not exists review_by     uuid references auth.users(id),
  add column if not exists review_at     timestamptz,
  add column if not exists review_note   text,
  add column if not exists import_source text,
  add column if not exists import_batch  text,
  add column if not exists external_id   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'realty_transactions_review_state_chk') then
    alter table public.realty_transactions
      add constraint realty_transactions_review_state_chk
      check (review_state is null or review_state in ('pending','accepted','edited','rejected'));
  end if;
end $$;

create unique index if not exists realty_transactions_external_id_key
  on public.realty_transactions (external_id) where external_id is not null;
create index if not exists realty_transactions_review_state_idx
  on public.realty_transactions (review_state) where review_state is not null;

create table if not exists public.realty_transaction_edits (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.realty_transactions(id) on delete cascade,
  proposed_by    uuid references auth.users(id),
  field          text not null,
  old_value      text,
  new_value      text,
  note           text,
  state          text not null default 'proposed'
                 check (state in ('proposed','approved','declined')),
  created_at     timestamptz not null default now(),
  resolved_by    uuid references auth.users(id),
  resolved_at    timestamptz
);

create index if not exists realty_transaction_edits_tx_idx
  on public.realty_transaction_edits (transaction_id, created_at desc);
create index if not exists realty_transaction_edits_open_idx
  on public.realty_transaction_edits (state) where state = 'proposed';

alter table public.realty_transaction_edits enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename='realty_transaction_edits' and policyname='rtxe_read') then
    create policy rtxe_read on public.realty_transaction_edits
      for select using (
        proposed_by = auth.uid()
        or is_realty_broker()
        or exists (select 1 from public.realty_transactions t
                   where t.id = realty_transaction_edits.transaction_id
                     and t.agent_id = auth.uid())
      );
  end if;
end $$;
