"use client";
import * as React from "react";
import Link from "next/link";
import { SlidersHorizontal, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MobileDrawer } from "@/components/ui/MobileDrawer";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "accent" | "success" | "warn" | "danger";

export interface MobileProposalRow {
  id: string;
  title: string;
  status: string;
  total: number;
  clientName: string;
  updatedAt: Date;
}

const STATUS_FILTERS = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "PAID", "DECLINED", "EXPIRED"] as const;
type StatusKey = (typeof STATUS_FILTERS)[number];

function statusTone(s: string): BadgeTone {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}

export function MobileProposalsList({ rows }: { rows: MobileProposalRow[] }) {
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [active, setActive] = React.useState<Set<StatusKey>>(new Set());

  const filtered = React.useMemo(() => {
    if (active.size === 0) return rows;
    return rows.filter((r) => active.has(r.status as StatusKey));
  }, [rows, active]);

  const toggle = (s: StatusKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="-mx-6 pt-safe">
      <header className="px-5 pt-1 pb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="quiet-caps">Sales</div>
          <h1 className="font-display text-[26px] tracking-[-0.02em] leading-tight">Proposals</h1>
          <p className="mt-1 text-[12px] text-[color:var(--ink-muted)]">
            Drafts, sent, viewed, accepted. Tap to open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filters"
          className={cn(
            "relative shrink-0 h-10 w-10 rounded-[var(--r-md)] hairline grid place-items-center",
            "text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {active.size > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-[color:var(--accent)] text-[10px] font-medium text-white grid place-items-center px-1 tabular">
              {active.size}
            </span>
          )}
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="px-5">
          <EmptyState
            title="No proposals yet"
            description="Draft your first proposal with AI or start from scratch. Both end up in the same place &mdash; looking sharp."
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5">
          <div className="paper-card px-5 py-8 grid place-items-center text-center">
            <div className="text-[13px] font-medium">No proposals match these filters</div>
            <button
              type="button"
              onClick={() => setActive(new Set())}
              className="mt-3 text-[12px] underline text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <ul className="px-5 space-y-3">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/proposals/${p.id}` as never}
                className={cn(
                  "paper-card block p-4 hover:bg-black/[0.02] focus-ring transition-colors",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-[color:var(--ink)] leading-snug">
                      {p.title}
                    </div>
                    <div className="text-[12px] text-[color:var(--ink-muted)] mt-1 truncate">
                      {p.clientName}
                    </div>
                  </div>
                  <Badge tone={statusTone(p.status)}>{p.status.toLowerCase()}</Badge>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div className="quiet-caps !mb-0">
                    Updated {shortDate(p.updatedAt)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display tabular text-[18px] tracking-[-0.01em]">
                      {money(p.total)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <MobileDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        side="right"
        title="Filter proposals"
      >
        <div className="space-y-5">
          <div>
            <div className="quiet-caps !mb-2">Status</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => {
                const selected = active.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggle(s)}
                    className={cn(
                      "inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-medium",
                      "focus-ring transition-colors",
                      selected
                        ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                        : "hairline text-[color:var(--ink-soft)] hover:bg-black/[0.04]",
                    )}
                  >
                    {s.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[color:var(--ink-line)] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActive(new Set())}
              className="flex-1 h-11 rounded-[var(--r-md)] text-[13px] font-medium text-[color:var(--ink-muted)] hover:bg-black/[0.04] focus-ring"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 h-11 rounded-[var(--r-md)] text-[13px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ink-soft)] focus-ring"
            >
              Done
            </button>
          </div>
        </div>
      </MobileDrawer>
    </div>
  );
}
