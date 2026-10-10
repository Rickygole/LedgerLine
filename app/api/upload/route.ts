import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { openSubmissionForUpload, pathSignatureValid } from "@/lib/report/attachments";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class Refusal extends Error {}

const payloadSchema = z.object({ submissionId: z.uuid(), signature: z.string().min(10).max(200) });

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "The upload request was not understood." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user || user.role !== "cbo_submitter") throw new Refusal("Sign in to upload files.");
        const userId = user.id;

        const payload = payloadSchema.safeParse(JSON.parse(clientPayload ?? "{}"));
        if (!payload.success) throw new Refusal("This upload was not requested by the report page.");
        if (!pathSignatureValid(userId, payload.data.submissionId, pathname, payload.data.signature)) {
          throw new Refusal("This upload path was not issued for your report or has expired.");
        }
        const open = await withClaims(userId, (tx) => openSubmissionForUpload(tx, payload.data.submissionId));
        if (!open) throw new Refusal("Files can only be added to a report that is still open for editing.");

        return {
          allowedContentTypes: Object.values(ALLOWED_TYPES),
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ userId, submissionId: payload.data.submissionId }),
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Refusal ? error.message : "The upload could not start." },
      { status: 400 },
    );
  }
}
