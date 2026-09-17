// County assessor layers — free, keyless ArcGIS parcel services that carry
// what the HVAC estimator wants (year built, living area, storeys, use) and
// answer a point query. One registry entry per county: the layer URL, the
// field names, and how to read storeys when the county encodes them in a
// style string. Every entry was verified against live queries on the date it
// carries (three towns each, scripts/qa/hvac-assessors.check.ts holds the
// parsers; the live smoke test is `npx tsx scripts/qa/hvac-assessors.live.ts`).
//
// Not here, and why (2026-09-16): Pierce WA (its attribute layer is
// referrer-locked, 403), Kitsap WA (building table licensed "non-commercial
// use only"), Snohomish WA beyond recent sales (building characteristics
// exist only as a 99 MB Improvement Records download). Regrid covers those.
//
// Adding a county = one entry, verified by running its query once.

import { externalFetch } from "@/lib/externalCall";

export interface AssessorRecord {
  yearBuilt?: number;
  livingSqft?: number;
  storeys?: number;
  landUse?: string;
  parcelId?: string;
  buildingCount?: number;
  /** Which layer answered, for the badge. */
  source: string;
}

export interface AssessorLayer {
  /** "WA:Skagit" — state code and the county's own name. */
  key: string;
  source: string;
  url: string;
  /** Polygon layers answer the parcel under the point; point layers (address
   *  points joined to building records) answer everything within `radiusM`
   *  and the nearest one is taken. */
  geometry: "polygon" | "point";
  radiusM?: number;
  fields: { yearBuilt?: string; livingSqft?: string; storeys?: string; style?: string; landUse?: string; parcelId?: string; buildingCount?: string; lat?: string; lng?: string };
  /** Verified against a live query on this date. */
  verifiedOn: string;
  /** Attribution the county asks for. */
  terms?: string;
  /** What this layer cannot answer, in the badge's voice. */
  partial?: string;
}

export const ASSESSOR_LAYERS: AssessorLayer[] = [
  {
    key: "WA:Skagit",
    source: "Skagit County Assessor (AssessorDataParcels)",
    url: "https://gis.skagitcountywa.gov/arcgis/rest/services/OpenData/AssessorDataParcels/FeatureServer/0",
    geometry: "polygon",
    fields: { yearBuilt: "YearBuilt", livingSqft: "LivingArea", style: "BuildingStyle", landUse: "LandUse", parcelId: "PNumber" },
    verifiedOn: "2026-09-16",
  },
  {
    key: "WA:King",
    source: "King County Assessor (Residential Parcels with Building Age)",
    url: "https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/Residential_Parcels_with_Building_Age/FeatureServer/2",
    geometry: "point",
    radiusM: 40,
    fields: { yearBuilt: "YrBuilt", livingSqft: "SqFtTotLiv", storeys: "Stories", buildingCount: "BldgNbr", landUse: "SITETYPE_D", parcelId: "PIN", lat: "LAT", lng: "LON" },
    verifiedOn: "2026-09-16",
    terms: "King County GIS Center data, used as is; King County acknowledged as the source.",
  },
  {
    key: "WA:Whatcom",
    source: "Whatcom County Assessor (WhatcomCo_Property)",
    url: "https://wcgis.whatcomcounty.us/arcgis/rest/services/EnterprisePublishing/WhatcomCo_Property/MapServer/1",
    geometry: "polygon",
    fields: { yearBuilt: "yr_blt", livingSqft: "sqft_la", style: "imprv_type", landUse: "property_use_cd", parcelId: "prop_id" },
    verifiedOn: "2026-09-16",
  },
  {
    key: "WA:Clark",
    source: "Clark County Assessor (TaxlotsPublic)",
    url: "https://gis.clark.wa.gov/arcgisfed/rest/services/ClarkView_Public/TaxlotsPublic/MapServer/0",
    geometry: "polygon",
    fields: { yearBuilt: "BldgYrBlt", livingSqft: "BldgSqft", style: "BldgStyle", buildingCount: "BldgCount", landUse: "PropertyUseClass", parcelId: "Prop_id" },
    verifiedOn: "2026-09-16",
  },
  {
    key: "WA:Thurston",
    source: "Thurston County Assessor (Thurston_Parcels)",
    url: "https://map.co.thurston.wa.us/arcgis/rest/services/Thurston/Thurston_Parcels/MapServer/0",
    geometry: "polygon",
    fields: { yearBuilt: "YEAR_BUILT", landUse: "USE_CODE", parcelId: "PARCEL_NO" },
    verifiedOn: "2026-09-16",
    partial: "year built only — no living area or storeys on the county layer",
  },
  {
    // Recently sold parcels only (~3 years): year built and a style code.
    key: "WA:Snohomish",
    source: "Snohomish County Assessor (Recent Property Sales)",
    url: "https://services6.arcgis.com/z6WYi9VRHfgwgtyW/arcgis/rest/services/Recent_Property_Sales/FeatureServer/0",
    geometry: "polygon",
    fields: { yearBuilt: "YEAR_BUILT", style: "STYLE", landUse: "PROP_CLASS", parcelId: "PARCEL_ID" },
    verifiedOn: "2026-09-16",
    partial: "recent sales only — year built and storeys for houses sold in the last few years",
  },
];

