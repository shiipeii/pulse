-- ONE-SHOT SETUP: paste this whole file into the Supabase SQL Editor and click Run.
-- (Same as running migrations 0001–0005 + seed.sql in order.) Safe to run again.

-- ═════ supabase/migrations/0001_init.sql ═════
-- ─────────────────────────────────────────────────────────────────────────────
-- Pulse — ingest spine + enrichment schema
-- Many front doors, one hallway: every channel converges on `feedback`,
-- tagged with channel_id + product_id (the tenant key).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";      -- pgvector: clustering + semantic search

-- ── products = tenants ───────────────────────────────────────────────────────
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- ── channels = configured feedback sources (form | webhook | email) ──────────
-- Channel-as-config: type + decoder + mapping_config + the front-door artifact.
create table if not exists channels (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products (id) on delete cascade,
  name             text not null,
  type             text not null check (type in ('form', 'webhook', 'email')),
  decoder          text not null check (decoder in ('passthrough', 'formsg', 'email')),
  -- How to read this source's payload → feedback fields. See lib/mapping.ts.
  mapping_config   jsonb not null default '{}'::jsonb,
  -- Bearer token presented on POST /api/ingest/[channelId].
  ingest_token     text not null,
  -- Generated address for email channels: <slug>@inbox.<domain>.
  inbound_address  text unique,
  -- Per-channel sender-domain allowlist for email channels, e.g. ["moe.gov.sg"].
  sender_allowlist jsonb not null default '[]'::jsonb,
  -- FormSG storage-mode secret key (decoder='formsg'). Stored server-side only.
  formsg_secret    text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists channels_product_idx on channels (product_id);

-- ── feedback = the normalised store (one row per inbound item) ───────────────
create table if not exists feedback (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products (id) on delete cascade,
  channel_id    uuid not null references channels (id) on delete cascade,
  -- Idempotency / dedup key: FormSG submission id, email Message-ID, form nonce.
  source_msg_id text not null,

  raw_text      text not null,
  raw_payload   jsonb not null default '{}'::jsonb,
  -- Original author as extracted from a forwarded email / form (not the forwarder).
  author        text,
  received_at   timestamptz not null default now(),

  -- new → enriched → clustered → routed → closed
  status        text not null default 'new'
                  check (status in ('new', 'enriched', 'clustered', 'routed', 'closed')),

  -- enrichment (nullable until processed)
  segment       text,
  feature_area  text,
  type          text check (type is null or type in ('bug', 'feature_request', 'praise', 'question', 'complaint', 'other')),
  severity      text check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  sentiment     text check (sentiment is null or sentiment in ('positive', 'neutral', 'negative')),
  summary       text,
  embedding     vector(1536),
  theme_id      uuid,

  enrich_error  text,
  enriched_at   timestamptz,

  -- one row per (channel, source message) — idempotent ingest
  unique (channel_id, source_msg_id)
);

create index if not exists feedback_product_idx     on feedback (product_id);
create index if not exists feedback_channel_idx     on feedback (channel_id);
create index if not exists feedback_status_idx      on feedback (status);
create index if not exists feedback_received_idx    on feedback (received_at desc);
create index if not exists feedback_feature_idx     on feedback (feature_area);
create index if not exists feedback_segment_idx     on feedback (segment);
-- pgvector cosine index (HNSW works without a training pass — fine on an empty table).
create index if not exists feedback_embedding_idx
  on feedback using hnsw (embedding vector_cosine_ops);

-- ── themes = clusters of semantically similar feedback ───────────────────────
create table if not exists themes (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products (id) on delete cascade,
  label          text not null,
  summary        text,
  -- Centroid of member embeddings → nearest-theme matching on insert.
  centroid       vector(1536),
  frequency      integer not null default 0,
  -- frequency-weighted severity, 1 (low) .. 4 (critical)
  severity_score numeric not null default 0,
  sentiment      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists themes_product_idx on themes (product_id);
create index if not exists themes_centroid_idx
  on themes using hnsw (centroid vector_cosine_ops);

-- feedback.theme_id → themes.id (added after themes exists to avoid ordering issues)
alter table feedback
  drop constraint if exists feedback_theme_fk,
  add  constraint feedback_theme_fk
    foreign key (theme_id) references themes (id) on delete set null;

-- ═════ supabase/migrations/0002_functions.sql ═════
-- ─────────────────────────────────────────────────────────────────────────────
-- pgvector-backed RPCs: nearest-theme clustering + semantic search.
-- All are tenant-scoped — every function takes p_product_id and filters on it.
-- ─────────────────────────────────────────────────────────────────────────────

-- Nearest theme to a query embedding, within one product. Used by the clusterer
-- to decide attach-to-existing vs. create-new.
create or replace function match_theme (
  p_product_id uuid,
  p_embedding  vector(1536),
  p_limit      int default 1
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
  order by t.centroid <=> p_embedding
  limit p_limit;
$$;

-- Semantic search over the archive: top feedback by cosine similarity, tenant-scoped.
create or replace function search_feedback (
  p_product_id uuid,
  p_embedding  vector(1536),
  p_limit      int default 20
)
returns table (
  id           uuid,
  raw_text     text,
  summary      text,
  feature_area text,
  segment      text,
  type         text,
  severity     text,
  sentiment    text,
  theme_id     uuid,
  received_at  timestamptz,
  similarity   float
)
language sql stable
as $$
  select f.id,
         f.raw_text,
         f.summary,
         f.feature_area,
         f.segment,
         f.type,
         f.severity,
         f.sentiment,
         f.theme_id,
         f.received_at,
         1 - (f.embedding <=> p_embedding) as similarity
  from feedback f
  where f.product_id = p_product_id
    and f.embedding is not null
  order by f.embedding <=> p_embedding
  limit p_limit;
$$;

-- Recompute a theme's rollups (frequency, freq-weighted severity, centroid,
-- modal sentiment) from its members. Called after each item is clustered.
create or replace function recompute_theme (p_theme_id uuid)
returns void
language plpgsql
as $$
declare
  v_count   int;
  v_sev     numeric;
  v_sent    text;
  v_centroid vector(1536);
begin
  select count(*),
         coalesce(avg(
           case f.severity
             when 'critical' then 4
             when 'high'     then 3
             when 'medium'   then 2
             when 'low'      then 1
             else 0 end), 0)
    into v_count, v_sev
  from feedback f
  where f.theme_id = p_theme_id;

  -- modal sentiment across members
  select f.sentiment into v_sent
  from feedback f
  where f.theme_id = p_theme_id and f.sentiment is not null
  group by f.sentiment
  order by count(*) desc
  limit 1;

  -- centroid = average of member embeddings
  select avg(f.embedding)::vector(1536) into v_centroid
  from feedback f
  where f.theme_id = p_theme_id and f.embedding is not null;

  update themes
     set frequency      = v_count,
         severity_score = round(v_sev, 2),
         sentiment      = v_sent,
         centroid       = coalesce(v_centroid, centroid),
         updated_at     = now()
   where id = p_theme_id;
end;
$$;

-- ═════ supabase/migrations/0003_rls.sql ═════
-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security. Tenancy is enforced by product_id on every row.
--
-- v1 model:
--   • Trusted writers (ingest, enrich) use the SERVICE ROLE key, which bypasses
--     RLS. They additionally always filter by product_id in app code (defence in
--     depth — see lib/supabase.ts).
--   • Dashboard / read clients use the ANON or an authenticated key. The policies
--     below scope every read to the product_id carried in the JWT claim
--     `product_id` — so a second product team onboards with ZERO schema change,
--     only a different claim. (Auth wiring is an open question in the PRD §13;
--     the RLS scaffolding is in place regardless.)
-- ─────────────────────────────────────────────────────────────────────────────

alter table products  enable row level security;
alter table channels  enable row level security;
alter table feedback  enable row level security;
alter table themes    enable row level security;

-- Helper: the product_id claim on the current request's JWT (null if absent).
create or replace function current_product_id ()
returns uuid
language sql stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'product_id',
    ''
  )::uuid;
$$;

-- products: a client may read its own tenant row.
drop policy if exists products_read on products;
create policy products_read on products
  for select using (id = current_product_id());

-- channels: read own-tenant channels. (Writes go through service role.)
drop policy if exists channels_read on channels;
create policy channels_read on channels
  for select using (product_id = current_product_id());

-- feedback: read own-tenant feedback.
drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback
  for select using (product_id = current_product_id());

-- themes: read own-tenant themes.
drop policy if exists themes_read on themes;
create policy themes_read on themes
  for select using (product_id = current_product_id());

-- ═════ supabase/migrations/0004_bug_feature_review.sql ═════
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

-- ═════ supabase/migrations/0005_phase_b_c.sql ═════
-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — Phase B (teacher loop) + Phase C (coverage and automation).
-- Safe to re-run. See docs/PRD-v0.2.md for the requirement IDs referenced below.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── channels: two new intake types ──────────────────────────────────────────
--   import  = CSV / Excel uploads from a registered source (FR-91)
--   mailbox = shared feedback mailbox connector (FR-98)
alter table channels drop constraint if exists channels_type_check;
alter table channels add constraint channels_type_check
  check (type in ('form', 'webhook', 'email', 'import', 'mailbox'));
alter table channels drop constraint if exists channels_decoder_check;
alter table channels add constraint channels_decoder_check
  check (decoder in ('passthrough', 'formsg', 'email', 'import', 'mailbox'));
-- Connector cursor (e.g. last mailbox message seen).
alter table channels add column if not exists state jsonb not null default '{}'::jsonb;

-- ── feedback: who sent it, and a cross-channel duplicate key ────────────────
alter table feedback add column if not exists submitter_email text;
alter table feedback add column if not exists dedupe_key text;
create index if not exists feedback_submitter_idx on feedback (product_id, submitter_email);
-- FR-100: the same email arriving via mailbox AND a forward is stored once.
create unique index if not exists feedback_dedupe_uniq
  on feedback (product_id, dedupe_key) where dedupe_key is not null;

-- ── themes: full lifecycle + owner + AI suggestion ──────────────────────────
--   bugs:     open → being_fixed → fixed
--   features: open → planned (internal) → released     | not_now (internal)
--   other:    open | not_now
alter table themes drop constraint if exists themes_status_chk;
alter table themes add constraint themes_status_chk
  check (status in ('open', 'being_fixed', 'fixed', 'planned', 'not_now', 'released'));
alter table themes
  add column if not exists released_at   timestamptz,
  add column if not exists decided_at    timestamptz,
  add column if not exists owner         text,
  add column if not exists suggestion    text,
  add column if not exists suggestion_at timestamptz;

-- ── staff accounts (FR-81) ──────────────────────────────────────────────────
create table if not exists staff (
  email      text primary key,
  name       text,
  role       text not null check (role in ('admin', 'pm', 'engineer', 'stakeholder')),
  created_at timestamptz not null default now()
);

-- ── screenshots (FR-13, NFR-8, NFR-12) ──────────────────────────────────────
create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  feedback_id  uuid not null references feedback (id) on delete cascade,
  path         text not null unique,
  mime         text,
  size_bytes   int,
  delete_after timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists attachments_feedback_idx on attachments (feedback_id);

-- ── notifications (FR-60..62) ───────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  theme_id   uuid not null references themes (id) on delete cascade,
  recipient  text not null,
  kind       text not null check (kind in ('fixed', 'released')),
  status     text not null check (status in ('sent', 'skipped_no_provider', 'opted_out', 'failed')),
  error      text,
  sent_at    timestamptz not null default now(),
  unique (theme_id, recipient, kind)
);
create table if not exists email_optouts (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ── source register (FR-90, FR-91, FR-97) ───────────────────────────────────
create table if not exists sources (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products (id) on delete cascade,
  name           text not null,
  kind           text not null default 'other'
                 check (kind in ('form', 'formsg', 'email', 'mailbox', 'survey', 'helpdesk', 'escalation', 'chat', 'other')),
  owner          text,
  channel_id     uuid references channels (id) on delete set null,
  status         text not null default 'not_connected'
                 check (status in ('connected', 'imported', 'not_connected')),
  import_mapping jsonb not null default '{}'::jsonb,
  notes          text,
  created_at     timestamptz not null default now()
);
-- One register row per channel (NULLs allowed for sources not yet connected).
drop index if exists sources_channel_uniq;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sources_channel_key') then
    alter table sources add constraint sources_channel_key unique (channel_id);
  end if;
end $$;

-- ── tickets (FR-93) ─────────────────────────────────────────────────────────
create table if not exists tickets (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references products (id) on delete cascade,
  theme_id               uuid not null unique references themes (id) on delete cascade,
  status                 text not null default 'draft' check (status in ('draft', 'filed', 'dismissed')),
  title                  text not null,
  body                   text not null,
  jira_key               text,
  url                    text,
  filed_by               text,
  filed_at               timestamptz,
  reports_at_last_update int not null default 0,
  created_at             timestamptz not null default now()
);

-- ── reports (FR-94) ─────────────────────────────────────────────────────────
create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  kind         text not null check (kind in ('weekly', 'monthly')),
  period_start date not null,
  period_end   date not null,
  content      text not null,
  status       text not null default 'draft' check (status in ('draft', 'sent')),
  recipients   text,
  sent_by      text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (product_id, kind, period_start)
);

