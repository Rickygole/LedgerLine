"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { dbFailure, failure, firstIssue, isoDay, success, trimmed, type OpState } from "@/lib/ops/action-state";

const REVIEW_ERRORS = {
  "review is signed off": "This review is signed off and can no longer be changed.",
  "review not found": "That review could not be found.",
};

function refresh(year: string) {
  revalidatePath("/finance/reviews");
  revalidatePath(`/finance/reviews/${year}`);
  revalidatePath("/finance/rollover");
}

export async function startReview(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = z.object({ year: z.string().regex(/^FY\d{2}$/, "Choose a fiscal year."), reviewDate: isoDay("the review date") }).safeParse({
    year: String(formData.get("year") ?? ""),
    reviewDate: String(formData.get("reviewDate") ?? ""),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.start_annual_review($1, $2)", [parsed.data.year, parsed.data.reviewDate]));
    return success(`The ${parsed.data.year} review is open.`);
  } catch (error) {
    return dbFailure(error, { annual_review_fiscal_year_id_key: `A review for ${parsed.data.year} already exists.`, "fiscal year not found": "That fiscal year does not exist." });
  } finally {
    refresh(parsed.data.year);
  }
}

export async function setReviewCheck(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("reviewId") ?? "");
  const item = String(formData.get("item") ?? "");
  const year = String(formData.get("year") ?? "");
  const done = formData.get("done") === "true";
  if (!isUuid(id)) return failure("That review could not be found.");
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.set_review_check($1, $2, $3)", [id, item, done]));
    return success(done ? "Ticked." : "Unticked.");
  } catch (error) {
    return dbFailure(error, REVIEW_ERRORS);
  } finally {
    refresh(year);
  }
}

export async function addReviewParticipant(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = z
    .object({ reviewId: z.string().refine(isUuid, "That review could not be found."), year: z.string(), name: trimmed("a name", 120), affiliation: trimmed("an organization or team", 160) })
    .safeParse({
      reviewId: String(formData.get("reviewId") ?? ""),
      year: String(formData.get("year") ?? ""),
      name: String(formData.get("name") ?? ""),
      affiliation: String(formData.get("affiliation") ?? ""),
    });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.add_review_participant($1, $2, $3)", [parsed.data.reviewId, parsed.data.name, parsed.data.affiliation]));
    return success(`${parsed.data.name} added.`);
  } catch (error) {
    return dbFailure(error, REVIEW_ERRORS);
  } finally {
    refresh(parsed.data.year);
  }
}

export async function addReviewDecision(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = z
    .object({
      reviewId: z.string().refine(isUuid, "That review could not be found."),
      year: z.string(),
      area: z.enum(["initiatives", "forms", "periods", "users", "rules", "other"], { message: "Choose the area the decision concerns." }),
      decision: trimmed("the decision", 1000),
    })
    .safeParse({
      reviewId: String(formData.get("reviewId") ?? ""),
      year: String(formData.get("year") ?? ""),
      area: String(formData.get("area") ?? ""),
      decision: String(formData.get("decision") ?? ""),
    });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.add_review_decision($1, $2, $3)", [parsed.data.reviewId, parsed.data.area, parsed.data.decision]));
    return success("Decision recorded.");
  } catch (error) {
    return dbFailure(error, REVIEW_ERRORS);
  } finally {
    refresh(parsed.data.year);
  }
}

export async function signOffReview(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = z.object({ reviewId: z.string().refine(isUuid, "That review could not be found."), year: z.string(), signedOn: isoDay("the sign-off date") }).safeParse({
    reviewId: String(formData.get("reviewId") ?? ""),
    year: String(formData.get("year") ?? ""),
    signedOn: String(formData.get("signedOn") ?? ""),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.sign_off_annual_review($1, $2)", [parsed.data.reviewId, parsed.data.signedOn]));
    return success("The review is signed off.");
  } catch (error) {
    return dbFailure(error, {
      ...REVIEW_ERRORS,
      "complete every checklist item first": "Tick every checklist item before signing off.",
      "record who took part first": "Record who took part before signing off.",
      "record at least one decision first": "Record at least one decision before signing off.",
      "sign-off date must fall": "The sign-off date must be between the review date and today.",
    });
  } finally {
    refresh(parsed.data.year);
  }
}
