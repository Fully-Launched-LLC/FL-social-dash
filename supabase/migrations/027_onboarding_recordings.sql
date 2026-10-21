-- 027: every interview recording a client (or Tait) sends, and its
-- transcript (Unify the System, Phase 3; Tait, 2026-10-21). Safe to re-run.
-- Run after 026.
--
-- A client's voice memo from /welcome (social_client_onboarding.
-- voice_memo_path) and any call recording Tait uploads on Clients →
-- Onboarding both get a row here. The bridge on Tait's Mac transcribes each
-- one (Groq Whisper), saves the transcript here and appends it to
-- social_client_onboarding.transcript, then asks the Account Manager to
-- build the client's documents. Operators only.

create table if not exists social_onboarding_recordings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  kind text not null default 'voice_memo' check (kind in ('voice_memo', 'call')),
  name text not null,
  storage_path text not null unique,           -- in the private 'onboarding' bucket
  uploaded_by_role text,                       -- client / operator
  transcript text,
  transcript_status text not null default 'waiting'
    check (transcript_status in ('waiting', 'transcribing', 'done', 'failed')),
  transcript_error text,
  transcribed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists social_onboarding_recordings_client_idx on social_onboarding_recordings(client_id, created_at);
alter table social_onboarding_recordings enable row level security;

drop policy if exists "operators manage recordings" on social_onboarding_recordings;
create policy "operators manage recordings" on social_onboarding_recordings
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());

-- When the bridge asked the Account Manager for each job, so it never asks
-- twice. Operators only (part of the onboarding row).
alter table social_client_onboarding add column if not exists questions_requested_at timestamptz;
alter table social_client_onboarding add column if not exists docs_requested_at timestamptz;
