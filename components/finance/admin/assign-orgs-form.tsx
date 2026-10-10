"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { assignOrganizations } from "@/app/finance/initiatives/new/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { ErrorSummary } from "@/components/finance/admin/error-summary";
import { AGENCIES } from "@/lib/domain";

type Org = { id: string; name: string; ein: string; borough: string };
type Row = { orgId: string; amount: string; agency: string };

export function AssignOrgsForm({ initiativeId, orgs }: { initiativeId: string; orgs: Org[] }) {
  const [state, action, pending] = useActionState(assignOrganizations, undefined);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const matches = useMemo(() => {
    const chosen = new Set(rows.map((r) => r.orgId));
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return orgs.filter((o) => !chosen.has(o.id) && (o.name.toLowerCase().includes(q) || o.ein.includes(q))).slice(0, 8);
  }, [orgs, query, rows]);
  const fe = state?.fieldErrors ?? {};
  const summary = [...(state?.error ? [{ id: "", message: state.error }] : []), ...Object.entries(fe).map(([key, message]) => ({ id: key, message }))];
  const total = rows.reduce((sum, r) => sum + (Number(r.amount.replace(/[$,\s]/g, "")) || 0), 0);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <ErrorSummary errors={summary} />
      <div className="max-w-xl">
        <Label htmlFor="org-search">Find an organization</Label>
        <Input id="org-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or EIN" autoComplete="off" aria-controls="org-matches" />
        <ul id="org-matches" aria-label="Matching organizations" className="mt-2 divide-y divide-line rounded-md border border-line bg-white empty:hidden">
          {matches.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{o.name}</span>
                <span className="ml-2 whitespace-nowrap font-mono text-[13px] text-muted">{o.ein}</span>
                <span className="ml-2 text-muted">{o.borough}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Add ${o.name}`}
                onClick={() => {
                  setRows((r) => [...r, { orgId: o.id, amount: "", agency: "" }]);
                  setQuery("");
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </Button>
            </li>
          ))}
        </ul>
        {query.trim() && matches.length === 0 ? <p className="mt-2 text-sm text-muted">No unassigned organization matches that search.</p> : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-line">
        <Table>
          <THead>
            <tr>
              <TH>Organization</TH>
              <TH>Award amount</TH>
              <TH>Sponsoring agency</TH>
              <TH>
                <span className="sr-only">Remove</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={4}>No organizations added yet. Search above and choose Add.</EmptyRow>
            ) : (
              rows.map((row, index) => {
                const org = byId.get(row.orgId)!;
                const error = fe[`amount-${index}`];
                return (
                  <TR key={row.orgId}>
                    <TD>
                      <input type="hidden" name="orgId" value={row.orgId} />
                      <span className="font-semibold">{org.name}</span>
                      <div className="whitespace-nowrap font-mono text-[13px] text-muted">{org.ein}</div>
                    </TD>
                    <TD>
                      <Label htmlFor={`amount-${index}`} className="sr-only">
                        Award amount for {org.name}
                      </Label>
                      <Input
                        id={`amount-${index}`}
                        name="amount"
                        inputMode="decimal"
                        placeholder="50,000"
                        value={row.amount}
                        className="num w-40 text-right"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `amount-${index}-error` : undefined}
                        onChange={(e) => setRows((all) => all.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))}
                      />
                      <FieldError id={`amount-${index}-error`}>{error}</FieldError>
                    </TD>
                    <TD>
                      <Label htmlFor={`agency-${index}`} className="sr-only">
                        Administering agency for {org.name}
                      </Label>
                      <Select id={`agency-${index}`} name="agency" value={row.agency} className="w-40" onChange={(e) => setRows((all) => all.map((r, i) => (i === index ? { ...r, agency: e.target.value } : r)))}>
                        <option value="">Initiative default</option>
                        {AGENCIES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </Select>
                    </TD>
                    <TD align="right">
                      <Button variant="ghost" size="sm" aria-label={`Remove ${org.name}`} onClick={() => setRows((all) => all.filter((_, i) => i !== index))}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Total funding after saving: <span className="num font-semibold text-ink">{total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
        </p>
        <Button type="submit" disabled={pending || rows.length === 0}>
          {pending ? "Saving" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}
