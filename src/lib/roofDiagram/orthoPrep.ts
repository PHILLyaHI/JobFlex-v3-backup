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
