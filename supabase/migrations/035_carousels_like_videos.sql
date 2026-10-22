-- 035: carousels work like videos (Tait, 2026-10-22: "Take away the
-- carousels tab for all client-facing portals. That'll just be a similar
-- process as videos. And they'll be able to review carousels when they come
-- in and make adjustments based on each slide... treat it the same way as
-- the video cards. It's just a carousel."). Safe to re-run. Run after 034.
--
--   idea → with_editor → to_review (Tait, My desk) → client_review (client,
--   To review) → approved → posted
--                ↑                │                       │
--                └──── changes ←──┴───────────────────────┘
--
-- The client sees their carousels from client_review on (never the copy
-- work before it), reviews slide by slide (client_notes), and approves or
-- sends changes through social_client_review_carousel. Their post date puts
-- them on the client's calendar.

alter table social_carousels drop constraint if exists social_carousels_status_check;
alter table social_carousels add constraint social_carousels_status_check
  check (status in ('idea', 'with_editor', 'to_review', 'client_review', 'changes', 'approved', 'posted'));
alter table social_carousels add column if not exists post_date date;
alter table social_carousels add column if not exists client_notes jsonb not null default '[]'::jsonb; -- [{"slide": 2, "note": "..."}], slide 0 = the whole carousel
alter table social_carousels add column if not exists client_approved_at timestamptz;

drop policy if exists "client users read own carousels" on social_carousels;
create policy "client users read own carousels" on social_carousels
  for select to authenticated
  using (client_id = social_current_client_id() and status in ('client_review', 'approved', 'posted'));

drop policy if exists "client users read own carousel slides" on social_carousel_uploads;
create policy "client users read own carousel slides" on social_carousel_uploads
  for select to authenticated using (exists (
    select 1 from social_carousels c
    where c.id = social_carousel_uploads.carousel_id
      and c.client_id = social_current_client_id()
      and c.status in ('client_review', 'approved', 'posted')));

-- Slide images: 'carousels/<client id>/<carousel id>/<file>'.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists "carousels: client users read own" on storage.objects';
    execute $p$create policy "carousels: client users read own" on storage.objects
      for select to authenticated
      using (bucket_id = 'carousels' and (storage.foldername(name))[1] = social_current_client_id()::text)$p$;
  end if;
end $$;

-- The client's review: approve, or send changes with a note per slide.
-- Changes go back to the editor (status changes) with the notes.
create or replace function social_client_review_carousel(p_id uuid, p_approve boolean, p_notes jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c social_carousels;
begin
  select * into c from social_carousels where id = p_id;
  if c.id is null or c.client_id is distinct from social_current_client_id() then
    raise exception 'Not your carousel.';
  end if;
  if c.status <> 'client_review' then
    raise exception 'This carousel isn''t waiting for your review.';
  end if;
  if p_approve then
    update social_carousels set status = 'approved', client_approved_at = now(), approved_at = coalesce(approved_at, now()) where id = p_id;
  else
    if coalesce(jsonb_array_length(p_notes), 0) = 0 then
      raise exception 'Write what to change on at least one slide.';
    end if;
    update social_carousels set status = 'changes', client_notes = p_notes,
      review_note = 'The client asked for changes (see the notes on each slide).' where id = p_id;
  end if;
end $$;
grant execute on function social_client_review_carousel(uuid, boolean, jsonb) to authenticated;
