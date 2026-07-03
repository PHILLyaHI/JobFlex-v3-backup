import * as React from "react";
import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Opt-in resting elevation + a small, smooth lift on hover. Off by default
   *  so non-dashboard surfaces keep the quiet hairline look. */
  hover?: boolean;
}

export function Card({ className, hover, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "paper-card p-6",
        hover &&
          // `!` overrides .paper-card's unlayered resting box-shadow; tokens are reused, not new.
          "transition duration-200 ease-[var(--ease)] !shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:!shadow-[var(--shadow-md)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 pb-4 mb-5 border-b border-[color:var(--ink-line)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-[17px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]", className)}
      {...props}
    />
  );
}

export function CardSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-[color:var(--ink-muted)] mt-0.5", className)} {...props} />;
}

export function GlassPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("paper-card p-5", className)} {...props} />;
}
