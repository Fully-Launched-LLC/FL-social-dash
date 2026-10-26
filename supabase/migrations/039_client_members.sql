-- Fully Social OS — more than one person on a client's portal. Safe to re-run.
-- Run after 038.
--
-- Tait, 2026-10-26: "I want to be able to add multiple members to the same
-- dashboard, so it's not just Mark, but it's other people on his board as
-- well." The contact (social_clients.contact_email) stays the one person
-- invited the usual way. Everyone else on their team is a member: invited
-- from the client's page (Overview → People with access → Add a person) or
-- by `bridge.py invite --add`, through /api/invite. A member's first sign-in
-- links their login to the client (social_client_users), the same as the
-- contact's, and they see and can do exactly what the contact can.

create table if not exists social_client_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references social_clients(id) on delete cascade,
  email text not null,
  name text,
  invited_at timestamptz,
  invite_count integer not null default 0,
  created_at timestamptz not null default now()
);
-- One login opens one portal, so an email belongs to one client.
create unique index if not exists social_client_members_email on social_client_members (lower(email));

alter table social_client_members enable row level security;
drop policy if exists "client members: operators all" on social_client_members;
create policy "client members: operators all" on social_client_members
  for all to authenticated using (social_is_operator()) with check (social_is_operator());

-- Claiming an invite: the contact's email, or now a member's.
create or replace function social_claim_client_invite()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_client social_clients;
  v_name text;
begin
  if v_uid is null then return null; end if;
  if exists (select 1 from social_client_users where id = v_uid) then
    return (select client_id from social_client_users where id = v_uid);
  end if;
  if exists (select 1 from social_operators where id = v_uid)
     or exists (select 1 from social_editors where id = v_uid) then
    return null;
  end if;
  -- Only a confirmed email: proves the person controls that inbox.
  select email into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return null; end if;
  select * into v_client from social_clients
    where lower(contact_email) = lower(v_email) and status = 'active';
  if found then
    v_name := v_client.contact_name;
  else
    select m.name into v_name from social_client_members m
      where lower(m.email) = lower(v_email) and m.invited_at is not null;
    if not found then return null; end if;
    select c.* into v_client from social_client_members m join social_clients c on c.id = m.client_id
      where lower(m.email) = lower(v_email) and c.status = 'active';
    if not found then return null; end if;
  end if;
  insert into social_client_users (id, client_id, name, email)
    values (v_uid, v_client.id, v_name, v_email)
    on conflict do nothing;
  return v_client.id;
end;
$$;

revoke all on function social_claim_client_invite() from public, anon;
grant execute on function social_claim_client_invite() to authenticated;

-- Is the signed-in login someone else on their client's team (not the
-- contact)? Their first visit is only a password, then the portal: the
-- onboarding steps are the contact's.
create or replace function social_is_client_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from social_client_members m join auth.users u on lower(u.email) = lower(m.email)
    where u.id = auth.uid()
      and not exists (select 1 from social_clients c where lower(c.contact_email) = lower(u.email)));
$$;
revoke all on function social_is_client_member() from public, anon;
grant execute on function social_is_client_member() to authenticated;
