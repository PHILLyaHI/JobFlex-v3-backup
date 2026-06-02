"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, id, children, ...props },
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
      <div className="relative flex h-10 items-center rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] hairline transition-all focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]">
        <select
          ref={ref}
          id={inputId}
          className={cn(
            "w-full appearance-none bg-transparent pl-3 pr-9 text-sm text-[color:var(--ink)] outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[color:var(--ink-muted)]" />
      </div>
      {hint && <p className="text-[11px] text-[color:var(--ink-muted)]">{hint}</p>}
    </div>
  );
});
