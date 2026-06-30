"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Check, Clock, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { relative, longDate } from "@/lib/format";
import { runFollowUpNow, markFollowUpDone } from "@/actions/followUps";

export interface QueueRow {
  id: string;
  proposalId: string | null;
  proposalTitle: string | null;
  clientName: string | null;
  runAt: Date;
  note: string | null;
  isOverdue: boolean;
  /** Whole days past runAt; 0 for not-yet-overdue or due earlier today. */
  overdueDays: number;
}

/** Age tiers — rose deepens with how late a follow-up is (status, not decoration). */
function overdueTier(days: number) {
  if (days >= 7)
    return { border: "border-l-[color:var(--rose)]", chip: "bg-[color:var(--rose)] text-white" };
  if (days >= 3)
    return { border: "border-l-rose-400", chip: "bg-rose-100 text-rose-800" };
  return { border: "border-l-rose-300", chip: "bg-rose-50 text-rose-700" };
}

const ageLabel = (days: number) => (days <= 0 ? "today" : `${days}d late`);

export function FollowUpQueue({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [removed, setRemoved] = React.useState<Set<string>>(new Set());

  async function execute(id: string) {
    setBusy(id);
    try {
      await runFollowUpNow(id);
      setRemoved((s) => new Set([...s, id]));
      toast.success("Sent", "Email dispatched (or stubbed if Resend isn't configured).");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't send", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function done(id: string) {
    setBusy(id);
    try {
      await markFollowUpDone(id);
      setRemoved((s) => new Set([...s, id]));
      toast.success("Marked done");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const visible = rows.filter((r) => !removed.has(r.id));
  const overdue = visible.filter((r) => r.isOverdue);
  const upcoming = visible.filter((r) => !r.isOverdue);
  const oldest = overdue.reduce((m, r) => Math.max(m, r.overdueDays), 0);

  if (rows.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center">
          <Clock className="h-6 w-6 text-[color:var(--ink-faint)] mx-auto mb-3" />
          <div className="font-medium text-[color:var(--ink)]">Queue is clear</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
            Follow-ups are scheduled by your workflow rules. When proposals trigger them, they&rsquo;ll
            land here.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <section>
          <header className="mb-3">
            <h2 className="font-display text-[15px] leading-none tracking-[-0.01em] text-[color:var(--ink)]">
              Overdue
            </h2>
            <p className="text-[11px] text-[color:var(--ink-muted)] mt-1 tabular">
              {overdue.length} past due · oldest {oldest <= 0 ? "today" : `${oldest}d`}
            </p>
          </header>

          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {overdue.map((r) => {
                const tier = overdueTier(r.overdueDays);
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 8, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div
                      className={cn(
                        "paper-card !shadow-none p-3.5 border-l-[3px] transition-colors",
                        tier.border,
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[14px] text-[color:var(--ink)] truncate">
                              {r.clientName ?? "Unknown client"}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular tracking-[0.01em]",
                                tier.chip,
                              )}
                            >
                              {ageLabel(r.overdueDays)}
                            </span>
                          </div>
                          <div className="text-[12px] text-[color:var(--ink-muted)] mt-0.5 truncate">
                            {r.proposalTitle ?? "Follow-up"}
                          </div>
                          {r.note && (
                            <div className="text-[11px] text-[color:var(--ink-faint)] mt-1 truncate">
                              {r.note}
                            </div>
                          )}
                          <div className="text-[10.5px] tabular mt-1.5 text-rose-700">
                            Due {longDate(r.runAt)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === r.id}
                            onClick={() => done(r.id)}
                            icon={<Check className="h-3 w-3" />}
                          >
                            Done
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy === r.id}
                            loading={busy === r.id}
                            onClick={() => execute(r.id)}
                            icon={<Send className="h-3 w-3" />}
                          >
                            Send
                          </Button>
                        </div>
                      </div>
                      {r.proposalId && (
                        <div className="mt-2.5 pt-2.5 border-t border-[color:var(--ink-line)]">
                          <Link
                            href={`/dashboard/proposals/${r.proposalId}` as never}
                            className="text-[11px] text-[color:var(--accent)] hover:underline focus-ring rounded-sm"
                          >
                            Open proposal →
                          </Link>
                        </div>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <ScheduledGroup
          rows={upcoming}
          busy={busy}
          defaultOpen={overdue.length === 0}
          onExecute={execute}
          onDone={done}
        />
      )}
    </div>
  );
}

function ScheduledGroup({
  rows,
  busy,
  defaultOpen,
  onExecute,
  onDone,
}: {
  rows: QueueRow[];
  busy: string | null;
  defaultOpen: boolean;
  onExecute: (id: string) => void;
  onDone: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="paper-card !shadow-none overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 focus-ring hover:bg-black/[0.015] transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" aria-hidden />
          <span className="quiet-caps !mb-0">Scheduled</span>
          <span className="text-[11px] text-[color:var(--ink-muted)] tabular">{rows.length}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[color:var(--ink-faint)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-[color:var(--ink-line)] divide-y divide-[color:var(--ink-line)]"
          >
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[13px] text-[color:var(--ink)] truncate">
                    {r.proposalTitle ?? "Follow-up"}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 tabular truncate">
                    {r.clientName ?? "—"} · runs {longDate(r.runAt)}{" "}
                    <span className="text-[color:var(--ink-faint)]">({relative(r.runAt)})</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === r.id}
                    onClick={() => onDone(r.id)}
                    icon={<Check className="h-3 w-3" />}
                  >
                    Done
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    loading={busy === r.id}
                    onClick={() => onExecute(r.id)}
                    icon={<Send className="h-3 w-3" />}
                  >
                    Send
                  </Button>
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
