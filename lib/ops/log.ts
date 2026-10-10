import { nowDate } from "@/lib/dates";


export type ErrorLogInput = {
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

export function headerValue(headers: Record<string, string | string[] | undefined> | undefined, name: string): string | null {
  const value = headers?.[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text ?? null;
}

export const REQUEST_ID_HEADER = "x-request-id";
