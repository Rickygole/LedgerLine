"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishLibraryDrafts } from "@/app/finance/question-library/actions";
import { Button } from "@/components/ui/button";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { counted } from "@/lib/format";
import type { PublishAllResult } from "@/lib/forms/library";

type Props = {
  questionKey: string;
  formIds: string[] | null;
  count: number;
};

export function PublishDrafts({ questionKey, formIds, count }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<PublishAllResult | null>(null);

  function publish() {
    startTransition(async () => {
      const response = await publishLibraryDrafts(questionKey, formIds);
      dialog.current?.close();
      if (!response.ok) {
        setErrors(response.errors);
        return;
      }
      setErrors([]);
      setResult({ published: response.published, failed: response.failed });
      router.refresh();
    });
  }

  if (result) {
    return (
      <div role="status" className="space-y-2 rounded border border-ok/30 bg-ok-bg px-4 py-3 text-sm text-ink">
        {result.published > 0 ? (
          <p className="font-semibold text-ok">{counted(result.published, "form")} published as a new version.</p>
        ) : null}
        {result.failed.length > 0 ? (
          <div className="text-bad">
            <p className="font-semibold">
              {counted(result.failed.length, "form")} could not be published and{" "}
              {result.failed.length === 1 ? "stays" : "stay"} a draft. Open each one to fix it.
            </p>
            <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
              {result.failed.map((failure) => (
                <li key={failure.initiativeId}>
                  {failure.name}: {failure.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ErrorSummary
        title={problemsTitle(errors.length, "you publish")}
        items={errors.map((message) => ({ message }))}
        className="mb-0"
      />
      <Button aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        Publish all {count.toLocaleString("en-US")} {count === 1 ? "draft" : "drafts"}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] max-w-none rounded border border-line bg-white p-0 text-ink shadow-[0_4px_16px_rgba(10,26,48,0.16)] backdrop:bg-[#0a1a30]/50"
      >
        <div className="px-6 pb-2 pt-5">
          <h2 id={titleId} className="text-xl font-bold leading-7">
            Publish {counted(count, "draft")}?
          </h2>
          <p className="mt-2 text-[15px] leading-[22px]">
            {counted(count, "form")} will get a new version. New reports use it right away. Reports already started keep
            their version.
          </p>
          <p className="mt-2 text-sm text-muted">
            Each form is published on its own, so a form that fails does not hold back the others. Published versions
            cannot be changed. The change is recorded in the audit log under your name.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft px-6 py-4">
          <Button onClick={publish} disabled={pending} className="h-11 px-5 text-base">
            {pending ? "Publishing" : `Yes, publish ${counted(count, "draft")}`}
          </Button>
          <Button variant="ghost" className="px-0" onClick={() => dialog.current?.close()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </dialog>
    </div>
  );
}
