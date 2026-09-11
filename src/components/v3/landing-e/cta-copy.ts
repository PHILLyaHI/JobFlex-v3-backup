/* landing-e CTA copy (pass B, 2026-09-10). First person with the trade's
   outcome for the top of the page — nav, hero, sticky bar, showcase; one
   line for everything from Proposals down. The shared variant data
   (landing-d) is untouched: this is landing-e's own table. */

import type { LandingVariantKey } from "./landing-variants";

export const LOW_CTA = "Start my free trial";

const TOP: Record<LandingVariantKey, string> = {
  roofing: "Start my roof report",
  fencing: "Start my fence takeoff",
  decking: "Start my deck estimate",
  siding: "Start my siding bid",
  landscaping: "Start my yard proposal",
  concrete: "Start my concrete bid",
  windows: "Start my window quote",
  flooring: "Start my floor bid",
  tile: "Start my tile quote",
  countertops: "Start my countertop quote",
  painting: "Start my paint bid",
  drywall: "Start my drywall bid",
  insulation: "Start my insulation quote",
  "kitchen-bath": "Start my remodel estimate",
  plumbing: "Start my plumbing quote",
  electrical: "Start my electrical quote",
  hvac: "Start my HVAC quote",
  carpentry: "Start my carpentry bid",
  demolition: "Start my tear-out quote",
  "general-contractor": "Start my whole-job estimate",
};

/** The top-of-page CTA for a trade; the default page's is the low line. */
export function firstPersonCta(key: LandingVariantKey | undefined): string {
  return key ? TOP[key] : LOW_CTA;
}
