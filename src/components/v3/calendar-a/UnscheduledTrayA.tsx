"use client";
// V3 calendar-a — unscheduled tray with relaxed overflow during drag.
//
// Original bug: the aside used `overflow-hidden` and the inner scroll list
// used `overflow-y-auto`, both of which clipped the dragged card the moment
// its translation crossed the panel edge. We track an `anyDragging` flag
// lifted from the dispatch cards and switch overflow modes accordingly:
// while a card is in flight, both containers go `overflow-visible` so the
// transformed card can sail across the calendar grid unimpeded; when idle,
// the panel's rounded corners and vertical scroll behave normally.

import * as React from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { ChevronRight, ChevronDown, Inbox, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { JobDispatchCardA, type DispatchableJob } from "./JobDispatchCardA";

interface Props {
  jobs: DispatchableJob[];
  open: boolean;
  onToggle: () => void;
  onClosed?: () => void; // fired once the collapse animation finishes (parent unmounts then)
  onJobDragEnd: (jobId: string, info: PanInfo) => void;
  onJobDragMove?: (jobId: string, point: { x: number; y: number }) => void;
}

const INITIAL_VISIBLE = 5;

export function UnscheduledTrayA({ jobs, open, onToggle, onClosed, onJobDragEnd, onJobDragMove }: Props) {
  const count = jobs.length;
  const [anyDragging, setAnyDragging] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const visibleJobs = showAll ? jobs : jobs.slice(0, INITIAL_VISIBLE);
  const hidden = jobs.length - INITIAL_VISIBLE;

  return (
    <div className="relative">
      <AnimatePresence initial={false} mode="wait" onExitComplete={onClosed}>
        {open ? (
          <motion.aside
            key="open"
            initial={{ opacity: 0, x: 16, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 320 }}
            exit={{ opacity: 0, x: 16, width: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "paper-card flex flex-col",
              anyDragging ? "overflow-visible" : "overflow-hidden",
            )}
            style={{ height: "100%", maxHeight: "82dvh" }}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[color:var(--ink-line)]">
              <div className="flex items-center gap-2">
                <Inbox className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                <span className="quiet-caps !mb-0">Unscheduled</span>
                <span className="inline-flex items-center gap-1.5 text-[12px] tabular text-[color:var(--ink)] font-medium">
                  {count > 0 && (
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--accent)] opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                    </span>
                  )}
                  {count}
                </span>
              </div>
              <button
                onClick={onToggle}
                aria-label="Collapse tray"
                className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div
              className={cn(
                "flex-1 p-3 space-y-2.5",
                anyDragging ? "overflow-visible" : "overflow-y-auto",
              )}
            >
              {jobs.length === 0 ? (
                <div className="paper-card flex flex-col items-center text-center gap-3 py-8 px-4">
                  <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-700 grid place-items-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-display text-[15px] tracking-[-0.01em]">
                      Inbox zero
                    </div>
                    <p className="text-[11.5px] text-[color:var(--ink-muted)] leading-relaxed">
                      Every accepted job is scheduled. Nice.
                    </p>
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {visibleJobs.map((j) => (
                    <motion.div
                      key={j.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6, scale: 0.96 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <JobDispatchCardA
                        job={j}
                        onDragEnd={(info) => onJobDragEnd(j.id, info)}
                        onDragMove={(pt) => onJobDragMove?.(j.id, pt)}
                        onDragStateChange={setAnyDragging}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              {jobs.length > INITIAL_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[var(--r-md)] py-2 text-[12px] text-[color:var(--ink-muted)] transition-colors hover:bg-black/[0.04] hover:text-[color:var(--ink)] motion-reduce:transition-none"
                >
                  {showAll ? "Show less" : `Show ${hidden} more`}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform motion-reduce:transition-none",
                      showAll && "rotate-180",
                    )}
                  />
                </button>
              )}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
