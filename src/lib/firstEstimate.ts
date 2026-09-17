/* THE FIRST ESTIMATE, BY TRADE (landing-e pass A, 2026-09-11). One target
   for the welcome email's button and the Overview's first-run card: the roof
   estimator for a roofer, the fence studio for a fencer, Smart Proposal for
   everyone else. The landing's trade (what the ad promised) wins over the
   chips (what the owner picked) — it is the job they came to price. */

export type FirstEstimateTarget = {
  trade: "roofing" | "fencing" | "general";
  /** App-relative path. */
  href: string;
  /** The one button's words, first person. */
  label: string;
};

export function firstEstimateTarget(tradeTypes: readonly string[], landingIndustry: string | null | undefined): FirstEstimateTarget {
  const is = (t: string) => landingIndustry === t || (landingIndustry == null && tradeTypes.includes(t));
  if (is("Roofing")) return { trade: "roofing", href: "/dashboard/advanced-ai/roof", label: "Measure my first roof" };
  if (is("Fencing")) return { trade: "fencing", href: "/dashboard/advanced-ai/fence/studio", label: "Quote my first fence" };
  if (tradeTypes.includes("Roofing")) return { trade: "roofing", href: "/dashboard/advanced-ai/roof", label: "Measure my first roof" };
  if (tradeTypes.includes("Fencing")) return { trade: "fencing", href: "/dashboard/advanced-ai/fence/studio", label: "Quote my first fence" };
  return { trade: "general", href: "/dashboard/advanced-ai", label: "Make my first estimate" };
}
