import { PageTitle } from "@/components/portal/page-title";
import { DueBadge, StateBadge, type ReportState } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/rules/money";
import type { ReportHeader as Header } from "@/lib/report/types";

export function ReportHeader({ header, daysLate, state, actions }: { header: Header; daysLate: number; state: ReportState; actions?: React.ReactNode }) {
  const open = header.status === "draft" || header.status === "returned";
  return (
    <PageTitle
      crumbs={[{ label: "My reports", href: "/portal" }, { label: header.initiativeName }]}
      eyebrow={
        <>
          {header.periodLabel} report <span aria-hidden="true">·</span>
          <span className="sr-only">,</span> {formatDate(header.startsOn)} to {formatDate(header.endsOn)}
        </>
      }
      title={header.initiativeName}
      actions={actions}
      meta={
        <>
          <span className="num whitespace-nowrap">
            Award <span className="font-semibold text-ink">{formatCurrency(header.awardAmount)}</span>
          </span>
          <span className="inline-flex flex-wrap items-center gap-2 whitespace-nowrap">
            Due {formatDate(header.dueOn)}
            {open ? <DueBadge daysPastDue={daysLate} /> : null}
          </span>
          <span className="whitespace-nowrap">
            Reference <span className="num font-mono text-sm font-medium text-ink">{header.referenceNo}</span>
          </span>
          <StateBadge state={state} audience="cbo" />
        </>
      }
    />
  );
}
