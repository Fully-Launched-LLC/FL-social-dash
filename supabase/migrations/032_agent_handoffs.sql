-- 032: live hand-offs for the Agent room's graph (Tait, 2026-10-21: "i still
-- want to be able to see all of the agents working together like we
-- originally created"). Safe to re-run. Run after 031.
--
-- The bridge fills social_agent_status.handoffs from Paperclip: work passed
-- in the last hour, or still in progress, as [{from, to, task}] ("Tait" for
-- Tait). Each hand-off is stored on the agent's row (the receiver's, or the
-- sender's when it went to Tait). The graph draws a moving line for each.
alter table social_agent_status add column if not exists handoffs jsonb not null default '[]'::jsonb;
