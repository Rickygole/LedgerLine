"use client";

import { upload } from "@vercel/blob/client";
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { prepareUpload, recordBlobUpload, removeAttachment, uploadLocalAttachment } from "@/app/portal/reports/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AttachmentItem, UploadActionResult } from "@/lib/report/types";
import { ACCEPT_ATTRIBUTE, clientCheckUpload, formatBytes } from "@/lib/report/upload-rules";

type Pending = { key: string; name: string; bytes: number; state: "uploading" | "rejected"; reason?: string };

async function sessionIsAlive(): Promise<boolean> {
  try {
    const response = await fetch("/api/upload/session", { cache: "no-store" });
    return response.ok;
  } catch {
    return true;
  }
}

export function Attachments({
  submissionId,
  storage,
  attachments,
  onAdded,
  onRemoved,
  onSignedOut,
}: {
  submissionId: string;
  storage: "blob" | "local";
  attachments: AttachmentItem[];
  onAdded: (item: AttachmentItem) => void;
  onRemoved: (id: string) => void;
  onSignedOut: () => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function patch(key: string, next: Partial<Pending> | null) {
    setPending((list) => (next === null ? list.filter((item) => item.key !== key) : list.map((item) => (item.key === key ? { ...item, ...next } : item))));
  }

  async function sendOne(file: File): Promise<UploadActionResult> {
    if (storage === "local") {
      const form = new FormData();
      form.set("submissionId", submissionId);
      form.set("file", file);
      return uploadLocalAttachment(form);
    }
    const prepared = await prepareUpload({ submissionId, filename: file.name, bytes: file.size });
    if (prepared.status !== "ok") return prepared;
    await upload(prepared.pathname, file, {
      access: "private" as "public",
      handleUploadUrl: "/api/upload",
      clientPayload: JSON.stringify({ submissionId, signature: prepared.signature }),
      contentType: prepared.contentType,
      multipart: file.size > 8 * 1024 * 1024,
    });
    return recordBlobUpload({ submissionId, pathname: prepared.pathname, signature: prepared.signature, filename: file.name });
  }

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
      const problem = clientCheckUpload(file.name, file.size);
      if (problem) {
        setPending((current) => [...current, { key, name: file.name, bytes: file.size, state: "rejected", reason: problem }]);
        continue;
      }
      setPending((current) => [...current, { key, name: file.name, bytes: file.size, state: "uploading" }]);
      try {
        const result = await sendOne(file);
        if (result.status === "ok") {
          patch(key, null);
          onAdded(result.attachment);
        } else if (result.status === "signed_out") {
          patch(key, { state: "rejected", reason: "Signed out. Sign in to upload." });
          onSignedOut();
        } else {
          patch(key, { state: "rejected", reason: result.message });
        }
      } catch {
        if (!(await sessionIsAlive())) {
          patch(key, { state: "rejected", reason: "Signed out. Sign in to upload." });
          onSignedOut();
        } else {
          patch(key, { state: "rejected", reason: "The file could not be uploaded. Check your connection and try again." });
        }
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove(item: AttachmentItem) {
    setRemoveError("");
    const result = await removeAttachment({ submissionId, attachmentId: item.id }).catch(() => ({ status: "error" as const, message: "The file could not be removed. Try again." }));
    if (result.status === "ok") onRemoved(item.id);
    else if (result.status === "signed_out") onSignedOut();
    else setRemoveError(result.message);
  }

  const empty = attachments.length === 0 && pending.length === 0;

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn("rounded-md border border-dashed px-5 py-6 text-center", dragging ? "border-navy-600 bg-navy-50" : "border-line-strong bg-surface/50")}
      >
        <Paperclip className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
        <p className="mt-2 text-sm text-ink">Drag files here or choose them from your computer.</p>
        <p className="mt-1 text-sm text-muted">PDF, Word, Excel or CSV. Up to 25 MB each.</p>
        <input ref={input} id="attachment-input" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={(event) => event.target.files && void handleFiles(event.target.files)} />
        <label
          htmlFor="attachment-input"
          className="mt-3 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-line-strong/70 bg-white px-4 text-sm font-semibold text-ink shadow-sm hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy-600"
        >
          Choose files
        </label>
      </div>

      {removeError ? <p role="alert" className="mt-3 text-sm font-semibold text-bad">{removeError}</p> : null}

      <div className="mt-4 rounded-md border border-line" aria-live="polite">
        <div className="flex h-10 items-center justify-between border-b border-line bg-surface px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          <span>Files</span>
          <span className="num normal-case tracking-normal">{attachments.length} attached</span>
        </div>
        {empty ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No files attached yet. Attachments are optional unless Council Finance asked for supporting documents.</p>
        ) : (
          <ul className="divide-y divide-line">
            {attachments.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold text-ink" title={item.filename}>
                    {item.filename}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <span className="num">{formatBytes(item.bytes)}</span>
                    <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
                    <span className="inline-flex items-center gap-1 text-ok">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Uploaded
                    </span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <a href={`/portal/reports/${submissionId}/files/${item.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50" aria-label={`Download ${item.filename}`}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => void remove(item)} aria-label={`Remove ${item.filename}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
            {pending.map((item) => (
              <li key={item.key} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", item.state === "rejected" && "bg-bad-bg/40")}>
                <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold text-ink" title={item.name}>
                    {item.name}
                  </p>
                  {item.state === "uploading" ? (
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Uploading <span className="num">{formatBytes(item.bytes)}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-bad">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Not uploaded. {item.reason}</span>
                    </p>
                  )}
                </div>
                {item.state === "rejected" ? (
                  <Button variant="ghost" size="sm" onClick={() => patch(item.key, null)} aria-label={`Dismiss message for ${item.name}`}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Dismiss
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
