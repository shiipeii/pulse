"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelType } from "@/lib/types";

interface Artifact {
  kind: "form_link" | "webhook_url" | "email_address" | "mailbox" | "import";
  value: string;
  authHeader?: string;
}

const TYPES: { type: ChannelType; title: string; blurb: string }[] = [
  { type: "form", title: "Hosted form", blurb: "Pulse-hosted form. Get a shareable / embeddable link." },
  { type: "webhook", title: "Webhook", blurb: "Tally / Typeform / Jotform / FormSG POST to an ingest URL." },
  { type: "email", title: "Email forward", blurb: "A unique address; forward feedback mail to it." },
  { type: "mailbox", title: "Shared mailbox", blurb: "Pulse reads one IT-approved shared mailbox (Outlook)." },
];

export function AddChannelWizard() {
  const router = useRouter();
  const [type, setType] = useState<ChannelType>("form");
  const [name, setName] = useState("");
  const [formsg, setFormsg] = useState(false);
  const [formsgSecret, setFormsgSecret] = useState("");
  const [allowlist, setAllowlist] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${type} channel`,
          type,
          decoder: type === "webhook" && formsg ? "formsg" : undefined,
          formsgSecret: type === "webhook" && formsg ? formsgSecret.trim() : undefined,
          mailboxAddress: type === "mailbox" ? mailbox.trim() : undefined,
          senderAllowlist:
            type === "email" || type === "mailbox"
              ? allowlist.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create channel");
      setArtifact(json.artifact as Artifact);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setArtifact(null);
    setName("");
    setFormsgSecret("");
    setAllowlist("");
  }

  if (artifact) {
    return (
      <div className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold">Channel created ✓</h2>
        <ArtifactView artifact={artifact} />
        <button onClick={reset} className="text-sm text-pulse-600 hover:underline">
          + Add another channel
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-5 p-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {TYPES.map((t) => (
          <button
            key={t.type}
            onClick={() => setType(t.type)}
            className={`rounded-lg border p-3 text-left text-sm ${
              type === t.type ? "border-pulse-500 bg-pulse-50" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="font-medium">{t.title}</div>
            <div className="text-xs text-slate-500">{t.blurb}</div>
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-sm font-medium">Channel name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. In-product feedback form"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
      </label>

      {type === "webhook" && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={formsg} onChange={(e) => setFormsg(e.target.checked)} />
            This is a FormSG (Storage-mode) form
          </label>
          {formsg && (
            <label className="block">
              <span className="text-sm font-medium">FormSG secret key</span>
              <input
                value={formsgSecret}
                onChange={(e) => setFormsgSecret(e.target.value)}
                placeholder="Storage-mode secret key"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
              />
            </label>
          )}
        </div>
      )}

      {type === "mailbox" && (
        <label className="block">
          <span className="text-sm font-medium">Shared mailbox address</span>
          <input
            value={mailbox}
            onChange={(e) => setMailbox(e.target.value)}
            placeholder="tw-feedback@moe.gov.sg"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
          <span className="text-xs text-slate-400">
            IT must grant Pulse read access to this one mailbox only (see SETUP.md, &quot;Shared mailbox&quot;).
          </span>
        </label>
      )}

      {(type === "email" || type === "mailbox") && (
        <label className="block">
          <span className="text-sm font-medium">Sender domain allowlist (optional)</span>
          <input
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
            placeholder="moe.gov.sg, moe.edu.sg"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
          <span className="text-xs text-slate-400">Comma-separated. Empty = accept any sender.</span>
        </label>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        onClick={create}
        disabled={busy}
        className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create channel"}
      </button>
    </div>
  );
}

function ArtifactView({ artifact }: { artifact: Artifact }) {
  const label =
    artifact.kind === "form_link"
      ? "Share this form link"
      : artifact.kind === "email_address"
        ? "Forward feedback to this address"
        : artifact.kind === "mailbox"
          ? "Pulse will read new mail in this mailbox every few minutes, once IT has granted access"
          : artifact.kind === "import"
            ? "Upload files on the Import page"
            : "Point your webhook at this URL";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Copyable value={artifact.value} />
      {artifact.authHeader && (
        <>
          <p className="text-sm font-medium">…and send this header</p>
          <Copyable value={artifact.authHeader} />
          <p className="text-xs text-slate-500">
            For FormSG, no header is needed — Pulse verifies the X-FormSG-Signature instead.
          </p>
        </>
      )}
    </div>
  );
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-xs">{value}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
