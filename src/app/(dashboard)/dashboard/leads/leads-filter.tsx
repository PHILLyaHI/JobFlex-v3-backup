"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLeadFilterStore } from "@/stores/useLeadFilterStore";
import { LEAD_STATUSES, sourceLabel } from "./leads-shared";

interface Props {
  /** Distinct source values present in the current lead set. */
  sources: string[];
  /** Distinct specialty / AI-category values present in the current lead set. */
  specialties: string[];
}

/**
 * Single "Filters" button that reveals status / source / specialty controls in a
 * popover, instead of spending a full row on always-visible status pills. Reads and
 * writes the shared useLeadFilterStore so the All-Leads table reacts live.
 */
export function LeadsFilter({ sources, specialties }: Props) {
  const status = useLeadFilterStore((s) => s.status);
  const setStatus = useLeadFilterStore((s) => s.setStatus);
  const source = useLeadFilterStore((s) => s.source);
  const setSource = useLeadFilterStore((s) => s.setSource);
  const specialty = useLeadFilterStore((s) => s.specialty);
  const setSpecialty = useLeadFilterStore((s) => s.setSpecialty);
  const reset = useLeadFilterStore((s) => s.reset);

  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount =
    (status !== "ALL" ? 1 : 0) + (source ? 1 : 0) + (specialty ? 1 : 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((x) => !x)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium transition-all",
          activeCount > 0 || open
            ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
            : "text-[color:var(--ink-soft)] hairline hover:bg-black/[0.04]",
        )}
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 opacity-80" />
        Filters
        {activeCount > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white/20 px-1 text-[10px] tabular">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-11 z-30 w-[300px] paper-card !p-0 shadow-pop overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <span className="quiet-caps !mb-0">Filter leads</span>
              {activeCount > 0 && (
                <button
                  onClick={reset}
                  className="text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-4 pb-4 space-y-4">
              <FilterGroup label="Status">
                {LEAD_STATUSES.map((s) => (
                  <FilterChip
                    key={s}
                    active={status === s}
                    clearable={s !== "ALL"}
                    onClick={() => setStatus(status === s && s !== "ALL" ? "ALL" : s)}
                  >
                    {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                  </FilterChip>
                ))}
              </FilterGroup>

              {sources.length > 0 && (
                <FilterGroup label="Source">
                  <FilterChip active={!source} clearable={false} onClick={() => setSource(undefined)}>
                    All
                  </FilterChip>
                  {sources.map((s) => (
                    <FilterChip
                      key={s}
                      active={source === s}
                      clearable
                      onClick={() => setSource(source === s ? undefined : s)}
                    >
                      {sourceLabel(s)}
                    </FilterChip>
                  ))}
                </FilterGroup>
              )}

              {specialties.length > 0 && (
                <FilterGroup label="Specialty">
                  <FilterChip active={!specialty} clearable={false} onClick={() => setSpecialty(undefined)}>
                    All
                  </FilterChip>
                  {specialties.map((s) => (
                    <FilterChip
                      key={s}
                      active={specialty === s}
                      clearable
                      onClick={() => setSpecialty(specialty === s ? undefined : s)}
                    >
                      {s}
                    </FilterChip>
                  ))}
                </FilterGroup>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="quiet-caps mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  clearable = true,
  onClick,
  children,
}: {
  active: boolean;
  clearable?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors",
        active
          ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
          : "text-[color:var(--ink-muted)] hairline hover:bg-black/[0.04]",
      )}
    >
      {active && clearable && <X className="h-3 w-3 opacity-70" />}
      {children}
    </button>
  );
}
