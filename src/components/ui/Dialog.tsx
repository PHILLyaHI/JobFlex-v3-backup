"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { modal, scrimFade } from "@/lib/theme/motion";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  // Portal to <body> so the fixed overlay escapes any transformed ancestor (e.g.
  // a framer-motion panel). A `transform` on a parent makes `position: fixed`
  // resolve to that parent's box, so otherwise the scrim only dims the nested
  // content region and leaves the sidebar/topbar bright.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_60%,transparent)] backdrop-blur-[2px]"
            variants={scrimFade}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              variants={modal}
              initial="initial"
              animate="animate"
              exit="exit"
              className="paper-card pointer-events-auto w-full max-w-lg shadow-pop"
            >
              <div className="flex items-start justify-between gap-3 p-6 pb-4">
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
                  className="rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {children && <div className="px-6 pb-6">{children}</div>}
              {footer && (
                <div className="border-t border-[color:var(--ink-line)] px-6 py-4 flex justify-end gap-2">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
