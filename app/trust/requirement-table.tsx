"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";

export type EvidenceRow = {
  id: string;
  area: string;
  summary: string;
  route: string | null;
  state: "verified" | "failing" | "demonstrated" | "planned";
  reason: string | null;
  note: string | null;
  tests: { title: string; file: string; status: string; suite: string }[];
};

const BADGE: Record<EvidenceRow["state"], { label: string; tone: "ok" | "warn" | "info" | "neutral" }> = {
  verified: { label: "Verified by test", tone: "ok" },
  failing: { label: "Test failing", tone: "warn" },
  demonstrated: { label: "Demonstrated", tone: "info" },
  planned: { label: "Planned", tone: "neutral" },
};

export function RequirementTable({ rows, repository, commit }: { rows: EvidenceRow[]; repository: string; commit: string }) {
  const [state, setState] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!state || r.state === state) &&
          (!kind || r.id.startsWith(kind)) &&
          (!q || `${r.id} ${r.summary} ${r.area}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, state, kind, q]
  );
  return (
    <Card className="mt-6">
      <CardHeader
        title="Traceability matrix"
        description={`${filtered.length} of ${rows.length} shown`}
        actions={
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="trust-q">Search requirements</label>
            <Input id="trust-q" placeholder="Search ID or text" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-48" />
            <label className="sr-only" htmlFor="trust-kind">Type</label>
            <Select id="trust-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-48">
              <option value="">Stories and rules</option>
              <option value="US">User stories</option>
              <option value="BR">Business rules</option>
            </Select>
            <label className="sr-only" htmlFor="trust-state">Status</label>
            <Select id="trust-state" value={state} onChange={(e) => setState(e.target.value)} className="h-9 w-44">
              <option value="">All statuses</option>
              <option value="verified">Verified by test</option>
              <option value="failing">Test failing</option>
              <option value="demonstrated">Demonstrated</option>
              <option value="planned">Planned</option>
            </Select>
          </div>
        }
      />
      <Table>
        <THead>
          <tr>
            <TH className="w-24">ID</TH>
            <TH>Requirement</TH>
            <TH className="w-36">Area</TH>
            <TH className="w-40">Status</TH>
            <TH>Tests and notes</TH>
          </tr>
        </THead>
        <tbody>
          {filtered.length === 0 ? <EmptyRow colSpan={5}>No requirements match these filters.</EmptyRow> : null}
          {filtered.map((row) => (
            <TR key={row.id}>
              <TD className="font-mono text-xs">{row.id}</TD>
              <TD>
                <span className="font-medium text-ink">{row.summary}</span>
                {row.route ? <span className="block font-mono text-xs text-muted">{row.route}</span> : null}
                {row.note ? <span className="mt-1 block text-xs leading-5 text-muted">{row.note}</span> : null}
              </TD>
              <TD className="text-muted">{row.area}</TD>
              <TD>
                <Badge tone={BADGE[row.state].tone}>{BADGE[row.state].label}</Badge>
                {row.reason ? <span className="mt-1 block text-xs text-warn">{row.reason}</span> : null}
              </TD>
              <TD>
                {row.tests.length > 0 ? (
                  <ul className="space-y-1">
                    {row.tests.slice(0, 4).map((test) => (
                      <li key={`${test.file}-${test.title}`} className="text-xs">
                        <a className="text-link underline underline-offset-2 hover:text-link-hover" href={`https://github.com/${repository}/blob/${commit}/${test.file}`}>
                          {test.title}
                        </a>
                        <span className="ml-1 text-muted">({test.suite})</span>
                      </li>
                    ))}
                    {row.tests.length > 4 ? <li className="text-xs text-muted">and {row.tests.length - 4} more</li> : null}
                  </ul>
                ) : (
                  <span className="text-xs text-muted">{row.state === "planned" ? "Not an application behavior that a test asserts." : "No automated test is tagged to this requirement."}</span>
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
