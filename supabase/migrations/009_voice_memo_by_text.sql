-- Fully Social OS — voice memos by text. Safe to re-run. Run after 008.
--
-- Clients now text their voice memo to Tait instead of uploading it, and
-- Tait pastes the transcript on the operator dashboard. The first version of
-- 008 (already run in production on 2026-09-29) had audio upload instead;
-- this brings any database to the current shape:
--   + social_client_onboarding.voice_memo_sent_at ("I've texted it")
--   + the 'memo_sent' step in social_client_onboarding_save(); the old
--     'voice_memo' (audio upload) step is gone
-- The old voice_memo_path / voice_memo_uploaded_at columns and the
-- onboarding-audio bucket, where they exist, are left alone (unused).

alter table social_client_onboarding add column if not exists voice_memo_sent_at timestamptz;

create or replace function social_client_onboarding_save(p_client_id uuid, p_step text, p_data jsonb default '{}'::jsonb)
returns social_client_onboarding
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row social_client_onboarding;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  -- coalesce: a login with no client has a NULL client id, and NULL = x is
  -- NULL (not false), which would slip past a plain NOT.
  if not (social_is_operator() or coalesce(social_current_client_id() = p_client_id, false)) then
    raise exception 'Not allowed';
  end if;
  if not exists (select 1 from social_clients where id = p_client_id) then
    raise exception 'Client not found';
  end if;

  insert into social_client_onboarding (client_id) values (p_client_id)
  on conflict (client_id) do nothing;

  if p_step = 'password' then
    update social_client_onboarding set password_set_at = now(), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'brand' then
    if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then raise exception 'Brand must be an object'; end if;
    update social_client_onboarding set brand = coalesce(p_data, '{}'::jsonb), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'answers' then
    if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then raise exception 'Answers must be an object'; end if;
    update social_client_onboarding set answers = coalesce(p_data, '{}'::jsonb), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'memo_sent' then
    update social_client_onboarding set voice_memo_sent_at = now(), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'footage' then
    update social_client_onboarding set footage_done_at = now(), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'docs_seen' then
    update social_client_onboarding set docs_seen_at = now(), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'done' then
    update social_client_onboarding set completed_at = coalesce(completed_at, now()), updated_at = now() where client_id = p_client_id;
  else
    raise exception 'Unknown step: %', p_step;
  end if;

  select * into v_row from social_client_onboarding where client_id = p_client_id;
  return v_row;
end;
$$;

revoke all on function social_client_onboarding_save(uuid, text, jsonb) from public, anon;
grant execute on function social_client_onboarding_save(uuid, text, jsonb) to authenticated;
