-- Fully Social OS — two rounds of changes per video. Safe to re-run. Run
-- after 016.
--
-- Tait, 2026-10-09: a client gets two rounds of changes (revisions) on each
-- finished video. Each "Send changes to the editor" (request_revisions)
-- counts one round in social_videos.client_revision_rounds; a third is
-- refused, so they approve it or email Tait. Operators aren't limited
-- (they can also set the count back by hand to give a client another
-- round). Everything else in social_client_video_action is as in 006.
--
-- Every cut the editor finishes comes to Tait first (in_review), as
-- before: he checks it, and the client's changes in it. He approves it to
-- the client; after the client's last round, he approves it for posting
-- (the dashboard sends it to ready_to_post instead).

alter table social_videos add column if not exists client_revision_rounds int not null default 0;

-- How many rounds a client gets. One place to change it.
create or replace function social_client_revision_limit()
returns int language sql immutable as $$ select 2 $$;
grant execute on function social_client_revision_limit() to authenticated;

create or replace function social_client_video_action(
  p_video_id uuid, p_action text, p_note text default null,
  p_caption text default null, p_on_screen_caption text default null)
returns social_videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := social_current_client_id();
  v_video social_videos;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_from text[];
  v_to text;
  v_needs_note boolean := false;
  v_filmed_by text := null;   -- null = either
begin
  if v_client_id is null then
    raise exception 'Only a client login can do this.' using errcode = '42501';
  end if;

  -- Same visibility rule as "client users read own visible videos" (001):
  -- an idea that's back with the owner doesn't exist for the client.
  select * into v_video from social_videos
    where id = p_video_id
      and client_id = v_client_id
      and (status <> 'concept_pending' or concept_approved_at is not null)
    for update;
  if not found then
    raise exception 'Video not found.' using errcode = 'P0002';
  end if;

  case p_action
    when 'approve_concept'         then v_from := array['concept_pending'];                     v_to := 'to_film';         v_filmed_by := 'us';
    when 'request_concept_changes' then v_from := array['concept_pending'];                     v_to := 'concept_pending'; v_needs_note := true;
    when 'submit_footage'          then v_from := array['concept_pending','to_film','filmed'];  v_to := 'ready_to_edit';   v_filmed_by := 'client';
    when 'mark_filmed'             then v_from := array['to_film'];                             v_to := 'filmed';          v_filmed_by := 'client';
    when 'mark_ready_to_edit'      then v_from := array['filmed'];                              v_to := 'ready_to_edit';   v_filmed_by := 'client';
    when 'reject'                  then v_from := array['concept_pending','to_film'];           v_to := 'rejected';        v_needs_note := true;
    when 'approve_final'           then v_from := array['client_review'];                       v_to := 'ready_to_post';
    when 'request_revisions'       then v_from := array['client_review'];                       v_to := 'with_editor';     v_needs_note := true;
    else raise exception 'Unknown action "%".', p_action using errcode = '22023';
  end case;

  if not (v_video.status = any (v_from)) then
    raise exception 'Can''t % a video that''s currently %.', replace(p_action, '_', ' '), v_video.status using errcode = '22023';
  end if;
  if v_needs_note and v_note is null then
    raise exception 'A note is required for this.' using errcode = '22023';
  end if;
  -- (017) two rounds of changes per video, then approve or ask Tait.
  if p_action = 'request_revisions' and coalesce(v_video.client_revision_rounds, 0) >= social_client_revision_limit() then
    raise exception 'You''ve used both rounds of changes on this video. Approve it, or email Tait if something still needs fixing.' using errcode = '22023';
  end if;
  if v_filmed_by is not null and v_video.filmed_by is distinct from v_filmed_by then
    raise exception 'This step isn''t part of how this video gets filmed.' using errcode = '22023';
  end if;

  perform set_config('social.action', p_action, true);
  perform set_config('social.note', coalesce(v_note, ''), true);

  update social_videos set
    status = v_to,
    note = coalesce(v_note, note),
    -- Suggestions send the idea back to the owner: it has to be sent
    -- again before the client sees the rewrite.
    concept_approved_by = case when p_action = 'request_concept_changes' then null else concept_approved_by end,
    concept_approved_at = case when p_action = 'request_concept_changes' then null else concept_approved_at end,
    -- (2) the 7 + 7 rule
    due_to_edit = case when p_action = 'submit_footage' then current_date + 7 else due_to_edit end,
    post_date = case when p_action = 'submit_footage' then greatest(coalesce(post_date, current_date + 14), current_date + 14) else post_date end,
    -- (3) caption edits at final approval (blank = unchanged)
    caption = case when p_action = 'approve_final' then coalesce(nullif(btrim(coalesce(p_caption, '')), ''), caption) else caption end,
    on_screen_caption = case when p_action = 'approve_final' then coalesce(nullif(btrim(coalesce(p_on_screen_caption, '')), ''), on_screen_caption) else on_screen_caption end,
    -- (017) count each round of changes the client sends
    client_revision_rounds = coalesce(client_revision_rounds, 0) + case when p_action = 'request_revisions' then 1 else 0 end
  where id = p_video_id
  returning * into v_video;

  return v_video;
end;
$$;

revoke all on function social_client_video_action(uuid, text, text, text, text) from public, anon;
grant execute on function social_client_video_action(uuid, text, text, text, text) to authenticated;

