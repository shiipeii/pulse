import { supabaseAdmin } from "./supabase";
import { sendEmail, escapeHtml } from "./email";
import { signValue } from "./session";

/**
 * Tell everyone who reported a bug (kind "fixed") or suggested a feature
 * (kind "released") — once per person per theme (FR-60, FR-61). Respects
 * unsubscribes (FR-62). Without an email provider, rows are recorded as
 * "skipped_no_provider" so you can see who would have been told.
 */
export async function notifyTheme(themeId: string, kind: "fixed" | "released"): Promise<{ recipients: number; sent: number }> {
  const db = supabaseAdmin();
  const { data: theme } = await db.from("themes").select("id, product_id, label").eq("id", themeId).single();
  if (!theme) return { recipients: 0, sent: 0 };

  const { data: items } = await db
    .from("feedback")
    .select("submitter_email")
    .eq("theme_id", themeId)
    .not("submitter_email", "is", null);
  const recipients = Array.from(new Set((items ?? []).map((i) => String(i.submitter_email).toLowerCase())));
  if (recipients.length === 0) return { recipients: 0, sent: 0 };

  const { data: optouts } = await db.from("email_optouts").select("email").in("email", recipients);
  const optedOut = new Set((optouts ?? []).map((o) => o.email));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let sent = 0;
  for (const to of recipients) {
    // Claim the (theme, recipient, kind) slot first so nobody is emailed twice.
    const { data: claimed } = await db
      .from("notifications")
      .upsert(
        { product_id: theme.product_id, theme_id: themeId, recipient: to, kind, status: "skipped_no_provider" },
        { onConflict: "theme_id,recipient,kind", ignoreDuplicates: true },
      )
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    if (optedOut.has(to)) {
      await db.from("notifications").update({ status: "opted_out" }).eq("id", claimed[0].id);
      continue;
    }

    const unsub = `${appUrl}/unsubscribe?e=${encodeURIComponent(to)}&s=${await signValue(to)}`;
    const subject = kind === "fixed" ? `Fixed: ${theme.label}` : `Now available: ${theme.label}`;
    const lead =
      kind === "fixed"
        ? `Good news: the problem you reported, "${theme.label}", has been fixed.`
        : `Something you suggested, "${theme.label}", is now available.`;
    const text = `${lead}\n\nThank you for taking the time to tell us. See all your feedback: ${appUrl}/me\n\nDon't want these emails? ${unsub}`;
    const html = `<p>${escapeHtml(lead)}</p><p>Thank you for taking the time to tell us. <a href="${appUrl}/me">See all your feedback</a>.</p><p style="color:#64748b;font-size:12px"><a href="${unsub}">Unsubscribe</a></p>`;

    const r = await sendEmail({ to: [to], subject, text, html });
    await db
      .from("notifications")
      .update({ status: r.status === "sent" ? "sent" : r.status === "failed" ? "failed" : "skipped_no_provider", error: r.status === "failed" ? r.error : null })
      .eq("id", claimed[0].id);
    if (r.status === "sent") sent += 1;
  }
  return { recipients: recipients.length, sent };
}
