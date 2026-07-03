"use client";
// Multi-select worker picker: a hairline trigger that reads like a field,
// opening a searchable popover roster. Replaces the old toggle-badge row.
// Availability is a single 6px dot per row — sage-free / rose-busy — with the
// conflict spelled out in muted text, never a loud badge.

import * as React from "react";
import { Search, X, Check, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface PickerWorker {
  id: string;
  name: string;
  specialties: string[];
}

/** null = free; {kind,label} = busy with that conflict; undefined = unknown. */
export type WorkerConflict = { kind: string; label: string } | null | undefined;

interface Props {
  label: string;
  workers: PickerWorker[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  conflicts?: Record<string, WorkerConflict>;
  placeholder?: string;
  hint?: string | null;
}

export function WorkerMultiPicker({
  label,
  workers,
  selectedIds,
  onChange,
  conflicts,
  placeholder = "Add workers…",
  hint,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
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

  const q = query.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.specialties.some((s) => s.toLowerCase().includes(q)),
    );
  }, [workers, q]);

  const selected = workers.filter((w) => selectedIds.includes(w.id));

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="quiet-caps mb-1.5">{label}</div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "w-full min-h-10 px-3 py-1.5 rounded-[var(--r-md)] hairline bg-white text-left",
          "flex items-center gap-1.5 flex-wrap transition-shadow",
          open && "shadow-[0_0_0_3px_rgba(31,122,82,0.18)]",
        )}
      >
        {selected.length === 0 && (
          <span className="text-[13px] text-[color:var(--ink-muted)]">
            {workers.length === 0 ? "No workers in your roster yet." : placeholder}
          </span>
        )}
        {selected.map((w) => (
          <span
            key={w.id}
            className="inline-flex items-center gap-1.5 h-7 pl-1 pr-1.5 rounded-full bg-black/[0.04] text-[11px] text-[color:var(--ink)]"
          >
            <Avatar name={w.name} size={18} />
            {w.name.split(" ")[0]}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                toggle(w.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle(w.id);
                }
              }}
              className="h-4 w-4 grid place-items-center rounded-full text-[color:var(--ink-muted)] hover:bg-black/[0.08]"
              aria-label={`Remove ${w.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </span>
        ))}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 ml-auto shrink-0 text-[color:var(--ink-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && workers.length > 0 && (
        <div
          className="absolute z-30 mt-1.5 w-full paper-card p-0 overflow-hidden"
          style={{ boxShadow: "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(31,122,82,0.06)" }}
        >
          <div className="p-2 border-b border-[color:var(--ink-line)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[color:var(--ink-muted)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or specialty…"
                className="w-full h-8 pl-8 pr-2 rounded-[var(--r-sm)] bg-black/[0.03] text-[12.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] outline-none"
              />
            </div>
          </div>
          <ul role="listbox" aria-multiselectable className="max-h-[248px] overflow-y-auto">
            {results.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">No matches.</li>
            )}
            {results.map((w) => {
              const on = selectedIds.includes(w.id);
              const conflict = conflicts?.[w.id];
              return (
                <li key={w.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(w.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/[0.02]",
                      on && "bg-[color-mix(in_srgb,var(--accent-soft)_40%,transparent)]",
                    )}
                  >
                    <Avatar name={w.name} size={24} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                          {w.name}
                        </span>
                        {conflict !== undefined && (
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              conflict
                                ? "bg-[color:var(--rose)]"
                                : "bg-[color:var(--accent)]",
                            )}
                            title={conflict ? `Busy: ${conflict.label}` : "Available"}
                          />
                        )}
                      </div>
                      <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                        {conflict
                          ? `Busy · ${conflict.label}`
                          : w.specialties.length > 0
                            ? w.specialties.join(" · ")
                            : conflict === null
                              ? "Available"
                              : "—"}
                      </div>
                    </div>
                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hint && <p className="text-[10px] text-[color:var(--ink-muted)] mt-2">{hint}</p>}
    </div>
  );
}
