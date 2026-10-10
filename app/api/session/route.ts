import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/ops/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store" };

export async function GET() {
  try {
    const user = await getCurrentUser();
    const signedIn = user?.role === "cbo_submitter";
    return NextResponse.json({ signedIn }, { status: signedIn ? 200 : 401, headers: HEADERS });
  } catch (error) {
    await logError("session_probe_failed", error);
    return NextResponse.json({ signedIn: null }, { status: 503, headers: HEADERS });
  }
}
