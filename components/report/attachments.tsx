"use client";

import { upload } from "@vercel/blob/client";
import { AlertCircle, FileSpreadsheet, FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { prepareUpload, recordBlobUpload, removeAttachment, uploadLocalAttachment } from "@/app/portal/reports/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import type { AttachmentItem, UploadActionResult } from "@/lib/report/types";
import { sessionIsAlive } from "@/lib/report/session-probe";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, clientCheckUpload, formatBytes } from "@/lib/report/upload-rules";

type Pending = {
  key: string;
  name: string;
  bytes: number;
  state: "uploading" | "rejected";
  reason?: string;
  progress?: number;
};

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
    setPending((list) =>
      next === null
        ? list.filter((item) => item.key !== key)
        : list.map((item) => (item.key === key ? { ...item, ...next } : item)),
    );
  }

  async function sendOne(file: File, key: string): Promise<UploadActionResult> {
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
      onUploadProgress: ({ percentage }) => patch(key, { progress: percentage }),
    });
    return recordBlobUpload({
      submissionId,
      pathname: prepared.pathname,
      signature: prepared.signature,
      filename: file.name,
    });
  }

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
      const problem = clientCheckUpload(file.name, file.size);
      if (problem) {
        setPending((current) => [
          ...current,
          { key, name: file.name, bytes: file.size, state: "rejected", reason: problem },
        ]);
        continue;
      }
      setPending((current) => [...current, { key, name: file.name, bytes: file.size, state: "uploading" }]);
      try {
        const result = await sendOne(file, key);
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
          patch(key, {
            state: "rejected",
            reason: `The file could not be uploaded. Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)} each. Check the size of this file and your connection, then try again.`,
          });
        }
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove(item: AttachmentItem) {
    setRemoveError("");
    const result = await removeAttachment({ submissionId, attachmentId: item.id }).catch(() => ({
      status: "error" as const,
      message: "The file could not be removed. Try again.",
    }));
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
        className={cn(
          "flex min-h-[160px] flex-col items-center justify-center rounded border-2 border-dashed px-5 py-6 text-center",
          dragging ? "border-action bg-harbor-100" : "border-line-strong bg-harbor-50/50",
        )}
      >
        <Upload className="h-6 w-6 text-muted" aria-hidden="true" />
        <p className="mt-2 text-[17px] font-bold leading-6 text-ink">
          Drag files here or{" "}
          <label className="cursor-pointer text-link underline underline-offset-2 hover:text-link-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
            choose files
            <input
              ref={input}
              id="attachment-input"
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={(event) => event.target.files && void handleFiles(event.target.files)}
            />
          </label>
        </p>
        <p className="mt-1 text-[15px] text-ink-2">
          PDF, Word, Excel or CSV. Up to 25 MB each. Files with macros are not accepted.
        </p>
      </div>

      {removeError ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-bad">
          {removeError}
        </p>
      ) : null}

      <div className="mt-5" aria-live="polite">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <h3 className="text-[17px] font-bold leading-6 text-ink">Files</h3>
          <span className="num text-sm font-medium text-muted">{attachments.length} attached</span>
        </div>
        {empty ? (
          <p className="py-6 text-[15px] text-muted">
            No files attached yet. Attachments are optional unless Council Finance asked for supporting documents.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {attachments.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <FileIcon name={item.filename} />
                <div className="min-w-0 flex-1 basis-56">
                  <a
                    href={`/portal/reports/${submissionId}/files/${item.id}`}
                    className="block truncate text-[15px] font-semibold text-link underline underline-offset-2 hover:text-link-hover"
                    title={item.filename}
                    aria-label={`Download ${item.filename}`}
                  >
                    {item.filename}
                  </a>
                  <p className="mt-0.5 text-sm text-muted">
                    <span className="num">{formatBytes(item.bytes)}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, </span>
                    Uploaded{item.uploadedByName ? ` by ${item.uploadedByName}` : ""}, {formatDateTime(item.uploadedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(item)}
                  aria-label={`Remove ${item.filename}`}
                >
                  Remove
                </Button>
              </li>
            ))}
            {pending.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <FileIcon name={item.name} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-[15px] font-semibold text-ink" title={item.name}>
                    {item.name}
                  </p>
                  {item.state === "uploading" ? (
                    <div className="mt-1.5">
                      <div
                        className="h-1.5 w-full max-w-xs overflow-hidden rounded-sm bg-harbor-100"
                        role="progressbar"
                        aria-label={`Uploading ${item.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={item.progress === undefined ? undefined : Math.round(item.progress)}
                      >
                        {item.progress === undefined ? (
                          <div className="h-full w-1/3 animate-pulse bg-action motion-reduce:animate-none" />
                        ) : (
                          <div
                            className="h-full w-full origin-left bg-action"
                            style={{ transform: `scaleX(${item.progress / 100})` }}
                          />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        Uploading <span className="num">{formatBytes(item.bytes)}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-bad">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Not uploaded. {item.reason}</span>
                    </p>
                  )}
                </div>
                {item.state === "rejected" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patch(item.key, null)}
                    aria-label={`Dismiss message for ${item.name}`}
                  >
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

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const Icon = ext === "csv" || ext === "xlsx" ? FileSpreadsheet : FileText;
  return <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />;
}
