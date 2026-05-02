"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { listItem } from "@/lib/theme/motion";
import { money, shortDate } from "@/lib/format";

export interface ProjectCardData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  budget: number;
  jobCount: number;
  completedJobs: number;
}

const TONE: Record<string, "neutral" | "accent" | "success" | "warn"> = {
  ACTIVE: "accent",
  ON_HOLD: "warn",
  COMPLETED: "success",
  ARCHIVED: "neutral",
};

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const pct =
    project.jobCount > 0 ? Math.round((project.completedJobs / project.jobCount) * 100) : 0;

  return (
    <motion.div variants={listItem}>
      <Link href={`/dashboard/projects/${project.id}` as any}>
        <div className="paper-card p-5 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(17,17,19,0.18)] cursor-pointer">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-[18px] tracking-[-0.01em] truncate">
                {project.name}
              </div>
              {project.description && (
                <p className="text-[12px] text-[color:var(--ink-muted)] mt-1 leading-relaxed line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>
            <Badge tone={TONE[project.status] ?? "neutral"}>
              {project.status.toLowerCase().replace("_", " ")}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
            <div>
              <div className="quiet-caps !mb-0">Jobs</div>
              <div className="font-display tabular text-[18px] mt-0.5 inline-flex items-center gap-1.5">
                <Briefcase className="h-3 w-3 text-[color:var(--ink-muted)]" />
                {project.jobCount}
              </div>
            </div>
            <div>
              <div className="quiet-caps !mb-0">Budget</div>
              <div className="font-display tabular text-[18px] mt-0.5 leading-none">
                {money(project.budget)}
              </div>
            </div>
            <div>
              <div className="quiet-caps !mb-0">Window</div>
              <div className="text-[12px] text-[color:var(--ink-soft)] tabular mt-1 inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-[color:var(--ink-muted)]" />
                {project.startsAt ? shortDate(project.startsAt) : "—"}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[10.5px] text-[color:var(--ink-muted)] mb-1.5 tabular">
              <span>Progress</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{
                  background:
                    pct >= 100
                      ? "#059669"
                      : "linear-gradient(90deg, var(--accent), rgba(79,70,229,0.6))",
                }}
              />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
