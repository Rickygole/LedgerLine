import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { serveAttachment } from "@/lib/report/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download files." }, { status: 401 });
  const { id, attachmentId } = await params;
  return serveAttachment(user, id, attachmentId);
}
