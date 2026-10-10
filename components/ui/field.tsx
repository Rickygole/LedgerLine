import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-sm border border-field bg-white px-3 py-2 text-base text-ink sm:text-sm placeholder:text-muted disabled:border-line-strong disabled:bg-surface disabled:text-muted aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-28 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export function OptionalMark() {
  return <span className="font-normal text-muted"> (optional)</span>;
}

export function Label({ htmlFor, children, optional, className }: { htmlFor?: string; children: React.ReactNode; required?: boolean; optional?: boolean; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block text-sm font-semibold text-ink", className)}>
      {children}
      {optional ? <OptionalMark /> : null}
    </label>
  );
}

export function Hint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mb-1.5 text-sm text-muted">
      {children}
    </p>
  );
}

export function FieldError({ id, children, className }: { id?: string; children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} className={cn("mt-1.5 text-sm font-semibold text-bad", className)}>
      {children}
    </p>
  );
}
