import { Card, CardBody, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DueBadge, StateBadge } from "@/components/ui/status-badge";
import { daysPastDue, formatDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/rules/money";
import { reportState } from "@/lib/reporting";
import type { ReportHeader as Header } from "@/lib/report/types";

export function ReportHeader({ header }: { header: Header }) {
  const open = header.status === "draft" || header.status === "returned";
  const late = daysPastDue(header.dueOn);
  return (
    <>
      <PageHeader
        title={header.initiativeName}
        description={`${header.periodLabel} report for ${header.orgName}`}
        crumbs={[{ label: "My reports", href: "/portal" }, { label: header.initiativeName }]}
        meta={<StateBadge state={reportState(header.status, header.dueOn)} audience="cbo" />}
      />
      <Card className="mb-6">
        <CardBody>
          <DescriptionList
            columns={3}
            items={[
              { label: "Reporting period", value: `${header.periodLabel}, ${formatDate(header.startsOn)} to ${formatDate(header.endsOn)}` },
              {
                label: "Due date",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {formatDate(header.dueOn)}
                    {open ? <DueBadge daysPastDue={late} /> : null}
                  </span>
                ),
              },
              { label: "Award", value: <span className="num font-semibold">{formatCurrency(header.awardAmount)}</span> },
              { label: "EIN", value: <span className="num whitespace-nowrap font-mono text-[13px]">{header.ein}</span> },
              { label: "Reference number", value: <span className="num whitespace-nowrap font-mono text-[13px]">{header.referenceNo}</span> },
              { label: "Status", value: <StateBadge state={reportState(header.status, header.dueOn)} audience="cbo" /> },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
