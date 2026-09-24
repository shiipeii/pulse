"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendReportNow, saveReport, type ActionResult } from "@/app/automation-actions";

interface Report {
  id: string;
  kind: string;
  period_start: string;
  period_end: string;
  content: string;
  status: string;
  recipients: string | null;
  sent_by: string | null;
  sent_at: string | null;
}

export function ReportEditor({ report, canAct }: { report: Report; canAct: boolean }) {
  const [state, send] = useFormState<ActionResult, FormData>(sendReportNow, { ok: false });
  const title = report.content.split("\n")[0].replace(/^# /, "");
  return (
    <details className="card p-5" open={report.status === "draft"}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-xs text-slate-500">{report.period_start} → {report.period_end}</span>
        <span className={`badge ${report.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {report.status === "sent" ? `sent by ${report.sent_by}` : "draft"}
        </span>
      </summary>
      <form action={send} className="mt-4 space-y-3">
        <input type="hidden" name="id" value={report.id} />
        <textarea name="content" defaultValue={report.content} rows={18} readOnly={!canAct} className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs" />
        <label className="block text-sm">
          <span className="font-medium">Send to</span>
          <input name="recipients" defaultValue={report.recipients ?? ""} readOnly={!canAct} placeholder="name@moe.gov.sg, other@moe.gov.sg" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </label>
        {canAct && (
          <div className="flex flex-wrap items-center gap-2">
            <Submit label={report.status === "sent" ? "Send again" : "Send"} />
            <button formAction={saveReport} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Save edits</button>
            <button type="button" onClick={() => navigator.clipboard.writeText(report.content)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              Copy text
            </button>
          </div>
        )}
        {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      </form>
    </details>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-pulse-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50">
      {pending ? "Sending…" : label}
    </button>
  );
}
