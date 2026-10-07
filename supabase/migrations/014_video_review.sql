-- Fully Social OS — Frame.io-style review of finished videos. Safe to
-- re-run. Run after 013.
--
-- Tait, 2026-10-07: clients review the finished video in their portal,
-- pause anywhere and leave a note pinned to that moment, instead of one
-- free-text box. The videos stay in Google Drive (Tait's call: safer and
-- cheaper); the page streams the finished file from Drive into its own
-- player (Drive API, with the key in social_settings), so it can read the
-- exact time. Only the notes live here.
--
--   social_video_comments   notes on a video: at_seconds (null = a note on
--                           the whole video), body, who, and the Drive file
--                           they were left on (cut_ref). A note is open
--                           until the video moves on from Edit review or
--                           Client final review; then it's closed
--                           (closed_at), and the next cut starts a clean
--                           round. The notes sent back are the editor's
--                           last closed batch.
--   social_settings         small shared settings: 'google_api_key' (a
--                           browser key limited to the Drive API and this
--                           site; it only reads files shared by link).
--
-- Who does what:
--   operator  everything
--   client    reads notes on their own videos; leaves notes, and deletes
--             their own open ones, while a video waits for their approval
--   editor    reads notes on videos assigned to them
-- "Send changes" still goes through request_revisions (006) with a note:
-- the portal writes the timed notes into it, so the editor's Revisions
-- needed box lists them too.

create table if not exists social_video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references social_videos(id) on delete cascade,
  cut_ref text,
  at_seconds numeric check (at_seconds is null or at_seconds >= 0),
  body text not null check (length(btrim(body)) > 0),
  author_id uuid not null default auth.uid(),
  author_name text,
  author_role text not null check (author_role in ('client', 'operator', 'editor')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists social_video_comments_video on social_video_comments (video_id, closed_at);

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

drop policy if exists "client users add notes while reviewing" on social_video_comments;
create policy "client users add notes while reviewing" on social_video_comments
  for insert to authenticated
  with check (
    author_id = auth.uid() and author_role = 'client' and closed_at is null
    and exists (select 1 from social_videos v
      where v.id = social_video_comments.video_id
        and v.client_id = social_current_client_id()
        and v.status = 'client_review'));

drop policy if exists "client users delete own notes while reviewing" on social_video_comments;
create policy "client users delete own notes while reviewing" on social_video_comments
  for delete to authenticated
  using (
    author_id = auth.uid() and closed_at is null
    and exists (select 1 from social_videos v
      where v.id = social_video_comments.video_id
        and v.client_id = social_current_client_id()
        and v.status = 'client_review'));

drop policy if exists "editors read notes on assigned videos" on social_video_comments;
create policy "editors read notes on assigned videos" on social_video_comments
  for select to authenticated
  using (exists (select 1 from social_videos v
    where v.id = social_video_comments.video_id and v.editor_id = social_current_editor_id()));

-- A round of notes ends when the video leaves the stage they were left in
-- (sent back to the editor, or approved), whichever way it moved: the
-- client's action, the operator's direct update, or the editor's.
create or replace function social_close_review_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and old.status in ('in_review', 'client_review') then
    update social_video_comments set closed_at = now() where video_id = new.id and closed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists social_videos_close_review_notes on social_videos;
create trigger social_videos_close_review_notes
  after update of status on social_videos
  for each row execute function social_close_review_notes();

-- ── social_settings ────────────────────────────────────────────────────
create table if not exists social_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table social_settings enable row level security;

drop policy if exists "signed in users read settings" on social_settings;
create policy "signed in users read settings" on social_settings
  for select to authenticated using (true);

drop policy if exists "operators manage settings" on social_settings;
create policy "operators manage settings" on social_settings
  for all to authenticated
  using (social_is_operator())
  with check (social_is_operator());
