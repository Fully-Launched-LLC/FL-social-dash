-- Fully Social OS — Fully AI Social: the AI content team's team room on
-- the operator dashboard. Safe to re-run. Run after 024.
--
-- Tait, 2026-10-20: a "Fully AI Social" tab where he can see his AI
-- employees (Researcher, Strategist, Writer, Content Expert, Editor…) and
-- what they've said to each other, per client.
--
-- The employees run in Claude Code on Tait's Mac and keep their work in
-- clients/<slug>/team-room/ (gitignored). Claude turns the team room's
-- thread into JSON and Tait pastes it on the tab ("Add team-room update
-- from Claude"), the same way ideas come in through "Add ideas with Claude".
--
-- Operators only: clients and editors never see the AI team.

create table if not exists social_ai_team_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references social_clients(id) on delete cascade,  -- null: the whole team, no one client
  from_agent text not null,
  to_agent text not null default '',
  message text not null,
  file text,
  said_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table social_ai_team_messages enable row level security;

create index if not exists social_ai_team_messages_client_said
  on social_ai_team_messages (client_id, said_at desc);

drop policy if exists "operators manage ai team messages" on social_ai_team_messages;
create policy "operators manage ai team messages" on social_ai_team_messages
  for all to authenticated using (social_is_operator()) with check (social_is_operator());
