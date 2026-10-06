-- Fully Social OS — editor onboarding. Safe to re-run.
--
-- Tait invites an editor from the operator dashboard (Editors → Invite
-- editor, /api/invite-editor): the email "Welcome to the Fully Launched
-- editor dashboard" opens the editor page, which asks them to create a
-- password and then walks them through it (Tait, 2026-10-06).
--   invited_at / invite_count  when Tait last sent it, and how many times
--   setup_at                   when they created their password; the
--                              editor page asks for one until it's set

alter table social_editors add column if not exists invited_at timestamptz;
alter table social_editors add column if not exists invite_count int not null default 0;
alter table social_editors add column if not exists setup_at timestamptz;

-- Editors have no direct writes; this is the one thing they mark about
-- themselves.
create or replace function social_editor_setup_done()
returns void
language sql
security definer
set search_path = public
as $$
  update social_editors set setup_at = coalesce(setup_at, now())
  where id = auth.uid() and active;
$$;

revoke all on function social_editor_setup_done() from public, anon;
grant execute on function social_editor_setup_done() to authenticated;
