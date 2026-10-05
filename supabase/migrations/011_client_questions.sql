-- Fully Social OS: each client's own voice memo questions. Safe to re-run.
-- Run after 010.
--
-- The content system (skill `voice-memo-questions`) writes 20 to 30
-- questions for each new client: their voice, their ideal customer, their
-- unique solutions, their stories, their offer. They're saved here and shown
-- on the client's onboarding Questions page. Empty means the standard list
-- (ONBOARDING_QUESTIONS in shell.js).
--
-- Shape: [{"section": "...", "note": "...", "items": [{"id": "...", "q": "...", "story": true}]}]
-- "story": true marks a story prompt: the client names the story in a
-- sentence or two on the memo, and tells it in full on camera.
--
-- Clients already read their own social_clients row (001); only operators
-- write it, so no new policy is needed.

alter table social_clients add column if not exists onboarding_questions jsonb;
