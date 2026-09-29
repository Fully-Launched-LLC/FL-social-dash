-- Fully Launched CRM — migration 013
-- Team-only access.
--
-- Why: this Supabase project also hosts the social dashboard
-- (FL-social-dash, tables prefixed social_), which gives logins to clients
-- and editors. Until now most CRM policies allowed ANY authenticated user
-- (`using (true)`), so a client's portal login could read and change the
-- CRM's projects, tasks, leads, contacts and calls.
--
-- What changes: every one of those policies now also requires
-- public.is_team_member() — the login's CONFIRMED email is on team_members.
-- Admin-only rules are unchanged (transactions; team_members writes;
-- project deletes stay admin-or-manager). The Cal.com webhook uses the
-- service role, which bypasses RLS, so it's unaffected.
--
-- assign_call_to_project() is security definer (it skips RLS), so it gets
-- the same check inside. merge_contacts() is security invoker, so the table
-- policies already cover it.
--
-- Before running: make sure every person who uses the CRM is a row in
-- team_members with the email they sign in with. Anyone who isn't will see
-- an empty CRM afterwards (nothing is deleted; add them and it comes back).
--
-- Run once, after 012, in the Supabase SQL Editor. Safe to re-run. Touches
-- no data.

-- ── is_team_member() ─────────────────────────────────────────────────────
-- Security definer so it can read auth.users and team_members from inside
-- a policy without recursing into team_members' own policies. Requires a
-- confirmed email (proves the person controls that inbox), matched without
-- case.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.team_members tm on lower(tm.email) = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

-- ── team_members: team reads it; admin writes (005) unchanged ───────────
drop policy if exists "authenticated read" on team_members;
drop policy if exists "team read" on team_members;
create policy "team read" on team_members
  for select to authenticated
  using (public.is_team_member());

-- ── tables that were open to every login ─────────────────────────────────
drop policy if exists "authenticated full access" on project_tasks;
drop policy if exists "team full access" on project_tasks;
create policy "team full access" on project_tasks
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

drop policy if exists "authenticated full access" on leads;
drop policy if exists "team full access" on leads;
create policy "team full access" on leads
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

drop policy if exists "authenticated full access" on contacts;
drop policy if exists "team full access" on contacts;
create policy "team full access" on contacts
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

drop policy if exists "authenticated full access" on contact_merges;
drop policy if exists "team full access" on contact_merges;
create policy "team full access" on contact_merges
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- projects: select/insert/update for the team; delete stays admin-or-manager (007).
drop policy if exists "authenticated select" on projects;
drop policy if exists "authenticated insert" on projects;
drop policy if exists "authenticated update" on projects;
drop policy if exists "team select" on projects;
drop policy if exists "team insert" on projects;
drop policy if exists "team update" on projects;
create policy "team select" on projects
  for select to authenticated using (public.is_team_member());
create policy "team insert" on projects
  for insert to authenticated with check (public.is_team_member());
create policy "team update" on projects
  for update to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- calls / call_projects: read-only for the team (writes: webhook or the function below).
drop policy if exists "authenticated read" on calls;
drop policy if exists "team read" on calls;
create policy "team read" on calls
  for select to authenticated using (public.is_team_member());

drop policy if exists "authenticated read" on call_projects;
drop policy if exists "team read" on call_projects;
create policy "team read" on call_projects
  for select to authenticated using (public.is_team_member());

-- ── assign_call_to_project(): same as 012, plus the team check ──────────
create or replace function public.assign_call_to_project(
  p_call_id uuid,
  p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.is_team_member() then
    raise exception 'Only team members can assign calls';
  end if;
  if not exists (select 1 from calls where id = p_call_id) then
    raise exception 'Call not found';
  end if;
  if not exists (select 1 from projects where id = p_project_id) then
    raise exception 'Project not found';
  end if;

  insert into call_projects (call_id, project_id)
  values (p_call_id, p_project_id)
  on conflict do nothing;

  update calls
     set matched_by = 'manual', updated_at = now()
   where id = p_call_id and matched_by = 'none';
end;
$$;
