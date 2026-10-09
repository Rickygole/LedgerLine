import { NextResponse, type NextRequest } from "next/server";
import { FINANCE_ROLES, getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { applyFilters, sortRows } from "@/lib/finance/review/derive";
import { buildWorkbook, exportFilename, submissionsToCsv, workbookToBuffer, type ExportSubmission } from "@/lib/finance/review/export";
import { FLAG_LABEL, filtersToParams, parseFilters, STATUS_OPTIONS } from "@/lib/finance/review/filters";
import { budgetTotals } from "@/lib/rules/validate";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUMERIC_TYPES = new Set(["integer", "number", "currency", "percent"]);

function describeFilters(filters: ReturnType<typeof parseFilters>): string[] {
  const lines: string[] = [];
  if (filters.q) lines.push(`organization or EIN contains "${filters.q}"`);
  if (filters.initiative) lines.push(`initiative = ${filters.initiative}`);
  if (filters.category) lines.push(`category = ${filters.category}`);
  if (filters.borough) lines.push(`borough = ${filters.borough}`);
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
  const generatedAt = new Date();

  const result = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(query, periods.map((p) => p.id));
    const period = periods.find((p) => p.id === filters.period);
    if (!period) return null;
    const all = await loadReportRows(tx, period);
    const rows = sortRows(applyFilters(all, filters)).filter((r) => r.submissionId !== null);
    const filterLines = describeFilters(filters);
    const filename = exportFilename(period.id, todayInNewYork(), format);
    await tx.query("SELECT app.write_audit($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)", [
      "export",
      period.id,
      "export",
      `${filename}: ${rows.length} ${rows.length === 1 ? "submission" : "submissions"}${filterLines.length ? `, filters: ${filterLines.join("; ")}` : ""}`,
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
    answers: row.answers,
    budget: row.budget.map(({ position, category, description, amount }) => ({ position, category, description, amount })),
  }));

  const book = buildWorkbook(submissions, {
    periodLabel: `${result.period.label} (${result.period.id}), due ${result.period.dueOn}`,
    filters: result.filterLines,
    generatedAt,
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
