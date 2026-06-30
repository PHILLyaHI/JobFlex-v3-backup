"use client";
import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { editorialEase } from "@/lib/theme/motion";
import { cn } from "@/lib/cn";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  children: React.ReactNode;
  title?: string;
  /** CSS width. Default `min(85vw, 400px)`. */
  width?: string;
}

export function MobileDrawer({
  open,
  onClose,
  side,
  children,
  title,
  width = "min(85vw, 400px)",
}: MobileDrawerProps) {
  const reduceMotion = useReducedMotion();
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<Element | null>(null);

  React.useEffect(() => {
    if (open) triggerRef.current = document.activeElement;
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const node = drawerRef.current;
    if (!node) return;
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    const first = focusables()[0] ?? node;
    first.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      const t = triggerRef.current as HTMLElement | null;
      if (t && typeof t.focus === "function") t.focus({ preventScroll: true });
    };
  }, [open]);

  const offClosed = side === "left" ? "-100%" : "100%";
  const innerEdgeShadow =
    side === "left"
      ? "16px 0 48px -12px rgba(17, 17, 19, 0.18)"
      : "-16px 0 48px -12px rgba(17, 17, 19, 0.18)";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_50%,transparent)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Drawer"}
            tabIndex={-1}
            style={{ width, boxShadow: innerEdgeShadow }}
            className={cn(
              "fixed top-0 bottom-0 z-50 flex flex-col",
              "bg-[color:var(--paper)]",
              side === "left"
                ? "left-0 border-r border-[color:var(--ink-line)] pl-safe"
                : "right-0 border-l border-[color:var(--ink-line)] pr-safe",
              "focus:outline-none",
            )}
            initial={{ x: offClosed }}
            animate={{ x: 0 }}
            exit={{ x: offClosed }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.28, ease: editorialEase }
            }
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-[color:var(--ink-line)]">
              {title && (
                <h2 className="font-display text-[18px] leading-tight tracking-[-0.01em]">
                  {title}
                </h2>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-muted)] hover:bg-black/[0.05] focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
