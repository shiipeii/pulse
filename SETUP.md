# Pulse — Setup guide (v0.3: core + Phase B + Phase C)

Everything here happens in your web browser. Budget about 90 minutes the first time.
Part 1 is required. Part 2 turns on optional connections (email, Jira, shared mailbox) — Pulse works without them and tells you what's not connected yet.

> ⚠️ **Treat every key and secret like a password.** They only ever go into Vercel's Environment Variables (or GitHub's repository secrets). Never paste them into chats, emails, Slack or the code.

> ⚠️ **Demo data only** until the data-classification and PDPA review in the PRD (NFR-10) is done.

**Already deployed the earlier version?** Skip to [Upgrading from the earlier version](#upgrading-from-the-earlier-version).

---

## Part 1 — Required

Keep a private note of these values as you go:

| # | Value | From |
|---|---|---|
| 1 | Supabase Project URL | Step 2 |
| 2 | Supabase anon (public) key | Step 2 |
| 3 | Supabase service_role (secret) key | Step 2 |
| 4 | Anthropic API key | Step 3 |
| 5 | OpenAI API key | Step 4 |
| 6 | Three long random strings you make up | for `SESSION_SECRET`, `ENRICH_WORKER_SECRET`, `CRON_SECRET` |
| 7 | Your own work email | becomes the first admin |

Tip for random strings: open any password generator and make three 40-character passwords.

### Step 1 — GitHub (holds the code)

1. On **github.com**, create a new **Private** repository (e.g. `pulse`). Don't add a README.
2. Click **"uploading an existing file"**. Unzip `pulse-updated.zip`, open the `pulse-main` folder, select **everything inside it**, and drag it onto the page. Commit.
3. The upload may skip hidden folders like `.github` (it holds the 10-minute schedule). If `.github/workflows/pulse-schedule.yml` is missing in the repo afterwards, click **Add file → Create new file**, type `.github/workflows/pulse-schedule.yml` as the name, paste the file's contents, and commit.

Check: `package.json` is at the top level of the repo.

### Step 2 — Supabase (database, sign-in emails, screenshot storage)

1. On **supabase.com**, create a project in **Southeast Asia (Singapore)**.
2. **SQL Editor → New query**: paste all of `supabase/SETUP_ALL.sql` and click **Run**. Expect "Success". **Table Editor** should now list 14 tables including `staff`, `sources`, `tickets` and `reports`.
3. **Storage**: check a bucket called `screenshots` exists and is **not public**. (The SQL creates it. If it's missing, click **New bucket**, name it `screenshots`, leave "Public" off, set the file size limit to 5 MB.)
4. **Project Settings → API / API Keys**: copy the **Project URL** (#1), the **anon / publishable** key (#2) and the **service_role / secret** key (#3, may be under "Legacy API keys").
5. Come back to **Authentication → URL Configuration** after Step 5 (you need your Vercel link first).

### Step 3 — Anthropic

**console.anthropic.com** → Billing: add the minimum credit → API Keys → Create key (#4).

### Step 4 — OpenAI (embeddings for grouping and search)

**platform.openai.com** → Billing: add the minimum credit → API keys → Create key (#5).

### Step 5 — Vercel

1. **vercel.com** → sign up with GitHub (Hobby plan) → **Add New → Project** → import your repo.
2. Add these **Environment Variables**, then click **Deploy**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | #1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | #2 |
| `SUPABASE_SERVICE_ROLE_KEY` | #3 |
| `ANTHROPIC_API_KEY` | #4 |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` |
| `OPENAI_API_KEY` | #5 |
| `EMBEDDING_PROVIDER` | `openai` |
| `EMBEDDING_DIM` | `1536` |
| `SESSION_SECRET` | random string 1 |
| `ENRICH_WORKER_SECRET` | random string 2 |
| `CRON_SECRET` | random string 3 |
| `ADMIN_EMAILS` | #7, your work email |
| `ALLOWED_EMAIL_DOMAINS` | `moe.edu.sg,moe.gov.sg` |
| `DASHBOARD_PASSWORD` | optional backup password (useful for demos) |

3. When it's live, add `NEXT_PUBLIC_APP_URL` = your Vercel link (no slash at the end), then **Deployments → ⋯ → Redeploy**.
4. Optional: **Settings → Functions → Function Region → Singapore (sin1)**, then redeploy.

### Step 6 — Let Supabase send sign-in links to your app

1. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: your Vercel link
   - **Redirect URLs** → Add: `https://YOUR-LINK/auth/callback`
2. Supabase → **Authentication → Providers → Email**: make sure Email is **enabled**.

Note: Supabase's built-in email only sends a few sign-in emails per hour. That's fine for testing. For real teachers, set up your own sender under **Authentication → SMTP Settings** (with an IT-approved address).

### Step 7 — Turn on the 10-minute schedule (mailbox + classification)

Vercel's free plan runs the daily job (reports, ticket updates, screenshot clean-up) automatically. The every-10-minutes job runs from GitHub:

1. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**:
   - `PULSE_URL` = your Vercel link
   - `CRON_SECRET` = random string 3 (same as in Vercel)
2. **Actions** tab → enable workflows if asked → open **Pulse schedule** → **Run workflow** once to test. It should finish green.

### Step 8 — Sign in and load demo data

1. Open your link → **Email me a sign-in link** with your admin email (or use the backup password). Click the link in your inbox.
2. **Staff** (top right) → add your colleagues with a role: admin, PM, engineer or stakeholder (read-only).
3. **Channels → Load demo data**. On the dashboard, click **Run enrich** until nothing is waiting.
4. **Sources** → add every other place feedback arrives today (surveys, inboxes, help desk…). The coverage number shows how much is still invisible.

---

## Part 2 — Optional connections

Each one is off until its settings exist. Add them in Vercel → Settings → Environment Variables, then redeploy.

### Emails to teachers and report sending (Resend)

Without this, Pulse records who *would* be emailed (visible on each theme) and you copy reports by hand.

1. **resend.com** → sign up → **Domains**: add and verify a domain you control (IT may need to add DNS records).
2. **API Keys** → create one.
3. Vercel variables: `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `Pulse <pulse@your-domain.sg>`), and optionally `REPORT_RECIPIENTS`.

For production with teachers, swap to an IT-approved government sender. Only `src/lib/email.ts` needs changing.

### One-click Jira tickets

Without this, tickets are still drafted; you file by hand and paste the key.

1. In Jira: **Profile → Security → Create and manage API tokens** → create a token.
2. Vercel variables: `JIRA_BASE_URL` (e.g. `https://your-org.atlassian.net`), `JIRA_EMAIL` (the token owner), `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` (e.g. `TW`). Optional: `JIRA_BUG_ISSUE_TYPE` (default Bug), `JIRA_FEATURE_ISSUE_TYPE` (default Story), `TICKET_THRESHOLD` (default 5).

### Shared feedback mailbox (Outlook / Microsoft 365)

This needs your IT team. Send them this:

> Please register an app in Microsoft Entra ID for Pulse with the **Mail.Read application permission** and grant admin consent. Then restrict it to **one mailbox only** using an **Application Access Policy** (`New-ApplicationAccessPolicy -AccessRight RestrictAccess -AppId <app id> -PolicyScopeGroupId <mail-enabled security group containing only the feedback mailbox>`). We need the tenant ID, client ID and a client secret.

Then:

1. Vercel variables: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`. Redeploy.
2. Pulse → **Channels → Shared mailbox** → enter the mailbox address (and optionally allowed sender domains).
3. New mail is read every 10 minutes by the schedule in Step 7. The same email arriving through both the mailbox and a forward is stored once.

### Email forwarding address (Cloudflare)

Code is in `workers/email-worker`. It needs a Cloudflare account and a domain whose email settings you control — see `README.md`. For an MOE subdomain, IT must change its mail records.

---

## Test everything

- [ ] **Form:** Channels → Open form. Report a bug with a screenshot. Pick "Report a bug" but write "I'd love dark mode" — it should show "AI changed from bug".
- [ ] **Review:** the AI-changed item is first, with a reason. Confirm it. Your name appears as the verifier.
- [ ] **Teacher portal:** open `/me`, sign in with an allowed email, and see your bug with its 4-step status.
- [ ] **Fix loop:** open the bug's theme → **Start fixing** → **Confirm on production → Fixed**. The teacher's status turns Fixed, and the theme shows who was emailed (or "waiting for email setup").
- [ ] **Released:** open a feature theme → **Mark released**. It shows "Released" in the teacher's Suggestions list.
- [ ] **Tickets:** verify 5 reports in one theme (or use **Draft ticket now**). File it, or paste a key.
- [ ] **Reports:** Reports → **Draft weekly now**. Edit, then Send or Copy.
- [ ] **Backlog:** bugs and features ranked together; **Export CSV** downloads.
- [ ] **Import:** Sources → Import a file → upload a small CSV, match columns, import.
- [ ] **Activity:** every change is listed; try **Undo** on one.
- [ ] **Roles:** sign in as a stakeholder — pages are visible, buttons are not.

---

## Upgrading from the earlier version

1. Supabase → SQL Editor: paste and run `supabase/UPGRADE_FROM_V0.2.sql`.
2. Check the `screenshots` storage bucket exists (Step 2.3).
3. Vercel: add `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`, `ALLOWED_EMAIL_DOMAINS`. Keep `DASHBOARD_PASSWORD` if you want the backup password.
4. Upload the new code to GitHub (replace the files). Vercel redeploys automatically.
5. Do Steps 6 and 7.

---

## If something goes wrong

- **Sign-in link says invalid or expired:** check Step 6 (Redirect URL must match exactly, including `https://`). Links work once; request a new one.
- **"Too many sign-in emails":** Supabase's built-in email limit. Wait, use the backup password, or set up SMTP (Step 6 note).
- **Screenshots fail to upload:** check the `screenshots` bucket exists and the file is under 5 MB.
- **Items stay "classifying…":** Supabase → Table Editor → `feedback` → the `enrich_error` column says why (usually a key or credit problem). Fix, redeploy, click **Run enrich**.
- **GitHub schedule fails:** check both repository secrets, and that `CRON_SECRET` matches Vercel exactly.
- **Anything else:** copy the exact error (or the first red line of Vercel's build log) and ask.
