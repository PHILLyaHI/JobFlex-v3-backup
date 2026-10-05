"use client";
/**
 * The live map (2026-09-29, brought over from AVACO's admin statistics and
 * re-skinned): the world in Natural Earth projection with its rounded
 * outline, ocean and a 30° grid; countries (1:110m, a finer 1:50m layer once
 * zoomed) and, zoomed in over North America, the US states, each shaded by
 * how many visitors it has. A pin per visitor at the town PostHog's GeoIP
 * puts them in, coloured by how far they got — red looking around, amber on
 * the sign-up form or at checkout, green signed up, grey a member in the app
 * — with a violet ring when the visit came off an ad, pulsing while active,
 * named once zoomed. Scroll, pinch or the buttons zoom; drag moves; hovering
 * names what is under the pointer; a click on a pin, on a country chip or on
 * a row of the list opens who is there and what they did. The map files are
 * drawn once from Natural Earth and us-atlas (public/maps) and load only on
 * this admin page.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { PARTY_LABEL, partyOf } from "@/lib/usPolitics";
import { LIVE_ACTIVE_MINUTES, type LiveStage, type LiveTotals, type LiveVisitor } from "@/lib/traffic-live";
import { Ago } from "./ticker";
import { JourneyLine } from "./journey-line";
import s from "./traffic.module.css";

/* DRAWN ONCE, THEN ONLY THE DATA (2026-10-01). The world's shapes are their
   own memoised layer with strokes that do not scale (vector-effect), so
   neither a refresh nor a zoom step touches the 183 country paths; only a
   change in who is where re-shades them. Pins that would overlap at the
   current zoom gather into one numbered bubble (a grid in screen space); a
   click on it zooms to them. The whole component is memoised and loaded in
   its own chunk by the live panel. */
const CLUSTER_PX = 30;

