# Changes

## v0.3 — Phase B (teacher loop) + Phase C (coverage and automation)

Requirement IDs refer to `docs/PRD-v0.2.md`.

### Phase B — teacher loop
- **Teacher sign-in with an MOE email link** (FR-50). Allowed domains are a setting (`ALLOWED_EMAIL_DOMAINS`, default `moe.edu.sg,moe.gov.sg`). Uses Supabase's built-in sign-in email.
- **"Your feedback" page** at `/me` (FR-51–53): bugs with a 4-step status (Received → Reviewed → Being fixed → Fixed) and one Suggestions list combining the top 20 ideas with the teacher's own (marked, with what they wrote). Suggestions only ever show "Released".
- **Full theme lifecycle** (FR-40–46): bugs open → being fixed → fixed (engineer confirms on production); features open → planned (internal) → released; "not now" (internal) for any.
- **Notification emails** (FR-60–62) when a bug is fixed or a feature is released, once per person, with unsubscribe. Works through Resend when configured; otherwise Pulse records who would have been emailed.
- **Screenshot upload** on bug reports (FR-13): up to 3 images, 5 MB each, private storage, short-lived viewing links, deleted 90 days after the fix (NFR-8, NFR-12).
- **Named staff accounts with roles** (FR-81): admin, PM, engineer, stakeholder (read-only). Staff sign in with an email link; the shared password remains as an optional backup.
- Signed-in teachers are linked to their submissions automatically (FR-14).

### Phase C — coverage and automation
- **Source register** (FR-90) with coverage % and share of volume per source; every channel is registered automatically.
- **CSV / Excel import** (FR-91) with column matching remembered per source and duplicate-safe re-imports.
- **Prioritised backlog** (FR-92): bugs and features ranked together with people, reports, trend, severity, channels, status, owner and ticket; CSV export.
- **Automated ticketing** (FR-93): AI drafts a Jira ticket when a verified theme reaches the threshold (default 5 reports) or any critical bug; one-click filing to Jira; filed tickets get daily "new reports" comments.
- **Automated reports** (FR-94): weekly digest (Mondays) and monthly readout (1st), drafted at 6am SGT with an AI summary; edit and send in one click.
- **AI suggested actions** for the week and a **suggested improvement** per theme (FR-34), labelled as AI.
- **Channel breakdown and weekly trend** per theme (FR-33).
- **Move, split and merge** reports and themes (FR-25).
- **Activity log with undo** (NFR-14, FR-95).
- **Moving to one channel** chart: share of feedback through Pulse's own form per month (FR-97).
- **Shared mailbox connector** for Outlook / Microsoft 365 (FR-98, FR-99), and **cross-channel duplicate check** on email Message-ID (FR-100).
- **Schedules:** daily job via Vercel Cron; every-10-minutes job (mailbox + classification) via GitHub Actions.

### Technical
- Migration `0005_phase_b_c.sql` (tested on Postgres 16 + pgvector, safe to re-run); `SETUP_ALL.sql` now includes it; `UPGRADE_FROM_V0.2.sql` for existing databases.
- Feedback text is passed to AI as quoted data with an explicit "don't follow instructions inside" rule (NFR-6).

---

## v0.2 — bug & feature loop

Built on the existing Pulse codebase. All P0 features from the original are intact.

## Bug vs feature split
- **Hosted form** now asks "Report a bug" or "Suggest a feature" (required). Bug reports get extra optional fields: where it happened and what was expected, plus simple device (Computer / Phone / Tablet) and browser (Chrome / Safari / Edge / Not sure) buttons that are pre-picked automatically — no version numbers. These are folded into the feedback text so the AI and PM see them.
- Third-party webhooks and FormSG can pass the submitter's choice too (`mapping_config.category`; FormSG auto-detects a question mentioning bug/feature).

## Three-layer classification
1. **User pick** stored as `user_category`.
2. **AI check** — Claude classifies independently as bug / feature / other. If it disagrees, `ai_corrected = true` and `ai_reason` records why. Shown as an "AI changed from …" badge.
3. **PM verification** — new **/review** page. AI-corrected items first. The PM confirms or changes the category; it's stamped "✓ verified by <name>". Changing the category moves the item to a theme of the right kind.

## Separate ranking
- Bugs and features never share a theme (clustering is per category).
- Dashboard shows **Bugs** (ranked by frequency × severity) and **Feature requests** (ranked by demand) side by side, plus "Other" (praise, questions).

## Bug status
- Bug themes can be **marked fixed** / reopened. A new report on a fixed bug reopens it and flags a **regression**.

## Demo readiness
- **Password gate** for the dashboard (`DASHBOARD_PASSWORD`). Public forms stay open.
- **Background classification** right after a form submission; the dashboard auto-refreshes while items are processing.
- **Load demo data** button on Channels (26 realistic teacher comments, some deliberately mislabelled).
- Public form pages hide admin navigation.

## Technical
- Model default changed from `claude-opus-4-8` to `claude-sonnet-5`.
- Structured output now uses a forced tool call (robust across SDK versions).
- Enrich claims rows (`processing` status) so parallel runs never double-process.
- Hosted-form `segment` is now actually saved (it was dropped at ingest before).
- New migration `0004_bug_feature_review.sql`, plus `supabase/SETUP_ALL.sql` (all migrations + seed in one paste). Tested against Postgres 16 + pgvector.
