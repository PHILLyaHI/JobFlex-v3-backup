"use client";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface CalendarToolbarProps {
  cursor: Date;
  view: "month" | "week";
  onView: (v: "month" | "week") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew?: () => void;
}

export function CalendarToolbar({
  cursor,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
  onNew,
}: CalendarToolbarProps) {
  const title =
    view === "month"
      ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(cursor)
      : (() => {
          const start = new Date(cursor);
          start.setDate(start.getDate() - start.getDay());
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          const sameMonth = start.getMonth() === end.getMonth();
          const sMo = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);
          const eMo = new Intl.DateTimeFormat("en-US", { month: "short" }).format(end);
          return sameMonth
            ? `${sMo} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
            : `${sMo} ${start.getDate()} – ${eMo} ${end.getDate()}, ${end.getFullYear()}`;
        })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="h-9 w-9 rounded-[var(--r-sm)] hairline grid place-items-center text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onNext}
          className="h-9 w-9 rounded-[var(--r-sm)] hairline grid place-items-center text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <div className="ml-3 font-display text-[22px] tracking-[-0.015em] text-[color:var(--ink)]">
          {title}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-[var(--r-md)] hairline p-0.5 bg-white/60 dark:bg-white/[0.03]">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onView(v)}
              className={cn(
                "h-8 px-3 rounded-[var(--r-sm)] text-[12px] font-medium transition-colors capitalize",
                view === v
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {onNew && (
          <Button size="sm" onClick={onNew} icon={<Plus className="h-3.5 w-3.5" />}>
            New event
          </Button>
        )}
      </div>
    </div>
  );
}
