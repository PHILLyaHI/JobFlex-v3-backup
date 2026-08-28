/**
 * cv.ts — hand-rolled computer-vision primitives for roof-line detection.
 *
 * Promoted from .cache/roof-diagram/cvlib.ts, where it was measurement
 * scaffolding, because the vision call now needs the SAME preprocessing in the
 * product that the owner used by hand to find the layout on 12958. Keeping two
 * copies would be §K7 exactly — duplicated helper code duplicating its bugs —
 * so this is the one, and the cache copy is stale.
 *
 * Pure functions, no network, no product imports. Everything is implemented by
 * hand over typed arrays: there is no OpenCV here.
 *
 * Pipeline this is built for:
 *   loadGray -> bilateral -> clahe -> sobel/canny -> houghP -> mergeCollinear
 *   -> extendAlongSupport
 */

import { readFileSync } from "node:fs";
import { decode } from "fast-png";

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface GrayImage {
  w: number;
  h: number;
  gray: Float32Array;
}

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MergedLine extends Seg {
  /** total length of the input segments that fell into this group */
  support: number;
}

export interface SobelResult {
  gx: Float32Array;
  gy: Float32Array;
  mag: Float32Array;
}

export interface HoughOpts {
  /** accumulator votes required before a line is walked out. */
  threshold?: number;
  /** minimum |dx| or |dy| span of an emitted segment. */
  minLineLength?: number;
  /** how many consecutive empty pixels end a walk. */
  maxLineGap?: number;
  /** rho quantisation in pixels. */
  rho?: number;
  /** theta quantisation in radians. */
  theta?: number;
  /** cap on emitted segments. */
  linesMax?: number;
  /** LCG seed — the shuffle is deterministic, results are reproducible. */
  seed?: number;
}

export interface ExtendOpts {
  /** half-width of the perpendicular band the support maximum is taken over. */
  band?: number;
  /** stop when support < frac * local median. */
  frac?: number;
  /** rolling window length (N) the local median is taken over. */
  window?: number;
  /** how many consecutive failing samples end the walk. */
  patience?: number;
  /** hard cap on how far each end may travel, in px. */
  maxExtend?: number;
}

export interface ExtendResult extends Seg {
  /** support profile sampled at 1 px along the FINAL (extended) line. */
  samples: number[];
}

