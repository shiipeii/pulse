import type { StaffRole } from "./types";

/**
 * Role-based information architecture (PRD → Information architecture).
 * Each staff role gets its own home, its own menu and a "rhythm": the moments
 * in the week when Pulse needs them. Admins also get the master view and can
 * preview any other role with "View as".
 */

/** Cookie that holds the admin's "View as" choice. Only honoured for real admins. */
export const VIEW_AS_COOKIE = "pulse_view_as";
export const PREVIEWABLE: StaffRole[] = ["pm", "engineer", "stakeholder"];

export interface NavLink {
  href: string;
  label: string;
}

export interface RoleInfo {
  label: string;
  homeTitle: string;
  job: string;
  question: string;
  uses: string;
  nav: NavLink[];
  rhythm: { when: string; tasks: { text: string; href: string }[] }[];
}

const HOME: NavLink = { href: "/", label: "Home" };

export const ROLE_INFO: Record<StaffRole, RoleInfo> = {
  admin: {
    label: "Admin",
    homeTitle: "Master view",
    job: "Sees everything, sets Pulse up and controls who has access.",
    question: "Is every part of Pulse working, and does everyone have the right access?",
    uses: "When setting up, when someone joins, and a monthly check",
    nav: [
      { href: "/", label: "Master view" },
      { href: "/priorities", label: "Priorities" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/backlog", label: "Backlog" },
      { href: "/review", label: "Review" },
      { href: "/tickets", label: "Tickets" },
      { href: "/reports", label: "Reports" },
      { href: "/sources", label: "Sources" },
      { href: "/channels", label: "Channels" },
      { href: "/search", label: "Search" },
      { href: "/activity", label: "Activity" },
      { href: "/admin/staff", label: "Staff" },
    ],
    rhythm: [
      {
        when: "When setting up",
        tasks: [
          { text: "Add each feedback channel (form, FormSG, shared mailbox)", href: "/channels" },
          { text: "List every feedback source", href: "/sources" },
        ],
      },
      {
        when: "When someone joins",
        tasks: [{ text: "Add them and pick their role", href: "/admin/staff" }],
      },
      {
        when: "Once a month",
        tasks: [
          { text: "Check the setup list below for anything not connected", href: "/#setup" },
          { text: "Look through the activity log", href: "/activity" },
        ],
      },
    ],
  },
  pm: {
    label: "PM",
    homeTitle: "Needs a decision",
    job: "Decides what to fix and what to build, based on evidence.",
    question: "What needs my decision today?",
    uses: "Every day for a few minutes, plus Monday and month-end routines",
    nav: [
      HOME,
      { href: "/priorities", label: "Priorities" },
      { href: "/review", label: "Review" },
      { href: "/backlog", label: "Backlog" },
      { href: "/tickets", label: "Tickets" },
      { href: "/reports", label: "Reports" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/sources", label: "Sources" },
      { href: "/search", label: "Search" },
      { href: "/activity", label: "Activity" },
    ],
    rhythm: [
      {
        when: "Every day · 5 min",
        tasks: [
          { text: "Check alerts for critical bugs and regressions", href: "/#alerts" },
          { text: "Clear the review queue, AI-changed items first", href: "/review" },
        ],
      },
      {
        when: "When a ticket is drafted",
        tasks: [{ text: "File it to Jira or dismiss it", href: "/tickets" }],
      },
      {
        when: "Every Monday",
        tasks: [
          { text: "Send the weekly digest", href: "/reports" },
          { text: "Decide on themes waiting 14+ days", href: "/#stale" },
        ],
      },
      {
        when: "Start of the month",
        tasks: [
          { text: "Send the monthly readout", href: "/reports" },
          { text: "Check the shared mailbox and FormSG are still flowing in", href: "/sources" },
          { text: "Mark shipped suggestions as Released", href: "/backlog?kind=feature" },
        ],
      },
    ],
  },
  engineer: {
    label: "Engineer",
    homeTitle: "My bugs",
    job: "Fixes bugs and confirms when a fix is live.",
    question: "What am I fixing, and how do I reproduce it?",
    uses: "When a bug is assigned, and when a fix reaches production",
    nav: [
      { href: "/", label: "My bugs" },
      { href: "/backlog?kind=bug", label: "All bugs" },
      { href: "/priorities", label: "Priorities" },
      { href: "/tickets", label: "Tickets" },
      { href: "/search", label: "Search" },
    ],
    rhythm: [
      {
        when: "When a bug is assigned to you",
        tasks: [
          { text: "Read the reproduction summary, then press Start fix", href: "/#mine" },
        ],
      },
      {
        when: "When the fix is on production",
        tasks: [{ text: "Press Confirm on production. Teachers are emailed.", href: "/#mine" }],
      },
      {
        when: "If a regression alert appears",
        tasks: [{ text: "The bug reopens itself, so check it first", href: "/#mine" }],
      },
    ],
  },
  stakeholder: {
    label: "Stakeholder",
    homeTitle: "Summary",
    job: "Needs to know what teachers struggle with and whether the team responds.",
    question: "Are we listening, and what changed?",
    uses: "Weekly or monthly, usually from the emailed report",
    nav: [
      { href: "/", label: "Summary" },
      { href: "/reports", label: "Reports" },
      { href: "/backlog", label: "Backlog" },
    ],
    rhythm: [
      {
        when: "Every week",
        tasks: [{ text: "Read the weekly digest", href: "/reports" }],
      },
      {
        when: "Every month",
        tasks: [
          { text: "Read the monthly readout", href: "/reports" },
          { text: "Check the decision rate and top 3 issues", href: "/" },
        ],
      },
    ],
  },
};

export function roleInfo(role?: string): RoleInfo {
  return ROLE_INFO[(role as StaffRole) ?? "stakeholder"] ?? ROLE_INFO.stakeholder;
}

/** Stakeholders only see themes and counts, never teacher names or emails. */
export const canSeeNames = (role?: string) => role !== "stakeholder";
