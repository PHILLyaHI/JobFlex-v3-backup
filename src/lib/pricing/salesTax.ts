// State-level US sales tax estimate, resolved from a client/job address.
//
// Scope: base STATE rate only — it does not capture county/city/special-district
// surtaxes that many states layer on top (e.g. a specific TX or CA city adding a
// bit more than its state floor). It exists to seed a sane starting number for
// the proposal's tax field, not to be a compliance-grade calculator — the field
// stays fully editable, and the UI always labels this value as an estimate.
//
// Pure, client-safe (no DB, no server-only imports) so it can run directly in
// the proposal builder's client components as the address is entered.

export const STATE_SALES_TAX: Record<string, number> = {
  AL: 0.04, AK: 0.0, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029, CT: 0.0635,
  DE: 0.0, FL: 0.06, GA: 0.04, HI: 0.04, ID: 0.06, IL: 0.0625, IN: 0.07,
  IA: 0.06, KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06, MA: 0.0625,
  MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, MT: 0.0, NE: 0.055, NV: 0.0685,
  NH: 0.0, NJ: 0.06625, NM: 0.04875, NY: 0.04, NC: 0.0475, ND: 0.05, OH: 0.0575,
  OK: 0.045, OR: 0.0, PA: 0.06, RI: 0.07, SC: 0.06, SD: 0.042, TN: 0.07,
  TX: 0.0625, UT: 0.061, VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06, WI: 0.05,
  WY: 0.04, DC: 0.06,
};

// Full-name → USPS code, so a free-text "State" field (Texas / texas / TX) all
// resolve. Client.state has no dropdown/validation today — this keeps the
// lookup useful without requiring one.
const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
  HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
  KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
  MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS",
  MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI",
  WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC", "WASHINGTON DC": "DC", "WASHINGTON D.C.": "DC",
};

const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
);
STATE_CODE_TO_NAME.DC = "District of Columbia";

/** Free-text state ("Texas", "tx", " TX ") → USPS code, or null if unresolvable. */
export function resolveStateCode(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.length === 2 && upper in STATE_SALES_TAX) return upper;
  const byName = STATE_NAME_TO_CODE[upper];
  return byName ?? null;
}

/** Display name for a resolved state code, e.g. "TX" → "Texas". */
export function stateDisplayName(code: string): string {
  const name = STATE_CODE_TO_NAME[code];
  if (!name) return code;
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Base state sales tax rate as a fraction (0.0625 = 6.25%), or null when the
 * state can't be resolved (blank, unrecognized). 0 is a valid, real answer for
 * the handful of states with no state sales tax (AK, DE, MT, NH, OR).
 */
export function stateTaxRate(input: string | null | undefined): number | null {
  const code = resolveStateCode(input);
  return code ? STATE_SALES_TAX[code] : null;
}

/**
 * Best-effort USPS code from a one-line address ("123 Main St, Austin, TX
 * 78701" → "TX", "Dallas, Texas" → "TX"). Scans comma segments from the END
 * (where US addresses put the state) so street names never shadow the real
 * state; ZIP tokens are ignored. Null when nothing resolves — e.g. a bare
 * street line — so callers can fall back or skip the tax estimate.
 */
export function stateFromAddress(text: string | null | undefined): string | null {
  const raw = text?.trim();
  if (!raw) return null;
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const words = segments[i]
      .split(/\s+/)
      .filter((w) => !/^\d{5}(-\d{4})?$/.test(w)); // drop ZIP / ZIP+4 tokens
    if (words.length === 0) continue;
    for (const w of words) {
      const code = resolveStateCode(w);
      if (code) return code;
    }
    // Multi-word names sharing a segment with other tokens ("New York 10001").
    const joined = resolveStateCode(words.join(" "));
    if (joined) return joined;
  }
  return null;
}
