-- Transaction reconciliation, 2026-08-30.
--
-- Run once, already applied to fnlrgmuvtgwzjsihqxcn. Kept in the repo so the
-- provenance of every figure below is on the record.
--
-- Sources, in the order they were trusted:
--   1. Aari_Realty_Transactions_2026.csv   the broker's own revenue sheet.
--      Authoritative for money: it is the only source carrying company net
--      per deal. No fee is computed anywhere below, every figure is copied.
--   2. MasterDataReport_5.xlsx             SkySlope. Authoritative for dates
--      and for which agent owns a file.
--   3. Cloze CRM export                    the only record of pre brokerage
--      production. Not loaded here; those closings pre-date Aari Realty's
--      first SkySlope file (2026-03-25) and how they should count is the
--      broker's call.
--
-- Every row written carries import_batch = 'restore-20260830' or a note
-- saying where its numbers came from, so all of this is reversible.

-- Backup taken before anything was written.
create table if not exists realty_transactions_backup_20260830 as
  select * from realty_transactions;

-- 1. The seven rows deleted on 2026-08-01. Identity recovered from
--    realty_listings, whose migration note claimed the source rows were kept.
--    Only Diamond Trl has figures, and they come from the revenue sheet.
--    The other six are listings with no contract: draft, no invented numbers.
insert into realty_transactions
  (agent_id, tx_type, property_address, side, price, closing_date, status, lifecycle,
   gross_commission, company_fee, import_source, import_batch, notes)
values
  ('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','1201 W 11th Street, Lehigh Acres, FL 33972','seller',345000,null,'draft','Active',null,null,'recovery','restore-20260830','Recovered 2026-08-30 from realty_listings.'),
  ('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','783 Pine Cone Avenue, Montura Ranches, FL 33440','seller',73000,null,'draft','Active',null,null,'recovery','restore-20260830','Recovered 2026-08-30 from realty_listings.'),
  ('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','1912 NW 24th Avenue, Cape Coral, FL 33993','seller',65000,null,'draft','Active',null,null,'recovery','restore-20260830','Recovered 2026-08-30 from realty_listings.'),
  ('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','844 Bell Boulevard, Lehigh Acres, FL 33974','seller',20000,null,'draft','Active',null,null,'recovery','restore-20260830','Recovered 2026-08-30 from realty_listings.'),
  ('10ad1f03-6b5b-4bbb-b98f-91438aef3fd1','residential_sale','1219 Hibiscus Avenue, Lehigh Acres, FL 33972','seller',355000,null,'draft','Active',null,null,'recovery','restore-20260830','Recovered 2026-08-30 from realty_listings. SkySlope shows a contract at 350000 that died 2026-04-10.'),
  ('d208ac22-ece1-4a66-8272-ed8818b9fe1f','residential_sale','2106 Basin St, Port Charlotte, FL 33952','seller',305000,null,'draft','Active',null,null,'recovery','restore-20260830','Recovered 2026-08-30 from realty_listings.'),
  ('9323cf18-ca59-4cff-81a1-b55113fbd32b','residential_lease','44494 Diamond Trl, Punta Gorda, FL 33982','seller',2200,'2026-07-31','paid','Closed',2200,639,'recovery','restore-20260830','Recovered 2026-08-30. Rental owner side. Figures from the 2026 revenue sheet.');

-- 2. The nine deals where the Hub disagreed with the revenue sheet.
update realty_transactions set
  gross_commission=9599.97, company_fee=499, status='paid', lifecycle='Closed', closing_date='2026-08-14'
where property_address='816 Frederick Reid St E, Lehigh Acres, FL 33974';

update realty_transactions set gross_commission=600, company_fee=120
where property_address='11162 sunset preserve dr, Fort Myers, FL 33905';

update realty_transactions set status='paid', lifecycle='Closed', closing_date='2026-08-05', company_fee=499
where property_address='4700 SW 32nd Ave, Naples, FL 34116';

update realty_transactions set lifecycle='Closed', closing_date='2026-08-17', company_fee=499
where property_address='1502 Rush Ave, Lehigh Acres, FL 33972';

update realty_transactions set status='submitted', company_fee=299
where property_address='NW 308th St, Okeechobee, FL 34972';

update realty_transactions set status='submitted', company_fee=3424
where property_address='7896 1st Place, Labelle, FL 33935';

update realty_transactions set company_fee=499     where property_address='1109 Congress Avenue, Lehigh Acres, FL 33972';
update realty_transactions set company_fee=299     where property_address='1607 Roosevelt Ave, Lehigh Acres, FL 33972';
update realty_transactions set company_fee=299     where property_address='19183 NW 288th ST, OKEECHOBEE, FL 34972';
update realty_transactions set company_fee=448.40  where property_address='1514 Wagner Avenue, Lehigh Acres, FL 33972';
update realty_transactions set company_fee=5743.73 where property_address='3222 Deason Ave, Jacksonville, FL 32254';
update realty_transactions set company_fee=556     where property_address='4917 2nd St W, Lehigh Acres, FL 33971';
update realty_transactions set company_fee=110     where property_address='425 Fawnwood Avenue, Lake Placid, FL 33852';

-- 3. The missing seller side, and the two misattributions.
insert into realty_transactions
  (agent_id, tx_type, property_address, side, price, closing_date, status, lifecycle,
   gross_commission, company_fee, import_source, import_batch, notes)
values
  ('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','425 Fawnwood Avenue, Lake Placid, FL 33852','seller',
   11000,'2026-04-24','submitted','Closed',1045.16,598,'revenue_sheet','restore-20260830',
   'Seller side, from the 2026 revenue sheet (deal P-1). Only the buyer side (P-5) was in the Hub.');

update realty_transactions set agent_id='f346659d-ea0c-40a0-b02f-e099cdb3cd41'
where property_address='223 Lane Ave, Jacksonville, FL';   -- sheet and SkySlope 21907471 both name Milennys

update realty_transactions set agent_id='f346659d-ea0c-40a0-b02f-e099cdb3cd41'
where property_address='2910 16TH ST W';                   -- Cloze names Milennys; price left alone, no closing statement

-- Verification: this must equal the revenue sheet exactly.
--   15 deals | volume 2,052,698.00 | gross 56,797.10 | company net 14,532.13
select count(*) as deals, round(sum(price),2) as volume,
       round(sum(gross_commission),2) as gross, round(sum(company_fee),2) as company_net
from realty_transactions
where company_fee is not null and closing_date >= '2026-01-01';
