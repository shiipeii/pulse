import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { purgeScreenshots } from "@/lib/storage";
import { syncFiledTickets } from "@/lib/tickets";
import { scheduledReports } from "@/lib/reports";
import { refreshStaleWeeklyActions } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily housekeeping (Vercel Cron, see vercel.json):
 *   screenshot retention · Jira ticket updates · scheduled reports · suggested actions
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };
  await step("screenshots", purgeScreenshots);
  await step("tickets", syncFiledTickets);
  await step("reports", () => scheduledReports());
  await step("actions", refreshStaleWeeklyActions);
  return NextResponse.json(out);
}

export const GET = run;
export const POST = run;
