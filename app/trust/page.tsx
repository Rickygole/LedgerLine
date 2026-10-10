import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, ClipboardList, Eye, ShieldCheck, Wrench } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/status-badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import evidence from "./evidence.json";
import { RequirementTable, type EvidenceRow } from "./requirement-table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Requirements traceability" };

type State = EvidenceRow["state"];

const LEGEND: { state: State; label: string; icon: typeof CheckCircle2; tone: string; text: string }[] = [
  {
    state: "verified",
    label: "Verified by test",
    icon: CheckCircle2,
    tone: "text-ok",
    text: "At least one automated test tagged with the requirement ID asserts the behavior, and every tagged test passed in this run on its first attempt.",
  },
  {
    state: "supporting",
    label: "Supporting tool built",
    icon: Wrench,
    tone: "text-navy-700",
    text: "The commitment itself is delivered under contract, such as support, breach notification or the testing and training periods. The tool it relies on is built here and every tagged test passed, but those tests do not prove the commitment.",
  },
  {
    state: "demonstrated",
    label: "Demonstrated",
    icon: Eye,
    tone: "text-navy-700",
    text: "Implemented and available in the application. Checked by walkthrough. No automated test is tagged to it yet.",
  },
  {
    state: "planned",
    label: "Planned",
    icon: ClipboardList,
    tone: "text-muted",
    text: "A delivery or hosting commitment with no supporting tool in this application, or work not yet built. It is not an application behavior that a test can assert.",
  },
  {
    state: "failing",
    label: "Test failing",
    icon: CircleAlert,
    tone: "text-warn",
    text: "A tagged test failed, was skipped or passed only on retry in this run. The requirement is not counted as verified.",
  },
];

const CONTROLS = [
  {
    ids: ["BR-022"],
    title: "Budgets must equal the award",
    attempt:
      "Submit a budget that does not equal the award, or change a report's status with a direct database update.",
    result:
      "The server re-checks every rule at submit and refuses an unbalanced budget, stating the amount over or under. Separately, the database refuses any status change made outside the workflow function. The balance rule is enforced a second time inside the database: the workflow function that files a report refuses an unbalanced submit even when the application is bypassed.",
  },
  {
    ids: ["BR-010"],
    title: "Organizations see only their own reports",
    attempt: "Open another organization's report by its address, or query the database as one organization's user.",
    result:
      "The application returns not found. Row-level security returns no rows from other organizations, and storage paths under another organization's EIN are refused.",
  },
  {
    ids: ["BR-021"],
    title: "Required answers must be complete",
    attempt: "Submit a report with required answers missing.",
    result: "The server lists each missing answer and does not submit the report.",
  },
  {
    ids: ["BR-012"],
    title: "Uploads are limited to 25 MB",
    attempt: "Add a file larger than 25 MB.",
    result:
      "The browser refuses it before sending and states the size and the limit. The server-side upload check used by both upload paths applies the same limit.",
  },
  {
    ids: ["US-057", "BR-019"],
    title: "History cannot be rewritten",
    attempt: "Update or delete an audit event or a submitted revision.",
    result:
      "The application role has no permission to do so. A trigger also rejects update, delete and truncate for every role, including the table owner, while the trigger is enabled. The table owner can still disable or drop the trigger with an explicit schema change; the application role cannot.",
  },
];

type Evidence = {
  generatedAt: string | null;
  commit: string;
  origin: "ci" | "local";
  uncommittedChanges: boolean;
  runUrl: string | null;
  repository: string;
  totals: { tests: number; passed: number; failed: number; skipped: number };
  suites: { unit: number; sql: number; eval: number; e2e: number };
  summary: Partial<Record<State, { stories: number; rules: number }>>;
  requirements: EvidenceRow[];
};

