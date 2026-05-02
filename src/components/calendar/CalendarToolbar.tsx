"use client";
import { ChevronLeft, ChevronRight, Plus, PanelRight, PanelRightClose, BellRing } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { CalendarView } from "@/stores/useCalendarStore";

interface CalendarToolbarProps {
  cursor: Date;
  view: CalendarView;
  onView: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew?: () => void;
  trayOpen?: boolean;
  onToggleTray?: () => void;
  unscheduledCount?: number;
  onOpenInbox?: () => void;
  inboxCount?: number;
}

const VIEWS: CalendarView[] = ["month", "week", "team"];

export function CalendarToolbar({
  cursor,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
  onNew,
  trayOpen,
  onToggleTray,
  unscheduledCount = 0,
  onOpenInbox,
  inboxCount = 0,
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
          {VIEWS.map((v) => (
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
        {onOpenInbox && (
          <button
            onClick={onOpenInbox}
            className={cn(
              "relative h-9 w-9 grid place-items-center rounded-[var(--r-sm)] hairline text-[color:var(--ink-muted)] hover:bg-black/[0.04] transition-colors",
              inboxCount > 0 && "text-[color:var(--ink)]",
            )}
            aria-label={`Crew inbox (${inboxCount} pending)`}
            title={inboxCount > 0 ? `${inboxCount} pending confirmations` : "Crew inbox"}
          >
            <BellRing className="h-4 w-4" />
            {inboxCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-[color:var(--accent)] text-[color:var(--paper)] text-[9px] tabular grid place-items-center">
                {inboxCount}
              </span>
            )}
          </button>
        )}
        {onNew && (
          <Button size="sm" onClick={onNew} icon={<Plus className="h-3.5 w-3.5" />}>
            New event
          </Button>
        )}
        {onToggleTray && (
          <button
            onClick={onToggleTray}
            className={cn(
              "relative h-9 w-9 grid place-items-center rounded-[var(--r-sm)] hairline transition-colors",
              trayOpen
                ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
            )}
            aria-label={trayOpen ? "Close unscheduled tray" : "Open unscheduled tray"}
            title={trayOpen ? "Hide unscheduled tray" : "Show unscheduled tray"}
          >
            {trayOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            {!trayOpen && unscheduledCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-[color:var(--accent)] text-[color:var(--paper)] text-[9px] tabular grid place-items-center">
                {unscheduledCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
