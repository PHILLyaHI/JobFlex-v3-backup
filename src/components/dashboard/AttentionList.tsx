"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface AttentionProposal {
  status: string;
  viewCount: number;
}

interface AttentionLead {
  status: string;
}

interface AttentionListProps {
  proposals: AttentionProposal[];
  leads: AttentionLead[];
}

interface AttentionItem {
  key: string;
  verb: string;
  count: number;
  tail: string;
  href: string;
}

function buildItems(proposals: AttentionProposal[], leads: AttentionLead[]): AttentionItem[] {
  const items: AttentionItem[] = [];

  const unviewed = proposals.filter((p) => p.status === "SENT" && (p.viewCount ?? 0) === 0).length;
  if (unviewed > 0) {
    items.push({
      key: "unviewed",
      verb: "Nudge",
      count: unviewed,
      tail: unviewed === 1 ? "unviewed proposal" : "unviewed proposals",
      href: "/dashboard/proposals",
    });
  }

  const viewedAwaiting = proposals.filter((p) => p.status === "VIEWED").length;
  if (viewedAwaiting > 0) {
    items.push({
      key: "viewed",
      verb: "Follow up on",
      count: viewedAwaiting,
      tail: viewedAwaiting === 1 ? "viewed, no reply" : "viewed, no reply",
      href: "/dashboard/proposals",
    });
  }

  const newLeads = leads.filter((l) => l.status === "NEW").length;
  if (newLeads > 0) {
    items.push({
      key: "new-leads",
      verb: "Triage",
      count: newLeads,
      tail: newLeads === 1 ? "new lead" : "new leads",
      href: "/dashboard/leads",
    });
  }

  return items;
}

export function AttentionList({ proposals, leads }: AttentionListProps) {
  const items = React.useMemo(() => buildItems(proposals, leads), [proposals, leads]);

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
