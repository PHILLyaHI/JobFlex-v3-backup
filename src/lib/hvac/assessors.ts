// County assessor layers — free, keyless ArcGIS parcel services that carry
// what the HVAC estimator wants (year built, living area, storeys, use) and
// answer a point query. One registry entry per county: the layer URL and the
// field names, plus how to read storeys when the county encodes them in a
// style string. Counties whose open data stop at the lot line (Snohomish,
// King, Pierce… as of 2026-09-16) are simply not here; Regrid covers them.
//
// Adding a county = one entry, verified by running its query once.

import { externalFetch } from "@/lib/externalCall";

export interface AssessorRecord {
  yearBuilt?: number;
  livingSqft?: number;
  storeys?: number;
  landUse?: string;
  parcelId?: string;
  /** Which layer answered, for the badge. */
  source: string;
}

interface Layer {
  /** "WA:Skagit" — state code and the county's own name. */
  key: string;
  source: string;
  url: string;
  fields: { yearBuilt?: string; livingSqft?: string; storeys?: string; style?: string; landUse?: string; parcelId?: string };
  /** Verified against a live query on this date. */
  verifiedOn: string;
}

export const ASSESSOR_LAYERS: Layer[] = [
  {
    key: "WA:Skagit",
    source: "Skagit County Assessor (AssessorDataParcels)",
    url: "https://gis.skagitcountywa.gov/arcgis/rest/services/OpenData/AssessorDataParcels/FeatureServer/0",
    fields: { yearBuilt: "YearBuilt", livingSqft: "LivingArea", style: "BuildingStyle", landUse: "LandUse", parcelId: "PNumber" },
    verifiedOn: "2026-09-16",
  },
];

const keyOf = (state: string, county: string) => `${state.toUpperCase()}:${county.replace(/\s+county$/i, "").trim().toLowerCase()}`;

export function assessorLayerFor(state: string, county: string | undefined | null): Layer | null {
  if (!county) return null;
  const want = keyOf(state, county);
  return ASSESSOR_LAYERS.find((l) => keyOf(l.key.split(":")[0], l.key.split(":")[1]) === want) ?? null;
}

/** "TWO STORY" → 2, "1 & 1/2 STORY" → 1.5, "2 STRY FIN BSMT" → 2, "SPLIT ENTRY" → 2,
 *  "TRI LEVEL" → 2, "1.5B" → 1.5; anything else undefined. */
export function storeysFromStyle(style: string | undefined | null): number | undefined {
  if (!style) return undefined;
  const s = style.toUpperCase().replace(/\s+/g, " ").trim();
  if (/^(SPLIT|BI OR SPLIT|BI-LEVEL|TRI LEVEL|TRI-LEVEL)/.test(s)) return 2;
  const words: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 };
  const w = s.match(/^(ONE|TWO|THREE|FOUR)\b/);
  if (w) return words[w[1]];
  const frac = s.match(/^(\d)\s*&\s*1\/2/);
  if (frac) return Number(frac[1]) + 0.5;
  const dec = s.match(/^(\d(?:\.\d)?)\s*(STRY|STY|STORY|STORIES|B\b)/);
  if (dec) return Number(dec[1]);
  const bare = s.match(/^(\d(?:\.\d)?)B?$/);
  if (bare) return Number(bare[1]);
  return undefined;
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** Map one layer's attributes to a record. Exported for the QA script. */
export function recordFromAttributes(layer: Layer, a: Record<string, unknown>): AssessorRecord | null {
  const out: AssessorRecord = { source: layer.source };
  const year = layer.fields.yearBuilt ? num(a[layer.fields.yearBuilt]) : undefined;
  if (year && year > 1700 && year < 2100) out.yearBuilt = Math.round(year);
  const area = layer.fields.livingSqft ? num(a[layer.fields.livingSqft]) : undefined;
  if (area && area >= 200 && area <= 20_000) out.livingSqft = Math.round(area);
  const st = layer.fields.storeys ? num(a[layer.fields.storeys]) : undefined;
  if (st && st > 0 && st < 10) out.storeys = st;
  else if (layer.fields.style) out.storeys = storeysFromStyle(a[layer.fields.style] as string | undefined);
  if (layer.fields.landUse && typeof a[layer.fields.landUse] === "string" && (a[layer.fields.landUse] as string).trim()) out.landUse = (a[layer.fields.landUse] as string).trim();
  if (layer.fields.parcelId && a[layer.fields.parcelId] !== undefined && a[layer.fields.parcelId] !== null) out.parcelId = String(a[layer.fields.parcelId]);
  return out.yearBuilt || out.livingSqft || out.storeys ? out : null;
}

/** The county's record for the parcel under a point, or null. Never throws. */
export async function assessorRecordAt(state: string, county: string | undefined | null, lat: number, lng: number): Promise<AssessorRecord | null> {
  const layer = assessorLayerFor(state, county);
  if (!layer) return null;
  const url = `${layer.url}/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
  try {
    const res = await externalFetch("assessor", layer.key, url, { headers: { Accept: "application/json" } }, { timeoutMs: 9_000, attempts: 2 });
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }>; error?: unknown };
    const attrs = data.features?.[0]?.attributes;
    return attrs ? recordFromAttributes(layer, attrs) : null;
  } catch {
    return null;
  }
}
