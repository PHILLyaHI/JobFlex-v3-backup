"use client";

/* An estimator sequence as the hero's product shot.

   In the showcase the shots are armed by the SECTION's in-view flag; up here
   each arms itself the same way, through the same hook, so the sequence
   starts when the visitor can see it and not on page load. None of the shots
   needs a stage of its own: AppFrame + STAGE are inside them, and the takeoff
   rail stacks under the stage below 640px on its own media query — which is
   what makes the same build the phone hero too (it replaces PhoneOverview
   there, not just DashboardMock). */

import { FenceShot } from "./fence-shot";
import type { LandingVariant } from "./landing-variants";
import { RoofShot } from "./roof-shot";
import { SmartProposalShot } from "./smart-proposal-shot";
import { SMART_SCENARIOS } from "./smart-scenarios";
import { useEffect, useState } from "react";
import { useInView } from "./use-in-view";

export function HeroVisual({ variant }: { variant: LandingVariant }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  /* landing-e (pass B): on a phone the shot opens FILLED — lines written,
     total on the plate — so the first screen of the mock shows the result;
     the typing sequence runs from 1024px. Decided after mount (no UA
     sniffing); until then the shot waits, so nothing starts twice. */
  const [instant, setInstant] = useState<boolean | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setInstant(!window.matchMedia("(min-width: 1024px)").matches));
    return () => cancelAnimationFrame(id);
  }, []);
  const active = instant === null ? false : inView;
  const now = instant === true;
  return (
    <div ref={ref}>
      {variant.visual === "fence" && <FenceShot active={active} instant={now} />}
      {variant.visual === "roof" && <RoofShot active={active} instant={now} />}
      {variant.visual === "smart" && (
        <SmartProposalShot active={active} instant={now} scenario={SMART_SCENARIOS[variant.scenario ?? "kitchen"]} />
      )}
    </div>
  );
}
