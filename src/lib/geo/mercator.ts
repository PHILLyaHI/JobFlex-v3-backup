// Web Mercator (EPSG:3857) helpers for turning a Google Static-Maps satellite
// tile into the fence studio's local-feet frame. The static image is centred on
// the property (the geocoded address), so a pixel → feet-from-centre conversion
// lands in the SAME frame the draw map uses (origin at the address), letting an
// AI-traced boundary drop straight onto the editable polyline.

export interface StaticTileGeo {
  centerLat: number;
  zoom: number;
  scale: number; // Google static "scale" (1 or 2); 2 doubles pixel density
  imgW: number; // full-resolution pixel width  (size * scale)
  imgH: number; // full-resolution pixel height
}

const FT_PER_M = 3.28084;
const D2R = Math.PI / 180;

// Ground metres per FULL-RESOLUTION pixel at a latitude/zoom/scale.
export function metersPerPixel(lat: number, zoom: number, scale = 1): number {
  return (156543.03392 * Math.cos(lat * D2R)) / Math.pow(2, zoom) / scale;
}

// Pixel in the full-resolution static image (origin top-left, y downward) →
// local feet from the image centre (+x east, +y north — matches mapProjection).
export function pixelToLocalFeet(geo: StaticTileGeo, px: number, py: number): { x: number; y: number } {
  const mpp = metersPerPixel(geo.centerLat, geo.zoom, geo.scale);
  const eastM = (px - geo.imgW / 2) * mpp;
  const northM = -(py - geo.imgH / 2) * mpp; // image y grows downward
  return { x: eastM * FT_PER_M, y: northM * FT_PER_M };
}
