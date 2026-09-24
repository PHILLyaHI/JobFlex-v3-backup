// THE CLIENT'S ROOF, AS A PICTURE (2026-09-23) — pure: no database, no fetch.
//
// Owner: "the client should receive a piece of the picture of the roof." A
// proposal converted from a roof measurement links to it (ProposalSitePhoto);
// what the client's page can show, in this order:
//   ortho      EagleView's own clear aerial of the house, when the paid answer
//              carried imagery and the credentials are on the server;
//   satellite  Google's static satellite tile at the pin, when that key is on
//              the server;
//   plan       the measured outline drawn as a plan, from the measurement's
//              own rings — no key, no fetch, always there when the outline is.
// Over the ortho or the satellite the measured outline is drawn as an SVG
// overlay; both are projected here, one function for the page and the route.

export type LatLng = { lat: number; lng: number };

export type RoofFrame =
  | { kind: "ortho"; token: string; bbox: [number, number, number, number] }
  | { kind: "satellite"; lat: number; lng: number; zoom: number; px: number };

/** The Instant record's parts this module reads. */
export interface InstantLike {
  lat?: number | null;
  lng?: number | null;
  structures?: Array<{ outline?: LatLng[] | null }>;
  imagery?: Array<{ token: string; view: string; masked?: boolean; bbox: [number, number, number, number] | null }>;
}

export interface RoofFacts {
  areaSqft: number | null;
  squares: number | null;
  pitch: string | null;
  facetCount: number | null;
  measuredOn: string | null;
}

/** The measured outlines, closed rings of lat/lng, largest first. */
export function roofRings(instant: InstantLike | null): LatLng[][] {
  const rings = (instant?.structures ?? []).map((s) => (s.outline ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).filter((r) => r.length >= 3);
  const area = (r: LatLng[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p.lng * q.lat - q.lng * p.lat; }, 0));
  return rings.sort((a, b) => area(b) - area(a));
}

/** Which picture the client gets, given what the server can reach. */
export function roofFrameFor(instant: InstantLike | null, pin: LatLng | null, able: { ortho: boolean; satellite: boolean }, zoom = 20, px = 640): RoofFrame | null {
  if (able.ortho) {
    const wide = (instant?.imagery ?? [])
      .filter((im) => im.view === "ortho" && im.bbox && im.masked === false && im.token)
      .sort((a, b) => (b.bbox![2] - b.bbox![0]) * (b.bbox![3] - b.bbox![1]) - (a.bbox![2] - a.bbox![0]) * (a.bbox![3] - a.bbox![1]))[0];
    if (wide) return { kind: "ortho", token: wide.token, bbox: wide.bbox! };
  }
  if (able.satellite) {
    let lat = pin?.lat ?? instant?.lat ?? null;
    let lng = pin?.lng ?? instant?.lng ?? null;
    if ((lat == null || lng == null) && instant) {
      const all = roofRings(instant).flat();
      if (all.length) { lat = all.reduce((s, p) => s + p.lat, 0) / all.length; lng = all.reduce((s, p) => s + p.lng, 0) / all.length; }
    }
    if (lat != null && lng != null) return { kind: "satellite", lat, lng, zoom, px };
  }
  return null;
}

