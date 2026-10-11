import type { Metadata } from "next";
import Link from "next/link";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { shortDate, todayInNewYork } from "@/lib/dates";
import { formatCompactCurrency, formatCount, formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";
import { ProgressBar } from "@/components/finance/admin/progress-bar";
import {
  categorySummary,
  listAgencies,
  listCategories,
  listInitiatives,
  setupStatus,
} from "@/lib/finance/admin/initiatives";
import { NoPeriods } from "@/components/finance/no-periods";
import { SetupTaskList } from "@/components/finance/setup-tasks";
import { loadPeriods } from "@/lib/finance/review/data";
import { defaultPeriodId } from "@/lib/finance/review/filters";
import { buildHref, one, pageNumber, PAGE_SIZE, type SearchParams } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Initiatives" };

export default async function InitiativesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const q = one(params, "q");
  const status = ["active", "retired"].includes(one(params, "status")) ? one(params, "status") : "";
  const page = pageNumber(params);
  const form = ["none", "draft", "published"].includes(one(params, "form")) ? one(params, "form") : "";
  const admin = user.role === "finance_admin";
  const today = todayInNewYork();

  const loaded = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const setup = admin ? await setupStatus(tx, today) : null;
    const setupPeriod = setup?.fiscalYear ? periods.find((p) => p.fiscalYearId === setup.fiscalYear!.id) : undefined;
    const period =
      periods.find((p) => p.id === one(params, "period")) ??
      setupPeriod ??
      periods.find((p) => p.id === defaultPeriodId(periods));
    if (!period) return null;
    const categories = await listCategories(tx);
    const agencies = await listAgencies(tx);
    const category = categories.includes(one(params, "category")) ? one(params, "category") : "";
    const agency = agencies.includes(one(params, "agency")) ? one(params, "agency") : "";
    const list = await listInitiatives(tx, today, period.id, { q, category, status, agency, page, form });
    const summary = await categorySummary(tx, today, period.id);
    const opens = await tx.one<{ opens_on: string }>(
      "SELECT (ends_on + 1)::text AS opens_on FROM reporting_period WHERE id = $1",
      [period.id],
    );
    const opensOn = opens?.opens_on ?? "";
    return { periods, period, categories, agencies, category, agency, summary, setup, opensOn, ...list };
  });
  if (!loaded) return <NoPeriods title="Initiatives" />;
  const data = loaded;

  const base = "/finance/initiatives";
  const totals = data.summary.reduce(
    (t, c) => ({
      funding: t.funding + Number(c.funding),
      initiatives: t.initiatives + c.initiatives,
      accepted: t.accepted + c.accepted,
      assignments: t.assignments + c.assignments,
      missing: t.missing + c.missing,
    }),
    { funding: 0, initiatives: 0, accepted: 0, assignments: 0, missing: 0 },
  );
  const notDue = data.period.dueOn > today;
  const notOpen = data.opensOn !== "" && data.opensOn > today;
  const opensLabel = notOpen ? `Opens ${shortDate(data.opensOn)}` : "";
  const kept = { q, category: data.category, status, agency: data.agency, period: data.period.id, form };

  return (
    <>
      <PageHeader title="Initiatives" crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Initiatives" }]} />

      {data.setup ? <SetupTaskList status={data.setup} today={today} /> : null}

      <Card id="initiatives">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5 sm:px-6">
          <div>
            <h2 className="text-xl font-bold leading-7 text-ink">
              {data.period.fiscalYearId} initiatives{" "}
              <span className="num font-semibold text-muted">({data.total})</span>
            </h2>
            <p className="mt-0.5 text-[15px] text-ink-2">
              {formatCompactCurrency(totals.funding)} across {formatCount(totals.assignments)} awards
            </p>
          </div>
          {admin ? (
            <ButtonLink href="/finance/initiatives/new" variant="secondary">
              Create initiative
            </ButtonLink>
          ) : null}
        </div>
        <FilterBar
          action={base}
          clearHref={buildHref(base, { period: data.period.id })}
          active={[q, data.category, data.agency, status, form].some(Boolean)}
          keep={3}
          moreApplied={[data.agency, status, form].filter(Boolean).length}
        >
          <FilterField label="Search" htmlFor="q" className="min-w-64 flex-1">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Code or name" />
          </FilterField>
          <FilterField label="Reporting period" htmlFor="period">
            <Select id="period" name="period" defaultValue={data.period.id}>
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={data.category}>
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Administering agency" htmlFor="agency">
            <Select id="agency" name="agency" defaultValue={data.agency}>
              <option value="">All agencies</option>
              {data.agencies.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Report form" htmlFor="form">
            <Select id="form" name="form" defaultValue={form}>
              <option value="">Any form status</option>
              <option value="none">No published form</option>
              <option value="draft">Has a draft</option>
              <option value="published">Published</option>
            </Select>
          </FilterField>
          <FilterField label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={status}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </Select>
          </FilterField>
        </FilterBar>
        <Table density="compact" stack>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Initiative</TH>
              <TH>Category and agency</TH>
              <TH align="right">Organizations</TH>
              <TH align="right">Total funding</TH>
              <TH>Form</TH>
              <TH>{data.period.label}</TH>
              <TH align="right">Missing</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={8}>
                No initiatives match these filters. Clear the filters to see every initiative.
              </EmptyRow>
            ) : (
              data.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap font-mono text-[13px] text-muted" label="Code">
                    <span>{row.code}</span>
                  </TD>
                  <TD className="min-w-[14rem]" primary>
                    <Link
                      href={`${base}/${row.id}`}
                      className="font-semibold text-link underline-offset-2 hover:text-link-hover hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.status === "retired" ? (
                      <span className="ml-2">
                        <Badge>Retired</Badge>
                      </span>
                    ) : null}
                  </TD>
                  <TD label="Category">
                    <span>{row.category}</span>
                    <span className="block text-[13px] text-muted">{row.agency ?? "Agency not set"}</span>
                  </TD>
                  <TD align="right" label="Organizations">
                    <span>{row.orgs}</span>
                  </TD>
                  <TD align="right" label="Total funding">
                    <span>{formatCurrency(Number(row.funding), { cents: false })}</span>
                  </TD>
                  <TD className="whitespace-nowrap" label="Form">
                    {row.form_status === "published" ? (
                      <span>Published v{row.form_version}</span>
                    ) : row.form_status === "draft" ? (
                      <span className="text-ink-2">Draft v{row.form_version}</span>
                    ) : (
                      <Badge tone="warn">No form</Badge>
                    )}
                  </TD>
                  <TD label={data.period.label}>
                    {row.orgs > 0 && notOpen ? (
                      <span className="whitespace-nowrap text-muted">{opensLabel}</span>
                    ) : row.orgs > 0 && notDue ? (
                      <span className="num text-muted">
                        {row.accepted} of {row.orgs} accepted
                      </span>
                    ) : row.orgs > 0 ? (
                      <ProgressBar value={row.accepted} max={row.orgs} label={`${row.name} accepted reports`} />
                    ) : (
                      <span className="text-muted">No organizations</span>
                    )}
                  </TD>
                  <TD align="right" label="Missing">
                    {notOpen ? null : row.missing > 0 ? (
                      <Badge tone="bad">{row.missing} missing</Badge>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <Pagination base={base} params={kept} page={page} pageSize={PAGE_SIZE} total={data.total} />
      </Card>
    </>
  );
}
