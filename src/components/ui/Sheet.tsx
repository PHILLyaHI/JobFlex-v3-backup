"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { sheetSlide } from "@/lib/theme/motion";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  side?: "right" | "left";
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = "right",
  width = "min(520px, 100vw)",
  children,
  footer,
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[color:var(--ink)]/30 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            variants={sheetSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ width }}
            className={cn(
              "fixed top-0 bottom-0 z-50 flex flex-col bg-[color:var(--paper)] border-[color:var(--ink-line)]",
              side === "right" ? "right-0 border-l" : "left-0 border-r",
            )}
          >
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-[color:var(--ink-line)]">
              <div>
                {title && (
                  <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em]">{title}</h2>
                )}
                {description && (
                  <p className="mt-1 text-xs text-[color:var(--ink-muted)]">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-muted)] hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="border-t border-[color:var(--ink-line)] px-6 py-4">{footer}</div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
