"use client";
import * as React from "react";
import type { ElementType } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { Check, X, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

interface AssignmentResponseProps {
  assignmentId: string;
  token: string;
  status: string; // PENDING | ACCEPTED | DECLINED | COMPLETED
}

// The bold, color-blocked heart of the page: when a job is sent to a worker it
// lands as a warm amber block with two big touch targets. Accepting flips it to
// a confident sage "confirmed" state. Posts to the existing token-gated
// assignment endpoint; optimistic local state keeps the flip instant.
export function AssignmentResponse({ assignmentId, token, status }: AssignmentResponseProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState(status);

  async function respond(next: "ACCEPTED" | "DECLINED") {
    try {
      setBusy(next);
      const res = await fetch(`/api/worker/assignment/${assignmentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setLocal(next);
      toast.success(next === "ACCEPTED" ? "You're confirmed" : "Job declined");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  if (local === "PENDING") {
    return (
      <section className="mt-4 rounded-[var(--r-lg)] border border-amber-200 bg-amber-50 p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-500 text-white shadow-[var(--shadow-sm)]">
            <Hourglass className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-amber-700">
              Sent to you
            </div>
            <div className="font-display text-[20px] leading-tight tracking-[-0.01em] text-amber-950">
              Can you take this job?
            </div>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-amber-900/80">
          Let the office know so they can lock in the crew.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button
            size="lg"
            loading={busy === "ACCEPTED"}
            onClick={() => respond("ACCEPTED")}
            icon={<Check className="h-4 w-4" />}
          >
            Accept job
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
      </section>
    );
  }

  const cfg = STATES[local] ?? STATES.ACCEPTED;
  const Icon = cfg.icon;
  return (
    <section className={cn("mt-4 flex items-center gap-3.5 rounded-[var(--r-lg)] p-5 shadow-[var(--shadow-sm)]", cfg.wrap)}>
      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-[var(--shadow-sm)]", cfg.badge)}>
        <Icon className="h-6 w-6" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className={cn("text-[10.5px] font-bold uppercase tracking-[0.12em]", cfg.kicker)}>
          Your assignment
        </div>
        <div className="font-display text-[19px] leading-tight tracking-[-0.01em]">{cfg.label}</div>
        <div className={cn("mt-0.5 text-[12.5px] leading-snug", cfg.sub)}>{cfg.note}</div>
      </div>
    </section>
  );
}

const STATES: Record<
  string,
  {
    icon: ElementType;
    label: string;
    note: string;
    wrap: string;
    badge: string;
    kicker: string;
    sub: string;
  }
> = {
  ACCEPTED: {
    icon: CheckCircle2,
    label: "You're confirmed",
    note: "You're on the crew. Everything you need is below.",
    wrap: "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]",
    badge: "bg-[color:var(--accent)] text-white",
    kicker: "text-[color:var(--accent-ink)]",
    sub: "text-[color:var(--accent-ink)]",
  },
  COMPLETED: {
    icon: CheckCircle2,
    label: "Job complete",
    note: "Nice work — this one's wrapped up.",
    wrap: "bg-emerald-50 text-emerald-900",
    badge: "bg-emerald-600 text-white",
    kicker: "text-emerald-700",
    sub: "text-emerald-800",
  },
  DECLINED: {
    icon: XCircle,
    label: "You declined this job",
    note: "Message your manager if that was a mistake.",
    wrap: "bg-rose-50 text-rose-900",
    badge: "bg-rose-500 text-white",
    kicker: "text-rose-700",
    sub: "text-rose-800",
  },
};
