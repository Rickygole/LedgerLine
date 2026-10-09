import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { contentDisposition } from "@/lib/report/upload-rules";
import { getFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  if (!ID.test(id) || !ID.test(attachmentId)) return new NextResponse("Not found", { status: 404 });

  const user = await getCurrentUser().catch(() => null);
  if (!user) return new NextResponse("Sign in to download files.", { status: 401 });

  const row = await withClaims(user.id, (tx) =>
    tx.one<{ path: string; filename: string; mime: string }>("SELECT path, filename, mime FROM attachment WHERE id = $1 AND submission_id = $2", [attachmentId, id])
  );
  if (!row) return new NextResponse("Not found", { status: 404 });

  try {
    const body = await getFile(row.path);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": row.mime,
        "content-length": String(body.length),
        "content-disposition": contentDisposition(row.filename),
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("This file is no longer available.", { status: 404 });
  }
}