interface Shape { c?: string | null; r?: string | null; n: string; d: string }
interface WorldMap { scale: number; translate: [number, number]; view: [number, number, number, number]; sphere: string; graticule: string; countries: Shape[] }
interface View { x: number; y: number; w: number; h: number }
const files = new Map<string, Promise<unknown>>();
const load = <T,>(name: string) => { if (!files.has(name)) files.set(name, fetch(`/maps/${name}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(name))))); return files.get(name) as Promise<T>; };

const region = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (cc: string, fallback = "") => { try { return cc ? region?.of(cc) ?? cc : fallback || "Unknown country"; } catch { return cc || fallback || "Unknown country"; } };
const flag = (cc: string) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌐");
const ago = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** A map pin, tip at 0,0, head centred 15 above it. */
const PIN = "M0 0C-1.6-5-8-9.4-8-15A8 8 0 1 1 8-15C8-9.4 1.6-5 0 0Z";
/** The pin as the key draws it. */
const PinIcon = ({ colour }: { colour: string }) => (
  <svg viewBox="-11 -27 22 30" aria-hidden="true"><path d={PIN} fill="none" stroke="var(--ink)" strokeWidth={4.4} strokeLinejoin="round" opacity={0.9} /><path d={PIN} fill={colour} stroke="#fff" strokeWidth={1.9} /><circle cx={0} cy={-15} r={3} fill="#fff" /></svg>
);

/** What a pin says about the visitor: the stage, folded to four colours. */
/* Five kinds, five hues far apart (2026-09-30). The old four sat close
   together — red, amber, green and a grey that vanished into the land — so
   every pin read the same at a glance. These are picked against what is
   behind them: a sky-tinted ocean and an ink-washed land. */
type PinKind = "visitor" | "signing-in" | "signing-up" | "signed-up" | "member";
const PIN_KIND: Record<LiveStage, PinKind> = { browsing: "visitor", "signing-in": "signing-in", registering: "signing-up", checkout: "signing-up", "signed-up": "signed-up", member: "member" };
const PIN_META: Record<PinKind, { colour: string; label: string }> = {
  visitor: { colour: "var(--map-visitor)", label: "Looking around" },
  "signing-in": { colour: "var(--map-signin)", label: "Signing in" },
  "signing-up": { colour: "var(--map-signing)", label: "Signing up" },
  "signed-up": { colour: "var(--map-signed)", label: "Signed up" },
  member: { colour: "var(--map-member)", label: "Member in the app" },
};
const STAGE_LABEL: Record<LiveStage, string> = { browsing: "Looking around", "signing-in": "Signing in", registering: "On the sign-up form", checkout: "At checkout", "signed-up": "Signed up", member: "In the app · member" };

/** A stable empty default, so the memo is not broken by a fresh {} each render. */
const EMPTY_NAMES: Record<string, string> = {};

/** "3 min" — a relative time that the shared clock moves on its own. */
const Since = ({ iso }: { iso: string }) => <Ago iso={iso} format={(x, at) => ago(at - Date.parse(x))}/>;

/** A pulse on the red-and-blue map: an ink ring that reads on either colour. */
const RING = { fill: "none", stroke: "var(--ink)", strokeWidth: 1.6, vectorEffect: "non-scaling-stroke" } as const;

/** The world: ocean, grid, countries and the US states — red and blue by the
 *  2024 vote while that switch is on, else (zoomed over North America) shaded
 *  by visitors. Re-rendered only when the shapes, the counts or the switch change. */
const MapBase = memo(function MapBase({ map, shapes, states, party, lit, outlines, perCountry, perState }: { map: WorldMap; shapes: Shape[]; states: Shape[] | null; party: boolean; lit: Set<string>; outlines: boolean; perCountry: Map<string, number>; perState: Map<string, number> }) {
  const mostCountry = Math.max(1, ...perCountry.values()), mostState = Math.max(1, ...perState.values());
  return <>
    <path d={map.sphere} className={s.mapOcean} />
    <path d={map.graticule} fill="none" className={s.mapGrid} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
    <g>
      {shapes.map((c, i) => {
        const n = c.c ? perCountry.get(c.c) ?? 0 : 0;
        // With the states drawn, they carry the shading and the country itself stays plain.
        const plain = !n || (states && c.c === "US");
        // Beside red and blue states a blue Canada reads as a vote: grey says "visitors" alone.
        const wash = party ? `color-mix(in oklab, var(--ink) ${Math.round(14 + 22 * (n / mostCountry))}%, var(--paper-deep))` : `color-mix(in oklab, var(--blueprint) ${Math.round(28 + 52 * (n / mostCountry))}%, var(--paper-deep))`;
        return <path key={`${c.c ?? c.n}-${i}`} d={c.d} data-country={c.c ?? undefined} data-tip={`${c.n}${n ? ` · ${plural(n, "visitor", "visitors")}` : ""}`} className={s.mapLand} style={plain ? undefined : { fill: wash }} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
      })}
    </g>
    {states && (
      <g>
        {states.map((x) => {
          const n = perState.get(x.r ?? "") ?? 0;
          // Red and blue (2026-10-03): a state lights up in the colour of its
          // 2024 presidential vote only while a pin is in it — the rest of the
          // map keeps its colour (owner) — in tints pale enough that every pin
          // colour reads on them.
          const p = party && lit.has(x.r ?? "") ? partyOf(x.r) : null;
          // Away from the US close-up only the lit states are drawn: no borders, no change.
          if (!p && !outlines) return null;
          const tip = `${x.n}${p ? ` · ${PARTY_LABEL[p]} in 2024` : ""}${n ? ` · ${plural(n, "visitor", "visitors")}` : ""}`;
          const wash = party ? `color-mix(in oklab, var(--ink) ${Math.round(14 + 22 * (n / mostState))}%, var(--paper-deep))` : `color-mix(in oklab, var(--blueprint) ${Math.round(28 + 52 * (n / mostState))}%, var(--paper-deep))`;
          return <path key={x.r} d={x.d} data-state={x.r} data-tip={tip} data-party={p ?? undefined} className={p === "D" ? s.mapStateDem : p === "R" ? s.mapStateRep : s.mapState} style={!p && n ? { fill: wash } : undefined} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
        })}
      </g>
    )}
  </>;
});

export const LiveMap = memo(function LiveMap({ visitors, selected, onSelect, timezone, totals, adNames = EMPTY_NAMES, view: mode = "everyone" }: { visitors: LiveVisitor[]; selected: string | null; onSelect: (key: string | null) => void; timezone: string; totals?: LiveTotals | null; adNames?: Record<string, string>;
  /** "prospects" (2026-10-02): the panel has already left members and sign-ins off and kept the day's converts; the map words itself for it. */
  view?: "everyone" | "prospects" }) {
  const [map, setMap] = useState<WorldMap | null>(null);
  const [fine, setFine] = useState<Shape[] | null>(null);
  const [states, setStates] = useState<Shape[] | null>(null);
  /** The US states in red and blue (owner, 2026-10-03); on until turned off. */
  const [party, setParty] = useState(true);
  /** The guide under the map (2026-10-04): closed until asked for. */
  const [help, setHelp] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const viewRef = useRef<View | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const flight = useRef<number | null>(null);
  useEffect(() => { void load<WorldMap>("world-110m.json").then(setMap).catch(() => setFailed(true)); }, []);

  const full = useMemo<View | null>(() => (map ? { x: map.view[0], y: map.view[1], w: map.view[2], h: map.view[3] } : null), [map]);
  useEffect(() => { if (full && !viewRef.current) { viewRef.current = full; setView(full); } }, [full]);

  /* FULL SCREEN (owner, 2026-10-02): the map alone, over the whole window.
     The box goes fixed over everything and the drawing keeps its own
     proportions inside it — measured here, not in vh units (the shell root
     carries a CSS zoom, under which vh lies) — so the pointer→map maths stay
     exact. Where the browser has an element full-screen mode (not on an
     iPhone) it is asked for too, so the tab bar goes away; the button, Esc or
     leaving the browser's mode all bring the page back. */
  const [wide, setWide] = useState(false);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const openWide = () => {
    setWide(true);
    const el = boxRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => undefined);
  };
  const closeWide = useCallback(() => {
    setWide(false);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!wide) return;
    const box = boxRef.current;
    const measure = () => {
      if (!box || !full) return;
      const w = Math.min(box.clientWidth, (box.clientHeight * full.w) / full.h);
      setFit({ w, h: (w * full.h) / full.w });
    };
    measure();
    const watch = box && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (watch && box) watch.observe(box); else window.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeWide(); };
    const onMode = () => { if (!document.fullscreenElement) setWide(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onMode);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      watch?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onMode);
      document.body.style.overflow = overflow;
      setFit(null);
    };
  }, [wide, full, closeWide]);

  // Natural Earth 1, the same projection the map files were drawn with.
  const project = useCallback((lon: number, lat: number): [number, number] => {
    if (!map) return [0, 0];
    const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180, p2 = p * p, p4 = p2 * p2;
    const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
    const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
    return [map.translate[0] + x * map.scale, map.translate[1] - y * map.scale];
  }, [map]);

  const clamp = useCallback((v: View): View => {
    if (!full) return v;
    const w = Math.min(full.w, Math.max(full.w / 40, v.w)), h = (w * full.h) / full.w;
    return { w, h, x: Math.min(full.x + full.w - w, Math.max(full.x, v.x)), y: Math.min(full.y + full.h - h, Math.max(full.y, v.y)) };
  }, [full]);
  const apply = useCallback((v: View) => { const c = clamp(v); viewRef.current = c; setView(c); }, [clamp]);
  const flyTo = useCallback((target: View) => {
    const from = viewRef.current, to = clamp(target);
    if (!from) return;
    if (flight.current) cancelAnimationFrame(flight.current);
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 500), e = 1 - (1 - k) ** 3;
      apply({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (k < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  }, [apply, clamp]);
  const zoomAround = useCallback((px: number, py: number, factor: number) => {
    const v = viewRef.current;
    if (!v) return;
    apply({ w: v.w * factor, h: v.h * factor, x: px - (px - v.x) * factor, y: py - (py - v.y) * factor });
  }, [apply]);
  const toMap = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect(), v = viewRef.current!;
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
  };

  // Zoomed in: the finer countries, and over North America the states.
  const zoom = full && view ? full.w / view.w : 1;
  const usBox = useMemo(() => { if (!map) return null; const [ax, ay] = project(-126, 50), [bx, by] = project(-66, 24); return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: ay, y1: by }; }, [map, project]);
  const overUS = Boolean(view && usBox && view.x < usBox.x1 && view.x + view.w > usBox.x0 && view.y < usBox.y1 && view.y + view.h > usBox.y0);
  const detailed = zoom >= 1.8;
  useEffect(() => { if (detailed && !fine) void load<{ countries: Shape[] }>("world-50m.json").then((m) => setFine(m.countries)).catch(() => undefined); }, [detailed, fine]);
  useEffect(() => { if ((party || (detailed && overUS)) && !states) void load<{ states: Shape[] }>("us-states.json").then((m) => setStates(m.states)).catch(() => undefined); }, [party, detailed, overUS, states]);

  // Scroll and trackpad pinch zoom around the pointer (a native listener, so the page doesn't scroll instead).
  const ready = Boolean(view);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTip(null);
      const r = svg.getBoundingClientRect(), v = viewRef.current!;
      const px = v.x + ((e.clientX - r.left) / r.width) * v.w, py = v.y + ((e.clientY - r.top) / r.height) * v.h;
      zoomAround(px, py, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [ready, zoomAround]);

  // Places: visitors at the same spot share a marker.
  const places = useMemo(() => {
    const by = new Map<string, { key: string; x: number; y: number; visitors: LiveVisitor[] }>();
    for (const v of visitors) {
      if (v.lat === null || v.lon === null) continue;
      const key = `${v.lat.toFixed(2)},${v.lon.toFixed(2)}`;
      const [x, y] = project(v.lon, v.lat);
      const place = by.get(key) ?? { key, x, y, visitors: [] };
      place.visitors.push(v);
      by.set(key, place);
    }
    return [...by.values()].map((p) => ({ ...p, visitors: p.visitors.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)), active: p.visitors.some((v) => v.active) }));
  }, [visitors, project]);
  // Places that would overlap at this zoom gather into a numbered bubble: a
  // grid in screen space, the scale stepped in half-octaves so a zoom
  // animation does not regroup on every frame.
  const kStep = view && full ? 2 ** (Math.round(Math.log2(view.w / full.w) * 2) / 2) : 1;
  const { clusters, loose } = useMemo(() => {
    const cell = CLUSTER_PX * kStep;
    const grid = new Map<string, typeof places>();
    for (const p of places) { const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`; const g = grid.get(key); if (g) g.push(p); else grid.set(key, [p]); }
    const clusters: Array<{ key: string; x: number; y: number; count: number; active: boolean; box: [number, number, number, number] }> = [];
    const loose: typeof places = [];
    for (const [key, g] of grid) {
      if (g.length === 1) { loose.push(g[0]); continue; }
      const count = g.reduce((a, p) => a + p.visitors.length, 0);
      const xs = g.map((p) => p.x), ys = g.map((p) => p.y);
      clusters.push({ key, x: xs.reduce((a, b) => a + b, 0) / g.length, y: ys.reduce((a, b) => a + b, 0) / g.length, count, active: g.some((p) => p.active), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    return { clusters, loose };
  }, [places, kStep]);
  // Every visitor outside a bubble has a pin: at their town, fanned out in a small ring when several share it, drawn south to north.
  const pins = useMemo(() => loose.flatMap((p) => p.visitors.map((v, i) => {
    const n = p.visitors.length, ring = i < 8 ? 0 : 1, slot = ring ? i - 8 : i, count = ring ? n - 8 : Math.min(n, 8);
    const angle = -Math.PI / 2 + (slot / Math.max(1, count)) * Math.PI * 2, radius = n === 1 ? 0 : ring ? 20 : 11;
    return { v, place: p.key, x: p.x, y: p.y, dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius * 0.7 };
  })).sort((a, b) => a.y + a.dy - (b.y + b.dy)), [loose]);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const perCountry = useMemo(() => { const m = new Map<string, number>(); for (const v of visitors) if (v.countryCode) m.set(v.countryCode, (m.get(v.countryCode) ?? 0) + 1); return m; }, [visitors]);
  const perState = useMemo(() => { const m = new Map<string, number>(); for (const v of visitors) if (v.countryCode === "US" && v.regionCode) m.set(v.regionCode, (m.get(v.regionCode) ?? 0) + 1); return m; }, [visitors]);
  /** The states with a pin in them: the ones that light up. */
  const lit = useMemo(() => new Set(visitors.filter((v) => v.countryCode === "US" && v.regionCode && v.lat !== null && v.lon !== null).map((v) => v.regionCode)), [visitors]);
  const open = places.find((p) => p.visitors.some((v) => v.id === selected)) ?? null;

  // Dragging moves the map; two fingers pinch. A press and release on a pin without dragging opens it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; pinch?: number; visitor: string | null; cluster: string | null } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const visitor = (e.target as Element).closest?.("[data-visitor]")?.getAttribute("data-visitor") ?? null;
    const cluster = (e.target as Element).closest?.("[data-cluster]")?.getAttribute("data-cluster") ?? null;
    drag.current = { x: e.clientX, y: e.clientY, view: viewRef.current!, moved: false, pinch: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined, visitor: pts.length === 1 ? visitor : null, cluster: pts.length === 1 ? cluster : null };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // What is under the pointer, named at once.
    if (!drag.current?.moved && boxRef.current) {
      const text = (e.target as Element).closest?.("[data-tip]")?.getAttribute("data-tip") ?? null;
      const r = boxRef.current.getBoundingClientRect();
      setTip(text ? { text, x: e.clientX - r.left, y: e.clientY - r.top } : null);
    }
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && drag.current.pinch) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = toMap((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      zoomAround(mid.x, mid.y, drag.current.pinch / dist);
      drag.current.pinch = dist; drag.current.moved = true;
      return;
    }
    const r = svgRef.current!.getBoundingClientRect(), d = drag.current;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; setTip(null); svgRef.current?.setPointerCapture(e.pointerId); }
    if (!d.moved) return;
    apply({ ...d.view, x: d.view.x - (dx / r.width) * d.view.w, y: d.view.y - (dy / r.height) * d.view.h });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (pointers.current.size > 0) return;
    drag.current = null;
    if (d && !d.moved && d.visitor) onSelect(d.visitor === selectedRef.current ? null : d.visitor);
    // A bubble opens into its pins.
    if (d && !d.moved && d.cluster) { const c = clusters.find((x) => x.key === d.cluster); if (c) flyToBox(c.box[0] - 10, c.box[1] - 10, c.box[2] + 10, c.box[3] + 10); }
  };

  // Selecting someone (here or in the list) brings their place into view, left of the card.
  const openKey = open?.key ?? null;
  const openX = open?.x ?? 0;
  const openY = open?.y ?? 0;
  useEffect(() => {
    if (!openKey || !full || !viewRef.current) return;
    const v = viewRef.current, w = Math.min(v.w, full.w / 6);
    const inside = openX > v.x + v.w * 0.08 && openX < v.x + v.w * 0.55 && openY > v.y + v.h * 0.1 && openY < v.y + v.h * 0.9;
    if (!inside || v.w > full.w / 6) flyTo({ x: openX - w * 0.3, y: openY - (w * full.h) / full.w / 2, w, h: (w * full.h) / full.w });
  }, [openKey, openX, openY, full, flyTo]);

  const flyToBox = (x0: number, y0: number, x1: number, y1: number) => {
    if (!full) return;
    const pad = 0.12, w0 = (x1 - x0) * (1 + pad * 2), h0 = (y1 - y0) * (1 + pad * 2);
    const w = Math.max(full.w / 30, w0, (h0 * full.w) / full.h), h = (w * full.h) / full.w;
    flyTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h });
  };
  const fitAll = () => {
    if (!full) return;
    if (places.length === 0) { flyTo(full); return; }
    const xs = places.map((p) => p.x), ys = places.map((p) => p.y);
    flyToBox(Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) + 20, Math.max(...ys) + 20);
  };
  const flyToCountry = (cc: string) => {
    if (cc === "US" && usBox) { flyToBox(usBox.x0, usBox.y0, usBox.x1, usBox.y1); return; }
    const el = svgRef.current?.querySelector<SVGGraphicsElement>(`[data-country="${cc}"]`);
    if (el) { const b = el.getBBox(); flyToBox(b.x, b.y, b.x + b.width, b.y + b.height); }
  };
  const flyToState = (code: string) => {
    const el = /^[A-Z]{2}$/.test(code) ? svgRef.current?.querySelector<SVGGraphicsElement>(`[data-state="${code}"]`) : null;
    if (el) { const b = el.getBBox(); flyToBox(b.x, b.y, b.x + b.width, b.y + b.height); return; }
    // The state shapes are not drawn (lighting off, zoomed out): frame its pins.
    const here = places.filter((p) => p.visitors.some((v) => v.countryCode === "US" && v.regionCode === code));
    if (here.length === 0) return;
    const xs = here.map((p) => p.x), ys = here.map((p) => p.y);
    flyToBox(Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) + 20, Math.max(...ys) + 20);
  };
  const clock = (iso: string) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; } };
  const stateName = (code: string) => (code ? states?.find((x) => x.r === code)?.n ?? code : "");
  const placeName = (v: LiveVisitor) => `${v.city || countryName(v.countryCode, v.country)}${v.countryCode === "US" && v.regionCode ? `, ${stateName(v.regionCode)}` : ""}`;

  if (failed) return <div className={s.mapLoading}>The map files could not be loaded.</div>;
  if (!map || !full || !view) return <div className={s.mapLoading}>Loading the map…</div>;
  const k = view.w / full.w; // pins, borders and labels keep their size on screen at any zoom
  const shapes = detailed && fine ? fine : map.countries;
  const showStates = Boolean(states) && (party || (detailed && overUS));
  const labelled = zoom >= 2.5;
  const topCountries = [...perCountry].sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Where they are, at the grain that says something (2026-10-04): the states
  // when everyone on the map is in the US — "Washington · 7, Utah · 2" tells
  // a US business more than "United States · 9" — the countries otherwise.
  const topStates = perCountry.size === 1 && perCountry.has("US") ? [...perState].sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
  // The key names only the pins that are on the map: a colour nobody wears needs no line.
  const kinds = (Object.keys(PIN_META) as PinKind[]).map((key) => [key, visitors.filter((v) => PIN_KIND[v.stage] === key).length] as const);
  const unplaced = visitors.filter((v) => v.lat === null || v.lon === null).length;
  const count = visitors.length;
  const onNow = visitors.filter((v) => v.active).length;
  const fromAds = visitors.filter((v) => v.fromAd).length;
  const converted = visitors.filter((v) => v.stage === "signed-up").length;
  const prospects = mode === "prospects";

  return (
    <div className={s.map}>
      <div ref={boxRef} className={s.mapBox} data-wide={wide || undefined} onPointerLeave={() => setTip(null)}>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={s.mapSvg}
          style={wide && fit ? { width: fit.w, height: fit.h } : { aspectRatio: `${full.w} / ${full.h}` }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onDoubleClick={(e) => { const p = toMap(e.clientX, e.clientY); const v = viewRef.current!; flyTo({ w: v.w / 2, h: v.h / 2, x: p.x - v.w / 4, y: p.y - v.h / 4 }); }}
          role="img" aria-label={`World map: ${plural(visitors.length - unplaced, "visitor", "visitors")} in ${plural(places.length, "place", "places")}.`}
          data-pins={visitors.length - unplaced}
        >
          <MapBase map={map} shapes={shapes} states={showStates ? states : null} party={party} lit={lit} outlines={detailed && overUS} perCountry={perCountry} perState={perState} />
          {/* The pulses go under every cluster and pin, so a later one never veils
              an earlier pin; on the red-and-blue map they are ink rings, not
              crimson that melts into a red state (2026-10-03). */}
          <g pointerEvents="none" data-pulses>
            {clusters.map((c) => c.active && <circle key={`ping-${c.key}`} cx={c.x} cy={c.y} r={13 * k} className={s.livePing} {...(party ? RING : { fill: "var(--map-visitor)" })} />)}
            {pins.map(({ v, x, y, dx, dy }) => v.active && <ellipse key={`ping-${v.id}`} cx={x + dx * k} cy={y + dy * k} rx={7 * k} ry={2.6 * k} className={s.livePing} {...(party ? RING : { fill: PIN_META[PIN_KIND[v.stage]].colour })} />)}
          </g>
          {clusters.map((c) => (
            <g key={`cluster-${c.key}`} data-cluster={c.key} data-tip={`${plural(c.count, "visitor", "visitors")} here · click to zoom in`} className={s.mapPin}>
              <circle cx={c.x} cy={c.y} r={(c.count > 99 ? 14 : 11) * k} fill="var(--ink)" stroke="#fff" strokeWidth={2 * k} />
              <text x={c.x} y={c.y + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight={800} fill="#fff" pointerEvents="none">{c.count}</text>
            </g>
          ))}
          {pins.map(({ v, x, y, dx, dy }) => {
            const kind = PIN_KIND[v.stage], colour = PIN_META[kind].colour, on = v.id === selected, size = (on ? 1.3 : 1) * k;
            const px = x + dx * k, py = y + dy * k;
            const tipText = `${placeName(v)} · ${STAGE_LABEL[v.stage]}${v.signup ? ` (${v.signup.orgName})` : ""} · ${v.source}${v.active ? " · on the site now" : ""}`;
            return (
              <g key={v.id} data-visitor={v.id} data-tip={tipText} className={s.mapPin} opacity={v.active || on ? 1 : 0.86}>
                <ellipse cx={px} cy={py} rx={3.6 * k} ry={1.4 * k} fill="rgba(0,0,0,.35)" />
                <g transform={`translate(${px} ${py}) scale(${size})`}>
                  <path d={PIN} fill="none" stroke="var(--ink)" strokeWidth={on ? 5.2 : 4.4} strokeLinejoin="round" opacity={0.9} />
                  <path d={PIN} fill={colour} stroke={on ? "var(--ink)" : "#fff"} strokeWidth={on ? 2.4 : 1.9} />
                  <circle cx={0} cy={-15} r={3} fill="#fff" />
                  {v.fromAd && <circle cx={0} cy={-15} r={5.6} fill="none" stroke="var(--map-ad)" strokeWidth={1.6} />}
                </g>
              </g>
            );
          })}
          {labelled && places.map((p) => (
            <text key={`label-${p.key}`} x={p.x + 12 * k} y={p.y - 10 * k} fontSize={11 * k} className={s.mapLabel} strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">
              {p.visitors[0].city || countryName(p.visitors[0].countryCode, p.visitors[0].country)}{p.visitors.length > 1 ? ` · ${p.visitors.length}` : ""}
            </text>
          ))}
        </svg>

        {/* Zoom controls */}
        <div className={s.mapZoom}>
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomAround(view.x + view.w / 2, view.y + view.h / 2, 0.6)}>+</button>
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomAround(view.x + view.w / 2, view.y + view.h / 2, 1 / 0.6)}>−</button>
          <button type="button" title="Fit the visitors" aria-label="Fit the visitors" onClick={fitAll}>◎</button>
          <button type="button" title="Whole world" aria-label="Whole world" onClick={() => flyTo(full)}>⟲</button>
          <button type="button" title={party ? "States with visitors are lit red or blue: how they voted for president in 2024. Click to stop lighting them up" : "Light up states with visitors in red and blue (2024 vote)"} aria-label="US states in red and blue" aria-pressed={party} data-party-toggle onClick={() => setParty((x) => !x)}>◐</button>
          <button type="button" title={wide ? "Back to the page · Esc" : "Full screen"} aria-label={wide ? "Exit full screen" : "Full screen"} aria-pressed={wide} onClick={() => (wide ? closeWide() : openWide())}>{wide ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
        </div>
        {zoom > 1.05 && <span className={s.mapZoomLevel} data-card={!!open}>{Math.round(zoom * 10) / 10}×{showStates ? " · US states" : detailed ? " · detailed" : ""}</span>}

        {/* The count, on the map (2026-09-30): what is pinned here, how many
            of them are on the site this minute, and the day's running total,
            so the map answers "how many" without looking anywhere else. */}
        <div className={s.mapCount} data-card={!!open}>
          <b>{count.toLocaleString("en-US")}</b>
          <span>{prospects ? (count === 1 ? "prospect on the map" : "prospects on the map") : count === 1 ? "visitor on the map" : "visitors on the map"}</span>
          <i>{onNow.toLocaleString("en-US")} on the site now{fromAds > 0 ? ` · ${fromAds.toLocaleString("en-US")} from ads` : ""}{perCountry.size > 0 ? ` · ${plural(perCountry.size, "country", "countries")}` : ""}</i>
          {prospects && <i>{converted.toLocaleString("en-US")} signed up in the last 24 h</i>}
          {totals && <i>{totals.today.toLocaleString("en-US")} today · {totals.allTime.toLocaleString("en-US")} all time</i>}
        </div>

        {/* The name of what is under the pointer */}
        {tip && !open && <span className={s.mapTip} style={{ left: tip.x + 14, top: tip.y + 12 }}>{tip.text}</span>}

        {/* Who is at the chosen place */}
        {open && (() => {
          const list = [...open.visitors].sort((a, b) => (a.id === selected ? -1 : b.id === selected ? 1 : Date.parse(b.lastAt) - Date.parse(a.lastAt)));
          const v = list[0], rest = list.slice(1, 8);
          const kind = PIN_KIND[v.stage];
          return (
            <div className={s.mapCard} data-testid="live-map-card">
              <div className={s.mapCardHead}>
                <div>
                  <b>{flag(v.countryCode)} {placeName(v)}, {countryName(v.countryCode, v.country)}</b>
                  <span>{plural(open.visitors.length, "visitor", "visitors")} here in the window</span>
                </div>
                <button type="button" aria-label="Close" onClick={() => onSelect(null)}>×</button>
              </div>
              <div className={s.mapCardBody}>
                <div className={s.mapVisitor} data-kind={kind}>
                  <p className={s.mapVisitorTop}>
                    <em style={{ background: PIN_META[kind].colour }}>{STAGE_LABEL[v.stage]}</em>
                    <b>{v.source}</b>{v.trade ? <span>· {v.trade}</span> : null}{v.campaign ? <span>· {adNames[v.campaign] || v.campaign}</span> : null}{v.content && v.content !== v.campaign ? <span>· {adNames[v.content] || v.content}</span> : null}
                    {/* A convert says when they signed up — beside "on the site now" while they are, instead of "left" once they have gone. */}
                    <span className={s.mapWhen} data-active={v.active}>{v.active ? "on the site now" : v.stage === "signed-up" && v.signedUpAt ? null : <>left <Since iso={v.lastAt}/> ago</>}{v.stage === "signed-up" && v.signedUpAt ? <>{v.active ? " · " : ""}signed up <Since iso={v.signedUpAt}/> ago</> : null}</span>
                  </p>
                  {v.signup && <p className={s.mapSignup}>Signed up → <b>{v.signup.orgName}</b> · {v.signup.ownerEmail}{v.signup.plan ? ` · ${v.signup.plan}` : ""}</p>}
                  {!v.signup && v.member && <p className={s.mapSignup}>{v.stage === "signed-up" ? "Signed up" : "Member"} → <b>{v.member.orgName}</b>{v.member.userName ? ` · ${v.member.userName}` : ""}</p>}
                  <div className={s.mapNow}>
                    <span>{v.active ? "Now on" : "Last seen on"}</span>
                    <b>{v.pageLabel}</b>
                    <small>{plural(v.views, "page", "pages")} since {clock(v.firstAt)} · last move <Since iso={v.lastAt}/> ago</small>
                  </div>
                  {v.steps.length > 1 && <JourneyLine steps={v.steps} live={v.active} compact/>}
                  <p className={s.mapMeta}>{[v.device, v.browser].filter(Boolean).join(" / ") || "Unknown device"}{v.fromAd ? " · from an ad" : ""}{v.environment === "development" ? " · localhost" : ""}</p>
                </div>
                {rest.length > 0 && (
                  <ul className={s.mapOthers}>
                    {rest.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => onSelect(o.id)}>
                          <i style={{ background: PIN_META[PIN_KIND[o.stage]].colour }} aria-hidden="true"/>
                          <b>{o.source}</b>
                          <span>· now on {o.pageLabel}</span>
                          <small>{o.active ? "active" : <><Since iso={o.lastAt}/> ago</>}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Under the map (2026-10-04; owner: "remove this part to save space or
          put other smart info"): one line that holds only what the map is
          showing — the pins that are on it with their counts, the ad ring
          when someone came off an ad, the red/blue swatches when a state is
          lit, and where they are, by state when they are all in the US. The
          manual and the whole key open from the "?" at its end; with nobody
          on the map the line is that button alone. */}
      <div className={s.mapLegend} data-map-legend>
        {kinds.filter(([, n]) => n > 0).map(([key, n]) => (
          <span key={key}><PinIcon colour={PIN_META[key].colour}/>{PIN_META[key].label} · <b>{n}</b></span>
        ))}
        {fromAds > 0 && <span><i className={s.mapAdRing} aria-hidden="true"/>From an ad · <b>{fromAds}</b></span>}
        {party && lit.size > 0 && <span className={s.mapLegendParty} title="A US state lights up while a visitor on the map is in it; the colour is how it voted for president in 2024: blue Democratic, red Republican. The half-circle button on the map turns the lighting off."><i data-party="D" aria-hidden="true"/>Dem <i data-party="R" aria-hidden="true"/>Rep</span>}
        {prospects && <span className={s.mapLegendNote}>Prospects: members and customers signing in are left off; a signup stays on the map for a day.</span>}
        {unplaced > 0 && <span className={s.mapLegendNote}>{plural(unplaced, "visitor", "visitors")} without a known place: counted, not on the map</span>}
        {(topStates.length > 0 || topCountries.length > 0) && (
          <span className={s.mapChips} data-map-places>
            <em>Where</em>
            {topStates.length > 0
              ? topStates.map(([code, n]) => <button key={code} type="button" onClick={() => flyToState(code)} title={`Show ${stateName(code)}`}>{stateName(code)} · <b>{n}</b></button>)
              : topCountries.map(([cc, n]) => <button key={cc} type="button" onClick={() => flyToCountry(cc)} title={`Show ${countryName(cc)}`}>{flag(cc)} {countryName(cc)} · <b>{n}</b></button>)}
          </span>
        )}
        <button type="button" className={s.mapHelpToggle} aria-expanded={help} aria-controls="live-map-guide" aria-label={help ? "Hide the guide" : "How the map works"} title={help ? "Hide the guide" : "How the map works"} onClick={() => setHelp((x) => !x)}>?</button>
      </div>
      {help && (
        <div className={s.mapHelp} id="live-map-guide">
          <ul>
            <li>Scroll or pinch to zoom, drag to move, double-click to zoom in. Zoomed in, the map turns detailed and shows the US states.</li>
            <li>Hover for names; click a pin for who it is and what they did.</li>
            <li>A pin pulses while its visitor was on the site in the last {LIVE_ACTIVE_MINUTES} minutes. A violet ring: they came from an ad.</li>
            <li>A US state lights up red or blue, how it voted for president in 2024, while a visitor on the map is in it; the rest of the map keeps its colour, and the half-circle button in the corner turns the lighting off.</li>
            <li>The last button fills the screen with the map; Esc brings the page back.</li>
          </ul>
          <p className={s.mapHelpKey}>
            {kinds.filter(([key]) => !prospects || (key !== "member" && key !== "signing-in")).map(([key]) => <span key={key}><PinIcon colour={PIN_META[key].colour}/>{PIN_META[key].label}</span>)}
            <span><i className={s.mapAdRing} aria-hidden="true"/>From an ad</span>
          </p>
        </div>
      )}
    </div>
  );
});
