"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitHostedForm, prepareScreenshotUploads, type FormState } from "@/app/actions";

const input = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";

export function HostedForm({
  channelId,
  channelName,
  signedInEmail,
}: {
  channelId: string;
  channelName: string;
  signedInEmail: string | null;
}) {
  const action = submitHostedForm.bind(null, channelId);
  const [state, formAction] = useFormState<FormState, FormData>(action, { ok: false });
  const [category, setCategory] = useState<"bug" | "feature" | "">("");
  const [device, setDevice] = useState("");
  const [browser, setBrowser] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  /** Upload screenshots straight to storage first, then submit the form with their paths. */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setUploadError(null);
    startUpload(async () => {
      if (category === "bug" && files.length) {
        const prep = await prepareScreenshotUploads(
          channelId,
          files.map((f) => ({ name: f.name, type: f.type || "image/png", size: f.size })),
        );
        if (!prep.ok || !prep.slots) {
          setUploadError(prep.error ?? "Couldn't upload screenshots.");
          return;
        }
        const paths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          const body = new FormData();
          body.append("cacheControl", "3600");
          body.append("", files[i]);
          const res = await fetch(prep.slots[i].signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
          if (!res.ok) {
            setUploadError("A screenshot didn't upload. Try again, or submit without it.");
            return;
          }
          paths.push(prep.slots[i].path);
        }
        fd.set("screenshots", JSON.stringify(paths));
      }
      formAction(fd);
    });
  }

  function pickFiles(list: FileList | null) {
    setUploadError(null);
    const picked = Array.from(list ?? []);
    const ok = picked.filter((f) => f.size <= 5 * 1024 * 1024).slice(0, 3);
    if (picked.length > 3) setUploadError("Up to 3 screenshots.");
    else if (ok.length < picked.length) setUploadError("Each screenshot must be 5 MB or smaller.");
    setFiles(ok);
  }

  // Pre-pick device + browser from the user agent; the teacher can change it.
  useEffect(() => {
    const d = detectDevice();
    setDevice((v) => v || d.device);
    setBrowser((v) => v || d.browser);
  }, []);

  if (state.ok) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold">Thank you</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your feedback has been received. The team reviews every submission.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-pulse-600 hover:underline"
        >
          Submit another
        </button>
        <a href="/me" className="mt-2 block text-sm text-pulse-600 hover:underline">
          See your past feedback
        </a>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Share feedback</h1>
        <p className="text-sm text-slate-500">{channelName}</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">What kind of feedback is this?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <CategoryOption
            value="bug"
            selected={category === "bug"}
            onSelect={setCategory}
            title="Report a bug"
            hint="Something is broken or not working as it should"
          />
          <CategoryOption
            value="feature"
            selected={category === "feature"}
            onSelect={setCategory}
            title="Suggest a feature"
            hint="An idea for something new or an improvement"
          />
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium">
          {category === "bug"
            ? "What went wrong?"
            : category === "feature"
              ? "What would you like, and how would it help you?"
              : "Your feedback"}
        </span>
        <textarea
          name="message"
          required
          rows={5}
          className={input}
          placeholder={
            category === "bug"
              ? "e.g. I clicked Save on the attendance page and my changes disappeared."
              : category === "feature"
                ? "e.g. It would save me time if I could export class marks to Excel."
                : "What's working, what's not, what would help?"
          }
        />
      </label>

      {category === "bug" && (
        <div className="space-y-4 rounded-lg bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Optional, but these help the team fix it faster.</p>
          <label className="block">
            <span className="text-sm font-medium">Where did it happen?</span>
            <input name="where" className={input} placeholder="Page or feature, e.g. Attendance → Mark class" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">What did you expect to happen?</span>
            <input name="expected" className={input} placeholder="e.g. Attendance should save and show a confirmation" />
          </label>
          <PillGroup
            label="What were you using?"
            name="device"
            options={["Computer", "Phone", "Tablet"]}
            value={device}
            onChange={setDevice}
          />
          <PillGroup
            label="Which browser?"
            name="browser"
            options={["Chrome", "Safari", "Edge", "Not sure"]}
            value={browser}
            onChange={setBrowser}
          />
          <p className="text-xs text-slate-500">We&apos;ve picked what we think you&apos;re using. Tap to change it.</p>
          <label className="block">
            <span className="text-sm font-medium">Screenshots (optional, up to 3)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/heic,image/heif,image/webp"
              multiple
              onChange={(e) => pickFiles(e.target.files)}
              className="mt-1 block w-full text-sm"
            />
            <span className="text-xs text-slate-500">
              Please avoid showing student names or personal details. Screenshots are only seen by the product team and are deleted after the bug is fixed.
            </span>
          </label>
          {files.length > 0 && <p className="text-xs text-slate-600">{files.length} screenshot{files.length > 1 ? "s" : ""} attached</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {signedInEmail ? (
          <div className="text-sm">
            <span className="font-medium">Signed in as</span>
            <p className="mt-1 text-slate-600">{signedInEmail}</p>
          </div>
        ) : (
          <label className="block">
            <span className="text-sm font-medium">Email (optional)</span>
            <input name="email" type="email" className={input} placeholder="you@moe.edu.sg" />
            <span className="text-xs text-slate-500">So we can tell you when it&apos;s fixed.</span>
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium">Your role (optional)</span>
          <select name="segment" className={input}>
            <option value="">Prefer not to say</option>
            <option value="teacher">Teacher</option>
            <option value="school leader">School leader</option>
            <option value="HOD">HOD</option>
            <option value="admin staff">Admin staff</option>
          </select>
        </label>
      </div>

      {(uploadError || state.error) && <p className="text-sm text-rose-600">{uploadError ?? state.error}</p>}
      <p className="text-xs text-slate-500">
        We collect what you write, your device type and browser name, and your email if you give it — only to improve the product.
      </p>

      <SubmitButton disabled={!category} busy={uploading} />
    </form>
  );
}

function CategoryOption({
  value,
  selected,
  onSelect,
  title,
  hint,
}: {
  value: "bug" | "feature";
  selected: boolean;
  onSelect: (v: "bug" | "feature") => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
        selected ? "border-pulse-600 bg-pulse-50 ring-1 ring-pulse-600" : "border-slate-300 hover:border-slate-400"
      }`}
    >
      <input
        type="radio"
        name="category"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="sr-only"
        required
      />
      <span className="block font-medium">{title}</span>
      <span className="block text-xs text-slate-500">{hint}</span>
    </label>
  );
}

function PillGroup({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${
              value === o
                ? "border-pulse-600 bg-pulse-50 font-medium text-pulse-700 ring-1 ring-pulse-600"
                : "border-slate-300 bg-white hover:border-slate-400"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="sr-only"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Rough, privacy-light guess: device type + browser name only, no versions. */
function detectDevice(): { device: string; browser: string } {
  if (typeof navigator === "undefined") return { device: "", browser: "" };
  const ua = navigator.userAgent;
  const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const device =
    /iPad|Tablet/i.test(ua) || isIPadOS || (/Android/i.test(ua) && !/Mobile/i.test(ua))
      ? "Tablet"
      : /Mobi|iPhone|Android/i.test(ua)
        ? "Phone"
        : "Computer";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome|CriOS/.test(ua)
      ? "Chrome"
      : /Safari/.test(ua)
        ? "Safari"
        : "Not sure";
  return { device, browser };
}

function SubmitButton({ disabled, busy }: { disabled: boolean; busy: boolean }) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || busy;
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
    >
      {pending ? "Submitting…" : "Submit feedback"}
    </button>
  );
}
