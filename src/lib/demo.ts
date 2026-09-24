import { supabaseAdmin } from "./supabase";
import { createChannel } from "./channels";
import { ingest, loadChannel } from "./ingest";

/**
 * Demo data: realistic Teacher's Workspace feedback, a few deliberately
 * mislabelled by the "submitter" so the AI-correction flag shows up.
 * Items land as `new`; the enrich job classifies and clusters them.
 * Safe to re-run: stable nonces mean nothing is duplicated.
 */
type Pick = "bug" | "feature";
export const SAMPLES: { pick: Pick; text: string; role: string; daysAgo: number }[] = [
  // ── Attendance not saving (bug cluster) ──
  { pick: "bug", role: "teacher", daysAgo: 20, text: "I marked attendance for 3E2 and pressed Save but when I came back the whole class was showing as unmarked again." },
  { pick: "bug", role: "teacher", daysAgo: 16, text: "Attendance changes don't stick. I have to re-enter it two or three times before it saves." },
  { pick: "bug", role: "HOD", daysAgo: 11, text: "Several teachers in my department say attendance they took in the morning disappears by recess. This is affecting our reporting." },
  { pick: "bug", role: "teacher", daysAgo: 5, text: "Save button on the attendance page spins forever then my marks are gone. Chrome on school laptop." },
  { pick: "feature", role: "teacher", daysAgo: 3, text: "Can you make attendance actually save properly? Every time I take it for my form class it resets." }, // mislabelled → bug
  // ── Login / SSO loop (bug cluster) ──
  { pick: "bug", role: "teacher", daysAgo: 18, text: "After logging in with my MOE account it sends me back to the login page again. Stuck in a loop." },
  { pick: "bug", role: "admin staff", daysAgo: 9, text: "Login keeps redirecting to the sign-in screen on Safari. Works on Chrome." },
  { pick: "bug", role: "teacher", daysAgo: 2, text: "Cannot log in on my iPad, it just keeps bouncing back to the login page." },
  // ── Slow lesson planner (bug) ──
  { pick: "bug", role: "teacher", daysAgo: 14, text: "The lesson planner takes almost a minute to load when I open a unit with lots of resources." },
  { pick: "bug", role: "teacher", daysAgo: 6, text: "Lesson plans with attachments are extremely slow to open, sometimes the page just freezes." },
  // ── Export to Excel (feature cluster) ──
  { pick: "feature", role: "teacher", daysAgo: 19, text: "It would save me a lot of time if I could export my class marks to Excel so I can do my own analysis." },
  { pick: "feature", role: "HOD", daysAgo: 13, text: "Please add a download to Excel/CSV for the marks table. I need to consolidate results across classes." },
  { pick: "feature", role: "teacher", daysAgo: 8, text: "Would love an 'export to spreadsheet' button for assessment results." },
  { pick: "bug", role: "teacher", daysAgo: 4, text: "There's no way to export marks to Excel, I have to copy and paste every row manually." }, // mislabelled → feature
  { pick: "feature", role: "school leader", daysAgo: 1, text: "An export of marks by level would really help our data meetings." },
  // ── Parent notifications (feature cluster) ──
  { pick: "feature", role: "teacher", daysAgo: 17, text: "Could the system notify parents automatically when a student is marked absent?" },
  { pick: "feature", role: "school leader", daysAgo: 10, text: "It would be great if parents got an alert through Parents Gateway when their child is absent without a valid reason." },
  { pick: "feature", role: "teacher", daysAgo: 7, text: "Auto-send absence notices to parents so I don't have to message each one myself." },
  // ── Bulk lesson copy (feature) ──
  { pick: "feature", role: "teacher", daysAgo: 15, text: "Let me copy a lesson plan to all my classes at once instead of one by one." },
  { pick: "feature", role: "HOD", daysAgo: 12, text: "Please allow sharing a unit plan with the whole department in one click." },
  // ── Dark mode (feature, low) ──
  { pick: "feature", role: "teacher", daysAgo: 9, text: "A dark mode would be nice for marking at night." },
  // ── Praise (other) ──
  { pick: "feature", role: "teacher", daysAgo: 12, text: "Just wanted to say the new timetable view is so much clearer than the old system. Thank you!" }, // praise → other
  { pick: "bug", role: "school leader", daysAgo: 6, text: "Really appreciate how quickly the team responded to our school's feedback last month. Keep it up." }, // praise → other
  // ── Question (other) ──
  { pick: "bug", role: "admin staff", daysAgo: 3, text: "Is there a guide somewhere on how to set up relief timetables? I couldn't find it." }, // question → other
  // ── Mobile layout (bug) ──
  { pick: "bug", role: "teacher", daysAgo: 8, text: "On my phone the attendance buttons overlap and I keep tapping the wrong student." },
  { pick: "bug", role: "teacher", daysAgo: 2, text: "Mobile view is broken on the class list page, the names get cut off and buttons overlap." },
];


const CHANNEL_NAME = "Teacher's Workspace feedback form";

export async function loadDemoData(): Promise<{ channelId: string; added: number }> {
  const db = supabaseAdmin();
  const { data: product } = await db.from("products").select("*").eq("slug", "tw").single();
  if (!product) throw new Error("Tenant 'tw' not found — run supabase/seed.sql first.");

  let { data: existing } = await db
    .from("channels")
    .select("id")
    .eq("product_id", product.id)
    .eq("name", CHANNEL_NAME)
    .maybeSingle();
  if (!existing) {
    const created = await createChannel({ productId: product.id, name: CHANNEL_NAME, type: "form" });
    existing = { id: created.id };
  }
  const channel = await loadChannel(existing.id);
  if (!channel) throw new Error("Could not load demo channel");

  let added = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const payload = { message: s.text, category: s.pick, segment: s.role, email: null, nonce: `demo-${i}` };
    const r = await ingest(channel, JSON.stringify(payload), new Headers(), "");
    if (!r.duplicate) {
      added += 1;
      const when = new Date(Date.now() - s.daysAgo * 86_400_000 - Math.random() * 36_000_000);
      await db.from("feedback").update({ received_at: when.toISOString() }).eq("id", r.id);
    }
  }
  return { channelId: channel.id, added };
}
