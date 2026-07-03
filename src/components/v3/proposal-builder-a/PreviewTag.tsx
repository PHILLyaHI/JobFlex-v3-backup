import * as React from "react";
import { cn } from "@/lib/cn";

// Marks a section / field that is wired in the UI but does not yet persist —
// schema columns for these features are not in place yet. The treatment is
// deliberately quiet: a small amber chip so contractors don't mistake it
// for shipped behaviour, no accent sage (which is reserved).
export function PreviewTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-amber-50 px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.12em] text-amber-800",
        className,
      )}
    >
      Preview
    </span>
  );
}

export function PreviewNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 max-w-[60ch] text-[11px] leading-relaxed text-[color:var(--ink-muted)]">
      <span className="mr-1 inline-block rounded-[2px] bg-amber-50 px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.1em] text-amber-800">
        Preview
      </span>
      {children}
    </p>
  );
}
