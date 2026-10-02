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
import type { LiveStage, LiveVisitor } from "@/lib/traffic-live";
import { Ago } from "./ticker";
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

/** The world: ocean, grid, countries and (zoomed over North America) the
 *  states, shaded by visitors. Re-rendered only when the shapes or the counts change. */
const MapBase = memo(function MapBase({ map, shapes, states, perCountry, perState }: { map: WorldMap; shapes: Shape[]; states: Shape[] | null; perCountry: Map<string, number>; perState: Map<string, number> }) {
  const mostCountry = Math.max(1, ...perCountry.values()), mostState = Math.max(1, ...perState.values());
  return <>
    <path d={map.sphere} className={s.mapOcean} />
    <path d={map.graticule} fill="none" className={s.mapGrid} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
    <g>
      {shapes.map((c, i) => {
        const n = c.c ? perCountry.get(c.c) ?? 0 : 0;
        // With the states drawn, they carry the shading and the country itself stays plain.
        const plain = !n || (states && c.c === "US");
        return <path key={`${c.c ?? c.n}-${i}`} d={c.d} data-country={c.c ?? undefined} data-tip={`${c.n}${n ? ` · ${plural(n, "visitor", "visitors")}` : ""}`} className={s.mapLand} style={plain ? undefined : { fill: `color-mix(in oklab, var(--blueprint) ${Math.round(28 + 52 * (n / mostCountry))}%, var(--paper-deep))` }} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
      })}
    </g>
    {states && (
      <g>
        {states.map((x) => {
          const n = perState.get(x.r ?? "") ?? 0;
          return <path key={x.r} d={x.d} data-tip={`${x.n}${n ? ` · ${plural(n, "visitor", "visitors")}` : ""}`} className={s.mapState} style={n ? { fill: `color-mix(in oklab, var(--blueprint) ${Math.round(28 + 52 * (n / mostState))}%, var(--paper-deep))` } : undefined} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
        })}
      </g>
    )}
  </>;
});

export const LiveMap = memo(function LiveMap({ visitors, selected, onSelect, timezone, adNames = EMPTY_NAMES }: { visitors: LiveVisitor[]; selected: string | null; onSelect: (key: string | null) => void; timezone: string; adNames?: Record<string, string> }) {
  const [map, setMap] = useState<WorldMap | null>(null);
  const [fine, setFine] = useState<Shape[] | null>(null);
  const [states, setStates] = useState<Shape[] | null>(null);
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
  useEffect(() => { if (detailed && overUS && !states) void load<{ states: Shape[] }>("us-states.json").then((m) => setStates(m.states)).catch(() => undefined); }, [detailed, overUS, states]);

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
  const clock = (iso: string) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; } };
  const stateName = (code: string) => (code ? states?.find((x) => x.r === code)?.n ?? code : "");
  const placeName = (v: LiveVisitor) => `${v.city || countryName(v.countryCode, v.country)}${v.countryCode === "US" && v.regionCode ? `, ${stateName(v.regionCode)}` : ""}`;

  if (failed) return <div className={s.mapLoading}>The map files could not be loaded.</div>;
  if (!map || !full || !view) return <div className={s.mapLoading}>Loading the map…</div>;
  const k = view.w / full.w; // pins, borders and labels keep their size on screen at any zoom
  const shapes = detailed && fine ? fine : map.countries;
  const showStates = detailed && overUS && states;
  const labelled = zoom >= 2.5;
  const unplaced = visitors.filter((v) => v.lat === null || v.lon === null).length;

  return (
    <div className={s.map}>
      <div ref={boxRef} className={s.mapBox} onPointerLeave={() => setTip(null)}>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={s.mapSvg}
          style={{ aspectRatio: `${full.w} / ${full.h}` }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onDoubleClick={(e) => { const p = toMap(e.clientX, e.clientY); const v = viewRef.current!; flyTo({ w: v.w / 2, h: v.h / 2, x: p.x - v.w / 4, y: p.y - v.h / 4 }); }}
          role="img" aria-label={`World map: ${plural(visitors.length - unplaced, "visitor", "visitors")} in ${plural(places.length, "place", "places")}.`}
          data-pins={visitors.length - unplaced}
        >
          <MapBase map={map} shapes={shapes} states={showStates ? states : null} perCountry={perCountry} perState={perState} />
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
              <g key={v.id} data-visitor={v.id} data-tip={tipText} className={s.mapPin} opacity={v.active || on ? 1 : 0.72}>
                <ellipse cx={px} cy={py} rx={3.2 * k} ry={1.2 * k} fill="rgba(0,0,0,.25)" />
                <g transform={`translate(${px} ${py}) scale(${size})`}>
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
                    <span className={s.mapWhen} data-active={v.active}>{v.active ? "on the site now" : <>left <Since iso={v.lastAt}/> ago</>}</span>
                  </p>
                  {v.signup && <p className={s.mapSignup}>Signed up → <b>{v.signup.orgName}</b> · {v.signup.ownerEmail}{v.signup.plan ? ` · ${v.signup.plan}` : ""}</p>}
                  {!v.signup && v.member && <p className={s.mapSignup}>Member → <b>{v.member.orgName}</b>{v.member.userName ? ` · ${v.member.userName}` : ""}</p>}
                  <div className={s.mapNow}>
                    <span>{v.active ? "Now on" : "Last seen on"}</span>
                    <b>{v.pageLabel}</b>
                    <small>{plural(v.views, "page", "pages")} since {clock(v.firstAt)} · last move <Since iso={v.lastAt}/> ago</small>
                  </div>
                  {v.trail.length > 1 && <ol className={s.mapTrail}>{v.trail.map((t, i) => <li key={`${i}-${t}`} data-last={i === v.trail.length - 1}>{t}</li>)}</ol>}
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

      <ul className={s.mapLegend} aria-label="Map key">
        {(Object.keys(PIN_META) as PinKind[]).map((key) => {
          const n = visitors.filter((v) => PIN_KIND[v.stage] === key).length;
          return (
            <li key={key} data-zero={n === 0}>
              <svg viewBox="-9.5 -25 19 26" aria-hidden="true"><path d={PIN} fill={PIN_META[key].colour} stroke="#fff" strokeWidth={1.9} /><circle cx={0} cy={-15} r={3} fill="#fff" /></svg>
              <span>{PIN_META[key].label}</span>
              <b>{n.toLocaleString("en-US")}</b>
            </li>
          );
        })}
        <li><i className={s.mapAdRing} aria-hidden="true"/><span>From an ad</span><b>{visitors.filter((v) => v.fromAd).length.toLocaleString("en-US")}</b></li>
      </ul>
      {unplaced > 0 && <p className={s.mapNote}>{plural(unplaced, "visitor", "visitors")} without a known place are counted but not pinned.</p>}
    </div>
  );
});
