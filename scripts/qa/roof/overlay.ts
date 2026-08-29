/* Shared overlay renderer for the roof harnesses.
 *
 * One georeferenced ortho, frame-feet in, pixels out. Extracted from the
 * ablation harness so the filmstrip and future stands draw with the same code
 * rather than a fourth Bresenham (§K7).
 */
import { writeFileSync } from "node:fs";
import { decode, encode } from "fast-png";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;

export type RGB = [number, number, number];

export const LINE_COLORS: Record<string, RGB> = {
  RIDGE: [255, 60, 60],
  HIP: [255, 165, 0],
  VALLEY: [60, 120, 255],
  EAVE: [30, 30, 30],
  RAKE: [40, 200, 90],
  FLASHING: [255, 0, 255],
  STEPFLASH: [255, 0, 255],
  OTHER: [255, 255, 255],
};

/** 3x5 bitmap glyphs for pitch labels — fast-png has no text. */
const GLYPHS: Record<string, number[]> = {
  "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [7, 1, 7, 4, 7], "3": [7, 1, 7, 1, 7],
  "4": [5, 5, 7, 1, 1], "5": [7, 4, 7, 1, 7], "6": [7, 4, 7, 5, 7], "7": [7, 1, 2, 2, 2],
  "8": [7, 5, 7, 5, 7], "9": [7, 5, 7, 1, 7], ".": [0, 0, 0, 0, 2], "/": [1, 1, 2, 4, 4],
  " ": [0, 0, 0, 0, 0], "-": [0, 0, 7, 0, 0],
};

export class Overlay {
  readonly w: number;
  readonly h: number;
  private readonly base: Uint8Array;
  private readonly ch: number;
  private img: Uint8Array;

  constructor(
    orthoPng: Uint8Array,
    readonly bbox: [number, number, number, number],
    readonly origin: { lat: number; lng: number },
  ) {
    const d = decode(orthoPng);
    this.w = d.width;
    this.h = d.height;
    this.ch = (d as unknown as { channels?: number }).channels ?? 3;
    this.base = d.data as Uint8Array;
    this.img = new Uint8Array(this.w * this.h * 3);
    this.reset();
  }

  reset(dim = 1): void {
    for (let i = 0; i < this.w * this.h; i++) {
      for (let c = 0; c < 3; c++) this.img[i * 3 + c] = Math.round(this.base[i * this.ch + c] * dim);
    }
  }

  /** Frame feet (x east, y north from the pin) → pixel. */
  toPx(p: { x: number; y: number }): { x: number; y: number } {
    const lng = this.origin.lng + p.x / (D2R * Math.cos(this.origin.lat * D2R) * EARTH_R_M * FT_PER_M);
    const lat = this.origin.lat + p.y / (D2R * EARTH_R_M * FT_PER_M);
    return {
      x: ((lng - this.bbox[0]) / (this.bbox[2] - this.bbox[0])) * this.w,
      y: ((this.bbox[3] - lat) / (this.bbox[3] - this.bbox[1])) * this.h,
    };
  }

  px(x: number, y: number, rgb: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 3;
    this.img[i] = rgb[0];
    this.img[i + 1] = rgb[1];
    this.img[i + 2] = rgb[2];
  }

  seg(a: { x: number; y: number }, b: { x: number; y: number }, rgb: RGB, thick = 1): void {
    const A = this.toPx(a);
    const B = this.toPx(b);
    const steps = Math.max(2, Math.ceil(Math.hypot(B.x - A.x, B.y - A.y)));
    for (let s = 0; s <= steps; s++) {
      const x = A.x + ((B.x - A.x) * s) / steps;
      const y = A.y + ((B.y - A.y) * s) / steps;
      for (let dx = -thick; dx <= thick; dx++) for (let dy = -thick; dy <= thick; dy++) this.px(x + dx, y + dy, rgb);
    }
  }

  ring(r: ReadonlyArray<{ x: number; y: number }>, rgb: RGB, thick = 1): void {
    for (let i = 0; i < r.length; i++) this.seg(r[i], r[(i + 1) % r.length], rgb, thick);
  }

  dot(p: { x: number; y: number }, rgb: RGB, radius = 3): void {
    const P = this.toPx(p);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) if (dx * dx + dy * dy <= radius * radius) this.px(P.x + dx, P.y + dy, rgb);
    }
  }

  model(m: { points: Array<{ id: string; x: number; y: number }>; lines: Array<{ aId: string; bId: string; type: string }> }, mono?: RGB): void {
    const pts = new Map(m.points.map((p) => [p.id, p]));
    for (const l of m.lines) {
      const a = pts.get(l.aId);
      const b = pts.get(l.bId);
      if (!a || !b) continue;
      this.seg(a, b, mono ?? LINE_COLORS[l.type] ?? LINE_COLORS.OTHER);
    }
  }

  /** Tiny bitmap label at a frame-feet position (digits, '.', '/', '-'). */
  label(at: { x: number; y: number }, text: string, rgb: RGB, scale = 3): void {
    const P = this.toPx(at);
    let cx = P.x - (text.length * 4 * scale) / 2;
    for (const chr of text) {
      const g = GLYPHS[chr] ?? GLYPHS[" "];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (!(g[row] & (4 >> col))) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) this.px(cx + col * scale + sx, P.y + (row - 2) * scale + sy, rgb);
          }
        }
      }
      cx += 4 * scale;
    }
  }

  save(path: string): void {
    writeFileSync(path, Buffer.from(encode({ width: this.w, height: this.h, data: this.img.slice(), channels: 3, depth: 8 })));
  }
}
