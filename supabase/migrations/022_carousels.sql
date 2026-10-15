-- Fully Social OS — carousels. Safe to re-run. Run after 021.
--
-- Tait, 2026-10-15: a Carousels page in a client's portal (operators only)
-- holding the editor's style guide and every carousel's copy, which Tait
-- can edit; editors get a Carousels page with the carousels assigned to
-- them, upload each finished carousel's slides there, and Tait reviews
-- them (approve, or send back with a note).
--
--   idea → with_editor → to_review → approved → posted
--                ↑            │
--                └─ changes ←─┘
--
-- Who can do what:
--   operator  everything
--   editor    read the carousels assigned to them and their client's guide;
--             add and remove slide images while it's with them (with_editor
--             or changes); send it for review (social_editor_submit_carousel)
--   client    nothing
--
-- Slide images live in the private 'carousels' bucket:
--   carousels/<client id>/<carousel id>/<file>
-- social_carousel_uploads lists them, in order.

create table if not exists social_carousels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  position int not null default 0,
  title text not null,
  format text,            -- Founder story / Yes / But / Day One
  category text,          -- AI Systems / Social Media / Websites / E-commerce
  answers text,           -- the customer question it answers (Content Research)
  perspective text,
  cta text,               -- goes in the caption, never on a slide
  slides jsonb not null default '[]'::jsonb,   -- [{ "text": "...", "photo": "..." }]
  caption text,
  sources jsonb not null default '[]'::jsonb,  -- [{ "label": "...", "url": "..." }]
  notes text,
  status text not null default 'idea'
    check (status in ('idea', 'with_editor', 'to_review', 'changes', 'approved', 'posted')),
  editor_id uuid references social_editors(id) on delete set null,
  review_note text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_carousels_client on social_carousels (client_id, position);
alter table social_carousels enable row level security;

create table if not exists social_carousel_guides (
  client_id uuid primary key references social_clients(id) on delete cascade,
  body_md text not null default '',
  updated_at timestamptz not null default now()
);
alter table social_carousel_guides enable row level security;

