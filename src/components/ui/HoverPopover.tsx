"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * Hand-rolled hover popover (no Radix, per house rules). The panel renders in a
 * portal with FIXED positioning computed from the trigger's rect, so it can't
 * be clipped by scroll containers (the sidebar nav is overflow-y-auto).
 *
 * Opens on hover (delayed) and keyboard focus; a click/tap toggles it for
 * touch. Closes on mouse-out, Escape, outside tap, scroll, or resize. The
 * panel itself is hoverable so links inside it are reachable.
 */
export function HoverPopover({
  content,
  children,
  side = "right",
  openDelay = 150,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "right" | "top" | "bottom";
  openDelay?: number;
  /** Extra classes for the panel (width, padding overrides). */
  className?: string;
}) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const open = pos !== null;

  const place = React.useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    if (side === "right") setPos({ top: r.top + r.height / 2, left: r.right + 10 });
    else if (side === "top") setPos({ top: r.top - 10, left: r.left + r.width / 2 });
    else setPos({ top: r.bottom + 10, left: r.left + r.width / 2 });
  }, [side]);

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = window.setTimeout(place, openDelay);
  };
  // A short grace so the pointer can travel from the trigger into the panel.
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setPos(null), 120);
  };

  React.useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    // Fixed positioning goes stale the moment anything scrolls — just close.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  React.useEffect(() => clearTimers, []);

  const translate =
    side === "right"
      ? "translateY(-50%)"
      : side === "top"
        ? "translate(-50%, -100%)"
        : "translateX(-50%)";

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
        onClick={(e) => {
          // Tap-to-toggle for touch; don't let the tap bubble into a wrapping
          // link/row action.
          e.preventDefault();
          e.stopPropagation();
          clearTimers();
          if (open) setPos(null);
          else place();
        }}
        tabIndex={0}
      >
        {children}
      </span>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {pos && (
              // Outer div owns fixed placement + centering transform; the inner
              // motion.div owns the entrance transform — framer would otherwise
              // overwrite the translate.
              <div
                ref={panelRef}
                style={{ position: "fixed", top: pos.top, left: pos.left, transform: translate }}
                className="z-50"
                onMouseEnter={clearTimers}
                onMouseLeave={scheduleClose}
              >
                <motion.div
                  role="tooltip"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("paper-card shadow-pop p-3", className)}
                >
                  {content}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
