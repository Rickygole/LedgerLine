import { nowDate, toIsoDate } from "@/lib/dates";

export function systemToday(now: Date = nowDate()): string {
  return toIsoDate(now);
}
