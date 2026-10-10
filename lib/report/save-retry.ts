import type { SaveResult } from "./types";

export function shouldRetrySave(result: SaveResult): boolean {
  if (result.status === "signed_out") return true;
  if (result.status === "error") return result.retryable !== false;
  return false;
}
