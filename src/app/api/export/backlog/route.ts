import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "@/lib/product";
import { getBacklog } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** CSV export of the prioritised backlog (FR-92). Staff-only via middleware. */
export async function GET(req: NextRequest) {
  const product = await getProduct();
  if (!product) return NextResponse.json({ error: "No product" }, { status: 404 });
  const kind = req.nextUrl.searchParams.get("kind") ?? "all";
  const show = req.nextUrl.searchParams.get("show") ?? "open";
  const closed = (s: string) => ["fixed", "released", "not_now"].includes(s);
  const rows = (await getBacklog(product.id)).filter(
    (r) => (kind === "all" || r.theme.category === kind) && (show === "all" || (show === "open" ? !closed(r.theme.status) : closed(r.theme.status))),
  );
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["rank", "kind", "theme", "people", "reports", "last_7_days", "previous_7_days", "severity", "channels", "status", "owner", "ticket", "score"];
  const lines = rows.map((r, i) =>
    [i + 1, r.theme.category, r.theme.label, r.stats?.reporters ?? "", r.stats?.items ?? r.theme.frequency, r.stats?.last7 ?? "", r.stats?.prev7 ?? "", Number(r.theme.severity_score).toFixed(1), r.stats?.channels ?? "", r.theme.status, r.theme.owner ?? "", r.ticket?.jira_key ?? "", r.score.toFixed(0)]
      .map(esc)
      .join(","),
  );
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pulse-backlog-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