// ---------------------------------------------------------------------------
// small shared helpers
// ---------------------------------------------------------------------------

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** bilinear sample with edge clamping. */
export function sampleBilinear(
  src: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  if (x < 0) x = 0;
  else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0;
  else if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1 > w - 1 ? w - 1 : x0 + 1;
  const y1 = y0 + 1 > h - 1 ? h - 1 : y0 + 1;
  const fx = x - x0;
  const fy = y - y0;
  const r0 = y0 * w;
  const r1 = y1 * w;
  const a = src[r0 + x0];
  const b = src[r0 + x1];
  const c = src[r1 + x0];
  const d = src[r1 + x1];
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

// ---------------------------------------------------------------------------
// 1. loadGray
// ---------------------------------------------------------------------------

/**
 * Decode a PNG from disk and return ITU-R 601 luminance in 0..255.
 * Handles 8- and 16-bit depth and 1/2/3/4 channels; 16-bit is rescaled to 0..255.
 */
/** Grayscale from PNG bytes already in memory — the product path never has a file. */
export function grayFromPng(bytes: Uint8Array): GrayImage {
  const img = decode(bytes);
  const { width: w, height: h, channels } = img as unknown as { width: number; height: number; channels: number };
  const data = (img as unknown as { data: ArrayLike<number> }).data;
  const gray = new Float32Array(w * h);
  // Rec. 601 luma, the same weighting loadGray uses.
  for (let i = 0; i < w * h; i++) {
    if (channels >= 3) {
      gray[i] = 0.299 * data[i * channels] + 0.587 * data[i * channels + 1] + 0.114 * data[i * channels + 2];
    } else {
      gray[i] = data[i * channels];
    }
  }
  return { w, h, gray };
}

export function loadGray(path: string): GrayImage {
  const png = decode(readFileSync(path));
  const w = png.width;
  const h = png.height;
  const ch = png.channels ?? 3;
  const data = png.data;
  const scale = png.depth === 16 ? 255 / 65535 : 1;
  const gray = new Float32Array(w * h);
  const n = w * h;

  if (ch >= 3) {
    for (let i = 0; i < n; i++) {
      const o = i * ch;
      gray[i] =
        (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) * scale;
    }
  } else {
    for (let i = 0; i < n; i++) {
      gray[i] = data[i * ch] * scale;
    }
  }
  return { w, h, gray };
}

// ---------------------------------------------------------------------------
// 2. bilateral
// ---------------------------------------------------------------------------

/**
 * Bilateral filter. Window radius is floor(d/2); the spatial kernel and a
 * 256-entry colour LUT are precomputed, so the inner loop is two lookups and
 * two multiplies. Borders replicate.
 */
export function bilateral(
  gray: Float32Array,
  w: number,
  h: number,
  d = 9,
  sigmaColor = 60,
  sigmaSpace = 60,
): Float32Array {
  const r = Math.max(1, Math.floor(d / 2));
  const k = 2 * r + 1;

  // spatial kernel, precomputed
  const spatial = new Float32Array(k * k);
  const inv2ss = 1 / (2 * sigmaSpace * sigmaSpace);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      spatial[(dy + r) * k + (dx + r)] = Math.exp(-(dx * dx + dy * dy) * inv2ss);
    }
  }

  // colour LUT indexed by rounded |I - I0|, 0..255
  const colorLut = new Float32Array(256);
  const inv2sc = 1 / (2 * sigmaColor * sigmaColor);
  for (let i = 0; i < 256; i++) colorLut[i] = Math.exp(-(i * i) * inv2sc);

  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const c = gray[idx];
      let sum = 0;
      let wsum = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clampInt(y + dy, 0, h - 1);
        const row = yy * w;
        const srow = (dy + r) * k + r;
        for (let dx = -r; dx <= r; dx++) {
          const xx = clampInt(x + dx, 0, w - 1);
          const v = gray[row + xx];
          let diff = v - c;
          if (diff < 0) diff = -diff;
          let di = diff + 0.5;
          if (di > 255) di = 255;
          const wgt = spatial[srow + dx] * colorLut[di | 0];
          sum += wgt * v;
          wsum += wgt;
        }
      }
      out[idx] = wsum > 0 ? sum / wsum : c;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. clahe
// ---------------------------------------------------------------------------

/**
 * Contrast-limited adaptive histogram equalisation.
 * tiles x tiles grid, 256-bin histogram per tile, clipped at
 * clipLimit * (tilePixels / 256) with the clipped mass redistributed
 * uniformly (plus a strided pass for the remainder, as OpenCV does), a CDF per
 * tile, then bilinear interpolation between the four surrounding tile mappings.
 */
