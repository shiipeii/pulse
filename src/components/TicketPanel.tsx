"use client";

import { useFormState, useFormStatus } from "react-dom";
import { fileTicket, dismissTicket, type ActionResult } from "@/app/automation-actions";

interface Ticket {
  id: string;
  status: string;
  title: string;
  body: string;
  jira_key: string | null;
  url: string | null;
  filed_by: string | null;
}

/** FR-93: draft ticket → one-click file, shown on the theme page and the Tickets page. */
export function TicketPanel({
  themeId,
  ticket,
  canAct,
  draftAction,
}: {
  themeId: string;
  ticket: Ticket | null;
  canAct: boolean;
  draftAction?: (fd: FormData) => Promise<void>;
}) {
  const [state, action] = useFormState<ActionResult, FormData>(fileTicket, { ok: false });

  if (!ticket || ticket.status === "dismissed") {
    return (
      <section className="card flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">Ticket</h2>
          <p className="text-sm text-slate-500">
            {ticket?.status === "dismissed" ? "Draft dismissed." : "Pulse drafts one automatically once this theme is verified and crosses the threshold."}
          </p>
        </div>
        {canAct && draftAction && (
          <form action={draftAction}>
            <input type="hidden" name="id" value={themeId} />
            <Submit label="Draft ticket now" secondary />
          </form>
        )}
      </section>
    );
  }

  if (ticket.status === "filed") {
    return (
      <section className="card p-5">
        <h2 className="text-lg font-semibold">Ticket filed</h2>
        <p className="text-sm text-slate-600">
          {ticket.url ? (
            <a href={ticket.url} target="_blank" rel="noreferrer" className="text-pulse-600 hover:underline">{ticket.jira_key}</a>
          ) : (
            ticket.jira_key
          )}{" "}
          · {ticket.title} {ticket.filed_by && <span className="text-slate-400">· filed by {ticket.filed_by}</span>}
        </p>
      </section>
    );
  }

  return (
    <section className="card space-y-3 border-amber-300 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ticket draft</h2>
        <span className="badge bg-amber-100 text-amber-800">AI draft · review before filing</span>
      </div>
      {canAct ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={ticket.id} />
          <input name="title" defaultValue={ticket.title} className="w-full rounded-lg border border-slate-300 p-2 text-sm font-medium" />
          <textarea name="body" defaultValue={ticket.body} rows={8} className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
          <div className="flex flex-wrap items-center gap-2">
            <Submit label="File in Jira" />
            <input name="jira_key" placeholder="…or paste a key, e.g. TW-123" className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(`${ticket.title}\n\n${ticket.body}`)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Copy text
            </button>
          </div>
          {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-600">{ticket.body}</p>
      )}
      {canAct && (
        <form action={dismissTicket}>
          <input type="hidden" name="id" value={ticket.id} />
          <button className="text-xs text-slate-500 hover:underline">Dismiss draft</button>
        </form>
      )}
    </section>
  );
}

function Submit({ label, secondary }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
        secondary ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-pulse-600 text-white hover:bg-pulse-700"
      }`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
