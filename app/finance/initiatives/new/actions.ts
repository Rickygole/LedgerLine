"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { buildDefinition } from "@/lib/forms/standard";
import { parseAmount } from "@/lib/rules/money";
import { plainError } from "@/lib/finance/admin/errors";
import { AGENCIES } from "@/lib/domain";
import type { FormState } from "@/lib/finance/admin/form-state";
import { isUuid } from "@/lib/finance/admin/params";

const createSchema = z.object({
  name: z.string().trim().min(3, "Enter a name of at least 3 characters.").max(120, "Use 120 characters or fewer."),
  category: z.string().trim().min(1, "Choose a category."),
  description: z.string().trim().min(10, "Describe the initiative in at least 10 characters.").max(1000, "Use 1,000 characters or fewer."),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

export async function createInitiative(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["finance_admin"]);
  const values = { name: String(formData.get("name") ?? "").slice(0, 400), category: String(formData.get("category") ?? "").slice(0, 200), description: String(formData.get("description") ?? "").slice(0, 4000) };
  const parsed = createSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  let newId: string | null = null;
  for (let attempt = 0; attempt < 3 && !newId; attempt++) {
    try {
      newId = await withClaims(user.id, async (tx) => {
        const category = await tx.one(`SELECT 1 FROM initiative WHERE category = $1 LIMIT 1`, [parsed.data.category]);
        if (!category) throw Object.assign(new Error("unknown category"), { code: "23514" });
        const next = await tx.one<{ next: number }>(`SELECT coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 AS next FROM initiative WHERE code ~ '^CI-[0-9]+$'`);
        const code = `CI-${String(next!.next).padStart(3, "0")}`;
        const row = await tx.one<{ id: string }>(
          `INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding, created_by)
           VALUES ($1, $2, $3, $4, 'FY27', 0, $5) RETURNING id`,
          [code, parsed.data.name, parsed.data.category, parsed.data.description, user.id]
        );
        await tx.query(`SELECT app.write_audit('initiative', $1, 'create', NULL, NULL, $2::jsonb, NULL)`, [
          row!.id,
          JSON.stringify({ code, name: parsed.data.name, category: parsed.data.category, fiscal_year: "FY27" }),
        ]);
        return row!.id;
      });
    } catch (error) {
      if (pgCode(error) === "23505" && attempt < 2) continue;
      return { error: plainError(error), values };
    }
  }
  redirect(`/finance/initiatives/new?step=2&initiative=${newId}`);
}

const assignSchema = z.object({
  initiativeId: z.string().refine(isUuid, "That initiative could not be found."),
  rows: z
    .array(z.object({ orgId: z.string().refine(isUuid, "Choose an organization from the list."), amount: z.number().positive("Enter an award greater than zero."), agency: z.string() }))
    .min(1, "Add at least one organization."),
});

export async function assignOrganizations(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["finance_admin"]);
  const orgIds = formData.getAll("orgId").map(String);
  const amounts = formData.getAll("amount").map((v) => parseAmount(String(v)));
  const agencies = formData.getAll("agency").map(String);
  const errors: Record<string, string> = {};
  amounts.forEach((amount, index) => {
    if (amount === null || amount <= 0) errors[`amount-${index}`] = "Enter an award amount greater than zero, such as 50,000.";
  });
  if (orgIds.length === 0) return { error: "Add at least one organization before saving." };
  if (new Set(orgIds).size !== orgIds.length) return { error: "An organization appears more than once. Remove the duplicate." };
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };
  const parsed = assignSchema.safeParse({
    initiativeId: formData.get("initiativeId"),
    rows: orgIds.map((orgId, i) => ({ orgId, amount: amounts[i], agency: AGENCIES.includes(agencies[i] as never) ? agencies[i] : "" })),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the organizations and try again." };
  try {
    await withClaims(user.id, async (tx) => {
      const initiative = await tx.one<{ code: string }>(`SELECT code FROM initiative WHERE id = $1`, [parsed.data.initiativeId]);
      if (!initiative) throw Object.assign(new Error("missing initiative"), { code: "23503" });
      for (const row of parsed.data.rows) {
        const org = await tx.one<{ legal_name: string }>(`SELECT legal_name FROM organization WHERE id = $1`, [row.orgId]);
        if (!org) throw Object.assign(new Error("missing organization"), { code: "23503" });
        const inserted = await tx.one<{ id: string }>(
          `INSERT INTO assignment (initiative_id, org_id, award_amount, sponsoring_agency) VALUES ($1, $2, $3, nullif($4, '')) RETURNING id`,
          [parsed.data.initiativeId, row.orgId, row.amount, row.agency]
        );
        await tx.query(`SELECT app.write_audit('assignment', $1, 'assign', NULL, NULL, $2::jsonb, NULL)`, [
          inserted!.id,
          JSON.stringify({ org_id: row.orgId, org_name: org.legal_name, initiative_id: parsed.data.initiativeId, initiative_code: initiative.code, award_amount: row.amount }),
        ]);
      }
      const total = await tx.one<{ total: string }>(
        `UPDATE initiative i SET total_funding = (SELECT coalesce(sum(award_amount), 0) FROM assignment WHERE initiative_id = i.id)
         WHERE i.id = $1 RETURNING i.total_funding AS total`,
        [parsed.data.initiativeId]
      );
      await tx.query(`SELECT app.write_audit('initiative', $1, 'funding_recalculated', NULL, NULL, $2::jsonb, NULL)`, [
        parsed.data.initiativeId,
        JSON.stringify({ total_funding: Number(total!.total) }),
      ]);
    });
  } catch (error) {
    if (pgCode(error) === "23505") return { error: "One of those organizations is already assigned to this initiative." };
    return { error: plainError(error) };
  }
  redirect(`/finance/initiatives/new?step=3&initiative=${parsed.data.initiativeId}`);
}

export async function chooseTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const mode = formData.get("mode") === "import" ? "import" : "standard";
  if (!isUuid(initiativeId)) return { error: "That initiative could not be found." };
  let formId: string;
  try {
    formId = await withClaims(user.id, async (tx) => {
      const initiative = await tx.one<{ name: string }>(`SELECT name FROM initiative WHERE id = $1`, [initiativeId]);
      if (!initiative) throw Object.assign(new Error("missing initiative"), { code: "23503" });
      const existing = await tx.one<{ id: string }>(`SELECT id FROM form_version WHERE initiative_id = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`, [initiativeId]);
      if (existing) return existing.id;
      const next = await tx.one<{ next: number }>(`SELECT coalesce(max(version), 0) + 1 AS next FROM form_version WHERE initiative_id = $1`, [initiativeId]);
      const definition = buildDefinition(`${initiative.name} report`, []);
      const row = await tx.one<{ id: string }>(
        `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by) VALUES ($1, $2, 'draft', $3::jsonb, 'manual', $4) RETURNING id`,
        [initiativeId, next!.next, JSON.stringify(definition), user.id]
      );
      await tx.query(`SELECT app.write_audit('form_version', $1, 'create_draft', $2, NULL, $3::jsonb, NULL)`, [
        row!.id,
        mode === "import" ? "Started to import an uploaded Word template" : "Started from the standard template",
        JSON.stringify({ initiative_id: initiativeId, version: next!.next }),
      ]);
      return row!.id;
    });
  } catch (error) {
    return { error: plainError(error) };
  }
  redirect(mode === "import" ? `/finance/forms/${formId}?import=1` : `/finance/forms/${formId}`);
}
