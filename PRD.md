# PRD — Pulse

**A feedback intelligence system for MOE product teams: capture scattered, unprompted user feedback from any channel, cluster it with AI, and route it back into the roadmap as ranked signal.**

| | |
|---|---|
| **Owner** | Tan Guang Shin (DXD) |
| **Status** | Draft v0.1 — for review |
| **Last updated** | 18 Jun 2026 |
| **Tenant zero** | Teacher's Workspace (TW) |
| **Formal name / codename** | Voice of Schools / "Pulse" |

---

## TL;DR

When a product launches, feedback arrives through every door at once — email, in-product forms, chat groups, help-desk reports, leadership escalations — and nobody owns catching it, so teams keep asking "do we already know this?" with no answer. Pulse gives any MOE product team a standing capability to **ingest feedback from any channel into one place, auto-cluster it into themes, and route those themes back into prioritisation** — with a self-serve dashboard and a semantic search that turns "do we know this?" into a query, not a meeting. The design centre is that **adding a new feedback channel is a config action, not an engineering task.** Built on the existing DXD stack (Next.js, Supabase + pgvector, Anthropic API), ship as single-tenant for TW first, architected to go multi-tenant across MOE products.

---

## 1. Problem statement

TW launched in May 2026. Feedback is now arriving ad hoc across at least five channels (direct email, in-product feedback form, SGE, SSOE help-desk monthly summaries, superintendent escalations) with **no owner, no single store, no triage, and no path back into the roadmap.** The team repeatedly asks "do we know this already?" and cannot answer, so signal is lost and prioritisation runs on memory. This is not a TW-only problem — every MOE product team that launches hits the identical fragmented-feedback chaos, and each is on track to solve it bespoke. The cost of not solving it: real user pain goes unactioned, duplicated research effort across teams, and no defensible evidence base for what to build, fix, or sunset.

*Evidence: TW Research Pillars kick-off (17 Jun 2026) identified "support & feedback mining" as a live but unowned pillar, and scoped a searchable research repository as a standing need.*

---

## 2. Goals

1. **One front door per team, many channels.** A product team can route ≥ 3 feedback channels into a single store within one week of adopting Pulse, without engineering support per channel.
2. **Synthesis becomes self-serve.** Any team member or stakeholder can see ranked feedback themes and search the archive without asking a person to "pull the feedback."
3. **Close the loop.** Every actionable theme produces a routed recommendation to the owning PM; "do we know this?" is answerable by search in seconds.
4. **Horizontal from day one.** A second MOE product team can onboard onto the same system with no schema change — only configuration.
5. **Reduce time-to-signal.** Cut the lag between feedback arriving and a PM seeing a clustered, prioritised theme from "never / ad hoc" to within one synthesis cycle.

---

## 3. Non-goals (v1)

1. **Not a support desk.** No L1/L2/L3 ticket triage, SLAs, or per-user issue resolution. Pulse synthesises feedback; support operations is a separate product with a separate owner. *(Most common misread of this capability — stated explicitly.)*
2. **Not moderated/exploratory research.** Interviews, usability tests, and 4-week design sprints stay in the existing research track. Pulse handles *unprompted* feedback.
3. **Not every channel on day one.** Chat-bot capture and CSV bulk import are deferred. v1 ships three doors: hosted form, webhook, email-forward.
4. **Not auto-actioning the roadmap.** Pulse *recommends* priority changes and can draft a Jira issue; it does not silently mutate any team's backlog.
5. **Not a cross-product benchmarking tool.** Standardised questions are fine; comparing satisfaction scores across products with different purposes misleads, and is out of scope.

---

## 4. Users & personas

- **Product PM (primary).** Owns a product (e.g. TW), wants ranked themes and priority recommendations, and to answer "have we heard this before?"
- **Researcher.** Synthesises across products, wants a searchable archive of past feedback, interviewees, and dates.
- **Stakeholder / SEIO / superintendent.** Wants self-serve visibility into what schools are saying, to interpret for their own reporting chain.
- **Channel admin (often the PM).** Sets up and manages the feedback channels feeding their product.
- **Feedback author (indirect).** A teacher or school leader whose feedback enters via a form, forwarded email, or webhook — never interacts with Pulse directly.

