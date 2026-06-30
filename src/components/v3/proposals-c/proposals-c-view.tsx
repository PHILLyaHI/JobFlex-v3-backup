"use client";
import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedTabs } from "./segmented-tabs";
import { RevenueMasthead } from "./revenue-masthead";
import { AllLedger } from "./all-ledger";
import { AcceptedStack } from "./accepted-stack";
import { CompletedTearSheet } from "./completed-tear-sheet";
import type { ProposalCRow, StatusSubFilter, TabKey } from "./types";

// Orchestrator for the Pressroom proposals page. Owns:
//   - active tab (All / Accepted / Completed)
//   - status sub-filter for the All tab
//   - derived counts + totals for the masthead
//
// Data is read-only from this perspective; mutations bubble through actions
// in the leaf components (mark completed, etc.).

interface ProposalsCViewProps {
  all: ProposalCRow[];
  accepted: ProposalCRow[];
  completed: ProposalCRow[];
}

export function ProposalsCView({ all, accepted, completed }: ProposalsCViewProps) {
  const [tab, setTab] = React.useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = React.useState<StatusSubFilter>("ALL");

  const counts = React.useMemo<Record<TabKey, number>>(
    () => ({
      all: all.length,
      accepted: accepted.length,
      completed: completed.length,
    }),
    [all.length, accepted.length, completed.length],
  );

  const totals = React.useMemo(() => {
    const allPipeline = all.reduce((a, r) => a + r.total, 0);
    const acceptedValue = accepted.reduce((a, r) => a + r.total, 0);
    const completedValue = completed.reduce((a, r) => a + r.total, 0);
    return { allPipeline, acceptedValue, completedValue };
  }, [all, accepted, completed]);

  // Masthead config per tab.
  const masthead = React.useMemo(() => {
    if (tab === "all") {
      const drafts = all.filter((r) => r.status === "DRAFT").length;
      const sent = all.filter((r) => r.status === "SENT" || r.status === "VIEWED").length;
      return {
        primaryLabel: "",
        primaryAmount: totals.allPipeline,
        count: all.length,
        countLabel: "Open proposals",
        secondary: [
          { label: "Drafts", value: drafts, tone: "muted" as const },
          { label: "Sent · viewed", value: sent, tone: "ink" as const },
          { label: "Accepted", value: accepted.length, tone: "accent" as const },
        ],
      };
    }
    if (tab === "accepted") {
      const outstanding = totals.acceptedValue;
      return {
        primaryLabel: "Money owed · work in motion",
        primaryAmount: outstanding,
        count: accepted.length,
        countLabel: "Active jobs",
        secondary: [
          { label: "Avg contract", value: accepted.length > 0 ? fmtAvg(outstanding / accepted.length) : "—", tone: "ink" as const },
          { label: "Completed to date", value: completed.length, tone: "muted" as const },
        ],
      };
    }
    return {
      primaryLabel: "Banked · jobs closed",
      primaryAmount: totals.completedValue,
      count: completed.length,
      countLabel: "Filed jobs",
      secondary: [
        { label: "Lifetime jobs", value: completed.length, tone: "ink" as const },
        { label: "Avg job size", value: completed.length > 0 ? fmtAvg(totals.completedValue / completed.length) : "—", tone: "muted" as const },
      ],
    };
  }, [tab, all, accepted, completed, totals]);

  return (
    <div className="mx-auto max-w-[1320px] px-6 lg:px-10 py-10">
      {/* Dateline header */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className="quiet-caps text-[color:var(--accent-ink)]">
          JobFlex · Proposals
        </span>
        <Link href={"/dashboard/proposals/create" as never}>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
            Create proposal
          </Button>
        </Link>
      </div>

      <RevenueMasthead
        tab={tab}
        primaryAmount={masthead.primaryAmount}
        primaryLabel={masthead.primaryLabel}
        count={masthead.count}
        countLabel={masthead.countLabel}
        secondary={masthead.secondary}
      />

      <SegmentedTabs active={tab} counts={counts} onChange={setTab} />

      {tab === "all" && (
        <AllLedger
          rows={all}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}
      {tab === "accepted" && <AcceptedStack rows={accepted} />}
      {tab === "completed" && <CompletedTearSheet rows={completed} />}
    </div>
  );
}

function fmtAvg(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
