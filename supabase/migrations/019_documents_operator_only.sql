-- Fully Social OS — documents are for the team, not the client. Safe to
-- re-run. Run after 018.
--
-- Tait, 2026-10-15: "when I am viewing a client as an operator, I want to
-- be able to see all of the documents in each client portal, but I don't
-- want the client to be able to see the Google documents." The client
-- portal shows its Documents page to operators only; this takes away a
-- client login's read access too, so the documents can't be fetched from
-- the browser either. Operators keep full access (007, 008) and editors
-- keep reading the documents of clients they have a video for (012).

drop policy if exists "client users read own documents" on social_client_documents;
drop policy if exists "client users read own generated docs" on social_client_generated_docs;
