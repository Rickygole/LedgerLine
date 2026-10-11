"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { submitReport } from "@/app/portal/reports/actions";
import { Button } from "@/components/ui/button";
import type { ReportState } from "@/lib/domain";
import { FieldError, Hint, Input, Label } from "@/components/ui/field";
import { formatTime } from "@/lib/dates";
import { amountIssues, linesFromRows, rowsFromLines, type BudgetRow } from "@/lib/report/budget-rows";
import { fieldTargetId, issuesBySection, reportIssues, sectionKeyForField } from "@/lib/report/issues";
import type { AttachmentItem, EditorPayload } from "@/lib/report/types";
import { useAutosave } from "@/lib/report/use-autosave";
import type { AnswerValue, Answers, Issue } from "@/lib/rules/types";
import { CERTIFICATION_STATEMENT, certificationIssues } from "@/lib/rules/certify";
import { VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import { blockingIssues, isVisible } from "@/lib/rules/validate";
import { cn } from "@/lib/cn";
import { Attachments } from "./attachments";
import { BudgetGrid } from "./budget-grid";
import { CheckAnswers } from "./check-answers";
import { focusField } from "./error-summary";
import { QuestionField } from "./question-field";
import { ReportHeader } from "./report-header";
import { SaveStatus } from "./save-status";
import { StepProblems } from "./step-problems";
import { Stepper, type Step } from "./stepper";

const ATTACHMENTS = "attachments";
const REVIEW = "review";
const REVIEW_FIELDS = new Set(["certification", "certifier_name", "certifier_title"]);

export function ReportEditor({
  payload,
  daysLate,
  state: reportState,
  notice,
}: {
  payload: EditorPayload;
  daysLate: number;
  state: ReportState;
  notice?: React.ReactNode;
}) {
  const { header, definition } = payload;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [answers, setAnswers] = useState<Answers>(payload.answers);
  const [rows, setRows] = useState<BudgetRow[]>(() => rowsFromLines(payload.budget));
  const [attachments, setAttachments] = useState<AttachmentItem[]>(payload.attachments);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [staleInfo, setStaleInfo] = useState<{ by: string | null; at: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(payload.hasProgress ? header.updatedAt : null);
  const [certified, setCertified] = useState(false);
  const [certName, setCertName] = useState(payload.currentUserName);
  const [certTitle, setCertTitle] = useState(payload.currentUserTitle || String(payload.answers.contact_title ?? ""));
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [navTick, setNavTick] = useState(0);

  const latest = useRef({ answers, rows });
  useEffect(() => {
    latest.current = { answers, rows };
  });

  const { state, markDirty, flushNow, lockRef } = useAutosave(
    header.lockVersion,
    () => ({ answers: latest.current.answers, budget: linesFromRows(latest.current.rows) }),
    header.id,
  );

  const stepKeys = useMemo(
    () => [...definition.sections.map((section) => section.key), ATTACHMENTS, REVIEW],
    [definition.sections],
  );
  const landing =
    payload.resumeSection && stepKeys.includes(payload.resumeSection) ? payload.resumeSection : stepKeys[0];
  const requested = searchParams.get("step");
  const step = requested && stepKeys.includes(requested) ? requested : landing;
  const returning = searchParams.get("return") === "review" && step !== REVIEW;
  const index = stepKeys.indexOf(step);

  useEffect(() => {
    if (state.kind === "saved") setLastSavedAt(state.at);
    if (state.kind === "stale") setStaleInfo({ by: state.by, at: state.at });
  }, [state]);

  useEffect(() => {
    if (focusTick > 0) summaryRef.current?.focus();
  }, [focusTick]);

  useEffect(() => {
    if (navTick === 0) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target && target !== "heading") {
      focusField(target);
      return;
    }
    const top = document.getElementById("report-step");
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [navTick, step]);

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
    [
      definition,
      answers,
      lines,
      rows,
      header.awardAmount,
      header.ein,
      header.orgName,
      header.startsOn,
      header.endsOn,
      certified,
      certName,
      certTitle,
    ],
  );
  const blocking = useMemo(() => blockingIssues(issues), [issues]);
  const warnings = useMemo(() => issues.filter((issue) => issue.severity === "warn"), [issues]);
  const bySection = useMemo(() => issuesBySection(definition, blocking), [definition, blocking]);
  const reviewIssues = useMemo(() => blocking.filter((issue) => REVIEW_FIELDS.has(issue.field)), [blocking]);

  function stepOfField(field: string): string {
    if (REVIEW_FIELDS.has(field)) return REVIEW;
    return sectionKeyForField(definition, field) ?? REVIEW;
  }

  function go(key: string, options: { focus?: string; keepReturn?: boolean } = {}) {
    const query = new URLSearchParams();
    query.set("step", key);
    if (options.keepReturn && key !== REVIEW) query.set("return", "review");
    window.history.pushState(null, "", `?${query.toString()}`);
    pendingFocus.current = options.focus ?? "heading";
    setNavTick((tick) => tick + 1);
  }

  function goToField(field: string) {
    const key = stepOfField(field);
    const target = fieldTargetId(field);
    if (key === step) {
      focusField(target);
      return;
    }
    go(key, { focus: target, keepReturn: true });
  }

  function changeAnswer(key: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setServerIssues(null);
    markDirty();
  }

  function touch(key: string) {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  }

  function changeRows(next: BudgetRow[]) {
    setRows(next);
    setServerIssues(null);
    markDirty();
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

  const steps: Step[] = [
    ...definition.sections.map((section): Step => {
      const count = bySection[section.key]?.length ?? 0;
      return {
        key: section.key,
        title: section.title,
        errors: count,
        state: count === 0 ? "complete" : summaryOpen ? "error" : "todo",
      };
    }),
    {
      key: ATTACHMENTS,
      title: "Attachments",
      errors: 0,
      state: attachments.length > 0 ? "complete" : "todo",
      optional: true,
    },
    {
      key: REVIEW,
      title: "Review and submit",
      errors: reviewIssues.length,
      state: blocking.length === 0 ? "complete" : summaryOpen && reviewIssues.length > 0 ? "error" : "todo",
    },
  ];
  const current = steps[index];
  const previous = index > 0 ? steps[index - 1] : null;
  const next = index < steps.length - 1 ? steps[index + 1] : null;
  const section = definition.sections.find((item) => item.key === step) ?? null;

  const halted = state.kind === "stale" || state.kind === "locked";
  const shownIssues = serverIssues ?? blocking;
  const stepIssues = step === REVIEW ? [] : shownIssues.filter((issue) => stepOfField(issue.field) === step);

  function showProblems() {
    setSummaryOpen(true);
    setFocusTick((tick) => tick + 1);
  }

  async function saveAndExit() {
    setMessage("");
    const outcome = await flushNow();
    if (outcome === "saved" || outcome === "idle") router.push("/portal");
    else if (outcome === "signed_out")
      setMessage(
        "You are signed out, so your latest changes are not saved. Sign in again in a new tab, then choose Save and exit.",
      );
    else if (outcome === "retrying")
      setMessage("Your latest changes are not saved yet. Keep this tab open and try again in a moment.");
    else if (outcome === "rejected")
      setMessage("Your latest changes were not saved. Fix what the save message says, then choose Save and exit.");
  }

  function saveAndContinue() {
    if (section) setTouched((current) => new Set([...current, ...section.questions.map((question) => question.key)]));
    void flushNow();
    if (returning) go(REVIEW);
    else if (next) go(next.key);
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
      if (outcome === "signed_out" || outcome === "retrying" || outcome === "rejected") {
        setMessage(
          "Your latest changes could not be saved, so the report was not submitted. Keep this tab open and try again.",
        );
        return;
      }
      const result = await submitReport({
        submissionId: header.id,
        expectedLock: lockRef.current,
        certification: { accepted: certified, name: certName, title: certTitle },
      });
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

  const purpose =
    section?.kind === "budget" && definition.budget.mustEqualAward ? "The total must equal your award." : null;

  return (
    <>
      <ReportHeader
        header={header}
        daysLate={daysLate}
        state={reportState}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void saveAndExit()} className="no-print">
            Save and exit
          </Button>
        }
      />

      {notice}

      {staleInfo ? (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn"
        >
          <p className="inline-flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {staleInfo.by ?? "Someone"} saved this report at {formatTime(staleInfo.at)}. Reload to see the latest
              version.
            </span>
          </p>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload
          </Button>
        </div>
      ) : null}

      {state.kind === "locked" ? (
        <div
          role="alert"
          className="mb-6 rounded border border-bad/40 bg-bad-bg px-4 py-3 text-sm font-semibold text-bad"
        >
          {state.message}
        </div>
      ) : null}

      {message && step !== REVIEW ? (
        <p
          role="alert"
          className="mb-6 rounded border border-bad/40 bg-bad-bg px-4 py-3 text-sm font-semibold text-bad"
        >
          {message}
        </p>
      ) : null}

      <div
        className={cn(
          "lg:grid lg:items-start lg:gap-10",
          section?.kind === "budget"
            ? "lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1100px)]"
            : "lg:grid-cols-[260px_minmax(0,760px)]",
        )}
      >
        <aside className="no-print mb-5 lg:sticky lg:top-6 lg:mb-0">
          <Stepper steps={steps} current={step} onSelect={(key) => go(key)} />
          <div className="mt-3 px-1 lg:mt-4 lg:border-t lg:border-line-soft lg:px-3 lg:pt-4">
            <SaveStatus state={state} lastSavedAt={lastSavedAt} today={payload.today} />
          </div>
        </aside>

        <div id="report-step" className="min-w-0 scroll-mt-4">
          <fieldset disabled={halted} className="min-w-0 border-0 p-0">
            <legend className="sr-only">Report form</legend>
            <section aria-labelledby="step-heading" className="rounded border border-line bg-white">
              <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
                <p className="num hidden text-sm font-semibold text-muted lg:block">
                  Step {index + 1} of {steps.length}
                </p>
                <h2
                  id="step-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="lg:mt-0.5 text-xl font-bold leading-7 text-ink outline-none"
                >
                  {current?.title}
                </h2>
                {purpose ? <p className="mt-1 max-w-[70ch] text-[15px] leading-[22px] text-ink-2">{purpose}</p> : null}
              </div>

              <div className="px-5 py-6 sm:px-6">
                {summaryOpen && stepIssues.length > 0 ? (
                  <StepProblems issues={stepIssues} onSelect={goToField} scope="step" />
                ) : null}

                {section && section.kind === "budget" ? (
                  <>
                    <h3 className="sr-only">Budget lines</h3>
                    <BudgetGrid
                      rows={rows}
                      onChange={changeRows}
                      award={header.awardAmount}
                      maxLines={definition.budget.maxLines}
                      rowErrors={rowErrors}
                      gridError={
                        summaryOpen
                          ? blocking.find(
                              (issue) => issue.field === "budget" && issue.message.startsWith("Add at least"),
                            )?.message
                          : undefined
                      }
                      varianceNote={String(answers[VARIANCE_NOTE_KEY] ?? "")}
                      onVarianceNote={(value) => changeAnswer(VARIANCE_NOTE_KEY, value)}
                      varianceError={
                        summaryOpen ? blocking.find((issue) => issue.field === VARIANCE_NOTE_KEY)?.message : undefined
                      }
                    />
                  </>
                ) : null}

                {section && section.kind !== "budget" ? (
                  <div className="space-y-7">
                    {section.questions
                      .filter((question) => isVisible(question, answers))
                      .map((question) => (
                        <QuestionField
                          key={question.key}
                          question={question}
                          value={answers[question.key]}
                          onChange={(value) => changeAnswer(question.key, value)}
                          onBlur={() => touch(question.key)}
                          error={errorFor(question.key)}
                          award={header.awardAmount}
                        />
                      ))}
                  </div>
                ) : null}

                {step === ATTACHMENTS ? (
                  <Attachments
                    submissionId={header.id}
                    storage={payload.storage}
                    attachments={attachments}
                    onAdded={(item) => setAttachments((list) => [...list, item])}
                    onRemoved={(id) => setAttachments((list) => list.filter((item) => item.id !== id))}
                    onSignedOut={() => setMessage("Signed out. Sign in in a new tab, then try again.")}
                  />
                ) : null}

                {step === REVIEW ? (
                  <div className="space-y-8">
                    {blocking.length > 0 || (summaryOpen && shownIssues.length > 0) ? (
                      <StepProblems
                        ref={summaryRef}
                        issues={shownIssues}
                        onSelect={goToField}
                        scope="report"
                        alert={summaryOpen}
                      />
                    ) : (
                      <p className="flex items-start gap-2 rounded border border-ok/30 bg-ok-bg px-4 py-3 text-[15px] font-semibold text-ok">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Everything required is complete. You can submit this report.
                      </p>
                    )}

                    {warnings.length > 0 ? (
                      <div className="rounded border border-warn/30 bg-warn-bg px-4 py-3">
                        <p className="flex items-start gap-2 text-[15px] font-semibold text-warn">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          Worth checking before you submit. These do not stop you from submitting.
                        </p>
                        <ul className="mt-2 list-disc space-y-1 pl-9 text-[15px] text-ink marker:text-warn">
                          {warnings.map((issue, i) => (
                            <li key={`${issue.field}-${i}`}>{issue.message}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <CheckAnswers
                      definition={definition}
                      answers={answers}
                      lines={lines}
                      award={header.awardAmount}
                      attachments={attachments}
                      onChange={(key, target) => go(key, { focus: target, keepReturn: true })}
                    />

                    <fieldset className="rounded border border-line px-5 py-5">
                      <legend className="px-1 text-[17px] font-bold text-ink">Certification</legend>
                      <div className="flex items-start gap-3">
                        <input
                          id="certification-box"
                          type="checkbox"
                          checked={certified}
                          onChange={(event) => setCertified(event.target.checked)}
                          aria-invalid={summaryOpen && !certified ? true : undefined}
                          className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong accent-[#005ea2]"
                        />
                        <label htmlFor="certification-box" className="text-base font-semibold text-ink">
                          {CERTIFICATION_STATEMENT}
                        </label>
                      </div>
                      <FieldError>
                        {summaryOpen ? blocking.find((issue) => issue.field === "certification")?.message : undefined}
                      </FieldError>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="certifier-name">Certifier name</Label>
                          <Input
                            id="certifier-name"
                            aria-required="true"
                            value={certName}
                            maxLength={120}
                            onChange={(event) => setCertName(event.target.value)}
                            aria-invalid={
                              summaryOpen && blocking.some((issue) => issue.field === "certifier_name")
                                ? true
                                : undefined
                            }
                            autoComplete="name"
                          />
                          <FieldError>
                            {summaryOpen
                              ? blocking.find((issue) => issue.field === "certifier_name")?.message
                              : undefined}
                          </FieldError>
                        </div>
                        <div>
                          <Label htmlFor="certifier-title">Certifier title</Label>
                          <Input
                            id="certifier-title"
                            aria-required="true"
                            value={certTitle}
                            maxLength={120}
                            onChange={(event) => setCertTitle(event.target.value)}
                            aria-invalid={
                              summaryOpen && blocking.some((issue) => issue.field === "certifier_title")
                                ? true
                                : undefined
                            }
                            autoComplete="organization-title"
                          />
                          <FieldError>
                            {summaryOpen
                              ? blocking.find((issue) => issue.field === "certifier_title")?.message
                              : undefined}
                          </FieldError>
                        </div>
                      </div>
                      <Hint>
                        The name, title and time are stored with this submission and shown to Council Finance.
                      </Hint>
                    </fieldset>

                    <p id="submit-hint" className="max-w-[70ch] text-[15px] leading-[22px] text-ink-2">
                      After you submit, the report is locked. You can change it again only if Council Finance asks for
                      an update. A copy is saved in Messages.
                    </p>
                    {message ? (
                      <p role="alert" className="text-sm font-semibold text-bad">
                        {message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="no-print flex flex-col-reverse gap-4 border-t border-line-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                {previous ? (
                  <a
                    href={`?step=${encodeURIComponent(previous.key)}`}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      go(previous.key);
                    }}
                    className="inline-flex items-center gap-1.5 self-start text-[15px] font-semibold text-link underline underline-offset-2 hover:text-link-hover sm:self-auto"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>
                      Previous<span className="max-sm:sr-only">: {previous.title}</span>
                    </span>
                  </a>
                ) : (
                  <span />
                )}
                {step === REVIEW ? (
                  <Button
                    onClick={() => void submit()}
                    disabled={submitting || halted}
                    aria-describedby="submit-hint"
                    className="max-sm:w-full"
                  >
                    {submitting ? "Submitting" : "Submit report to Council Finance"}
                  </Button>
                ) : (
                  <Button onClick={saveAndContinue} disabled={halted} className="max-sm:w-full">
                    {returning ? "Save and return to review" : "Save and continue"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </section>
          </fieldset>
        </div>
      </div>
    </>
  );
}
