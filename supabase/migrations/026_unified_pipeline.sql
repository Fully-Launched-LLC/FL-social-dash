-- 026: one system built around the video card (Tait, 2026-10-21, "Unify the
-- System" Phase 1). Data model only: no page uses these yet. Safe to re-run.
--
-- What it adds:
--   1. social_ideas + social_monthly_plans: the Content Idea Database, before
--      and separate from video cards. Tait's statuses Idea, In monthly plan
--      and Idea approved live here. An approved idea becomes a video card.
--   2. social_videos: two new statuses before the client sees anything,
--      'scripting' and 'script_review' (Tait's "Scripting", "Script review
--      (me)"), plus idea_id and camera_questions. Clients can't read either
--      status (RLS below).
--   3. social_client_generated_docs grows into the 5 client documents:
--      brand_guidelines, icp, identity, editing_guidelines, content_research,
--      each draft → on_desk → approved. Operator-only, except the approved
--      brand guidelines, which the client can read (Tait's call).
--   4. social_style_assets: music, sound effects, caption lines and video
--      types, shared by the whole system (Tait: "shared by the entire system").
--      Each client's own look lives in their editing guidelines document.
--   5. social_footage: every footage file (raw per card, b-roll, old footage,
--      finished cut). Files stay in Google Drive for now; storage_path is for
--      Supabase later. Clients see their own b-roll and old footage library.
--   6. social_agent_status: the agent room, filled from Paperclip by a small
--      bridge on Tait's Mac. Operators only.
--   7. The audit log also records idea status changes.
--
-- Tait's statuses, and where each lives:
--   Idea / In monthly plan / Idea approved      social_ideas.status
--     (new / in_plan / approved; rejected, used)
--   Scripting / Script review (me)               social_videos 'scripting' / 'script_review'
--   Client: card review                          'concept_pending' with gate 1 stamped
--   Client: changes requested (card)             'concept_pending' with gate 1 cleared (existing)
--   Waiting on footage                           'to_film'
--   Editing                                      'filmed' / 'ready_to_edit' / 'with_editor'
--   Edit review (me)                             'in_review'
--   Client: video review                         'client_review'
--   Client: changes requested (video)            'with_editor' with client_revision_rounds > 0 (existing)
--   Ready to post / Posted                       'ready_to_post' / 'posted'

-- ── 1. Content Idea Database ─────────────────────────────────────────────
create table if not exists social_monthly_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  month date not null,                         -- first day of the month
  status text not null default 'draft'
    check (status in ('draft', 'on_desk', 'approved')),
  brief_md text,                               -- the Content Simplifier's brief
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);

create table if not exists social_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  title text not null,
  body text,                                   -- the idea in words
  links text[] not null default '{}',          -- Sandcastles, Instagram, YouTube, Reddit…
  attachments jsonb not null default '[]'::jsonb, -- screenshots, voice notes: [{path, kind, name}]
  source text not null default 'tait'
    check (source in ('tait', 'phone', 'research', 'sandcastles', 'client')),
  source_detail text,                          -- e.g. "r/Naperville", "@account outlier 12x"
  format text,                                 -- the format it's paired with
  why text,                                    -- why it should work
  status text not null default 'new'
    check (status in ('new', 'in_plan', 'approved', 'rejected', 'used')),
  plan_id uuid references social_monthly_plans(id) on delete set null,
  score int,                                   -- Content Expert's 1-10
  video_id uuid references social_videos(id) on delete set null, -- the card it became
  created_by text,                             -- 'tait' or the agent's name
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_ideas_client_idx on social_ideas(client_id, status);
create index if not exists social_ideas_plan_idx on social_ideas(plan_id);

alter table social_ideas enable row level security;
alter table social_monthly_plans enable row level security;

drop policy if exists "operators manage ideas" on social_ideas;
create policy "operators manage ideas" on social_ideas
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

drop policy if exists "operators manage monthly plans" on social_monthly_plans;
create policy "operators manage monthly plans" on social_monthly_plans
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

drop trigger if exists social_ideas_set_updated_at on social_ideas;
create trigger social_ideas_set_updated_at before update on social_ideas
  for each row execute function set_updated_at();
drop trigger if exists social_monthly_plans_set_updated_at on social_monthly_plans;
create trigger social_monthly_plans_set_updated_at before update on social_monthly_plans
  for each row execute function set_updated_at();

-- ── 2. Video cards: scripting statuses ──────────────────────────────────
alter table social_videos add column if not exists idea_id uuid references social_ideas(id) on delete set null;
alter table social_videos add column if not exists camera_questions text; -- for the person behind the camera

alter table social_videos drop constraint if exists social_videos_status_check;
alter table social_videos add constraint social_videos_status_check check (status in (
  'scripting', 'script_review',
  'concept_pending', 'to_film', 'filmed', 'ready_to_edit', 'rejected',
  'with_editor', 'in_review', 'client_review', 'ready_to_post', 'posted'
));

-- Clients never see a card before Tait approves its script (gate 1). After
-- that they see the whole card: hook, outline, script and camera_questions.
drop policy if exists "client users read own visible videos" on social_videos;
create policy "client users read own visible videos" on social_videos
  for select to authenticated
  using (
    client_id = social_current_client_id()
    and status not in ('scripting', 'script_review')
    and (status <> 'concept_pending' or concept_approved_at is not null)
  );

drop policy if exists "client users update own visible videos" on social_videos;
create policy "client users update own visible videos" on social_videos
  for update to authenticated
  using (
    client_id = social_current_client_id()
    and status not in ('scripting', 'script_review')
    and (status <> 'concept_pending' or concept_approved_at is not null)
  )
  with check (client_id = social_current_client_id());

-- ── 3. The 5 client documents ───────────────────────────────────────────
-- 'customer_data' and 'your_voice' stay for older rows; new work uses the 5.
alter table social_client_generated_docs drop constraint if exists social_client_generated_docs_kind_check;
alter table social_client_generated_docs add constraint social_client_generated_docs_kind_check check (kind in (
  'brand_guidelines', 'icp', 'identity', 'editing_guidelines', 'content_research',
  'customer_data', 'your_voice'
));
alter table social_client_generated_docs add column if not exists status text not null default 'draft';
alter table social_client_generated_docs drop constraint if exists social_client_generated_docs_status_check;
alter table social_client_generated_docs add constraint social_client_generated_docs_status_check
  check (status in ('draft', 'on_desk', 'approved'));
alter table social_client_generated_docs add column if not exists approved_by uuid references social_operators(id);
alter table social_client_generated_docs add column if not exists approved_at timestamptz;
alter table social_client_generated_docs add column if not exists sources text; -- which transcripts / files it was built from
alter table social_client_generated_docs add column if not exists built_by text; -- the agent's name

-- The client reads only their approved brand guidelines.
drop policy if exists "client users read own brand guidelines" on social_client_generated_docs;
create policy "client users read own brand guidelines" on social_client_generated_docs
  for select to authenticated
  using (
    client_id = social_current_client_id()
    and kind = 'brand_guidelines'
    and status = 'approved'
  );

-- ── 4. Style assets (shared by every client) ─────────────────────────────
create table if not exists social_style_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('music', 'sfx', 'caption_line', 'video_type')),
  name text not null,
  path text,                                   -- e.g. editor/public/clients/_music/cinematic/…
  url text,
  tags text[] not null default '{}',           -- mood, tempo, use
  notes text,                                  -- when to use it, Tait's reactions
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists social_style_assets_kind_idx on social_style_assets(kind);
alter table social_style_assets enable row level security;

drop policy if exists "operators manage style assets" on social_style_assets;
create policy "operators manage style assets" on social_style_assets
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

-- ── 5. Footage library ──────────────────────────────────────────────────
create table if not exists social_footage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  video_id uuid references social_videos(id) on delete set null, -- null = library footage
  kind text not null check (kind in ('raw', 'broll', 'old', 'finished')),
  name text not null,
  drive_url text,                              -- Google Drive, for now
  drive_file_id text,
  storage_path text,                           -- Supabase storage, later
  uploaded_by uuid,                            -- auth.uid() of whoever uploaded
  uploaded_by_role text,                       -- client / videographer / operator / editor
  created_at timestamptz not null default now()
);

