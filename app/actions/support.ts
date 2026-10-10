"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { dispatchFor } from "@/lib/outbox-dispatch";
import { isUuid } from "@/lib/ids";
import { actionFailure, allIssues, type ActionState, failure, firstIssue, success, trimmed } from "@/lib/actions";

const requestSchema = z.object({
  category: z.enum(["account", "password", "report", "data", "other"], { message: "Choose what you need help with." }),
  subject: trimmed("a subject", 120),
  body: trimmed("a description", 4000),
});

export async function createSupportRequest(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = requestSchema.safeParse({
    category: String(formData.get("category") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return failure(allIssues(parsed.error));
  try {
    const reference = await withClaims(user.id, async (tx) => {
      const row = await tx.one<{ id: string }>("SELECT app.create_support_request($1, $2, $3) AS id", [parsed.data.category, parsed.data.subject, parsed.data.body]);
      const created = await tx.one<{ reference: string }>("SELECT reference FROM support_request WHERE id = $1", [row?.id]);
      return created?.reference ?? "";
    });
    return success(`Your request was sent. The reference is ${reference}. Finance support aims to reply within 24 hours.`);
  } catch (error) {
    return actionFailure("create_support_request_failed", error);
  } finally {
    revalidatePath("/portal/help");
    revalidatePath("/finance/help");
    revalidatePath("/finance/support");
  }
}

export async function replyToSupportRequest(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("requestId") ?? "");
  const body = trimmed("a message", 4000).safeParse(String(formData.get("body") ?? ""));
  if (!isUuid(id)) return failure("That request could not be found.");
  if (!body.success) return failure(firstIssue(body.error));
  try {
    await withClaims(user.id, (tx) => tx.query("SELECT app.reply_support_request($1, $2)", [id, body.data]));
    await dispatchFor(user.id);
    return success("Your message was sent.");
  } catch (error) {
    return actionFailure("reply_to_support_request_failed", error, { messages: { "request is closed": "This request is closed. Send a new request instead.", "request not found": "That request could not be found." } });
  } finally {
    revalidatePath("/portal/help");
    revalidatePath("/finance/help");
    revalidatePath("/finance/support");
  }
}
