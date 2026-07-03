"use client";
// Styled single-select dropdown. Unlike a native <select>, the open list is
// our own markup (hairline card, sage-tinted active row, check on the current
// value) so it matches the calendar's other custom pickers instead of the OS
// menu. Floating + flush under the trigger, closes on outside-click / Escape.

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectMenuOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
}

export function SelectMenu({ value, onChange, options, placeholder = "Select…" }: Props) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "w-full h-9 pl-3 pr-2 rounded-[var(--r-md)] hairline bg-white/70 text-left flex items-center gap-2 transition-shadow",
          "text-[13px] text-[color:var(--ink)]",
          open && "shadow-[0_0_0_3px_rgba(31,122,82,0.18)]",
        )}
      >
        <span className={cn("flex-1 min-w-0 truncate", !selected && "text-[color:var(--ink-muted)]")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 top-full mt-1 paper-card p-0 overflow-hidden max-h-[248px] overflow-y-auto"
          style={{ boxShadow: "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(31,122,82,0.06)" }}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors",
                    on
                      ? "bg-[color-mix(in_srgb,var(--accent-soft)_50%,transparent)] text-[color:var(--ink)]"
                      : "text-[color:var(--ink-soft)] hover:bg-black/[0.02]",
                  )}
                >
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                  {on && <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
