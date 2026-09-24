-- Already set up the earlier version (SETUP_ALL.sql with migrations 0001–0004)?
-- Paste THIS file into the Supabase SQL Editor instead to add Phase B + C.
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
