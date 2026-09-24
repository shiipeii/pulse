"use client";

import { useState } from "react";
import Papa from "papaparse";
import { importBatch, type ImportMapping, type ImportRow } from "@/app/import-actions";

type Table = { headers: string[]; rows: Record<string, string>[] };

const sel = "rounded-lg border border-slate-300 p-2 text-sm";

export function ImportWizard({ sources }: { sources: { id: string; name: string; mapping: Partial<ImportMapping> }[] }) {
  const [sourceId, setSourceId] = useState<string>(sources[0]?.id ?? "new");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("survey");
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({ text: [] });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(f: File) {
    setError(null);
    setProgress(null);
    setFile(f);
    try {
      let t: Table;
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = (await readSheet(f)) as unknown as unknown[][];
        const headers = (sheet[0] ?? []).map((h, i) => String(h ?? `Column ${i + 1}`));
        t = {
          headers,
          rows: sheet.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] instanceof Date ? (r[i] as Date).toISOString() : String(r[i] ?? "")]))),
        };
      } else {
        const parsed = Papa.parse<Record<string, string>>(await f.text(), { header: true, skipEmptyLines: true });
        t = { headers: parsed.meta.fields ?? [], rows: parsed.data };
      }
      if (t.headers.length === 0) throw new Error("No columns found. Is the first row a header?");
      setTable(t);
      // Reuse the saved mapping for this source where columns still match; else guess.
      const saved = sources.find((s) => s.id === sourceId)?.mapping ?? {};
      const has = (c?: string) => (c && t.headers.includes(c) ? c : undefined);
      const guess = (re: RegExp) => t.headers.find((h) => re.test(h));
      setMapping({
        text: (saved.text ?? []).filter((c) => t.headers.includes(c)).length
          ? (saved.text ?? []).filter((c) => t.headers.includes(c))
          : [guess(/feedback|comment|message|description|response|text|suggestion/i) ?? t.headers[0]],
        author: has(saved.author) ?? guess(/email|name|from|respondent/i),
        date: has(saved.date) ?? guess(/date|time|submitted|created/i),
        category: has(saved.category) ?? guess(/type|category|kind/i),
        id: has(saved.id) ?? guess(/^id$|response id|ticket|reference/i),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  function toRows(): ImportRow[] {
    if (!table) return [];
    return table.rows.map((r) => ({
      text: mapping.text.map((c) => (r[c] ? (mapping.text.length > 1 ? `${c}: ${r[c]}` : r[c]) : "")).filter(Boolean).join("\n"),
      author: mapping.author ? r[mapping.author] : undefined,
      date: mapping.date ? r[mapping.date] : undefined,
      category: mapping.category ? r[mapping.category] : undefined,
      id: mapping.id ? r[mapping.id] : undefined,
    }));
  }

  async function run() {
    if (!table || !file) return;
    if (mapping.text.length === 0) return setError("Pick at least one column with the feedback text.");
    setBusy(true);
    setError(null);
    const rows = toRows();
    let added = 0, dup = 0, skipped = 0;
    let sid = sourceId === "new" ? undefined : sourceId;
    for (let i = 0; i < rows.length; i += 200) {
      setProgress(`Importing ${Math.min(i + 200, rows.length)} of ${rows.length}…`);
      const r = await importBatch({ sourceId: sid, newSourceName: newName, newSourceKind: newKind, mapping, rows: rows.slice(i, i + 200), fileName: file.name });
      if (!r.ok) {
        setError(r.error ?? "Import failed");
        setBusy(false);
        return;
      }
      sid = r.sourceId;
      added += r.added ?? 0;
      dup += r.duplicates ?? 0;
      skipped += r.skipped ?? 0;
    }
    setProgress(`Done: ${added} added, ${dup} already imported, ${skipped} empty rows skipped. They'll be classified over the next few minutes.`);
    setBusy(false);
  }

  const col = (key: keyof Omit<ImportMapping, "text">, label: string) => (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <select value={mapping[key] ?? ""} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value || undefined })} className={`mt-1 w-full ${sel}`}>
        <option value="">— none —</option>
        {table?.headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );

  const preview = toRows().slice(0, 5);

  return (
    <div className="card space-y-5 p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-1">
          <span className="font-medium">Source</span>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`mt-1 w-full ${sel}`}>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">+ New source…</option>
          </select>
        </label>
        {sourceId === "new" && (
          <>
            <label className="block text-sm">
              <span className="font-medium">New source name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Term 3 teacher survey" className={`mt-1 w-full ${sel}`} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Kind</span>
              <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className={`mt-1 w-full ${sel}`}>
                {["survey", "helpdesk", "escalation", "chat", "email", "other"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      <label className="block text-sm">
        <span className="font-medium">File (CSV or .xlsx)</span>
        <input type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} className="mt-1 block text-sm" />
      </label>

      {table && (
        <>
          <p className="text-sm text-slate-600">{table.rows.length} rows, {table.headers.length} columns. Match the columns:</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <label className="block text-sm sm:col-span-5">
              <span className="font-medium">Feedback text (pick one or more)</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {table.headers.map((h) => (
                  <label key={h} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${mapping.text.includes(h) ? "border-pulse-600 bg-pulse-50 text-pulse-700" : "border-slate-300"}`}>
                    <input type="checkbox" className="sr-only" checked={mapping.text.includes(h)} onChange={(e) => setMapping({ ...mapping, text: e.target.checked ? [...mapping.text, h] : mapping.text.filter((x) => x !== h) })} />
                    {h}
                  </label>
                ))}
              </div>
            </label>
            {col("author", "Who (name or email)")}
            {col("date", "Date")}
            {col("category", "Bug / feature (if asked)")}
            {col("id", "Row ID (prevents duplicates)")}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr><th className="p-2">Feedback</th><th className="p-2">Who</th><th className="p-2">Date</th><th className="p-2">Kind</th></tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="max-w-md whitespace-pre-wrap p-2">{r.text.slice(0, 200)}</td>
                    <td className="p-2">{r.author}</td>
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={run} disabled={busy} className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50">
            {busy ? "Importing…" : `Import ${table.rows.length} rows`}
          </button>
        </>
      )}
      {progress && <p className="text-sm text-emerald-700">{progress}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
