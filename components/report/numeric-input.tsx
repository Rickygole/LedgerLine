"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Input } from "@/components/ui/field";
import { sanitizeNumeric, typedCharsAllowed, type NumericKind } from "@/lib/rules/numeric-input";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> & {
  kind: NumericKind;
  onValueChange: (value: string) => void;
  bare?: boolean;
};

export const NumericInput = forwardRef<HTMLInputElement, Props>(function NumericInput(
  { kind, onValueChange, bare, inputMode, ...rest },
  forwarded,
) {
  const ref = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLInputElement);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const block = (event: InputEvent) => {
      if (event.inputType !== "insertText" || event.data === null) return;
      if (!typedCharsAllowed(kind, event.data)) event.preventDefault();
    };
    element.addEventListener("beforeinput", block);
    return () => element.removeEventListener("beforeinput", block);
  }, [kind]);
  const props = {
    ref,
    type: "text",
    inputMode: inputMode ?? (kind === "integer" ? "numeric" : "decimal"),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(sanitizeNumeric(kind, event.target.value)),
    ...rest,
  } as const;
  return bare ? <input {...props} /> : <Input {...props} />;
});
