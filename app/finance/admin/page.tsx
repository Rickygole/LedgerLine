import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administration" };

const ADMIN_AREAS = [
  { href: "/finance/support", name: "Support queue", detail: "Help requests from users and the 24 hour response target.", ids: "US-061, US-063, BR-029" },
  { href: "/finance/incidents", name: "Security incidents", detail: "Record a breach, notify the Council's contacts and track remediation.", ids: "US-058, BR-025" },
  { href: "/finance/reviews", name: "Annual structure review", detail: "Yearly review of initiatives, forms, periods, users and rules, with sign-off.", ids: "US-064, BR-028" },
  { href: "/finance/readiness", name: "Go-live readiness", detail: "Test sessions, defects and Finance training records.", ids: "US-065, US-066" },
  { href: "/finance/data", name: "Export all data", detail: "Download a complete, documented copy of the Council's data.", ids: "US-055, BR-020" },
  { href: "/finance/platform", name: "Platform and status", detail: "Hosting, health check, support model and delivery timeline.", ids: "US-053, US-054, US-062, BR-026, BR-027" },
];

export default async function AdminIndex() {
  await requireUser(["finance_admin"]);
  return (
    <>
      <PageHeader title="Administration" description="Areas for Finance administrators." crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Administration" }]} />
      <Card>
        <Table density="compact">
          <THead>
            <tr>
              <TH>Area</TH>
              <TH>What it is for</TH>
              <TH>Requirements</TH>
            </tr>
          </THead>
          <tbody>
            {ADMIN_AREAS.map((a) => (
              <TR key={a.href}>
                <TD className="font-semibold">
                  <Link href={a.href} className="text-link underline underline-offset-2 hover:text-link-hover">
                    {a.name}
                  </Link>
                </TD>
                <TD className="text-muted">{a.detail}</TD>
                <TD className="whitespace-nowrap text-muted">{a.ids}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
