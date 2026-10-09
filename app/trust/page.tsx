import Link from "next/link";
import { CheckCircle2, CircleAlert, Eye, MessageSquareText, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/shell/site-footer";
import { Logo } from "@/components/shell/logo";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import evidence from "./evidence.json";
import { RequirementTable, type EvidenceRow } from "./requirement-table";

export const metadata = { title: "Requirements evidence" };

const STAKE_RULES = [
  { ids: ["BR-022"], title: "Budgets must equal the award", attempt: "Re-enable Submit in the browser or replay the request with an unbalanced budget.", result: "The server re-runs the rules and refuses. A direct status change is denied by the database." },
  { ids: ["BR-010"], title: "Organizations see only their own reports", attempt: "Open another organization's report URL, or query as Maria for another organization's rows.", result: "404 in the app, zero rows in the database, storage paths under another EIN refused." },
  { ids: ["BR-021"], title: "Required fields must be complete", attempt: "Force a submit with required answers missing.", result: "The server lists each missing field and refuses." },
  { ids: ["BR-012"], title: "Uploads are limited to 25 MB", attempt: "Upload a 31 MB file directly with Maria's session.", result: "Refused before storage accepts it, with the size stated in words." },
  { ids: ["US-057", "BR-019"], title: "History cannot be rewritten", attempt: "Update or delete an audit event or a submission revision.", result: "Permission denied for every application role, and blocked for the database owner by trigger." },
];

const STATE_META = {
  verified: { label: "Verified by test", icon: CheckCircle2, tone: "text-ok" },
  not_verified: { label: "Not verified", icon: CircleAlert, tone: "text-warn" },
  demonstrated: { label: "Demonstrated manually", icon: Eye, tone: "text-navy-700" },
  talk_track: { label: "Not built (explained)", icon: MessageSquareText, tone: "text-muted" },
} as const;

type Evidence = {
  generatedAt: string | null;
  commit: string;
  runUrl: string | null;
  repository: string;
  totals: { tests: number; passed: number; failed: number; skipped: number };
  summary: Record<keyof typeof STATE_META, { stories: number; rules: number }>;
  requirements: EvidenceRow[];
};

export default function TrustPage() {
  const data = evidence as Evidence;
  const available = Boolean(data.generatedAt);
  const commitUrl = `https://github.com/${data.repository}/commit/${data.commit}`;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="on-dark bg-navy-900">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-md">
            <Logo subtitle="Requirements evidence" />
          </Link>
          <Link href="/login" className="text-sm font-medium text-navy-100 hover:text-white">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 focus:outline-none sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Requirements evidence</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Every user story and business rule for this opportunity, mapped to the screen that delivers it and the automated tests that prove it. A requirement counts as verified only when every test tagged with its ID passed on the first try in the build shown here.
            </p>
          </div>
          {available ? (
            <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm">
              <p className="font-semibold text-ink">
                Build <a className="font-mono text-navy-700 hover:underline" href={commitUrl}>{data.commit.slice(0, 7)}</a>
              </p>
              <p className="text-muted">Generated {formatDateTime(data.generatedAt)} ET</p>
              <p className="text-muted">
                {data.totals.passed} of {data.totals.tests} tests passed
                {data.runUrl ? (
                  <>
                    {" "}
                    · <a className="text-navy-700 hover:underline" href={data.runUrl}>CI run</a>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
        </div>

        {!available ? (
          <Card>
            <CardBody>
              <p className="font-semibold text-ink">Evidence unavailable</p>
              <p className="mt-1 text-sm text-muted">No test report was attached to this build, so no requirement is shown as verified.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(Object.keys(STATE_META) as (keyof typeof STATE_META)[]).map((state) => {
                const meta = STATE_META[state];
                const Icon = meta.icon;
                return (
                  <div key={state} className="rounded-lg border border-line bg-white px-4 py-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      <Icon className={`h-4 w-4 ${meta.tone}`} aria-hidden="true" />
                      {meta.label}
                    </p>
                    <p className={`num mt-2 text-2xl font-bold ${meta.tone}`}>{data.summary[state].stories + data.summary[state].rules}</p>
                    <p className="text-xs text-muted">
                      {data.summary[state].stories} stories, {data.summary[state].rules} rules
                    </p>
                  </div>
                );
              })}
            </div>

            <Card className="mt-6">
              <CardHeader title="Five rules to try to break" description="Each one is enforced on the server and backed by a reviewed test." actions={<ShieldCheck className="h-5 w-5 text-navy-700" aria-hidden="true" />} />
              <ul className="divide-y divide-line">
                {STAKE_RULES.map((rule) => {
                  const rows = data.requirements.filter((r) => rule.ids.includes(r.id));
                  const verified = rows.length > 0 && rows.every((r) => r.state === "verified");
                  return (
                    <li key={rule.title} className="grid gap-2 px-5 py-4 md:grid-cols-[220px_1fr_1fr_140px] md:items-start">
                      <div>
                        <p className="font-mono text-xs text-muted">{rule.ids.join(" + ")}</p>
                        <p className="font-semibold text-ink">{rule.title}</p>
                      </div>
                      <p className="text-sm text-muted"><span className="font-semibold text-ink">Try: </span>{rule.attempt}</p>
                      <p className="text-sm text-muted"><span className="font-semibold text-ink">Result: </span>{rule.result}</p>
                      <p className={`text-sm font-semibold ${verified ? "text-ok" : "text-warn"}`}>{verified ? "Verified by test" : "Not verified"}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <RequirementTable rows={data.requirements} repository={data.repository} commit={data.commit} />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
