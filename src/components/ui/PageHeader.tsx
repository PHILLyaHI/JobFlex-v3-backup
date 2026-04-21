import * as React from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 pb-8", className)}>
      <div className="max-w-2xl">
        {eyebrow && <div className="quiet-caps mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--ink-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
