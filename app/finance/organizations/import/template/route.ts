import { requireUser } from "@/lib/auth";
import { MASTER_FIELDS } from "@/lib/finance/admin/master-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser(["finance_admin"]);
  return new Response(`${MASTER_FIELDS.join(",")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="organization-master-list-template.csv"',
      "cache-control": "no-store",
    },
  });
}
