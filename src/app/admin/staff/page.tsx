import { supabaseRead } from "@/lib/supabase";
import { getStaff, adminEmails } from "@/lib/auth-server";
import { addStaff, removeStaff } from "@/app/admin-actions";

export const dynamic = "force-dynamic";

const ROLES = [
  ["admin", "Admin — everything, including staff and channels"],
  ["pm", "PM — verify, prioritise, tickets, reports"],
  ["engineer", "Engineer — update bug status, confirm fixes"],
  ["stakeholder", "Stakeholder — read-only"],
] as const;

/** FR-81 named staff accounts with roles. */
export default async function StaffPage() {
  const me = await getStaff();
  if (me?.role !== "admin") return <p className="card p-6 text-sm">Only admins can manage staff.</p>;
  const { data } = await supabaseRead().from("staff").select("*").order("email");
  const envAdmins = adminEmails();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff access</h1>
        <p className="text-sm text-slate-500">People listed here can sign in with an email link. Admins set in ADMIN_EMAILS always have access.</p>
      </div>
      <ul className="card divide-y divide-slate-100">
        {envAdmins.map((e) => (
          <li key={e} className="flex items-center gap-3 p-3 text-sm">
            <span className="font-medium">{e}</span>
            <span className="badge bg-indigo-50 text-indigo-700">admin</span>
            <span className="ml-auto text-xs text-slate-400">set in ADMIN_EMAILS</span>
          </li>
        ))}
        {(data ?? []).map((s) => (
          <li key={s.email} className="flex items-center gap-3 p-3 text-sm">
            <span className="font-medium">{s.name ?? s.email}</span>
            {s.name && <span className="text-slate-500">{s.email}</span>}
            <span className="badge bg-slate-100 text-slate-700">{s.role}</span>
            <form action={removeStaff} className="ml-auto">
              <input type="hidden" name="email" value={s.email} />
              <button className="text-xs text-slate-500 hover:text-rose-600">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addStaff} className="card grid gap-3 p-5 sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Add a person</h2>
        <input name="email" type="email" required placeholder="name@moe.gov.sg" className="rounded-lg border border-slate-300 p-2 text-sm" />
        <input name="name" placeholder="Name (optional)" className="rounded-lg border border-slate-300 p-2 text-sm" />
        <select name="role" defaultValue="pm" className="rounded-lg border border-slate-300 p-2 text-sm">
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="rounded-lg bg-pulse-600 px-3 py-2 text-sm font-medium text-white hover:bg-pulse-700">Add</button>
      </form>
    </div>
  );
}
