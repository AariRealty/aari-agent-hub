-- Applied 4 September 2026. The record of what was run, not a plan.
--
-- The Listing description writer tile had no destination. The work behind it
-- already existed: generate-listing-description has been deployed since May
-- and nothing in the repository called it. The route column is constrained so
-- a typo cannot become a dead tile, so the constraint had to learn the new
-- value before the tile could point at it.

alter table realty_toolbox drop constraint realty_toolbox_route_known;
alter table realty_toolbox add constraint realty_toolbox_route_known
  check (route is null or route = any (array[
    'vendors','plan','training','roster','subscription','prompts','calendar','listing'
  ]));

update realty_toolbox
   set route = 'listing',
       description = 'MLS remarks from the three things that sell it, held to Fair Housing and the 1200 character cap.'
 where title = 'Listing description writer';
