"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Real org-wide counts computed server-side (not derived from a capped list). */
export interface AttentionCounts {
  unviewed: number;
  viewed: number;
  newLeads: number;
}

interface AttentionListProps {
  counts: AttentionCounts;
}

interface AttentionItem {
  key: string;
  verb: string;
  count: number;
  tail: string;
  href: string;
}

function buildItems(counts: AttentionCounts): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (counts.unviewed > 0) {
    items.push({
      key: "unviewed",
      verb: "Nudge",
      count: counts.unviewed,
      tail: counts.unviewed === 1 ? "unviewed proposal" : "unviewed proposals",
      href: "/dashboard/proposals",
    });
  }

  if (counts.viewed > 0) {
    items.push({
      key: "viewed",
      verb: "Follow up on",
      count: counts.viewed,
      tail: counts.viewed === 1 ? "viewed proposal" : "viewed proposals",
      href: "/dashboard/proposals",
    });
  }

  if (counts.newLeads > 0) {
    items.push({
      key: "new-leads",
      verb: "Triage",
      count: counts.newLeads,
      tail: counts.newLeads === 1 ? "new lead" : "new leads",
      href: "/dashboard/leads",
    });
  }

  return items;
}

export function AttentionList({ counts }: AttentionListProps) {
  const items = React.useMemo(() => buildItems(counts), [counts]);

  if (items.length === 0) return null;

  return (
    <section className="px-5">
      <div className="quiet-caps mb-2.5">Needs you</div>
      <ul className="divide-y divide-[color:var(--ink-line)]">
        {items.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href as never}
              className="flex items-center gap-3 py-3.5 min-h-[44px] -mx-1 px-1 rounded-[var(--r-sm)] hover:bg-black/[0.02] focus-ring transition-colors"
            >
              <span className="text-[13px] text-[color:var(--ink-soft)] leading-snug min-w-0 flex-1">
                {it.verb}{" "}
                <span className="tabular font-display text-[15px] text-[color:var(--ink)] tracking-[-0.01em]">
                  {it.count}
                </span>{" "}
                <span className="text-[color:var(--ink-muted)]">{it.tail}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[color:var(--ink-faint)] shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
