import { NextResponse, type NextRequest } from "next/server";
import { FINANCE_ROLES, getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { applyFilters, isExportable, sortRows } from "@/lib/finance/review/derive";
import { buildWorkbook, exportFilename, submissionsToCsv, workbookToBuffer, type ExportSubmission } from "@/lib/finance/review/export";
import { STATUS_OPTIONS } from "@/lib/domain";
import { FLAG_LABEL, filtersToParams, parseFilters } from "@/lib/finance/review/filters";
import { budgetTotals, visibleAnswers } from "@/lib/rules/validate";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { contractLabel, fundingLabel } from "@/lib/finance/awards";
import { plural } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUMERIC_TYPES = new Set(["integer", "number", "currency", "percent"]);

function describeFilters(filters: ReturnType<typeof parseFilters>): string[] {
  const lines: string[] = [];
  if (filters.q) lines.push(`search contains "${filters.q}"`);
  if (filters.initiative) lines.push(`initiative = ${filters.initiative}`);
  if (filters.category) lines.push(`category = ${filters.category}`);
  if (filters.borough) lines.push(`borough = ${filters.borough}`);
  if (filters.member) lines.push(`Council Member district = ${filters.member}`);
  if (filters.funding) lines.push(`funding source = ${fundingLabel(filters.funding)}`);
  if (filters.contract) lines.push(`contract status = ${contractLabel(filters.contract)}`);
  if (filters.agency) lines.push(`agency = ${filters.agency}`);
  if (filters.bucket) lines.push(`bucket = ${BUCKET_LABEL[filters.bucket as Bucket] ?? filters.bucket}`);
  if (filters.status) lines.push(`status = ${STATUS_OPTIONS.find((s) => s.value === filters.status)?.label ?? filters.status}`);
  if (filters.flag) lines.push(`flag = ${filters.flag === "any" ? "Any flag" : (FLAG_LABEL[filters.flag] ?? filters.flag)}`);
  return lines;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export reports." }, { status: 401 });
  if (!FINANCE_ROLES.includes(user.role)) return NextResponse.json({ error: "Only Council Finance staff can export reports." }, { status: 403 });

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const format = query.format === "csv" ? "csv" : "xlsx";
  const generatedOn = todayInNewYork();

  const result = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(query, periods);
    const period = periods.find((p) => p.id === filters.period);
    if (!period) return null;
    const all = await loadReportRows(tx, period);
    const rows = sortRows(applyFilters(all, filters)).filter((r) => isExportable(r.status));
    const filterLines = describeFilters(filters);
    const filename = exportFilename(period.id, todayInNewYork(), format);
    await tx.query("SELECT app.write_audit($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)", [
      "export",
      period.id,
      "export",
      `${filename}: ${rows.length} ${plural(rows.length, "submission", "submissions")}${filterLines.length ? `, filters: ${filterLines.join("; ")}` : ""}`,
      null,
      JSON.stringify({ format, rows: rows.length, filters: Object.fromEntries(filtersToParams(filters)) }),
      null,
    ]);
    return { period, rows, filterLines, filename };
  });

  if (!result) return NextResponse.json({ error: "That reporting period does not exist." }, { status: 400 });

  const numericKeys = new Set<string>();
  for (const row of result.rows) {
    for (const section of row.definition?.sections ?? []) {
      for (const question of section.questions) if (NUMERIC_TYPES.has(question.type)) numericKeys.add(question.key);
    }
  }

  const submissions: ExportSubmission[] = result.rows.map((row) => ({
    referenceNo: row.referenceNo ?? "",
    ein: row.ein,
    organization: row.orgName,
    initiative: row.initiativeName,
    category: row.category,
    borough: row.borough,
    period: row.periodId,
    fiscalYear: result.period.fiscalYearId,
    status: row.status ?? "not_started",
    award: row.award,
    submittedAt: row.submittedAt,
    budgetTotal: budgetTotals(row.budget).total,
    fundingSource: fundingLabel(row.fundingSource),
    councilMembers: row.sponsors.map((sponsor) => `${sponsor.name} (District ${sponsor.district})`).join("; "),
    agency: row.agency ?? "",
    contractStatus: contractLabel(row.contractStatus),
    contractNumber: row.contractNumber ?? "",
    contractRegisteredOn: row.contractRegisteredOn ?? "",
    answers: row.definition ? visibleAnswers(row.definition, row.answers) : {},
    budget: row.budget.map(({ position, category, description, amount, actual }) => ({ position, category, description, amount, actual })),
  }));

  const book = buildWorkbook(submissions, {
    periodLabel: `${result.period.label} (${result.period.id}), due ${result.period.dueOn}`,
    filters: result.filterLines,
    generatedOn,
    numericKeys,
    rowCount: submissions.length,
  });

  const headers = { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${result.filename}"` };
  if (format === "csv") {
    return new NextResponse(submissionsToCsv(book), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  return new NextResponse(new Uint8Array(workbookToBuffer(book)), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
