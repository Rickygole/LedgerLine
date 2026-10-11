import { formatDate } from "@/lib/dates";
import type { LineageLink } from "@/lib/lifecycle/rollover";

export type Retirement = { on: string | null; reason: string | null; byName: string | null };

export function retirementText(link: Pick<LineageLink, "fiscal_year_id">, retirement?: Retirement | null): string {
  if (!retirement?.on) return `Retired at the rollover into ${link.fiscal_year_id}`;
  const by = retirement.byName ? ` by ${retirement.byName}` : "";
  const reason = retirement.reason ? ` Reason: ${retirement.reason}` : "";
  return `Retired on ${formatDate(retirement.on)}${by}.${reason}`;
}
