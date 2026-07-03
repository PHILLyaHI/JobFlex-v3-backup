"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  className?: string;
}

/**
 * Numbered pager (1 · 2 · 3 …) for long client-side lists. Hides itself when
 * there's only one page. Windowed: always shows first, last, and current ±1,
 * with hairline ellipses between gaps. Active page is the ink pill the rest of
 * the app uses for "selected".
 */
export function Pagination({ page, pageCount, onPage, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  const window = pageWindow(page, pageCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1.5 pt-6", className)}
    >
      <Arrow
        ariaLabel="Previous page"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Arrow>

      {window.map((n, i) =>
        n === "gap" ? (
          <span
            key={`gap-${i}`}
            className="px-1 text-[12px] text-[color:var(--ink-faint)] select-none"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              "h-8 min-w-8 px-2 rounded-[var(--r-sm)] text-[12px] font-medium tabular transition-colors focus-ring",
              n === page
                ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hairline hover:bg-black/[0.04]",
            )}
          >
            {n}
          </button>
        ),
      )}

      <Arrow
        ariaLabel="Next page"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Arrow>
    </nav>
  );
}

function Arrow({
  children,
  disabled,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 w-8 grid place-items-center rounded-[var(--r-sm)] hairline text-[color:var(--ink-muted)] transition-colors focus-ring",
        disabled ? "opacity-40 pointer-events-none" : "hover:bg-black/[0.04]",
      )}
    >
      {children}
    </button>
  );
}

// First, last, and current ±1 — with a "gap" marker wherever the run skips.
function pageWindow(page: number, count: number): (number | "gap")[] {
  const wanted = new Set<number>([1, count, page, page - 1, page + 1]);
  const sorted = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}
