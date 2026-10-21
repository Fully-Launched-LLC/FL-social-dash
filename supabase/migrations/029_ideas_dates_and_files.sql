-- 029: the Content Idea Database gets dates and files (Unify the System,
-- Phase 5; Tait, 2026-10-21). Safe to re-run. Run after 028.
--
-- Tait's timing for every video, from its post date P:
--   script approved by P-13, filmed by P-10, edit done by P-7.
-- The monthly plan (built on the 10th for next month) picks 20 ideas from
-- the database and spreads their post dates over the month; a special
-- request ("post this on the 14th") keeps its day.
--
-- Files Tait sends with an idea (screenshots, voice notes, from the
-- dashboard or Telegram) go in the private 'ideas' bucket. Operators only.

alter table social_ideas add column if not exists requested_post_date date; -- Tait's special request
alter table social_ideas add column if not exists planned_post_date date;   -- set by the monthly plan
alter table social_ideas add column if not exists special_request text;     -- e.g. "use this for the launch"

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('ideas', 'ideas', false) on conflict (id) do nothing;
    execute 'drop policy if exists "ideas: operators" on storage.objects';
    execute $p$create policy "ideas: operators" on storage.objects
      for all to authenticated
      using (bucket_id = 'ideas' and social_is_operator())
      with check (bucket_id = 'ideas' and social_is_operator())$p$;
  end if;
end $$;
