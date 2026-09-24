// UTM ⇄ WGS84 (2026-09-24) — pure.
//
// Google's Solar rasters come projected in UTM (EPSG:326xx / 327xx, metres).
// The fence map works in lat/lng and a local-feet frame about the address pin,
// so a raster outline has to be brought back to lat/lng properly: grid north
// in a UTM zone sits up to ~3° off true north, and an equirectangular guess
// about the tile centre puts a corner 50 m out by up to 2.6 m. These are the
// standard series (Snyder, USGS PP 1395), good to a millimetre inside a zone.

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const D2R = Math.PI / 180;

export type UtmZone = { zone: number; north: boolean };

/** The zone a point falls in (no Norway/Svalbard exceptions — this app is American). */
export function utmZoneFor(lat: number, lng: number): UtmZone {
  const zone = Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1));
  return { zone, north: lat >= 0 };
}

export function utmEpsg(z: UtmZone): number {
  return (z.north ? 32600 : 32700) + z.zone;
}

/** 32601–32660 north, 32701–32760 south; anything else is not UTM/WGS84. */
export function parseUtmEpsg(epsg: number | null | undefined): UtmZone | null {
  if (epsg == null || !Number.isFinite(epsg)) return null;
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, north: true };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, north: false };
  return null;
}

const centralMeridian = (zone: number) => ((zone - 1) * 6 - 180 + 3) * D2R;

export function latLngToUtm(lat: number, lng: number, z: UtmZone): { e: number; n: number } {
  const phi = lat * D2R;
  const lam = lng * D2R;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const Aa = (lam - centralMeridian(z.zone)) * cos;
  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * phi));
  const e = K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120) + 500000;
  let n = K0 * (M + N * tan * ((Aa * Aa) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
  if (!z.north) n += 10000000;
  return { e, n };
}

export function utmToLatLng(e: number, n: number, z: UtmZone): { lat: number; lng: number } {
  const x = e - 500000;
  const y = z.north ? n : n - 10000000;
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const N1 = A / Math.sqrt(1 - E2 * sin1 * sin1);
  const T1 = tan1 * tan1;
  const C1 = EP2 * cos1 * cos1;
  const R1 = (A * (1 - E2)) / Math.pow(1 - E2 * sin1 * sin1, 1.5);
  const D = x / (N1 * K0);
  const phi =
    phi1 -
    ((N1 * tan1) / R1) *
      ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lam =
    centralMeridian(z.zone) +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / cos1;
  return { lat: phi / D2R, lng: lam / D2R };
}