export default async function TraceabilityPage() {
  const user = await requireUser(["finance_admin"]);
  const data = evidence as unknown as Evidence;
  const stories = data.requirements.filter((r) => r.id.startsWith("US-")).length;
  const rules = data.requirements.filter((r) => r.id.startsWith("BR-")).length;
  const total = (state: State) => {
    const counts = data.summary[state];
    return counts ? counts.stories + counts.rules : 0;
  };

  return (
    <AppShell user={user}>
      <PageHeader
        title="Requirements traceability"
        description="Every user story and business rule, mapped to the screen that delivers it and to the automated tests that check it. Results come from the test run identified below."
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Platform and delivery", href: "/finance/platform" },
          { label: "Requirements traceability" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title="Test run" description="Where these results came from." />
          <CardBody>
            <DescriptionList
              columns={1}
              items={[
                { label: "Build", value: <span className="font-mono">{data.commit.slice(0, 7)}</span> },
                {
                  label: "Generated",
                  value: data.generatedAt ? `${formatDateTime(data.generatedAt)} ET` : "Not available",
                },
                {
                  label: "Source",
                  value: data.runUrl ? (
                    <a className="text-link underline underline-offset-2 hover:text-link-hover" href={data.runUrl}>
                      Continuous integration run
                    </a>
                  ) : (
                    <span>
                      Local run{data.uncommittedChanges ? " with uncommitted changes" : ""}. Not produced by continuous
                      integration.
                    </span>
                  ),
                },
                {
                  label: "Tests",
                  value: (
                    <span className="num">
                      {data.totals.passed} of {data.totals.tests} passed
                      <span className="block text-xs text-muted">
                        {data.suites.unit} unit, {data.suites.sql} database, {data.suites.eval} evaluation,{" "}
                        {data.suites.e2e} browser
                      </span>
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How to read the status"
            description="Statuses are assigned from the test report when it is generated. They are not set by hand."
          />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {LEGEND.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.state}>
                    <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Icon className={`h-4 w-4 ${item.tone}`} aria-hidden="true" />
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-muted">{item.text}</dd>
                  </div>
                );
              })}
            </dl>
          </CardBody>
        </Card>
      </div>

      <p className="num mt-6 text-sm font-semibold text-ink">
        {total("verified")} verified by test, {total("supporting")} supporting tools built, {total("planned")} delivery
        commitments
        {total("demonstrated") > 0 ? `, ${total("demonstrated")} demonstrated` : ""}
        {total("failing") > 0 ? `, ${total("failing")} failing` : ""}.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {LEGEND.map((item) => {
          const Icon = item.icon;
          const counts = data.summary[item.state] ?? { stories: 0, rules: 0 };
          return (
            <div key={item.state} className="rounded-xl border border-line bg-white px-4 py-4 shadow-card">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                <Icon className={`h-4 w-4 ${item.tone}`} aria-hidden="true" />
                {item.label}
              </p>
              <p className={`num mt-2 text-2xl font-bold ${item.tone}`}>{counts.stories + counts.rules}</p>
              <p className="text-xs text-muted">
                {counts.stories} of {stories} stories, {counts.rules} of {rules} rules
              </p>
            </div>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Controls tested by attack"
          description={
            <>
              Five rules, the attempt made against each and what refused it. Run{" "}
              <span className="font-mono text-[13px]">pnpm break BR-022</span> or another rule ID to repeat an attempt
              against a local copy.
            </>
          }
          actions={<ShieldCheck className="h-5 w-5 text-navy-700" aria-hidden="true" />}
        />
        <ul className="divide-y divide-line">
          {CONTROLS.map((control) => {
            const rows = data.requirements.filter((r) => control.ids.includes(r.id));
            const verified = rows.length > 0 && rows.every((r) => r.state === "verified");
            return (
              <li
                key={control.title}
                className="grid gap-3 px-5 py-4 md:grid-cols-[220px_1fr_1fr_150px] md:items-start"
              >
                <div>
                  <p className="font-mono text-xs text-muted">{control.ids.join(" and ")}</p>
                  <p className="font-semibold text-ink">{control.title}</p>
                </div>
                <p className="text-sm leading-6 text-muted">
                  <span className="font-semibold text-ink">Attempt. </span>
                  {control.attempt}
                </p>
                <p className="text-sm leading-6 text-muted">
                  <span className="font-semibold text-ink">Outcome. </span>
                  {control.result}
                </p>
                <div>
                  <Badge tone={verified ? "ok" : "warn"}>{verified ? "Verified by test" : "Not fully verified"}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <RequirementTable rows={data.requirements} repository={data.repository} commit={data.commit} />
    </AppShell>
  );
}
