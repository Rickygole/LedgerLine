import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { systemToday } from "@/lib/ops/today";
import { CHECKLIST, checklistDone, listReviews } from "@/lib/ops/reviews";
import { ActionForm } from "@/components/ops/action-form";
import { startReview } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Label, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Annual structure review" };

export default async function ReviewsPage() {
  const admin = await requireUser(["finance_admin"]);
  const { reviews, years } = await withClaims(admin.id, async (tx) => ({
    reviews: await listReviews(tx),
    years: (await tx.query<{ id: string }>("SELECT id FROM fiscal_year ORDER BY id DESC")).map((y) => y.id),
  }));
  const reviewed = new Set(reviews.map((r) => r.fiscal_year_id));
  const open = years.filter((y) => !reviewed.has(y));

  return (
    <>
      <PageHeader
        title="Annual structure review"
        description="Once a year, Council Finance reviews initiatives, report forms, reporting periods, users and rules before the next fiscal year starts. Each year has one review, signed off by a Finance administrator. Decisions feed the annual rollover."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Annual structure review" }]}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader title="Reviews" />
          <Table density="compact">
            <THead>
              <tr>
                <TH>Fiscal year</TH>
                <TH>Review date</TH>
                <TH>Checklist</TH>
                <TH>Participants</TH>
                <TH>Decisions</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {reviews.length === 0 ? (
                <EmptyRow colSpan={6}>No reviews have been started.</EmptyRow>
              ) : (
                reviews.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-semibold">
                      <Link
                        href={`/finance/reviews/${r.fiscal_year_id}`}
                        className="text-link underline underline-offset-2 hover:text-link-hover"
                      >
                        {r.fiscal_year_id}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(r.review_date)}</TD>
                    <TD>
                      {checklistDone(r)} of {CHECKLIST.length}
                    </TD>
                    <TD>{r.participants}</TD>
                    <TD>{r.decisions}</TD>
                    <TD>
                      {r.status === "signed_off" ? (
                        <Badge tone="ok">Signed off {formatDate(r.signed_off_on)}</Badge>
                      ) : (
                        <Badge tone="warn">In progress</Badge>
                      )}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader
            title="Start a review"
            description={open.length === 0 ? "Every fiscal year has a review." : "One review per fiscal year."}
          />
          {open.length > 0 ? (
            <CardBody>
              <ActionForm action={startReview} submitLabel="Start review" pendingLabel="Starting">
                <div>
                  <Label htmlFor="year">Fiscal year</Label>
                  <Select id="year" aria-required="true" name="year" defaultValue={open[0]}>
                    {open.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reviewDate">Review date</Label>
                  <Input
                    id="reviewDate"
                    aria-required="true"
                    name="reviewDate"
                    type="date"
                    defaultValue={systemToday()}
                  />
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
