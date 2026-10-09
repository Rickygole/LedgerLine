import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspHeaderName } from "@/lib/csp";
import { GATE_COOKIE, SESSION_COOKIE, verifyGate, verifySession } from "@/lib/session";

const OPEN_PATHS = ["/gate", "/robots.txt", "/favicon.ico", "/icon.svg", "/apple-icon.png"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const header = cspHeaderName(process.env.CSP_MODE);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(header, csp);
  const next = () => withHeaders(NextResponse.next({ request: { headers: requestHeaders } }), header, csp);
  const redirect = (url: URL) => withHeaders(NextResponse.redirect(url), header, csp);

  if (OPEN_PATHS.some((p) => pathname === p) || pathname.startsWith("/_next") || pathname.startsWith("/api/cron/")) {
    return next();
  }

  const gated = await verifyGate(request.cookies.get(GATE_COOKIE)?.value);
  if (!gated) {
    if (pathname.startsWith("/api")) return withHeaders(new NextResponse("Passcode required", { status: 401 }), header, csp);
    const url = request.nextUrl.clone();
    url.pathname = "/gate";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return redirect(url);
  }

  if (pathname === "/login" || pathname === "/reset" || pathname.startsWith("/api")) return next();

  const sub = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!sub && (pathname.startsWith("/portal") || pathname.startsWith("/finance") || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return redirect(url);
  }
  return next();
}

function withHeaders(response: NextResponse, cspName: string, csp: string) {
  response.headers.set(cspName, csp);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
