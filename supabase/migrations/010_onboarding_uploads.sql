-- Fully Social OS — onboarding v2: uploads. Safe to re-run. Run after 009.
--
-- Tait, 2026-10-01 (Supabase is on Pro now): clients upload everything
-- straight into their onboarding instead of texting or sharing Drive:
--   brand files      drag and drop (or "I don't have any brand files")
--   voice memo       recorded on the questions page, or uploaded
--   footage          drag and drop files or whole folders, at full quality,
--                    and/or a link to a Google Drive folder
-- Files go to the private storage bucket 'onboarding', under
-- <client_id>/brand/, <client_id>/voice-memo/, <client_id>/footage/.
-- A client can upload into (and read) only their own folder; operators
-- read and manage everything.
--
-- New on social_client_onboarding:
--   started_at   they pressed Start on the welcome step
--   footage      { drive_link, files: [{ path, name, size }] }
-- brand now holds { files: 'uploaded' | 'none', uploads: [{ path, name, size }], done }.
-- voice_memo_path / voice_memo_uploaded_at (from the first 008) hold the memo.

alter table social_client_onboarding add column if not exists started_at timestamptz;
alter table social_client_onboarding add column if not exists footage jsonb not null default '{}'::jsonb;
alter table social_client_onboarding add column if not exists voice_memo_path text;
alter table social_client_onboarding add column if not exists voice_memo_uploaded_at timestamptz;

-- The one way a client saves an onboarding step (replaces 009's version;
-- every older step still works).
--   password   → password_set_at
--   started    → started_at
--   brand      → brand (object)
--   answers    → answers (object; older pages)
--   memo_sent  → voice_memo_sent_at (older pages: texted it)
--   voice_memo → voice_memo_path (must be in this client's folder) + uploaded_at
--   footage    → footage (object); footage_done_at once { done: true }
--   docs_seen  → docs_seen_at
--   done       → completed_at
create or replace function social_client_onboarding_save(p_client_id uuid, p_step text, p_data jsonb default '{}'::jsonb)
returns social_client_onboarding
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row social_client_onboarding;
  v_path text;
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
  elsif p_step = 'started' then
    update social_client_onboarding set started_at = coalesce(started_at, now()), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'brand' then
    if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then raise exception 'Brand must be an object'; end if;
    update social_client_onboarding set brand = coalesce(p_data, '{}'::jsonb), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'answers' then
    if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then raise exception 'Answers must be an object'; end if;
    update social_client_onboarding set answers = coalesce(p_data, '{}'::jsonb), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'memo_sent' then
    update social_client_onboarding set voice_memo_sent_at = now(), updated_at = now() where client_id = p_client_id;
  elsif p_step = 'voice_memo' then
    v_path := p_data ->> 'path';
    if v_path is null or v_path not like p_client_id::text || '/%' then
      raise exception 'The voice memo must be in this client''s folder';
    end if;
    update social_client_onboarding
       set voice_memo_path = v_path, voice_memo_uploaded_at = now(), updated_at = now()
     where client_id = p_client_id;
  elsif p_step = 'footage' then
    if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then raise exception 'Footage must be an object'; end if;
    -- Saved as each file lands ({ done: false }); done when they finish
    -- ({ done: true }). An empty object (older pages) also means done.
    update social_client_onboarding
       set footage = coalesce(p_data, '{}'::jsonb),
           footage_done_at = case when coalesce(p_data ->> 'done', '') = 'true' or coalesce(p_data, '{}'::jsonb) = '{}'::jsonb
                                  then coalesce(footage_done_at, now()) else footage_done_at end,
           updated_at = now()
     where client_id = p_client_id;
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

-- ── Storage: the 'onboarding' bucket (Supabase projects only; skipped
-- where there's no storage schema, e.g. the local tests) ─────────────────
-- No per-bucket size cap: the project's own upload limit applies (raise it
-- in Supabase → Storage → Settings; Pro allows very large files). Big files
-- are sent in resumable 6 MB pieces, so a dropped connection picks up again.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('onboarding', 'onboarding', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists "onboarding uploads: add to own folder" on storage.objects';
    execute $p$create policy "onboarding uploads: add to own folder" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'onboarding'
        and (social_is_operator() or (storage.foldername(name))[1] = social_current_client_id()::text))$p$;

    execute 'drop policy if exists "onboarding uploads: read own folder" on storage.objects';
    execute $p$create policy "onboarding uploads: read own folder" on storage.objects
      for select to authenticated
      using (bucket_id = 'onboarding'
        and (social_is_operator() or (storage.foldername(name))[1] = social_current_client_id()::text))$p$;

    -- Resumable uploads update the object as each piece lands.
    execute 'drop policy if exists "onboarding uploads: finish own uploads" on storage.objects';
    execute $p$create policy "onboarding uploads: finish own uploads" on storage.objects
      for update to authenticated
      using (bucket_id = 'onboarding'
        and (social_is_operator() or (storage.foldername(name))[1] = social_current_client_id()::text))$p$;

    execute 'drop policy if exists "onboarding uploads: operators delete" on storage.objects';
    execute $p$create policy "onboarding uploads: operators delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'onboarding' and social_is_operator())$p$;
  end if;
end $$;