---

## 5. User stories

**Channel setup**
- As a channel admin, I want to add a feedback channel by picking a type and getting the artifact I need (a form link, a webhook URL, or a forwarding address) so that I can start capturing feedback in minutes without an engineer.
- As a channel admin, I want to restrict an email channel to specific sender domains so that the tracker doesn't fill with junk.

**Capture**
- As a PM, I want feedback from a hosted form, a third-party form (Tally/Typeform/FormSG), and forwarded email to all land in one store so that nothing is lost across channels.
- As a PM, I want forwarded emails to capture the *original* author's feedback, not the forwarder's, so that synthesis reflects the real source.

**Synthesis & surfacing**
- As a PM, I want feedback auto-tagged (feature area, type, severity, sentiment, segment) and clustered into themes so that I see patterns, not a raw dump.
- As a PM, I want themes ranked by frequency × severity, with highlights *and* lowlights, so that I know what to act on and what's landing well.
- As a stakeholder, I want to filter and read the dashboard myself so that I don't depend on one person to report.

**Search & archive**
- As a PM, I want to semantically search all past feedback ("attendance flow complaints") so that "do we already know this?" is a query, not a meeting.
- As a researcher, I want every item retained and searchable with its date, channel, and segment so that the archive is a durable research repository.

**Routing**
- As a PM, I want a theme to produce a routed recommendation (and optionally a drafted Jira issue) so that synthesis feeds prioritisation and the loop closes.

---

## 6. System overview

End-to-end pipeline:

```
 INGEST     →   ENRICH (AI)   →   CLUSTER    →   SURFACE      →   ROUTE       →   ARCHIVE
 channels       auto-tag +        themes via     dashboard +      to PM /         searchable
 land here      embedding         pgvector       search           Jira draft      forever
```

**The unifying primitive — many front doors, one hallway.** Every channel, whatever its type, converges on a single internal ingest function and lands in one normalised `feedback` table, tagged with `channel_id` and `product_id`.

```
POST /api/ingest/[channelId]   (+ channel token)
  → resolve channel + its decoder + mapping_config
  → decode (passthrough JSON | FormSG decrypt | email strip)
  → normalise → feedback schema
  → insert row (idempotent on source message id)
  → enqueue enrich (async)
```

Adding a channel = creating a `channel` config record and handing the team the right front-door artifact. **No new code per channel** — except a one-time decoder per *novel* source type.

---

## 7. Intake model (the core)

Three channel types in v1, grouped by how much glue each needs:

| Channel type | Decoder | How it works | Notes |
|---|---|---|---|
| **Hosted form** | `passthrough` | Pulse-hosted form at `/f/[channelId]` POSTs to ingest | Zero per-team code; team gets a shareable/embeddable link |
| **Webhook** | `passthrough` (or `formsg`) | External tool POSTs to the ingest URL with a token | Native for Tally/Typeform/Jotform. **FormSG** is native but payload is end-to-end encrypted → `formsg` decoder verifies signature + decrypts via `@opengovsg/formsg-sdk` before mapping |
| **Email-forward** | `email` | Dedicated subdomain → Cloudflare Email Routing catch-all → Email Worker parses & POSTs to ingest | Each channel gets a unique address `<slug>@inbox.<domain>`; Worker resolves slug → `channelId` |

