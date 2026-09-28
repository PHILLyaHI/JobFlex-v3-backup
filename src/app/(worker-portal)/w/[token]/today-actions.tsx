"use client";
// TODAY'S JOB, ONE TAP (2026-09-27): the crew starts, comes back or finishes
// from the list, without opening the job. Same token route as the job page;
// the office is texted by it.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Play, RotateCcw } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { onSiteLine } from "@/lib/jobProgressShared";

export function TodayActions({
  token,
  jobId,
  status,
  progress,
}: {
  token: string;
  jobId: string;
  status: string;
  progress: { day: number; startedToday: boolean; daysSoFar: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const line = onSiteLine(progress, status);

  async function press(e: React.MouseEvent, next: "IN_PROGRESS" | "CONTINUE" | "COMPLETED") {
    // The card is a link to the job; the button is not.
    e.preventDefault();
    e.stopPropagation();
    try {
      setBusy(next);
      const res = await fetch(`/api/worker/job/${jobId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, status: next }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't update");
      const r = (await res.json()) as { day?: number; what?: string };
      toast.success(next === "COMPLETED" ? "Marked complete — the office knows" : r.what === "continued" ? `Back on site — day ${r.day ?? ""}`.trim() : "Work started — the office knows");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-[var(--r-md)] px-3 text-[12.5px] font-semibold transition-colors focus-ring disabled:opacity-60";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-today-actions>
      {line ? <span className="mr-auto text-[12px] font-medium text-[color:var(--ink-soft)]">{line}</span> : null}
      {status === "SCHEDULED" && (
        <button type="button" className={cn(btn, "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-ink)]")} disabled={busy !== null} onClick={(e) => press(e, "IN_PROGRESS")} data-progress="start">
          <Play className="h-3.5 w-3.5" /> Start work
        </button>
      )}
      {status === "IN_PROGRESS" && !progress.startedToday && (
        <button type="button" className={cn(btn, "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-ink)]")} disabled={busy !== null} onClick={(e) => press(e, "CONTINUE")} data-progress="continue">
          <RotateCcw className="h-3.5 w-3.5" /> Back on site
        </button>
      )}
      {status === "IN_PROGRESS" && (
        <button type="button" className={cn(btn, "hairline text-[color:var(--ink-soft)] hover:bg-black/[0.03]")} disabled={busy !== null} onClick={(e) => press(e, "COMPLETED")} data-progress="complete">
          <Check className="h-3.5 w-3.5" /> Complete
        </button>
      )}
    </div>
  );
}
