"use client";
import * as React from "react";
import {
  motion,
  AnimatePresence,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /**
   * Snap fractions of available height (0–1). Default `[1]` = full-height.
   * Phase 0 honors only full open / closed. Multi-snap is deferred to Phase 5.
   */
  snapPoints?: number[];
  /** Drag distance (as fraction of sheet height) past which release dismisses. */
  dismissThreshold?: number;
}

const DEFAULT_THRESHOLD = 0.3;

export function BottomSheet({
  open,
  onClose,
  children,
  title,
  dismissThreshold = DEFAULT_THRESHOLD,
}: BottomSheetProps) {
  // `snapPoints` is accepted on the props type but ignored in Phase 0
  // (single-snap full-height only). Phase 5 will implement multi-snap.
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const sheetRef = React.useRef<HTMLDivElement>(null);
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
    const node = sheetRef.current;
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

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const sheet = sheetRef.current;
    const h = sheet?.getBoundingClientRect().height ?? 0;
    if (h > 0 && info.offset.y > h * dismissThreshold) {
      onClose();
    }
  };

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
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Sheet"}
            tabIndex={-1}
            drag={reduceMotion ? false : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 320, damping: 36, mass: 0.9 }
            }
            style={{
              boxShadow: "0 -16px 48px -12px rgba(17, 17, 19, 0.18)",
            }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex flex-col",
              "bg-[color:var(--paper)] border-t border-[color:var(--ink-line)]",
              "rounded-t-[var(--r-xl)]",
              "max-h-[92dvh] pb-safe",
              "focus:outline-none",
            )}
          >
            <div
              onPointerDown={(e) => {
                if (!reduceMotion) dragControls.start(e);
              }}
              className="flex flex-col items-center pt-3.5 pb-2 select-none cursor-grab active:cursor-grabbing touch-none"
              aria-hidden="true"
            >
              <span className="h-1 w-10 rounded-full bg-[color:var(--ink-faint)]" />
            </div>
            <div className="flex items-start justify-between gap-3 px-5 pb-3">
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
            <div
              className="flex-1 overflow-y-auto px-5 pb-5"
              style={{ touchAction: "pan-y" }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
