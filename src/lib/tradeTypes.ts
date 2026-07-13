// Canonical trade taxonomy — the closed vocabulary for Lead Center matching.
// Single source of truth: the register form, company lead profile, AI trade
// detection, and the matcher all validate against this list. The mobile
// Trade & Services surface re-exports it from trade-data.ts. Server code must
// import from here (never from a route-group file).

export const TRADE_TYPES = [
  "Flooring",
  "Tile",
  "Countertops",
  "Plumbing",
  "Electrical",
  "Carpentry",
  "Painting",
  "Roofing",
  "Fencing",
  "Decking",
  "Siding",
  "Kitchen & Bath",
  "HVAC",
  "Landscaping",
  "Concrete",
  "Demolition",
  "Drywall",
  "Insulation",
  "Windows",
  "General Contractor",
  "Other",
] as const;

export type TradeType = (typeof TRADE_TYPES)[number];

export function isTradeType(value: string): value is TradeType {
  return (TRADE_TYPES as readonly string[]).includes(value);
}

/** Parse an Organization.tradeTypesJson blob into valid canonical trades. */
export function parseTradeTypes(json: string | null | undefined): TradeType[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((t): t is TradeType => typeof t === "string" && isTradeType(t));
  } catch {
    return [];
  }
}

// Hard filter: an org covers a trade only if it explicitly lists it. A lead
// detected as "Other" can't name a trade, so generalists (General Contractor
// or Other) take those.
export function orgCoversTrade(orgTrades: readonly string[], detected: TradeType): boolean {
  if (orgTrades.includes(detected)) return true;
  if (detected === "Other") {
    return orgTrades.includes("General Contractor") || orgTrades.includes("Other");
  }
  return false;
}
