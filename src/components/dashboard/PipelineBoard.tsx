"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { listStagger, listItem } from "@/lib/theme/motion";

interface PipelineLead {
  id: string;
  name: string;
  projectType: string | null;
  status: string;
  aiCategory: string | null;
}

const STAGES = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUOTED", label: "Quoted" },
  { key: "WON", label: "Won" },
];

export function PipelineBoard({ leads }: { leads: PipelineLead[] }) {
  const buckets = STAGES.map((s) => ({
    ...s,
    items: leads.filter((l) => l.status === s.key),
  }));

  return (
    <motion.div
      variants={listStagger}
      initial="initial"
      animate="animate"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
    >
      {buckets.map((b) => (
        <motion.div
          key={b.key}
          variants={listItem}
          className="paper-card p-4 flex flex-col gap-2 min-h-[180px]"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="quiet-caps">{b.label}</span>
            <span className="text-[11px] tabular text-[color:var(--ink-muted)]">{b.items.length}</span>
          </div>
          {b.items.length === 0 && (
            <div className="text-[11px] text-[color:var(--ink-faint)]">Nothing here yet.</div>
          )}
          {b.items.map((l) => (
            <Link
              key={l.id}
              href={`/dashboard/leads/${l.id}` as any}
              className="block rounded-[var(--r-sm)] px-2.5 py-2 bg-white/70 dark:bg-white/[0.04] hairline hover:bg-[color:var(--accent-soft)] transition-colors"
            >
              <div className="text-[13px] font-medium text-[color:var(--ink)]">{l.name}</div>
              <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                {l.projectType ?? l.aiCategory ?? "Lead"}
              </div>
            </Link>
          ))}
        </motion.div>
      ))}
    </motion.div>
  );
}
