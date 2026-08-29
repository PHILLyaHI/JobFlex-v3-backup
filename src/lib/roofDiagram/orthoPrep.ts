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
