// The parcel mask, subtracted out of EagleView's masked/clear imagery pair —
// and the ONE direction it may be used in.
//
// Measured 2026-08-28 (scripts/qa/roof/parcel-from-mask.ts): inside the
// unmasked zone the two variants are byte-identical (channel diff 0-8, a PNG
// round-trip), outside it they differ in a clean mode above 80 — no middle
// ground. The identical region is the lot PLUS a margin of roughly 20 ft per
// side (28 on the farm): on all four addresses with a cached cadastre ring the
// cadastre sat 100.0% inside the region while the region ran 137-214% of its
// area.
//
// That geometry dictates the contract:
//
//   SAFE   a structure wholly OUTSIDE the region is certainly not on this
//          parcel — the region is a superset of the lot, so nothing of the
//          lot's can be outside it. This is the veto this module exists for.
//   UNSAFE "inside the region" says nothing — a neighbour's shed within the
//          ~20 ft buffer lands inside. The region is NOT a ring source
//          (IoU against the cadastre is ~47%, the area ratio of a superset).
//
// Free: the imagery tokens are paid for with the Instant lookup itself.
import { decode } from "fast-png";

/** Channel difference above which the mask touched a pixel. Measured, bimodal. */
const DIFF_MAX = 8;

export interface LotMask {
  /** [minLon, minLat, maxLon, maxLat] of the frame, EPSG:4326. */
  bbox: [number, number, number, number];
  width: number;
  height: number;
  /** 1 = inside the identical (lot + margin) region. */
  lot: Uint8Array;
}

/**
 * Subtract the pair. Returns null when the two variants disagree in size —
 * they are then not the same framing and the subtraction means nothing.
 */
export function lotMaskFromPair(
  clearPng: Uint8Array,
  maskedPng: Uint8Array,
  bbox: [number, number, number, number],
): LotMask | null {
  const A = decode(clearPng);
  const B = decode(maskedPng);
  const ch = (A as unknown as { channels?: number }).channels ?? 3;
  if (A.width !== B.width || A.height !== B.height) return null;
  const w = A.width;
  const h = A.height;
  const a = A.data as Uint8Array;
  const b = B.data as Uint8Array;
  const lot = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let d = 0;
    for (let c = 0; c < Math.min(ch, 3); c++) d = Math.max(d, Math.abs(a[i * ch + c] - b[i * ch + c]));
    if (d <= DIFF_MAX) lot[i] = 1;
  }
  return { bbox, width: w, height: h, lot };
}

const sample = (m: LotMask, lat: number, lng: number): 0 | 1 | null => {
  const [minLon, minLat, maxLon, maxLat] = m.bbox;
  if (lng < minLon || lng > maxLon || lat < minLat || lat > maxLat) return null; // beyond the frame — unjudgeable
  const x = Math.min(m.width - 1, Math.max(0, Math.round(((lng - minLon) / (maxLon - minLon)) * m.width)));
  const y = Math.min(m.height - 1, Math.max(0, Math.round(((maxLat - lat) / (maxLat - minLat)) * m.height)));
  return m.lot[y * m.width + x] ? 1 : 0;
};

/**
 * The veto, in its only safe direction: TRUE only when every vertex of the
 * ring lies inside the frame AND outside the lot region. A ring that leaves
 * the frame cannot be judged and is never vetoed; a ring with any point in the
 * region is never vetoed. False negatives are fine — this is a guard, and a
 * guard that overreaches is worse than one that under-fires.
 */
export function ringWhollyOutsideLot(mask: LotMask, ring: ReadonlyArray<{ lat: number; lng: number }>): boolean {
  if (ring.length < 3) return false;
  for (const p of ring) {
    const v = sample(mask, p.lat, p.lng);
    if (v !== 0) return false; // inside the lot region, or beyond the frame
  }
  return true;
}
