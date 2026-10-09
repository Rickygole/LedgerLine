"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { runRollover, type RolloverState } from "@/app/finance/rollover/actions";
import { formatCurrency } from "@/lib/rules/money";
import type { PlanAction, RolloverInitiative } from "@/lib/lifecycle/rollover";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/status-badge";
import { ErrorSummary } from "@/components/finance/admin/error-summary";
import { RolloverSteps } from "@/components/finance/lifecycle/rollover-steps";

type Choice = { action: PlanAction; name: string; group: string };

const ACTION_LABEL: Record<PlanAction, string> = {
  carry: "Carry forward",
  rename: "Rename",
  combine: "Combine",
  retire: "Retire",
};

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function RolloverWizard({ from, to, initiatives }: { from: string; to: string; initiatives: RolloverInitiative[] }) {
  const [step, setStep] = useState<2 | 3>(2);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [state, formAction, pending] = useActionState<RolloverState, FormData>(runRollover, undefined);

  const eligible = useMemo(() => initiatives.filter((i) => !i.alreadyRolled), [initiatives]);
  const choiceFor = (id: string): Choice => choices[id] ?? { action: "carry", name: "", group: "A" };
  const update = (id: string, patch: Partial<Choice>) => setChoices((prev) => ({ ...prev, [id]: { ...choiceFor(id), ...patch } }));

  const visible = initiatives.filter((i) => {
    const text = `${i.code} ${i.name} ${i.category}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter && choiceFor(i.id).action !== filter) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, RolloverInitiative[]>();
    for (const i of eligible) {
      const c = choices[i.id];
      if (c?.action === "combine") map.set(c.group, [...(map.get(c.group) ?? []), i]);
    }
    return map;
  }, [eligible, choices]);

  const counts = { carry: 0, rename: 0, combine: 0, retire: 0 };
  let carriedFunding = 0;
  for (const i of eligible) {
    const c = choiceFor(i.id);
    counts[c.action] += 1;
    if (c.action !== "retire") carriedFunding += i.funding;
  }
  const newInitiatives = counts.carry + counts.rename + grouped.size;

  const problems: { id: string; message: string }[] = [];
  for (const i of eligible) {
    const c = choiceFor(i.id);
    if (c.action === "rename" && !c.name.trim()) problems.push({ id: `name-${i.id}`, message: `Enter a new name for ${i.name}.` });
  }
  for (const [group, members] of grouped) {
    if (members.length < 2) problems.push({ id: "", message: `Group ${group} needs at least two initiatives to combine.` });
  }
  if (eligible.length === 0) problems.push({ id: "", message: "Every initiative in this year has already been rolled over." });

  const plan = eligible.map((i) => {
    const c = choiceFor(i.id);
    const entry: Record<string, string> = { initiative_id: i.id, action: c.action };
    if (c.action === "rename") entry.new_name = c.name.trim();
    if (c.action === "combine") {
      entry.group = c.group;
      const name = (groupNames[c.group] ?? "").trim();
      if (name) entry.new_name = name;
    }
    return entry;
  });

  if (step === 3) {
    const changes = eligible.filter((i) => choiceFor(i.id).action !== "carry");
    return (
      <>
        <RolloverSteps current={3} />
        {state?.error ? <ErrorSummary errors={[{ id: "", message: state.error }]} heading="The rollover did not run" /> : null}
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <Card>
            <CardHeader title="Review" description={`Rolling ${from} into ${to}. Everything happens in one transaction: if any part fails, nothing is saved.`} />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Summary label="Carried forward" value={counts.carry} />
                <Summary label="Renamed" value={counts.rename} />
                <Summary label="Combined into" value={`${grouped.size} (from ${eligible.filter((i) => choiceFor(i.id).action === "combine").length})`} />
                <Summary label="Retired" value={counts.retire} />
                <Summary label="New initiatives" value={newInitiatives} />
              </dl>
              <p className="mt-4 text-sm text-muted">
                Funding moving into {to}: <span className="num font-semibold text-ink">{formatCurrency(carriedFunding)}</span>. Funded organizations, awards and published report forms are copied. New codes follow the pattern CI-{to.slice(2)}-001.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Changes from the default" description={changes.length === 0 ? "Every initiative will be carried forward unchanged." : `${changes.length} initiatives are not simply carried forward.`} />
            {changes.length > 0 ? (
              <Table>
                <THead>
                  <tr>
                    <TH>Initiative</TH>
                    <TH>Action</TH>
                    <TH>Detail</TH>
                  </tr>
                </THead>
                <tbody>
                  {changes.map((i) => {
                    const c = choiceFor(i.id);
                    return (
                      <TR key={i.id}>
                        <TD>
                          <span className="font-semibold">{i.name}</span>
                          <div className="text-xs text-muted">{i.code}</div>
                        </TD>
                        <TD>{ACTION_LABEL[c.action]}</TD>
                        <TD>
                          {c.action === "rename" ? `New name: ${c.name}` : null}
                          {c.action === "combine" ? `Group ${c.group}: ${groupNames[c.group]?.trim() || "named after the first initiative"}` : null}
                          {c.action === "retire" ? "No successor. Stays in the history." : null}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            ) : null}
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} disabled={pending}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the plan
            </Button>
            <Button type="submit" disabled={pending || problems.length > 0}>
              <Play className="h-4 w-4" aria-hidden="true" /> {pending ? "Running rollover" : `Run rollover into ${to}`}
            </Button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <RolloverSteps current={2} />
      <div className="space-y-6">
      <ErrorSummary errors={problems.filter((p) => p.message !== "")} heading="Resolve these before reviewing" />
      <Card>
        <CardHeader
          title="Initiatives"
          description={`${eligible.length} initiatives to plan. Carry forward keeps the name, funded organizations and the published form.`}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setChoices({})}>
                Carry all
              </Button>
            </>
          }
        />
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="plan-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Search
            </label>
            <Input id="plan-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code, name or category" />
          </div>
          <div>
            <label htmlFor="plan-filter" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Show action
            </label>
            <Select id="plan-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All actions</option>
              {(Object.keys(ACTION_LABEL) as PlanAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Initiative</TH>
              <TH>Category</TH>
              <TH align="right">Organizations</TH>
              <TH align="right">Funding</TH>
              <TH>Action</TH>
              <TH>Detail</TH>
            </tr>
          </THead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={6}>No initiatives match.</EmptyRow>
            ) : (
              visible.map((i) => {
                const c = choiceFor(i.id);
                return (
                  <TR key={i.id}>
                    <TD>
                      <span className="font-semibold">{i.name}</span>
                      <div className="text-xs text-muted">{i.code}</div>
                    </TD>
                    <TD>{i.category}</TD>
                    <TD align="right">{i.orgs}</TD>
                    <TD align="right">{formatCurrency(i.funding)}</TD>
                    <TD>
                      {i.alreadyRolled ? (
                        <Badge>Already rolled over</Badge>
                      ) : (
                        <Select aria-label={`Action for ${i.name}`} value={c.action} onChange={(e) => update(i.id, { action: e.target.value as PlanAction })} className="w-40">
                          {(Object.keys(ACTION_LABEL) as PlanAction[]).map((a) => (
                            <option key={a} value={a}>
                              {ACTION_LABEL[a]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </TD>
                    <TD>
                      {c.action === "rename" && !i.alreadyRolled ? (
                        <Input id={`name-${i.id}`} aria-label={`New name for ${i.name}`} value={c.name} onChange={(e) => update(i.id, { name: e.target.value })} placeholder="New name" className="min-w-56" />
                      ) : null}
                      {c.action === "combine" && !i.alreadyRolled ? (
                        <Select aria-label={`Group for ${i.name}`} value={c.group} onChange={(e) => update(i.id, { group: e.target.value })} className="w-32">
                          {GROUPS.map((g) => (
                            <option key={g} value={g}>
                              Group {g}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                      {c.action === "retire" && !i.alreadyRolled ? <span className="text-sm text-muted">No successor</span> : null}
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
      {grouped.size > 0 ? (
        <Card>
          <CardHeader title="Combined initiatives" description="Each group becomes one new initiative. Awards are summed per organization, and the form comes from the first initiative in the group." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            {[...grouped.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([group, members]) => (
                <div key={group} className="rounded-md border border-line p-3">
                  <label htmlFor={`group-${group}`} className="text-sm font-semibold">
                    Group {group} name
                  </label>
                  <Input id={`group-${group}`} value={groupNames[group] ?? ""} onChange={(e) => setGroupNames((prev) => ({ ...prev, [group]: e.target.value }))} placeholder={members[0]?.name} className="mt-1" />
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                    {members.map((m) => (
                      <li key={m.id}>{m.name}</li>
                    ))}
                  </ul>
                  {members.length < 2 ? <p className="mt-2 text-sm font-semibold text-bad">Add at least one more initiative to this group.</p> : null}
                </div>
              ))}
          </CardBody>
        </Card>
      ) : null}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <Link href={`/finance/rollover?from=${from}&to=${to}`} className="text-sm font-semibold text-navy-800 hover:underline">
          Back to choose years
        </Link>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="num font-semibold text-ink">{counts.carry}</span> carry, <span className="num font-semibold text-ink">{counts.rename}</span> rename, <span className="num font-semibold text-ink">{counts.combine}</span> combine,{" "}
            <span className="num font-semibold text-ink">{counts.retire}</span> retire
          </p>
          <Button onClick={() => setStep(3)} disabled={problems.length > 0}>
            Review <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num mt-1 text-xl font-bold text-ink">{value}</dd>
    </div>
  );
}
