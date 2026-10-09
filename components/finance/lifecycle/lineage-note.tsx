import Link from "next/link";
import { GitBranch } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { lineageFor, type LineageLink } from "@/lib/lifecycle/rollover";

function phrase(kind: LineageLink["kind"]): string {
  return { renamed: " (renamed)", combined: " (combined)", carried: "", retired: "" }[kind];
}

function Item({ link }: { link: LineageLink }) {
  if (!link.other_id) return null;
  return (
    <Link href={`/finance/initiatives/${link.other_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
      {link.other_name} <span className="font-normal text-muted">({link.other_code}, {link.other_year})</span>
    </Link>
  );
}

export async function InitiativeLineage({ initiativeId }: { initiativeId: string }) {
  const user = await getCurrentUser();
  if (!user || user.role === "cbo_submitter") return null;
  const { predecessors, successors } = await withClaims(user.id, (tx) => lineageFor(tx, initiativeId));
  const retired = successors.find((s) => s.kind === "retired");
  const continued = successors.filter((s) => s.other_id);
  if (predecessors.length === 0 && continued.length === 0 && !retired) return null;
  return (
    <div className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)]" aria-label="Initiative history">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> History
      </p>
      <ul className="space-y-1">
        {predecessors.length > 0 ? (
          <li>
            Continues:{" "}
            {predecessors.map((p, index) => (
              <span key={`${p.other_id}`}>
                {index > 0 ? ", " : ""}
                <Item link={p} />
                <span className="text-muted">{phrase(p.kind)}</span>
              </span>
            ))}
          </li>
        ) : null}
        {continued.length > 0 ? (
          <li>
            Continued as:{" "}
            {continued.map((s, index) => (
              <span key={`${s.other_id}`}>
                {index > 0 ? ", " : ""}
                <Item link={s} />
                <span className="text-muted">{phrase(s.kind)}</span>
              </span>
            ))}
          </li>
        ) : null}
        {retired ? <li>Retired at the rollover into {retired.fiscal_year_id}. Its reports stay available.</li> : null}
      </ul>
    </div>
  );
}