const keyOf = (state: string, county: string) => `${state.toUpperCase()}:${county.replace(/\s+county$/i, "").trim().toLowerCase()}`;

export function assessorLayerFor(state: string, county: string | undefined | null): AssessorLayer | null {
  if (!county) return null;
  const want = keyOf(state, county);
  return ASSESSOR_LAYERS.find((l) => keyOf(l.key.split(":")[0], l.key.split(":")[1]) === want) ?? null;
}

/** Storeys out of a county's style string. Skagit: "TWO STORY", "1 & 1/2
 *  STORY", "2 STRY FIN BSMT", "1.5B"; Whatcom: "1 STY", "1&H F", "D2STY",
 *  "T1.5F", "BI/LV"; Clark: "RANCH", "1 1/2 STORY"; Snohomish: "1 Sty",
 *  "2 Sty". Anything that is not a storey count answers undefined. */
export function storeysFromStyle(style: string | undefined | null): number | undefined {
  if (!style) return undefined;
  let s = style.toUpperCase().replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  if (/^(SPLIT|BI OR SPLIT|BI-LEVEL|BI\/LV|DBILV|DSPLT|TRI LEVEL|TRI-LEVEL)/.test(s)) return 2;
  if (/^RANCH\b/.test(s)) return 1;
  const words: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 };
  const w = s.match(/^(ONE|TWO|THREE|FOUR)\b/);
  if (w) return words[w[1]];
  // A leading D/F/T (duplex, ?, townhouse) before a digit is a building type, not a count.
  s = s.replace(/^[DFT](?=\d)/, "");
  // "1 & 1/2", "1 1/2", "1&H", "1&HF" → 1.5
  s = s.replace(/^(\d)\s*(?:&\s*H|&?\s*1\/2)/, "$1.5");
  const dec = s.match(/^(\d(?:\.\d)?)\s*(STRY|STY|STORY|STORIES|B|F|U)?\b/);
  if (dec) return Number(dec[1]);
  return undefined;
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** Map one layer's attributes to a record. Exported for the QA script. */
export function recordFromAttributes(layer: AssessorLayer, a: Record<string, unknown>): AssessorRecord | null {
  const out: AssessorRecord = { source: layer.source };
  const year = layer.fields.yearBuilt ? num(a[layer.fields.yearBuilt]) : undefined;
  if (year && year > 1700 && year < 2100) out.yearBuilt = Math.round(year);
  const area = layer.fields.livingSqft ? num(a[layer.fields.livingSqft]) : undefined;
  if (area && area >= 200 && area <= 20_000) out.livingSqft = Math.round(area);
  const st = layer.fields.storeys ? num(a[layer.fields.storeys]) : undefined;
  if (st && st > 0 && st < 10) out.storeys = st;
  else if (layer.fields.style) out.storeys = storeysFromStyle(a[layer.fields.style] as string | undefined);
  const cnt = layer.fields.buildingCount ? num(a[layer.fields.buildingCount]) : undefined;
  if (cnt !== undefined && cnt >= 0 && cnt < 100) out.buildingCount = Math.round(cnt);
  if (layer.fields.landUse && a[layer.fields.landUse] !== undefined && a[layer.fields.landUse] !== null && String(a[layer.fields.landUse]).trim()) out.landUse = String(a[layer.fields.landUse]).trim();
  if (layer.fields.parcelId && a[layer.fields.parcelId] !== undefined && a[layer.fields.parcelId] !== null && String(a[layer.fields.parcelId]).trim()) out.parcelId = String(a[layer.fields.parcelId]).trim();
  return out.yearBuilt || out.livingSqft || out.storeys ? out : null;
}

type Feature = { attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } };

/** For a point layer: the feature closest to the pin. Exported for the QA script. */
export function pickNearest(layer: AssessorLayer, features: Feature[], lat: number, lng: number): Feature | null {
  let best: Feature | null = null;
  let bestD = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const f of features) {
    const a = f.attributes ?? {};
    const fl = layer.fields.lat ? num(a[layer.fields.lat]) : undefined;
    const fn = layer.fields.lng ? num(a[layer.fields.lng]) : undefined;
    const py = fl ?? f.geometry?.y;
    const px = fn ?? f.geometry?.x;
    if (py === undefined || px === undefined) continue;
    const d = Math.hypot(py - lat, (px - lng) * cosLat);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** The county's record for the parcel under a point, or null. Never throws. */
export async function assessorRecordAt(state: string, county: string | undefined | null, lat: number, lng: number): Promise<AssessorRecord | null> {
  const layer = assessorLayerFor(state, county);
  if (!layer) return null;
  const base = `${layer.url}/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=json`;
  const url = layer.geometry === "point" ? `${base}&distance=${layer.radiusM ?? 40}&units=esriSRUnit_Meter&returnGeometry=true&outSR=4326` : `${base}&returnGeometry=false`;
  try {
    const res = await externalFetch("assessor", layer.key, url, { headers: { Accept: "application/json" } }, { timeoutMs: 9_000, attempts: 2 });
    const data = (await res.json()) as { features?: Feature[]; error?: unknown };
    const feats = data.features ?? [];
    const f = layer.geometry === "point" ? pickNearest(layer, feats, lat, lng) : feats[0] ?? null;
    return f?.attributes ? recordFromAttributes(layer, f.attributes) : null;
  } catch {
    return null;
  }
}
