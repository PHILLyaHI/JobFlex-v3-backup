"use client";

// The mount for CompleteLeadProfileBanner.
//
// The banner itself has existed since the Lead Center shipped and was rendered
// by NOTHING — a shop whose address never geocoded (which, before 2026-09-17,
// was every shop created through checkout) had no surface anywhere telling it
// why no homeowner lead ever arrived. The Company page even read "Matching on".
//
// It self-fetches rather than taking props so mounting it is one line on four
// very differently-shaped surfaces — two server pages (Overview, Leads) and two
// props-less handheld builds. One question, one answer, no page-specific wiring
// to drift.
import * as React from "react";
import { leadProfileGaps } from "@/actions/company";
import { CompleteLeadProfileBanner } from "./CompleteLeadProfileBanner";

export function LeadProfileNudge({ className }: { className?: string }) {
  const [gaps, setGaps] = React.useState<{
    needsAddress: boolean;
    needsTrades: boolean;
  } | null>(null);

  React.useEffect(() => {
    let alive = true;
    leadProfileGaps()
      .then((g) => {
        if (alive) setGaps({ needsAddress: g.needsAddress, needsTrades: g.needsTrades });
      })
      // A nudge that cannot load is a nudge that does not appear. It must never
      // be the thing that breaks the page it is advising.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!gaps || (!gaps.needsAddress && !gaps.needsTrades)) return null;
  return (
    <div className={className}>
      <CompleteLeadProfileBanner needsAddress={gaps.needsAddress} needsTrades={gaps.needsTrades} />
    </div>
  );
}
