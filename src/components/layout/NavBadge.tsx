import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * NavBadge — the unread / pending-action count for navigation items.
 *
 * A quiet ink pill with white tabular numerals. Deliberately NOT the sage
 * accent: the accent is reserved for the active-nav signal, primary actions,
 * and Accepted/Paid state (One Accent Rule). A count is a neutral quantity, so
 * it gets the same treatment as the active filter-chip count already in the
 * system. Dark-on-light reads in direct sunlight without shouting like a
 * consumer red-bubble.
 *
 * `count <= 0` renders nothing, so callers can pass a raw count unguarded.
 * Counts above `max` (default 99) collapse to "99+".
 */
export function NavBadge({
  count,
  max = 99,
  size = "md",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  count: number;
  max?: number;
  /** `md` = sidebar trailing pill · `sm` = tab-bar icon corner. */
  size?: "sm" | "md";
}) {
  if (!count || count <= 0) return null;
  const label = count > max ? `${max}+` : String(count);
  return (
    <span
      aria-label={`${count} new`}
      className={cn(
        "inline-grid place-items-center rounded-full tabular font-medium leading-none",
        "bg-[color:var(--ink)] text-white",
        size === "md"
          ? "min-w-[18px] h-[18px] px-1.5 text-[11px]"
          : "min-w-[16px] h-[16px] px-1 text-[10px]",
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}
