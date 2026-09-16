// Design conditions for an address: the county's 1% cooling and 99% heating
// temperatures from the ENERGY STAR table, the climate's moisture class and
// the airflow it wants. Pure; the server resolves the county, this resolves
// the numbers.

import type { DesignConditions } from "./types";
import { DESIGN_TEMPS, DESIGN_TEMPS_SOURCE, DESIGN_TEMPS_VERIFIED_ON } from "./data/designTemps";
import { GRAINS, humidityClass } from "./data/defaults";

interface CountyRow {
  county: string;
  coolingF: number;
  heatingF: number;
  hddCddRatio: number;
  approx: boolean;
}

const cache = new Map<string, CountyRow[]>();

function rowsFor(state: string): CountyRow[] {
  const st = state.toUpperCase();
  const hit = cache.get(st);
  if (hit) return hit;
  const enc = DESIGN_TEMPS[st];
  const rows: CountyRow[] = enc
    ? enc.split(";").map((r) => {
        const [county, c, h, ratio, flag] = r.split("|");
        return { county, coolingF: Number(c), heatingF: Number(h), hddCddRatio: Number(ratio), approx: flag === "~" };
      })
    : [];
  cache.set(st, rows);
  return rows;
}

/** "Miami-Dade County", "Doña Ana", "Anchorage Municipality" all reduce to a
 *  comparable key. "City" is KEPT: Virginia's Fairfax and Fairfax City, and
 *  St. Louis and St. Louis City, are different places with their own rows. */
export function countyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bst\.\s*/g, "st ")
    .replace(/\b(county|parish|borough|census area|municipality|municipio|city and borough)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface DesignLookup {
  conditions: DesignConditions;
  /** How the county was matched: exact, fuzzy, state median (no county), or none. */
  match: "county" | "fuzzy" | "state" | "none";
  /** True for the five counties whose values come from their neighbours. */
  approx: boolean;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Design conditions for a state and county; falls back to the state median
 *  when the county is unknown, and to a national default when the state is. */
export function designConditionsFor(state: string, county: string | undefined | null, elevationFt = 0): DesignLookup {
  const st = state.toUpperCase();
  const rows = rowsFor(st);
  const humidity = humidityClass(st);
  const base = { state: st, humidity, grainsDiff: GRAINS[humidity], elevationFt: Math.round(elevationFt), source: DESIGN_TEMPS_SOURCE, verifiedOn: DESIGN_TEMPS_VERIFIED_ON };
  if (!rows.length) {
    return {
      match: "none",
      approx: true,
      conditions: { ...base, county: county ?? "", coolingF: 92, heatingF: 15, hddCddRatio: 1.5, source: "national default — state not in the table" },
    };
  }
  const want = county ? countyKey(county) : "";
  let row: CountyRow | undefined;
  let match: DesignLookup["match"] = "state";
  if (want) {
    row = rows.find((r) => countyKey(r.county) === want);
    if (row) match = "county";
    else {
      // Whole-word prefix only: "st louis" ↔ "st louis city" yes, "lee" ↔ "leelanau" no.
      row = rows.find((r) => { const k = countyKey(r.county); return k.startsWith(want + " ") || want.startsWith(k + " "); });
      if (row) match = "fuzzy";
    }
  }
  if (!row) {
    // A territory has one "" row; a state without a county match takes its median.
    const single = rows.length === 1 ? rows[0] : null;
    if (single) return { match: "county", approx: single.approx, conditions: { ...base, county: single.county || st, coolingF: single.coolingF, heatingF: single.heatingF, hddCddRatio: single.hddCddRatio } };
    return {
      match: "state",
      approx: true,
      conditions: {
        ...base,
        county: county ?? "",
        coolingF: median(rows.map((r) => r.coolingF)),
        heatingF: median(rows.map((r) => r.heatingF)),
        hddCddRatio: median(rows.map((r) => r.hddCddRatio)),
        source: `${DESIGN_TEMPS_SOURCE} — state median, county not matched`,
      },
    };
  }
  return {
    match,
    approx: row.approx,
    conditions: {
      ...base,
      county: row.county,
      coolingF: row.coolingF,
      heatingF: row.heatingF,
      hddCddRatio: row.hddCddRatio,
      source: row.approx ? `${DESIGN_TEMPS_SOURCE} — neighbouring counties (this county is cut off in the source)` : DESIGN_TEMPS_SOURCE,
    },
  };
}

/** Every county the table knows for a state, for a picker. */
export function countiesFor(state: string): string[] {
  return rowsFor(state).map((r) => r.county).filter(Boolean);
}
