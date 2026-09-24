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
