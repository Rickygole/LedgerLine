import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const signedIn = user?.role === "cbo_submitter";
  return NextResponse.json({ signedIn }, { status: signedIn ? 200 : 401, headers: { "cache-control": "no-store" } });
}
