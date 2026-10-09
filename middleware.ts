import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, SESSION_COOKIE, verifyGate, verifySession } from "@/lib/session";

const OPEN_PATHS = ["/gate", "/robots.txt", "/favicon.ico"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.some((p) => pathname === p) || pathname.startsWith("/_next")) {
    return withHeaders(NextResponse.next());
  }

  const gated = await verifyGate(request.cookies.get(GATE_COOKIE)?.value);
  if (!gated) {
    if (pathname.startsWith("/api")) return withHeaders(new NextResponse("Passcode required", { status: 401 }));
    const url = request.nextUrl.clone();
    url.pathname = "/gate";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return withHeaders(NextResponse.redirect(url));
  }

  if (pathname === "/login" || pathname.startsWith("/api")) return withHeaders(NextResponse.next());

  const sub = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!sub && (pathname.startsWith("/portal") || pathname.startsWith("/finance") || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return withHeaders(NextResponse.redirect(url));
  }
  return withHeaders(NextResponse.next());
}

function withHeaders(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
