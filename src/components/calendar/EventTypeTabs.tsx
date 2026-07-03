"use client";
import { Hammer, CalendarCheck, Ban } from "lucide-react";
import { cn } from "@/lib/cn";

export type CalendarEventKind = "job" | "appointment" | "blocked";

const TABS: {
  key: CalendarEventKind;
  label: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  { key: "job", label: "Job event", icon: <Hammer className="h-3 w-3" />, hint: "Tied to a job" },
  {
    key: "appointment",
    label: "Appointment",
    icon: <CalendarCheck className="h-3 w-3" />,
    hint: "Estimate or client meeting",
  },
  {
    key: "blocked",
    label: "Blocked time",
    icon: <Ban className="h-3 w-3" />,
    hint: "Vacation or unavailable",
  },
];

export function EventTypeTabs({
  value,
  onChange,
  hiddenKinds,
}: {
  value: CalendarEventKind;
  onChange: (v: CalendarEventKind) => void;
  /** Event kinds to hide from the picker (feature-gated, not removed). */
  hiddenKinds?: CalendarEventKind[];
}) {
  const tabs = TABS.filter((t) => !hiddenKinds?.includes(t.key));
  const active = tabs.find((t) => t.key === value);
  return (
    <div>
      <div className="inline-flex w-full rounded-[var(--r-md)] hairline p-0.5 bg-white/60 dark:bg-white/[0.03]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-[var(--r-sm)] text-[12px] font-medium transition-colors",
              value === t.key
                ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
            )}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {active && (
        <div className="mt-1.5 text-[10.5px] text-[color:var(--ink-muted)] tracking-[0.04em] tabular px-1">
          {active.hint}
        </div>
      )}
    </div>
  );
}
