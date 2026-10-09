import { NextResponse, type NextRequest } from "next/server";
import { FINANCE_ROLES, getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { getFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download files." }, { status: 401 });
  if (!FINANCE_ROLES.includes(user.role)) return NextResponse.json({ error: "Only Council Finance staff can download files here." }, { status: 403 });
  const { id, attachmentId } = await params;
  if (!UUID.test(id) || !UUID.test(attachmentId)) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const attachment = await withClaims(user.id, (tx) =>
    tx.one<{ path: string; filename: string; mime: string }>("SELECT path, filename, mime FROM attachment WHERE id = $1 AND submission_id = $2", [attachmentId, id])
  );
  if (!attachment) return NextResponse.json({ error: "File not found." }, { status: 404 });

  try {
    const body = await getFile(attachment.path);
    const safeName = attachment.filename.replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": attachment.mime,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "The file could not be read from storage." }, { status: 404 });
  }
}
