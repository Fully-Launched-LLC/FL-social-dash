-- Fully Social OS — a client can opt out of reviewing. Safe to re-run.
-- Run after 037.
--
-- Tait, 2026-10-26: "I want to create a button inside of each client portal
-- where they can opt out of reviewing... they can click 'Opt out of the
-- reviewing process,' and that means they trust us completely, so they don't
-- have to go into the portal and review every video."
--
-- Only the client's gate goes. Tait still approves every edit on My desk
-- (gate 2); when he sends a finished video or carousel to an opted-out
-- client, it skips their To review and is approved for posting on its date.
-- Idea OKs are unchanged. Opting out also approves what's waiting for them
-- now. They can opt back in any time (new work waits for them again).

alter table social_clients add column if not exists skip_client_review boolean not null default false;
alter table social_clients add column if not exists skip_client_review_at timestamptz;

-- Every way a video or carousel reaches the client (the operator dashboard,
-- the bridge, a direct update) goes through these, so none can miss it.
create or replace function social_skip_client_review_video()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'client_review' and (tg_op = 'INSERT' or old.status is distinct from 'client_review')
     and exists (select 1 from social_clients where id = new.client_id and skip_client_review) then
    new.status := 'ready_to_post';
  end if;
  return new;
end $$;
drop trigger if exists social_videos_skip_client_review on social_videos;
create trigger social_videos_skip_client_review
  before insert or update of status on social_videos
  for each row execute function social_skip_client_review_video();

create or replace function social_skip_client_review_carousel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'client_review' and (tg_op = 'INSERT' or old.status is distinct from 'client_review')
     and exists (select 1 from social_clients where id = new.client_id and skip_client_review) then
    new.status := 'approved';
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end $$;
drop trigger if exists social_carousels_skip_client_review on social_carousels;
create trigger social_carousels_skip_client_review
  before insert or update of status on social_carousels
  for each row execute function social_skip_client_review_carousel();

-- The portal's button: the client's own login (their client) or an
-- operator viewing their portal. Returns how many waiting items it approved.
create or replace function social_set_client_review_opt_out(p_client_id uuid, p_opt_out boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; m integer := 0;
begin
  if not (social_is_operator() or p_client_id = social_current_client_id()) then
    raise exception 'Not your account.';
  end if;
  update social_clients set skip_client_review = p_opt_out,
    skip_client_review_at = case when p_opt_out then now() else null end where id = p_client_id;
  if p_opt_out then
    update social_videos set status = 'ready_to_post' where client_id = p_client_id and status = 'client_review';
    get diagnostics n = row_count;
    update social_carousels set status = 'approved', client_approved_at = now(), approved_at = coalesce(approved_at, now())
      where client_id = p_client_id and status = 'client_review';
    get diagnostics m = row_count;
  end if;
  return n + m;
end $$;
grant execute on function social_set_client_review_opt_out(uuid, boolean) to authenticated;