export function clahe(
  gray: Float32Array,
  w: number,
  h: number,
  clipLimit = 3.0,
  tiles = 8,
): Float32Array {
  const tw = w / tiles;
  const th = h / tiles;
  const hist = new Int32Array(tiles * tiles * 256);
  const counts = new Int32Array(tiles * tiles);

  // per-tile histograms
  for (let y = 0; y < h; y++) {
    let ty = (y / th) | 0;
    if (ty > tiles - 1) ty = tiles - 1;
    const rowBase = y * w;
    for (let x = 0; x < w; x++) {
      let tx = (x / tw) | 0;
      if (tx > tiles - 1) tx = tiles - 1;
      const v = clampInt(Math.round(gray[rowBase + x]), 0, 255);
      const t = ty * tiles + tx;
      hist[t * 256 + v]++;
      counts[t]++;
    }
  }

  // clip + redistribute + CDF -> per-tile LUT
  const lut = new Float32Array(tiles * tiles * 256);
  for (let t = 0; t < tiles * tiles; t++) {
    const base = t * 256;
    const total = counts[t];
    if (total === 0) {
      for (let i = 0; i < 256; i++) lut[base + i] = i;
      continue;
    }
    const limit = Math.max(1, Math.floor((clipLimit * total) / 256));
    let clipped = 0;
    for (let i = 0; i < 256; i++) {
      const v = hist[base + i];
      if (v > limit) {
        clipped += v - limit;
        hist[base + i] = limit;
      }
    }
    const batch = (clipped / 256) | 0;
    let residual = clipped - batch * 256;
    if (batch > 0) for (let i = 0; i < 256; i++) hist[base + i] += batch;
    if (residual > 0) {
      const step = Math.max(1, (256 / residual) | 0);
      for (let i = 0; i < 256 && residual > 0; i += step) {
        hist[base + i]++;
        residual--;
      }
      for (let i = 0; i < 256 && residual > 0; i++) {
        hist[base + i]++;
        residual--;
      }
    }
    let cdf = 0;
    const scale = 255 / total;
    for (let i = 0; i < 256; i++) {
      cdf += hist[base + i];
      const v = cdf * scale;
      lut[base + i] = v > 255 ? 255 : v;
    }
  }

  // bilinear interpolation between the four surrounding tile mappings
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / th - 0.5;
    let ty0 = Math.floor(fy);
    let wy = fy - ty0;
    if (ty0 < 0) {
      ty0 = 0;
      wy = 0;
    }
    let ty1 = ty0 + 1;
    if (ty1 > tiles - 1) {
      ty1 = tiles - 1;
      if (ty0 > tiles - 1) ty0 = tiles - 1;
      if (ty0 === ty1) wy = 0;
    }
    const rowBase = y * w;
    for (let x = 0; x < w; x++) {
      const fx = x / tw - 0.5;
      let tx0 = Math.floor(fx);
      let wx = fx - tx0;
      if (tx0 < 0) {
        tx0 = 0;
        wx = 0;
      }
      let tx1 = tx0 + 1;
      if (tx1 > tiles - 1) {
        tx1 = tiles - 1;
        if (tx0 > tiles - 1) tx0 = tiles - 1;
        if (tx0 === tx1) wx = 0;
      }
      const v = clampInt(Math.round(gray[rowBase + x]), 0, 255);
      const a = lut[(ty0 * tiles + tx0) * 256 + v];
      const b = lut[(ty0 * tiles + tx1) * 256 + v];
      const c = lut[(ty1 * tiles + tx0) * 256 + v];
      const dd = lut[(ty1 * tiles + tx1) * 256 + v];
      const top = a + (b - a) * wx;
      const bot = c + (dd - c) * wx;
      out[rowBase + x] = top + (bot - top) * wy;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. sobel
// ---------------------------------------------------------------------------

/**
 * Separable Sobel. ksize 5 uses smooth [1,4,6,4,1] / deriv [-1,-2,0,2,1];
 * ksize 3 uses smooth [1,2,1] / deriv [-1,0,1]. Borders replicate.
 */
/**
 * Separable Gaussian blur. Needed after `sobel` — the owner's recipe is Sobel
 * ksize 5 followed by a sigma-2 smooth, which turns a speckled gradient into
 * the continuous ridges a reader (human or model) can actually follow.
 */
export function gaussian(src: Float32Array, w: number, h: number, sigma = 2): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;

  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        acc += src[row + xx] * k[i + r];
      }
      tmp[row + x] = acc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        acc += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

export function sobel(
  gray: Float32Array,
  w: number,
  h: number,
  ksize = 5,
): SobelResult {
  const smooth =
    ksize === 3 ? Float32Array.from([1, 2, 1]) : Float32Array.from([1, 4, 6, 4, 1]);
  const deriv =
    ksize === 3
      ? Float32Array.from([-1, 0, 1])
      : Float32Array.from([-1, -2, 0, 2, 1]);
  const r = (smooth.length - 1) / 2;
  const n = w * h;

  const tmpA = new Float32Array(n); // deriv along x
  const tmpB = new Float32Array(n); // smooth along x
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sa = 0;
      let sb = 0;
      for (let k = -r; k <= r; k++) {
        const v = gray[row + clampInt(x + k, 0, w - 1)];
        sa += deriv[k + r] * v;
        sb += smooth[k + r] * v;
      }
      tmpA[row + x] = sa;
      tmpB[row + x] = sb;
    }
  }

  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const mag = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sx = 0;
      let sy = 0;
      for (let k = -r; k <= r; k++) {
        const yy = clampInt(y + k, 0, h - 1) * w + x;
        sx += smooth[k + r] * tmpA[yy];
        sy += deriv[k + r] * tmpB[yy];
      }
      const i = row + x;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return { gx, gy, mag };
}

