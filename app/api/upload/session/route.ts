import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const userId = await verifySession(store.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ signedIn: Boolean(userId) }, { status: userId ? 200 : 401, headers: { "cache-control": "no-store" } });
}
