import Link from "next/link";
import { getProduct } from "@/lib/product";
import { getReviewQueue, getAttachmentsFor } from "@/lib/queries";
import { getStaff, displayName } from "@/lib/auth-server";
import { canManage } from "@/lib/ui";
import { signedViewUrls } from "@/lib/storage";
import { verifyItem } from "@/app/actions";
import { CategoryBadge, SeverityBadge, Tag } from "@/components/badges";
import type { Category, Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";
// Changing a category re-clusters the item, which may name a new theme.
export const maxDuration = 60;

/**
 * PM review queue — the final layer of classification. AI-corrected items
 * come first. The PM confirms the category or changes it.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const product = await getProduct(searchParams.product);
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;

  const staff = await getStaff();
  const reviewer = staff ? displayName(staff) : "";
  const editable = canManage(staff?.role);
  const items = await getReviewQueue(product.id);
  const att = await getAttachmentsFor(items.map((i) => i.id));
  const urls = await signedViewUrls(Array.from(att.values()).flat()).catch(() => ({}) as Record<string, string>);
  const shots = new Map(Array.from(att.entries()).map(([k, v]) => [k, v.map((p) => urls[p]).filter(Boolean)]));
  const corrected = items.filter((i) => i.ai_corrected);
  const rest = items.filter((i) => !i.ai_corrected);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">PM review</h1>
          <p className="text-sm text-slate-500">
            Confirm whether each item is truly a bug or a feature. {items.length} waiting.
          </p>
        </div>
        <p className="text-sm text-slate-500">
          {editable ? <>Reviewing as <strong>{reviewer}</strong></> : "Read-only access"}
        </p>
      </div>

      {items.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          All caught up — nothing to review. <Link href="/" className="text-pulse-600 hover:underline">Back to home</Link>
        </div>
      )}

      {corrected.length > 0 && (
        <Section
          title={`AI changed the label (${corrected.length})`}
          subtitle="The submitter picked one thing; the AI thinks it's another. You decide."
          items={corrected}
          editable={editable}
          shots={shots}
        />
      )}
      {rest.length > 0 && (
        <Section
          title={`AI agreed with the submitter (${rest.length})`}
          subtitle="Usually right — a quick confirm is enough."
          items={rest}
          editable={editable}
          shots={shots}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  items,
  editable,
  shots,
}: {
  title: string;
  subtitle: string;
  items: Feedback[];
  editable: boolean;
  shots: Map<string, string[]>;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <ul className="space-y-3">
        {items.map((f) => (
          <ReviewCard key={f.id} item={f} editable={editable} shots={shots.get(f.id) ?? []} />
        ))}
      </ul>
    </section>
  );
}

const LABEL: Record<Category, string> = { bug: "Bug", feature: "Feature", other: "Other" };

function ReviewCard({ item, editable, shots }: { item: Feedback; editable: boolean; shots: string[] }) {
  const current = item.category ?? "other";
  const alternatives = (["bug", "feature", "other"] as Category[]).filter((c) => c !== current);

  return (
    <li className={`card p-4 ${item.ai_corrected ? "border-amber-300" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Submitter said</span>
        {item.user_category ? <CategoryBadge value={item.user_category} /> : <Tag>not specified</Tag>}
        <span className="text-slate-400">→</span>
        <span className="text-slate-500">AI says</span>
        <CategoryBadge value={item.ai_category} />
        <SeverityBadge value={item.severity} />
        {item.feature_area && <Tag>{item.feature_area}</Tag>}
        <span className="ml-auto text-slate-400">
          {new Date(item.received_at).toLocaleString("en-SG")}
        </span>
      </div>

      {item.summary && <p className="text-sm font-medium text-ink">{item.summary}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.raw_text}</p>

      {item.ai_corrected && item.ai_reason && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <strong>Why the AI changed it:</strong> {item.ai_reason}
        </p>
      )}

      {shots.length > 0 && (
        <div className="mt-2 flex gap-2">
          {shots.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="Screenshot attached to this report" className="h-16 w-24 rounded border border-slate-200 object-cover" />
            </a>
          ))}
        </div>
      )}
      {editable && (
      <form action={verifyItem} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={item.id} />
        <button
          name="category"
          value={current}
          className="rounded-lg bg-pulse-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-700"
        >
          ✓ Confirm {LABEL[current]}
        </button>
        {alternatives.map((c) => (
          <button
            key={c}
            name="category"
            value={c}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            It&apos;s actually {c === "other" ? "neither" : `a ${LABEL[c].toLowerCase()}`}
          </button>
        ))}
      </form>
      )}
    </li>
  );
}
