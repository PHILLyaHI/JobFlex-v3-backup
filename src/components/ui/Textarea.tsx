"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, id, rows = 4, ...props },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="quiet-caps">
          {label}
        </label>
      )}
      <div
        className={cn(
          "rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] p-3 transition-all hairline focus-within:shadow-[0_0_0_3px_rgba(79,70,229,0.18)]",
          error && "shadow-[0_0_0_3px_rgba(225,29,72,0.22)]",
        )}
      >
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className={cn(
            "w-full bg-transparent text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] outline-none resize-none leading-relaxed",
            className,
          )}
          {...props}
        />
      </div>
      {(hint || error) && (
        <p className={cn("text-[11px]", error ? "text-[color:var(--rose)]" : "text-[color:var(--ink-muted)]")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
