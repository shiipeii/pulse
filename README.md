# Pulse — Voice of Schools

A feedback intelligence system for MOE product teams: capture scattered, unprompted
user feedback from any channel, cluster it with AI into ranked themes, and route it
back into the roadmap. See [`PRD.md`](./PRD.md) for the full product spec.

**Design centre:** adding a feedback channel is a config action, not an engineering
task. Every channel — hosted form, webhook, FormSG, forwarded email — converges on a
single ingest function and lands in one normalised `feedback` table, tagged with
`channel_id` and `product_id` (the tenant key).

```
 INGEST    →   ENRICH (AI)   →   CLUSTER   →   SURFACE     →   ROUTE      →   ARCHIVE
 channels      auto-tag +        themes via    dashboard +     to PM /        searchable
 land here     embedding         pgvector      search          Jira (P1)      forever
```

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + **pgvector** + RLS) — store, clustering, semantic search
- **Anthropic API** (`claude-sonnet-5`) — enrichment (auto-tagging) + theme labelling
- **Embeddings** — pluggable (default OpenAI-compatible `text-embedding-3-small`,
  1536-dim; Voyage selectable). Anthropic has no embeddings endpoint, so the vector
  half of enrichment runs through a separate provider (see `src/lib/embeddings.ts`).
- **Cloudflare Email Worker** — catch-all → parse → POST to ingest (email channel)

## What's built (P0)

| PRD P0 | Where |
|---|---|
| Ingest spine (`products`/`channels`/`feedback`/`themes`, token auth, idempotent insert) | `supabase/migrations/0001_init.sql`, `src/lib/ingest.ts`, `src/app/api/ingest/[channelId]/route.ts` |
| Hosted form channel | `src/app/f/[channelId]/`, server action in `src/app/actions.ts` |
| Webhook channel (passthrough + FormSG decoder) | `src/lib/decoders/passthrough.ts`, `src/lib/decoders/formsg.ts` |
| Email-forward channel (strip + allowlist + dedup) | `src/lib/decoders/email.ts`, `workers/email-worker/`, `src/app/api/ingest/email/route.ts` |
| Enrich (async: Anthropic tags + embedding + nearest-theme clustering) | `src/lib/enrich.ts`, `src/lib/anthropic.ts`, `src/lib/cluster.ts`, `src/app/api/enrich/route.ts` |
| Dashboard (feed, themes ranked by frequency × severity, filters, drill, highlights/lowlights) | `src/app/page.tsx`, `src/app/themes/[themeId]/page.tsx` |
| Semantic search | `src/app/search/`, `src/app/api/search/route.ts`, `search_feedback` RPC |
| Add-channel wizard | `src/app/channels/`, `src/lib/channels.ts` |
| Tenancy (`product_id` on every row, RLS) | `supabase/migrations/0003_rls.sql`, `src/lib/supabase.ts` |

P1 (Jira routing, readout export, alerts) and P2 are intentionally out of scope — see PRD §9.

## Setup

1. **Create a Supabase project** and apply the migrations in order:
   ```
   supabase/migrations/0001_init.sql
   supabase/migrations/0002_functions.sql
   supabase/migrations/0003_rls.sql
   supabase/seed.sql              # tenant zero: Teacher's Workspace
   ```
   (Via the Supabase SQL editor, or `supabase db push` with the CLI.)

2. **Configure env** — copy `.env.example` to `.env.local` and fill in Supabase keys,
   `ANTHROPIC_API_KEY`, and an embeddings provider. **`EMBEDDING_DIM` must match the
   `vector(N)` column** in `0001_init.sql` (default 1536).

3. **Install + run:**
   ```
   npm install
   npm run dev
   ```

4. **Add a channel** at `/channels`, send it some feedback, then **Run enrich** on the
   dashboard (or `POST /api/enrich` on a cron). Themes appear ranked; search at `/search`.

### Enrich worker

The enrich job is idempotent and queue-driven (`status = 'new'` rows). Drive it with:
- the dashboard **Run enrich** button (server action), or
- a scheduler hitting `POST /api/enrich` with `Authorization: Bearer $ENRICH_WORKER_SECRET`, or
- `npm run enrich` locally.

### Email channel (Cloudflare)

See `workers/email-worker/`. Deploy the worker, set `PULSE_INGEST_URL` +
`INGEST_MASTER_SECRET` secrets, and bind it as the catch-all for your inbound
subdomain in Cloudflare Email Routing. Each email channel created in the wizard gets a
unique `<slug>@inbox.<domain>`; the worker forwards by address and Pulse resolves it.

> **Note (PRD §11 risk #1):** a gov web subdomain is usually not mail-enabled (MX is
> centrally controlled). Confirm MX ownership early, or use a Pulse-controlled domain
> for intake while keeping the gov subdomain for the web app.

## Multi-tenancy

Every row carries `product_id`; RLS policies scope reads to the `product_id` JWT claim
(`0003_rls.sql`). A second product team onboards with **no schema change** — only a new
`products` row and a different claim. v1 ships single-tenant (TW) with end-user auth as
an open question (PRD §13); trusted writers use the service role and always filter by
`product_id` in app code as defence in depth.

## Notable decisions / deviations from the PRD

- **Enrich is two calls, not one.** The PRD says "one Anthropic call … + embedding".
  Anthropic has no embeddings endpoint, so enrich = one Anthropic call (tags + theme
  label + author extraction) **plus** one embeddings-provider call. Kept swappable to
  resolve PRD open-question §13 (embedding/clustering approach).
- **Email author extraction is LLM-based**, not a header parser (per PRD §7): the
  decoder strips quoted history + signatures; the enrich LLM pulls the original author.
- **Clustering** is pgvector nearest-theme on insert with an LLM-generated label for new
  themes (a hybrid) — tunable via `THEME_DISTANCE_THRESHOLD`.

## Docs

- `PRD.md` — original v0.1 PRD
- `docs/PRD-v0.2.md` — current PRD: built vs designed features, requirements, flows, phasing
- `SETUP.md` — step-by-step setup and deployment (fresh install and upgrade)
- `CHANGES.md` — what changed in v0.3 (Phases B + C) and v0.2
- `supabase/SETUP_ALL.sql` — one paste to set up a new database; `supabase/UPGRADE_FROM_V0.2.sql` to upgrade an existing one
