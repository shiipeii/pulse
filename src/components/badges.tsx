import type { Severity, Sentiment, FeedbackType, Category, Feedback } from "@/lib/types";

const SEVERITY_STYLE: Record<Severity, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-slate-100 text-slate-600",
  negative: "bg-rose-100 text-rose-700",
};

export function SeverityBadge({ value }: { value: Severity | null }) {
  if (!value) return null;
  return <span className={`badge ${SEVERITY_STYLE[value]}`}>{value}</span>;
}

export function SentimentBadge({ value }: { value: Sentiment | null }) {
  if (!value) return null;
  return <span className={`badge ${SENTIMENT_STYLE[value]}`}>{value}</span>;
}

export function TypeBadge({ value }: { value: FeedbackType | null }) {
  if (!value) return null;
  return <span className="badge bg-indigo-50 text-indigo-700">{value.replace("_", " ")}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="badge bg-slate-100 text-slate-600">{children}</span>;
}

const CATEGORY_STYLE: Record<Category, string> = {
  bug: "bg-red-50 text-red-700",
  feature: "bg-sky-50 text-sky-700",
  other: "bg-slate-100 text-slate-600",
};
const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug",
  feature: "Feature",
  other: "Other",
};

export function CategoryBadge({ value }: { value: Category | null }) {
  if (!value) return null;
  return <span className={`badge ${CATEGORY_STYLE[value]}`}>{CATEGORY_LABEL[value]}</span>;
}

/**
 * Shows the three classification layers: what the user picked, whether the AI
 * changed it, and whether a PM has verified the final call.
 */
export function ClassificationTrail({ item }: { item: Feedback }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <CategoryBadge value={item.category} />
      {item.ai_corrected && item.review_status !== "verified" && (
        <span
          className="badge bg-amber-100 text-amber-800"
          title={item.ai_reason ?? "The AI disagreed with the submitter's label"}
        >
          AI changed from {item.user_category}
        </span>
      )}
      {item.review_status === "verified" ? (
        <span className="badge bg-emerald-100 text-emerald-700" title={item.verified_at ?? ""}>
          ✓ verified{item.verified_by ? ` by ${item.verified_by}` : ""}
        </span>
      ) : (
        item.status !== "new" &&
        item.status !== "processing" && <span className="badge bg-slate-100 text-slate-500">needs review</span>
      )}
    </span>
  );
}
