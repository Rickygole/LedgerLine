import { daysPastDue } from "@/lib/dates";
import type { OrgAward } from "@/lib/finance/admin/organizations";

type Worst = { label: string; color: string; rank: number };

const STATES: Record<string, Worst> = {
  missing: { label: "Missing", color: "#b42318", rank: 6 },
  returned: { label: "Update requested", color: "#c98a0b", rank: 5 },
  submitted: { label: "Submitted", color: "#6cb4ee", rank: 4 },
  under_review: { label: "In review", color: "#1f4e85", rank: 3 },
  accepted: { label: "Accepted", color: "#1a7f37", rank: 2 },
  upcoming: { label: "Not yet due", color: "#d5dae1", rank: 1 },
};

function stateOf(status: string | null, dueOn: string): Worst {
  if (status === null || status === "draft") return daysPastDue(dueOn) > 0 ? STATES.missing : STATES.upcoming;
  return STATES[status] ?? STATES.upcoming;
}

export function ReportingRecord({ awards }: { awards: OrgAward[] }) {
  const periods = new Map<string, { label: string; dueOn: string; worst: Worst; count: number }>();
  for (const award of awards) {
    for (const p of award.periods ?? []) {
      const state = stateOf(p.status, p.due_on);
      const current = periods.get(p.id);
      if (!current) periods.set(p.id, { label: p.label, dueOn: p.due_on, worst: state, count: 1 });
      else {
        current.count += 1;
        if (state.rank > current.worst.rank) current.worst = state;
      }
    }
  }
  const list = [...periods.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  if (list.length === 0) return null;
  return (
    <div className="border-b border-line px-5 py-4 sm:px-6">
      <h3 className="text-sm font-semibold text-[#3d4757]">Reporting record, worst status in each period</h3>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
        {list.map((p) => (
          <li key={p.label} className="flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-block h-6 w-6 rounded-sm border border-black/10" style={{ background: p.worst.color }} />
            <span className="text-[13px] leading-4">
              <span className="block font-semibold text-ink">{p.label}</span>
              <span className="text-[#3d4757]">
                {p.worst.label}
                <span className="text-muted">
                  {" "}
                  · {p.count} {p.count === 1 ? "report" : "reports"}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
