-- Fully Social OS — Frame.io-style review of finished videos. Safe to
-- re-run. Run after 013.
--
-- Tait, 2026-10-06: clients review the finished video in their portal,
-- pause anywhere and leave a note pinned to that moment, instead of one
-- free-text box. So the finished video lives in the dashboard (not only in
-- Google Drive): the page can then read the player's exact time.
--
--   social_videos.review_video_path   the current cut, in the private
--                                     'finished-videos' bucket at
--                                     <client_id>/<video_id>/<file>
--   social_videos.review_video_name   its original file name (downloads)
--   social_videos.review_video_at     when it was uploaded
--   social_video_comments             notes on a cut: at_seconds (null = a
--                                     note on the whole video), body, who.
--                                     Tied to the cut they were left on
--                                     (video_path), so a new cut starts a
--                                     clean review round.
--
-- Who does what:
--   operator  everything
--   editor    uploads a new cut for a video they're editing
--             (social_set_review_video); reads the notes on their videos
--   client    reads their own videos' cuts; leaves and deletes their own
--             notes while the video is waiting for their approval
-- "Send changes" still goes through request_revisions (006) with a note:
-- the portal writes the timed notes into it, so the editor's Revisions
-- needed box lists them too.

alter table social_videos add column if not exists review_video_path text;
alter table social_videos add column if not exists review_video_name text;
alter table social_videos add column if not exists review_video_at timestamptz;

create table if not exists social_video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references social_videos(id) on delete cascade,
  video_path text not null,
  at_seconds numeric check (at_seconds is null or at_seconds >= 0),
  body text not null check (length(btrim(body)) > 0),
  author_id uuid not null default auth.uid(),
  author_name text,
  author_role text not null check (author_role in ('client', 'operator', 'editor')),
  created_at timestamptz not null default now()
);
create index if not exists social_video_comments_video on social_video_comments (video_id, video_path);

alter table social_video_comments enable row level security;

drop policy if exists "operators manage video comments" on social_video_comments;
create policy "operators manage video comments" on social_video_comments
  for all to authenticated
  using (social_is_operator())
  with check (social_is_operator());

drop policy if exists "client users read own video comments" on social_video_comments;
create policy "client users read own video comments" on social_video_comments
  for select to authenticated
  using (exists (select 1 from social_videos v
    where v.id = social_video_comments.video_id and v.client_id = social_current_client_id()));

-- Only on the cut they're reviewing, while it's theirs to review.
drop policy if exists "client users add notes while reviewing" on social_video_comments;
create policy "client users add notes while reviewing" on social_video_comments
  for insert to authenticated
  with check (
    author_id = auth.uid() and author_role = 'client'
    and exists (select 1 from social_videos v
      where v.id = social_video_comments.video_id
        and v.client_id = social_current_client_id()
        and v.status = 'client_review'
        and v.review_video_path = social_video_comments.video_path));

drop policy if exists "client users delete own notes while reviewing" on social_video_comments;
create policy "client users delete own notes while reviewing" on social_video_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    and exists (select 1 from social_videos v
      where v.id = social_video_comments.video_id
        and v.client_id = social_current_client_id()
        and v.status = 'client_review'));

drop policy if exists "editors read notes on assigned videos" on social_video_comments;
create policy "editors read notes on assigned videos" on social_video_comments
  for select to authenticated
  using (exists (select 1 from social_videos v
    where v.id = social_video_comments.video_id and v.editor_id = social_current_editor_id()));

-- A new cut for review. The file must already be in this video's folder.
-- Operators any time; the assigned editor while it's with them.
create or replace function social_set_review_video(p_video_id uuid, p_path text, p_name text default null)
returns social_videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video social_videos;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_video from social_videos where id = p_video_id for update;
  if not found then raise exception 'Video not found.' using errcode = 'P0002'; end if;
  if not (social_is_operator()
          or (v_video.editor_id is not null and v_video.editor_id = social_current_editor_id() and v_video.status = 'with_editor')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path is null or p_path not like v_video.client_id::text || '/' || v_video.id::text || '/%' then
    raise exception 'The video file must be in this video''s folder' using errcode = '22023';
  end if;
  update social_videos
     set review_video_path = p_path,
         review_video_name = nullif(btrim(coalesce(p_name, '')), ''),
         review_video_at = now()
   where id = p_video_id
  returning * into v_video;
  return v_video;
end;
$$;

revoke all on function social_set_review_video(uuid, text, text) from public, anon;
grant execute on function social_set_review_video(uuid, text, text) to authenticated;

-- ── Storage: the 'finished-videos' bucket (Supabase projects only;
-- skipped where there's no storage schema, e.g. the local tests) ────────
-- Path: <client_id>/<video_id>/<file>. Uses the project's upload limit
-- (raised to 50 GB for onboarding in 010).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('finished-videos', 'finished-videos', false)
    on conflict (id) do nothing;

    -- Uploading: operators anywhere; an editor into a video they're editing.
    execute 'drop policy if exists "finished videos: upload" on storage.objects';
    execute $p$create policy "finished videos: upload" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'finished-videos'
        and (social_is_operator() or exists (select 1 from social_videos v
          where v.client_id::text = (storage.foldername(name))[1] and v.id::text = (storage.foldername(name))[2]
            and v.editor_id = social_current_editor_id() and v.status = 'with_editor')))$p$;

    -- Resumable uploads update the object as each piece lands.
    execute 'drop policy if exists "finished videos: finish upload" on storage.objects';
    execute $p$create policy "finished videos: finish upload" on storage.objects
      for update to authenticated
      using (bucket_id = 'finished-videos'
        and (social_is_operator() or exists (select 1 from social_videos v
          where v.client_id::text = (storage.foldername(name))[1] and v.id::text = (storage.foldername(name))[2]
            and v.editor_id = social_current_editor_id() and v.status = 'with_editor')))$p$;

    -- Watching: operators; the client whose video it is; its editor.
    execute 'drop policy if exists "finished videos: watch" on storage.objects';
    execute $p$create policy "finished videos: watch" on storage.objects
      for select to authenticated
      using (bucket_id = 'finished-videos'
        and (social_is_operator()
          or (storage.foldername(name))[1] = social_current_client_id()::text
          or exists (select 1 from social_videos v
            where v.client_id::text = (storage.foldername(name))[1] and v.id::text = (storage.foldername(name))[2]
              and v.editor_id = social_current_editor_id())))$p$;

    execute 'drop policy if exists "finished videos: operators delete" on storage.objects';
    execute $p$create policy "finished videos: operators delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'finished-videos' and social_is_operator())$p$;
  end if;
end $$;
