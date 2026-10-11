"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { actionFailure, failure, type ActionState } from "@/lib/actions";
import {
  MASTER_FIELDS,
  addOrganization as insertNewOrganization,
  applyImport,
  parseImport,
  previewRows,
  validateRow,
  type MasterField,
  type MasterRow,
  type PreviewRow,
} from "@/lib/finance/admin/master-list";
import { logError } from "@/lib/ops/log";

export type PreviewResult =
  | {
      ok: true;
      counts: { new: number; updated: number; unchanged: number; rejected: number };
      rows: Omit<PreviewRow, "clean">[];
    }
  | { ok: false; error: string };

export type ImportResult =
  { ok: true; added: number; updated: number; unchanged: number; rejected: number } | { ok: false; error: string };

function fileLabel(name: string): string {
  const clean = name
    .replace(/[^\w .-]/g, "")
    .trim()
    .slice(0, 80);
  return clean || "pasted list";
}

export async function previewMasterList(csv: string): Promise<PreviewResult> {
  const user = await requireUser(["finance_admin"]);
  const parsed = parseImport(String(csv ?? ""));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const preview = await withClaims(user.id, (tx) => previewRows(tx, parsed.rows));
    return {
      ok: true,
      counts: preview.counts,
      rows: preview.rows.map((row) => ({
        line: row.line,
        ein: row.ein,
        legal_name: row.legal_name,
        status: row.status,
        reasons: row.reasons,
        changes: row.changes,
      })),
    };
  } catch (error) {
    await logError("preview_master_list_failed", error);
    return { ok: false, error: "The list could not be checked. Try again." };
  }
}

export async function importMasterList(csv: string, fileName: string): Promise<ImportResult> {
  const user = await requireUser(["finance_admin"]);
  const parsed = parseImport(String(csv ?? ""));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const result = await withClaims(user.id, async (tx) => {
      const preview = await previewRows(tx, parsed.rows);
      if (preview.counts.new + preview.counts.updated === 0) return null;
      return applyImport(tx, preview, fileLabel(fileName));
    });
    if (!result) return { ok: false, error: "There is nothing new or changed to import." };
    revalidatePath("/finance/organizations");
    return { ok: true, ...result };
  } catch (error) {
    await logError("import_master_list_failed", error);
    if (pgCode(error) === "42501")
      return { ok: false, error: "Only finance administrators can change the master list." };
    if (pgCode(error) === "23505")
      return {
        ok: false,
        error: "Another change added one of these EINs while you were reviewing. Check the list again.",
      };
    return { ok: false, error: "Nothing was imported. Check the list and try again." };
  }
}

export async function addOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const values = Object.fromEntries(
    MASTER_FIELDS.map((field) => [field, String(formData.get(field) ?? "").slice(0, 400)]),
  ) as MasterRow;
  const checked = validateRow(values);
  if ("problems" in checked) {
    const fieldErrors = Object.fromEntries(
      Object.entries(checked.problems).map(([key, message]) => [key, message as string]),
    ) as Record<MasterField, string>;
    return failure("Check the highlighted fields.", { fieldErrors, values });
  }
  let id: string;
  try {
    const outcome = await withClaims(user.id, (tx) => insertNewOrganization(tx, checked.row));
    if ("duplicate" in outcome)
      return failure(`The EIN ${checked.row.ein} is already on the master list for ${outcome.duplicate}.`, {
        fieldErrors: { ein: `This EIN is already on the master list for ${outcome.duplicate}.` },
        values,
      });
    id = outcome.id;
  } catch (error) {
    if (pgCode(error) === "23505")
      return failure("That EIN is already on the master list.", {
        fieldErrors: { ein: "This EIN is already on the master list." },
        values,
      });
    return actionFailure("add_organization_failed", error, {}, { values });
  }
  revalidatePath("/finance/organizations");
  redirect(`/finance/organizations/${id}`);
}
