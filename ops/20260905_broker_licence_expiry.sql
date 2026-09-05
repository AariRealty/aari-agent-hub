-- Broker card licence expiry rendered "Not set".
--
-- The card is not broken. hub_payload reads realty_members.license_expires_at
-- and renders "Not set" when it is null, which was the truth: the column was
-- null on the broker row while license_number already held BK3530153.
--
-- So this is a data fix, not a code change. Writing 03/31/2028 into the markup
-- would have created a second copy of a fact that expires, in a file nobody
-- would think to check in March 2028.
--
-- Guarded on the current value being null so a re-run cannot overwrite a date
-- someone has since corrected.
update realty_members
set license_expires_at = date '2028-03-31'
where user_id = '9fa206b8-45e9-46bb-ba98-79c2e8361661'
  and license_number = 'BK3530153'
  and license_expires_at is null;

-- Applied 5 September 2026. One row.
--
-- Still open, and larger: seven agents carry no licence number and no expiry,
-- which is the roster compliance work running beside all of this.
