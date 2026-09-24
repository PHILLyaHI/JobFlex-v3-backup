// THE FENCE ON THE LOT, AS A DRAWING (2026-09-23) — pure: no DOM, no database.
//
// Owner: "the client doesn't receive the 3D for the fence or any kind of a
// fence layout." The 3D snapshot is a picture of a moment on the estimator's
// screen and is not always there (Blob off, the 3D view never opened). This
// is the layout itself, kept with the proposal (an ActivityEvent of kind
// FENCE_PLAN, meta = the plan) and drawn on request for the client's page:
// the traced runs with their lengths, the gates, the house, the lot line,
// north and a scale. Local feet, +x east, +y north, the address pin at the
// origin — the same frame the estimator traces in.

export interface PlanPoint {
  x: number;
  y: number;
  /** No fence between the previous point and this one (a second run starts here). */
  gap?: boolean;
}
export interface FencePlanGate {
  /** On the segment points[i] → points[i+1], at t along it; or free at x/y. */
  segmentIndex: number;
  t: number;
  widthFt: number;
  kind: "gate" | "door";
  label?: string;
  x?: number;
  y?: number;
}
export interface FencePlan {
  points: PlanPoint[];
  gates: FencePlanGate[];
  buildings: Array<{ ring: PlanPoint[]; role: "subject" | "neighbor" }>;
  lots: PlanPoint[][];
  origin: { lat: number; lng: number } | null;
  heightFt: number;
  typeLabel: string;
  totalLf: number;
  address: string | null;
}

