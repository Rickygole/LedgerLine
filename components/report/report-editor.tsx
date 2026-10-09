"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, LogOut, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitReport } from "@/app/portal/reports/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldError, Hint, Input, Label } from "@/components/ui/field";
import { formatTime } from "@/lib/dates";
import { amountIssues, linesFromRows, rowsFromLines, type BudgetRow } from "@/lib/report/budget-rows";
import { fieldTargetId, issuesBySection, reportIssues } from "@/lib/report/issues";
import type { AttachmentItem, EditorPayload } from "@/lib/report/types";
import { useAutosave } from "@/lib/report/use-autosave";
import type { AnswerValue, Answers, Issue } from "@/lib/rules/types";
import { CERTIFICATION_STATEMENT, certificationIssues } from "@/lib/rules/certify";
import { VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import { blockingIssues, isVisible } from "@/lib/rules/validate";
import { Attachments } from "./attachments";
import { BudgetGrid } from "./budget-grid";
import { ErrorSummary, focusField } from "./error-summary";
import { QuestionField } from "./question-field";
import { SaveStatus } from "./save-status";
import { SectionNav, type NavSection } from "./section-nav";

const ATTACHMENTS = "attachments";
const REVIEW = "review";

export function ReportEditor({ payload }: { payload: EditorPayload }) {
  const { header, definition } = payload;
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(payload.answers);
  const [rows, setRows] = useState<BudgetRow[]>(() => rowsFromLines(payload.budget));
  const [attachments, setAttachments] = useState<AttachmentItem[]>(payload.attachments);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null);
  const [active, setActive] = useState(definition.sections[0]?.key ?? ATTACHMENTS);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [staleInfo, setStaleInfo] = useState<{ by: string | null; at: string } | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(payload.hasProgress ? header.updatedAt : null);
  const [certified, setCertified] = useState(false);
  const [certName, setCertName] = useState(payload.currentUserName);
  const [certTitle, setCertTitle] = useState(payload.currentUserTitle || String(payload.answers.contact_title ?? ""));
  const summaryRef = useRef<HTMLDivElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  const latest = useRef({ answers, rows });
  useEffect(() => {
    latest.current = { answers, rows };
  });

  const { state, markDirty, flushNow, lockRef } = useAutosave(
    header.lockVersion,
    () => ({ answers: latest.current.answers, budget: linesFromRows(latest.current.rows) }),
    header.id
  );

  const storageKey = `ll:last-section:${header.id}`;

  useEffect(() => {
    if (!payload.hasProgress) return;
    const stored = window.localStorage.getItem(storageKey);
    setResume(stored ?? payload.resumeSection);
  }, [payload.hasProgress, payload.resumeSection, storageKey]);

  useEffect(() => {
    if (state.kind === "saved") setLastSavedAt(state.at);
    if (state.kind === "stale") setStaleInfo({ by: state.by, at: state.at });
  }, [state]);

  useEffect(() => {
    if (focusTick > 0) summaryRef.current?.focus();
  }, [focusTick]);

  const sectionKeys = useMemo(() => [...definition.sections.map((section) => section.key), ATTACHMENTS, REVIEW], [definition.sections]);

  useEffect(() => {
    const elements = sectionKeys.map((key) => document.getElementById(`section-${key}`)).filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace("section-", ""));
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sectionKeys]);

  const lines = useMemo(() => linesFromRows(rows), [rows]);
  const issues = useMemo(
    () => [
      ...reportIssues({
        definition,
        answers,
        budget: lines,
        awardAmount: header.awardAmount,
        orgEin: header.ein,
        orgName: header.orgName,
        period: { startsOn: header.startsOn, endsOn: header.endsOn },
      }),
      ...amountIssues(rows),
      ...certificationIssues({ accepted: certified, name: certName, title: certTitle }),
    ],
    [definition, answers, lines, rows, header.awardAmount, header.ein, header.orgName, header.startsOn, header.endsOn, certified, certName, certTitle]
  );
  const blocking = useMemo(() => blockingIssues(issues), [issues]);
  const warnings = useMemo(() => issues.filter((issue) => issue.severity === "warn"), [issues]);
  const bySection = useMemo(() => issuesBySection(definition, blocking), [definition, blocking]);

  const remember = useCallback(
    (sectionKey: string | null) => {
      if (!sectionKey) return;
      window.localStorage.setItem(storageKey, sectionKey);
      setResume(sectionKey);
      setResumeDismissed(true);
    },
    [storageKey]
  );

  function sectionOf(questionKey: string): string | null {
    return definition.sections.find((section) => section.questions.some((question) => question.key === questionKey))?.key ?? null;
  }

  function changeAnswer(key: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setServerIssues(null);
    remember(sectionOf(key));
    markDirty();
  }

  function touch(key: string) {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  }

  function changeRows(next: BudgetRow[]) {
    setRows(next);
    setServerIssues(null);
    remember(definition.sections.find((section) => section.kind === "budget")?.key ?? null);
    markDirty();
  }

  function jump(key: string) {
    setActive(key);
    const target = document.getElementById(`section-${key}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.querySelector<HTMLElement>("[tabindex='-1']")?.focus({ preventScroll: true });
  }

  function errorFor(key: string): string | undefined {
    if (!summaryOpen && !touched.has(key)) return undefined;
    return blocking.find((issue) => issue.field === key)?.message;
  }

  const rowErrors = useMemo(() => {
    const result: Record<string, string> = {};
    if (!summaryOpen) return result;
    for (const issue of blocking) {
      if (issue.field.startsWith("budget.")) result[issue.field.slice(7)] = issue.message;
    }
    return result;
  }, [blocking, summaryOpen]);

  const navSections: NavSection[] = [
    ...definition.sections.map((section): NavSection => {
      const count = bySection[section.key]?.length ?? 0;
      return { key: section.key, title: section.title, state: count === 0 ? "complete" : summaryOpen ? "attention" : "todo" };
    }),
    { key: ATTACHMENTS, title: "Attachments", state: attachments.length > 0 ? "complete" : "todo" },
    { key: REVIEW, title: "Review and submit", state: blocking.length === 0 ? "complete" : summaryOpen ? "attention" : "todo" },
  ];

  const halted = state.kind === "stale" || state.kind === "locked";
  const shownIssues = serverIssues ?? blocking;

  function showProblems() {
    setSummaryOpen(true);
    setFocusTick((tick) => tick + 1);
  }

  async function saveAndExit() {
    setMessage("");
    const outcome = await flushNow();
    if (outcome === "saved" || outcome === "idle") router.push("/portal");
    else if (outcome === "signed_out") setMessage("You are signed out, so your latest changes are not saved. Sign in again in a new tab, then choose Save and exit.");
    else if (outcome === "retrying") setMessage("Your latest changes are not saved yet. Keep this tab open and try again in a moment.");
  }

  async function submit() {
    setMessage("");
    if (blocking.length > 0) {
      setServerIssues(null);
      showProblems();
      return;
    }
    setServerIssues(null);
    setSubmitting(true);
    try {
      const outcome = await flushNow();
      if (outcome === "stale" || outcome === "locked") return;
      if (outcome === "signed_out" || outcome === "retrying") {
        setMessage("Your latest changes could not be saved, so the report was not submitted. Keep this tab open and try again.");
        return;
      }
      const result = await submitReport({ submissionId: header.id, expectedLock: lockRef.current, certification: { accepted: certified, name: certName, title: certTitle } });
      if (result.status === "blocked") {
        setServerIssues(result.issues);
        showProblems();
      } else if (result.status === "stale") {
        setStaleInfo({ by: result.by, at: result.at });
      } else if (result.status === "signed_out") {
        setMessage("Signed out. Sign in in a new tab, then choose Submit again. Your answers are kept on this page.");
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("The report could not be submitted. Your answers are saved. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const resumeTitle = resume ? navSections.find((section) => section.key === resume)?.title : null;

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="no-print mb-4 lg:sticky lg:top-6 lg:mb-0">
        <SectionNav sections={navSections} active={active} onJump={jump} />
      </aside>

      <div className="min-w-0">
        <div className="no-print sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2.5 shadow-sm">
          <SaveStatus state={state} lastSavedAt={lastSavedAt} today={payload.today} />
          <Button variant="secondary" size="sm" onClick={() => void saveAndExit()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Save and exit
          </Button>
        </div>

        {staleInfo ? (
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
            <p className="inline-flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {staleInfo.by ?? "Someone"} saved this report at {formatTime(staleInfo.at)}. Reload to see the latest version.
              </span>
            </p>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload
            </Button>
          </div>
        ) : null}

        {state.kind === "locked" ? (
          <div role="alert" className="mb-5 rounded-lg border border-bad/40 bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">
            {state.message}
          </div>
        ) : null}

        {resume && resumeTitle && !resumeDismissed ? (
          <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-navy-900">Pick up where you left off</p>
              <p className="text-sm text-muted">You last worked on {resumeTitle}.</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  jump(resume);
                  setResumeDismissed(true);
                }}
              >
                Go to {resumeTitle}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResumeDismissed(true)}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {summaryOpen && shownIssues.length > 0 ? <ErrorSummary ref={summaryRef} issues={shownIssues} /> : null}

        <fieldset disabled={halted} className="min-w-0 space-y-6 border-0 p-0">
          <legend className="sr-only">Report form</legend>

          {definition.sections.map((section) => (
            <Card key={section.key} id={`section-${section.key}`} className="scroll-mt-20">
              <CardHeader
                title={
                  <span tabIndex={-1} className="outline-none">
                    {section.title}
                  </span>
                }
                description={section.description}
              />
              <CardBody className={section.kind === "budget" ? "px-3 py-3 sm:px-5" : "space-y-6"}>
                {section.kind === "budget" ? (
                  <>
                    <h3 className="sr-only">Budget lines</h3>
                    <BudgetGrid
                      rows={rows}
                      onChange={changeRows}
                      award={header.awardAmount}
                      maxLines={definition.budget.maxLines}
                      rowErrors={rowErrors}
                      gridError={summaryOpen ? blocking.find((issue) => issue.field === "budget" && issue.message.startsWith("Add at least"))?.message : undefined}
                      varianceNote={String(answers[VARIANCE_NOTE_KEY] ?? "")}
                      onVarianceNote={(value) => changeAnswer(VARIANCE_NOTE_KEY, value)}
                      varianceError={summaryOpen ? blocking.find((issue) => issue.field === VARIANCE_NOTE_KEY)?.message : undefined}
                    />
                  </>
                ) : (
                  section.questions
                    .filter((question) => isVisible(question, answers))
                    .map((question) => (
                      <QuestionField
                        key={question.key}
                        question={question}
                        value={answers[question.key]}
                        onChange={(value) => changeAnswer(question.key, value)}
                        onBlur={() => touch(question.key)}
                        error={errorFor(question.key)}
                      />
                    ))
                )}
              </CardBody>
            </Card>
          ))}

          <Card id={`section-${ATTACHMENTS}`} className="scroll-mt-20">
            <CardHeader title={<span tabIndex={-1} className="outline-none">Attachments</span>} description="Add supporting documents such as invoices, rosters or a signed certification." />
            <CardBody>
              <Attachments
                submissionId={header.id}
                storage={payload.storage}
                attachments={attachments}
                onAdded={(item) => {
                  setAttachments((list) => [...list, item]);
                  remember(ATTACHMENTS);
                }}
                onRemoved={(id) => setAttachments((list) => list.filter((item) => item.id !== id))}
                onSignedOut={() => setMessage("Signed out. Sign in in a new tab, then try again.")}
              />
            </CardBody>
          </Card>

          <Card id={`section-${REVIEW}`} className="scroll-mt-20">
            <CardHeader title={<span tabIndex={-1} className="outline-none">Review and submit</span>} description="Check every section, then send the report to Council Finance." />
            <CardBody className="space-y-5">
              {blocking.length === 0 ? (
                <p className="flex items-start gap-2 rounded-md border border-ok/20 bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Everything required is complete. You can submit this report.
                </p>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {blocking.length} {blocking.length === 1 ? "thing needs" : "things need"} your attention before you can submit.
                  </p>
                  <ul className="mt-2 space-y-1 pl-5 text-sm marker:text-muted list-disc">
                    {blocking.map((issue, index) => {
                      const target = fieldTargetId(issue.field);
                      return (
                        <li key={`${issue.field}-${index}`}>
                          <a
                            href={`#${target}`}
                            className="text-navy-700 underline underline-offset-2 hover:text-navy-900"
                            onClick={(event) => {
                              event.preventDefault();
                              focusField(target);
                            }}
                          >
                            {issue.message}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {warnings.length > 0 ? (
                <div className="rounded-md border border-warn/30 bg-warn-bg px-4 py-3">
                  <p className="flex items-start gap-2 text-sm font-semibold text-warn">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Worth checking before you submit. These do not stop you from submitting.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-9 text-sm text-ink marker:text-warn">
                    {warnings.map((issue, index) => (
                      <li key={`${issue.field}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <fieldset className="rounded-md border border-line px-4 py-4">
                <legend className="px-1 text-sm font-semibold text-ink">Certification</legend>
                <div className="flex items-start gap-3">
                  <input
                    id="certification-box"
                    type="checkbox"
                    checked={certified}
                    onChange={(event) => setCertified(event.target.checked)}
                    aria-invalid={summaryOpen && !certified ? true : undefined}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-line-strong text-navy-800 focus:ring-2 focus:ring-navy-600"
                  />
                  <label htmlFor="certification-box" className="text-sm font-semibold text-ink">
                    {CERTIFICATION_STATEMENT}
                  </label>
                </div>
                <FieldError>{summaryOpen ? blocking.find((issue) => issue.field === "certification")?.message : undefined}</FieldError>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="certifier-name">Certifier name</Label>
                    <Input id="certifier-name" value={certName} maxLength={120} onChange={(event) => setCertName(event.target.value)} aria-invalid={summaryOpen && blocking.some((issue) => issue.field === "certifier_name") ? true : undefined} autoComplete="name" />
                    <FieldError>{summaryOpen ? blocking.find((issue) => issue.field === "certifier_name")?.message : undefined}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="certifier-title">Certifier title</Label>
                    <Input id="certifier-title" value={certTitle} maxLength={120} onChange={(event) => setCertTitle(event.target.value)} aria-invalid={summaryOpen && blocking.some((issue) => issue.field === "certifier_title") ? true : undefined} autoComplete="organization-title" />
                    <FieldError>{summaryOpen ? blocking.find((issue) => issue.field === "certifier_title")?.message : undefined}</FieldError>
                  </div>
                </div>
                <Hint>The name, title and time are stored with this submission and shown to Council Finance.</Hint>
              </fieldset>

              <p className="text-sm text-muted">
                After you submit, the report is locked. You can change it again only if Council Finance asks for an update. We will email a copy to you.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void submit()} disabled={submitting || halted} aria-describedby="submit-hint">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {submitting ? "Submitting" : "Submit report"}
                </Button>
                <p id="submit-hint" className="text-sm text-muted">
                  {blocking.length > 0 ? "Submit checks every section and lists anything left to fix." : "Ready to send."}
                </p>
              </div>
              {message ? (
                <p role="alert" className="text-sm font-semibold text-bad">
                  {message}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </fieldset>
      </div>
    </div>
  );
}
