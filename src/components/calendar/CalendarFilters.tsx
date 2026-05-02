"use client";
import * as React from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface FilterWorker {
  id: string;
  name: string;
}

const STATUSES = [
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELED", label: "Canceled" },
];

interface Props {
  workers: FilterWorker[];
  selectedWorkerIds: string[];
  selectedStatuses: string[];
  query: string;
  onWorkersChange: (ids: string[]) => void;
  onStatusesChange: (s: string[]) => void;
  onQueryChange: (q: string) => void;
  onClear: () => void;
}

export function CalendarFilters({
  workers,
  selectedWorkerIds,
  selectedStatuses,
  query,
  onWorkersChange,
  onStatusesChange,
  onQueryChange,
  onClear,
}: Props) {
  const activeCount =
    selectedWorkerIds.length + selectedStatuses.length + (query.trim() ? 1 : 0);

  return (
    <div className="paper-card flex flex-wrap items-center gap-3 px-3 py-2 mb-5">
      {/* Workers */}
      <WorkerPicker
        workers={workers}
        selected={selectedWorkerIds}
        onChange={onWorkersChange}
      />
      <Divider />

      {/* Statuses */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUSES.map((s) => {
          const on = selectedStatuses.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() =>
                onStatusesChange(
                  on
                    ? selectedStatuses.filter((x) => x !== s.key)
                    : [...selectedStatuses, s.key],
                )
              }
              className={cn(
                "h-7 rounded-full px-2.5 text-[11px] hairline transition-colors",
                on
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <Divider />

      {/* Search */}
      <div className="flex-1 min-w-[200px] max-w-[320px] relative">
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Client name…"
          prefix={<Search className="h-3 w-3" />}
          suffix={
            query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="Clear search"
                className="text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : undefined
          }
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {activeCount > 0 && (
          <button
            onClick={onClear}
            className="text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] tabular inline-flex items-center gap-1.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
            {activeCount} active filter{activeCount === 1 ? "" : "s"} · Clear
          </button>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden md:block w-px h-5 bg-[color:var(--ink-line)] mx-1" />;
}

function WorkerPicker({
  workers,
  selected,
  onChange,
}: {
  workers: FilterWorker[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        {selected.length === 0 ? (
          <button
            onClick={() => setOpen((x) => !x)}
            className="h-7 px-2.5 rounded-full hairline text-[11px] text-[color:var(--ink-muted)] hover:bg-black/[0.04] inline-flex items-center gap-1.5"
          >
            All workers
            <ChevronDown className="h-3 w-3" />
          </button>
        ) : (
          <>
            {selected.map((id) => {
              const w = workers.find((x) => x.id === id);
              if (!w) return null;
              return (
                <span
                  key={id}
                  className="h-7 px-1.5 rounded-full hairline bg-white/60 dark:bg-white/[0.04] inline-flex items-center gap-1.5 text-[11px]"
                >
                  <Avatar name={w.name} size={18} />
                  <span className="text-[color:var(--ink-soft)]">{w.name.split(" ")[0]}</span>
                  <button
                    onClick={() => onChange(selected.filter((x) => x !== id))}
                    aria-label={`Remove ${w.name}`}
                    className="text-[color:var(--ink-muted)] hover:text-rose-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={() => setOpen((x) => !x)}
              className="h-7 px-2 rounded-full hairline text-[11px] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
            >
              + Add
            </button>
          </>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-[260px] paper-card shadow-pop overflow-hidden">
          <div className="px-3 py-2 border-b border-[color:var(--ink-line)] quiet-caps">
            Workers
          </div>
          <ul className="max-h-[260px] overflow-y-auto py-1">
            {workers.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">
                No workers yet.
              </li>
            )}
            {workers.map((w) => {
              const on = selected.includes(w.id);
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        on ? selected.filter((x) => x !== w.id) : [...selected, w.id],
                      )
                    }
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px]",
                      on
                        ? "bg-[color:var(--accent-soft)]/50 text-[color:var(--accent-ink)]"
                        : "hover:bg-black/[0.02]",
                    )}
                  >
                    <Avatar name={w.name} size={22} />
                    <span className="flex-1 truncate">{w.name}</span>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
