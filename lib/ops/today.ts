import { toIsoDate } from "@/lib/dates";

export function systemToday(now: Date = new Date()): string {
  return toIsoDate(now);
}
