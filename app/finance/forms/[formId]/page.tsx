import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormWorkbench } from "@/components/forms/form-workbench";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/status-badge";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import type { FormDefinition } from "@/lib/rules/types";
import { CheckCircle2, CircleDashed, History } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Form editor" };

type FormRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "superseded";
  definition: FormDefinition;
  initiative_id: string;
  initiative_name: string;
  initiative_code: string;
  published_at: Date | null;
  published_by_name: string | null;
  published_version: number | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FormPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams: Promise<{ import?: string }> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { formId } = await params;
  const query = await searchParams;
  if (!uuid.test(formId)) notFound();
  const form = await withClaims(user.id, (tx) =>
    tx.one<FormRow>(
      `SELECT f.id, f.version, f.status, f.definition, f.initiative_id, i.name AS initiative_name, i.code AS initiative_code,
              f.published_at, u.full_name AS published_by_name,
              (SELECT max(p.version) FROM form_version p WHERE p.initiative_id = f.initiative_id AND p.status = 'published') AS published_version
       FROM form_version f
       JOIN initiative i ON i.id = f.initiative_id
       LEFT JOIN app_user u ON u.id = f.published_by
       WHERE f.id = $1`,
      [formId]
    )
  );
  if (!form) notFound();
  const editable = user.role === "finance_admin" && form.status === "draft";
  const tone = form.status === "published" ? "ok" : form.status === "draft" ? "info" : "neutral";
  const icon = form.status === "published" ? CheckCircle2 : form.status === "draft" ? CircleDashed : History;
  const statusLabel = { draft: "Draft", published: "Published", superseded: "Superseded" }[form.status];

  return (
    <>
      <PageHeader
        title={`${form.initiative_name}: report form`}
        crumbs={[{ label: "Initiatives", href: "/finance/initiatives" }, { label: form.initiative_name, href: `/finance/initiatives/${form.initiative_id}` }, { label: `Form version ${form.version}` }]}
        description={form.status === "draft" ? "A draft is invisible to funded organizations until it is published." : "This version is read-only."}
        meta={
          <>
            <Badge tone={tone} icon={icon}>
              {statusLabel}
            </Badge>
            <span className="text-sm text-ink">
              Version <span className="num font-semibold">{form.version}</span>
            </span>
            <span className="font-mono text-[13px] text-muted">{form.initiative_code}</span>
            {form.published_at ? (
              <span className="text-sm text-muted">
                Published {formatDate(form.published_at)}
                {form.published_by_name ? ` by ${form.published_by_name}` : ""}
              </span>
            ) : null}
          </>
        }
      />
      <FormWorkbench
        formId={form.id}
        version={form.version}
        status={form.status}
        initiativeId={form.initiative_id}
        initiativeName={form.initiative_name}
        initialDefinition={form.definition}
        canEdit={editable}
        openImport={query.import === "1"}
        publishedVersion={form.published_version}
      />
    </>
  );
}
