-- 033: every client gets a moodboard they build with Tait (Tait, 2026-10-22:
-- "i want each client to have access to a moodboard… both me and the client
-- can drag and drop screenshots"). Safe to re-run. Run after 032.
--
-- The board (028's social_moodboard_items) is now organised into sections,
-- after the five steps Tait shared (colour palette, typography, emotive
-- images, words and phrases, textures and materials) plus logo, motion
-- graphics and editing style. Images keep the colours pulled out of them
-- (palette) so the board can show a palette. A client reads and adds to
-- their own board only (never the house moodboard, never another client's),
-- and can move or remove only what they added. The Art Director reads the
-- board and turns it into the client's editing guidelines (bridge.py).

alter table social_moodboard_items add column if not exists section text;
alter table social_moodboard_items drop constraint if exists social_moodboard_items_section_check;
alter table social_moodboard_items add constraint social_moodboard_items_section_check
  check (section is null or section in ('look', 'colour', 'type', 'motion', 'editing', 'texture', 'brand', 'words'));
alter table social_moodboard_items add column if not exists palette jsonb;         -- ["#a66c46", …]
alter table social_moodboard_items add column if not exists added_by_role text;    -- operator / client
alter table social_moodboard_items add column if not exists added_by uuid default auth.uid();

drop policy if exists "client users read own moodboard" on social_moodboard_items;
create policy "client users read own moodboard" on social_moodboard_items
  for select to authenticated
  using (client_id is not null and client_id = social_current_client_id());

drop policy if exists "client users add to own moodboard" on social_moodboard_items;
create policy "client users add to own moodboard" on social_moodboard_items
  for insert to authenticated
  with check (client_id is not null and client_id = social_current_client_id()
    and added_by = auth.uid() and added_by_role = 'client' and used_at is null);

drop policy if exists "client users change what they added" on social_moodboard_items;
create policy "client users change what they added" on social_moodboard_items
  for update to authenticated
  using (client_id = social_current_client_id() and added_by = auth.uid())
  with check (client_id = social_current_client_id() and added_by = auth.uid() and added_by_role = 'client');

drop policy if exists "client users remove what they added" on social_moodboard_items;
create policy "client users remove what they added" on social_moodboard_items
  for delete to authenticated
  using (client_id = social_current_client_id() and added_by = auth.uid());

-- Files: the 'moodboards' bucket (028) keeps each client's files under
-- "<client id>/…"; a client reads and uploads only in their own folder.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists "moodboards: client users own folder" on storage.objects';
    execute $p$create policy "moodboards: client users own folder" on storage.objects
      for select to authenticated
      using (bucket_id = 'moodboards' and (storage.foldername(name))[1] = social_current_client_id()::text)$p$;
    execute 'drop policy if exists "moodboards: client users upload" on storage.objects';
    execute $p$create policy "moodboards: client users upload" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'moodboards' and (storage.foldername(name))[1] = social_current_client_id()::text)$p$;
    execute 'drop policy if exists "moodboards: client users remove own" on storage.objects';
    execute $p$create policy "moodboards: client users remove own" on storage.objects
      for delete to authenticated
      using (bucket_id = 'moodboards' and (storage.foldername(name))[1] = social_current_client_id()::text and owner = auth.uid())$p$;
  end if;
end $$;

-- Live updates, so Tait and the client see each other's drops while both
-- have the board open (skipped where there's no realtime, e.g. the tests).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'social_moodboard_items') then
    execute 'alter publication supabase_realtime add table social_moodboard_items';
  end if;
end $$;
