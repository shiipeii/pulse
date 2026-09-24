"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  featureAreas: string[];
  segments: string[];
  channels: { id: string; name: string }[];
}

/** Dashboard filter controls — feature area / segment / channel / date. */
export function FilterBar({ featureAreas, segments, channels }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        label="Kind"
        value={params.get("category") ?? ""}
        options={[
          { value: "bug", label: "Bugs" },
          { value: "feature", label: "Features" },
          { value: "other", label: "Other" },
        ]}
        onChange={(v) => setParam("category", v)}
      />
      <Select
        label="Feature area"
        value={params.get("featureArea") ?? ""}
        options={featureAreas}
        onChange={(v) => setParam("featureArea", v)}
      />
      <Select
        label="Segment"
        value={params.get("segment") ?? ""}
        options={segments}
        onChange={(v) => setParam("segment", v)}
      />
      <Select
        label="Channel"
        value={params.get("channelId") ?? ""}
        options={channels.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(v) => setParam("channelId", v)}
      />
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        value={params.get("since") ?? ""}
        onChange={(e) => setParam("since", e.target.value)}
      >
        <option value="">Any time</option>
        <option value={daysAgo(7)}>Last 7 days</option>
        <option value={daysAgo(30)}>Last 30 days</option>
        <option value={daysAgo(90)}>Last 90 days</option>
      </select>
      {[...params.keys()].length > 0 && (
        <button
          onClick={() => router.push("/")}
          className="text-sm text-slate-500 underline hover:text-slate-700"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}: all</option>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
