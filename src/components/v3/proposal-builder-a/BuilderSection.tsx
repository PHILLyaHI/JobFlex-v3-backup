import * as React from "react";
import { cn } from "@/lib/cn";

// Editorial worksheet section. Flat on the paper surface — no card. Structure
// comes from the hairline rule between sections and the numeric index, not
// from a wrapped container. (DESIGN.md: No-Decorative-Card, Editorial-over-template.)
export function BuilderSection({
  index,
  title,
  subtitle,
  action,
  badge,
  first,
  children,
}: {
  index: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "py-8",
        first ? "pt-0" : "border-t border-[color:var(--ink-line)]",
      )}
    >
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 font-display text-[13px] tabular tracking-[0.04em] text-[color:var(--ink-faint)]">
            {index}
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-[18px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
              <span>{title}</span>
              {badge}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[color:var(--ink-muted)]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}