-- ── AI insights cache (FR-34) ───────────────────────────────────────────────
create table if not exists insights (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  kind         text not null,
  content      jsonb not null,
  generated_at timestamptz not null default now()
);
create index if not exists insights_kind_idx on insights (product_id, kind, generated_at desc);

-- ── audit log with undo (NFR-14, FR-95) ─────────────────────────────────────
create table if not exists audit_log (
  id           bigserial primary key,
  product_id   uuid references products (id) on delete cascade,
  actor        text not null,
  action       text not null,
  target_table text,
  target_id    text,
  before       jsonb,
  after        jsonb,
  undone       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_product_idx on audit_log (product_id, created_at desc);

-- ── per-theme evidence (reporters, channels, trend) ─────────────────────────
create or replace view theme_stats with (security_invoker = true) as
select
  t.id         as theme_id,
  t.product_id as product_id,
  count(f.id)::int as items,
  count(distinct coalesce(lower(f.submitter_email), lower(f.author), f.id::text))::int as reporters,
  count(distinct f.channel_id)::int as channels,
  (count(f.id) filter (where f.received_at >= now() - interval '7 days'))::int  as last7,
  (count(f.id) filter (where f.received_at >= now() - interval '14 days'
                         and f.received_at <  now() - interval '7 days'))::int as prev7,
  coalesce(bool_or(f.review_status = 'verified'), false) as any_verified,
  max(f.received_at) as last_received
from themes t
left join feedback f on f.theme_id = t.id
group by t.id, t.product_id;

-- ── RLS: new tables are server-only (service role bypasses; anon gets nothing) ─
alter table staff         enable row level security;
alter table attachments   enable row level security;
alter table notifications enable row level security;
alter table email_optouts enable row level security;
alter table sources       enable row level security;
alter table tickets       enable row level security;
alter table reports       enable row level security;
alter table insights      enable row level security;
alter table audit_log     enable row level security;

-- ── private storage bucket for screenshots (Supabase only) ──────────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('screenshots', 'screenshots', false, 5242880,
            array['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

-- ═════ supabase/seed.sql ═════
-- Tenant zero: Teacher's Workspace (TW).
insert into products (name, slug)
values ('Teacher''s Workspace', 'tw')
on conflict (slug) do nothing;
