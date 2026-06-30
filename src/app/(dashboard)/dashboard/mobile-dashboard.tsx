"use client";
import * as React from "react";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { TodayAgenda, type TodayAgendaEvent } from "@/components/dashboard/TodayAgenda";
import { QuickCapture } from "@/components/dashboard/QuickCapture";
import { AttentionList, type AttentionCounts } from "@/components/dashboard/AttentionList";
import { WhatHappenedFeed, type ActivityRow } from "@/components/dashboard/WhatHappenedFeed";

interface MobileDashboardProps {
  /** Reference moment passed from the server so "today" is deterministic. */
  now: Date;
  jobEvents: TodayAgendaEvent[];
  /** Real org-wide counts for the "Needs you" list (not a capped slice). */
  attention: AttentionCounts;
  activities: ActivityRow[];
}

export function MobileDashboard({
  now,
  jobEvents,
  attention,
  activities,
}: MobileDashboardProps) {
  return (
    <div className="-mx-6 -my-8 pt-safe pb-6">
      <div className="pt-2">
        <GreetingHeader now={now} />
        <div className="mt-4">
          <TodayAgenda events={jobEvents} now={now} />
        </div>
        <div className="mt-6">
          <QuickCapture />
        </div>
        <div className="mt-6">
          <AttentionList counts={attention} />
        </div>
        <div className="mt-8">
          <WhatHappenedFeed activities={activities} />
        </div>
      </div>
    </div>
  );
}
