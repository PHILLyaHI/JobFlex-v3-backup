"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import { PreviewTag, PreviewNote } from "./PreviewTag";

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-3 text-left focus-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-[color:var(--ink)]">
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block max-w-[60ch] text-[11.5px] leading-relaxed text-[color:var(--ink-muted)]">
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked
            ? "bg-[color:var(--ink)]"
            : "bg-[color:var(--ink-line)]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}

// Bucket C — the 4 toggles live in component state until the schema gains the
// matching boolean columns. Labels mirror the spec verbatim so they round-trip
// once persisted.
export function OptionsBlock() {
  const [hideBreakdown, setHideBreakdown] = React.useState(false);
  const [laborOnly, setLaborOnly] = React.useState(false);
  const [showSignature, setShowSignature] = React.useState(true);
  const [showScope, setShowScope] = React.useState(true);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="inline-flex items-center gap-2">
            Proposal options <PreviewTag />
          </CardTitle>
          <CardSubtitle>
            Tweaks that change what the client sees on the final PDF.
          </CardSubtitle>
        </div>
      </CardHeader>
      <div className="divide-y divide-[color:var(--ink-line)]">
        <ToggleRow
          label="Hide breakdown costs"
          hint="Show only line totals on the proposal — keep the material / labor split internal."
          checked={hideBreakdown}
          onChange={setHideBreakdown}
        />
        <ToggleRow
          label="Labor-only proposal"
          hint="Suppress material rows so the proposal reads as a pure labor quote."
          checked={laborOnly}
          onChange={setLaborOnly}
        />
        <ToggleRow
          label="Show signature lines"
          hint="Add signature blocks at the foot of the proposal for you and the client."
          checked={showSignature}
          onChange={setShowSignature}
        />
        <ToggleRow
          label="Show scope of work"
          hint="Include the scope text on the PDF. Turn off for ultra-compact proposals."
          checked={showScope}
          onChange={setShowScope}
        />
      </div>
      <PreviewNote>
        Persisting these needs four boolean columns on the Proposal model
        (`hideBreakdown`, `laborOnly`, `showSignature`, `showScope`). For now
        they hold their state inside the builder only.
      </PreviewNote>
    </Card>
  );
}
