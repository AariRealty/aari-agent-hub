-- realty_transactions.lifecycle: put it under the database's control.
--
-- Why: lifecycle decides which bucket a file lands in on every Deals screen,
-- Active, Closed or Terminated. Before this it was a plain nullable text
-- column with no default, no trigger and no generation expression. All 56
-- rows carried a value only because somebody set them by hand once. Any
-- insert that omitted it, including every version of masterdata-import up to
-- 29 August, wrote a null, and a null matched none of the three filters, so
-- the file vanished from the screen with no error.
--
-- Checked before writing this: 56 rows, 0 null, 0 outside the three values.
-- So the constraint can be validated immediately rather than NOT VALID.
--
-- Reversible:
--   alter table realty_transactions alter column lifecycle drop not null;
--   alter table realty_transactions alter column lifecycle drop default;

begin;

-- Belt for the rows already there, in case anything lands between the check
-- above and this running.
update realty_transactions
   set lifecycle = case when status = 'paid' then 'Closed' else 'Active' end
 where lifecycle is null
    or lifecycle not in ('Active', 'Closed', 'Terminated');

alter table realty_transactions
  alter column lifecycle set default 'Active';

alter table realty_transactions
  alter column lifecycle set not null;

-- The CHECK already existed, reading
--   CHECK (lifecycle = ANY (ARRAY['Active','Closed','Terminated']))
-- and it never protected anything: a CHECK evaluates to NULL for a NULL value,
-- and NULL is not FALSE, so an insert omitting lifecycle passed it cleanly.
-- NOT NULL plus the default above is what actually closes the hole. Adding the
-- constraint again fails with 42710, so it is deliberately not repeated here.

comment on column realty_transactions.lifecycle is
  'What happened to the deal: Active, Closed or Terminated. Distinct from status, which is where the file sits in the brokerage pipeline (draft, submitted, paid). Neither is derivable from the other: a terminated file sits at status = draft.';

commit;
