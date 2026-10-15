-- Fully Social OS — an edit-by date for each carousel. Safe to re-run.
-- Run after 022.
--
-- Tait, 2026-10-15: every carousel gets a due date for the edit, shown on
-- the editor's card, To Do and calendar, and on the operator's Carousels
-- page (where it can be changed).
alter table social_carousels add column if not exists due_to_edit date;
