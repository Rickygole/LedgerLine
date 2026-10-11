import Link from "next/link";
import { Badge, StateBadge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { daysBetween, toIsoDate } from "@/lib/dates";
import { reportState } from "@/lib/reporting";
import { formatCurrency, plural } from "@/lib/format";
import { FLAG_LABEL } from "@/lib/finance/review/filters";
import { sponsorLabel, sponsorNames } from "@/lib/finance/awards";
import type { ReportRow } from "@/lib/finance/review/types";

type DueNote = { text: string; tone: "bad" | "warn" | "muted" };

function dueNote(row: Pick<ReportRow, "status" | "daysPastDue" | "submittedAt" | "dueOn">): DueNote | null {
  if (row.status === null || row.status === "draft" || row.status === "returned") {
    const days = Math.abs(row.daysPastDue);
    const unit = plural(days, "day", "days");
    if (row.daysPastDue > 0) return { text: `${days} ${unit} past due`, tone: "bad" };
    if (row.daysPastDue === 0) return { text: "Due today", tone: "warn" };
    return { text: `Due in ${days} ${unit}`, tone: row.daysPastDue > -14 ? "warn" : "muted" };
  }
  if (row.submittedAt && row.daysPastDue > 0) {
    const late = daysBetween(row.dueOn, toIsoDate(new Date(row.submittedAt)));
    if (late > 0) return { text: `Submitted ${late} ${plural(late, "day", "days")} late`, tone: "muted" };
  }
  return null;
}

const NOTE_TONE: Record<DueNote["tone"], string> = {
  bad: "font-semibold text-bad",
  warn: "font-semibold text-warn",
  muted: "text-muted",
};

function FlagsCell({ row }: { row: ReportRow }) {
  const flags = row.bucket === "missing" ? row.flags.filter((flag) => flag.reason !== "missing") : row.flags;
  if (flags.length === 0) return null;
  const draftOnly = row.bucket === "missing";
  const labels = flags.map((flag) => FLAG_LABEL[flag.reason]);
  const more = labels.length - 1;
  const title = `${draftOnly ? "On the saved draft: " : ""}${labels.join(", ")}`;
  return (
    <span title={title} className="whitespace-nowrap">
      <Badge tone={draftOnly ? "neutral" : "warn"}>
        {draftOnly ? <span className="sr-only">On the saved draft: </span> : null}
        {labels[0]}
        {more > 0 ? (
          <span className="font-normal">
            {" "}
            +{more}
            <span className="sr-only"> more: {labels.slice(1).join(", ")}</span>
          </span>
        ) : null}
      </Badge>
    </span>
  );
}

export function orgMeta(row: Pick<ReportRow, "ein" | "borough" | "councilDistrict">) {
  return [row.ein, row.borough, row.councilDistrict ? `District ${row.councilDistrict}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function SubmissionsTable({ rows, emptyHref }: { rows: ReportRow[]; emptyHref: string }) {
  const notes = new Map(rows.map((row) => [row.assignmentId, dueNote(row)]));
  const pastDue = new Set(
    rows.filter((row) => notes.get(row.assignmentId)?.tone === "bad").map((row) => notes.get(row.assignmentId)!.text),
  );
  const shown = (row: ReportRow) => {
    const note = notes.get(row.assignmentId);
    if (!note) return null;
    if (note.tone === "bad" && pastDue.size === 1 && row.bucket === "missing") return null;
    return note;
  };
  return (
    <Table density="compact" stack className="@container [&_td]:text-[15px]">
      <THead>
        <tr>
          <TH>Organization</TH>
          <TH>Initiative</TH>
          <TH className="@max-[72rem]:hidden">Sponsor</TH>
          <TH align="right">Award</TH>
          <TH>Status</TH>
          <TH>Flags</TH>
          <TH className="@max-[80rem]:hidden">Reference</TH>
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7}>
            No reports match these filters.{" "}
            <Link
              href={emptyHref}
              className="font-semibold text-link underline underline-offset-2 hover:text-link-hover"
            >
              Clear all filters
            </Link>
          </EmptyRow>
        ) : (
          rows.map((row) => (
            <TR key={row.assignmentId} className="lg:h-14">
              <TD className="min-w-[260px]" primary>
                <div>
                  <Link
                    href={
                      row.submissionId
                        ? `/finance/submissions/${row.submissionId}`
                        : `/finance/organizations/${row.orgId}`
                    }
                    className="font-semibold text-link underline-offset-2 hover:text-link-hover hover:underline"
                  >
                    {row.orgName}
                    {row.submissionId ? null : <span className="sr-only">, not started, open organization</span>}
                  </Link>
                  <span className="num block whitespace-nowrap text-[13px] font-normal text-muted">{orgMeta(row)}</span>
                </div>
              </TD>
              <TD className="min-w-[220px]" label="Initiative">
                <div>
                  <span className="text-ink">{row.initiativeName}</span>
                  <span className="block text-[13px] text-muted">
                    <span className="whitespace-nowrap font-mono text-xs">{row.initiativeCode}</span> · {row.category}
                  </span>
                  <span className="hidden text-[13px] text-muted @max-[72rem]:block">{sponsorLabel(row)}</span>
                </div>
              </TD>
              <TD className="whitespace-nowrap @max-[72rem]:hidden" stackHidden>
                <span title={row.sponsors.length > 0 ? sponsorNames(row.sponsors) : undefined}>
                  {sponsorLabel(row)}
                </span>
              </TD>
              <TD align="right" label="Award">
                {formatCurrency(row.award, { cents: false })}
              </TD>
              <TD className="min-w-36" label="Status">
                <div>
                  <StateBadge state={reportState(row.status, row.dueOn)} />
                  {row.bucket === "missing" && row.status === "draft" ? (
                    <span className="mt-1 block whitespace-nowrap text-[13px] text-muted">Draft started</span>
                  ) : null}
                  {shown(row) ? (
                    <span className={`mt-1 block text-[13px] ${NOTE_TONE[shown(row)!.tone]}`}>{shown(row)!.text}</span>
                  ) : null}
                </div>
              </TD>
              <TD label="Flags">
                <FlagsCell row={row} />
              </TD>
              <TD className="@max-[80rem]:hidden" label="Reference">
                <span className="whitespace-nowrap font-mono text-sm text-muted">
                  {row.referenceNo ?? "Not started"}
                </span>
              </TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}
