import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { ImportMasterList } from "@/components/finance/admin/import-master-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import master list" };

export default async function ImportMasterListPage() {
  await requireUser(["finance_admin"]);
  return (
    <>
      <PageHeader
        title="Import master list"
        description="Add or update organizations in bulk. You see what will be added, updated and rejected before anything changes."
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Organizations", href: "/finance/organizations" },
          { label: "Import master list" },
        ]}
      />
      <div className="max-w-[980px]">
        <ImportMasterList />
      </div>
    </>
  );
}
