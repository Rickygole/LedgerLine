"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage, type ErrorOverrides } from "@/lib/actions";
import { withClaims } from "@/lib/db";
import { logError } from "@/lib/ops/log";
import { isUuid } from "@/lib/ids";
import { questionSchema } from "@/lib/forms/editor/schema";
import {
  applyToForms,
  createLibraryQuestion,
  setLibraryRetired,
  updateLibraryQuestion,
  type ApplyOutcome,
} from "@/lib/forms/library";

type Failure = { ok: false; errors: string[] };

const LIBRARY_ERRORS: ErrorOverrides = {
  codes: {
    "42501": "Only finance administrators can change the question library.",
    "23514": "That change is not allowed for the question in its current state.",
    "23505": "A library question with that key already exists.",
  },
  fallback: "Something went wrong and nothing was saved. Try again.",
};

async function failFrom(event: string, error: unknown): Promise<Failure> {
  await logError(event, error);
  return { ok: false, errors: [dbErrorMessage(error, LIBRARY_ERRORS)] };
}

const inputSchema = z.object({
  question: questionSchema,
  templateSection: z.enum(["organization", "performance", "narrative"]).nullable(),
});

export async function saveLibraryQuestion(
  mode: "create" | "update",
  input: z.input<typeof inputSchema>,
): Promise<{ ok: true; key: string } | Failure> {
  const user = await requireUser(["finance_admin"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, errors: ["This question could not be read. Reload the page and try again."] };
  const data = {
    question: { ...parsed.data.question, scope: "standard" as const },
    templateSection: parsed.data.templateSection,
  };
  try {
    const result = await withClaims(user.id, (tx) =>
      mode === "create" ? createLibraryQuestion(tx, data) : updateLibraryQuestion(tx, data),
    );
    if ("errors" in result) return { ok: false, errors: result.errors };
  } catch (error) {
    return failFrom("save_library_question_failed", error);
  }
  revalidatePath("/finance/question-library");
  return { ok: true, key: data.question.key };
}

export async function retireLibraryQuestion(key: string, reason: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser(["finance_admin"]);
  try {
    const result = await withClaims(user.id, (tx) => setLibraryRetired(tx, key, true, reason));
    if ("errors" in result) return { ok: false, errors: result.errors };
  } catch (error) {
    return failFrom("retire_library_question_failed", error);
  }
  revalidatePath("/finance/question-library");
  return { ok: true };
}

export async function restoreLibraryQuestion(key: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser(["finance_admin"]);
  try {
    const result = await withClaims(user.id, (tx) => setLibraryRetired(tx, key, false, ""));
    if ("errors" in result) return { ok: false, errors: result.errors };
  } catch (error) {
    return failFrom("restore_library_question_failed", error);
  }
  revalidatePath("/finance/question-library");
  return { ok: true };
}

export async function applyLibraryQuestion(
  key: string,
  initiativeIds: string[],
  addIfMissing: boolean,
): Promise<{ ok: true; outcomes: ApplyOutcome[] } | Failure> {
  const user = await requireUser(["finance_admin"]);
  const ids = [...new Set(initiativeIds)].filter(isUuid);
  if (ids.length === 0) return { ok: false, errors: ["Choose at least one initiative."] };
  if (ids.length > 400) return { ok: false, errors: ["Choose 400 initiatives or fewer at a time."] };
  try {
    const result = await withClaims(user.id, (tx) => applyToForms(tx, key, ids, { addIfMissing }));
    if ("errors" in result) return { ok: false, errors: result.errors };
    revalidatePath("/finance/initiatives");
    revalidatePath("/finance/question-library");
    return { ok: true, outcomes: result.outcomes };
  } catch (error) {
    return failFrom("apply_library_question_failed", error);
  }
}
