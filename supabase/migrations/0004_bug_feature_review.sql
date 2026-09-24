-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — Bug vs feature split, AI-correction flag, PM verification, bug status.
--
-- Classification flow (three layers):
--   1. user_category  — what the submitter picked on the form (bug | feature)
--   2. ai_category    — what the AI thinks (bug | feature | other).
--                       ai_corrected = true when it disagrees with the user.
--   3. PM verifies    — review_status 'pending' → 'verified'; verified_by/at.
--   `category` is always the current effective value used for clustering
--   and ranking (PM verdict > AI > user).
--
-- Themes get a category (bugs and features never share a theme) and, for bug
-- themes, an open/fixed status. New reports landing on a fixed theme reopen
-- it and flag it as a regression.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── feedback ─────────────────────────────────────────────────────────────────
alter table feedback
  add column if not exists category        text,
  add column if not exists user_category   text,
  add column if not exists ai_category     text,
  add column if not exists ai_reason       text,
  add column if not exists ai_corrected    boolean not null default false,
  add column if not exists review_status   text not null default 'pending',
  add column if not exists verified_by     text,
  add column if not exists verified_at     timestamptz;

alter table feedback drop constraint if exists feedback_category_chk;
alter table feedback add constraint feedback_category_chk
  check (category is null or category in ('bug', 'feature', 'other'));

alter table feedback drop constraint if exists feedback_user_category_chk;
alter table feedback add constraint feedback_user_category_chk
  check (user_category is null or user_category in ('bug', 'feature'));

alter table feedback drop constraint if exists feedback_ai_category_chk;
alter table feedback add constraint feedback_ai_category_chk
  check (ai_category is null or ai_category in ('bug', 'feature', 'other'));

alter table feedback drop constraint if exists feedback_review_status_chk;
alter table feedback add constraint feedback_review_status_chk
  check (review_status in ('pending', 'verified'));

-- Allow a transient 'processing' status so two enrich runs never grab the same row.
alter table feedback drop constraint if exists feedback_status_check;
alter table feedback add constraint feedback_status_check
  check (status in ('new', 'processing', 'enriched', 'clustered', 'routed', 'closed'));

create index if not exists feedback_category_idx on feedback (category);
create index if not exists feedback_review_idx   on feedback (review_status, ai_corrected);

-- Backfill any rows enriched before this migration.
update feedback
   set ai_category = case type when 'bug' then 'bug'
                               when 'feature_request' then 'feature'
                               else 'other' end
 where ai_category is null and type is not null;
update feedback set category = coalesce(category, ai_category) where category is null;

-- ── themes ───────────────────────────────────────────────────────────────────
alter table themes
  add column if not exists category   text not null default 'other',
  add column if not exists status     text not null default 'open',
  add column if not exists fixed_at   timestamptz,
  add column if not exists regressed  boolean not null default false;

alter table themes drop constraint if exists themes_category_chk;
alter table themes add constraint themes_category_chk
  check (category in ('bug', 'feature', 'other'));

alter table themes drop constraint if exists themes_status_chk;
alter table themes add constraint themes_status_chk
  check (status in ('open', 'fixed'));

-- Backfill theme category from the majority of its members.
update themes t
   set category = sub.category
  from (
    select distinct on (theme_id) theme_id, category
      from feedback
     where theme_id is not null and category is not null
     group by theme_id, category
     order by theme_id, count(*) desc
  ) sub
 where sub.theme_id = t.id;

-- ── match_theme now respects category ────────────────────────────────────────
drop function if exists match_theme (uuid, vector, int);

create or replace function match_theme (
  p_product_id uuid,
  p_embedding  vector(1536),
  p_limit      int default 1,
  p_category   text default null
)
returns table (
  id        uuid,
  label     text,
  distance  float
)
language sql stable
as $$
  select t.id,
         t.label,
         (t.centroid <=> p_embedding) as distance
  from themes t
  where t.product_id = p_product_id
    and t.centroid is not null
    and (p_category is null or t.category = p_category)
  order by t.centroid <=> p_embedding
  limit p_limit;
$$;
