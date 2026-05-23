"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

// Reveals the full text on hover, but only when the wrapped element is
// actually clipped (scrollWidth exceeds clientWidth). No dependency, no Radix.
// The measured element is resolved from the DOM on hover: an explicit
// [data-ot-measure] node, else the first <input>, else the first child.
export function OverflowTooltip({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const [show, setShow] = React.useState(false);

  function handleEnter() {
    const wrap = wrapRef.current;
    if (!wrap || !text.trim()) return;
    const target =
      wrap.querySelector<HTMLElement>("[data-ot-measure]") ??
      wrap.querySelector<HTMLElement>("input") ??
      (wrap.firstElementChild as HTMLElement | null);
    if (target && target.scrollWidth > target.clientWidth + 1) {
      setShow(true);
    }
  }

  return (
    <span
      ref={wrapRef}
      className={cn("relative block min-w-0", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 max-w-[300px] whitespace-normal break-words rounded-[var(--r-sm)] bg-[color:var(--ink)] px-2.5 py-1.5 text-[12px] leading-snug text-[color:var(--paper)] shadow-[0_20px_48px_-24px_rgba(17,17,19,0.45)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}
