-- 041: Random Video Dump (Tait, 2026-11-05). Safe to re-run. Run after 040.
--
-- "Create a folder on the 4 personal brand clients ... that is the random
-- video folder. This folder will have any concepts that were not technically
-- scheduled but that they made. I want this folder to be another tab along
-- To Do and Content Calendar. Call it Random Video Dump. The entire tab
-- should just be a place where they can drag and drop a video that gets
-- saved to a Google folder. These videos are spur of the moment videos ...
-- but still go through the editing process."
--
-- Each video dropped there becomes its own content card, straight into
-- editing (ready_to_edit), like a filmed card after "Video has been filmed":
-- the editor has 7 days and it posts 7 days after that (Tait's 7 + 7 rule,
-- 030; Tait can move the date). Then the usual: his review, the client's
-- review (approve, changes or opt out), Ready to post.
--
-- The file goes into the private 'footage' bucket at
-- <client id>/random/<file>; the bridge on Tait's Mac moves it into the
-- client's "06 Random Video Dump" Google Drive folder (one folder per
-- video), not Raw Footage. The card is marked editor_brief.source =
-- 'random_dump'.
--
-- Only clients with the tab turned on (personal_brand) can do this; on
-- 2026-11-05 that's the four personal brands.

alter table social_clients add column if not exists personal_brand boolean not null default false;
alter table social_drive_folder_links add column if not exists random_videos text;

create or replace function social_client_random_video(p_name text, p_storage_path text)
returns social_videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := social_current_client_id();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  v_title text;
  v_video social_videos;
begin
  if v_client_id is null then
    raise exception 'Only a client login can do this.' using errcode = '42501';
  end if;
  if not exists (select 1 from social_clients where id = v_client_id and personal_brand) then
    raise exception 'Random Video Dump isn''t turned on for this account.' using errcode = '42501';
  end if;
  if v_name is null or v_path is null then
    raise exception 'Upload the video first.' using errcode = '22023';
  end if;
  if v_path not like v_client_id::text || '/random/%' then
    raise exception 'That upload isn''t in your Random Video Dump.' using errcode = '22023';
  end if;

  -- "my clip.mov" -> "Random video: my clip"
  v_title := 'Random video: ' || left(regexp_replace(v_name, '\.[A-Za-z0-9]{1,5}$', ''), 80);

  perform set_config('social.action', 'random_video', true);
  perform set_config('social.note', '', true);
  insert into social_videos (client_id, title, status, content_type, filmed_by, platform,
                             concept_approved_at, editor_brief, due_to_edit, post_date)
  values (v_client_id, v_title, 'ready_to_edit', 'video', 'client', array['linkedin', 'facebook', 'instagram'],
          now(), jsonb_build_object('source', 'random_dump'), current_date + 7, current_date + 14)
  returning * into v_video;

  insert into social_footage (client_id, video_id, kind, name, storage_path, uploaded_by, uploaded_by_role)
  values (v_client_id, v_video.id, 'raw', v_name, v_path, auth.uid(), 'client');

  return v_video;
end;
$$;

revoke all on function social_client_random_video(text, text) from public, anon;
grant execute on function social_client_random_video(text, text) to authenticated;

-- ── Idea Drop (Tait, 2026-11-05) ─────────────────────────────────────────
-- "Add another tab inside of the portal and call it Idea Drop where they can
-- submit ideas for their personal brand. Have it look the same way that I'm
-- able to drop ideas." A personal brand drops ideas (words, links,
-- screenshots, voice notes) on their portal; each lands in Tait's Content
-- Ideas for that client as source 'client' ("Client"), where he stars or
-- uses it like his own. They see only the ideas they dropped, and can
-- delete one until it's used.
drop policy if exists "client users read own dropped ideas" on social_ideas;
create policy "client users read own dropped ideas" on social_ideas
  for select to authenticated
  using (client_id = social_current_client_id() and source = 'client');

drop policy if exists "client users drop ideas" on social_ideas;
create policy "client users drop ideas" on social_ideas
  for insert to authenticated
  with check (client_id = social_current_client_id() and source = 'client' and status = 'new'
    and video_id is null and plan_id is null and not starred
    and exists (select 1 from social_clients c where c.id = client_id and c.personal_brand));

drop policy if exists "client users delete own new ideas" on social_ideas;
create policy "client users delete own new ideas" on social_ideas
  for delete to authenticated
  using (client_id = social_current_client_id() and source = 'client' and status = 'new' and video_id is null);

-- Their screenshots and voice notes: the 'ideas' bucket, in their own folder.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists "ideas: clients add to own folder" on storage.objects';
    execute $p$create policy "ideas: clients add to own folder" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'ideas' and (storage.foldername(name))[1] = social_current_client_id()::text)$p$;
    execute 'drop policy if exists "ideas: clients read own folder" on storage.objects';
    execute $p$create policy "ideas: clients read own folder" on storage.objects
      for select to authenticated
      using (bucket_id = 'ideas' and (storage.foldername(name))[1] = social_current_client_id()::text)$p$;
  end if;
end $$;
