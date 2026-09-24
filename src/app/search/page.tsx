"use client";

import { useState } from "react";
import Link from "next/link";

interface Result {
  id: string;
  raw_text: string;
  summary: string | null;
  feature_area: string | null;
  segment: string | null;
  type: string | null;
  severity: string | null;
  sentiment: string | null;
  theme_id: string | null;
  received_at: string;
  similarity: number;
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setResults(json.results as Result[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Search the archive</h1>
        <p className="text-sm text-slate-500">
          “Do we already know this?” — a query, not a meeting. Semantic search over every item.
        </p>
      </div>

      <form onSubmit={run} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. attendance flow complaints"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {results && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{results.length} results</p>
          {results.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                <span className="badge bg-slate-100 text-slate-600">
                  {(r.similarity * 100).toFixed(0)}% match
                </span>
                {r.feature_area && <span>{r.feature_area}</span>}
                {r.segment && <span>· {r.segment}</span>}
                <span className="ml-auto">{new Date(r.received_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm font-medium">{r.summary ?? r.raw_text.slice(0, 200)}</p>
              {r.theme_id && (
                <Link href={`/themes/${r.theme_id}`} className="text-xs text-pulse-600 hover:underline">
                  View theme →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