create table if not exists social_carousel_uploads (
  id uuid primary key default gen_random_uuid(),
  carousel_id uuid not null references social_carousels(id) on delete cascade,
  storage_path text not null,
  file_name text,
  position int not null default 0,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists social_carousel_uploads_carousel on social_carousel_uploads (carousel_id, position);
alter table social_carousel_uploads enable row level security;

-- Keep updated_at honest.
create or replace function social_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists social_carousels_touch on social_carousels;
create trigger social_carousels_touch before update on social_carousels
  for each row execute function social_touch_updated_at();
drop trigger if exists social_carousel_guides_touch on social_carousel_guides;
create trigger social_carousel_guides_touch before update on social_carousel_guides
  for each row execute function social_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
drop policy if exists "operators manage carousels" on social_carousels;
create policy "operators manage carousels" on social_carousels
  for all to authenticated using (social_is_operator()) with check (social_is_operator());

drop policy if exists "editors read assigned carousels" on social_carousels;
create policy "editors read assigned carousels" on social_carousels
  for select to authenticated using (editor_id = social_current_editor_id());

drop policy if exists "operators manage carousel guides" on social_carousel_guides;
create policy "operators manage carousel guides" on social_carousel_guides
  for all to authenticated using (social_is_operator()) with check (social_is_operator());

drop policy if exists "editors read guides for assigned carousels" on social_carousel_guides;
create policy "editors read guides for assigned carousels" on social_carousel_guides
  for select to authenticated using (exists (
    select 1 from social_carousels c
    where c.client_id = social_carousel_guides.client_id
      and c.editor_id = social_current_editor_id()));

-- An editor needs the client's name on the carousel card even when they
-- have no video for that client (the videos policy in 003 covers those).
drop policy if exists "editors read clients of assigned carousels" on social_clients;
create policy "editors read clients of assigned carousels" on social_clients
  for select to authenticated using (exists (
    select 1 from social_carousels c
    where c.client_id = social_clients.id
      and c.editor_id = social_current_editor_id()));

drop policy if exists "operators manage carousel uploads" on social_carousel_uploads;
create policy "operators manage carousel uploads" on social_carousel_uploads
  for all to authenticated using (social_is_operator()) with check (social_is_operator());

drop policy if exists "editors read uploads on assigned carousels" on social_carousel_uploads;
create policy "editors read uploads on assigned carousels" on social_carousel_uploads
  for select to authenticated using (exists (
    select 1 from social_carousels c
    where c.id = social_carousel_uploads.carousel_id
      and c.editor_id = social_current_editor_id()));

drop policy if exists "editors add uploads while it's with them" on social_carousel_uploads;
create policy "editors add uploads while it's with them" on social_carousel_uploads
  for insert to authenticated with check (exists (
    select 1 from social_carousels c
    where c.id = social_carousel_uploads.carousel_id
      and c.editor_id = social_current_editor_id()
      and c.status in ('with_editor', 'changes')
      and social_carousel_uploads.storage_path like c.client_id::text || '/' || c.id::text || '/%'));

drop policy if exists "editors remove uploads while it's with them" on social_carousel_uploads;
create policy "editors remove uploads while it's with them" on social_carousel_uploads
  for delete to authenticated using (exists (
    select 1 from social_carousels c
    where c.id = social_carousel_uploads.carousel_id
      and c.editor_id = social_current_editor_id()
      and c.status in ('with_editor', 'changes')));

-- ── The editor sends it for review ──────────────────────────────────────
create or replace function social_editor_submit_carousel(p_carousel_id uuid)
returns social_carousels
language plpgsql
security definer
set search_path = public
as $$
declare
  v social_carousels;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v from social_carousels where id = p_carousel_id for update;
  if not found then raise exception 'Carousel not found.' using errcode = 'P0002'; end if;
  if not coalesce(social_is_operator() or v.editor_id = social_current_editor_id(), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v.status not in ('with_editor', 'changes') then
    raise exception 'This carousel isn''t with you right now.' using errcode = '22023';
  end if;
  if not exists (select 1 from social_carousel_uploads where carousel_id = v.id) then
    raise exception 'Upload the slides first.' using errcode = '22023';
  end if;
  update social_carousels set status = 'to_review', submitted_at = now() where id = v.id
  returning * into v;
  return v;
end;
$$;
revoke all on function social_editor_submit_carousel(uuid) from public, anon;
grant execute on function social_editor_submit_carousel(uuid) to authenticated;

-- Whose a path in the bucket is: <client id>/<carousel id>/…
create or replace function social_carousel_path(p_name text)
returns social_carousels
language sql
stable
security definer
set search_path = public
as $$
  select c.* from social_carousels c
  where c.client_id::text = split_part(p_name, '/', 1)
    and c.id::text = split_part(p_name, '/', 2)
$$;
revoke all on function social_carousel_path(text) from public, anon;
grant execute on function social_carousel_path(text) to authenticated;

-- ── Storage: the 'carousels' bucket (Supabase only; skipped in the local
-- tests, which have no storage schema) ──────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('carousels', 'carousels', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists "carousels: add" on storage.objects';
    execute $p$create policy "carousels: add" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'carousels' and (social_is_operator() or exists (
        select 1 from social_carousel_path(name) c
        where c.editor_id = social_current_editor_id() and c.status in ('with_editor', 'changes'))))$p$;

    execute 'drop policy if exists "carousels: read" on storage.objects';
    execute $p$create policy "carousels: read" on storage.objects
      for select to authenticated
      using (bucket_id = 'carousels' and (social_is_operator() or exists (
        select 1 from social_carousel_path(name) c
        where c.editor_id = social_current_editor_id())))$p$;

    execute 'drop policy if exists "carousels: remove" on storage.objects';
    execute $p$create policy "carousels: remove" on storage.objects
      for delete to authenticated
      using (bucket_id = 'carousels' and (social_is_operator() or exists (
        select 1 from social_carousel_path(name) c
        where c.editor_id = social_current_editor_id() and c.status in ('with_editor', 'changes'))))$p$;
  end if;
end;
$$;
