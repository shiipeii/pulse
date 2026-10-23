-- Already set up Pulse before October 2026? Paste THIS file into the Supabase SQL Editor and click Run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — PM prioritisation layer: four signals on every issue (theme).
--   urgency · impact (1–10) · effort (S/M/L/XL) · frequency (from theme_stats)
-- plus the PM's decision (Now / Next / Later / Not now). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table themes
  add column if not exists effort            text,
  add column if not exists effort_source     text,
  add column if not exists effort_set_by     text,
  add column if not exists effort_set_at     timestamptz,
  add column if not exists decision          text,
  add column if not exists decided_by        text,
  add column if not exists impact            numeric,
  add column if not exists urgent            boolean not null default false,
  add column if not exists urgent_reason     text,
  add column if not exists urgent_since      timestamptz,
  add column if not exists urgent_cleared_at timestamptz,
  add column if not exists area              text,
  add column if not exists fits_goals        boolean not null default false,
  add column if not exists scored_at         timestamptz;

alter table themes drop constraint if exists themes_effort_chk;
alter table themes add constraint themes_effort_chk
  check (effort is null or effort in ('s', 'm', 'l', 'xl'));
alter table themes drop constraint if exists themes_effort_source_chk;
alter table themes add constraint themes_effort_source_chk
  check (effort_source is null or effort_source in ('ai', 'engineer', 'pm'));
alter table themes drop constraint if exists themes_decision_chk;
alter table themes add constraint themes_decision_chk
  check (decision is null or decision in ('now', 'next', 'later', 'not_now'));

create index if not exists themes_urgent_idx on themes (product_id) where urgent;
