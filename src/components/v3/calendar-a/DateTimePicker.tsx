"use client";
// V3 calendar-a — custom datetime picker.
//
// Replaces the native <input type="datetime-local"> + showPicker() approach so
// we control both the trigger anchor (so the calendar icon stays inside the
// field) and the popover (so it doesn't look like a generic browser surface).
// Clicking anywhere on the trigger opens the popover.

import * as React from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  label?: string;
  value: Date | null;
  onChange: (d: Date) => void;
  fallbackDate?: Date;
  // When the trigger renders an empty value, what to show.
  placeholder?: string;
  // Highlight only date (no time row). Useful if we ever want a date-only mode.
  dateOnly?: boolean;
}

const DAYS_OF_WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const LONG_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function DateTimePicker({
  label,
  value,
  onChange,
  fallbackDate,
  placeholder = "Pick a date & time",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState<Date>(() => {
    const base = value ?? fallbackDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (value) {
      setViewMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    }
  }, [value]);

  const display = value ? LONG_FORMAT.format(value) : placeholder;

  return (
    <div className="flex flex-col gap-1.5 relative">
      {label && (
        <label htmlFor={id} className="quiet-caps">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 items-center justify-between gap-2 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] pl-3 pr-2.5 transition-all hairline text-left w-full",
          open
            ? "shadow-[0_0_0_3px_rgba(79,70,229,0.18)] bg-white/90"
            : "hover:bg-white/85",
        )}
      >
        <span
          className={cn(
            "text-sm flex-1 min-w-0 truncate tabular",
            value ? "text-[color:var(--ink)]" : "text-[color:var(--ink-faint)]",
          )}
        >
          {display}
        </span>
        <CalendarIcon
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            open ? "text-[color:var(--accent)]" : "text-[color:var(--ink-muted)]",
          )}
        />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute top-[calc(100%+6px)] left-0 z-50 paper-card p-3 min-w-[268px]"
          style={{
            // Distinct elevation so the popover doesn't blend into the sheet behind it.
            boxShadow:
              "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(79,70,229,0.06)",
            borderRadius: "var(--r-lg)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <CalendarGrid
            viewMonth={viewMonth}
            onViewMonthChange={setViewMonth}
            value={value}
            onPickDate={(d) => {
              const next = new Date(d);
              if (value) {
                next.setHours(value.getHours(), value.getMinutes(), 0, 0);
              } else {
                next.setHours(9, 0, 0, 0);
              }
              onChange(next);
            }}
          />
          <div className="mt-3 pt-3 border-t border-[color:var(--ink-line)]">
            <TimePicker
              value={value ?? fallbackDate ?? new Date()}
              onChange={onChange}
            />
          </div>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-[color:var(--ink-line)]">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                now.setMinutes(Math.round(now.getMinutes() / 15) * 15, 0, 0);
                onChange(now);
                setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
              className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--accent)] hover:text-[color:var(--ink)] transition-colors"
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CalendarGridProps {
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  value: Date | null;
  onPickDate: (d: Date) => void;
}

function CalendarGrid({ viewMonth, onViewMonthChange, value, onPickDate }: CalendarGridProps) {
  const monthLabel = MONTH_LABEL.format(viewMonth);
  const today = new Date();
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
  ).getDate();

  const cells: Array<{ date: Date; outside: boolean }> = [];
  const prevMonthLast = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, prevMonthLast - i),
      outside: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d),
      outside: false,
    });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const n = new Date(last);
    n.setDate(n.getDate() + 1);
    cells.push({ date: n, outside: true });
  }

  function shiftMonth(delta: number) {
    onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  }

  function sameDate(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="font-display text-[13px] tracking-[-0.01em] text-[color:var(--ink)]">
          {monthLabel}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05] hover:text-[color:var(--ink)] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05] hover:text-[color:var(--ink)] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS_OF_WEEK.map((d, i) => (
          <div
            key={i}
            className="quiet-caps text-center !mb-0 text-[9px] text-[color:var(--ink-faint)]"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, i) => {
          const isToday = sameDate(c.date, today);
          const isSelected = value ? sameDate(c.date, value) : false;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPickDate(c.date)}
              className={cn(
                "h-7 w-full grid place-items-center text-[12px] tabular rounded-[var(--r-sm)] transition-colors",
                c.outside && !isSelected && "text-[color:var(--ink-faint)]",
                !c.outside && !isSelected && "text-[color:var(--ink)]",
                !isSelected && "hover:bg-[color:var(--accent-soft)]/60",
                isToday && !isSelected && "ring-1 ring-inset ring-[color:var(--accent)]/40",
                isSelected &&
                  "bg-[color:var(--accent)] text-[color:var(--paper)] font-medium ring-1 ring-[color:var(--accent)]",
              )}
            >
              {c.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const h = value.getHours();
  const m = value.getMinutes();
  const ampm: "AM" | "PM" = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;

  function setHour(h12new: number, ap: "AM" | "PM") {
    let h24 = h12new % 12;
    if (ap === "PM") h24 += 12;
    const next = new Date(value);
    next.setHours(h24, m, 0, 0);
    onChange(next);
  }

  function setMinute(mm: number) {
    const next = new Date(value);
    next.setHours(h, mm, 0, 0);
    onChange(next);
  }

  return (
    <div className="flex items-center gap-2 px-1">
      <Clock className="h-3 w-3 text-[color:var(--ink-muted)] shrink-0" />
      <input
        type="number"
        min={1}
        max={12}
        value={h12}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (Number.isNaN(raw)) return;
          const n = Math.max(1, Math.min(12, raw || 1));
          setHour(n, ampm);
        }}
        className="w-12 h-7 text-center text-[13px] tabular bg-white/70 hairline rounded-[var(--r-sm)] outline-none focus:shadow-[0_0_0_2px_rgba(79,70,229,0.18)]"
      />
      <span className="text-[color:var(--ink-muted)] font-medium">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={String(m).padStart(2, "0")}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (Number.isNaN(raw)) return;
          const n = Math.max(0, Math.min(59, raw || 0));
          setMinute(n);
        }}
        className="w-12 h-7 text-center text-[13px] tabular bg-white/70 hairline rounded-[var(--r-sm)] outline-none focus:shadow-[0_0_0_2px_rgba(79,70,229,0.18)]"
      />
      <div className="flex hairline rounded-[var(--r-sm)] overflow-hidden ml-auto">
        <button
          type="button"
          onClick={() => setHour(h12, "AM")}
          className={cn(
            "h-7 px-2 text-[11px] tabular tracking-wide transition-colors",
            ampm === "AM"
              ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
              : "bg-white/60 text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
          )}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => setHour(h12, "PM")}
          className={cn(
            "h-7 px-2 text-[11px] tabular tracking-wide transition-colors border-l border-[color:var(--ink-line)]",
            ampm === "PM"
              ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
              : "bg-white/60 text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
          )}
        >
          PM
        </button>
      </div>
    </div>
  );
}
