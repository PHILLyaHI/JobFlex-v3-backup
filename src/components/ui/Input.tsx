"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, prefix, suffix, id, ...props },
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
          "flex h-10 items-center gap-2 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] px-3 transition-all hairline focus-within:shadow-[0_0_0_3px_rgba(79,70,229,0.18)]",
          error && "shadow-[0_0_0_3px_rgba(225,29,72,0.22)]",
        )}
      >
        {prefix && <span className="text-[color:var(--ink-muted)] shrink-0">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "peer flex-1 bg-transparent text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] outline-none",
            className,
          )}
          {...props}
        />
        {suffix && <span className="text-[color:var(--ink-muted)] shrink-0">{suffix}</span>}
      </div>
      {(hint || error) && (
        <p className={cn("text-[11px]", error ? "text-[color:var(--rose)]" : "text-[color:var(--ink-muted)]")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
