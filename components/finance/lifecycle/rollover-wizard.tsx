"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, Play } from "lucide-react";
import { runRollover, type RolloverState } from "@/app/finance/rollover/actions";
import { formatCurrency } from "@/lib/rules/money";
import type { PlanAction, RolloverInitiative } from "@/lib/lifecycle/rollover";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/status-badge";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { RolloverSteps } from "@/components/finance/lifecycle/rollover-steps";

type Choice = { action: PlanAction; name: string; group: string };

export type RolloverForm = { initiativeId: string; version: number; questions: number };

const ACTION_LABEL: Record<PlanAction, string> = {
  carry: "Carry forward",
  rename: "Rename",
  combine: "Combine",
  retire: "Retire",
};

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function RolloverWizard({ from, to, initiatives, forms }: { from: string; to: string; initiatives: RolloverInitiative[]; forms: RolloverForm[] }) {
  const [step, setStep] = useState<2 | 3 | 4>(2);
  const [tried, setTried] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const serverRef = useRef<HTMLDivElement>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [state, formAction, pending] = useActionState<RolloverState, FormData>(runRollover, undefined);

  useEffect(() => {
    if (state?.error) serverRef.current?.focus();
  }, [state]);

  function go(next: 2 | 3 | 4) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function nextFromPlan() {
    if (problems.length > 0) {
      setTried(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setTried(false);
    go(3);
  }

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

  const formFor = new Map(forms.map((f) => [f.initiativeId, f]));
  const formRows = eligible
    .filter((i) => {
      const c = choiceFor(i.id);
      if (c.action === "retire") return false;
      if (c.action === "combine") return grouped.get(c.group)?.[0]?.id === i.id;
      return true;
    })
    .map((i) => ({ initiative: i, choice: choiceFor(i.id), form: formFor.get(i.id) ?? null }));
  const formsCopied = formRows.filter((r) => r.form).length;
  const notable = formRows.filter((r) => r.choice.action !== "carry" || !r.form);
  const assignments = eligible.filter((i) => choiceFor(i.id).action !== "retire").reduce((sum, i) => sum + i.orgs, 0);

  if (step === 3) {
    return (
      <>
        <RolloverSteps current={3} />
        <Card>
          <CardHeader title="Forms that come along" description={`Each new initiative starts ${to} with a copy of its published report form.`} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Summary label="Forms copied" value={formsCopied} />
              <Summary label="Unchanged" value={formRows.filter((r) => r.choice.action === "carry" && r.form).length} />
              <Summary label="Renamed or combined" value={notable.filter((r) => r.choice.action !== "carry").length} />
              <Summary label="No published form" value={formRows.length - formsCopied} />
            </dl>
          </CardBody>
          {notable.length > 0 ? <FormTable rows={notable} to={to} groupNames={groupNames} grouped={grouped} /> : <p className="border-t border-line px-5 py-4 text-sm text-muted">Every form is copied unchanged. Nothing here needs a closer look.</p>}
          {formRows.length > notable.length ? (
            <details className="group border-t border-line">
              <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show all {formRows.length} forms</span>
                <span className="hidden group-open:inline">Hide the full list</span>
              </summary>
              <FormTable rows={formRows} to={to} groupNames={groupNames} grouped={grouped} />
            </details>
          ) : null}
        </Card>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => go(2)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Button>
          <Button onClick={() => go(4)}>
            Continue to confirm <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </>
    );
  }

  if (step === 4) {
    const changes = eligible.filter((i) => choiceFor(i.id).action !== "carry");
    return (
      <>
        <RolloverSteps current={4} />
        <ErrorSummary ref={serverRef} title="The rollover did not run" items={state?.error ? [{ message: state.error }] : []} />
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <Card>
            <CardHeader title="Confirm" description={`Rolling ${from} into ${to}. Everything happens in one transaction, so if any part fails nothing is saved.`} />
            <CardBody>
              <p className="mb-5 rounded-lg border border-l-4 border-line border-l-navy-800 bg-surface/60 px-4 py-3 text-[15px] text-ink">
                <span className="num font-semibold">{newInitiatives}</span> {newInitiatives === 1 ? "initiative" : "initiatives"}, {grouped.size > 0 ? "up to " : ""}
                <span className="num font-semibold">{assignments}</span> {assignments === 1 ? "assignment" : "assignments"} and <span className="num font-semibold">{formsCopied}</span> {formsCopied === 1 ? "form" : "forms"} will be copied to {to}.
              </p>
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
                          <div className="font-mono text-xs text-muted">{i.code}</div>
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
            <Button variant="secondary" onClick={() => go(3)} disabled={pending}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
            <Button type="submit" disabled={pending || problems.length > 0}>
              <Play className="h-4 w-4" aria-hidden="true" /> {pending ? `Creating ${to} records` : `Create ${to} records`}
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
      <ErrorSummary ref={summaryRef} title={problemsTitle(problems.length, "you continue")} items={tried ? problems.map((p) => ({ target: p.id || undefined, message: p.message })) : []} className="mb-0" />
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
                      <div className="font-mono text-xs text-muted">{i.code}</div>
                    </TD>
                    <TD className="whitespace-nowrap">{i.category}</TD>
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
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-lg">
        <Link href={`/finance/rollover?from=${from}&to=${to}`} className={buttonClass("secondary", "md")}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </Link>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="num font-semibold text-ink">{counts.carry}</span> carry, <span className="num font-semibold text-ink">{counts.rename}</span> rename, <span className="num font-semibold text-ink">{counts.combine}</span> combine,{" "}
            <span className="num font-semibold text-ink">{counts.retire}</span> retire
          </p>
          <Button onClick={nextFromPlan}>
            Continue to forms <ArrowRight className="h-4 w-4" aria-hidden="true" />
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

type FormRow = { initiative: RolloverInitiative; choice: Choice; form: RolloverForm | null };

function FormTable({ rows, to, groupNames, grouped }: { rows: FormRow[]; to: string; groupNames: Record<string, string>; grouped: Map<string, RolloverInitiative[]> }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Initiative in {to}</TH>
          <TH>Comes from</TH>
          <TH>Form</TH>
          <TH align="right">Questions</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map(({ initiative, choice, form }) => (
          <TR key={initiative.id}>
            <TD className="min-w-48">
              <span className="font-semibold">{choice.action === "rename" ? choice.name : choice.action === "combine" ? groupNames[choice.group]?.trim() || initiative.name : initiative.name}</span>
            </TD>
            <TD className="min-w-48 text-muted">
              {choice.action === "combine" ? `Group ${choice.group}, ${grouped.get(choice.group)?.length ?? 0} initiatives` : initiative.name}
              <span className="block font-mono text-xs">{initiative.code}</span>
            </TD>
            <TD className="whitespace-nowrap">
              {form ? (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
                  Version <span className="num">{form.version}</span>
                </span>
              ) : (
                <Badge tone="warn">No published form</Badge>
              )}
            </TD>
            <TD align="right">{form ? form.questions : <span className="text-muted">0</span>}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
