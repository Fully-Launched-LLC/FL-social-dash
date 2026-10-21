-- 031: the Agent room (Unify the System, Phase 8; Tait, 2026-10-21). Safe
-- to re-run. Run after 030.
--
-- social_agent_status (026) is filled by the bridge on Tait's Mac from
-- Paperclip, every couple of minutes: each agent's state, what it's working
-- on, what it's stuck on, what it needs from Tait, its last line of work.
-- social_agent_requests is how the dashboard asks the bridge to act on an
-- agent: "retry" (restart a stuck agent) or "pause" / "resume". Operators
-- only. (The older hand-pasted team-room feed, migration 025, was dropped.)

alter table social_agent_status add column if not exists paused boolean not null default false;
alter table social_agent_status add column if not exists last_line text;     -- its latest update in Paperclip
alter table social_agent_status add column if not exists last_run_at timestamptz;

create table if not exists social_agent_requests (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  action text not null check (action in ('retry', 'pause', 'resume')),
  requested_by uuid default auth.uid(),
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  result text
);

alter table social_agent_requests enable row level security;
drop policy if exists "operators manage agent requests" on social_agent_requests;
create policy "operators manage agent requests" on social_agent_requests
  for all to authenticated
  using (social_is_operator()) with check (social_is_operator());
