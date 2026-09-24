/**
 * Outbound email (notifications, reports). Uses Resend's HTTP API when
 * RESEND_API_KEY and EMAIL_FROM are set; otherwise returns "no_provider" so
 * callers can record who WOULD have been emailed. Swap this file to use an
 * approved government mail service later — nothing else changes.
 */
export type SendResult = { status: "sent" } | { status: "no_provider" } | { status: "failed"; error: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string[]; subject: string; text: string; html?: string }): Promise<SendResult> {
  if (!emailConfigured()) return { status: "no_provider" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) return { status: "failed", error: `${res.status} ${(await res.text()).slice(0, 300)}` };
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
