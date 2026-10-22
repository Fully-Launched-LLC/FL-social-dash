-- 036: the Assets library (Tait, 2026-10-22: "change the name of the
-- library tab to assets... a tab along the top with music, sound effects,
-- LUTs/powergrades and motion graphics and fonts too... i want to be able to
-- assign certain assets to certain clients... build an asset database for
-- each client so that the editors can pull from a folder of all the
-- favorited assets for one client"). Safe to re-run. Run after 035.
--
-- social_style_assets (026, 028) holds every asset across Fully Launched,
-- now in five kinds, each file with its full folder path as on the drive
-- (folder_path, e.g. "Camera sounds/shutter clicks") so the page can show
-- folders like Finder. social_client_assets says which assets each client
-- has: their own asset database. The bridge builds a folder of them on the
-- Mac for the editors (bridge.py assets export).

alter table social_style_assets drop constraint if exists social_style_assets_kind_check;
alter table social_style_assets add constraint social_style_assets_kind_check
  check (kind in ('music', 'sfx', 'lut', 'motion', 'font', 'caption_line', 'video_type'));
alter table social_style_assets add column if not exists folder_path text;   -- "" = the category's top level
alter table social_style_assets add column if not exists file_type text;     -- e.g. wav, cube, drx, mov, otf
alter table social_style_assets add column if not exists made_by text;       -- e.g. "Sound Designer" for ones the team made

-- Existing music and sound effects: the folder path from where the file sits.
update social_style_assets
   set folder_path = coalesce(nullif(regexp_replace(regexp_replace(path, '^editor/public/clients/_(music|sfx/library)/?', ''), '/?[^/]*$', ''), ''), '')
 where folder_path is null and path is not null;

create table if not exists social_client_assets (
  client_id uuid not null references social_clients(id) on delete cascade,
  asset_id uuid not null references social_style_assets(id) on delete cascade,
  note text,                                   -- why it suits them
  added_by text default 'tait',
  created_at timestamptz not null default now(),
  primary key (client_id, asset_id)
);
create index if not exists social_client_assets_asset_idx on social_client_assets(asset_id);
alter table social_client_assets enable row level security;

drop policy if exists "operators manage client assets" on social_client_assets;
create policy "operators manage client assets" on social_client_assets
  for all to authenticated using (social_is_operator()) with check (social_is_operator());

-- Editors read what's in the library and which client has what, so they
-- can pull a client's favourites.
drop policy if exists "editors read style assets" on social_style_assets;
create policy "editors read style assets" on social_style_assets
  for select to authenticated using (social_current_editor_id() is not null);
drop policy if exists "editors read client assets" on social_client_assets;
create policy "editors read client assets" on social_client_assets
  for select to authenticated using (social_current_editor_id() is not null);
