-- 040: content cards (Tait, 2026-11-04). Safe to re-run. Run after 039.
--
-- "Instead of calling them video cards, I want to call them content cards
-- so that they can be different types of content." A card in social_videos
-- is now a video (as before) or a LinkedIn copy post:
--
--   scripting → script_review (Tait checks it on My desk) → concept_pending
--   (sent: the client sees it) → ready_to_post → posted
--                                   │
--                                   └─ Reject the idea (with a note) → scripting
--
-- A LinkedIn post reaches the client already written in their voice. On the
-- card they see the idea at the top, three example hooks, the post itself
-- (which they can edit right in the box) and a photo they can add from
-- their own camera roll. When they approve it, it goes straight to Ready to
-- post (Tait, 2026-11-04). There's no filming, editing or final review.
--
-- Columns:
--   content_type  'video' (default, every existing card) or 'linkedin_post'
--   hook_options  three example hooks, ["...", "...", "..."]
--   photo_path    the post's photo in the private 'post-photos' bucket:
--                 <client id>/<card id>/<file>
--   (the post's words are `caption`, the idea is `concept`)
--
-- Clients still have no direct write on cards (024): their edits go through
-- social_client_linkedin_post below, and only on their own LinkedIn posts
-- while those wait for their OK. Video words stay operator-only.

alter table social_videos add column if not exists content_type text not null default 'video';
alter table social_videos drop constraint if exists social_videos_content_type_check;
alter table social_videos add constraint social_videos_content_type_check
  check (content_type in ('video', 'linkedin_post'));
alter table social_videos add column if not exists hook_options jsonb not null default '[]'::jsonb;
alter table social_videos add column if not exists photo_path text;

-- The client's LinkedIn post actions:
--   save    keep their edits to the post (p_copy), still waiting for their OK
--   photo   set (p_photo_path, inside their own folder) or clear (null) the photo
--   approve save p_copy (if given) and send it to Ready to post
--   reject  send the idea back with a note (p_note): it goes to Scripting for
--           a rewrite, and Tait checks it again before the client sees it
create or replace function social_client_linkedin_post(
  p_video_id uuid, p_action text, p_copy text default null,
  p_note text default null, p_photo_path text default null)
returns social_videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := social_current_client_id();
  v_video social_videos;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_copy text := nullif(btrim(coalesce(p_copy, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  if v_client_id is null then
    raise exception 'Only a client login can do this.' using errcode = '42501';
  end if;

  select * into v_video from social_videos
    where id = p_video_id
      and client_id = v_client_id
      and content_type = 'linkedin_post'
      and status = 'concept_pending'
      and concept_approved_at is not null
    for update;
  if not found then
    raise exception 'This LinkedIn post isn''t waiting for your OK.' using errcode = 'P0002';
  end if;

  if p_action = 'reject' and v_note is null then
    raise exception 'A note is required for this.' using errcode = '22023';
  end if;
  if p_action = 'approve' and coalesce(v_copy, v_video.caption) is null then
    raise exception 'The post is empty. Write it (or ask us to) before approving.' using errcode = '22023';
  end if;
  if p_action = 'photo' and v_photo is not null
     and v_photo not like v_client_id::text || '/' || p_video_id::text || '/%' then
    raise exception 'That photo isn''t on this post.' using errcode = '22023';
  end if;

  case p_action
    when 'save' then
      update social_videos set caption = coalesce(v_copy, caption) where id = p_video_id returning * into v_video;
    when 'photo' then
      update social_videos set photo_path = v_photo where id = p_video_id returning * into v_video;
    when 'approve' then
      perform set_config('social.action', 'approve_post', true);
      perform set_config('social.note', '', true);
      update social_videos set caption = coalesce(v_copy, caption), status = 'ready_to_post'
        where id = p_video_id returning * into v_video;
    when 'reject' then
      perform set_config('social.action', 'reject_post', true);
      perform set_config('social.note', v_note, true);
      update social_videos set status = 'scripting', note = v_note,
          concept_approved_by = null, concept_approved_at = null
        where id = p_video_id returning * into v_video;
    else
      raise exception 'Unknown action "%".', p_action using errcode = '22023';
  end case;

  return v_video;
end;
$$;

revoke all on function social_client_linkedin_post(uuid, text, text, text, text) from public, anon;
grant execute on function social_client_linkedin_post(uuid, text, text, text, text) to authenticated;

-- Post photos: '<client id>/<card id>/<file>'. Clients add to and read their
-- own folder; operators everything.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('post-photos', 'post-photos', false) on conflict (id) do nothing;
    execute 'drop policy if exists "post-photos: add to own folder" on storage.objects';
    execute $p$create policy "post-photos: add to own folder" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'post-photos'
        and (social_is_operator() or (storage.foldername(name))[1] = social_current_client_id()::text))$p$;
    execute 'drop policy if exists "post-photos: read own folder" on storage.objects';
    execute $p$create policy "post-photos: read own folder" on storage.objects
      for select to authenticated
      using (bucket_id = 'post-photos'
        and (social_is_operator() or (storage.foldername(name))[1] = social_current_client_id()::text))$p$;
    execute 'drop policy if exists "post-photos: operators change" on storage.objects';
    execute $p$create policy "post-photos: operators change" on storage.objects
      for delete to authenticated
      using (bucket_id = 'post-photos' and social_is_operator())$p$;
  end if;
end $$;

-- Fix (found 2026-11-04 while building this): 026 brought back "client users
-- update own visible videos", which let a client login change any column on
-- its own visible cards directly (words, status, dates), against 003/024's
-- rule that clients only act through the functions above. No page uses it:
-- the portal's direct updates are the operator's. Closed again here.
drop policy if exists "client users update own visible videos" on social_videos;
