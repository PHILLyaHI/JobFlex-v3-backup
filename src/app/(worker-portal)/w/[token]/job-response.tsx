"use client";
import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { longDate } from "@/lib/format";
import { Check, X } from "lucide-react";

export interface PendingJob {
  id: string; // assignment id
  title: string;
  clientName: string | null;
  startsAt: Date | null;
}

// A job the office just sent, surfaced at the top of the list so the worker can
// accept or decline without opening it. Same token-gated endpoint as the detail
// page; on answer it collapses to a short confirmation.
export function JobResponseCard({ job, token }: { job: PendingJob; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<"ACCEPTED" | "DECLINED" | null>(null);

  async function respond(next: "ACCEPTED" | "DECLINED") {
    try {
      setBusy(next);
      const res = await fetch(`/api/worker/assignment/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(next);
      toast.success(next === "ACCEPTED" ? "You're confirmed" : "Job declined");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-amber-200 bg-amber-50 p-4 shadow-[var(--shadow-sm)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
        New · sent to you
      </div>
      <Link
        href={`/w/${token}/jobs/${job.id}` as Route}
        className="mt-1 block truncate font-display text-[19px] leading-tight tracking-[-0.01em] text-amber-950 hover:underline"
      >
        {job.title}
      </Link>
      <div className="mt-0.5 truncate text-[12px] text-amber-900/70">
        {job.clientName ?? ""}
        {job.startsAt ? `${job.clientName ? " · " : ""}${longDate(job.startsAt)}` : ""}
      </div>

      {done ? (
        <div className="mt-3 text-[13px] font-semibold text-amber-900">
          {done === "ACCEPTED"
            ? "✓ Confirmed — see you there."
            : "Declined. The office has been notified."}
        </div>
      ) : (
        <>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <Button
              size="lg"
              loading={busy === "ACCEPTED"}
              onClick={() => respond("ACCEPTED")}
              icon={<Check className="h-4 w-4" />}
            >
              Accept
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-white/70"
              loading={busy === "DECLINED"}
              onClick={() => respond("DECLINED")}
              icon={<X className="h-4 w-4" />}
            >
              Decline
            </Button>
          </div>
          <Link
            href={`/w/${token}/jobs/${job.id}` as Route}
            className="mt-2.5 block text-center text-[12px] font-medium text-amber-800 hover:underline"
          >
            View job details →
          </Link>
        </>
      )}
    </div>
  );
}
