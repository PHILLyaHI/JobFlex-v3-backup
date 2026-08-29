// The two pictures the layout read is given.
//
// 1. THE CLEAR ORTHO, not the masked one. Measured 2026-08-28: `masked:true`
//    greys out everything beyond the parcel, which leaves a smooth closed
//    high-contrast curve around the lot that exists on no roof. Every vision
//    measurement on this branch ran on that image, because outlineVision.ts
//    ranks masked first. A line detector cannot tell that curve from a real
//    edge, so the layout read takes the clear frame.
//
// 2. A CONTRAST MAP of the same frame. On raw orthophotography the creases of a
//    one-colour asphalt roof are nearly invisible — same shingle, same albedo,
//    a few degrees of slope apart. The owner found by hand on 12958 that this
//    sequence brings them out:
//
//      bilateral 9 / 60 / 60   flatten shingle texture, keep edges
//      CLAHE clip 3, 8x8       local contrast where the roof is one tone
//      Sobel ksize 5           gradient magnitude
//      Gaussian sigma 2        turn speckle into followable ridges
//
//    The defaults in cv.ts are already those numbers.
//
// Both go into ONE request, the second labelled as a contrast map of the same
// roof. What does NOT go in is our own footprint drawn on the image: a model
// hands a drawn outline straight back, and this branch has already mistaken
// that echo for agreement.
import { encode } from "fast-png";
import { bilateral, clahe, gaussian, grayFromPng, sobel } from "./cv";

export interface PreparedOrtho {
  /** The clear ortho exactly as EagleView served it. */
  photo: Uint8Array;
  /** The contrast map, greyscale PNG, same pixel grid. */
  contrast: Uint8Array;
  width: number;
  height: number;
  /** Ground size of one pixel, feet — lets the reader convert its own answers. */
  ftPerPx: number;
}

/**
 * Build the contrast map. Exported on its own because the harness renders it
 * for inspection: a preprocessing step nobody has looked at is a preprocessing
 * step nobody can defend.
 */
export function contrastMap(photo: Uint8Array): { bytes: Uint8Array; width: number; height: number } {
  const { w, h, gray } = grayFromPng(photo);
  const flat = bilateral(gray, w, h); //          9 / 60 / 60
  const even = clahe(flat, w, h); //              clip 3, 8x8
  const { mag } = sobel(even, w, h); //           ksize 5
  const smooth = gaussian(mag, w, h, 2);

  // Normalise to 0-255 on the observed range: an absolute scale would render
  // a low-contrast roof as a black rectangle.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] < lo) lo = smooth[i];
    if (smooth[i] > hi) hi = smooth[i];
  }
  const span = hi - lo || 1;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < smooth.length; i++) out[i] = Math.round(((smooth[i] - lo) / span) * 255);

  return { bytes: encode({ width: w, height: h, data: out, channels: 1, depth: 8 }), width: w, height: h };
}

/** Both pictures, from the clear ortho's bytes and its ground width. */
export function prepareOrtho(photo: Uint8Array, groundWidthFt: number): PreparedOrtho {
  const c = contrastMap(photo);
  return {
    photo,
    contrast: c.bytes,
    width: c.width,
    height: c.height,
    ftPerPx: groundWidthFt / c.width,
  };
}


// ── which frame the reader gets ──────────────────────────────────────────────

export interface VisionFrameCandidate {
  token: string;
  masked?: boolean;
  bbox: [number, number, number, number];
  /** Decoded picture, for the shadow measurement. */
  bytes: Uint8Array;
}

export interface VisionFrameChoice {
  index: number;
  /** Written into provenance verbatim — which token and why. */
  reason: string;
  shadowShare: number;
  ftPerPx: number;
}

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;

/** Share of pixels darker than luma 80 — inside the outline when one is given,
 *  else over the middle half of the frame. Fixed threshold on purpose: the
 *  number only ever COMPARES frames of the same scene. */
