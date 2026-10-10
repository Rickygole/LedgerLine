import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { AddOrganizationForm } from "@/components/finance/admin/add-organization-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add organization" };

export default async function AddOrganizationPage() {
  await requireUser(["finance_admin"]);
  return (
    <>
      <PageHeader
        title="Add organization"
        description="Add an organization to the Council Finance master list. Reports are checked against this list."
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Organizations", href: "/finance/organizations" },
          { label: "Add organization" },
        ]}
      />
      <Card className="max-w-[900px]">
        <AddOrganizationForm />
      </Card>
    </>
  );
}
