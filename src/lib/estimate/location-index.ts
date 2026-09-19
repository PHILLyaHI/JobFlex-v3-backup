// Construction location index — the job's city first, then its state, then
// the national average (2026-09-18).
//
// Owner: prices must follow "their state, their major cities". The prompt
// used to scale national anchors by a state index alone (Lynnwood and Yakima
// both 1.15) and the sanity ranges by a 1.25 metro rule. The city table
// (./location-index-data, from public construction cost indices — sources in
// docs/pricing-sources.md) gives the factor where the job's city is listed;
// the state index covers the rest. 1.00 = US national average, total
// installed cost. Plain module.

import { stateFromAddress } from "@/lib/pricing/salesTax";
import { STATE_COST_INDEX } from "./trade-knowledge";
import { CITY_COST_INDEX, type CityCostRow } from "./location-index-data";

export type LocationIndex = {
  /** Multiply national anchors by this. */
  factor: number;
  level: "city" | "state" | "national";
  /** "Lynnwood, WA", "WA" or "the US" — for the prompt's line. */
  place: string;
  state: string | null;
  city: string | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

type Prepared = CityCostRow & { key: string };
const prepared: Prepared[] = CITY_COST_INDEX.map((r) => ({ ...r, key: norm(r.city) })).sort((a, b) => b.key.length - a.key.length);
const byState = new Map<string, Prepared[]>();
const statesPerKey = new Map<string, number>();
for (const r of prepared) {
  const list = byState.get(r.state) ?? [];
  list.push(r);
  byState.set(r.state, list);
  statesPerKey.set(r.key, (statesPerKey.get(r.key) ?? 0) + 1);
}

export const NATIONAL_INDEX: LocationIndex = { factor: 1, level: "national", place: "the US", state: null, city: null };

/**
 * The index for a free-form job location ("Lynnwood, WA", "13520 Bothell-
 * Everett Hwy, Bothell, WA 98012", "Dallas, Texas"). A listed city in the
 * job's state wins; with no state, a listed city whose name no other state
 * shares ("Portland" alone could be Oregon or Maine, so it is not guessed);
 * else the state's index; else national.
 */
export function locationIndex(location: string | null | undefined): LocationIndex {
  const raw = (location ?? "").trim();
  if (!raw) return NATIONAL_INDEX;
  const state = stateFromAddress(raw);
  const pool = state ? byState.get(state) ?? [] : prepared;
  // The city part of an address sits after the street ("13520 Bothell-
  // Everett Hwy, Bothell, WA"): comma segments are tried from the end, so a
  // street named after a city never picks the city.
  // With three or more segments the first is the street and is skipped
  // ("100 Seattle Hill Rd, Snohomish, WA" is not Seattle); with no comma at
  // all ("Everett WA 98201") the whole text is read.
  const parts = raw.split(",");
  const citySegments = (parts.length >= 3 ? parts.slice(1) : parts).map((seg) => ` ${norm(seg)} `).reverse();
  for (const text of citySegments) {
    for (const c of pool) {
      if (!state && (statesPerKey.get(c.key) ?? 0) > 1) continue;
      if (text.includes(` ${c.key} `)) return { factor: c.factor, level: "city", place: `${c.city}, ${c.state}`, state: c.state, city: c.city };
    }
  }
  if (state && STATE_COST_INDEX[state]) return { factor: STATE_COST_INDEX[state], level: "state", place: state, state, city: null };
  return NATIONAL_INDEX;
}

/** The one line the prompt carries about the job's market. */
export function locationLine(idx: LocationIndex): string {
  if (idx.level === "national") return "LOCATION: no city or state was recognized in the job's location — price at the US national average and say so in the assumptions.";
  const basis = idx.level === "city" ? "its construction cost index" : "the state index; a major city in it runs higher";
  return `LOCATION: the job is in ${idx.place}. Multiply national material and labor anchors by about ${idx.factor.toFixed(2)} (${basis}).`;
}
