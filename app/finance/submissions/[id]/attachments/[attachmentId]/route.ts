import { NextResponse, type NextRequest } from "next/server";
import { FINANCE_ROLES, getCurrentUser } from "@/lib/auth";
import { serveAttachment } from "@/lib/report/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download files." }, { status: 401 });
  if (!FINANCE_ROLES.includes(user.role))
    return NextResponse.json({ error: "Only Council Finance staff can download files here." }, { status: 403 });
  const { id, attachmentId } = await params;
  return serveAttachment(user, id, attachmentId);
}
