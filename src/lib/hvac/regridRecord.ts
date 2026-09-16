// The assessor's record as Regrid carries it — year built, storeys, the
// recorded structure area and use — read off the point lookup the fence page
// already makes (src/lib/parcel.ts). Regrid's standard schema (2026-09-16,
// support.regrid.com: Buildings & Structures fields) names them `yearbuilt`,
// `numstories` (fractional allowed), `recrdareno` (the assessor's recorded
// structure square footage), `area_building`, `structstyle`, `usedesc` and
// `ll_bldg_count`. Counties whose open data stop at the lot line (Snohomish,
// King) still reach Regrid through the assessor feed it licenses, so this is
// the source that answers "how big, how old, how many floors" there.

import type { RegridResponse } from "@/lib/parcel";

export interface RegridRecord {
  yearBuilt?: number;
  storeys?: number;
  /** The assessor's recorded structure area, sq ft (recrdareno, else area_building). */
  livingSqft?: number;
  buildingCount?: number;
  structStyle?: string;
  useDesc?: string;
  /** Which field the area came from, for the badge. */
  areaField?: "recrdareno" | "area_building";
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** The first parcel's schema fields, whatever wrapper the response uses. */
export function regridFields(data: RegridResponse | null | undefined): Record<string, unknown> | null {
  const feature = data?.parcels?.features?.[0] ?? data?.features?.[0];
  const props = (feature as { properties?: { fields?: Record<string, unknown> } } | undefined)?.properties;
  if (!props) return null;
  return props.fields ?? (props as Record<string, unknown>);
}

export function regridRecordOf(data: RegridResponse | null | undefined): RegridRecord | null {
  const f = regridFields(data);
  if (!f) return null;
  const out: RegridRecord = {};
  const year = num(f.yearbuilt);
  if (year && year > 1700 && year < 2100) out.yearBuilt = Math.round(year);
  const st = num(f.numstories);
  if (st && st > 0 && st < 10) out.storeys = st;
  const rec = num(f.recrdareno);
  const tot = num(f.area_building);
  if (rec && rec >= 200 && rec <= 20_000) { out.livingSqft = Math.round(rec); out.areaField = "recrdareno"; }
  else if (tot && tot >= 200 && tot <= 20_000) { out.livingSqft = Math.round(tot); out.areaField = "area_building"; }
  const cnt = num(f.ll_bldg_count) ?? num(f.structno);
  if (cnt !== undefined && cnt >= 0) out.buildingCount = Math.round(cnt);
  if (typeof f.structstyle === "string" && f.structstyle.trim()) out.structStyle = f.structstyle.trim();
  if (typeof f.usedesc === "string" && f.usedesc.trim()) out.useDesc = f.usedesc.trim();
  return Object.keys(out).length ? out : null;
}
