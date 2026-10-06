-- Fully Social OS — team-only documents. Safe to re-run.
--
-- Some of a client's documents are for the team, not the client: Content
-- Research (Tait, 2026-10-06: "only visible to the editors and to the
-- operator"). social_client_documents.team_only hides a document from the
-- client's portal (and the documents email); editors now read every
-- document of a client they have a video for, team-only ones included,
-- and see them on the editor page.

alter table social_client_documents add column if not exists team_only boolean not null default false;

-- Content Research is team-only wherever it already exists.
update social_client_documents set team_only = true where title ilike '%research%' and not team_only;

drop policy if exists "client users read own documents" on social_client_documents;
create policy "client users read own documents" on social_client_documents
  for select
  to authenticated
  using (client_id = social_current_client_id() and not team_only);

drop policy if exists "editors read assigned client documents" on social_client_documents;
create policy "editors read assigned client documents" on social_client_documents
  for select
  to authenticated
  using (
    exists (
      select 1 from social_videos v
      where v.client_id = social_client_documents.client_id
        and v.editor_id = social_current_editor_id()
    )
  );
