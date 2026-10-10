import Link from "next/link";
import { DueBadge, StateBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/rules/money";
import { actionFor, type Obligation } from "@/lib/portal/data";

function linkLabel(o: Obligation) {
  if (!o.submissionId) return "Start";
  if (o.status === "draft") return "Continue";
  if (o.status === "returned") return "Update";
  return "View";
}

function open(o: Obligation) {
  return o.status === null || o.status === "draft" || o.status === "returned";
}

function ActionLink({ o }: { o: Obligation }) {
  return (
    <Link href={actionFor(o).href} className="whitespace-nowrap text-[15px] font-bold text-link underline underline-offset-2 hover:text-link-hover">
      {linkLabel(o)}
      <span className="sr-only">
        {" "}
        {o.initiativeName}, {o.periodLabel}
      </span>
    </Link>
  );
}

function Rows({ rows }: { rows: Obligation[] }) {
  return (
    <>
      <ul className="divide-y divide-[#e3e7ec] border-y border-[#e3e7ec] md:hidden">
        {rows.map((o) => (
          <li key={`${o.assignmentId}-${o.periodId}`} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink">{o.initiativeName}</p>
                <p className="text-sm text-muted">
                  {o.periodLabel} <span aria-hidden="true">·</span>
                  <span className="sr-only">,</span> <span className="font-mono">{o.initiativeCode}</span>
                </p>
              </div>
              <StateBadge state={o.state} audience="cbo" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[#3d4757]">
              <span className="whitespace-nowrap">Due {formatDate(o.dueOn)}</span>
              {open(o) ? <DueBadge daysPastDue={o.pastDue} /> : null}
              <span className="num whitespace-nowrap">Award {formatCurrency(o.award)}</span>
            </div>
            <p className="mt-2">
              <ActionLink o={o} />
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-[15px] leading-[22px]">
          <thead className="bg-navy-50 text-left text-sm font-semibold text-[#3d4757]">
            <tr className="h-11">
              <th scope="col" className="w-[28%] px-4 font-semibold">Initiative</th>
              <th scope="col" className="w-[22%] px-4 font-semibold">Period</th>
              <th scope="col" className="w-[17%] px-4 font-semibold">Due</th>
              <th scope="col" className="w-[13%] px-4 text-right font-semibold">Award</th>
              <th scope="col" className="w-[12%] px-4 font-semibold">Status</th>
              <th scope="col" className="w-[8%] px-4 text-right font-semibold">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={`${o.assignmentId}-${o.periodId}`} className="border-b border-[#e3e7ec] hover:bg-navy-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{o.initiativeName}</p>
                  <p className="font-mono text-[13px] text-muted">
                    {o.initiativeCode}
                    {o.referenceNo ? `, ${o.referenceNo}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p>{o.periodLabel}</p>
                  <p className="text-sm text-muted">
                    {formatDate(o.startsOn)} to {formatDate(o.endsOn)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="whitespace-nowrap">{formatDate(o.dueOn)}</p>
                  {open(o) ? <DueBadge daysPastDue={o.pastDue} /> : null}
                </td>
                <td className="num px-4 py-3 text-right">{formatCurrency(o.award)}</td>
                <td className="px-4 py-3">
                  <StateBadge state={o.state} audience="cbo" />
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionLink o={o} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Group({ id, title, hint, rows }: { id: string; title: string; hint: string; rows: Obligation[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-[17px] font-bold leading-6 text-ink">
        {title} <span className="num font-semibold text-muted">({rows.length})</span>
      </h3>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <Rows rows={rows} />
    </section>
  );
}

export function ObligationGroups({ obligations }: { obligations: Obligation[] }) {
  const needs = obligations.filter((o) => o.state === "missing" || o.state === "returned" || o.state === "draft");
  const coming = obligations.filter((o) => o.state === "not_started");
  const done = obligations.filter((o) => o.state === "submitted" || o.state === "under_review" || o.state === "accepted");

  if (obligations.length === 0) {
    return <p className="py-6 text-[15px] text-muted">No reports are assigned to your organization yet. Council Finance assigns initiatives and reporting periods each fiscal year.</p>;
  }

  return (
    <div className="space-y-8">
      <Group id="group-needs" title="Needs action" hint="Overdue, changes requested, or started and not yet submitted." rows={needs} />
      <Group id="group-coming" title="Coming up" hint="Not started yet. You can start a report at any time before it is due." rows={coming} />
      {done.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[15px] font-bold text-link underline underline-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show {done.length} completed {done.length === 1 ? "report" : "reports"}
            </span>
            <span className="hidden group-open:inline">Hide completed reports</span>
          </summary>
          <div className="mt-4">
            <Group id="group-done" title="Done" hint="Submitted, in review, or accepted by Council Finance." rows={done} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
