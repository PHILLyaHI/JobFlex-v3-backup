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
import { useInView } from "./use-in-view";

export function HeroVisual({ variant }: { variant: LandingVariant }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref}>
      {variant.visual === "fence" && <FenceShot active={inView} />}
      {variant.visual === "roof" && <RoofShot active={inView} />}
      {variant.visual === "smart" && (
        <SmartProposalShot active={inView} scenario={SMART_SCENARIOS[variant.scenario ?? "kitchen"]} />
      )}
    </div>
  );
}
