// Parcel geometry utilities — pure functions, no network, no Prisma, so the
// scripts/qa test can import this file directly under Node's type stripping.
//
// WKT comes from ReportAll as EPSG:4326 POLYGON/MULTIPOLYGON with lon-first
// coordinates ("lon lat" pairs). Rings come OUT of here lat-first ([lat, lng])
// because that is what the map layer and the haversine below consume. Interior
// rings (holes) are dropped on purpose: a fence line follows the lot's outer
// boundary, and a hole is never fenced from the parcel side.

export type RingPoint = [number, number]; // [lat, lng]

export interface ParcelSegment {
  from: RingPoint;
  to: RingPoint;
  feet: number;
  /** Compass bearing from → to, degrees clockwise from north, [0, 360). */
  bearing: number;
}

const EARTH_RADIUS_FT = 20902231; // mean Earth radius in feet
const DEG = Math.PI / 180;

/**
 * Outer rings of a WKT POLYGON or MULTIPOLYGON, lat-first. Holes are skipped:
 * in WKT the FIRST ring of each polygon is the exterior, the rest are interior.
 * A closing point equal to the first is trimmed so segments() does not emit a
 * zero-length side. Anything unparseable yields [].
 */
export function parseWkt(wkt: string): RingPoint[][] {
  if (typeof wkt !== "string") return [];
  const body = wkt.trim();
  const isMulti = /^MULTIPOLYGON/i.test(body);
  if (!isMulti && !/^POLYGON/i.test(body)) return [];

  // Polygons are "((ring),(hole)),((ring))" for MULTIPOLYGON and
  // "(ring),(hole)" for POLYGON. Splitting on the innermost parens gives every
  // ring in document order; the exterior of each polygon is the ring that
  // follows a polygon opener, which the regex below tracks via separators.
  const rings: RingPoint[][] = [];
  const ringRe = /\(([^()]+)\)/g;
  // Track which matches are exterior rings: an exterior ring's "((" opener has
  // no comma between it and the previous ring; interiors are preceded by a
  // comma at ring depth. Simplest robust rule: a ring is EXTERIOR when the
  // character before its opening paren (skipping whitespace) is "(", i.e. it is
  // the first ring of its polygon.
  let m: RegExpExecArray | null;
  while ((m = ringRe.exec(body)) !== null) {
    let i = m.index - 1;
    while (i >= 0 && /\s/.test(body[i])) i--;
    const isExterior = body[i] === "(";
    if (!isExterior) continue; // hole — skipped
    const ring: RingPoint[] = [];
    for (const pair of m[1].split(",")) {
      const parts = pair.trim().split(/\s+/);
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) ring.push([lat, lon]);
    }
    // Trim the WKT closing point (first == last) so sides are honest.
    if (ring.length >= 2) {
      const [aLat, aLng] = ring[0];
      const [bLat, bLng] = ring[ring.length - 1];
      if (aLat === bLat && aLng === bLng) ring.pop();
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Haversine distance between two [lat, lng] points, in feet. */
export function haversineFt(a: RingPoint, b: RingPoint): number {
  const dLat = (b[0] - a[0]) * DEG;
  const dLng = (b[1] - a[1]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_FT * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial compass bearing from a to b, degrees clockwise from north, [0, 360). */
export function bearingDeg(a: RingPoint, b: RingPoint): number {
  const φ1 = a[0] * DEG;
  const φ2 = b[0] * DEG;
  const dλ = (b[1] - a[1]) * DEG;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Every side of a ring in order, closing back to the first point. */
export function segments(ring: RingPoint[]): ParcelSegment[] {
  const out: ParcelSegment[] = [];
  for (let i = 0; i < ring.length; i++) {
    const from = ring[i];
    const to = ring[(i + 1) % ring.length];
    const feet = haversineFt(from, to);
    if (feet < 0.1) continue; // duplicate vertex — not a side
    out.push({ from, to, feet, bearing: bearingDeg(from, to) });
  }
  return out;
}

/** Total perimeter of a ring, in feet. */
export function perimeterFt(ring: RingPoint[]): number {
  return segments(ring).reduce((sum, s) => sum + s.feet, 0);
}

/** "N 87° E"-style label for a bearing — what a contractor reads off a plat. */
export function bearingLabel(bearing: number): string {
  const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return compass[Math.round(bearing / 45) % 8];
}

// ── Readable sides ──────────────────────────────────────────────────────────
// A surveyed ring is not a list of walls. County geometry carries every kink a
// surveyor recorded — a straight back fence arrives as five segments 0.4° apart,
// a curved cul-de-sac front as a dozen. Listing those raw is unusable: the
// Microsoft lot showed 22 "sides", a residential lot shows 15–30.
//
// groupSides() merges consecutive segments that are the SAME WALL and marks the
// leftover stubs, so a house lot lands at the 4–8 rows a contractor expects.

/** Turn angle a→b, normalised to (−180, 180]. */
function turnDeg(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/** Two segments are the same wall below this turn. 8° covers survey noise and
 *  gentle curves without swallowing a real corner (the tightest real corner in
 *  residential platting is ~15°). */
export const COLLINEAR_DEG = 8;
/** …but only while the wall as a whole stays within this bend of where it
 *  started. Without the cap a 12-segment curve at 7° a step would merge 84° of
 *  turn into one "straight" side. */
export const MAX_MERGE_BEND_DEG = 30;
/** Below this a side is a stub — a corner clip, a survey jog, the 2 ft return
 *  beside a driveway. Real, kept in the geometry, but not worth a row. */
export const SHORT_SIDE_FT = 10;

export interface ParcelSide {
  /** Index into the ring of the vertex this side starts at. */
  start: number;
  /** How many raw ring segments were merged into it. */
  span: number;
  from: RingPoint;
  to: RingPoint;
  /** Straight-line length from→to, in feet. This is the number shown, seeded
   *  into the trace and charged for: a fence is built straight between its end
   *  posts, so the chord is what gets installed. */
  feet: number;
  /** Length measured along the surveyed boundary. Differs from `feet` only on a
   *  merged curve, and by under 1.5% at the bend cap — carried for callers that
   *  need the survey figure rather than the build figure. */
  boundaryFeet: number;
  /** Chord bearing, for the compass label. */
  bearing: number;
  /** feet < SHORT_SIDE_FT — hidden from the list and summarised. */
  short: boolean;
}

/**
 * The ring's segments merged into readable walls, in ring order.
 *
 * Grouping starts at the SHARPEST corner, not at vertex 0: a ring's first
 * vertex falls wherever the county's digitiser began, which is usually the
 * middle of a wall, and starting there would split that wall across the ends of
 * the list.
 */
export function groupSides(
  ring: RingPoint[],
  opts: { collinearDeg?: number; maxBendDeg?: number; shortFt?: number } = {},
): ParcelSide[] {
  const collinearDeg = opts.collinearDeg ?? COLLINEAR_DEG;
  const maxBendDeg = opts.maxBendDeg ?? MAX_MERGE_BEND_DEG;
  const shortFt = opts.shortFt ?? SHORT_SIDE_FT;
  const n = ring.length;
  if (n < 3) return [];

  // Raw segments, indexed 1:1 with the ring — computed here rather than through
  // segments(), which drops degenerate pairs and would shift the indices this
  // function hands back.
  const seg = ring.map((from, i) => {
    const to = ring[(i + 1) % n];
    return { feet: haversineFt(from, to), bearing: bearingDeg(from, to) };
  });

  let startAt = 0;
  let sharpest = -1;
  for (let i = 0; i < n; i++) {
    const t = Math.abs(turnDeg(seg[(i - 1 + n) % n].bearing, seg[i].bearing));
    if (t > sharpest) {
      sharpest = t;
      startAt = i;
    }
  }

  const sides: ParcelSide[] = [];
  let k = 0;
  while (k < n) {
    const first = (startAt + k) % n;
    let span = 1;
    let boundaryFeet = seg[first].feet;
    while (span < n - k) {
      const prev = (startAt + k + span - 1) % n;
      const next = (startAt + k + span) % n;
      const step = Math.abs(turnDeg(seg[prev].bearing, seg[next].bearing));
      const cum = Math.abs(turnDeg(seg[first].bearing, seg[next].bearing));
      if (step >= collinearDeg || cum >= maxBendDeg) break;
      boundaryFeet += seg[next].feet;
      span += 1;
    }
    const from = ring[first];
    const to = ring[(first + span) % n];
    const feet = haversineFt(from, to);
    sides.push({
      start: first,
      span,
      from,
      to,
      feet,
      boundaryFeet,
      bearing: bearingDeg(from, to),
      short: feet < shortFt,
    });
    k += span;
  }
  return sides;
}

/** Area (shoelace) centroid of a ring — NOT the vertex mean, which a curve full
 *  of dense vertices drags towards itself. */
export function polygonCentroid(ring: RingPoint[]): RingPoint {
  const n = ring.length;
  // Shoelace terms are differences of products, so they cancel catastrophically
  // when the coordinates are far from the origin relative to the polygon — a
  // 100 ft lot at lat 47.6 / lng −122.1 lost ~12 digits and put the centroid
  // 6 ft off. Everything therefore runs in a LOCAL frame anchored on the first
  // vertex, with longitude scaled so both axes carry the same units.
  const [lat0, lng0] = ring[0];
  const kx = Math.cos(lat0 * DEG);
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const x1 = (p[1] - lng0) * kx;
    const y1 = p[0] - lat0;
    const x2 = (q[1] - lng0) * kx;
    const y2 = q[0] - lat0;
    const f = x1 * y2 - x2 * y1;
    a2 += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a2) < 1e-18) {
    // Degenerate (zero-area) ring — fall back to the vertex mean.
    const mean = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0] as RingPoint);
    return [mean[0] / n, mean[1] / n];
  }
  const area = a2 / 2;
  return [lat0 + cy / (6 * area), lng0 + cx / (6 * area) / kx];
}

// ── The street side ─────────────────────────────────────────────────────────
// A contractor does not fence the frontage, so the street side comes off the
// estimate by default. Finding it means finding the ROAD.
//
// This used to reason from the geocoded address point: centroid → address was
// taken to point at the street. Measured against two real King County lots it
// was wrong — a geocoder returns the ROOFTOP, and a house sits back from the
// road, so on 17028 NE 100th St (which fronts NE 100th St on its south edge)
// the vector pointed north-west and the west boundary was tagged. The rule is
// gone; nothing falls back to it.
//
// The signal is now OSM street centrelines, which arrive in the same Overpass
// query the building footprints already use (actions/fenceBoundary).

/** A street centreline: OSM `name` (often absent on service roads) + its path. */
export interface RoadLine {
  name: string | null;
  points: RingPoint[];
}

export interface FrontSideMatch {
  /** Index into the `sides` array passed in. */
  index: number;
  /** Distance from the side's midpoint to the nearest street, in feet. */
  distanceFt: number;
  /** The street's OSM name, when it has one. */
  streetName: string | null;
}

/** Past this a road is not this lot's frontage — it is the road serving the
 *  block behind, or the arterial two lots over. */
export const FRONT_MAX_DISTANCE_FT = 150;
/** Sides within 25% of the closest one are ALSO frontage: a corner lot really
 *  does face two streets, and unchecking only one of them would quietly put a
 *  street-facing run back into the estimate. */
export const FRONT_TIE_RATIO = 1.25;

const FT_PER_DEG_LAT = EARTH_RADIUS_FT * DEG;

/** Local planar projection about `ref`, in feet — good to well under an inch at
 *  lot scale, and it makes the distance maths ordinary 2D geometry. */
function toFeet(p: RingPoint, ref: RingPoint, kx: number): [number, number] {
  return [(p[1] - ref[1]) * FT_PER_DEG_LAT * kx, (p[0] - ref[0]) * FT_PER_DEG_LAT];
}

/** Distance from point `p` to the segment a–b, in feet. `p` is the origin of the
 *  local frame, so the maths is "distance from (0,0) to a segment". */
function pointToSegmentFt(p: RingPoint, a: RingPoint, b: RingPoint): number {
  const kx = Math.cos(p[0] * DEG);
  const [ax, ay] = toFeet(a, p, kx);
  const [bx, by] = toFeet(b, p, kx);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(ax, ay); // degenerate segment
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * The sides that face a street, closest first.
 *
 * Empty when there are no roads, or none within FRONT_MAX_DISTANCE_FT — the
 * caller must then leave every side checked and say so. There is deliberately
 * no geometric fallback: a wrong "street" tag silently removes real footage
 * from an estimate, which is worse than asking the contractor to click.
 */
export function detectFrontSides(
  sides: ParcelSide[],
  roads: RoadLine[],
  opts: { maxDistanceFt?: number; tieRatio?: number } = {},
): FrontSideMatch[] {
  const maxFt = opts.maxDistanceFt ?? FRONT_MAX_DISTANCE_FT;
  const tieRatio = opts.tieRatio ?? FRONT_TIE_RATIO;
  if (!roads.length) return [];

  const scored: FrontSideMatch[] = [];
  sides.forEach((s, index) => {
    if (s.short) return; // a stub is never the frontage
    const mid: RingPoint = [(s.from[0] + s.to[0]) / 2, (s.from[1] + s.to[1]) / 2];
    let best = Infinity;
    let streetName: string | null = null;
    for (const road of roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const d = pointToSegmentFt(mid, road.points[i], road.points[i + 1]);
        if (d < best) {
          best = d;
          streetName = road.name;
        }
      }
    }
    if (best <= maxFt) scored.push({ index, distanceFt: best, streetName });
  });
  if (!scored.length) return [];

  const closest = Math.min(...scored.map((s) => s.distanceFt));
  return scored
    .filter((s) => s.distanceFt <= closest * tieRatio)
    .sort((a, b) => a.distanceFt - b.distanceFt);
}
