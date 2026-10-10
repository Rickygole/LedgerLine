const BLOB = "https://*.public.blob.vercel-storage.com";

export function buildCsp(nonce: string, dev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${BLOB}`,
    "font-src 'self' data:",
    `connect-src 'self' ${BLOB} https://vercel.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

export function cspHeaderName(
  mode: string | undefined,
): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}
