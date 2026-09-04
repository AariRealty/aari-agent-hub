-- On 2026-08-01 seven rows were deleted from realty_transactions by an ad hoc
-- statement whose own note claimed the source rows were kept. Nothing in the
-- migration history and nothing in cron did it, so there is no job to disable.
-- This makes the next attempt fail loudly instead of losing the rows silently.
--
-- Terminating a deal is a lifecycle change, not a delete. A deliberate delete
-- is still possible, but it has to say so in the same transaction and it
-- leaves an audit_log row carrying the whole record.

create or replace function realty_transactions_block_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('aari.allow_tx_delete', true), '') <> 'yes' then
    raise exception
      'realty_transactions rows must not be deleted. Set lifecycle to Terminated instead. To delete on purpose, run: select set_config(''aari.allow_tx_delete'', ''yes'', true); in the same transaction.'
      using errcode = 'raise_exception';
  end if;

  insert into audit_log (actor_id, actor_type, action, target_table, target_id, details)
  values (
    auth.uid(), 'system', 'realty_tx_delete', 'realty_transactions', old.id,
    to_jsonb(old)
  );
  return old;
end;
$$;

drop trigger if exists trg_realty_transactions_block_delete on realty_transactions;
create trigger trg_realty_transactions_block_delete
  before delete on realty_transactions
  for each row execute function realty_transactions_block_delete();

revoke execute on function realty_transactions_block_delete() from public, anon, authenticated;
