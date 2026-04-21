import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-[color:var(--ink-soft)] dark:bg-white/[0.06]",
  accent: "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]",
  success: "bg-emerald-50 text-emerald-800",
  warn: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-800",
  info: "bg-sky-50 text-sky-800",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em]",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