create index if not exists social_footage_client_idx on social_footage(client_id, kind);
create index if not exists social_footage_video_idx on social_footage(video_id);
alter table social_footage enable row level security;

drop policy if exists "operators manage footage" on social_footage;
create policy "operators manage footage" on social_footage
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

-- Clients see their own b-roll / old footage library and the raw footage on
-- their own visible cards, and can add to them.
drop policy if exists "client users read own footage" on social_footage;
create policy "client users read own footage" on social_footage
  for select to authenticated
  using (client_id = social_current_client_id() and kind in ('raw', 'broll', 'old'));

drop policy if exists "client users add own footage" on social_footage;
create policy "client users add own footage" on social_footage
  for insert to authenticated
  with check (client_id = social_current_client_id() and kind in ('raw', 'broll', 'old'));

-- ── 6. Agent room (filled from Paperclip by the bridge) ─────────────────
create table if not exists social_agent_status (
  agent text primary key,                      -- Paperclip agent name, unchanged
  role text,
  status text not null default 'idle',         -- idle / working / stuck / error
  working_on text,                             -- the task title
  client_id uuid references social_clients(id) on delete set null,
  stuck_on text,
  needs_from_tait text,
  paperclip_task text,                         -- e.g. FUL-13
  updated_at timestamptz not null default now()
);

alter table social_agent_status enable row level security;

drop policy if exists "operators read agent status" on social_agent_status;
create policy "operators read agent status" on social_agent_status
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

-- ── 7. Audit log: idea status changes too ───────────────────────────────
alter table social_status_audit_log alter column video_id drop not null;
alter table social_status_audit_log add column if not exists idea_id uuid references social_ideas(id) on delete cascade;

create or replace function social_log_idea_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into social_status_audit_log
      (idea_id, client_id, action, from_status, to_status, changed_by, changed_by_role)
    values (
      new.id, new.client_id,
      case when tg_op = 'INSERT' then 'idea_created' else 'idea_status' end,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status, auth.uid(), social_current_role()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists social_ideas_log_status on social_ideas;
create trigger social_ideas_log_status after insert or update on social_ideas
  for each row execute function social_log_idea_status();
