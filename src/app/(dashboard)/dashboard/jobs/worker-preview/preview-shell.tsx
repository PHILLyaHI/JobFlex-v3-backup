"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { WorkerJobV1 } from "./worker-job-v1";
import { WorkerJobV2 } from "./worker-job-v2";
import type { WorkerJobVM } from "./vm";

const META = {
  v1: {
    name: "V1 · Field Command",
    by: "frontend-design",
    note: "Bold, high-contrast command dossier: a charcoal hero, solid-sage color blocks, and big one-handed jobsite actions.",
  },
  v2: {
    name: "V2 · Well-Kept Shop",
    by: "impeccable",
    note: "A refined, single work-order sheet: hairline-divided sections, generous whitespace, one confident sage accent.",
  },
} as const;

export function PreviewShell({ job }: { job: WorkerJobVM }) {
  const [v, setV] = React.useState<"v1" | "v2">("v1");
  const meta = META[v];

  return (
    <div className="pb-16">
      <div className="mx-auto mb-7 max-w-3xl">
        <div className="quiet-caps text-[color:var(--accent-ink)]">
          Worker job detail · design preview
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full p-0.5 hairline">
            {(["v1", "v2"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setV(k)}
                aria-pressed={v === k}
                className={cn(
                  "h-9 rounded-full px-4 text-[12.5px] font-medium transition-colors focus-ring",
                  v === k
                    ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                    : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                )}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-[color:var(--ink-muted)]">
            <span className="font-medium text-[color:var(--ink)]">{meta.name}</span> · built with{" "}
            {meta.by}
          </div>
        </div>
        <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-[color:var(--ink-muted)]">
          {meta.note}
        </p>
      </div>

      {v === "v1" ? <WorkerJobV1 job={job} /> : <WorkerJobV2 job={job} />}
    </div>
  );
}
