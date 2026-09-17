"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToastStore } from "./toast-store";

/* The store and the `toast` helpers live in toast-store.ts (no animation
   library there); this file is the host only, and the root layout mounts it
   through toast-host-lazy.tsx so framer-motion loads with the first toast,
   not with every page (landing-e pass C, 2026-09-11). The re-export keeps
   the 105 call sites as they are. */
export { toast, useToastStore } from "./toast-store";

const iconMap = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-700" />,
  error: <AlertCircle className="h-4 w-4 text-rose-700" />,
  info: <Info className="h-4 w-4 text-[color:var(--accent)]" />,
};

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => dismiss(t.id)}
            className={cn(
              "paper-card pointer-events-auto flex items-start gap-3 px-4 py-3 shadow-pop max-w-sm cursor-pointer",
            )}
          >
            <span className="mt-0.5">{iconMap[t.kind]}</span>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-[color:var(--ink)]">{t.title}</div>
              {t.description && (
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{t.description}</div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
