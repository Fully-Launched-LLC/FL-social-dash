-- Fully Social OS — editors read every document of a client they edit
-- for, the ones built from the voice memo included. Safe to re-run. Run
-- after 019.
--
-- Tait, 2026-10-15: "I want the editor to be able to see all of the
-- documents for each client." Editors already read a client's Google Doc
-- documents, Team only ones included (012), and its brand guidelines
-- (folder links, 003). This adds the documents built from the onboarding
-- voice memo (social_client_generated_docs: Customer Data, Your Voice),
-- for clients they have a video for. Clients still read none (019).

drop policy if exists "editors read assigned client generated docs" on social_client_generated_docs;
create policy "editors read assigned client generated docs" on social_client_generated_docs
  for select
  to authenticated
  using (
    exists (
      select 1 from social_videos v
      where v.client_id = social_client_generated_docs.client_id
        and v.editor_id = social_current_editor_id()
    )
  );
