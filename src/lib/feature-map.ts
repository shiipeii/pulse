import type { StaffRole } from "./types";

/**
 * The master user flow: every feature in Pulse, placed on the journey a piece
 * of feedback takes, with who uses it, when, and whether it is ready.
 * Used by the admin's master view. Keep in step with the PRD feature inventory.
 */

export type Who = StaffRole | "teacher" | "system";

/** What the feature needs before it works. Checked live on the master view. */
export type Needs = "ai" | "embeddings" | "email" | "jira" | "mailbox" | "inbound_email" | "approval" | "designed";

export interface Feature {
  name: string;
  what: string;
  who: Who[];
  when: string;
  href?: string;
  needs?: Needs;
}

export interface Stage {
  id: string;
  step: string;
  title: string;
  goal: string;
  features: Feature[];
}

export const STAGES: Stage[] = [
  {
    id: "collect",
    step: "1",
    title: "Collect",
    goal: "Every piece of feedback lands in one place, once.",
    features: [
      { name: "Pulse feedback form", what: "Teachers pick Bug or Feature, tap device and browser, and can add screenshots.", who: ["teacher"], when: "Whenever a teacher has something to say", href: "/channels" },
      { name: "FormSG connection", what: "Answers from a FormSG form flow in automatically, decrypted and checked.", who: ["admin"], when: "Set up once per form", href: "/channels" },
      { name: "Shared feedback mailbox", what: "Reads new mail from the team's shared feedback inbox (Outlook).", who: ["admin"], when: "Set up once; checked every 10 minutes", href: "/channels", needs: "mailbox" },
      { name: "Email forwarding address", what: "Forward any stray feedback email to Pulse's own address.", who: ["pm", "admin"], when: "When feedback lands in a personal inbox", href: "/channels", needs: "inbound_email" },
      { name: "Webhooks (Tally, Typeform, Jotform)", what: "Other form tools post their answers straight into Pulse.", who: ["admin"], when: "Set up once per form", href: "/channels" },
      { name: "CSV and Excel import", what: "Bring in survey or other exports; columns are remembered for next time.", who: ["pm"], when: "When a file export arrives", href: "/import" },
      { name: "Duplicate check", what: "The same message arriving twice (for example mailbox and forward) is stored once.", who: ["system"], when: "Automatically, on arrival" },
      { name: "Source register", what: "Lists every feedback source, its owner, and whether it's connected.", who: ["pm", "admin"], when: "Monthly check", href: "/sources" },
    ],
  },
  {
    id: "classify",
    step: "2",
    title: "Classify and review",
    goal: "Each item is correctly a bug, a feature or other, and a person confirmed it.",
    features: [
      { name: "AI labels", what: "AI reads each item and sets area, severity, sentiment and a one-line summary.", who: ["system"], when: "Seconds after arrival", needs: "ai" },
      { name: "AI category check", what: "If the AI disagrees with the teacher's Bug or Feature pick, it flags the item and gives a reason.", who: ["system"], when: "Seconds after arrival", needs: "ai" },
      { name: "Review queue", what: "The PM confirms or changes each category with one click; AI-changed items are shown first.", who: ["pm"], when: "Every day", href: "/review" },
      { name: "Search", what: "Find anything by meaning, not just exact words (\"do we know this?\").", who: ["pm", "engineer", "admin"], when: "Any time", href: "/search", needs: "embeddings" },
    ],
  },
  {
    id: "group",
    step: "3",
    title: "Group and rank",
    goal: "Similar reports become one theme, ranked by evidence.",
    features: [
      { name: "Themes", what: "Similar reports are grouped automatically, with bugs and features kept apart.", who: ["system"], when: "Automatically", href: "/dashboard", needs: "embeddings" },
      { name: "Move, split and merge", what: "Fix the AI's grouping on the theme page.", who: ["pm"], when: "When a theme looks wrong" },
      { name: "Dashboard", what: "Bugs ranked by frequency × severity and features by demand, side by side.", who: ["pm", "admin"], when: "Any time", href: "/dashboard" },
      { name: "Prioritised backlog", what: "One ranked list of every open bug and feature, with evidence, owner and CSV export.", who: ["pm", "engineer", "stakeholder"], when: "Planning and prioritisation", href: "/backlog" },
      { name: "Channel mix and weekly trend", what: "Where each theme's reports came from, and reports per week.", who: ["pm"], when: "On any theme page" },
      { name: "AI suggested actions", what: "The week's top 3 actions, plus a suggested improvement for each theme.", who: ["pm"], when: "Every Monday", href: "/dashboard", needs: "ai" },
    ],
  },
  {
    id: "act",
    step: "4",
    title: "Decide and act",
    goal: "Every theme gets a decision, and bugs get fixed.",
    features: [
      { name: "Auto-drafted Jira tickets", what: "Drafted when a theme reaches 5 verified reports or has a critical bug. File it in one click.", who: ["pm"], when: "When a draft appears", href: "/tickets", needs: "jira" },
      { name: "Owner and status", what: "Set an owner; move bugs Open → Being fixed → Fixed, and features to Planned, Released or Not now.", who: ["pm", "engineer"], when: "When deciding", href: "/backlog" },
      { name: "My bugs", what: "An engineer's bugs, with a reproduction summary: device and browser mix, where it happens, trend and screenshots.", who: ["engineer"], when: "When a bug is assigned", href: "/" },
      { name: "Critical bug and regression alerts", what: "Shown at the top of the PM home. Email or Slack alerts aren't built yet.", who: ["pm"], when: "Every day", href: "/" },
      { name: "AI-drafted code fix", what: "AI drafts a fix and a test and opens a draft pull request. An engineer reviews and merges it.", who: ["engineer"], when: "When a bug is picked up", needs: "approval" },
    ],
  },
  {
    id: "close",
    step: "5",
    title: "Close the loop",
    goal: "Teachers hear back when their bug is fixed or their idea ships.",
    features: [
      { name: "Confirm on production", what: "An engineer confirms the fix is live, which marks the bug Fixed.", who: ["engineer"], when: "After deploying to production", href: "/" },
      { name: "Released", what: "The PM marks a suggestion as Released once it ships.", who: ["pm"], when: "After a release", href: "/backlog?kind=feature" },
      { name: "Fix and release emails", what: "Everyone who reported it is emailed once, with an unsubscribe link.", who: ["system"], when: "On Fixed or Released", needs: "email" },
      { name: "Your feedback (teacher portal)", what: "Teachers sign in with their MOE email to see bug status and the suggestions list.", who: ["teacher"], when: "Whenever they want to check", href: "/me" },
      { name: "Screenshot clean-up", what: "Screenshots are deleted 90 days after the fix.", who: ["system"], when: "Daily" },
    ],
  },
  {
    id: "report",
    step: "6",
    title: "Report and oversee",
    goal: "Leaders see the picture, and every automated step can be checked and undone.",
    features: [
      { name: "14-day decision rate", what: "The north star: the share of feedback with a decision within 14 days. Target 85%.", who: ["pm", "stakeholder", "admin"], when: "Weekly", href: "/" },
      { name: "Weekly digest and monthly readout", what: "Drafted automatically on Mondays and on the 1st. Review, then send in one click.", who: ["pm", "stakeholder"], when: "Mondays and the 1st of the month", href: "/reports" },
      { name: "Leadership summary", what: "Volume, decision rate, top issues and what shipped. No names or emails.", who: ["stakeholder"], when: "Weekly or monthly", href: "/" },
      { name: "Moving to one channel", what: "The share of feedback coming through Pulse's own form, month by month.", who: ["pm", "stakeholder"], when: "Monthly", href: "/sources" },
      { name: "Activity log with undo", what: "Every change, showing who made it and when. Single changes can be undone.", who: ["pm", "admin"], when: "When something looks wrong", href: "/activity" },
      { name: "Staff and roles", what: "Named accounts for admin, PM, engineer and stakeholder.", who: ["admin"], when: "When someone joins or leaves", href: "/admin/staff" },
    ],
  },
];

