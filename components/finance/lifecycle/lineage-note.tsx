import Link from "next/link";
import { retirementText, type Retirement } from "@/lib/lifecycle/retirement";
import type { LineageLink } from "@/lib/lifecycle/rollover";

function suffix(kind: LineageLink["kind"]): string {
  return { renamed: ", renamed", combined: ", combined", carried: "", retired: "" }[kind];
}

function Code({ link }: { link: LineageLink }) {
  if (!link.other_id) return null;
  return (
    <Link
      href={`/finance/initiatives/${link.other_id}`}
      title={link.other_name ?? undefined}
      className="font-mono text-[13px] font-semibold text-link underline underline-offset-2 hover:text-link-hover"
    >
      {link.other_code}
    </Link>
  );
}

export function lineageMeta(
  {
    predecessors,
    successors,
  }: {
    predecessors: LineageLink[];
    successors: LineageLink[];
  },
  retirement?: Retirement | null,
): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  const earlier = predecessors.filter((p) => p.other_id);
  const continued = successors.filter((s) => s.other_id);
  const retired = successors.find((s) => s.kind === "retired");
  if (earlier.length > 0) {
    items.push(
      <span key="continues" className="whitespace-nowrap">
        Continues{" "}
        {earlier.map((p, index) => (
          <span key={p.other_id}>
            {index > 0 ? ", " : ""}
            {p.other_year} <Code link={p} />
            {suffix(p.kind)}
          </span>
        ))}
      </span>,
    );
  }
  if (continued.length > 0) {
    items.push(
      <span key="continued" className="whitespace-nowrap">
        {continued.map((s, index) => (
          <span key={s.other_id}>
            {index > 0 ? ", " : "Continued in "}
            {s.other_year} as <Code link={s} />
            {suffix(s.kind)}
          </span>
        ))}
      </span>,
    );
  }
  if (retired) items.push(<span key="retired">{retirementText(retired, retirement)}</span>);
  return items;
}