export const FENCE_PLAN_EVENT = "FENCE_PLAN";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A stored plan, read back defensively: a bad shape is no plan, never a crash. */
export function parseFencePlan(raw: unknown): FencePlan | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || !Array.isArray(r.points)) return null;
  const pts = (arr: unknown, max: number): PlanPoint[] =>
    (Array.isArray(arr) ? arr : [])
      .slice(0, max)
      .flatMap((p) => {
        const q = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        return num(q.x) && num(q.y) ? [q.gap === true ? { x: q.x, y: q.y, gap: true } : { x: q.x, y: q.y }] : [];
      });
  const points = pts(r.points, 600);
  if (points.length < 2) return null;
  const gates: FencePlanGate[] = (Array.isArray(r.gates) ? r.gates : []).slice(0, 40).flatMap((g) => {
    const q = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
    if (!num(q.segmentIndex) || !num(q.t) || !num(q.widthFt)) return [];
    return [{ segmentIndex: Math.max(0, Math.round(q.segmentIndex)), t: Math.min(1, Math.max(0, q.t)), widthFt: Math.max(0, q.widthFt), kind: q.kind === "door" ? "door" : "gate", label: typeof q.label === "string" ? q.label.slice(0, 60) : undefined, x: num(q.x) ? q.x : undefined, y: num(q.y) ? q.y : undefined }];
  });
  const buildings = (Array.isArray(r.buildings) ? r.buildings : []).slice(0, 40).flatMap((b) => {
    const q = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const ring = pts(q.ring, 300);
    return ring.length >= 3 ? [{ ring, role: q.role === "subject" ? ("subject" as const) : ("neighbor" as const) }] : [];
  });
  const lots = (Array.isArray(r.lots) ? r.lots : []).slice(0, 10).map((l) => pts(l, 400)).filter((l) => l.length >= 3);
  const o = (r.origin && typeof r.origin === "object" ? r.origin : null) as Record<string, unknown> | null;
  return {
    points,
    gates,
    buildings,
    lots,
    origin: o && num(o.lat) && num(o.lng) ? { lat: o.lat, lng: o.lng } : null,
    heightFt: num(r.heightFt) ? r.heightFt : 6,
    typeLabel: typeof r.typeLabel === "string" ? r.typeLabel.slice(0, 120) : "Fence",
    totalLf: num(r.totalLf) ? r.totalLf : 0,
    address: typeof r.address === "string" && r.address.trim() ? r.address.slice(0, 300) : null,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const feet = (n: number) => `${Math.round(n)}'`;

/** The nice scale-bar length that is about a fifth of the drawing's width. */
function scaleBarFt(widthFt: number): number {
  const target = widthFt / 5;
  for (const c of [5, 10, 20, 25, 50, 100, 200, 500]) if (c >= target) return c;
  return 1000;
}

export function fencePlanSvg(plan: FencePlan): string {
  const W = 1000;
  const H = 750;
  const PAD = 56;
  const FOOT = 74; // the title strip
  // The frame: the fence, its gates, and the house it belongs to.
  const framePts: PlanPoint[] = [...plan.points, ...plan.gates.filter((g) => g.x !== undefined && g.y !== undefined).map((g) => ({ x: g.x!, y: g.y! }))];
  for (const b of plan.buildings) if (b.role === "subject") framePts.push(...b.ring);
  let minX = Math.min(...framePts.map((p) => p.x));
  let maxX = Math.max(...framePts.map((p) => p.x));
  let minY = Math.min(...framePts.map((p) => p.y));
  let maxY = Math.max(...framePts.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 20);
  const spanY = Math.max(maxY - minY, 20);
  const grow = Math.max(spanX, spanY) * 0.12 + 6;
  minX -= grow; maxX += grow; minY -= grow; maxY += grow;
  const drawW = W - PAD * 2;
  const drawH = H - PAD * 2 - FOOT;
  const scale = Math.min(drawW / (maxX - minX), drawH / (maxY - minY));
  const ox = PAD + (drawW - (maxX - minX) * scale) / 2;
  const oy = PAD + (drawH - (maxY - minY) * scale) / 2;
  const X = (x: number) => ox + (x - minX) * scale;
  const Y = (y: number) => oy + (maxY - y) * scale; // north up
  const pt = (p: PlanPoint) => `${f1(X(p.x))},${f1(Y(p.y))}`;

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`${plan.typeLabel} fence layout, ${Math.round(plan.totalLf)} feet`)}">`);
  out.push(`<defs><clipPath id="frame"><rect x="${PAD}" y="${PAD}" width="${drawW}" height="${drawH}"/></clipPath></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#f7f6f2"/>`);
  out.push(`<rect x="${PAD}" y="${PAD}" width="${drawW}" height="${drawH}" fill="#fbfaf7" stroke="#0a0a0a" stroke-width="2"/>`);
  out.push(`<g clip-path="url(#frame)">`);
  // the lot
  for (const lot of plan.lots) out.push(`<polygon points="${lot.map(pt).join(" ")}" fill="none" stroke="#9a9a9a" stroke-width="2" stroke-dasharray="10 8"/>`);
  // the houses
  for (const b of plan.buildings) {
    const subject = b.role === "subject";
    out.push(`<polygon points="${b.ring.map(pt).join(" ")}" fill="${subject ? "#e4e1d8" : "#eeede8"}" stroke="${subject ? "#6b6b6b" : "#bdbcb6"}" stroke-width="${subject ? 2 : 1.5}"/>`);
    if (subject) {
      const cx = b.ring.reduce((s, p) => s + p.x, 0) / b.ring.length;
      const cy = b.ring.reduce((s, p) => s + p.y, 0) / b.ring.length;
      out.push(`<text x="${f1(X(cx))}" y="${f1(Y(cy) + 5)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#6b6b6b" letter-spacing="2">HOUSE</text>`);
    }
  }
  // the fence, run by run
  const segs: Array<{ a: PlanPoint; b: PlanPoint; i: number }> = [];
  for (let i = 1; i < plan.points.length; i++) {
    if (plan.points[i].gap) continue;
    segs.push({ a: plan.points[i - 1], b: plan.points[i], i: i - 1 });
  }
  for (const s of segs) out.push(`<line x1="${f1(X(s.a.x))}" y1="${f1(Y(s.a.y))}" x2="${f1(X(s.b.x))}" y2="${f1(Y(s.b.y))}" stroke="#0a0a0a" stroke-width="7" stroke-linecap="round"/>`);
  // gates: a break in the run with a swing arc
  let gateCount = 0;
  for (const g of plan.gates) {
    let cx: number, cy: number, ux: number, uy: number;
    const s = segs.find((q) => q.i === g.segmentIndex);
    if (s) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const len = Math.hypot(dx, dy) || 1;
      ux = dx / len; uy = dy / len;
      cx = s.a.x + dx * g.t; cy = s.a.y + dy * g.t;
    } else if (g.x !== undefined && g.y !== undefined) {
      cx = g.x; cy = g.y; ux = 1; uy = 0;
    } else continue;
    const half = Math.max(1.5, g.widthFt / 2);
    const a = { x: cx - ux * half, y: cy - uy * half };
    const b = { x: cx + ux * half, y: cy + uy * half };
    // the opening
    out.push(`<line x1="${f1(X(a.x))}" y1="${f1(Y(a.y))}" x2="${f1(X(b.x))}" y2="${f1(Y(b.y))}" stroke="#fbfaf7" stroke-width="11" stroke-linecap="butt"/>`);
    // the swing: a quarter arc from one hinge, on the north-ish side
    const nx = -uy, ny = ux; // perpendicular
    const r = half * 2 * scale;
    const hx = X(a.x), hy = Y(a.y);
    const ex = X(a.x + nx * half * 2), ey = Y(a.y + ny * half * 2);
    out.push(`<path d="M ${f1(X(b.x))} ${f1(Y(b.y))} A ${f1(r)} ${f1(r)} 0 0 ${ny * uy - nx * ux < 0 ? 0 : 1} ${f1(ex)} ${f1(ey)}" fill="none" stroke="#1854a0" stroke-width="2" stroke-dasharray="5 5"/>`);
    out.push(`<line x1="${f1(hx)}" y1="${f1(hy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="#1854a0" stroke-width="3"/>`);
    out.push(`<circle cx="${f1(hx)}" cy="${f1(hy)}" r="4" fill="#1854a0"/>`);
    const label = `${g.label ?? (g.kind === "door" ? "Door" : "Gate")} ${feet(g.widthFt)}`;
    out.push(`<text x="${f1(X(cx) + nx * 22 * Math.sign(scale))}" y="${f1(Y(cy) - ny * 22 + 5)}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#1854a0" paint-order="stroke" stroke="#fbfaf7" stroke-width="4">${esc(label)}</text>`);
    gateCount++;
  }
  // posts at the vertices
  for (let i = 0; i < plan.points.length; i++) {
    const p = plan.points[i];
    const onRun = (i > 0 && !p.gap) || (i + 1 < plan.points.length && !plan.points[i + 1].gap);
    if (onRun) out.push(`<circle cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="5" fill="#0a0a0a"/>`);
  }
  // lengths
  for (const s of segs) {
    const ft = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (ft < 4) continue;
    const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const lx = X(mx) + nx * 16, ly = Y(my) - ny * 16 + 5;
    out.push(`<text x="${f1(lx)}" y="${f1(ly)}" text-anchor="middle" font-family="ui-monospace, 'JetBrains Mono', Menlo, monospace" font-size="15" font-weight="700" fill="#0a0a0a" paint-order="stroke" stroke="#fbfaf7" stroke-width="5">${feet(ft)}</text>`);
  }
  out.push(`</g>`);
  // north
  const nxp = W - PAD - 26, nyp = PAD + 34;
  out.push(`<g transform="translate(${nxp} ${nyp})"><polygon points="0,-22 8,10 0,4 -8,10" fill="#0a0a0a"/><text y="30" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#0a0a0a">N</text></g>`);
  // scale bar
  const barFt = scaleBarFt((maxX - minX));
  const barPx = barFt * scale;
  const bx = PAD + 18, by = H - FOOT - PAD + 30;
  out.push(`<line x1="${f1(bx)}" y1="${f1(by)}" x2="${f1(bx + barPx)}" y2="${f1(by)}" stroke="#0a0a0a" stroke-width="3"/><line x1="${f1(bx)}" y1="${f1(by - 6)}" x2="${f1(bx)}" y2="${f1(by + 6)}" stroke="#0a0a0a" stroke-width="3"/><line x1="${f1(bx + barPx)}" y1="${f1(by - 6)}" x2="${f1(bx + barPx)}" y2="${f1(by + 6)}" stroke="#0a0a0a" stroke-width="3"/><text x="${f1(bx + barPx / 2)}" y="${f1(by - 10)}" text-anchor="middle" font-family="ui-monospace, 'JetBrains Mono', Menlo, monospace" font-size="13" font-weight="700" fill="#0a0a0a">${barFt} ft</text>`);
  // the title strip
  const runs = segs.length ? 1 + plan.points.filter((p, i) => i > 0 && p.gap).length : 0;
  const title = `${plan.typeLabel} · ${plan.heightFt} ft tall · ${Math.round(plan.totalLf)} ft of fence · ${runs === 1 ? "1 run" : `${runs} runs`}${gateCount ? ` · ${gateCount} ${gateCount === 1 ? "gate" : "gates"}` : ""}`;
  out.push(`<text x="${PAD}" y="${H - 40}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="20" font-weight="800" fill="#0a0a0a">${esc(title)}</text>`);
  out.push(`<text x="${PAD}" y="${H - 18}" font-family="ui-monospace, 'JetBrains Mono', Menlo, monospace" font-size="12" fill="#6b6b6b" letter-spacing="1.5">${esc((plan.address ? plan.address.toUpperCase() + " · " : "") + "LAYOUT AS TRACED · NOT A SURVEY")}</text>`);
  out.push(`</svg>`);
  return out.join("");
}
