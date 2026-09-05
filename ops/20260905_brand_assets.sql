-- Applied 5 September 2026. The record of what was run, not a plan.
--
-- Somewhere for the logos to live, and a manifest so adding one later is a row
-- and an upload rather than a deploy.
--
-- The bucket is private. A brokerage logo is not a secret, but there is no
-- reason to leave it on an open url either: an agent signs in, the Hub signs a
-- link for them at the moment they press Download, and the link expires. No
-- third party sits between an agent and their own brokerage's files.
--
-- The three files, and the sha256 each was verified against on upload:
--   aari-realty-logo.png              2023x856   84,526 bytes
--     c2d51758a2180ee1...  the source logo cropped to its artwork
--   aari-realty-logo-small.png         208x88     7,639 bytes
--     fda615f0f7b2bf05...  assets/logo-mark.png, unchanged
--   aari-realty-logo-full-canvas.png  2304x2880 112,486 bytes
--     09939ae9b02c8c9c...  logo.png, unchanged
--
-- Nothing was drawn or recoloured. The crop was checked by pasting the result
-- back onto a blank canvas of the original size and comparing every pixel.

insert into storage.buckets (id, name, public, file_size_limit)
values ('realty-brand', 'realty-brand', false, 26214400)
on conflict (id) do nothing;

drop policy if exists realty_brand_member_read on storage.objects;
create policy realty_brand_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'realty-brand'
    and exists (
      select 1 from public.realty_members m
      where m.user_id = auth.uid() and m.status = 'active'
    )
  );

create table if not exists public.realty_brand_assets (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  storage_path  text not null unique,
  file_name     text not null,
  mime          text not null default 'image/png',
  bytes         integer,
  width         integer,
  height        integer,
  background    text,
  sort          integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.realty_brand_assets enable row level security;

drop policy if exists realty_brand_assets_member_read on public.realty_brand_assets;
create policy realty_brand_assets_member_read on public.realty_brand_assets
  for select to authenticated
  using (exists (
    select 1 from public.realty_members m
    where m.user_id = auth.uid() and m.status = 'active'
  ));

drop policy if exists realty_brand_assets_broker_write on public.realty_brand_assets;
create policy realty_brand_assets_broker_write on public.realty_brand_assets
  for all to authenticated
  using (exists (
    select 1 from public.realty_members m
    where m.user_id = auth.uid() and m.role = 'broker' and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.realty_members m
    where m.user_id = auth.uid() and m.role = 'broker' and m.status = 'active'
  ));

insert into public.realty_brand_assets
  (title, description, storage_path, file_name, mime, bytes, width, height, background, sort)
values
  ('Logo, full size',
   'The logo on its own, transparent background, black artwork. Use this one unless you have a reason not to.',
   'aari-realty-logo.png', 'Aari-Realty-logo.png', 'image/png', 84526, 2023, 856, 'transparent', 0),
  ('Logo, small',
   'The same lockup at 208 pixels wide. For an email signature or anywhere the full size file is heavier than it needs to be.',
   'aari-realty-logo-small.png', 'Aari-Realty-logo-small.png', 'image/png', 7639, 208, 88, 'transparent', 1),
  ('Logo on the original canvas',
   'The source file as it came, with the artwork sitting in the middle of a much larger transparent square. Here in case something expects that shape.',
   'aari-realty-logo-full-canvas.png', 'Aari-Realty-logo-full-canvas.png', 'image/png', 112486, 2304, 2880, 'transparent', 2)
on conflict (storage_path) do update set
  title = excluded.title, description = excluded.description, file_name = excluded.file_name,
  bytes = excluded.bytes, width = excluded.width, height = excluded.height,
  background = excluded.background, sort = excluded.sort, active = true;

alter table public.realty_toolbox drop constraint realty_toolbox_route_known;
alter table public.realty_toolbox add constraint realty_toolbox_route_known
  check (route is null or route = any (array[
    'vendors','plan','training','roster','subscription','prompts','calendar','listing','logos'
  ]));

update public.realty_toolbox
   set route = 'logos',
       description = 'Download the logo. Transparent PNG, three sizes.'
 where title = 'Aari logos';
