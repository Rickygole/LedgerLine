"use client";

import { GripVertical } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { TYPE_LABEL } from "@/lib/forms/editor/definition";
import type { FormDefinition } from "@/lib/rules/types";

export function QuestionOutline({
  definition,
  sectionKey,
  selectedKey,
  budgetKey,
  canReorder,
  onSection,
  onSelect,
  onReorder,
}: {
  definition: FormDefinition;
  sectionKey: string;
  selectedKey: string | null;
  budgetKey: string;
  canReorder: boolean;
  onSection: (key: string) => void;
  onSelect: (sectionKey: string, questionKey: string) => void;
  onReorder: (sectionKey: string, from: number, to: number) => void;
}) {
  const [dragging, setDragging] = useState<{ section: string; index: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <nav aria-label="Form outline" className="rounded-xl border border-line bg-white shadow-card">
      <p className="border-b border-line px-4 py-3 text-[13px] font-semibold text-muted">Outline</p>
      <ul className="p-2">
        {definition.sections.map((section) => {
          const key = section.kind === "budget" ? budgetKey : section.key;
          const current = sectionKey === key;
          return (
            <li key={section.key} className="mb-1 last:mb-0">
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => onSection(key)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                  current ? "bg-navy-50 font-semibold text-navy-900" : "font-medium text-ink hover:bg-surface",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{section.title}</span>
                </span>
                <span className="num text-xs font-normal text-muted">
                  {section.kind === "budget" ? (definition.budget.enabled ? "On" : "Off") : section.questions.length}
                </span>
              </button>
              {current && section.kind === "questions" && section.questions.length > 0 ? (
                <ol className="mt-1 space-y-px border-l border-line pl-2 ml-3">
                  {section.questions.map((question, index) => {
                    return (
                      <li
                        key={question.key}
                        draggable={canReorder}
                        onDragStart={(event) => {
                          setDragging({ section: section.key, index });
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => {
                          if (!dragging || dragging.section !== section.key) return;
                          event.preventDefault();
                          setOver(index);
                        }}
                        onDragLeave={() => setOver((value) => (value === index ? null : value))}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (dragging && dragging.section === section.key && dragging.index !== index)
                            onReorder(section.key, dragging.index, index);
                          setDragging(null);
                          setOver(null);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        className={cn(
                          "group flex items-center rounded-md",
                          over === index && "ring-2 ring-inset ring-navy-600/40",
                          dragging?.index === index && dragging.section === section.key && "opacity-50",
                        )}
                      >
                        {canReorder ? (
                          <GripVertical
                            className="h-3.5 w-3.5 shrink-0 cursor-grab text-line-strong group-hover:text-muted"
                            aria-hidden="true"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onSelect(section.key, question.key)}
                          aria-current={selectedKey === question.key ? "true" : undefined}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px]",
                            selectedKey === question.key ? "bg-navy-50 text-navy-900" : "text-ink hover:bg-surface",
                          )}
                        >
                          <span className="truncate">{question.label || "Untitled question"}</span>
                          <span className="sr-only">, {TYPE_LABEL[question.type]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canReorder ? (
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Drag to reorder, or use the arrows on each question.
        </p>
      ) : null}
    </nav>
  );
}
