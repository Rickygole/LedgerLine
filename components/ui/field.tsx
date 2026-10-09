import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted/70 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/20 disabled:bg-surface disabled:text-muted aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/20";

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

export function Label({ htmlFor, children, required, className }: { htmlFor?: string; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-semibold text-ink", className)}>
      {children}
      {required ? <span className="ml-1 font-normal text-muted">(required)</span> : null}
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

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-semibold text-bad">
      {children}
    </p>
  );
}
