"use server";
// AI fence-trace pipeline (deferred Phase 3 of the studio plan): address point →
// Google satellite tile → SAM 2 segmentation → mask URL. The client vectorises
// the mask into an editable polyline (see fence/maskTrace.ts). Stateless / no
// Prisma writes — only requireOrg() for auth so the paid SAM call is gated.
import { requireManager } from "@/lib/orgContext";
import { staticMapUrl, isMapsEnabled } from "@/lib/maps";
import { segmentImage, isSamEnabled } from "@/lib/sdk/sam";

const SIZE = 640; // Google static max per side
const SCALE = 2; // → 1280×1280 full-resolution image

export interface TraceResult {
  maskUrl: string;
  centerLat: number;
  zoom: number;
  scale: number;
  imgW: number;
  imgH: number;
}

export async function traceFenceBoundary(input: {
  lat: number;
  lng: number;
  zoom?: number;
  point?: { xFrac: number; yFrac: number }; // 0..1 click within the tile; defaults to centre
}): Promise<{ ok: true; data: TraceResult } | { ok: false; error: string }> {
  await requireManager();
  if (!isMapsEnabled()) return { ok: false, error: "Set GOOGLE_MAPS_API_KEY to fetch aerial imagery." };
  if (!isSamEnabled()) return { ok: false, error: "Set FAL_KEY to enable SAM 2 segmentation." };

  const zoom = input.zoom ?? 20;
  const aerialUrl = staticMapUrl(input.lat, input.lng, { zoom, size: `${SIZE}x${SIZE}`, mapType: "satellite" });
  if (!aerialUrl) return { ok: false, error: "Could not build the aerial image URL." };

  const imgW = SIZE * SCALE;
  const imgH = SIZE * SCALE;
  const px = Math.round((input.point?.xFrac ?? 0.5) * imgW);
  const py = Math.round((input.point?.yFrac ?? 0.5) * imgH);

  try {
    // Fetch the tile server-side and hand SAM a data URI so the Maps key is never
    // exposed to a third party.
    const res = await fetch(aerialUrl);
    if (!res.ok) return { ok: false, error: `Aerial fetch failed (${res.status}).` };
    const dataUri = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    const maskUrl = await segmentImage(dataUri, [{ x: px, y: py, label: 1 }]);
    if (!maskUrl) return { ok: false, error: "SAM returned no mask." };
    return { ok: true, data: { maskUrl, centerLat: input.lat, zoom, scale: SCALE, imgW, imgH } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Segmentation failed." };
  }
}
