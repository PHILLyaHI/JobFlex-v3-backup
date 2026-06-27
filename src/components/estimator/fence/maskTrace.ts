"use client";
// Turn a SAM mask PNG into a closed boundary polyline in the studio's local-feet
// frame. v1 uses a radial sweep from the mask centroid (robust for a roughly
// star-convex yard/lot); the user refines the dots on the map afterwards. A full
// concave-contour trace is a later refinement.
import { pixelToLocalFeet, type StaticTileGeo } from "@/lib/geo/mercator";
import type { PathPoint } from "./fenceTypes";

const RAYS = 20;
const GRID_MAX = 240; // downsample the mask to this max dimension for speed

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the mask image (CORS?)."));
    img.src = url;
  });
}

interface Grid {
  w: number;
  h: number;
  inside: (x: number, y: number) => boolean;
}

async function loadBinaryGrid(url: string): Promise<Grid> {
  const img = await loadImage(url);
  const iw = img.width || 1;
  const ih = img.height || 1;
  const scale = Math.min(1, GRID_MAX / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data; // throws if the canvas is CORS-tainted
  const inside = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = d[i + 3];
    const lum = d[i] + d[i + 1] + d[i + 2];
    return a > 128 && lum > 24; // opaque + not background-black (handles both mask styles)
  };
  return { w, h, inside };
}

export async function maskToPathPoints(maskUrl: string, geo: StaticTileGeo): Promise<PathPoint[]> {
  const grid = await loadBinaryGrid(maskUrl);

  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (grid.inside(x, y)) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n < 20) return [];
  const cx = sx / n;
  const cy = sy / n;
  const maxR = Math.hypot(grid.w, grid.h);
  const sScaleX = geo.imgW / grid.w;
  const sScaleY = geo.imgH / grid.h;

  const pts: PathPoint[] = [];
  for (let k = 0; k < RAYS; k++) {
    const a = (2 * Math.PI * k) / RAYS;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let last: [number, number] | null = null;
    for (let r = 1; r < maxR; r++) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) break;
      if (grid.inside(x, y)) last = [x, y];
      else if (last) break; // exited the mask — keep the last inside pixel as the edge
    }
    if (last) pts.push(pixelToLocalFeet(geo, last[0] * sScaleX, last[1] * sScaleY));
  }
  if (pts.length < 3) return [];
  pts.push({ ...pts[0] }); // close the loop
  return pts;
}
