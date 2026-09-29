-- Fully Social OS — client onboarding. Safe to re-run. Run after 007.
--
-- A new client gets an invite email (api/invite.js), clicks through to
-- /welcome, sets a password, then walks through: brand (if they film),
-- the voice-memo questions, texting their voice memo to Tait, their
-- existing footage, and a short tour of the portal. Tait gets the
-- transcript himself, pastes it on the operator dashboard (Clients →
-- Onboarding), and api/build-documents.js turns it into their Customer Data
-- and Your Voice documents (service role, so it bypasses RLS).
--
--   social_client_onboarding      one row per client: where they are, and
--                                 what they've given us.
--   social_client_generated_docs  the documents built from the voice memo.
--   social_drive_folder_links     + root, important_documents, previous_content.
--
-- Clients never write these tables directly: every step goes through
-- social_client_onboarding_save(), which checks who's calling.

-- ── Drive folder links: the new folders ──────────────────────────────────
alter table social_drive_folder_links add column if not exists root text;
alter table social_drive_folder_links add column if not exists important_documents text;
alter table social_drive_folder_links add column if not exists previous_content text;

-- ── Onboarding progress ─────────────────────────────────────────────────
create table if not exists social_client_onboarding (
  client_id uuid primary key references social_clients(id) on delete cascade,
  invited_email text,
  invited_at timestamptz,
  invite_count int not null default 0,
  password_set_at timestamptz,
  brand jsonb not null default '{}'::jsonb,      -- { fonts, colors, aesthetic, links }
  answers jsonb not null default '{}'::jsonb,    -- optional written notes, by question id
  voice_memo_sent_at timestamptz,                -- client says they've texted it to Tait
  transcript text,                               -- pasted by Tait (operators only)
  docs_status text not null default 'waiting'
    check (docs_status in ('waiting', 'processing', 'ready', 'failed')),
  docs_error text,
  docs_built_at timestamptz,
  docs_seen_at timestamptz,
  footage_done_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table social_client_onboarding enable row level security;

drop policy if exists "operators manage onboarding" on social_client_onboarding;
create policy "operators manage onboarding" on social_client_onboarding
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

drop policy if exists "client users read own onboarding" on social_client_onboarding;
create policy "client users read own onboarding" on social_client_onboarding
  for select to authenticated
  using (client_id = social_current_client_id());

-- ── Documents built from the voice memo ─────────────────────────────────
create table if not exists social_client_generated_docs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  kind text not null check (kind in ('customer_data', 'your_voice')),
  title text not null,
  body_md text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, kind)
);

alter table social_client_generated_docs enable row level security;

drop policy if exists "operators manage generated docs" on social_client_generated_docs;
create policy "operators manage generated docs" on social_client_generated_docs
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

drop policy if exists "client users read own generated docs" on social_client_generated_docs;
create policy "client users read own generated docs" on social_client_generated_docs
  for select to authenticated
  using (client_id = social_current_client_id());

-- ── The one way a client saves an onboarding step ───────────────────────
-- Callable by that client's own login, or by an operator (who can walk a
-- client through it, or test). Creates the row on first use.
--   password   → password_set_at
--   brand      → brand (fonts, colors, aesthetic, links; text only)
--   answers    → answers (optional written notes)
--   memo_sent  → voice_memo_sent_at (they've texted it to Tait)
--   footage    → footage_done_at
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