// ---------------------------------------------------------------------------
// 5. canny
// ---------------------------------------------------------------------------

/**
 * Canny edges (0 or 255): 3x3 Sobel, L1 magnitude, non-maximum suppression on
 * the gradient direction quantised to 0/45/90/135, then hysteresis by flood
 * fill outward from the strong pixels.
 */
export function canny(
  gray: Float32Array,
  w: number,
  h: number,
  lo = 20,
  hi = 70,
): Uint8Array {
  const n = w * h;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const mag = new Float32Array(n);

  for (let y = 0; y < h; y++) {
    const ym = clampInt(y - 1, 0, h - 1) * w;
    const yc = y * w;
    const yp = clampInt(y + 1, 0, h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xm = clampInt(x - 1, 0, w - 1);
      const xp = clampInt(x + 1, 0, w - 1);
      const a = gray[ym + xm];
      const b = gray[ym + x];
      const c = gray[ym + xp];
      const d = gray[yc + xm];
      const f = gray[yc + xp];
      const g = gray[yp + xm];
      const i2 = gray[yp + x];
      const j = gray[yp + xp];
      const sx = -a + c - 2 * d + 2 * f - g + j;
      const sy = -a - 2 * b - c + g + 2 * i2 + j;
      const idx = yc + x;
      gx[idx] = sx;
      gy[idx] = sy;
      mag[idx] = Math.abs(sx) + Math.abs(sy); // L1, as OpenCV defaults to
    }
  }

  // non-maximum suppression
  const sup = new Float32Array(n);
  const TAN22 = 0.4142135623730951;
  const TAN67 = 2.414213562373095;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      if (m === 0) continue;
      const ax = Math.abs(gx[idx]);
      const ay = Math.abs(gy[idx]);
      let n1: number;
      let n2: number;
      if (ax === 0) {
        n1 = mag[idx - w];
        n2 = mag[idx + w];
      } else {
        const t = ay / ax;
        if (t <= TAN22) {
          n1 = mag[idx - 1];
          n2 = mag[idx + 1];
        } else if (t >= TAN67) {
          n1 = mag[idx - w];
          n2 = mag[idx + w];
        } else if (gx[idx] * gy[idx] > 0) {
          n1 = mag[idx - w - 1];
          n2 = mag[idx + w + 1];
        } else {
          n1 = mag[idx - w + 1];
          n2 = mag[idx + w - 1];
        }
      }
      if (m >= n1 && m >= n2) sup[idx] = m;
    }
  }

  // hysteresis: flood fill from strong pixels through weak ones
  const out = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (sup[i] >= hi && out[i] === 0) {
      out[i] = 255;
      stack[sp++] = i;
      while (sp > 0) {
        const p = stack[--sp];
        const py = (p / w) | 0;
        const px = p - py * w;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = py + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = px + dx;
            if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (out[q] === 0 && sup[q] >= lo) {
              out[q] = 255;
              stack[sp++] = q;
            }
          }
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. erodeMask
// ---------------------------------------------------------------------------

/** Binary erosion by a disc of the given radius. Out-of-bounds counts as background. */
export function erodeMask(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(w * h);
  if (radius <= 0) {
    out.set(mask);
    return out;
  }
  const offs: number[] = [];
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) offs.push(dx, dy);
    }
  }
  const off = Int32Array.from(offs);
  const m = off.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0) continue;
      let keep = 1;
      for (let k = 0; k < m; k += 2) {
        const xx = x + off[k];
        const yy = y + off[k + 1];
        if (xx < 0 || xx >= w || yy < 0 || yy >= h || mask[yy * w + xx] === 0) {
          keep = 0;
          break;
        }
      }
      if (keep) out[idx] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. houghP
