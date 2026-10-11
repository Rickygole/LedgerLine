"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  importMasterList,
  previewMasterList,
  type ImportResult,
  type PreviewResult,
} from "@/app/finance/organizations/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ErrorSummary } from "@/components/finance/admin/error-summary";
import { MASTER_FIELDS, MAX_IMPORT_BYTES } from "@/lib/finance/admin/master-list";

const STATUS_LABEL = { new: "New", updated: "Updated", unchanged: "Unchanged", rejected: "Rejected" } as const;
const STATUS_TONE: Record<keyof typeof STATUS_LABEL, Tone> = {
  new: "ok",
  updated: "info",
  unchanged: "neutral",
  rejected: "bad",
};

export function ImportMasterList() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("pasted list");
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("That file is larger than 1 MB. Split it and try again.");
      return;
    }
    setText(await file.text());
    setFileName(file.name);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function check() {
    setResult(null);
    startTransition(async () => {
      const outcome = await previewMasterList(text);
      if (!outcome.ok) {
        setPreview(null);
        setError(outcome.error);
        return;
      }
      setError(null);
      setPreview(outcome);
    });
  }

  function confirm() {
    startTransition(async () => {
      const outcome = await importMasterList(text, fileName);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setError(null);
      setPreview(null);
      setText("");
      setResult(outcome);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  const changes = preview ? preview.counts.new + preview.counts.updated : 0;
  const ordered = preview
    ? [...preview.rows].sort(
        (a, b) => Number(b.status === "rejected") - Number(a.status === "rejected") || a.line - b.line,
      )
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Choose a list"
          description="A CSV file with one organization per row. Rows are matched to the master list by EIN: a new EIN is added, a known EIN is updated."
        />
        <CardBody className="space-y-4">
          <ErrorSummary errors={error ? [{ id: "", message: error }] : []} />
          <div>
            <p className="mb-1 block text-sm font-semibold text-ink">Columns</p>
            <p id="master-hint" className="mb-2 text-sm text-muted">
              A header row with these columns, in any order. Type is Nonprofit or City agency. Council district can be
              blank or Citywide for citywide organizations. Contact phone is optional.
            </p>
            <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Columns">
              {MASTER_FIELDS.map((field) => (
                <li key={field} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[13px] text-ink">
                  {field}
                </li>
              ))}
            </ul>
            <a
              href="/finance/organizations/import/template"
              download
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download CSV template
            </a>
          </div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void choose(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex min-h-[140px] flex-col items-center justify-center rounded border-2 border-dashed px-5 py-6 text-center",
              dragging ? "border-action bg-harbor-100" : "border-line-strong bg-harbor-50/50",
            )}
          >
            <Upload className="h-6 w-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-[17px] font-bold leading-6 text-ink">
              Drag a CSV file here or{" "}
              <label className="cursor-pointer text-link underline underline-offset-2 hover:text-link-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                choose a file
                <input
                  id="master-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="CSV file"
                  className="sr-only"
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              </label>
            </p>
            <p className="mt-1 text-[15px] text-ink-2">
              {fileName !== "pasted list" && text !== "" ? (
                <>
                  Chosen: <span className="font-semibold text-ink">{fileName}</span>
                </>
              ) : (
                "One CSV file, up to 1 MB."
              )}
            </p>
          </div>
          <div>
            <Label htmlFor="master-text">Or paste the list</Label>
            <Textarea
              id="master-text"
              aria-describedby="master-hint"
              className="min-h-40 font-mono text-[13px]"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName("pasted list");
                setPreview(null);
                setResult(null);
              }}
            />
          </div>
          <Button
            onClick={check}
            disabled={pending || text.trim() === ""}
            aria-describedby={text.trim() === "" ? "master-empty" : undefined}
          >
            {pending && !preview ? "Checking" : "Preview import"}
          </Button>
          {text.trim() === "" ? (
            <p id="master-empty" className="text-sm text-muted">
              Preview is off until there is a list to check. Choose a CSV file or paste the list above.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {result ? (
        <p role="status" className="rounded-md border border-ok/30 bg-ok-bg px-4 py-3 text-sm font-semibold text-ok">
          Import finished: {result.added} added, {result.updated} updated, {result.unchanged} unchanged,{" "}
          {result.rejected} rejected. The changes are in the audit log.
        </p>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader
            title="Preview"
            description="Nothing has been changed yet. Rejected rows are skipped when you confirm."
          />
          <CardBody className="space-y-4">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-ink" aria-label="Import summary">
              {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => (
                <li key={status}>
                  <span className="num font-bold">{preview.counts[status]}</span> {STATUS_LABEL[status].toLowerCase()}
                </li>
              ))}
            </ul>
            <Table density="compact">
              <THead>
                <tr>
                  <TH align="right">Row</TH>
                  <TH>EIN</TH>
                  <TH>Organization</TH>
                  <TH>Result</TH>
                  <TH>Details</TH>
                </tr>
              </THead>
              <tbody>
                {ordered.slice(0, 300).map((row) => (
                  <TR key={row.line}>
                    <TD align="right">{row.line}</TD>
                    <TD className="whitespace-nowrap font-mono text-[13px]">{row.ein}</TD>
                    <TD className="min-w-[12rem]">{row.legal_name}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </TD>
                    <TD className="min-w-[16rem] text-sm">
                      {row.status === "rejected" ? (
                        <ul className="list-disc pl-4 text-bad">
                          {row.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : row.status === "updated" ? (
                        `Changes ${row.changes.join(", ")}`
                      ) : row.status === "new" ? (
                        "Will be added to the master list"
                      ) : (
                        <span className="text-muted">Already matches the master list</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {ordered.length > 300 ? (
              <p className="text-sm text-muted">
                Showing the first 300 of {ordered.length} rows. Rejected rows come first.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={confirm} disabled={pending || changes === 0}>
                {pending
                  ? "Importing"
                  : `Confirm import of ${changes} ${changes === 1 ? "organization" : "organizations"}`}
              </Button>
              {changes === 0 ? (
                <span className="text-sm text-muted">There is nothing new or changed to import.</span>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
