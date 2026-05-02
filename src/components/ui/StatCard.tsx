"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { listItem } from "@/lib/theme/motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" };
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, delta, hint, className }: StatCardProps) {
  return (
    <motion.div variants={listItem} className={cn("paper-card p-5 flex flex-col gap-3", className)}>

      <div className="flex items-start justify-between">
        <span className="quiet-caps">{label}</span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-medium",
              delta.direction === "up" ? "text-emerald-700" : "text-rose-700",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      <div className="stat-numeric text-[40px] leading-none text-[color:var(--ink)]">{value}</div>
      {hint && <div className="text-[11px] text-[color:var(--ink-muted)]">{hint}</div>}
    </motion.div>
  );
}
