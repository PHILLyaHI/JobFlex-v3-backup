"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Check, Clock, AlarmClock, CalendarClock } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";
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

type TabKey = "ALL" | "DUE" | "SCHEDULED";

// Severity is status, not decoration: rose deepens with how late a follow-up is.
function severity(r: QueueRow): { rail: string; chip: string; label: string } {
  if (!r.isOverdue) {
    return {
      rail: "border-l-[color:var(--accent)]",
      chip: "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]",
      label: relative(r.runAt),
    };
  }
  const d = r.overdueDays;
  const label = d <= 0 ? "due today" : `${d}d late`;
  if (d >= 7) return { rail: "border-l-rose-400", chip: "bg-rose-100 text-rose-700", label };
  if (d >= 3) return { rail: "border-l-rose-300", chip: "bg-rose-50 text-rose-600", label };
  return { rail: "border-l-rose-200", chip: "bg-rose-50/60 text-rose-500", label };
}

function SeverityChip({ r }: { r: QueueRow }) {
  const s = severity(r);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] tabular",
        s.chip,
      )}
    >
      {s.label}
    </span>
  );
}

export function FollowUpQueue({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [removed, setRemoved] = React.useState<Set<string>>(new Set());
  const [tab, setTab] = React.useState<TabKey>("ALL");

  async function execute(id: string) {
    setBusy(id);
    try {
      await runFollowUpNow(id);
      setRemoved((s) => new Set([...s, id]));
      toast.success("Sent", "Follow-up email dispatched.");
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

  const visible = React.useMemo(() => rows.filter((r) => !removed.has(r.id)), [rows, removed]);
  const overdue = React.useMemo(() => visible.filter((r) => r.isOverdue), [visible]);
  const upcoming = React.useMemo(() => visible.filter((r) => !r.isOverdue), [visible]);
  const oldest = overdue.reduce((m, r) => Math.max(m, r.overdueDays), 0);

  const filtered = React.useMemo(() => {
    if (tab === "DUE") return overdue;
    if (tab === "SCHEDULED") return upcoming;
    return visible;
  }, [tab, visible, overdue, upcoming]);

  const { page, pageCount, setPage, pageItems } = usePagedList(filtered, 20);
  // Keep the paginator honest when the active tab shrinks the list.
  React.useEffect(() => setPage(1), [tab, setPage]);

  if (rows.length === 0) {
    return (
      <div className="paper-card">
        <div className="py-12 text-center">
          <Clock className="mx-auto mb-3 h-6 w-6 text-[color:var(--ink-faint)]" />
          <div className="font-medium text-[color:var(--ink)]">Queue is clear</div>
          <div className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-[color:var(--ink-muted)]">
            Follow-ups are scheduled by your workflow rules. When proposals trigger them, they&rsquo;ll
            land here.
          </div>
        </div>
      </div>
    );
  }

  const columns: Column<QueueRow>[] = [
    {
      key: "who",
      header: "Follow-up",
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[color:var(--ink)]">
            {r.clientName ?? "Unknown client"}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--ink-muted)]">
            {r.proposalTitle ?? "Follow-up"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <SeverityChip r={r} />,
    },
    {
      key: "when",
      header: "Scheduled",
      render: (r) => (
        <div>
          <div className="tabular text-[color:var(--ink-soft)]">{longDate(r.runAt)}</div>
          <div className="mt-0.5 text-[11px] text-[color:var(--ink-muted)]">{relative(r.runAt)}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
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
      ),
    },
  ];

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: visible.length },
    { key: "DUE", label: "Due now", count: overdue.length },
    { key: "SCHEDULED", label: "Scheduled", count: upcoming.length },
  ];

  return (
    <div className="space-y-5">
      {/* ── Bold stat band: the dispatch board's headline ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatBlock
          tone={overdue.length > 0 ? "urgent" : "calm"}
          icon={<AlarmClock className="h-4 w-4" />}
          value={overdue.length}
          label="Due now"
          sub={overdue.length > 0 ? `oldest ${oldest <= 0 ? "today" : `${oldest}d late`}` : "all caught up"}
        />
        <StatBlock
          tone="scheduled"
          icon={<CalendarClock className="h-4 w-4" />}
          value={upcoming.length}
          label="Scheduled"
          sub={upcoming.length > 0 ? "queued ahead" : "nothing queued"}
        />
      </div>

      {/* ── Filter tabs (Jobs-list pattern) ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] transition-colors hairline",
              tab === t.key
                ? "border-transparent bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
            )}
          >
            {t.label}
            <span
              className={cn(
                "tabular",
                tab === t.key ? "text-[color:var(--paper)]/70" : "text-[color:var(--ink-faint)]",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="paper-card py-10 text-center text-[12px] text-[color:var(--ink-muted)]">
          Nothing in this view.
        </div>
      ) : (
        <>
          {/* Desktop: the ledger table */}
          <div className="hidden md:block">
            <DataTable columns={columns} rows={pageItems} rowKey={(r) => r.id} />
          </div>

          {/* Mobile: color-blocked severity cards */}
          <ul className="space-y-2.5 md:hidden">
            <AnimatePresence initial={false}>
              {pageItems.map((r) => (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 8, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={cn("paper-card border-l-[3px] p-3.5", severity(r).rail)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-[color:var(--ink)]">
                            {r.clientName ?? "Unknown client"}
                          </span>
                          <SeverityChip r={r} />
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-[color:var(--ink-muted)]">
                          {r.proposalTitle ?? "Follow-up"}
                        </div>
                        <div className="mt-1.5 tabular text-[10.5px] text-[color:var(--ink-faint)]">
                          Due {longDate(r.runAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
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
                      <div className="mt-2.5 border-t border-[color:var(--ink-line)] pt-2.5">
                        <Link
                          href={`/dashboard/proposals/${r.proposalId}` as never}
                          className="rounded-sm text-[11px] text-[color:var(--accent)] focus-ring hover:underline"
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

          <Pagination page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// Color-blocked, elevated stat tile — the one bold, memorable element.
function StatBlock({
  tone,
  icon,
  value,
  label,
  sub,
}: {
  tone: "urgent" | "calm" | "scheduled";
  icon: React.ReactNode;
  value: number;
  label: string;
  sub: string;
}) {
  const styles: Record<typeof tone, string> = {
    urgent: "bg-rose-50 text-rose-700 border border-rose-200",
    calm: "bg-[color:var(--paper-deep)] text-[color:var(--ink)] hairline",
    scheduled: "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]",
  } as const;
  return (
    <div className={cn("rounded-[var(--r-lg)] p-5", styles[tone])}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-[40px] leading-none tracking-[-0.03em] tabular">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] opacity-80">{sub}</div>
    </div>
  );
}
