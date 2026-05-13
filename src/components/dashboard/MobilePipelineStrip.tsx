"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { cn } from "@/lib/cn";

export interface PipelineLead {
  id: string;
  name: string;
  status: string;
  projectType: string | null;
  aiCategory: string | null;
}

const STAGE_ORDER = ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED", "WON"] as const;

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  ROUTED: "Routed",
  CLAIMED: "Claimed",
  CONTACTED: "Contacted",
  QUOTED: "Quoted",
  WON: "Won",
};

function groupByStage(leads: PipelineLead[]): { stage: string; leads: PipelineLead[] }[] {
  const map = new Map<string, PipelineLead[]>();
  for (const lead of leads) {
    const stage = lead.status;
    if (!map.has(stage)) map.set(stage, []);
    map.get(stage)!.push(lead);
  }
  const known = STAGE_ORDER.filter((s) => map.has(s)).map((s) => ({ stage: s, leads: map.get(s)! }));
  const extras = Array.from(map.entries())
    .filter(([s]) => !STAGE_ORDER.includes(s as (typeof STAGE_ORDER)[number]))
    .map(([stage, leads]) => ({ stage, leads }));
  return [...known, ...extras];
}

export function MobilePipelineStrip({ leads }: { leads: PipelineLead[] }) {
  const groups = React.useMemo(() => groupByStage(leads), [leads]);
  const [openStage, setOpenStage] = React.useState<string | null>(null);
  const openGroup = openStage ? groups.find((g) => g.stage === openStage) : null;

  if (groups.length === 0) {
    return (
      <p className="text-[12px] text-[color:var(--ink-muted)]">
        Pipeline empty. New leads will appear here.
      </p>
    );
  }

  return (
    <>
      <div className="-mx-5 overflow-x-auto snap-x snap-mandatory">
        <ul className="flex gap-2.5 px-5 pb-1">
          {groups.map((g) => (
            <li key={g.stage} className="snap-start shrink-0">
              <button
                type="button"
                onClick={() => setOpenStage(g.stage)}
                className={cn(
                  "paper-card flex flex-col items-start gap-2 w-[150px] px-3.5 py-3 text-left",
                  "hover:bg-black/[0.02] focus-ring transition-colors",
                )}
              >
                <div className="quiet-caps !mb-0 truncate w-full">
                  {STAGE_LABELS[g.stage] ?? g.stage.toLowerCase()}
                </div>
                <div className="flex items-end justify-between w-full">
                  <span className="font-display tabular text-[26px] leading-none tracking-[-0.02em]">
                    {g.leads.length}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <BottomSheet
        open={!!openStage}
        onClose={() => setOpenStage(null)}
        title={openGroup ? `${STAGE_LABELS[openGroup.stage] ?? openGroup.stage} · ${openGroup.leads.length} leads` : "Stage"}
      >
        {openGroup && (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {openGroup.leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/dashboard/leads/${lead.id}` as never}
                  onClick={() => setOpenStage(null)}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-black/[0.02] -mx-1 px-1 rounded-[var(--r-sm)]"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {lead.name}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
                      {lead.aiCategory ?? lead.projectType ?? "Lead"}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[color:var(--ink-faint)] shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </>
  );
}
