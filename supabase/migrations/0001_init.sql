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
