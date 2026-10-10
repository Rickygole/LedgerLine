import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";
import { buildPackage, type CatalogColumn, type PackageRows } from "@/lib/export/package";
import { buildZip } from "@/lib/export/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export data." }, { status: 401 });
  if (user.role !== "finance_admin") return NextResponse.json({ error: "Only Finance administrators can export all data." }, { status: 403 });

  const generatedAt = new Date();
  const filename = `ledgerline-data-package-${todayInNewYork()}.zip`;
  const { catalog, rows } = await withClaims(user.id, async (tx) => {
    const catalog = await tx.query<CatalogColumn>("SELECT table_name, column_name, data_type, is_nullable, ordinal FROM app.export_catalog()");
    const rows: PackageRows = {};
    for (const table of new Set(catalog.map((c) => c.table_name))) {
      const result = await tx.query<{ row: Record<string, unknown> }>("SELECT app.export_rows($1) AS row", [table]);
      rows[table] = result.map((r) => r.row);
    }
    const total = Object.values(rows).reduce((sum, list) => sum + list.length, 0);
    await tx.query("SELECT app.write_audit($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)", [
      "export",
      "data_package",
      "export_all",
      `${filename}: ${Object.keys(rows).length} tables, ${total} rows`,
      null,
      JSON.stringify({ tables: Object.keys(rows).length, rows: total }),
      null,
    ]);
    return { catalog, rows };
  });

  const { files } = buildPackage({ catalog, rows, generatedAt, generatedBy: `${user.fullName} (${user.email})` });
  return new NextResponse(new Uint8Array(buildZip(files, generatedAt)), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