function shadowShareOf(bytes: Uint8Array, bbox: [number, number, number, number], origin: { lat: number; lng: number }, outline?: ReadonlyArray<{ lat: number; lng: number }>): number {
  const img = grayFromPng(bytes);
  const px = (lat: number, lng: number) => ({
    x: ((lng - bbox[0]) / (bbox[2] - bbox[0])) * img.w,
    y: ((bbox[3] - lat) / (bbox[3] - bbox[1])) * img.h,
  });
  let x0 = img.w * 0.25, x1 = img.w * 0.75, y0 = img.h * 0.25, y1 = img.h * 0.75;
  let ring: Array<{ x: number; y: number }> | null = null;
  if (outline && outline.length >= 3) {
    ring = outline.map((q) => px(q.lat, q.lng));
    x0 = Math.max(0, Math.min(...ring.map((p) => p.x)));
    x1 = Math.min(img.w, Math.max(...ring.map((p) => p.x)));
    y0 = Math.max(0, Math.min(...ring.map((p) => p.y)));
    y1 = Math.min(img.h, Math.max(...ring.map((p) => p.y)));
  }
  const inR = (x: number, y: number): boolean => {
    if (!ring) return true;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (ring[i].y > y !== ring[j].y > y && x < ((ring[j].x - ring[i].x) * (y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) inside = !inside;
    }
    return inside;
  };
  let dark = 0;
  let total = 0;
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) {
      if (!inR(x, y)) continue;
      total++;
      if (img.gray[y * img.w + x] < 80) dark++;
    }
  }
  void origin;
  return total ? dark / total : 0;
}

/**
 * Pick the frame the layout reader sees. The criteria, in order, and each one
 * earned by a measurement on this branch:
 *
 *   1. CLEAR only — masked:true carries a smooth high-contrast closed curve
 *      around the lot that exists on no roof, and every vision measurement
 *      before 2026-08-28 unknowingly ran on it;
 *   2. least roof in SHADOW — shadow is the reader's own most-cited unreadable
 *      reason, and we name it in the prompt as a known confounder, so the
 *      frame is chosen by the same criterion we warn the reader about;
 *   3. finest ft/px;
 *   4. tightest frame, so the subject fills the picture.
 *
 * The reason string goes to provenance verbatim: which token and why.
 */
export function chooseVisionFrame(
  cands: readonly VisionFrameCandidate[],
  origin: { lat: number; lng: number },
  outline?: ReadonlyArray<{ lat: number; lng: number }>,
): VisionFrameChoice | null {
  const scored = cands
    .filter((c) => c.masked === false)
    .filter((c) => origin.lng >= c.bbox[0] && origin.lng <= c.bbox[2] && origin.lat >= c.bbox[1] && origin.lat <= c.bbox[3])
    .map((c) => {
      const img = grayFromPng(c.bytes);
      const ftPerPx = ((c.bbox[2] - c.bbox[0]) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M) / img.w;
      return { c, ftPerPx, shadow: shadowShareOf(c.bytes, c.bbox, origin, outline), area: (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]) };
    });
  if (!scored.length) return null;
  scored.sort((a, b) => a.shadow - b.shadow || a.ftPerPx - b.ftPerPx || a.area - b.area);
  const best = scored[0];
  const idx = cands.findIndex((c) => c.token === best.c.token);
  return {
    index: idx,
    shadowShare: best.shadow,
    ftPerPx: best.ftPerPx,
    reason:
      `token ${best.c.token.slice(0, 8)}…: clear (masked carries a false lot-boundary curve), ` +
      `shadow ${(best.shadow * 100).toFixed(0)}% (least of ${scored.length} clear frames), ` +
      `${best.ftPerPx.toFixed(3)} ft/px` +
      (scored.length > 1 && Math.abs(scored[0].shadow - scored[1].shadow) < 0.02 ? ", tie on shadow broken by scale/tightness" : ""),
  };
}


// ── target anchoring ─────────────────────────────────────────────────────────
//
// Measured failure this closes: the reader was handed a frame WIDER than the
// lot with neighbours in it and never told which building is the subject. A
// frame plus "read the roof" is an invitation to read the most legible roof in
// the frame — which on 12629's wide frame is the neighbour with solar panels.
// The defect is not the model's; it is the absence of a target.

import { decode as pngDecode, encode as pngEncode } from "fast-png";

