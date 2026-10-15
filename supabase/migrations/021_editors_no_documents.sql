-- Fully Social OS — editors read no client documents. Safe to re-run. Run
-- after 020.
--
-- Tait, 2026-10-15 (later): "take away access to the important google
-- documents. i dont want editors to be able to see those important
-- documents." This undoes 012 (editors read a client's Google Doc
-- documents, Team only included) and 020 (the voice-memo documents).
--
-- The folder links row holds document links too (customer data, content
-- ideas, hooks, the client's main folder), so editors no longer read it
-- either. An editor needs three links from it to do the work: the raw
-- footage folder, the finished video folder and the brand guidelines
-- (colors, logo, font). This function returns just those, for clients
-- they have a video for. Operators get every client's (they preview the
-- editor portal). Operators keep full access to everything (001, 007).

-- 1. The documents.
drop policy if exists "editors read assigned client documents" on social_client_documents;
drop policy if exists "editors read assigned client generated docs" on social_client_generated_docs;

-- 2. The folder links.
drop policy if exists "editors read assigned client drive links" on social_drive_folder_links;

create or replace function social_editor_folders()
returns table (client_id uuid, footage_uploads text, final_edits text, brand_voice text)
language sql
stable
security definer
set search_path = public
as $$
  select f.client_id, f.footage_uploads, f.final_edits, f.brand_voice
  from social_drive_folder_links f
  where social_is_operator()
     or exists (
       select 1 from social_videos v
       where v.client_id = f.client_id
         and v.editor_id = social_current_editor_id()
     );
$$;

revoke all on function social_editor_folders() from public, anon;
grant execute on function social_editor_folders() to authenticated;
