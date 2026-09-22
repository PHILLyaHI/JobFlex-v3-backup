// THE HOMEOWNER'S REQUEST — THE PLAIN RULES (2026-09-21). No imports, so
// the wizards in the browser and the server actions share one answer:
//   needsAddressFor   — a roof, fence, siding, gutter, solar, driveway or
//                       deck job is priced off the parcel, so the request
//                       must carry the full street address.
//   estimatorFor      — which estimator a lead opens: roof → roof, fence →
//                       fence, HVAC → hvac, everything else → the Smart
//                       Proposal.
//   looksLikeStreetAddress — a number and a street word, not a city or ZIP.
// The model call that writes the scope lives in lib/leadScope (server).

export type EstimatorId = "roof" | "fence" | "hvac" | "smart";

/** Work that is measured off the lot or the roof: the address is part of the request. */
const PARCEL_WORK =
  /\b(?:roof\w*|shingle\w*|re-?roof|fence\w*|fencing|gate\b|siding|gutter\w*|downspout\w*|solar|driveway|paving|asphalt|concrete\s+(?:slab|pad|patio|driveway)|deck\b|decking|patio\s+cover|pergola|retaining\s+wall|sod\b|lawn|landscap\w*)\b/i;

/** True when the job is priced from the parcel or the roof, so a full street address is needed. */
export function needsAddressFor(text: string | null | undefined, trade?: string | null): boolean {
  if (trade && /^(roofing|fencing|siding|decking|landscaping|concrete)$/i.test(trade)) return true;
  return PARCEL_WORK.test(text ?? "");
}

/** The estimator a lead opens, from its detected trade (lib/tradeTypes) or its words. */
export function estimatorFor(trade: string | null | undefined, text?: string | null): EstimatorId {
  const t = (trade ?? "").toLowerCase();
  const w = text ?? "";
  if (t === "roofing" || (!t && /\broof|shingle/i.test(w))) return "roof";
  if (t === "fencing" || (!t && /\bfenc/i.test(w))) return "fence";
  if (t === "hvac" || (!t && /\b(?:hvac|furnace|heat\s*pump|air\s*condition|mini[-\s]?split|ductless)\b/i.test(w))) return "hvac";
  return "smart";
}

export const ESTIMATOR_PATH: Record<EstimatorId, string> = {
  roof: "/dashboard/roof-estimator",
  fence: "/dashboard/fence-estimator",
  hvac: "/dashboard/hvac-estimator",
  smart: "/dashboard/advanced-ai",
};

export const ESTIMATOR_LABEL: Record<EstimatorId, string> = {
  roof: "Roof estimator",
  fence: "Fence estimator",
  hvac: "HVAC estimator",
  smart: "Smart Proposal",
};

/** A street address, not just a city or a ZIP: a number followed by a street word. */
export function looksLikeStreetAddress(s: string | null | undefined): boolean {
  return /\d+\s+\S+.*\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|way|blvd|boulevard|ct|court|pl|place|cir|circle|hwy|highway|ter|terrace|pkwy|parkway|loop|trail|trl)\b/i.test(s ?? "");
}
