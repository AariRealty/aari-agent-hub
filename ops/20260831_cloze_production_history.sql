-- Pre brokerage production history, loaded 2026-08-31.
--
-- 16 closed deals from the Cloze CRM export that appear nowhere in the Hub.
-- Every one of them closed before Aari Realty's first SkySlope file
-- (2026-03-25), so they are production history, not company revenue:
--
--   no company_fee, so they cannot reach the 2026 revenue reconciliation
--   no gross_commission, because Cloze carries no commission figure for a
--   closed deal and a number nobody recorded is not a number to invent
--   legacy_source 'cloze' and import_batch 'cloze-20260831', so the whole
--   load lifts back out with one delete
--
-- Two things in here need a human eye, and both are called out in the row's
-- own notes column rather than left for someone to notice:
--
--   3700 33rd St SW appears twice, Marlenyi at 300000 on 2025-05-30 and
--   Milennys at 309900 on 2025-06-02. Two sales or two sides of one.
--
--   Eight rows are keyed in Cloze to a client, not an agent. They are
--   attributed to Marlenyi L. Paredes because that is how the 42 rows
--   already in the table were imported. That is an inference, not a fact.

insert into realty_transactions
  (agent_id, tx_type, property_address, side, price, closing_date, status, lifecycle,
   gross_commission, company_fee, is_vacant_land, legacy_source, import_batch, notes)
values
('10ad1f03-6b5b-4bbb-b98f-91438aef3fd1','residential_sale','1314 Cleveland Ave, Lehigh Acres, FL 33974',null,28000.0,'2025-10-21','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-10-21, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.'),
('afe94e3e-f5ef-4155-8248-2aca41506048','residential_sale','909 Edgerton Ave, Lehigh Acres, FL 33974',null,16000.0,'2025-11-07','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-11-07, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','331 New Jersey Pl, Banyan Village, FL 33935',null,16000.0,'2023-08-02','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2023-08-02, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','3716 3rd St SW, Lehigh Acres, FL 33976',null,260000.0,'2023-10-27','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2023-10-27, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','2901 E 14th St, Lehigh Acres, FL 33972',null,16500.0,'2024-10-24','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2024-10-24, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','3700 33rd St SW, Lehigh Acres, FL 33976',null,300000.0,'2025-05-30','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-05-30, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. Cloze marks this a second transaction on this address in Cloze.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','8079 Thurso Rd, Port Charlotte, FL 33981',null,15000.0,'2025-10-23','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-10-23, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','1802 Fitch Ave, Lehigh Acres, FL 33974','buyer',15000.0,'2025-10-27','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-10-27, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','1802 Fitch Ave, Lehigh Acres, FL 33974','seller',15000.0,'2025-10-27','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-10-27, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','2916 21st SW, Lehigh Acres, FL 33976',null,289900.0,'2025-11-10','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-11-10, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','7302 Lobelia Rd, Lehigh Acres, FL 33976',null,385000.0,'2025-11-20','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-11-20, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('9fa206b8-45e9-46bb-ba98-79c2e8361661','residential_sale','2121 Scott Ave, Lehigh Acres, FL 33972',null,25000.0,'2025-12-02','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-12-02, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented. The Cloze record names a client rather than an agent; attributed to Marlenyi L. Paredes to match the 42 rows already imported that way. Reassign if that is wrong.'),
('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','3700 33rd St SW, Lehigh Acres, FL 33976',null,309900.0,'2025-06-02','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-06-02, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.'),
('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','905 Magnolia Ave, Lehigh Acres, FL 33972',null,31000.0,'2025-09-02','paid','Closed',null,null,true,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-09-02, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.'),
('f346659d-ea0c-40a0-b02f-e099cdb3cd41','residential_sale','2616 12th St SW, Lehigh Acres, FL 33976',null,299900.0,'2025-11-28','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-11-28, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.'),
('9323cf18-ca59-4cff-81a1-b55113fbd32b','residential_lease','44494 Diamond Trl, Punta Gorda, FL 33982',null,2700.0,'2025-12-01','paid','Closed',null,null,false,'cloze','cloze-20260831','Closed production imported from the Cloze CRM export on 2026-08-31. Closed 2025-12-01, before Aari Realty''s first SkySlope file (2026-03-25), so it is production history and carries no company fee. Cloze records no commission figure, so none is invented.');

-- --------------------------------------------------------------------------
-- Attribution corrections, same day, after the broker reviewed the load.
--
-- The premise of the import was wrong. Cloze puts an agent's name in the same
-- column it uses for a client's, so a departed agent is indistinguishable
-- from a customer. Eight closings were attributed to the broker on that
-- basis. Two of those names turned out to be agents:
--
--   Kendrick Pena   former agent, four closings, 704,900 of volume
--   Claudia Gibbs   former agent, one closing, 15,000
--
-- The distinction that resolved it, and which the first pass failed to draw:
-- a contact and a closing are different records. The client relationships on
-- these files are the broker's and live in agent_contacts, which nothing in
-- this work has ever written to. The closing is credited to whoever worked
-- the file, which can be an agent whose client the broker owns.
--
-- Claudia Gibbs's row moved three times on 2026-08-31 (to her, back to the
-- broker, to her again) because that distinction was not put to the broker
-- plainly the first time. The statements below are the settled result, not
-- the route taken to it.
--
-- The remaining three names (Beatriz Garcia-Alvarez, Peter Stoupas, Arcela
-- Gomez Carmona) are clients, confirmed by the broker, and their closings
-- stay with her.

-- Two history-only accounts. realty_members.user_id is a foreign key to
-- auth.users, so a terminated member needs an auth row. These carry no
-- email, no password and no identity row, and are banned until 2999: enough
-- to satisfy the constraint, not enough to sign in. Neither appears on the
-- active roster, which stays at seven.
do $$
declare n text;
begin
  foreach n in array array['Kendrick Pena','Claudia Gibbs'] loop
    with u as (
      insert into auth.users (id, instance_id, aud, role, banned_until,
                              raw_app_meta_data, raw_user_meta_data)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', '2999-01-01',
              '{"provider":"none","history_only":true}'::jsonb,
              '{"note":"Former agent. Record exists only to attribute historical production."}'::jsonb)
      returning id
    )
    insert into realty_members (user_id, role, status, full_name, created_by)
    select id, 'agent', 'terminated', n, '9fa206b8-45e9-46bb-ba98-79c2e8361661' from u;
  end loop;
