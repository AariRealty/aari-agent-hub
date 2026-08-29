-- Applied to project fnlrgmuvtgwzjsihqxcn on 18 Aug 2026.
--
-- masterdata-import already existed and writes straight into
-- realty_transactions. Rather than redeploy it, this puts anything it inserts
-- into the review queue at the database level, so the rule holds no matter
-- which code path does the insert. Only new open files enter review; a closed
-- and paid row is history, not something to ask an agent about.

create or replace function public.realty_tx_enter_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_state is null and new.status in ('draft','submitted') then
    new.review_state := 'pending';
  end if;
  if new.import_source is null and coalesce(new.notes,'') like 'SkySlope MasterData%' then
    new.import_source := 'skyslope';
    new.import_batch  := coalesce(new.import_batch, to_char(now(), 'YYYY-MM-DD'));
  end if;
  return new;
end $$;

drop trigger if exists realty_tx_enter_review_trg on public.realty_transactions;
create trigger realty_tx_enter_review_trg
  before insert on public.realty_transactions
  for each row execute function public.realty_tx_enter_review();
