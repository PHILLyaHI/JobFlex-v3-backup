/* THE FIRST ESTIMATE, BY TRADE (landing-e pass A, 2026-09-11). One target
   for the welcome email's button and the Overview's first-run card: the roof
   estimator for a roofer, the fence estimator for a fencer, the HVAC
   estimator for an HVAC shop, Smart Proposal for everyone else. The landing's
   trade (what the ad promised) wins over the chips (what the owner picked) —
   it is the job they came to price.

   2026-10-09: the targets are the Blueprint pages. The roofer's button led to
   the classic /dashboard/advanced-ai/roof, whose Price/Order run on the
   legacy measurement API — a dead end for a real address on a trial (ticket
   HQFESV). A custom plan without the trade's page falls back to a page it
   holds, never to an upgrade offer. */
import { pageForPath } from "./customPlan";

export type FirstEstimateTrade = "roofing" | "fencing" | "hvac" | "general";

export type FirstEstimateTarget = {
  trade: FirstEstimateTrade;
  /** App-relative path. */
  href: string;
  /** The one button's words, first person. */
  label: string;
};

const ROOF: FirstEstimateTarget = { trade: "roofing", href: "/dashboard/roof-estimator", label: "Measure my first roof" };
const FENCE: FirstEstimateTarget = { trade: "fencing", href: "/dashboard/fence-estimator", label: "Quote my first fence" };
const HVAC: FirstEstimateTarget = { trade: "hvac", href: "/dashboard/hvac-estimator", label: "Price my first HVAC job" };
const SMART: FirstEstimateTarget = { trade: "general", href: "/dashboard/advanced-ai", label: "Make my first estimate" };
/** The base workspace's own builder: every plan holds it. */
const MANUAL: FirstEstimateTarget = { trade: "general", href: "/dashboard/manual-blueprint", label: "Make my first estimate" };

/**
 * @param pages the custom plan's pages (lib/customPageAccess.readCustomPages),
 *   or null/undefined for a catalog plan, which opens every page.
 */
export function firstEstimateTarget(
  tradeTypes: readonly string[],
  landingIndustry: string | null | undefined,
  pages?: readonly string[] | null,
): FirstEstimateTarget {
  const opens = (t: FirstEstimateTarget) => {
    if (!pages) return true;
    const page = pageForPath(t.href);
    return !page || pages.includes(page.id);
  };
  const is = (t: string) => landingIndustry === t || (landingIndustry == null && tradeTypes.includes(t));
  const byTrade: Array<[string, FirstEstimateTarget]> = [
    ["Roofing", ROOF],
    ["Fencing", FENCE],
    ["HVAC", HVAC],
  ];
  const wanted =
    byTrade.find(([t]) => is(t))?.[1] ?? byTrade.find(([t]) => tradeTypes.includes(t))?.[1] ?? SMART;
  if (opens(wanted)) return wanted;
  // A custom plan without that page: Smart Proposal if it holds it, else the
  // base workspace's builder — never another trade's estimator.
  return opens(SMART) ? SMART : MANUAL;
}