end $$;

-- Kendrick Pena, four closings.
update realty_transactions set
  agent_id = (select user_id from realty_members where full_name = 'Kendrick Pena')
where import_batch = 'cloze-20260831'
  and property_address in ('1802 Fitch Ave, Lehigh Acres, FL 33974',
                           '2916 21st SW, Lehigh Acres, FL 33976',
                           '7302 Lobelia Rd, Lehigh Acres, FL 33976');

-- Claudia Gibbs, one closing. The client is the broker's, the closing is hers.
update realty_transactions set
  agent_id = (select user_id from realty_members where full_name = 'Claudia Gibbs')
where import_batch = 'cloze-20260831'
  and property_address = '8079 Thurso Rd, Port Charlotte, FL 33981';

-- 3700 33rd St SW was one sale, not two. Cloze held it twice, at 300,000 on
-- 2025-05-30 and at 309,900 on 2025-06-02. Broker confirmed a single sale at
-- 309,900 split 50/50 with Milennys Vargas. Both rows carry the true price
-- and date, and each agent is credited a side, so summing price across the
-- two double counts volume. No money double counts: neither row carries a
-- commission or a company fee.
update realty_transactions set price = 309900, closing_date = '2025-06-02'
where import_batch = 'cloze-20260831'
  and property_address = '3700 33rd St SW, Lehigh Acres, FL 33976';

-- 1912 NW 24th Ave appears under Claudia Gibbs in Cloze (December 2025) and
-- under Milennys Vargas on the listing restored from the 2026-08-01 deletion.
-- Broker confirmed Milennys: Claudia listed it, it expired, Milennys
-- relisted. The live row is left alone and the conflict is recorded on it.

-- Not loaded: Claudia Gibbs's eleven other listings. Nine expired 2025-03-31
-- and two 2025-12-31, so loading them as Active would have put roughly half a
-- million dollars of dead inventory on the Listings screen.

-- Settled state of the 16, verified against the project on 2026-08-31:
--
--   Kendrick Pena       terminated   4   704,900
--   Milennys Vargas     active       3   640,800
--   Marlenyi L. Paredes active       5   627,400
--   Alied Machuca       active       1    28,000
--   Ana Puentes         suspended    1    16,000
--   Claudia Gibbs       terminated   1    15,000
--   Roosevelt Sanchez   active       1     2,700
--
-- Company revenue 2026 is unaffected at 14,532.13 and the broker's own 2026
-- earned figure at 37,797.47, because none of this history carries money.
