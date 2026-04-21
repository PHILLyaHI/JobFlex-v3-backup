import * as React from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "paper-card flex flex-col items-center justify-center gap-4 py-20 px-8 text-center",
        className,
      )}
    >
      {icon && (
        <div className="h-12 w-12 rounded-full bg-[color:var(--accent-soft)] flex items-center justify-center text-[color:var(--accent)]">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className="font-display text-[20px] tracking-[-0.015em]">{title}</h3>
        {description && (
          <p className="text-[13px] text-[color:var(--ink-muted)] max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
