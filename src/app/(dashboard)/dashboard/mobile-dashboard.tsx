"use client";
import * as React from "react";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { TodayAgenda, type TodayAgendaEvent } from "@/components/dashboard/TodayAgenda";
import { QuickCapture } from "@/components/dashboard/QuickCapture";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { WhatHappenedFeed, type ActivityRow } from "@/components/dashboard/WhatHappenedFeed";

interface MobileDashboardProps {
  /** Reference moment passed from the server so "today" is deterministic. */
  now: Date;
  jobEvents: TodayAgendaEvent[];
  proposals: { status: string; viewCount: number }[];
  leads: { status: string }[];
  activities: ActivityRow[];
}

export function MobileDashboard({
  now,
  jobEvents,
  proposals,
  leads,
  activities,
}: MobileDashboardProps) {
  return (
    <div className="-mx-6 -my-8 pt-safe pb-6">
      <div className="space-y-6 pt-2">
        <GreetingHeader now={now} />
        <TodayAgenda events={jobEvents} now={now} />
        <QuickCapture />
        <AttentionList proposals={proposals} leads={leads} />
        <WhatHappenedFeed activities={activities} />
      </div>
    </div>
  );
}
