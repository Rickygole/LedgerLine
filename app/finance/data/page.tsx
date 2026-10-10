import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { NOT_EXPORTED, NOT_EXPORTED_COLUMNS, TABLES } from "@/lib/export/dictionary";
import { groupCatalog, type CatalogColumn } from "@/lib/export/package";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Export all data" };

export default async function DataPage() {
  const admin = await requireUser(["finance_admin"]);
  const catalog = await withClaims(admin.id, (tx) => tx.query<CatalogColumn>("SELECT table_name, column_name, data_type, is_nullable, ordinal FROM app.export_catalog()"));
  const tables = [...groupCatalog(catalog)];

  return (
    <>
      <PageHeader
        title="Export all data"
        description="All data in LedgerLine belongs to the Council. Download a complete copy of it in open formats that need no LedgerLine software to read."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Export all data" }]}
      />
      <Card className="mb-6">
        <CardHeader title="Data package" description="A zip file with one CSV file per table, a manifest of row counts, and a README that describes every table and column." />
        <CardBody className="space-y-3 text-sm">
          <p>The package covers {tables.length} tables: organizations, initiatives, forms, reports and their answers, budget lines, revisions, the audit log, messages, accounts, support requests, security incidents, reviews and readiness records.</p>
          <p>Uploaded files stay in file storage. The attachment table lists each one with its path so it can be retrieved. Each download is written to the audit log.</p>
          <a href="/api/export/all" className={buttonClass("primary", "md")}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download data package
          </a>
        </CardBody>
      </Card>
      <Card className="mb-6">
        <CardHeader title="Tables in the package" />
        <Table>
          <THead>
            <tr>
              <TH>Table</TH>
              <TH>What it holds</TH>
              <TH align="right">Columns</TH>
            </tr>
          </THead>
          <tbody>
            {tables.map(([name, columns]) => (
              <TR key={name}>
                <TD className="whitespace-nowrap font-mono text-xs font-semibold">{name}</TD>
                <TD className="text-muted">{TABLES[name]?.description}</TD>
                <TD align="right">{columns.length}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Not in the package" description="Left out on purpose because they hold credentials or internal housekeeping only." />
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {NOT_EXPORTED.map((item) => (
              <li key={item.table}>
                <span className="font-mono text-xs font-semibold">{item.table}</span>: {item.reason}
              </li>
            ))}
            {NOT_EXPORTED_COLUMNS.map((item) => (
              <li key={`${item.table}.${item.column}`}>
                <span className="font-mono text-xs font-semibold">
                  {item.table}.{item.column}
                </span>
                : {item.reason}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
