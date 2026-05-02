"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, MoreHorizontal, Check, ExternalLink, X, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { relative, longDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  pingAssignment,
  markAssignmentAccepted,
  unassignAssignment,
} from "@/actions/workers";

export interface InboxAssignment {
  id: string;
  workerName: string;
  workerEmail: string | null;
  jobId: string;
  jobTitle: string;
  jobStartsAt: Date | null;
  status: string;
  assignedAt: Date;
  pingedAt: Date | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  pending: InboxAssignment[];
}

export function InboxSheet({ open, onClose, pending }: Props) {
  // Group by jobId
  const byJob = React.useMemo(() => {
    const m = new Map<string, { jobId: string; jobTitle: string; rows: InboxAssignment[] }>();
    for (const a of pending) {
      if (!m.has(a.jobId)) {
        m.set(a.jobId, { jobId: a.jobId, jobTitle: a.jobTitle, rows: [] });
      }
      m.get(a.jobId)!.rows.push(a);
    }
    return Array.from(m.values());
  }, [pending]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Crew confirmations · ${pending.length} pending`}
      description="Pending assignments that haven't been accepted yet."
      width="min(440px, 100vw)"
    >
      {pending.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Everyone has confirmed"
          description="All crew assignments have been accepted. Nothing to follow up on."
        />
      ) : (
        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {byJob.map((g) => (
              <motion.div
                key={g.jobId}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="quiet-caps !mb-0">{g.jobTitle}</div>
                  <Link
                    href={`/dashboard/jobs/${g.jobId}` as any}
                    className="text-[10px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] inline-flex items-center gap-1"
                  >
                    Open job
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
                <ul className="paper-card divide-y divide-[color:var(--ink-line)] overflow-hidden">
                  {g.rows.map((row) => (
                    <InboxAssignmentRow key={row.id} row={row} />
                  ))}
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Sheet>
  );
}

function InboxAssignmentRow({ row }: { row: InboxAssignment }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const fresh =
    Date.now() - new Date(row.assignedAt).getTime() < 24 * 60 * 60 * 1000;
  const recentlyPinged =
    row.pingedAt && Date.now() - new Date(row.pingedAt).getTime() < 60 * 60 * 1000;

  async function ping() {
    setBusy("ping");
    try {
      await pingAssignment(row.id);
      toast.success("Pinged");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't ping", err?.message);
    } finally {
      setBusy(null);
    }
  }
  async function markAccepted() {
    setBusy("accept");
    try {
      await markAssignmentAccepted(row.id);
      toast.success("Marked accepted");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
      setMenuOpen(false);
    }
  }
  async function remove() {
    setConfirmRemove(false);
    setBusy("remove");
    try {
      await unassignAssignment(row.id);
      toast.success("Removed");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't remove", err?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-3 group">
      <div className="relative shrink-0">
        <Avatar name={row.workerName} size={32} />
        {fresh && (
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--accent)] opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--accent)] ring-2 ring-[color:var(--paper)]" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
          {row.workerName}
        </div>
        <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
          {row.jobStartsAt ? longDate(row.jobStartsAt) : "Unscheduled"}
          <span className="mx-1.5 text-[color:var(--ink-faint)]">·</span>
          assigned {relative(row.assignedAt)}
        </div>
      </div>
      <Badge tone="warn">pending</Badge>

      <div className="flex items-center gap-1 shrink-0">
        {recentlyPinged ? (
          <span className="text-[10px] text-[color:var(--ink-muted)] tabular px-2">
            Pinged {row.pingedAt ? relative(row.pingedAt) : "recently"}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "ping"}
            onClick={ping}
            icon={<Send className="h-3 w-3" />}
          >
            Ping
          </Button>
        )}

        <div className="relative" ref={ref}>
          <button
            onClick={() => setMenuOpen((x) => !x)}
            disabled={busy !== null}
            aria-label="More"
            className={cn(
              "h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]",
              menuOpen && "bg-black/[0.05]",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-9 z-20 w-44 paper-card shadow-pop overflow-hidden"
            >
              <button
                onClick={markAccepted}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-black/[0.04]"
              >
                <Check className="h-3 w-3 text-emerald-700" />
                Mark accepted
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmRemove(true);
                }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] text-rose-700 hover:bg-rose-50"
              >
                <X className="h-3 w-3" />
                Remove from job
              </button>
            </motion.div>
          )}
        </div>
      </div>

      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${row.workerName}?`}
        description={`They'll be unassigned from "${row.jobTitle}". You can reassign anytime.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove}>
              Remove
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </li>
  );
}