**Channel-as-config.** A channel record carries: `type`, `decoder`, `mapping_config` (how to read this source's payload), an `ingest_token`, and (for email) a generated `inbound_address`. The "Add channel" wizard generates these and shows the admin the artifact to copy.

**FormSG specifics (gov-default for schools):** form must be in Storage mode with the secret key saved; verify the `X-FormSG-Signature`; whitelist FormSG's origin IP if IP-allowlisting; make ingestion idempotent (FormSG retries and can deliver duplicates / out-of-order — dedup on submission ID).

**Email-forward specifics:** forwarded mail buries the real author in the quoted block — strip quoted history + signature footers (e.g. `talon`/`email-reply-parser`), then let the enrich LLM extract the original author and feedback rather than building a brittle header parser. Apply a per-channel sender-domain allowlist + SPF/DKIM verdict; dedup on `Message-ID`; decide store-vs-drop for attachments.

---

## 8. Data model

```
products  (id, name, created_at)                                   -- tenant
channels  (id, product_id, name, type, decoder, mapping_config jsonb,
           ingest_token, inbound_address, sender_allowlist jsonb,
           is_active, created_at)
feedback  (id, product_id, channel_id, source_msg_id,              -- dedup key
           raw_text, raw_payload jsonb, received_at, status,
           -- enrichment (nullable until processed):
           segment, feature_area, type, severity, sentiment,
           embedding vector, theme_id)
themes    (id, product_id, label, summary,
           frequency, severity_score, updated_at)
```

`status` pipeline: `new → enriched → clustered → routed → closed`. Tenancy enforced by `product_id` on every row (Postgres RLS in Supabase). pgvector powers both clustering (nearest-theme on insert) and semantic search.

---

## 9. Requirements

### P0 — Must-have (the v1 that solves the core problem)

1. **Ingest spine** — `products`/`channels`/`feedback` tables; `POST /api/ingest/[channelId]` with token auth; idempotent insert on `source_msg_id`.
   - *Given* a valid channel token, *when* a payload is POSTed, *then* a normalised feedback row is created and enrich is enqueued; a duplicate `source_msg_id` is ignored.
2. **Hosted form channel** — generic `/f/[channelId]` form that POSTs to ingest.
   - [ ] Admin creates a "form" channel and receives a working link
   - [ ] Submissions appear in the tracker within one cycle of the enrich job
3. **Webhook channel (passthrough + FormSG decoder)** — accept native webhooks; decrypt FormSG via SDK.
   - [ ] A Tally/Typeform webhook lands as feedback with fields mapped per `mapping_config`
   - [ ] A FormSG Storage-mode submission is verified, decrypted, and mapped; bad signature is rejected
4. **Email-forward channel** — subdomain catch-all → Worker → ingest; strip + allowlist + dedup.
   - [ ] Admin creates an "email" channel and receives a unique forwarding address
   - [ ] A forwarded email lands as feedback with quoted history/signature stripped
   - [ ] Mail from a non-allowlisted domain is rejected; duplicate `Message-ID` is ignored
5. **Enrich** — async job: one Anthropic call per item to set `segment/feature_area/type/severity/sentiment` + embedding; upsert into nearest `theme` via pgvector else create one.
6. **Dashboard** — feed of incoming feedback; themes ranked by frequency × severity; filter by feature area / segment / channel / date; drill from theme → raw items; highlights + lowlights split.
7. **Semantic search** — free-text query over the archive returning relevant items/themes (pgvector).
8. **Add-channel wizard** — pick type → generate token/address/link → show the copy-paste artifact.
9. **Tenancy** — every row scoped by `product_id`; RLS enforced; TW onboarded as tenant zero.

### P1 — Nice-to-have (fast follow)

- **Routing to Jira** — one-click draft a Jira issue from a theme with the suggested priority change.
- **Synthesis readout export** — generate the monthly one-pager (highlights, ranked themes, suggested priority changes) from current data.
- **Automated alerts** — push a digest when a theme crosses a volume threshold, so cadence isn't person-dependent.
- **Attachment storage** — store forwarded screenshots to Supabase storage and link them on the item.
- **CSV import channel** — for help-desk monthly reports.

### P2 — Future considerations (design for, don't build)

- **Chat capture** (SGE/Teams) via bot or forward.
- **Self-serve onboarding** for a new product team (create tenant, invite, configure) without admin intervention.
- **Attitudinal micro-surveys** surfaced alongside passive feedback (links to the separate attitudinal-metrics pillar).
- **Sunsetting signal** — low usability + low adoption flag for feature retirement.

---

## 10. Success metrics

**Leading (days–weeks)**
- Channels connected per onboarded product (target: ≥ 3 within week 1)
- Capture coverage: known channels actually feeding the tracker (target: 100% of inventoried channels)
- Enrich success rate: items auto-tagged without manual fix (target: ≥ 90%)
- Time-to-capture: feedback arrival → in tracker (target: < 1 synthesis cycle)

**Lagging (weeks–months)**
- Themes routed to PMs per cycle that result in a backlog change (target: ≥ 1 actionable/cycle)
- "Do we know this?" answerable by search (qualitative: team no longer asks with no answer)
- Second product team onboarded with zero schema change (binary: yes by end of phase 3)
- Reduction in duplicated research effort across teams (qualitative)

---

## 11. Dependencies & risks

| # | Dependency / risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Gov MX delegation for the email subdomain.** A web subdomain (e.g. on `*.moe.gov.sg`/GCC) is not mail-enabled; MX is centrally controlled and gov mail routes through managed infra. | Could block the email-forward channel entirely | Confirm MX ownership early; fall back to a Pulse-controlled domain for intake while keeping the gov subdomain for the web app |
| 2 | **FormSG encryption + SDK lock-in.** Storage-mode only, encrypted payloads, breaking-change risk if SDK auto-upgrades. | FormSG channel non-trivial | Build the `formsg` decoder once; pin the SDK version; handle retries idempotently |
| 3 | **GCC hosting constraints.** Anthropic API egress, Supabase, Vercel availability under GCC. | Architecture/hosting | Validate the same path used by SuMS (already live on GCC) |
| 4 | **PDPA / data classification.** Feedback text may contain personal data (teacher, student, school identifiers). | Compliance | Classify the store, scope access by tenant, define retention; treat as an open question for security review |
| 5 | **Survey/feedback fatigue across products.** Multiple MOE products touch the same teachers. | User trust | Coordinate milestone-linked touchpoints; Pulse is passive capture, lowering active-survey load |
| 6 | **Complexity creep.** Temptation to build all channels + tooling at once. | Slips the ship date | Hard phase gates below; P0 list is deliberately narrow |

---

## 12. Phasing

- **Phase 1 — Ingest spine + two easy doors.** Tables, ingest endpoint, hosted form + passthrough webhook, add-channel wizard, tenancy. *Exit: a Tally/Typeform/hosted form feeds the tracker.*
- **Phase 2 — Enrich + surface.** Async enrich, clustering, dashboard, semantic search. *Exit: themes ranked and searchable for TW.*
- **Phase 3 — FormSG + email-forward.** `formsg` decoder; Cloudflare email Worker, strip/allowlist/dedup. *Exit: the gov-blessed school channels are live.*
- **Phase 4 — Routing + readout (P1).** Jira draft, monthly readout export, threshold alerts.
- **Onboard product team #2** to prove horizontal (config-only).

*No hard external deadline. Suggested pace mirrors the SuMS build (~4 weeks to a usable core).*

---

## 13. Open questions

- **[Security/IT]** Who controls MX for the intended intake subdomain, and can we point it at Cloudflare? *(Blocking for the email channel.)*
- **[Security/Legal]** What data classification applies to captured feedback, and what retention is required? *(Blocking for production rollout.)*
- **[Eng]** Embedding + clustering approach: LLM-labelled themes vs. pure pgvector nearest-neighbour vs. hybrid — what gives stable, legible theme labels? *(Non-blocking; resolve in Phase 2.)*
- **[Stakeholder]** Does Pulse own the "shared feedback inbox" that SEIO/superintendents forward to, or does each product own its own? *(Non-blocking; affects channel topology.)*
- **[Product]** Threshold for "a theme worth routing" — fixed count, or volume-relative per product? *(Non-blocking.)*
- **[Stakeholder]** WPS / minister narrative — is Pulse part of what's announced, and does that pull any timeline forward? *(Non-blocking but watch.)*

---

## Appendix — glossary

- **Channel** — a configured feedback source (form, webhook, email address).
- **Decoder** — per-channel logic that turns a raw payload into clean fields (`passthrough`, `formsg`, `email`).
- **Theme** — a cluster of semantically similar feedback items.
- **Tenant** — a product using Pulse (TW is tenant zero), isolated by `product_id`.
