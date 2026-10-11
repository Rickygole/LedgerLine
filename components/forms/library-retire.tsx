"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreLibraryQuestion, retireLibraryQuestion } from "@/app/finance/question-library/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { Hint, Input, Label } from "@/components/ui/field";

export function LibraryRetire({
  questionKey,
  retired,
  protectedQuestion,
}: {
  questionKey: string;
  retired: boolean;
  protectedQuestion: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = retired
        ? await restoreLibraryQuestion(questionKey)
        : await retireLibraryQuestion(questionKey, reason);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title={retired ? "Restore this question" : "Retire this question"}
        description={
          retired
            ? "A retired question is hidden from the form editor and from new forms. Restoring it makes it available again."
            : "A retired question is hidden from the form editor and from new forms. Forms and reports that already use it keep it."
        }
      />
      <CardBody className="space-y-4">
        <ErrorSummary
          title={problemsTitle(errors.length, "you continue")}
          items={errors.map((message) => ({ message }))}
          className="mb-0"
        />
        {retired ? null : protectedQuestion ? (
          <p className="text-sm text-muted">
            This question identifies the reporting organization on every report, so it cannot be retired.
          </p>
        ) : (
          <div className="max-w-xl">
            <Label htmlFor="retire-reason">Reason</Label>
            <Hint>Recorded in the audit log.</Hint>
            <Input id="retire-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {protectedQuestion && !retired ? null : (
          <Button
            variant={retired ? "secondary" : "danger"}
            onClick={run}
            disabled={pending || (!retired && !reason.trim())}
          >
            {pending ? "Saving" : retired ? "Restore question" : "Retire question"}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
