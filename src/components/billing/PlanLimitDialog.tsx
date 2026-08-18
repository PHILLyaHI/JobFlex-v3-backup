"use client";
import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, ArrowUpRight } from "lucide-react";
import { usePlanLimitStore } from "@/stores/usePlanLimitStore";
import { LIMIT_DEFS } from "@/lib/planLimits";
import { Button } from "@/components/ui/Button";

/**
 * Globally-mounted "you've hit your plan limit" dialog. Hand-rolled per the
 * house modal style (no Radix). Opened via reportPlanLimit() from create flows.
 */
export function PlanLimitDialog() {
  const open = usePlanLimitStore((s) => s.open);
  const resource = usePlanLimitStore((s) => s.resource);
  const close = usePlanLimitStore((s) => s.close);

  const label = resource ? LIMIT_DEFS.find((d) => d.key === resource)?.label.toLowerCase() : null;
  const def = resource ? LIMIT_DEFS.find((d) => d.key === resource) : null;
  const resets = def?.scope === "absolute" ? "upgrade your plan to add more" : "wait until your limit resets next month";

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--ink)_45%,transparent)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="paper-card pointer-events-auto w-full max-w-md shadow-pop p-6"
            >
              <div className="h-10 w-10 grid place-items-center rounded-[var(--r-md)] bg-[color:var(--accent-soft)] text-[color:var(--accent)] mb-4">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="font-display text-[18px] tracking-[-0.015em] text-[color:var(--ink)]">
                You&rsquo;ve reached your plan limit
              </h2>
              <p className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed mt-2">
                {label ? (
                  <>You&rsquo;ve used all the <strong>{label}</strong> included in your plan. </>
                ) : (
                  <>You&rsquo;ve hit a limit on your current plan. </>
                )}
                To keep going, {resets}.
              </p>
              <div className="flex items-center justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={close}>
                  Not now
                </Button>
                <Link href={"/dashboard/subscription-blueprint" as never} onClick={close}>
                  <Button icon={<ArrowUpRight className="h-3.5 w-3.5" />}>Upgrade plan</Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
