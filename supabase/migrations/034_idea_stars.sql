-- 034: star the ideas Tait really likes (Tait, 2026-10-22: "the only
-- purpose of the content ideas section is a place for me to drop a new
-- idea... then i want to be able to star the ideas i really like and need
-- to be posted soon"). Starred ideas go first when the team builds the next
-- batch (bridge.py ask_for_plan). Safe to re-run. Run after 033.

alter table social_ideas add column if not exists starred boolean not null default false;
alter table social_ideas add column if not exists starred_at timestamptz;
create index if not exists social_ideas_starred_idx on social_ideas(client_id) where starred;
