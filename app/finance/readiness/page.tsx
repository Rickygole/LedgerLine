import type { Metadata } from "next";
import { requireUser, roleLabel, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { loadReadiness, requiredModules } from "@/lib/ops/readiness";
import { systemToday } from "@/lib/ops/today";
import { ActionForm } from "@/components/ops/action-form";
import { fixUatDefect, recordTraining, recordUatSession } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Go-live readiness" };

const RESULT_TONE = { passed: "ok", failed: "bad", blocked: "warn" } as const;

export default async function ReadinessPage() {
  const admin = await requireUser(["finance_admin"]);
  const data = await withClaims(admin.id, (tx) => loadReadiness(tx));
  const today = systemToday();
  const pct = (value: number | null) => (value === null ? "None yet" : `${value}%`);
  const doneBy = new Map<string, Map<string, string>>();
  for (const record of data.records) {
    const map = doneBy.get(record.user_id) ?? new Map<string, string>();
    map.set(record.module_key, record.completed_on);
    doneBy.set(record.user_id, map);
  }
  const upcoming = data.schedule.filter((s) => s.scheduled_on >= today);
  const defectsBySession = new Map<string, typeof data.defects>();
  for (const defect of data.defects)
    defectsBySession.set(defect.session_id, [...(defectsBySession.get(defect.session_id) ?? []), defect]);

  return (
    <>
      <PageHeader
        title="Go-live readiness"
        description="Test sessions and training records for Council Finance staff ahead of the February 1, 2027 target. The formal test window runs January 4 to 15, 2027 and training runs January 11 to 22, 2027. Sessions that have not happened yet are listed under Scheduled sessions."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Go-live readiness" }]}
      />
      <ul className="mb-6 list-disc space-y-1 pl-5 text-sm">
        <li>
          Finance users trained: <span className="font-bold">{pct(data.training.percent)}</span> (
          {data.training.trained} of {data.training.users} have finished every module for their role).
        </li>
        <li>
          Test scenarios passing: <span className="font-bold">{pct(data.uat.percent)}</span> ({data.uat.passed} of{" "}
          {data.uat.scenarios}, using the latest session of each).
        </li>
        <li>
          Open defects: <span className="font-bold">{data.openDefects}</span>. Test sessions held:{" "}
          {data.sessions.length}.
        </li>
      </ul>

      <Card className="mb-6">
        <CardHeader
          title="Scheduled sessions"
          description="Test sessions and training that are planned and have not been held yet."
        />
        <Table density="compact">
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Type</TH>
              <TH>What it covers</TH>
              <TH>Who attends</TH>
            </tr>
          </THead>
          <tbody>
            {upcoming.length === 0 ? (
              <EmptyRow colSpan={4}>No sessions are scheduled.</EmptyRow>
            ) : (
              upcoming.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap">{formatDate(s.scheduled_on)}</TD>
                  <TD>
                    <Badge tone="info">{s.kind === "test" ? "Test session" : "Training"}</Badge>
                  </TD>
                  <TD className="font-semibold">{s.title}</TD>
                  <TD className="text-muted">{s.audience}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Test sessions"
          description="One row per scenario run by one tester. The pass rate uses the most recent session of each scenario."
        />
        <Table density="compact">
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Scenario</TH>
              <TH>Tester</TH>
              <TH>Result</TH>
              <TH>Defects</TH>
            </tr>
          </THead>
          <tbody>
            {data.sessions.length === 0 ? (
              <EmptyRow colSpan={5}>No test sessions have been held yet.</EmptyRow>
            ) : (
              data.sessions.map((s) => (
                <TR key={s.id} className="align-top">
                  <TD className="whitespace-nowrap">{formatDate(s.session_on)}</TD>
                  <TD>
                    <div className="font-semibold">{s.scenario}</div>
                    {s.notes ? <div className="text-xs text-muted">{s.notes}</div> : null}
                  </TD>
                  <TD>
                    <div>{s.tester_name}</div>
                    <div className="text-xs text-muted">{s.tester_role}</div>
                  </TD>
                  <TD>
                    <Badge tone={RESULT_TONE[s.result as keyof typeof RESULT_TONE]}>
                      {s.result[0].toUpperCase() + s.result.slice(1)}
                    </Badge>
                  </TD>
                  <TD>
                    {(defectsBySession.get(s.id) ?? []).length === 0 ? (
                      <span className="text-muted">None</span>
                    ) : (
                      <ul className="space-y-2">
                        {(defectsBySession.get(s.id) ?? []).map((d) => (
                          <li key={d.id} className="text-sm">
                            <div>
                              {d.description} <span className="text-muted">({d.severity})</span>
                            </div>
                            {d.status === "fixed" ? (
                              <Badge tone="ok">Fixed {formatDate(d.fixed_on)}</Badge>
                            ) : (
                              <ActionForm
                                action={fixUatDefect}
                                hidden={{ defectId: d.id, fixedOn: today }}
                                submitLabel="Mark fixed"
                                variant="secondary"
                                size="sm"
                                resetOnSuccess={false}
                                className="space-y-1"
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <CardBody className="border-t border-line">
          <h3 className="mb-3 text-base font-bold">Record a test session</h3>
          <ActionForm action={recordUatSession} submitLabel="Record session" pendingLabel="Recording">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="scenario">Scenario</Label>
                <Input id="scenario" aria-required="true" name="scenario" maxLength={160} />
              </div>
              <div>
                <Label htmlFor="sessionOn">Session date</Label>
                <Input id="sessionOn" aria-required="true" name="sessionOn" type="date" defaultValue={today} />
              </div>
              <div>
                <Label htmlFor="tester">Tester</Label>
                <Input id="tester" aria-required="true" name="tester" maxLength={120} />
              </div>
              <div>
                <Label htmlFor="testerRole">Tester role or team</Label>
                <Input id="testerRole" aria-required="true" name="testerRole" maxLength={120} />
              </div>
              <div>
                <Label htmlFor="result">Result</Label>
                <Select id="result" aria-required="true" name="result" defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="blocked">Blocked</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="severity">Defect severity</Label>
                <Select id="severity" name="severity" defaultValue="minor">
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="defects" optional>
                  Defects found, one per line
                </Label>
                <Textarea id="defects" name="defects" rows={3} maxLength={4000} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="notes" optional>
                  Notes
                </Label>
                <Textarea id="notes" name="notes" rows={2} maxLength={2000} />
              </div>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Training"
          description="Each Finance user completes the modules for their role. Someone counts as trained when every required module is recorded."
        />
        <Table density="compact">
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Role</TH>
              <TH>Modules finished</TH>
              <TH>Still to do</TH>
            </tr>
          </THead>
          <tbody>
            {data.users.map((user) => {
              const required = requiredModules(data.modules, user.role);
              const done = doneBy.get(user.id) ?? new Map<string, string>();
              const missing = required.filter((m) => !done.has(m.key));
              return (
                <TR key={user.id} className="align-top">
                  <TD className="font-semibold">{user.full_name}</TD>
                  <TD className="whitespace-nowrap">{roleLabel(user.role as Role)}</TD>
                  <TD>
                    {required.length - missing.length} of {required.length}
                  </TD>
                  <TD>
                    {missing.length === 0 ? (
                      <Badge tone="ok">Trained</Badge>
                    ) : (
                      <span className="text-muted">{missing.map((m) => m.title).join(", ")}</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
        <CardBody className="border-t border-line">
          <h3 className="mb-3 text-base font-bold">Record training</h3>
          <ActionForm action={recordTraining} submitLabel="Record training" pendingLabel="Recording">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="userId">Person</Label>
                <Select id="userId" aria-required="true" name="userId" defaultValue="">
                  <option value="" disabled>
                    Choose a person
                  </option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="module">Module</Label>
                <Select id="module" aria-required="true" name="module" defaultValue="">
                  <option value="" disabled>
                    Choose a module
                  </option>
                  {data.modules.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="completedOn">Completed on</Label>
                <Input id="completedOn" aria-required="true" name="completedOn" type="date" defaultValue={today} />
              </div>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
