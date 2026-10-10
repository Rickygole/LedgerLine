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
import { CreateDraftForm } from "@/components/finance/admin/create-draft-form";
import { isUuid } from "@/lib/ids";

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
  published_definition: FormDefinition | null;
};


export default async function FormPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams: Promise<{ import?: string }> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { formId } = await params;
  const query = await searchParams;
  if (!isUuid(formId)) notFound();
  const form = await withClaims(user.id, (tx) =>
    tx.one<FormRow>(
      `SELECT f.id, f.version, f.status, f.definition, f.initiative_id, i.name AS initiative_name, i.code AS initiative_code,
              f.published_at, u.full_name AS published_by_name,
              (SELECT max(p.version) FROM form_version p WHERE p.initiative_id = f.initiative_id AND p.status = 'published') AS published_version,
              (SELECT p.definition FROM form_version p WHERE p.initiative_id = f.initiative_id AND p.status = 'published' ORDER BY p.version DESC LIMIT 1) AS published_definition
       FROM form_version f
       JOIN initiative i ON i.id = f.initiative_id
       LEFT JOIN app_user u ON u.id = f.published_by
       WHERE f.id = $1`,
      [formId]
    )
  );
  if (!form) notFound();
  const editable = user.role === "finance_admin" && form.status === "draft";
  const hasDraft = await withClaims(user.id, async (tx) => Boolean(await tx.one("SELECT 1 FROM form_version WHERE initiative_id = $1 AND status = 'draft'", [form.initiative_id])));
  const tone = form.status === "published" ? "ok" : "neutral";
  const icon = form.status === "published" ? CheckCircle2 : form.status === "draft" ? CircleDashed : History;
  const statusLabel = { draft: "Draft", published: "Published", superseded: "Superseded" }[form.status];

  return (
    <>
      <PageHeader
        title={`${form.initiative_name}: report form`}
        crumbs={[{ label: "Initiatives", href: "/finance/initiatives" }, { label: form.initiative_name, href: `/finance/initiatives/${form.initiative_id}` }, { label: `Form version ${form.version}` }]}
        description={form.status === "draft" ? "A draft is invisible to funded organizations until it is published." : "This version is read-only. Organizations reporting on it see exactly these questions."}
        meta={
          <>
            <Badge tone={tone} icon={icon}>
              {statusLabel}
            </Badge>
            <span className="text-[15px] text-ink-2">
              Version <span className="num">{form.version}</span> · {statusLabel} · <span className="font-mono text-sm">{form.initiative_code}</span>
              {form.published_at ? ` · Published ${formatDate(form.published_at)}${form.published_by_name ? ` by ${form.published_by_name}` : ""}` : ""}
            </span>
          </>
        }
        actions={user.role === "finance_admin" && form.status !== "draft" && !hasDraft ? <CreateDraftForm initiativeId={form.initiative_id} label="Create a draft to edit" /> : null}
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
        publishedDefinition={form.published_definition}
      />
    </>
  );
}
