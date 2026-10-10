import "server-only";
import { headers } from "next/headers";
import { REQUEST_ID_HEADER } from "./log";

export async function currentRequestId(): Promise<string | null> {
  try {
    return (await headers()).get(REQUEST_ID_HEADER);
  } catch {
    return null;
  }
}