const TILE = 256;
const D2R = Math.PI / 180;
/** Web Mercator pixel coordinates at a zoom (the tile scheme Google's static map draws in). */
function mercatorPx(p: LatLng, zoom: number): { x: number; y: number } {
  const n = TILE * Math.pow(2, zoom);
  const x = ((p.lng + 180) / 360) * n;
  const s = Math.sin(Math.max(-89.9, Math.min(89.9, p.lat)) * D2R);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

/** A point in the picture's own square, 0…1000 across and down. */
export function frameProject(p: LatLng, frame: RoofFrame): { x: number; y: number } {
  if (frame.kind === "ortho") {
    const [minLon, minLat, maxLon, maxLat] = frame.bbox;
    return { x: ((p.lng - minLon) / (maxLon - minLon || 1e-9)) * 1000, y: ((maxLat - p.lat) / (maxLat - minLat || 1e-9)) * 1000 };
  }
  const c = mercatorPx({ lat: frame.lat, lng: frame.lng }, frame.zoom);
  const q = mercatorPx(p, frame.zoom);
  return { x: (0.5 + (q.x - c.x) / frame.px) * 1000, y: (0.5 + (q.y - c.y) / frame.px) * 1000 };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The outline rings as SVG `points` strings in the 0…1000 square, for an overlay on the picture. */
export function roofOverlayPoints(rings: LatLng[][], frame: RoofFrame): string[] {
  return rings.map((ring) => ring.map((p) => { const q = frameProject(p, frame); return `${r1(q.x)},${r1(q.y)}`; }).join(" "));
}

export function roofFactsLine(f: RoofFacts): string {
  const parts: string[] = [];
  if (f.areaSqft) parts.push(`${Math.round(f.areaSqft).toLocaleString("en-US")} sq ft`);
  if (f.squares) parts.push(`${Math.round(f.squares * 10) / 10} squares`);
  if (f.pitch) parts.push(`${f.pitch} pitch`);
  if (f.facetCount) parts.push(`${f.facetCount} facet${f.facetCount === 1 ? "" : "s"}`);
  if (f.measuredOn) parts.push(`measured ${f.measuredOn}`);
  return parts.join(" · ");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const font = "Inter, Helvetica, Arial, sans-serif";
const mono = "ui-monospace, 'JetBrains Mono', Menlo, monospace";

/**
 * The picture's stand-in when the aerial cannot be fetched at request time:
 * the outline drawn where the aerial would have shown it (the same frame
 * projection), so the page's overlay lands exactly on it.
 */
export function roofFrameSvg(rings: LatLng[][], frame: RoofFrame, factsLine: string): string {
  const polys = roofOverlayPoints(rings, frame);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="Your roof outline">` +
    `<rect width="1000" height="1000" fill="#eceae3"/>` +
    `<g stroke="#d8d5cb" stroke-width="1">${Array.from({ length: 19 }, (_, i) => `<line x1="${(i + 1) * 50}" y1="0" x2="${(i + 1) * 50}" y2="1000"/><line x1="0" y1="${(i + 1) * 50}" x2="1000" y2="${(i + 1) * 50}"/>`).join("")}</g>` +
    polys.map((p) => `<polygon points="${p}" fill="#e4e1d8" stroke="#0a0a0a" stroke-width="5" stroke-linejoin="round"/>`).join("") +
    `<text x="24" y="972" font-family="${mono}" font-size="20" fill="#6b6b6b" letter-spacing="2">${esc(factsLine.toUpperCase())}</text>` +
    `</svg>`;
}

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
function toLocalFeet(origin: LatLng, p: LatLng): { x: number; y: number } {
  const east = (p.lng - origin.lng) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M;
  const north = (p.lat - origin.lat) * D2R * EARTH_R_M;
  return { x: east * FT_PER_M, y: north * FT_PER_M };
}

/** The measured outline as a plan — edge lengths, north, a scale — when there is no aerial to show. */
export function roofPlanSvg(rings: LatLng[][], factsLine: string): string {
  const W = 1000, H = 750, PAD = 56, FOOT = 74;
  const all = rings.flat();
  if (!all.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f7f6f2"/></svg>`;
  const origin = { lat: all.reduce((s, p) => s + p.lat, 0) / all.length, lng: all.reduce((s, p) => s + p.lng, 0) / all.length };
  const local = rings.map((r) => r.map((p) => toLocalFeet(origin, p)));
  const pts = local.flat();
  let minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  let minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const grow = Math.max(maxX - minX, maxY - minY, 20) * 0.14 + 4;
  minX -= grow; maxX += grow; minY -= grow; maxY += grow;
  const drawW = W - PAD * 2, drawH = H - PAD * 2 - FOOT;
  const scale = Math.min(drawW / (maxX - minX), drawH / (maxY - minY));
  const ox = PAD + (drawW - (maxX - minX) * scale) / 2, oy = PAD + (drawH - (maxY - minY) * scale) / 2;
  const X = (x: number) => ox + (x - minX) * scale, Y = (y: number) => oy + (maxY - y) * scale;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Your roof, as measured">`);
  out.push(`<rect width="${W}" height="${H}" fill="#f7f6f2"/><rect x="${PAD}" y="${PAD}" width="${drawW}" height="${drawH}" fill="#fbfaf7" stroke="#0a0a0a" stroke-width="2"/>`);
  for (const ring of local) {
    out.push(`<polygon points="${ring.map((p) => `${r1(X(p.x))},${r1(Y(p.y))}`).join(" ")}" fill="#e4e1d8" stroke="#0a0a0a" stroke-width="4" stroke-linejoin="round"/>`);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ft = Math.hypot(b.x - a.x, b.y - a.y);
      if (ft < 4) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y) / ft, ny = (b.x - a.x) / ft;
      // the label sits outside the ring: away from its centre
      const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length, cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
      const sgn = (mx - cx) * nx + (my - cy) * ny >= 0 ? 1 : -1;
      out.push(`<text x="${r1(X(mx) + nx * sgn * 18)}" y="${r1(Y(my) - ny * sgn * 18 + 5)}" text-anchor="middle" font-family="${mono}" font-size="15" font-weight="700" fill="#0a0a0a" paint-order="stroke" stroke="#fbfaf7" stroke-width="5">${Math.round(ft)}'</text>`);
    }
  }
  out.push(`<g transform="translate(${W - PAD - 26} ${PAD + 34})"><polygon points="0,-22 8,10 0,4 -8,10" fill="#0a0a0a"/><text y="30" text-anchor="middle" font-family="${font}" font-size="13" font-weight="800" fill="#0a0a0a">N</text></g>`);
  const barFt = [5, 10, 20, 25, 50, 100].find((c) => c >= (maxX - minX) / 5) ?? 200;
  const bx = PAD + 18, by = H - FOOT - PAD + 30, bw = barFt * scale;
  out.push(`<line x1="${bx}" y1="${by}" x2="${r1(bx + bw)}" y2="${by}" stroke="#0a0a0a" stroke-width="3"/><line x1="${bx}" y1="${by - 6}" x2="${bx}" y2="${by + 6}" stroke="#0a0a0a" stroke-width="3"/><line x1="${r1(bx + bw)}" y1="${by - 6}" x2="${r1(bx + bw)}" y2="${by + 6}" stroke="#0a0a0a" stroke-width="3"/><text x="${r1(bx + bw / 2)}" y="${by - 10}" text-anchor="middle" font-family="${mono}" font-size="13" font-weight="700" fill="#0a0a0a">${barFt} ft</text>`);
  out.push(`<text x="${PAD}" y="${H - 40}" font-family="${font}" font-size="20" font-weight="800" fill="#0a0a0a">Your roof, as measured</text>`);
  out.push(`<text x="${PAD}" y="${H - 18}" font-family="${mono}" font-size="12" fill="#6b6b6b" letter-spacing="1.5">${esc((factsLine || "OUTLINE FROM THE AERIAL MEASUREMENT").toUpperCase())}</text>`);
  out.push(`</svg>`);
  return out.join("");
}