/** Designed but not built yet (PRD Phase E), shown greyed out. */
export const NOT_YET: { name: string; why: string }[] = [
  { name: "Email or Slack alerts for critical bugs", why: "Designed. Alerts show on the PM home for now." },
  { name: "Product switcher in the header", why: "Designed. Only needed once there's a second product." },
  { name: "MOE single sign-on", why: "Needs IT approval. Email sign-in links are used for now." },
  { name: "AI-drafted code fixes", why: "Needs IT approval for repo access." },
];

export const WHO_LABEL: Record<Who, string> = {
  admin: "Admin",
  pm: "PM",
  engineer: "Engineer",
  stakeholder: "Stakeholder",
  teacher: "Teacher",
  system: "Automatic",
};

export const NEEDS_LABEL: Record<Needs, string> = {
  ai: "Needs Anthropic key",
  embeddings: "Needs OpenAI key",
  email: "Needs Resend email",
  jira: "Needs Jira (drafts still work)",
  mailbox: "Needs mailbox access from IT",
  inbound_email: "Needs Cloudflare email setup",
  approval: "Needs IT approval",
  designed: "Designed only",
};

/** Which setup items are in place. Read on the server only. */
export function setupStatus(): Record<Needs, boolean> {
  const e = process.env;
  const embeddingProvider = (e.EMBEDDING_PROVIDER ?? "openai").toLowerCase();
  return {
    ai: Boolean(e.ANTHROPIC_API_KEY),
    embeddings: embeddingProvider === "voyage" ? Boolean(e.VOYAGE_API_KEY) : Boolean(e.OPENAI_API_KEY),
    email: Boolean(e.RESEND_API_KEY && e.EMAIL_FROM),
    jira: Boolean(e.JIRA_BASE_URL && e.JIRA_EMAIL && e.JIRA_API_TOKEN && e.JIRA_PROJECT_KEY),
    mailbox: Boolean(e.MS_TENANT_ID && e.MS_CLIENT_ID && e.MS_CLIENT_SECRET),
    inbound_email: Boolean(e.INBOUND_EMAIL_DOMAIN),
    approval: false,
    designed: false,
  };
}
