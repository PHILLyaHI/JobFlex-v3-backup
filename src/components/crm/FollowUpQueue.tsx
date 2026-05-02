"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Check, Clock, AlarmClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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
}

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
    } catch (err: any) {
      toast.error("Couldn't send", err?.message);
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
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  const visible = rows.filter((r) => !removed.has(r.id));
  const overdue = visible.filter((r) => r.isOverdue);
  const upcoming = visible.filter((r) => !r.isOverdue);

  if (rows.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center">
          <Clock className="h-6 w-6 text-[color:var(--ink-faint)] mx-auto mb-3" />
          <div className="font-medium text-[color:var(--ink)]">Queue is clear</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
            Follow-ups are scheduled by your workflow rules. When proposals trigger them, they'll
            land here.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <QueueGroup
          title="Overdue"
          subtitle={`${overdue.length} item${overdue.length === 1 ? "" : "s"} past their runAt`}
          tone="danger"
          rows={overdue}
          busy={busy}
          onExecute={execute}
          onDone={done}
        />
      )}
      {upcoming.length > 0 && (
        <QueueGroup
          title="Scheduled"
          subtitle="Will run when their time arrives"
          tone="accent"
          rows={upcoming}
          busy={busy}
          onExecute={execute}
          onDone={done}
        />
      )}
    </div>
  );
}

function QueueGroup({
  title,
  subtitle,
  tone,
  rows,
  busy,
  onExecute,
  onDone,
}: {
  title: string;
  subtitle: string;
  tone: "danger" | "accent";
  rows: QueueRow[];
  busy: string | null;
  onExecute: (id: string) => void;
  onDone: (id: string) => void;
}) {
  const dotColor = tone === "danger" ? "#E11D48" : "var(--accent)";
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
              {title}
            </span>
          </CardTitle>
          <CardSubtitle>{subtitle}</CardSubtitle>
        </div>
        <Badge tone={tone === "danger" ? "danger" : "accent"} dot>
          {rows.length}
        </Badge>
      </CardHeader>

      <div className="relative pl-5">
        <span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 left-[7px] w-px bg-[color:var(--ink-line)]"
        />
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <span
                  className="absolute -left-5 top-1.5 h-3 w-3 rounded-full grid place-items-center"
                  style={{ background: dotColor, color: "#fff" }}
                >
                  <AlarmClock className="h-2 w-2" />
                </span>
                <div
                  className={cn(
                    "paper-card !shadow-none p-3 transition-colors",
                    tone === "danger" && "border-l-[3px] border-l-rose-400/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[13px] text-[color:var(--ink)] truncate">
                        {r.proposalTitle ?? "Follow-up"}
                      </div>
                      <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                        {r.clientName ?? "—"}
                        {r.note && ` · ${r.note}`}
                      </div>
                      <div
                        className={cn(
                          "text-[10.5px] tabular mt-1.5",
                          tone === "danger" ? "text-rose-700" : "text-[color:var(--ink-soft)]",
                        )}
                      >
                        {tone === "danger" ? "Overdue · " : "Runs · "}
                        {longDate(r.runAt)} <span className="text-[color:var(--ink-muted)]">({relative(r.runAt)})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.id}
                        onClick={() => onDone(r.id)}
                        icon={<Check className="h-3 w-3" />}
                      >
                        Done
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === r.id}
                        loading={busy === r.id}
                        onClick={() => onExecute(r.id)}
                        icon={<Send className="h-3 w-3" />}
                      >
                        Execute now
                      </Button>
                    </div>
                  </div>
                  {r.proposalId && (
                    <div className="mt-2 pt-2 border-t border-[color:var(--ink-line)]">
                      <Link
                        href={`/dashboard/proposals/${r.proposalId}` as any}
                        className="text-[11px] text-[color:var(--accent)] hover:underline"
                      >
                        Open proposal →
                      </Link>
                    </div>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </Card>
  );
}