// ---------------------------------------------------------------------------

/** Deterministic LCG (numerical recipes constants) — never Math.random. */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

/**
 * Probabilistic Hough transform, following the OpenCV HoughLinesP algorithm:
 * shuffle the edge pixels (deterministically), vote, and when a bin crosses
 * threshold walk the line both ways tolerating maxLineGap, emit if long enough,
 * then subtract the consumed pixels back out of the accumulator.
 */
export function houghP(
  edges: Uint8Array,
  w: number,
  h: number,
  opts: HoughOpts = {},
): Seg[] {
  const threshold = opts.threshold ?? 45;
  const lineLength = opts.minLineLength ?? 90;
  const lineGap = opts.maxLineGap ?? 30;
  const rho = opts.rho ?? 1;
  const theta = opts.theta ?? Math.PI / 720;
  const linesMax = opts.linesMax ?? 4096;
  const rand = makeLcg(opts.seed ?? 12345);

  const numangle = Math.round(Math.PI / theta);
  const numrho = Math.round(((w + h) * 2 + 1) / rho);
  const accum = new Int32Array(numangle * numrho);
  const mask = new Uint8Array(w * h);

  const ttab = new Float32Array(numangle * 2);
  const irho = 1 / rho;
  for (let n = 0; n < numangle; n++) {
    ttab[n * 2] = Math.cos(n * theta) * irho;
    ttab[n * 2 + 1] = Math.sin(n * theta) * irho;
  }

  // collect the non-zero pixels
  let count = 0;
  for (let i = 0; i < w * h; i++) if (edges[i]) count++;
  const nzx = new Int32Array(count);
  const nzy = new Int32Array(count);
  let p = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x]) {
        mask[y * w + x] = 1;
        nzx[p] = x;
        nzy[p] = y;
        p++;
      }
    }
  }
  // deterministic Fisher-Yates shuffle
  for (let i = count - 1; i > 0; i--) {
    const j = rand() % (i + 1);
    let t = nzx[i];
    nzx[i] = nzx[j];
    nzx[j] = t;
    t = nzy[i];
    nzy[i] = nzy[j];
    nzy[j] = t;
  }

  const lines: Seg[] = [];
  const SHIFT = 16;
  const HALF = 1 << (SHIFT - 1);
  const rhoOff = (numrho - 1) >> 1;
  const endX = [0, 0];
  const endY = [0, 0];

  for (; count > 0; count--) {
    const idx = rand() % count;
    const j0 = nzx[idx];
    const i0 = nzy[idx];
    nzx[idx] = nzx[count - 1];
    nzy[idx] = nzy[count - 1];

    if (!mask[i0 * w + j0]) continue;

    let maxVal = threshold - 1;
    let maxN = 0;
    for (let n = 0; n < numangle; n++) {
      let r = Math.round(j0 * ttab[n * 2] + i0 * ttab[n * 2 + 1]) + rhoOff;
      if (r < 0) r = 0;
      else if (r >= numrho) r = numrho - 1;
      const v = ++accum[n * numrho + r];
      if (maxVal < v) {
        maxVal = v;
        maxN = n;
      }
    }
    if (maxVal < threshold) continue;

    const a = -ttab[maxN * 2 + 1];
    const b = ttab[maxN * 2];
    let x0 = j0;
    let y0 = i0;
    let dx0: number;
    let dy0: number;
    let xflag: boolean;
    if (Math.abs(a) > Math.abs(b)) {
      xflag = true;
      dx0 = a > 0 ? 1 : -1;
      dy0 = Math.round((b * (1 << SHIFT)) / Math.abs(a));
      y0 = (y0 << SHIFT) + HALF;
    } else {
      xflag = false;
      dy0 = b > 0 ? 1 : -1;
      dx0 = Math.round((a * (1 << SHIFT)) / Math.abs(b));
      x0 = (x0 << SHIFT) + HALF;
    }

    // pass 1: find the two ends
    for (let k = 0; k < 2; k++) {
      let gap = 0;
      let x = x0;
      let y = y0;
      let dx = dx0;
      let dy = dy0;
      if (k > 0) {
        dx = -dx;
        dy = -dy;
      }
      for (;; x += dx, y += dy) {
        let i1: number;
        let j1: number;
        if (xflag) {
          j1 = x;
          i1 = y >> SHIFT;
        } else {
          j1 = x >> SHIFT;
          i1 = y;
        }
        if (j1 < 0 || j1 >= w || i1 < 0 || i1 >= h) break;
        if (mask[i1 * w + j1]) {
          gap = 0;
          endX[k] = j1;
          endY[k] = i1;
        } else if (++gap > lineGap) break;
      }
    }

    const goodLine =
      Math.abs(endX[1] - endX[0]) >= lineLength ||
      Math.abs(endY[1] - endY[0]) >= lineLength;

    // pass 2: consume the pixels (and their votes, if the line was kept)
    for (let k = 0; k < 2; k++) {
      let x = x0;
      let y = y0;
      let dx = dx0;
      let dy = dy0;
      if (k > 0) {
        dx = -dx;
        dy = -dy;
      }
      for (;; x += dx, y += dy) {
        let i1: number;
        let j1: number;
        if (xflag) {
          j1 = x;
          i1 = y >> SHIFT;
        } else {
          j1 = x >> SHIFT;
          i1 = y;
        }
        if (j1 < 0 || j1 >= w || i1 < 0 || i1 >= h) break;
        const mi = i1 * w + j1;
        if (mask[mi]) {
          if (goodLine) {
            for (let n = 0; n < numangle; n++) {
              let r =
                Math.round(j1 * ttab[n * 2] + i1 * ttab[n * 2 + 1]) + rhoOff;
              if (r < 0) r = 0;
              else if (r >= numrho) r = numrho - 1;
              accum[n * numrho + r]--;
            }
          }
          mask[mi] = 0;
        }
        if (i1 === endY[k] && j1 === endX[k]) break;
      }
    }

    if (goodLine) {
      lines.push({ x1: endX[0], y1: endY[0], x2: endX[1], y2: endY[1] });
      if (lines.length >= linesMax) return lines;
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 8. mergeCollinear
// ---------------------------------------------------------------------------

interface ClusterFit {
  ang: number;
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  lo: number;
  hi: number;
  maxOff: number;
}

interface Cluster {
  sumL: number;
  sumX: number; // length-weighted centroid accumulators
  sumY: number;
  sumC: number; // length-weighted doubled-angle accumulators
  sumS: number;
  members: number[];
  /** cached fit, invalidated whenever a member is added */
  fit: ClusterFit | null;
}

function normAngle(t: number): number {
  // fold into [0, PI)
  let a = t % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/**
 * Collapse segments that share a direction (within angleTolDeg) and a
 * perpendicular offset (within offsetTolPx) into one segment spanning the
 * extreme projections. Segments whose projections along the shared direction
 * are further apart than gapPx are left in separate groups.
 * `support` is the total input segment length in the group.
 */
export function mergeCollinear(
  segs: Seg[],
  angleTolDeg = 5,
  offsetTolPx = 6,
  gapPx = 40,
): MergedLine[] {
  if (segs.length === 0) return [];
  const angTol = (angleTolDeg * Math.PI) / 180;

  const len = new Float64Array(segs.length);
  const ang = new Float64Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    len[i] = Math.hypot(dx, dy);
    ang[i] = normAngle(Math.atan2(dy, dx));
  }
  const order = Array.from(segs.keys()).sort((a, b) => len[b] - len[a]);

  const clusters: Cluster[] = [];

  const spanOf = (c: Cluster): ClusterFit => {
    if (c.fit) return c.fit;
    const ang0 = normAngle(0.5 * Math.atan2(c.sumS, c.sumC));
    const cx = c.sumX / c.sumL;
    const cy = c.sumY / c.sumL;
    const ux = Math.cos(ang0);
    const uy = Math.sin(ang0);
    let lo = Infinity;
    let hi = -Infinity;
    let off = 0;
    for (const m of c.members) {
      const s = segs[m];
      for (let e = 0; e < 2; e++) {
        const px = e === 0 ? s.x1 : s.x2;
        const py = e === 0 ? s.y1 : s.y2;
        const t = (px - cx) * ux + (py - cy) * uy;
        const o = Math.abs(-(px - cx) * uy + (py - cy) * ux);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
        if (o > off) off = o;
      }
    }
    c.fit = { ang: ang0, cx, cy, ux, uy, lo, hi, maxOff: off };
    return c.fit;
  };

  const fits = (c: Cluster, i: number): boolean => {
    const f = spanOf(c);
    if (angleDiff(f.ang, ang[i]) > angTol) return false;
    const s = segs[i];
    const o1 = Math.abs(-(s.x1 - f.cx) * f.uy + (s.y1 - f.cy) * f.ux);
    const o2 = Math.abs(-(s.x2 - f.cx) * f.uy + (s.y2 - f.cy) * f.ux);
    if (o1 > offsetTolPx || o2 > offsetTolPx) return false;
    const t1 = (s.x1 - f.cx) * f.ux + (s.y1 - f.cy) * f.uy;
    const t2 = (s.x2 - f.cx) * f.ux + (s.y2 - f.cy) * f.uy;
    const sLo = Math.min(t1, t2);
    const sHi = Math.max(t1, t2);
    const gap = Math.max(0, Math.max(sLo - f.hi, f.lo - sHi));
    return gap <= gapPx;
  };

  const addTo = (c: Cluster, i: number) => {
    const s = segs[i];
    const L = Math.max(len[i], 1e-6);
    c.sumL += L;
    c.sumX += L * ((s.x1 + s.x2) / 2);
    c.sumY += L * ((s.y1 + s.y2) / 2);
    c.sumC += L * Math.cos(2 * ang[i]);
    c.sumS += L * Math.sin(2 * ang[i]);
    c.members.push(i);
    c.fit = null; // the fit moved
  };

  for (const i of order) {
    let placed = false;
    for (const c of clusters) {
      if (fits(c, i)) {
        addTo(c, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const c: Cluster = {
        sumL: 0,
        sumX: 0,
        sumY: 0,
        sumC: 0,
        sumS: 0,
        members: [],
        fit: null,
      };
      addTo(c, i);
      clusters.push(c);
    }
  }

  // cluster-vs-cluster merge until stable, so the result does not depend on
  // the order the segments happened to arrive in
  const canMerge = (a: Cluster, b: Cluster): boolean => {
    const A = spanOf(a);
    const B = spanOf(b);
    if (angleDiff(A.ang, B.ang) > angTol) return false;
    let bLo = Infinity;
    let bHi = -Infinity;
    for (const m of b.members) {
      const s = segs[m];
      for (let e = 0; e < 2; e++) {
        const px = e === 0 ? s.x1 : s.x2;
        const py = e === 0 ? s.y1 : s.y2;
        // every one of b's endpoints must sit within the offset tolerance of a's line
        if (Math.abs(-(px - A.cx) * A.uy + (py - A.cy) * A.ux) > offsetTolPx)
          return false;
        const t = (px - A.cx) * A.ux + (py - A.cy) * A.uy;
        if (t < bLo) bLo = t;
        if (t > bHi) bHi = t;
      }
    }
    return Math.max(0, Math.max(bLo - A.hi, A.lo - bHi)) <= gapPx;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; ) {
        if (canMerge(clusters[i], clusters[j])) {
          for (const m of clusters[j].members) addTo(clusters[i], m);
          clusters.splice(j, 1);
          changed = true;
        } else {
          j++;
        }
      }
    }
  }

  const out: MergedLine[] = [];
  for (const c of clusters) {
    const f = spanOf(c);
    out.push({
      x1: f.cx + f.ux * f.lo,
      y1: f.cy + f.uy * f.lo,
      x2: f.cx + f.ux * f.hi,
      y2: f.cy + f.uy * f.hi,
      support: c.sumL,
    });
  }
  out.sort((a, b) => b.support - a.support);
  return out;
}

// ---------------------------------------------------------------------------
// 9. extendAlongSupport
// ---------------------------------------------------------------------------

function medianOf(buf: Float64Array, n: number, scratch: Float64Array): number {
  for (let i = 0; i < n; i++) scratch[i] = buf[i];
  const view = scratch.subarray(0, n);
  view.sort();
  return n % 2 ? view[(n - 1) >> 1] : 0.5 * (view[n / 2 - 1] + view[n / 2]);
}

/**
 * Grow a line from both ends along its own direction for as long as the
 * gradient support holds.
 *
 * Support at a position is the MAXIMUM of |gradient| in a band of +/-`band` px
 * measured PERPENDICULAR to the line, sampled bilinearly, stepping 1 px.
 *
 * The stop threshold is RELATIVE, not global. Measured justification: on a real
 * roof the main lines carry support 900-1800 while a small porch roof carries
 * 570 — one absolute cut-off deletes the porch, yet along its own band the
 * porch is a clear local maximum (neighbours 580-595, then a fall-off). So the
 * walk keeps a rolling window of the last N accepted samples and stops where
 * support falls below `frac` of that window's LOCAL MEDIAN.
 *
 * Returns the support profile along the final line so a caller can plot it.
 */
export function extendAlongSupport(
  line: Seg,
  mag: Float32Array,
  w: number,
  h: number,
  opts: ExtendOpts = {},
): ExtendResult {
  const band = opts.band ?? 4;
  const frac = opts.frac ?? 0.55;
  const N = opts.window ?? 25;
  const patience = opts.patience ?? 3;
  const maxExtend = opts.maxExtend ?? Math.max(w, h);

  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return { ...line, samples: [] };
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;

  const supportAt = (px: number, py: number): number => {
    let best = 0;
    for (let t = -band; t <= band; t++) {
      const v = sampleBilinear(mag, w, h, px + nx * t, py + ny * t);
      if (v > best) best = v;
    }
    return best;
  };

  const inside = (px: number, py: number) =>
    px >= 0 && px <= w - 1 && py >= 0 && py <= h - 1;

  const ring = new Float64Array(N);
  const scratch = new Float64Array(N);

  // walk from one end. sign = -1 grows past (x1,y1); sign = +1 grows past (x2,y2)
  const grow = (ex: number, ey: number, sign: number): number => {
    // seed the rolling window with the profile just INSIDE this end
    let cnt = 0;
    let head = 0;
    for (let s = 1; s <= N; s++) {
      const px = ex - sign * ux * s;
      const py = ey - sign * uy * s;
      if (s > L) break;
      if (!inside(px, py)) break;
      ring[head] = supportAt(px, py);
      head = (head + 1) % N;
      if (cnt < N) cnt++;
    }
    if (cnt === 0) return 0;

    let lastGood = 0;
    let fails = 0;
    for (let s = 1; s <= maxExtend; s++) {
      const px = ex + sign * ux * s;
      const py = ey + sign * uy * s;
      if (!inside(px, py)) break;
      const sup = supportAt(px, py);
      const med = medianOf(ring, cnt, scratch);
      if (sup < frac * med) {
        if (++fails >= patience) break;
      } else {
        fails = 0;
        lastGood = s;
        ring[head] = sup;
        head = (head + 1) % N;
        if (cnt < N) cnt++;
      }
    }
    return lastGood;
  };

  const growA = grow(line.x1, line.y1, -1);
  const growB = grow(line.x2, line.y2, +1);

  const x1 = line.x1 - ux * growA;
  const y1 = line.y1 - uy * growA;
  const x2 = line.x2 + ux * growB;
  const y2 = line.y2 + uy * growB;

  // support profile along the final line, 1 px steps
  const finalLen = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.round(finalLen));
  const samples: number[] = new Array(steps + 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    samples[s] = supportAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
  }

  return { x1, y1, x2, y2, samples };
}
