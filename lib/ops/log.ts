import { nowDate } from "@/lib/dates";

type ErrorLogInput = {
  requestId: string | null;
  digest: string | null;
  method: string;
  path: string;
  route: string | null;
  routeType: string | null;
  message: string;
};

export function formatErrorLog(input: ErrorLogInput, at: Date = nowDate()): string {
  return JSON.stringify({
    level: "error",
    event: "request_error",
    at: at.toISOString(),
    requestId: input.requestId,
    digest: input.digest,
    method: input.method,
    path: input.path.split("?")[0],
    route: input.route,
    routeType: input.routeType,
    message: input.message.slice(0, 500),
  });
}

export function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  const value = headers?.[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text ?? null;
}

export const REQUEST_ID_HEADER = "x-request-id";

export function formatActionErrorLog(
  event: string,
  error: unknown,
  requestId: string | null,
  at: Date = nowDate(),
): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : null;
  return JSON.stringify({
    level: "error",
    event,
    at: at.toISOString(),
    requestId,
    code,
    message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
  });
}

export async function logError(event: string, error: unknown): Promise<void> {
  let requestId: string | null = null;
  try {
    const { headers } = await import("next/headers");
    requestId = (await headers()).get(REQUEST_ID_HEADER);
  } catch {
    requestId = null;
  }
  console.error(formatActionErrorLog(event, error, requestId));
}
