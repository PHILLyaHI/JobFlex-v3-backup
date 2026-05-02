"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label
      className={cn(
        "flex items-start justify-between gap-3 py-3 cursor-pointer",
        disabled && "opacity-60 pointer-events-none",
      )}
    >
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <div className="text-[13px] font-medium text-[color:var(--ink)]">{label}</div>
          )}
          {description && (
            <div className="text-[11px] text-[color:var(--ink-muted)] leading-relaxed mt-0.5">
              {description}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 mt-0.5",
          checked ? "bg-[color:var(--accent)]" : "bg-[color:var(--ink-line)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}
