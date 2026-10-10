import { NextResponse, type NextRequest } from "next/server";
import { getHealth } from "@/lib/ops/health";
import { REQUEST_ID_HEADER } from "@/lib/ops/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const health = await getHealth();
  const requestId = request.headers.get(REQUEST_ID_HEADER);
  if (health.status !== "ok") {
    console.error(
      JSON.stringify({
        level: "error",
        event: "health_degraded",
        requestId,
        database: health.database.ok,
        migrations: health.migrations.ok,
      }),
    );
  }
  return NextResponse.json(
    { ...health, requestId },
    { status: health.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
