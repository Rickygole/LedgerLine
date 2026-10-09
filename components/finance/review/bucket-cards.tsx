import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Eye, FileWarning, RotateCcw, Send } from "lucide-react";
import type { ComponentType } from "react";
import { BUCKET_DEFINITION, BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { BUCKET_ORDER } from "@/lib/finance/review/derive";
import { hrefWith } from "@/lib/finance/review/filters";
import { cn } from "@/lib/cn";

const ICONS: Record<Bucket, ComponentType<{ className?: string }>> = {
  outstanding: CircleDashed,
  missing: AlertTriangle,
  incomplete: FileWarning,
  submitted: Send,
  in_review: Eye,
  returned: RotateCcw,
  accepted: CheckCircle2,
};

const TONES: Record<Bucket, string> = {
  outstanding: "text-muted",
  missing: "text-bad",
  incomplete: "text-bad",
  submitted: "text-info",
  in_review: "text-info",
  returned: "text-warn",
  accepted: "text-ok",
};

export function BucketCards({ counts, period, total }: { counts: Record<Bucket, number>; period: string; total: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-label="Reports by bucket">
      {BUCKET_ORDER.map((bucket) => {
        const Icon = ICONS[bucket];
        const definitionId = `bucket-def-${bucket}`;
        return (
          <li key={bucket} className="group relative">
            <Link
              href={hrefWith("/finance/submissions", {}, { period, bucket })}
              title={BUCKET_DEFINITION[bucket]}
              aria-describedby={definitionId}
              className="block h-full rounded-lg border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-navy-600/40 hover:bg-navy-50/40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{BUCKET_LABEL[bucket]}</span>
                <Icon className={cn("h-4 w-4", TONES[bucket])} aria-hidden="true" />
              </span>
              <span className="num mt-1.5 block text-2xl font-bold text-ink">{counts[bucket]}</span>
              <span className="num block text-xs text-muted">{total === 0 ? "0%" : `${Math.round((counts[bucket] / total) * 100)}%`} of expected</span>
            </Link>
            <span
              id={definitionId}
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-md bg-navy-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-focus-within:block group-hover:block"
            >
              {BUCKET_DEFINITION[bucket]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
