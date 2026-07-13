// Great-circle distance for Lead Center matching. The estimator's
// equirectangular projection (mapProjection.ts) is property-scale only; this
// is the regional-scale helper.

const EARTH_R_MI = 3958.8;

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}
