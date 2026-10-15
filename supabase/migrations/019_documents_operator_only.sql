-- Fully Social OS — documents are for the team, not the client. Safe to
-- re-run. Run after 018.
--
-- Tait, 2026-10-15: "only the editors and operators can see the client
-- documents." The client portal shows its Documents page to operators
-- only; this takes away a client login's read access too, so nothing can
-- be fetched from the browser either. Operators keep full access (001,
-- 007, 008); editors keep reading the documents and folder links of
-- clients they have a video for (003, 012).

-- 1. The document lists.
drop policy if exists "client users read own documents" on social_client_documents;
drop policy if exists "client users read own generated docs" on social_client_generated_docs;

-- 2. The folder links. The row holds document links too (brand guidelines,
-- important documents, customer data, content ideas, hooks, assets, the
-- client's main folder), so clients no longer read it. The portal needs
-- only two folders, neither of them documents: raw footage (each video's
-- Upload footage button falls back to it) and finished videos (the review
-- window finds the cut there). This function returns just those, for the
-- signed-in client's own row.
drop policy if exists "client users read own drive links" on social_drive_folder_links;

create or replace function social_client_footage_folders()
returns table (footage_uploads text, final_edits text)
language sql
stable
security definer
set search_path = public
as $$
  select f.footage_uploads, f.final_edits
  from social_drive_folder_links f
  where f.client_id = social_current_client_id();
$$;

revoke all on function social_client_footage_folders() from public, anon;
grant execute on function social_client_footage_folders() to authenticated;
