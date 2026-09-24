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
