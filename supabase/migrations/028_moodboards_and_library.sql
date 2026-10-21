-- 028: moodboards and the music & sound effects Library (Unify the System,
-- Phase 4; Tait, 2026-10-21). Safe to re-run. Run after 027.
--
-- Moodboard: Tait drops in screenshots, videos and links of motion
-- graphics, fonts, text styles, colours and video styles he likes, per
-- client (or for every client: client_id null = the house moodboard). The
-- team turns them into the client's Editing guidelines (bridge/bridge.py).
-- Files live in the private 'moodboards' bucket. Operators only.
--
-- Library: the shared music and sound effects (social_style_assets, 026)
-- get a short preview in the private 'library' bucket so the Library page
-- can play them, plus Tait's rating: favourite / never.

create table if not exists social_moodboard_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references social_clients(id) on delete cascade, -- null = every client (house style)
  kind text not null check (kind in ('image', 'video', 'link', 'note')),
  name text,
  storage_path text,                           -- in the 'moodboards' bucket
  url text,                                    -- a link (Instagram, YouTube, a site…)
  note text,                                   -- what Tait likes about it
  used_at timestamptz,                         -- when the team last folded it into the guidelines
  created_at timestamptz not null default now()
);

create index if not exists social_moodboard_items_client_idx on social_moodboard_items(client_id, created_at);
alter table social_moodboard_items enable row level security;

drop policy if exists "operators manage moodboards" on social_moodboard_items;
create policy "operators manage moodboards" on social_moodboard_items
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

alter table social_style_assets add column if not exists folder text;        -- e.g. "Whooshes", "cinematic"
alter table social_style_assets add column if not exists preview_path text;  -- in the 'library' bucket
alter table social_style_assets add column if not exists duration_s numeric;
alter table social_style_assets add column if not exists rating text;
alter table social_style_assets drop constraint if exists social_style_assets_rating_check;
alter table social_style_assets add constraint social_style_assets_rating_check check (rating in ('favourite', 'never'));
create unique index if not exists social_style_assets_path_idx on social_style_assets(path);

-- When the bridge last asked for each client's editing guidelines.
alter table social_client_onboarding add column if not exists style_requested_at timestamptz;

-- Private buckets, operators only (skipped where there's no storage schema,
-- e.g. the local tests).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('moodboards', 'moodboards', false) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('library', 'library', false) on conflict (id) do nothing;

    execute 'drop policy if exists "moodboards + library: operators" on storage.objects';
    execute $p$create policy "moodboards + library: operators" on storage.objects
      for all to authenticated
      using (bucket_id in ('moodboards', 'library') and social_is_operator())
      with check (bucket_id in ('moodboards', 'library') and social_is_operator())$p$;
  end if;
end $$;