/** Crop the ortho to the outline plus a margin. Returns the new bbox with it. */
export function cropToOutline(
  photoPng: Uint8Array,
  bbox: [number, number, number, number],
  outline: ReadonlyArray<{ lat: number; lng: number }>,
  marginFt = 15,
): { png: Uint8Array; bbox: [number, number, number, number] } {
  const img = pngDecode(photoPng);
  const ch = (img as unknown as { channels?: number }).channels ?? 3;
  const w = img.width;
  const h = img.height;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const degPerFtX = 1 / (D2R * Math.cos(midLat * D2R) * EARTH_R_M * FT_PER_M);
  const degPerFtY = 1 / (D2R * EARTH_R_M * FT_PER_M);
  const lons = outline.map((p) => p.lng);
  const lats = outline.map((p) => p.lat);
  const cminLon = Math.max(minLon, Math.min(...lons) - marginFt * degPerFtX);
  const cmaxLon = Math.min(maxLon, Math.max(...lons) + marginFt * degPerFtX);
  const cminLat = Math.max(minLat, Math.min(...lats) - marginFt * degPerFtY);
  const cmaxLat = Math.min(maxLat, Math.max(...lats) + marginFt * degPerFtY);
  const x0 = Math.max(0, Math.floor(((cminLon - minLon) / (maxLon - minLon)) * w));
  const x1 = Math.min(w, Math.ceil(((cmaxLon - minLon) / (maxLon - minLon)) * w));
  const y0 = Math.max(0, Math.floor(((maxLat - cmaxLat) / (maxLat - minLat)) * h));
  const y1 = Math.min(h, Math.ceil(((maxLat - cminLat) / (maxLat - minLat)) * h));
  const cw = x1 - x0;
  const chh = y1 - y0;
  if (cw < 50 || chh < 50) return { png: photoPng, bbox }; // degenerate — keep the original
  const out = new Uint8Array(cw * chh * ch);
  const d = img.data as Uint8Array;
  for (let y = 0; y < chh; y++) {
    out.set(d.subarray(((y0 + y) * w + x0) * ch, ((y0 + y) * w + x1) * ch), y * cw * ch);
  }
  return {
    png: pngEncode({ width: cw, height: chh, data: out, channels: ch as 1 | 2 | 3 | 4, depth: 8 }),
    bbox: [
      minLon + (x0 / w) * (maxLon - minLon),
      maxLat - (y1 / h) * (maxLat - minLat),
      minLon + (x1 / w) * (maxLon - minLon),
      maxLat - (y0 / h) * (maxLat - minLat),
    ],
  };
}

/** Draw a crosshair marker at the pin. Returns a NEW png; the input is untouched. */
export function drawPinMarker(
  photoPng: Uint8Array,
  bbox: [number, number, number, number],
  origin: { lat: number; lng: number },
): Uint8Array {
  const img = pngDecode(photoPng);
  const ch = (img as unknown as { channels?: number }).channels ?? 3;
  const w = img.width;
  const h = img.height;
  const d = new Uint8Array(img.data as Uint8Array);
  const px = Math.round(((origin.lng - bbox[0]) / (bbox[2] - bbox[0])) * w);
  const py = Math.round(((bbox[3] - origin.lat) / (bbox[3] - bbox[1])) * h);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * ch;
    d[i] = r;
    if (ch > 1) d[i + 1] = g;
    if (ch > 2) d[i + 2] = b;
  };
  // A ring plus a cross, with a dark outline so it reads on any roof colour.
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    for (const rr of [14, 15]) put(Math.round(px + rr * Math.cos(rad)), Math.round(py + rr * Math.sin(rad)), 255, 230, 0);
    put(Math.round(px + 16 * Math.cos(rad)), Math.round(py + 16 * Math.sin(rad)), 20, 20, 20);
  }
  for (let t = -22; t <= 22; t++) {
    if (Math.abs(t) < 6) continue; // keep the centre visible
    put(px + t, py, 255, 230, 0);
    put(px, py + t, 255, 230, 0);
    put(px + t, py + 1, 20, 20, 20);
    put(px + 1, py + t, 20, 20, 20);
  }
  return pngEncode({ width: w, height: h, data: d, channels: ch as 1 | 2 | 3 | 4, depth: 8 });
}
