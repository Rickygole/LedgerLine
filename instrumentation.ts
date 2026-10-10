export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { formatErrorLog, headerValue, REQUEST_ID_HEADER } = await import("@/lib/ops/log");
  const err = error as { digest?: string; message?: string };
  console.error(
    formatErrorLog({
      requestId: headerValue(request.headers, REQUEST_ID_HEADER),
      digest: err?.digest ?? null,
      method: request.method,
      path: request.path,
      route: context?.routePath ?? null,
      routeType: context?.routeType ?? null,
      message: err?.message ?? String(error),
    }),
  );
}
