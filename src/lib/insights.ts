import { supabaseAdmin } from "./supabase";
import { suggestImprovement, weeklyActions, type SuggestedAction } from "./anthropic";
import type { Theme, ThemeStats } from "./types";

/** FR-34: cached "Suggested actions this week" (regenerated daily if older than 7 days, or on demand). */
export async function getWeeklyActions(productId: string): Promise<{ actions: SuggestedAction[]; generatedAt: string } | null> {
  const { data } = await supabaseAdmin()
    .from("insights")
    .select("content, generated_at")
    .eq("product_id", productId)
    .eq("kind", "weekly_actions")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { actions: (data.content as { actions: SuggestedAction[] }).actions ?? [], generatedAt: data.generated_at };
}

export async function generateWeeklyActions(productId: string): Promise<void> {
  const db = supabaseAdmin();
  const [{ data: themes }, { data: stats }] = await Promise.all([
    db.from("themes").select("*").eq("product_id", productId).gt("frequency", 0),
    db.from("theme_stats").select("*").eq("product_id", productId),
  ]);
  const byId = new Map((stats as ThemeStats[] | null ?? []).map((s) => [s.theme_id, s]));
  const open = (themes as Theme[] | null ?? []).filter((t) => !["fixed", "released", "not_now"].includes(t.status));
  if (open.length === 0) return;
  const input = open.map((t) => {
    const s = byId.get(t.id);
    return {
      id: t.id,
      label: t.label,
      category: t.category,
      status: t.status,
      reporters: s?.reporters ?? t.frequency,
      last7: s?.last7 ?? 0,
      prev7: s?.prev7 ?? 0,
      severity: Number(t.severity_score),
      regressed: t.regressed,
    };
  });
  const { actions } = await weeklyActions(input);
  const valid = actions.filter((a) => byId.has(a.theme_id));
  await db.from("insights").insert({ product_id: productId, kind: "weekly_actions", content: { actions: valid } });
}

export async function refreshStaleWeeklyActions(): Promise<number> {
  const db = supabaseAdmin();
  const { data: products } = await db.from("products").select("id");
  let n = 0;
  for (const p of products ?? []) {
    const current = await getWeeklyActions(p.id);
    if (current && Date.now() - new Date(current.generatedAt).getTime() < 7 * 86_400_000) continue;
    await generateWeeklyActions(p.id).catch(() => undefined);
    n += 1;
  }
  return n;
}

/** FR-34: per-theme suggested improvement, stored on the theme. */
export async function generateThemeSuggestion(themeId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data: theme } = await db.from("themes").select("label, category").eq("id", themeId).single();
  if (!theme) throw new Error("Theme not found");
  const { data: items } = await db
    .from("feedback")
    .select("summary, raw_text")
    .eq("theme_id", themeId)
    .order("received_at", { ascending: false })
    .limit(12);
  const { suggestion } = await suggestImprovement({
    label: theme.label,
    category: theme.category,
    items: (items ?? []).map((i) => i.summary || i.raw_text),
  });
  await db.from("themes").update({ suggestion, suggestion_at: new Date().toISOString() }).eq("id", themeId);
  return suggestion;
}
