-- Fully Social OS — clients who are already onboarded. Safe to re-run.
-- Run after 014.
--
-- Tait, 2026-10-07: some clients are onboarded in person (Tait films them,
-- he already has what he needs), like Hesedea. Their invite should only
-- ask for a password, then open their dashboard and its walkthrough: no
-- brand, voice memo or footage steps. Set on the operator dashboard,
-- Clients → Edit → "Already onboarded".

alter table social_clients add column if not exists skip_onboarding boolean not null default false;
