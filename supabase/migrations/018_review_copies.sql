-- Fully Social OS — review copies in Supabase Storage. Safe to re-run.
-- Run after 017.
--
-- Tait, 2026-10-09: streaming finished videos straight out of Google Drive
-- (an API key, migration 014) is unreliable: Google answers with a
-- "automated queries" block page, and phones then wait and fall back to
-- Drive's own player. So each version of a finished video can have a
-- review copy in the private 'review' bucket, which the review window
-- streams instead (a signed link, fast on phones, with the sound). Google
-- Drive stays where the files are kept; Drive is still the fallback.
--
--   review/<client id>/<video id>/<file>
--
-- Who can do what with a review copy:
--   operator  everything
--   editor    add one for a video assigned to them while it's with them;
--             watch the videos assigned to them
--   client    watch their own videos
--
-- social_video_versions.storage_path is the copy's path in the bucket.
-- social_add_video_version takes it as p_storage_path.

alter table social_video_versions add column if not exists storage_path text;

-- The next version of a video, as in 016, plus its review copy.
drop function if exists social_add_video_version(uuid, text, text);
create or replace function social_add_video_version(p_video_id uuid, p_file_id text default null, p_file_name text default null, p_storage_path text default null)
returns social_video_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video social_videos;
  v_row social_video_versions;
  v_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_video from social_videos where id = p_video_id for update;
  if not found then raise exception 'Video not found.' using errcode = 'P0002'; end if;
  -- coalesce: for a login that isn't an editor, social_current_editor_id()
  -- is NULL, and NOT (false OR NULL) is NULL, which would slip past.
  if not coalesce(social_is_operator()
          or (v_video.editor_id = social_current_editor_id() and v_video.status = 'with_editor'), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- A review copy has to be this video's own.
  if v_path is not null and v_path not like v_video.client_id::text || '/' || v_video.id::text || '/%' then
    raise exception 'That review copy isn''t this video''s.' using errcode = '22023';
  end if;
  insert into social_video_versions (video_id, version, file_id, file_name, storage_path)
  values (p_video_id,
          coalesce((select max(version) from social_video_versions where video_id = p_video_id), 0) + 1,
          nullif(btrim(coalesce(p_file_id, '')), ''), nullif(btrim(coalesce(p_file_name, '')), ''), v_path)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function social_add_video_version(uuid, text, text, text) from public, anon;
grant execute on function social_add_video_version(uuid, text, text, text) to authenticated;

-- Whose a path in the bucket is: <client id>/<video id>/…
create or replace function social_review_path_video(p_name text)
returns social_videos
language sql
stable
security definer
set search_path = public
as $$
  select v.* from social_videos v
  where v.client_id::text = split_part(p_name, '/', 1)
    and v.id::text = split_part(p_name, '/', 2)
$$;
revoke all on function social_review_path_video(text) from public, anon;
grant execute on function social_review_path_video(text) to authenticated;

-- ── Storage: the 'review' bucket (Supabase projects only; skipped where
-- there's no storage schema, e.g. the local tests) ───────────────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('review', 'review', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists "review copies: add" on storage.objects';
    execute $p$create policy "review copies: add" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'review' and (social_is_operator() or exists (
        select 1 from social_review_path_video(name) v
        where v.editor_id = social_current_editor_id() and v.status = 'with_editor')))$p$;

    -- Resumable uploads update the object as each piece lands.
    execute 'drop policy if exists "review copies: finish uploads" on storage.objects';
    execute $p$create policy "review copies: finish uploads" on storage.objects
      for update to authenticated
      using (bucket_id = 'review' and (social_is_operator() or exists (
        select 1 from social_review_path_video(name) v
        where v.editor_id = social_current_editor_id() and v.status = 'with_editor')))$p$;

    execute 'drop policy if exists "review copies: watch" on storage.objects';
    execute $p$create policy "review copies: watch" on storage.objects
      for select to authenticated
      using (bucket_id = 'review' and (social_is_operator() or exists (
        select 1 from social_review_path_video(name) v
        where v.client_id = social_current_client_id() or v.editor_id = social_current_editor_id())))$p$;

    execute 'drop policy if exists "review copies: operators delete" on storage.objects';
    execute $p$create policy "review copies: operators delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'review' and social_is_operator())$p$;
  end if;
end $$;
