-- Fully Social OS — editor tools, Frame.io style. Safe to re-run. Run
-- after 015.
--
-- Tait, 2026-10-07:
--   1. Tick off each revision: a comment can be marked fixed
--      (resolved_at / resolved_by), by the editor of that video while it's
--      with them, or by an operator (social_resolve_comment).
--   2. Replies: a comment can have replies (parent_id). The editor can
--      reply on their videos; the client while reviewing (the existing
--      client policy); operators always.
--   3. Versions: every time a cut is finished, its Google Drive file is
--      saved as the next version (social_video_versions: v1, v2, …), by
--      the editor while it's with them, or an operator
--      (social_add_video_version). The review window plays any version
--      with the comments left on it (comments carry the file in cut_ref).
--      Editors' "done this month" counts come from here too.

alter table social_video_comments add column if not exists parent_id uuid references social_video_comments(id) on delete cascade;
alter table social_video_comments add column if not exists resolved_at timestamptz;
alter table social_video_comments add column if not exists resolved_by uuid;
create index if not exists social_video_comments_parent on social_video_comments (parent_id);

-- Editors reply (only reply) on comments on videos assigned to them.
drop policy if exists "editors reply on assigned videos" on social_video_comments;
create policy "editors reply on assigned videos" on social_video_comments
  for insert to authenticated
  with check (
    author_id = auth.uid() and author_role = 'editor' and parent_id is not null
    and exists (select 1 from social_videos v
      where v.id = social_video_comments.video_id and v.editor_id = social_current_editor_id()));

-- Mark a comment fixed (or not).
create or replace function social_resolve_comment(p_comment_id uuid, p_done boolean default true)
returns social_video_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment social_video_comments;
  v_video social_videos;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_comment from social_video_comments where id = p_comment_id for update;
  if not found then raise exception 'Comment not found.' using errcode = 'P0002'; end if;
  select * into v_video from social_videos where id = v_comment.video_id;
  -- coalesce: for a login that isn't an editor, social_current_editor_id()
  -- is NULL, and NOT (false OR NULL) is NULL, which would slip past.
  if not coalesce(social_is_operator()
          or (v_video.editor_id = social_current_editor_id() and v_video.status = 'with_editor'), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update social_video_comments
     set resolved_at = case when p_done then coalesce(resolved_at, now()) else null end,
         resolved_by = case when p_done then coalesce(resolved_by, auth.uid()) else null end
   where id = p_comment_id
  returning * into v_comment;
  return v_comment;
end;
$$;
revoke all on function social_resolve_comment(uuid, boolean) from public, anon;
grant execute on function social_resolve_comment(uuid, boolean) to authenticated;

-- ── versions ─────────────────────────────────────────────────────────────
create table if not exists social_video_versions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references social_videos(id) on delete cascade,
  version int not null check (version > 0),
  file_id text,
  file_name text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (video_id, version)
);
alter table social_video_versions enable row level security;

drop policy if exists "operators manage video versions" on social_video_versions;
create policy "operators manage video versions" on social_video_versions
  for all to authenticated using (social_is_operator()) with check (social_is_operator());

drop policy if exists "editors read versions of assigned videos" on social_video_versions;
create policy "editors read versions of assigned videos" on social_video_versions
  for select to authenticated
  using (created_by = auth.uid() or exists (select 1 from social_videos v
    where v.id = social_video_versions.video_id and v.editor_id = social_current_editor_id()));

drop policy if exists "client users read own video versions" on social_video_versions;
create policy "client users read own video versions" on social_video_versions
  for select to authenticated
  using (exists (select 1 from social_videos v
    where v.id = social_video_versions.video_id and v.client_id = social_current_client_id()));

-- The next version of a video: its editor while it's with them, or an
-- operator. p_file_id is the Drive file (null when it couldn't be read).
create or replace function social_add_video_version(p_video_id uuid, p_file_id text default null, p_file_name text default null)
returns social_video_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video social_videos;
  v_row social_video_versions;
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
  insert into social_video_versions (video_id, version, file_id, file_name)
  values (p_video_id,
          coalesce((select max(version) from social_video_versions where video_id = p_video_id), 0) + 1,
          nullif(btrim(coalesce(p_file_id, '')), ''), nullif(btrim(coalesce(p_file_name, '')), ''))
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function social_add_video_version(uuid, text, text) from public, anon;
grant execute on function social_add_video_version(uuid, text, text) to authenticated;
