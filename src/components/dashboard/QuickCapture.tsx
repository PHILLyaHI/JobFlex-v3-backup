"use client";
import * as React from "react";
import Link from "next/link";
import { UserPlus, CalendarPlus } from "lucide-react";

interface CaptureEntry {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const ENTRIES: CaptureEntry[] = [
  {
    label: "Add lead",
    href: "/dashboard/leads",
    icon: <UserPlus className="h-4 w-4" />,
  },
  {
    label: "Schedule job",
    href: "/dashboard/jobs/new",
    icon: <CalendarPlus className="h-4 w-4" />,
  },
];

export function QuickCapture() {
  return (
    <section className="px-5">
      <div className="quiet-caps mb-2.5">Capture</div>
      <div className="grid grid-cols-2 gap-2.5">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.label}
            href={entry.href as never}
            className="paper-card flex items-center gap-2.5 px-3.5 py-3 hover:bg-black/[0.02] focus-ring transition-colors"
          >
            <span className="text-[color:var(--ink-muted)] shrink-0">{entry.icon}</span>
            <span className="text-[13px] font-medium text-[color:var(--ink)] truncate">
              {entry.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
