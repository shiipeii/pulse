import { setEffort } from "@/app/priority-actions";
import { EFFORTS, EFFORT_HINT, EFFORT_LABEL, type Effort } from "@/lib/scoring";

/** S / M / L / XL in one tap. The current size is highlighted. */
export function EffortButtons({ id, value, label }: { id: string; value: Effort | null; label: string }) {
  return (
    <form action={setEffort} className="flex gap-1" aria-label={`Size the effort for ${label}`}>
      <input type="hidden" name="id" value={id} />
      {EFFORTS.map((e) => (
        <button
          key={e}
          name="effort"
          value={e}
          title={EFFORT_HINT[e]}
          aria-pressed={value === e}
          className={`h-9 min-w-[2.5rem] rounded-lg border px-2 text-sm font-semibold ${
            value === e ? "border-pulse-600 bg-pulse-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-pulse-600"
          }`}
        >
          {EFFORT_LABEL[e]}
        </button>
      ))}
    </form>
  );
}
