"use client";
// Satellite draw surface. Uses an EDITABLE google.maps.Polyline so vertex drag
// and midpoint-insert come for free; we only translate the path to/from local
// feet and push commits to the studio store (debounced to one frame so a drag
// doesn't thrash the 3D rebuild). The store stays the source of truth in feet.
//
// Beyond drawing the run, this surface also:
//   • shows a satellite view immediately (a default lot) so the page is never blank,
//   • uses a crosshair cursor + a live "segment / total" chip that trails the pointer,
//   • rubber-bands a preview line from the last dot to the cursor while tracing,
//   • hosts the Add gate / Add door tools; a click drops the armed opening — snapping
//     onto a run only when it lands very close, otherwise placing it free,
//   • renders each opening as draggable markers (centre = move; attached gates also
//     get two edge handles to set the width).
import * as React from "react";
import { Move, Spline, Trash2, Undo2, DoorOpen, DoorClosed, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadMapsLibrary, isMapsBrowserEnabled } from "@/lib/googleMaps";
import { latLngToLocalFeet, localFeetToLatLng, type LatLng } from "./mapProjection";
import {
  GATE_VARIANTS,
  DOOR_VARIANTS,
  VARIANT_LABEL,
  presetWidthFt,
  variantLabel,
  type PathPoint,
  type GateSpec,
  type OpeningKind,
  type CustomOpening,
} from "./fenceTypes";
import type { ArmedOpening } from "@/stores/useFenceStudioStore";

// Defaults only. The colours are props (see FenceDrawMapProps) so a host with a
// different design system passes its own tokens instead of inheriting the sage
// studio's literals — the blueprint Fence studio passes --blueprint / --muted.
const DEFAULT_ACCENT = "#1f7a52"; // Pressed Sage (locked accent) for the drawn line
const DEFAULT_DOOR_INK = "#5a6473"; // cool-ink-muted — doors read neutral vs the sage gate
// Surveyed property line — blueprint blue everywhere, on purpose. A parcel
// boundary is REFERENCE geometry, not the thing being sold, so it reads in the
// system's one blue while the traced fence keeps the host's own accent. It used
// to be near-black, which on satellite imagery was indistinguishable from a roof
// edge or a kerb.
const PARCEL_BLUE = "#1854a0";
// A real residential lot that is inside the Regrid free-trial coverage, so the map
// is never blank and the sample "Load Property Lines" works out of the box.
const DEFAULT_CENTER: LatLng = { lat: 32.834967, lng: -96.563861 };
const SNAP_ON_FT = 5; // only magnet an opening onto a run when it lands this close

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Nearest fence segment to a point (local feet) with the clamped position along it.
function nearestSegment(p: PathPoint, pts: PathPoint[]): { i: number; t: number; dist: number } | null {
  let best: { i: number; t: number; dist: number } | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (b.gap) continue; // run break — openings can't sit on the invisible connector
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (!best || d < best.dist) best = { i, t, dist: d };
  }
  return best;
}

// Shift the centre so a `widthFt` opening sits FULLY on segment `i` near `tRaw`
// (one end against the fence, the rest extending inward) rather than being centred
// on the click and clamped — which stacks all the dots at a corner.
function fitCenterT(i: number, tRaw: number, pts: PathPoint[], widthFt: number): number {
  const a = pts[i];
  const b = pts[i + 1];
  const segLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (segLen < 1e-6) return 0.5;
  const w = Math.min(widthFt, segLen);
  return clamp(tRaw * segLen, w / 2, segLen - w / 2) / segLen;
}

/**
 * The imperative handle the surface exposes to whoever hosts it. The sage studio
 * drives it from the surface's own toolbar; a host that renders its OWN toolbar
 * (the blueprint Fence studio) takes it through `onApi` and drives it from there.
 */
export type FenceDrawMapApi = {
  clear: () => void;
  closeLoop: () => void;
  undo: () => void;
  setFromPoints: () => void;
  setAlign: (on: boolean) => void;
  syncOpenings: () => void;
  refreshCursor: () => void;
  hideGhost: () => void;
  zoomBy: (delta: number) => void;
};

export type FenceDrawMapProps = {
  lat?: number;
  lng?: number;
  points: PathPoint[];
  onChange: (pts: PathPoint[]) => void;
  revision?: number; // bump to re-seed the polyline from `points` (parcel load / reset)
  className?: string;
  gates: GateSpec[];
  armed: ArmedOpening | null;
  customOpenings: CustomOpening[]; // user-created gate/door types (shown in the pickers)
  onArm: (kind: OpeningKind, variant: string) => void; // Add gate/door tools (on the map)
  onDropOpening: (segmentIndex: number, t: number, x?: number, y?: number) => void;
  onUpdateGate: (id: string, patch: Partial<GateSpec>) => void; // marker drag → move/resize
  onDisarm: () => void; // Esc / click-in-empty cancels the armed tool
  /**
   * Render the surface's own chrome — the Align/Close loop/Undo/Clear row, the
   * Gate/Door pickers, the hint pill and Google's zoom control. Default true.
   * A host with its own toolbar passes false and drives `onApi` instead, so the
   * two never stack on the same corner of the same map.
   */
  chrome?: boolean;
  /** Handed the api once the map is live, and null when it is torn down. */
  onApi?: (api: FenceDrawMapApi | null) => void;
  /** Drawn-line / gate colour. Defaults to the sage studio's accent. */
  accentColor?: string;
  /** Door marker colour (reads neutral against the gate colour). */
  doorColor?: string;
  /**
   * Cadastral parcel overlay (ReportAll): the lot's outer ring drawn as a
   * translucent fill under the trace, plus `highlight` — the vertex path of the
   * side under the cursor in the host's sides list. A path rather than an index
   * because one listed side can span several surveyed segments (see
   * lib/parcels groupSides). Display only: the polygon is not clickable and
   * never enters the trace.
   *
   * `rings` is the whole PROPERTY when it is recorded as more than one lot (two
   * adjoining deeds bought together). Every ring is drawn; `ring` stays as the
   * subject lot for hosts that only ever have one.
   */
  parcel?: { ring: LatLng[]; rings?: LatLng[][]; highlight?: LatLng[] | null } | null;
  /** Raster parcel-boundary tiles (proxied ReportAll layer, zoom 14–21). */
  parcelTiles?: boolean;
  /**
   * Measured slope per NON-LEVEL traced segment (fenceTerrain classes). Each
   * entry recolours its segment on the map — amber for racked, red for
   * stepped — and a click on the coloured line answers with the slope and the
   * rise. Level segments stay the accent colour and are not listed here.
   */
  terrain?: TerrainSegView[] | null;
};

/** One non-level segment's slope facts, for the overlay and its click card. */
export interface TerrainSegView {
  seg: number; // segment = points[seg] → points[seg + 1]
  cls: "racked" | "stepped";
  thetaDeg: number;
  riseFt: number;
  gradeFt: number;
  steps?: number;
  stepDropFt?: number;
}

const RACKED_COLOR = "#c47f17"; // amber — panels rack to follow the grade
const STEPPED_COLOR = "#b3261e"; // red — panels must stair-step

export function FenceDrawMap({
  lat,
  lng,
  points,
  onChange,
  revision,
  className,
  gates,
  armed,
  customOpenings,
  onArm,
  onDropOpening,
  onUpdateGate,
  onDisarm,
  chrome = true,
  onApi,
  accentColor = DEFAULT_ACCENT,
  doorColor = DEFAULT_DOOR_INK,
  parcel = null,
  parcelTiles = false,
  terrain = null,
}: FenceDrawMapProps) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);

  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const pointsRef = React.useRef(points);
  React.useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  const gatesRef = React.useRef(gates);
  React.useEffect(() => {
    gatesRef.current = gates;
  }, [gates]);
  const armedRef = React.useRef(armed);
  React.useEffect(() => {
    armedRef.current = armed;
    // Esc / placement / tool toggle all land here with armed=null — clear the
    // ghost immediately instead of waiting for the next mousemove.
    if (!armed) apiRef.current?.hideGhost();
  }, [armed]);
  const customOpeningsRef = React.useRef(customOpenings);
  React.useEffect(() => {
    customOpeningsRef.current = customOpenings;
  }, [customOpenings]);
  const onDropRef = React.useRef(onDropOpening);
  const onUpdateGateRef = React.useRef(onUpdateGate);
  const onDisarmRef = React.useRef(onDisarm);
  const onApiRef = React.useRef(onApi);
  // Read inside the map-build effect, which deliberately depends only on the
  // origin — routing them through refs keeps that dep list honest (and matches
  // how every other prop that effect touches is already read). Seeded from the
  // mount value, so the first build reads them correctly.
  const chromeRef = React.useRef(chrome);
  const accentRef = React.useRef(accentColor);
  const doorRef = React.useRef(doorColor);
  React.useEffect(() => {
    onDropRef.current = onDropOpening;
    onUpdateGateRef.current = onUpdateGate;
    onDisarmRef.current = onDisarm;
    onApiRef.current = onApi;
    chromeRef.current = chrome;
    accentRef.current = accentColor;
    doorRef.current = doorColor;
  });

  const apiRef = React.useRef<FenceDrawMapApi | null>(null);

  // The live map + maps library, exposed to the parcel-overlay and tile-layer
  // effects below. `mapEpoch` bumps when a (re)built map lands so those effects
  // re-run against the new instance — the build effect owns the map's life.
  const gmapRef = React.useRef<GMaps | null>(null);
  const mapsLibRef = React.useRef<GMaps | null>(null);
  const [mapEpoch, setMapEpoch] = React.useState(0);

  // Which opening picker menu is open (the pill dropdowns on the map).
  const [openMenu, setOpenMenu] = React.useState<OpeningKind | null>(null);
  const [aligning, setAligning] = React.useState(false);
  const aligningRef = React.useRef(false);
  // `setAlign` owns the whole mode switch (ref + state + polyline options +
  // cursor), so an EXTERNAL toolbar driving the api lands in exactly the same
  // state as this button — previously the ref was flipped out here and an
  // external caller would have left `aligningRef` stale, which is what the
  // click/mousemove handlers read to suppress drawing.
  const toggleAlign = React.useCallback(() => {
    const next = !aligningRef.current;
    if (apiRef.current) {
      apiRef.current.setAlign(next);
      return;
    }
    aligningRef.current = next;
    setAligning(next);
  }, []);

  const firstRev = React.useRef(true);
  React.useEffect(() => {
    if (firstRev.current) {
      firstRev.current = false;
      return;
    }
    apiRef.current?.setFromPoints();
  }, [revision]);

  React.useEffect(() => {
    apiRef.current?.syncOpenings();
  }, [gates, points]);

  const enabled = isMapsBrowserEnabled();
  const hasFence = points.length >= 2;

  React.useEffect(() => {
    if (!enabled || !mountRef.current) return;
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      try {
        const [maps, core, markerLib] = await Promise.all([
          loadMapsLibrary<GMaps>("maps"),
          loadMapsLibrary<GMaps>("core"),
          loadMapsLibrary<GMaps>("marker"),
        ]);
        if (cancelled || !mountRef.current) return;
        const LatLngCtor = core.LatLng;
        const Marker = markerLib.Marker;
        // Host-supplied palette, resolved once per map build.
        const ACCENT = accentRef.current;
        const DOOR_INK = doorRef.current;
        // No address yet → open on a real sample lot so the surface is never blank.
        const origin: LatLng = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : DEFAULT_CENTER;
        const map = new maps.Map(mountRef.current, {
          center: origin,
          zoom: 20,
          mapTypeId: "satellite",
          tilt: 0,
          gestureHandling: "greedy",
          disableDefaultUI: true,
          // A host with its own chrome supplies its own zoom buttons; Google's
          // would otherwise sit under them in the same corner.
          zoomControl: chromeRef.current,
          keyboardShortcuts: false,
          draggableCursor: "crosshair", // signal "you can draw here"
        });
        // The fence is a list of RUNS — each an independent editable polyline, so
        // disconnected fences coexist (store encoding: `gap` on each run's first
        // point). Tracing appends to the ACTIVE run; ending a trace and clicking
        // elsewhere starts a fresh run instead of chaining to the old fence.
        type Run = { line: GMaps; listeners: GMaps[] };
        const runs: Run[] = [];
        let activeIdx = -1;

        // Rubber-band preview from the last dot to the cursor (dashed accent).
        const previewLine = new maps.Polyline({
          map,
          clickable: false,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeColor: ACCENT, strokeOpacity: 0.9, strokeWeight: 2, scale: 3 },
              offset: "0",
              repeat: "12px",
            },
          ],
          path: [],
          zIndex: 4,
        });

        const ll2ft = (ll: GMaps) => latLngToLocalFeet(origin, { lat: ll.lat(), lng: ll.lng() });
        const ft2ll = (p: PathPoint) => {
          const q = localFeetToLatLng(origin, p);
          return new LatLngCtor(q.lat, q.lng);
        };
        const distFt = (a: GMaps, b: GMaps) => {
          const p = ll2ft(a);
          const q = ll2ft(b);
          return Math.hypot(p.x - q.x, p.y - q.y);
        };

        let raf = 0;
        let syncing = false;
        // Rubber-band preview only trails the cursor while actively tracing a run.
        // Clicking an existing point (to connect) or right-clicking ends the trace.
        let drawing = false;
        const commit = () => {
          if (syncing) return;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            // Flatten runs in order; each run after the first opens with `gap` so
            // geometry/pricing know there's no fence across the break.
            const arr: PathPoint[] = [];
            runs.forEach((r, ri) => {
              let vi = 0;
              r.line.getPath().forEach((ll: GMaps) => {
                const f = ll2ft(ll);
                if (ri > 0 && vi === 0) f.gap = true;
                arr.push(f);
                vi++;
              });
            });
            onChangeRef.current(arr);
          });
        };

        // Hit radii are SCREEN pixels, not feet: a fixed-feet radius scales with
        // zoom (8 ft ≈ 40 px at parcel zoom, 160+ px zoomed in), so the rubber
        // band pinned to dots while the cursor was visibly far away and stopped
        // following it anywhere inside that circle. Pixel radii feel identical
        // at every zoom; they're converted to feet on demand for the local
        // planar math via the map's current meters-per-pixel scale.
        const MAGNET_PX = 12; // cursor magnet radius around dots while tracing
        const SNAP_PX = 8; // drag-a-dot-onto-a-dot join threshold
        const ftPerPx = () => {
          const z = map.getZoom() ?? 19;
          const lat = map.getCenter()?.lat() ?? origin.lat;
          // Web-mercator ground resolution at this latitude/zoom, in ft per px.
          return ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z)) * 3.28084;
        };
        const magnetFt = () => MAGNET_PX * ftPerPx();
        const snapFt = () => SNAP_PX * ftPerPx();
        let snapping = false;

        // Nearest vertex across ALL runs within `radiusFt` of a map point.
        const magnetVertex = (ll: GMaps, radiusFt: number): { run: number; vi: number; ll: GMaps } | null => {
          const p = ll2ft(ll);
          let best: { run: number; vi: number; ll: GMaps; d: number } | null = null;
          runs.forEach((r, ri) => {
            const pa = r.line.getPath();
            const n = pa.getLength();
            for (let j = 0; j < n; j++) {
              const v = pa.getAt(j);
              const f = ll2ft(v);
              const d = Math.hypot(p.x - f.x, p.y - f.y);
              if (d <= radiusFt && (!best || d < best.d)) best = { run: ri, vi: j, ll: v, d };
            }
          });
          return best;
        };

        const isClosedPath = (pa: GMaps) => {
          const n = pa.getLength();
          return n > 2 && distFt(pa.getAt(0), pa.getAt(n - 1)) < 0.5;
        };

        // Dragged vertex magnets onto any nearby vertex (its own run or another —
        // that's the "drag a dot onto another to join" affordance).
        const onVertexDragged = (run: Run, index: number) => {
          if (!snapping) {
            const pa = run.line.getPath();
            const m = ll2ft(pa.getAt(index));
            outer: for (const r of runs) {
              const p2 = r.line.getPath();
              const n = p2.getLength();
              for (let j = 0; j < n; j++) {
                if (r === run && j === index) continue;
                const f = ll2ft(p2.getAt(j));
                if (Math.hypot(m.x - f.x, m.y - f.y) <= snapFt()) {
                  snapping = true;
                  pa.setAt(index, p2.getAt(j));
                  snapping = false;
                  break outer;
                }
              }
            }
          }
          commit();
        };

        const destroyRun = (run: Run) => {
          const ri = runs.indexOf(run);
          if (ri < 0) return;
          for (const l of run.listeners) l?.remove?.();
          run.line.setMap(null);
          runs.splice(ri, 1);
          if (ri === activeIdx) {
            drawing = false;
            activeIdx = runs.length - 1;
          } else if (ri < activeIdx) {
            activeIdx--;
          }
        };

        const newRun = (initial: GMaps[]): Run => {
          const line = new maps.Polyline({
            map,
            editable: !aligningRef.current,
            draggable: aligningRef.current,
            path: initial,
            strokeColor: ACCENT,
            strokeWeight: 3,
            strokeOpacity: 1,
          });
          const run: Run = { line, listeners: [] };
          const pa = line.getPath();
          run.listeners.push(
            pa.addListener("set_at", (i: number) => onVertexDragged(run, i)),
            pa.addListener("insert_at", commit),
            pa.addListener("remove_at", commit),
            line.addListener("dragend", commit),
            // Polylines swallow the map's mousemove when hovered — without this the
            // rubber band froze the moment the cursor neared a dot. (fix: same handler)
            line.addListener("mousemove", (e: GMaps) => onMove(e)),
            line.addListener("click", (e: GMaps) => onVertexClick(run, e)),
            line.addListener("rightclick", (e: GMaps) => onVertexRightclick(run, e)),
          );
          runs.push(run);
          return run;
        };

        // Begin tracing a brand-new run at a point.
        const startRun = (ll: GMaps) => {
          newRun([ll]);
          activeIdx = runs.length - 1;
          drawing = true;
          commit();
        };

        // Seed runs from the store's points (split on `gap`). Used at mount and by
        // setFromPoints (parcel load / reset / undo-external).
        const seedRuns = () => {
          syncing = true;
          while (runs.length) destroyRun(runs[runs.length - 1]);
          let current: GMaps[] = [];
          const flush = () => {
            if (current.length > 0) newRun(current);
            current = [];
          };
          for (const p of pointsRef.current) {
            if (p.gap) flush();
            const q = localFeetToLatLng(origin, p);
            current.push(new LatLngCtor(q.lat, q.lng));
          }
          flush();
          activeIdx = runs.length - 1;
          drawing = false;
          previewLine.setPath([]);
          syncing = false;
        };

        // ── Opening markers (centre dot + gate edge handles) ──
        type OpeningMarker = { center: GMaps; a?: GMaps; b?: GMaps };
        const openings = new Map<string, OpeningMarker>();
        const circleIcon = (scale: number, fill: string, stroke: string, strokeW: number) => ({
          path: 0, // google.maps.SymbolPath.CIRCLE
          scale,
          fillColor: fill,
          fillOpacity: 1,
          strokeColor: stroke,
          strokeWeight: strokeW,
        });
        const centerIcon = (kind: GateSpec["kind"]) =>
          circleIcon(7, kind === "gate" ? ACCENT : DOOR_INK, "#ffffff", 2);
        const handleIcon = () => circleIcon(5, "#ffffff", ACCENT, 2);

        const isAttached = (g: GateSpec) => g.segmentIndex >= 0 && !!pointsRef.current[g.segmentIndex + 1];

        // Centre + (attached only) edge positions in local feet.
        const openingGeom = (g: GateSpec): { center: PathPoint; a?: PathPoint; b?: PathPoint } | null => {
          if (!isAttached(g)) {
            if (typeof g.x !== "number" || typeof g.y !== "number") return null;
            return { center: { x: g.x, y: g.y } };
          }
          const a = pointsRef.current[g.segmentIndex];
          const b = pointsRef.current[g.segmentIndex + 1];
          const segLen = Math.hypot(b.x - a.x, b.y - a.y);
          if (segLen < 1e-6) return null;
          const ux = (b.x - a.x) / segLen;
          const uy = (b.y - a.y) / segLen;
          const w = Math.min(g.widthFt, segLen);
          const cDist = clamp(g.t, 0, 1) * segLen;
          const aDist = Math.max(0, cDist - w / 2);
          const bDist = Math.min(segLen, cDist + w / 2);
          return {
            center: { x: a.x + ux * cDist, y: a.y + uy * cDist },
            a: { x: a.x + ux * aDist, y: a.y + uy * aDist },
            b: { x: a.x + ux * bDist, y: a.y + uy * bDist },
          };
        };

        const removeMarker = (mk: OpeningMarker) => {
          mk.center.setMap(null);
          mk.a?.setMap(null);
          mk.b?.setMap(null);
        };

        const makeHandle = (id: string, role: "a" | "b") => {
          const h = new Marker({ map, draggable: true, icon: handleIcon(), zIndex: 31, cursor: "ew-resize" });
          h.set("id", id);
          h.set("role", role);
          h.addListener("dragend", () => {
            const g = gatesRef.current.find((x) => x.id === h.get("id"));
            if (!g) return renderOpenings();
            const a = pointsRef.current[g.segmentIndex];
            const b = pointsRef.current[g.segmentIndex + 1];
            const pos = h.getPosition();
            if (!a || !b || !pos) return renderOpenings();
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen < 1e-6) return renderOpenings();
            const ux = (b.x - a.x) / segLen;
            const uy = (b.y - a.y) / segLen;
            const p = ll2ft(pos);
            let tHandle = ((p.x - a.x) * ux + (p.y - a.y) * uy) / segLen;
            tHandle = clamp(tHandle, 0, 1);
            const halfT = Math.min(g.widthFt, segLen) / 2 / segLen;
            const otherT = h.get("role") === "a" ? Math.min(1, g.t + halfT) : Math.max(0, g.t - halfT);
            const newWidth = Math.max(1.5, Math.min(segLen, Math.abs(tHandle - otherT) * segLen));
            const newT = clamp((tHandle + otherT) / 2, 0, 1);
            onUpdateGateRef.current(g.id, { t: newT, widthFt: newWidth });
          });
          return h;
        };

        // ── Armed-tool ghost: while placing a gate/door, previews the seated
        // position on the nearest fence line BEFORE the click. Uses the same
        // nearestSegment + SNAP_ON_FT + fitCenterT math as the click handler, so
        // the ghost appears exactly (and only) where a click would magnet on;
        // away from any run it vanishes — that click would drop the opening free.
        const ghostIcon = (kind: GateSpec["kind"]) => ({
          path: 0, // google.maps.SymbolPath.CIRCLE
          scale: 7,
          fillColor: kind === "gate" ? ACCENT : DOOR_INK,
          fillOpacity: 0.5,
          strokeColor: "#ffffff",
          strokeOpacity: 0.75,
          strokeWeight: 2,
        });
        const ghostCenter = new Marker({ map, clickable: false, visible: false, zIndex: 29 });
        // Width span along the run — shows the stretch of fence the opening will occupy.
        const ghostSpan = new maps.Polyline({
          map,
          clickable: false,
          path: [],
          strokeColor: ACCENT,
          strokeOpacity: 0.45,
          strokeWeight: 7,
          zIndex: 5,
        });
        let ghostShown = false;
        const hideGhost = () => {
          if (!ghostShown) return;
          ghostShown = false;
          ghostCenter.setVisible(false);
          ghostSpan.setPath([]);
        };
        // Returns true when the ghost is snapped onto a run (drives the chip copy).
        const updateGhost = (ll: GMaps): boolean => {
          const a = armedRef.current;
          if (!a) {
            hideGhost();
            return false;
          }
          const p = ll2ft(ll);
          const hit = nearestSegment(p, pointsRef.current);
          if (!hit || hit.dist > SNAP_ON_FT) {
            hideGhost();
            return false;
          }
          const s0 = pointsRef.current[hit.i];
          const s1 = pointsRef.current[hit.i + 1];
          const segLen = Math.hypot(s1.x - s0.x, s1.y - s0.y);
          if (segLen < 1e-6) {
            hideGhost();
            return false;
          }
          const ux = (s1.x - s0.x) / segLen;
          const uy = (s1.y - s0.y) / segLen;
          const cDist = fitCenterT(hit.i, hit.t, pointsRef.current, a.widthFt) * segLen;
          const half = Math.min(a.widthFt, segLen) / 2;
          ghostCenter.setIcon(ghostIcon(a.kind));
          ghostCenter.setPosition(ft2ll({ x: s0.x + ux * cDist, y: s0.y + uy * cDist }));
          ghostCenter.setVisible(true);
          ghostSpan.setOptions({ strokeColor: a.kind === "gate" ? ACCENT : DOOR_INK });
          ghostSpan.setPath([
            ft2ll({ x: s0.x + ux * (cDist - half), y: s0.y + uy * (cDist - half) }),
            ft2ll({ x: s0.x + ux * (cDist + half), y: s0.y + uy * (cDist + half) }),
          ]);
          ghostShown = true;
          return true;
        };

        const renderOpenings = () => {
          const want = gatesRef.current;
          const ids = new Set(want.map((g) => g.id));
          for (const [id, mk] of [...openings]) {
            if (!ids.has(id)) {
              removeMarker(mk);
              openings.delete(id);
            }
          }
          for (const g of want) {
            const geom = openingGeom(g);
            if (!geom) {
              const stale = openings.get(g.id);
              if (stale) {
                removeMarker(stale);
                openings.delete(g.id);
              }
              continue;
            }
            let mk = openings.get(g.id);
            if (!mk) {
              const center = new Marker({ map, draggable: true, icon: centerIcon(g.kind), zIndex: 30, cursor: "move" });
              center.set("id", g.id);
              center.addListener("dragend", () => {
                const cur = gatesRef.current.find((x) => x.id === center.get("id"));
                const pos = center.getPosition();
                if (!cur || !pos) return renderOpenings();
                const p = ll2ft(pos);
                const hit = nearestSegment(p, pointsRef.current);
                if (hit && hit.dist <= SNAP_ON_FT) {
                  // Magnet onto the run only when very close; keep it fully on-segment.
                  onUpdateGateRef.current(cur.id, {
                    segmentIndex: hit.i,
                    t: fitCenterT(hit.i, hit.t, pointsRef.current, cur.widthFt),
                    x: undefined,
                    y: undefined,
                  });
                } else {
                  // Otherwise leave it free where it was dropped.
                  onUpdateGateRef.current(cur.id, { segmentIndex: -1, x: p.x, y: p.y });
                }
              });
              mk = { center };
              openings.set(g.id, mk);
            }
            mk.center.setIcon(centerIcon(g.kind));
            mk.center.setPosition(ft2ll(geom.center));
            // Resize handles only for ATTACHED gates. Doors + detached openings move only.
            if (g.kind === "gate" && geom.a && geom.b) {
              if (!mk.a) mk.a = makeHandle(g.id, "a");
              if (!mk.b) mk.b = makeHandle(g.id, "b");
              mk.a.setPosition(ft2ll(geom.a));
              mk.b.setPosition(ft2ll(geom.b));
            } else if (mk.a || mk.b) {
              mk.a?.setMap(null);
              mk.b?.setMap(null);
              mk.a = undefined;
              mk.b = undefined;
            }
          }
        };

        // ── Live measurement chip + preview line ──
        const measureEl = measureRef.current;
        // The chip is placed with `transform: translate()`, which is applied in
        // the surface's OWN coordinate space, from a delta measured off
        // `getBoundingClientRect()` and a pointer position — both of which are
        // viewport pixels. Under a CSS-zoomed host the two spaces differ, so the
        // delta has to be divided by the effective zoom or the chip drifts away
        // from the cursor proportionally to the distance from the top-left
        // corner. (The blueprint shell zooms its root: FLUID SCALE, window
        // width / 1728, clamped 0.78–1.35 — so only an exactly 1728px viewport
        // was correct. blueprint-shell/list-motion corrects its FLIP deltas the
        // same way.) The sage studio is unzoomed and divides by 1.
        // Cached per build and refreshed on resize, which is the only thing that
        // changes it — reading it per mousemove would walk the tree 60×/second.
        let hostZoom = 1;
        const readZoom = () => {
          let z = 1;
          for (let n: HTMLElement | null = mountRef.current; n; n = n.parentElement) {
            // Nested zooms multiply; `normal` / unsupported parses to NaN and is skipped.
            const v = parseFloat(getComputedStyle(n).zoom);
            if (isFinite(v) && v > 0) z *= v;
          }
          hostZoom = z > 0 ? z : 1;
        };
        readZoom();
        window.addEventListener("resize", readZoom);
        // The SAME mismatch bites Google's own hit test: it derives `e.latLng`
        // from the pointer's VIEWPORT coordinates and measures them against the
        // map div as though the two spaces were one. Under a zoomed host every
        // click therefore resolves SHORT of the cursor, by exactly the drift the
        // chip above corrects — a dot lands up-left of where it was placed, and
        // the error grows with the distance from the map's top-left corner.
        // So the pointer is re-projected here instead of trusted: viewport delta
        // -> local pixels -> the map's own projection. The overlay exists only to
        // hand back that projection (getProjection is an OverlayView method).
        const projector = new maps.OverlayView();
        projector.onAdd = () => {};
        projector.draw = () => {};
        projector.onRemove = () => {};
        projector.setMap(map);
        /** Where the pointer REALLY is. Google's own answer is kept whenever the
         *  correction cannot be made — an unzoomed host, a projection that has
         *  not drawn yet, or an event with no pointer behind it. */
        const trueLL = (e: GMaps): GMaps | null => {
          const fallback = e.latLng ?? null;
          if (hostZoom === 1) return fallback;
          const dom = e.domEvent as MouseEvent | undefined;
          const el = mountRef.current;
          const rect = el?.getBoundingClientRect();
          if (!dom || typeof dom.clientX !== "number" || !el || !rect) return fallback;
          const p = projector.getProjection();
          if (!p) return fallback;
          // TWO corrections, both from the same root cause. Google measured this
          // container with getBoundingClientRect() — viewport pixels, 20% short
          // here — but lays its panes out in the element's OWN pixels, and
          // centres the map on the size it measured. So (a) the pointer delta is
          // in viewport pixels and has to be divided back into element pixels,
          // and (b) Google's container origin sits half the difference between
          // the two sizes in from this element's top-left corner. Correcting only
          // the scale leaves a constant ~65px drift; correcting only the origin
          // leaves the fence measuring 17% short.
          const padX = (el.offsetWidth - rect.width) / 2;
          const padY = (el.offsetHeight - rect.height) / 2;
          const px = new core.Point(
            (dom.clientX - rect.left) / hostZoom - padX,
            (dom.clientY - rect.top) / hostZoom - padY,
          );
          return p.fromContainerPixelToLatLng(px) ?? fallback;
        };
        const totalLenFt = () => {
          let total = 0;
          for (const r of runs) {
            const pa = r.line.getPath();
            const n = pa.getLength();
            for (let i = 1; i < n; i++) total += distFt(pa.getAt(i - 1), pa.getAt(i));
          }
          return total;
        };
        const onMove = (e: GMaps) => {
          const at = trueLL(e);
          if (!at) {
            previewLine.setPath([]);
            hideGhost();
            return;
          }
          const busy = !!armedRef.current || aligningRef.current;
          // Endpoint magnet: within the pixel radius the cursor locks to the
          // nearest dot (and unlocks the moment it leaves the radius).
          const mag = busy ? null : magnetVertex(at, magnetFt());
          const cursorLL = mag ? mag.ll : at;
          const act = drawing && !busy ? runs[activeIdx] : null;
          const ap = act?.line.getPath();
          const an = ap ? ap.getLength() : 0;
          if (ap && an >= 1) {
            previewLine.setPath([ap.getAt(an - 1), cursorLL]);
          } else {
            previewLine.setPath([]);
          }
          if (!measureEl) return;
          const rect = mountRef.current?.getBoundingClientRect();
          const dom = e.domEvent as MouseEvent | undefined;
          if (rect && dom) {
            // Measured delta → local space (see hostZoom); the 14px nudge is
            // already local, so it is added after the division.
            const dx = (dom.clientX - rect.left) / hostZoom + 14;
            const dy = (dom.clientY - rect.top) / hostZoom + 14;
            measureEl.style.transform = `translate(${dx}px, ${dy}px)`;
          }
          measureEl.style.display = "block";
          if (armedRef.current) {
            // Magnet preview: the ghost seats itself on the fence line whenever
            // the cursor is close enough that a click would snap there.
            const snapped = updateGhost(at);
            const a = armedRef.current;
            // "double gate" for built-ins; a custom type reads by its own name.
            const armedName = VARIANT_LABEL[a.variant]
              ? `${VARIANT_LABEL[a.variant].toLowerCase()} ${a.kind}`
              : variantLabel(a.variant, customOpeningsRef.current);
            measureEl.textContent = snapped
              ? `Click to place the ${armedName} here`
              : `Click to place a ${armedName} — hover a fence line to snap it`;
            return;
          }
          if (ap && an >= 1) {
            const seg = distFt(ap.getAt(an - 1), cursorLL);
            let hint = "";
            if (mag) {
              hint =
                mag.run === activeIdx && mag.vi === 0 && an >= 3
                  ? " · click to close"
                  : mag.run === activeIdx && mag.vi === an - 1
                    ? " · click to stop"
                    : " · click to connect";
            }
            measureEl.textContent = `+${Math.round(seg)} ft · ${Math.round(totalLenFt())} ft total${hint}`;
            return;
          }
          if (mag) {
            const mp = runs[mag.run].line.getPath();
            const openEnd = !isClosedPath(mp) && (mag.vi === mp.getLength() - 1 || mag.vi === 0);
            measureEl.textContent = openEnd ? "Click to continue this fence" : "Click to start a new fence";
            return;
          }
          measureEl.textContent = runs.length > 0 ? "Click to start a new fence" : "Click to start";
        };
        const hideMeasure = () => {
          if (measureEl) measureEl.style.display = "none";
          previewLine.setPath([]);
          hideGhost();
        };

        const stopTrace = () => {
          drawing = false;
          previewLine.setPath([]);
        };

        // Click on an existing dot (fires on the run's polyline, not the map).
        const onVertexClick = (run: Run, e: GMaps) => {
          if (e.vertex == null || aligningRef.current || armedRef.current) return;
          const ri = runs.indexOf(run);
          const pa = run.line.getPath();
          const n = pa.getLength();
          if (!drawing) {
            // Idle: clicking an OPEN run's end dot resumes tracing that fence.
            if (!isClosedPath(pa) && e.vertex === n - 1) {
              activeIdx = ri;
              drawing = true;
            } else if (!isClosedPath(pa) && e.vertex === 0 && n > 1) {
              // The head end: continue via a new run joined exactly at that dot.
              startRun(pa.getAt(0));
            }
            return;
          }
          const act = runs[activeIdx];
          if (!act) return stopTrace();
          const ap = act.line.getPath();
          if (ri === activeIdx) {
            if (e.vertex === 0 && ap.getLength() >= 3 && !isClosedPath(ap)) {
              // Own first dot closes the loop.
              ap.push(pa.getAt(0));
              commit();
            } else if (e.vertex !== ap.getLength() - 1) {
              // Own mid dot: connect into it (T-junction); own last dot just stops.
              ap.push(pa.getAt(e.vertex));
              commit();
            }
          } else {
            // A dot on another fence: connect the trace to it exactly.
            ap.push(pa.getAt(e.vertex));
            commit();
          }
          stopTrace();
        };

        const onVertexRightclick = (run: Run, e: GMaps) => {
          if (e.vertex != null) {
            const pa = run.line.getPath();
            pa.removeAt(e.vertex);
            if (pa.getLength() === 0) destroyRun(run);
            commit();
          }
          stopTrace();
        };

        const listeners = [
          map.addListener("mousemove", onMove),
          map.addListener("mouseout", hideMeasure),
          map.addListener("click", (e: GMaps) => {
            if (aligningRef.current) return;
            const at = trueLL(e);
            const a = armedRef.current;
            if (a) {
              if (!at) return;
              const p = ll2ft(at);
              const hit = nearestSegment(p, pointsRef.current);
              if (hit && hit.dist <= SNAP_ON_FT) {
                // Very close to a run → magnet on, seated fully along the fence line.
                onDropRef.current(hit.i, fitCenterT(hit.i, hit.t, pointsRef.current, a.widthFt));
              } else {
                // Otherwise drop it free at the clicked spot (no magnet).
                onDropRef.current(-1, 0, p.x, p.y);
              }
              return;
            }
            if (!at) return;
            const mag = magnetVertex(at, magnetFt());
            if (drawing) {
              const act = runs[activeIdx];
              if (!act) return stopTrace();
              const ap = act.line.getPath();
              if (mag) {
                // Magnetized click = connect/close/stop, mirroring the preview.
                const tgt = runs[mag.run].line.getPath().getAt(mag.vi);
                if (mag.run === activeIdx && mag.vi === 0 && ap.getLength() >= 3 && !isClosedPath(ap)) {
                  ap.push(tgt); // close the loop
                  commit();
                } else if (!(mag.run === activeIdx && mag.vi === ap.getLength() - 1)) {
                  ap.push(tgt); // connect to that dot exactly
                  commit();
                }
                return stopTrace();
              }
              ap.push(at);
              commit();
              return;
            }
            // Not tracing: near an open end resumes that fence; anywhere else
            // starts a NEW disconnected fence (no line back to the old one).
            if (mag) {
              const mp = runs[mag.run].line.getPath();
              if (!isClosedPath(mp) && mag.vi === mp.getLength() - 1) {
                activeIdx = mag.run;
                drawing = true;
                return;
              }
              startRun(mp.getAt(mag.vi));
              return;
            }
            startRun(at);
          }),
          map.addListener("rightclick", () => {
            // Right-click away from a vertex: just stop the run from following the cursor.
            stopTrace();
          }),
        ];

        const onKey = (ev: KeyboardEvent) => {
          if (ev.key === "Escape" && armedRef.current) onDisarmRef.current();
        };
        window.addEventListener("keydown", onKey);

        apiRef.current = {
          clear: () => {
            while (runs.length) destroyRun(runs[runs.length - 1]);
            stopTrace();
            commit();
          },
          closeLoop: () => {
            const act = runs[activeIdx] ?? runs[runs.length - 1];
            if (!act) return;
            const pa = act.line.getPath();
            if (pa.getLength() < 3 || isClosedPath(pa)) return;
            pa.push(pa.getAt(0));
            commit();
            stopTrace();
          },
          undo: () => {
            const act = runs[activeIdx] ?? runs[runs.length - 1];
            if (!act) return;
            const pa = act.line.getPath();
            const n = pa.getLength();
            if (n > 0) {
              pa.removeAt(n - 1);
              if (n - 1 === 0) destroyRun(act);
              commit();
            }
          },
          setFromPoints: () => {
            seedRuns();
            renderOpenings();
          },
          setAlign: (on: boolean) => {
            aligningRef.current = on;
            setAligning(on);
            for (const r of runs) r.line.setOptions({ draggable: on, editable: !on });
            if (on) stopTrace();
            map.setOptions({ draggableCursor: on ? "move" : "crosshair" });
          },
          syncOpenings: renderOpenings,
          refreshCursor: () => {
            map.setOptions({ draggableCursor: aligningRef.current ? "move" : "crosshair" });
          },
          hideGhost,
          zoomBy: (delta: number) => {
            const z = map.getZoom();
            if (typeof z === "number") map.setZoom(z + delta);
          },
        };

        seedRuns();
        renderOpenings();
        onApiRef.current?.(apiRef.current);
        gmapRef.current = map;
        mapsLibRef.current = maps;
        setMapEpoch((e) => e + 1);

        cleanup = () => {
          onApiRef.current?.(null);
          gmapRef.current = null;
          mapsLibRef.current = null;
          cancelAnimationFrame(raf);
          for (const l of listeners) l?.remove?.();
          while (runs.length) destroyRun(runs[runs.length - 1]);
          window.removeEventListener("keydown", onKey);
          window.removeEventListener("resize", readZoom);
          for (const mk of openings.values()) removeMarker(mk);
          openings.clear();
          projector.setMap(null);
          previewLine.setMap(null);
          ghostCenter.setMap(null);
          ghostSpan.setMap(null);
        };
      } catch (err) {
        console.error("[FenceDrawMap] failed to build the map:", err);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
      apiRef.current = null;
    };
    // Rebuild the map when the origin (address) changes.
  }, [enabled, lat, lng]);

  // ── Parcel overlay ─────────────────────────────────────────────────────────
  // Translucent lot fill + ink outline under the trace, and a heavier accent
  // stroke over the hovered side. Display-only objects, torn down whole on
  // every change — a parcel has a few dozen vertices, so rebuild is cheap and
  // there is no incremental state to get wrong.
  const fittedRingRef = React.useRef<LatLng[] | LatLng[][] | null>(null);
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps) return;
    // Every lot of the property, not just the subject one: a house bought as two
    // adjoining deeds has two rings, and drawing one of them is drawing half the
    // land the fence goes round.
    const all = (parcel?.rings ?? (parcel?.ring ? [parcel.ring] : [])).filter((r) => r.length >= 3);
    if (!all.length) return;

    const ACCENT = accentRef.current ?? DEFAULT_ACCENT;
    const polygons: GMaps[] = all.map(
      (r) =>
        new maps.Polygon({
          map,
          paths: r,
          clickable: false,
          fillColor: ACCENT,
          fillOpacity: 0.14,
          strokeColor: PARCEL_BLUE,
          strokeOpacity: 0.95,
          strokeWeight: 2,
          zIndex: 1,
        }),
    );

    let highlightLine: GMaps | null = null;
    const hi = parcel?.highlight;
    if (hi && hi.length >= 2) {
      highlightLine = new maps.Polyline({
        map,
        path: hi,
        clickable: false,
        strokeColor: ACCENT,
        strokeOpacity: 1,
        strokeWeight: 5,
        zIndex: 2,
      });
    }

    // A NEW ring (not a hover change) gets the camera: fit the lot once so a
    // large parcel is not half off-screen at the address zoom. LatLngBounds is
    // a core class — read off the global namespace the loader has populated.
    const g = (window as unknown as { google?: GMaps }).google;
    const fitKey = parcel?.rings ?? parcel?.ring ?? null;
    if (fittedRingRef.current !== fitKey && g?.maps?.LatLngBounds) {
      fittedRingRef.current = fitKey;
      const b = new g.maps.LatLngBounds();
      for (const r of all) for (const p of r) b.extend(p);
      map.fitBounds(b, 48);
    }

    return () => {
      polygons.forEach((p) => p.setMap(null));
      highlightLine?.setMap(null);
    };
  }, [parcel, mapEpoch]);

  // ── Parcel boundary tiles ──────────────────────────────────────────────────
  // ReportAll's raster line-work for EVERY parcel in view, through the
  // /api/parcel-tiles proxy (separate ALLTIME tile quota; the key stays on the
  // server). Sits under the polygon and the trace.
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps || !parcelTiles) return;
    // Size is a core class — global namespace, same reasoning as LatLngBounds.
    const g = (window as unknown as { google?: GMaps }).google;
    if (!g?.maps?.Size) return;
    const layer = new maps.ImageMapType({
      getTileUrl: (coord: { x: number; y: number }, zoom: number) =>
        zoom >= 14 && zoom <= 21 ? `/api/parcel-tiles/${zoom}/${coord.x}/${coord.y}` : null,
      tileSize: new g.maps.Size(256, 256),
      opacity: 0.85,
      name: "Parcels",
    });
    map.overlayMapTypes.push(layer);
    return () => {
      const idx = map.overlayMapTypes.getArray().indexOf(layer);
      if (idx >= 0) map.overlayMapTypes.removeAt(idx);
    };
  }, [parcelTiles, mapEpoch]);

  // ── Terrain overlay ────────────────────────────────────────────────────────
  // Non-level segments recoloured over the trace (amber racked / red stepped);
  // a click on the coloured line answers with the slope. Display objects torn
  // down whole on every change, same reasoning as the parcel overlay. While an
  // opening is armed the overlay goes non-clickable so the placement click
  // still reaches the map underneath.
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps || !terrain?.length) return;
    const origin: LatLng = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : DEFAULT_CENTER;
    const info = new maps.InfoWindow({ disableAutoPan: true });
    const lines: GMaps[] = [];
    for (const t of terrain) {
      const a = points[t.seg];
      const b = points[t.seg + 1];
      if (!a || !b || b.gap) continue;
      const line = new maps.Polyline({
        map,
        path: [localFeetToLatLng(origin, a), localFeetToLatLng(origin, b)],
        clickable: !armed,
        strokeColor: t.cls === "stepped" ? STEPPED_COLOR : RACKED_COLOR,
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: 3,
      });
      line.addListener("click", (e: { latLng?: GMaps }) => {
        const rise = Math.abs(t.riseFt);
        const how =
          t.cls === "stepped"
            ? `stepped — ${t.steps ?? 1} step${(t.steps ?? 1) === 1 ? "" : "s"} of ~${(t.stepDropFt ?? rise).toFixed(1)} ft`
            : "racked — panels follow the grade";
        info.setContent(
          `<div style="font:600 12px/1.5 system-ui;color:#1c1c1c">` +
            `${t.thetaDeg.toFixed(0)}° slope · rise ${rise.toFixed(1)} ft · ` +
            `${Math.round(t.gradeFt)} ft along grade<br>${how}</div>`,
        );
        if (e.latLng) info.setPosition(e.latLng);
        info.open({ map });
      });
      lines.push(line);
    }
    return () => {
      info.close();
      lines.forEach((l) => l.setMap(null));
    };
  }, [terrain, points, armed, lat, lng, mapEpoch]);

  if (!enabled) {
    // A chrome-less host renders its own empty state (the blueprint studio keeps
    // its `.map-slot` placeholder), so don't paint this one over it.
    if (!chrome) return null;
    return (
      <div className={cn("grid place-items-center text-center p-6 bg-[color:var(--paper)]", className)}>
        <div className="max-w-xs text-[12px] text-[color:var(--ink-muted)] leading-relaxed">
          Map drawing needs a Google Maps browser key. Set{" "}
          <span className="font-mono text-[11px] text-[color:var(--ink-soft)]">
            NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
          </span>{" "}
          to trace a fence over satellite imagery. The 3D sandbox and pricing still work without it.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={mountRef} className="absolute inset-0" />

      {/* Live measurement chip — positioned imperatively from map mousemove.
          `data-fdm="len"` is a STYLE HOOK, not behaviour: this chip renders even
          for a chrome-less host, so a host with its own design system (the
          blueprint Fence studio) needs one stable selector to re-skin it. The
          utility classes below stay the default look for every other host. */}
      <div
        ref={measureRef}
        data-fdm="len"
        style={{ display: "none" }}
        className="pointer-events-none absolute left-0 top-0 z-[5] rounded-full bg-[color:var(--ink)]/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white shadow-[var(--shadow-sm)] will-change-transform"
      />

      {/* Draw controls (left) */}
      {chrome && (
      <div className="absolute left-3 top-3 flex gap-1.5">
        <MapBtn
          onClick={toggleAlign}
          active={aligning}
          icon={<Move className="h-3.5 w-3.5" />}
          label={aligning ? "Aligning" : "Align"}
        />
        <MapBtn onClick={() => apiRef.current?.closeLoop()} icon={<Spline className="h-3.5 w-3.5" />} label="Close loop" />
        <MapBtn onClick={() => apiRef.current?.undo()} icon={<Undo2 className="h-3.5 w-3.5" />} label="Undo" />
        <MapBtn onClick={() => apiRef.current?.clear()} icon={<Trash2 className="h-3.5 w-3.5" />} label="Clear" />
      </div>
      )}

      {/* Add gate / door tools (right) — each opens a minimal type picker; pick a
          variant to arm it, then click the map to place. */}
      {chrome && (
      <div className="absolute right-3 top-3 flex gap-1.5">
        <OpeningPicker
          kind="gate"
          label="Gate"
          icon={<DoorOpen className="h-3.5 w-3.5" />}
          armed={armed}
          disabled={!hasFence}
          open={openMenu === "gate"}
          onOpenChange={(o) => setOpenMenu(o ? "gate" : null)}
          customOpenings={customOpenings}
          onPick={(v) => {
            onArm("gate", v);
            setOpenMenu(null);
          }}
          onDisarm={onDisarm}
        />
        <OpeningPicker
          kind="door"
          label="Door"
          icon={<DoorClosed className="h-3.5 w-3.5" />}
          armed={armed}
          disabled={!hasFence}
          open={openMenu === "door"}
          onOpenChange={(o) => setOpenMenu(o ? "door" : null)}
          customOpenings={customOpenings}
          onPick={(v) => {
            onArm("door", v);
            setOpenMenu(null);
          }}
          onDisarm={onDisarm}
        />
      </div>
      )}

      {chrome && (
      <div className="absolute inset-x-0 bottom-3 flex justify-center px-3 pointer-events-none">
        <span
          className={cn(
            "rounded-full backdrop-blur hairline px-3 py-1 text-[11px] text-center",
            armed
              ? "bg-[color:var(--accent)] text-white shadow-[var(--shadow-sm)]"
              : "bg-white/85 text-[color:var(--ink-muted)]",
          )}
        >
          {armed
            ? `Placing a ${armed.kind} — click a fence line (snaps if close, else drops free) · Esc to cancel`
            : aligning
              ? "Drag the whole outline to line it up with the lot — shape & size stay locked"
              : "Click to trace — dots magnet when close (close / connect) · right-click to stop · after stopping, click open ground to start a separate fence · right-click a dot to remove"}
        </span>
      </div>
      )}
    </div>
  );
}

function MapBtn({
  onClick,
  icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full backdrop-blur hairline px-2.5 py-1 text-[11px] font-medium shadow-[var(--shadow-sm)]",
        active
          ? "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent)]"
          : "bg-white/90 text-[color:var(--ink-soft)] hover:bg-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Prominent placement tool (lives on the map). Disabled until a fence exists.
// The Gate / Door tool: a pill that opens a minimal dropdown of opening types
// (line icon + name + width). Picking one arms it for placement; clicking the
// pill while its kind is armed cancels (same muscle memory as the old toggle).
function OpeningPicker({
  kind,
  label,
  icon,
  armed,
  disabled,
  open,
  onOpenChange,
  customOpenings,
  onPick,
  onDisarm,
}: {
  kind: OpeningKind;
  label: string;
  icon: React.ReactNode;
  armed: ArmedOpening | null;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customOpenings: CustomOpening[];
  onPick: (variant: string) => void;
  onDisarm: () => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Outside click / Esc closes the menu (listeners only while open).
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const isArmed = armed?.kind === kind;
  const builtIns = kind === "gate" ? GATE_VARIANTS : DOOR_VARIANTS;
  const customs = customOpenings.filter((o) => o.kind === kind);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          if (isArmed) {
            onDisarm();
            onOpenChange(false);
          } else {
            onOpenChange(!open);
          }
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? "Draw a fence first" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-semibold shadow-[var(--shadow-sm)] transition-colors",
          disabled
            ? "bg-white/70 text-[color:var(--ink-faint)] cursor-not-allowed"
            : isArmed
              ? "bg-[color:var(--accent)] text-white"
              : "bg-white/95 text-[color:var(--accent-ink)] hover:bg-white",
        )}
      >
        {icon}
        {isArmed ? "Placing…" : label}
        {!isArmed && (
          <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[176px] overflow-hidden rounded-[var(--r-md)] bg-white/95 backdrop-blur hairline shadow-[var(--shadow-md)]"
        >
          {builtIns.map((v) => (
            <PickerRow
              key={v}
              name={VARIANT_LABEL[v] ?? v}
              widthFt={presetWidthFt(kind, v)}
              active={isArmed && armed?.variant === v}
              glyph={<VariantGlyph kind={kind} variant={v} />}
              onClick={() => onPick(v)}
            />
          ))}
          {customs.length > 0 && <div className="h-px bg-[color:var(--ink-line)]" />}
          {customs.map((o) => (
            <PickerRow
              key={o.id}
              name={o.name}
              widthFt={o.widthFt}
              active={isArmed && armed?.variant === o.id}
              glyph={<VariantGlyph kind={kind} variant="custom" />}
              onClick={() => onPick(o.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickerRow({
  name,
  widthFt,
  active,
  glyph,
  onClick,
}: {
  name: string;
  widthFt: number;
  active?: boolean;
  glyph: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-2.5 h-9 text-left text-[12px] transition-colors",
        active
          ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
          : "text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
      )}
    >
      <span className={cn(active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-muted)]")}>{glyph}</span>
      <span className="font-medium truncate">{name}</span>
      <span className="ml-auto tabular-nums text-[11px] text-[color:var(--ink-faint)]">{widthFt} ft</span>
    </button>
  );
}

// Tiny line glyphs for the opening types — gates read wide, doors narrow,
// custom types dashed. Stroke-only so they stay quiet at menu scale.
function VariantGlyph({ kind, variant }: { kind: OpeningKind; variant: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 20 15" className="h-[15px] w-5 shrink-0" aria-hidden {...common}>
      {kind === "gate" && variant === "single" && (
        <>
          <rect x="1.2" y="1.2" width="17.6" height="12.6" rx="1.2" />
          <line x1="1.2" y1="13.8" x2="18.8" y2="1.2" />
        </>
      )}
      {kind === "gate" && variant === "double" && (
        <>
          <rect x="1.2" y="1.2" width="8" height="12.6" rx="1" />
          <rect x="10.8" y="1.2" width="8" height="12.6" rx="1" />
        </>
      )}
      {kind === "gate" && variant === "triple" && (
        <>
          <rect x="1.2" y="1.2" width="5.2" height="12.6" rx="0.8" />
          <rect x="7.4" y="1.2" width="5.2" height="12.6" rx="0.8" />
          <rect x="13.6" y="1.2" width="5.2" height="12.6" rx="0.8" />
        </>
      )}
      {kind === "gate" && variant === "arched" && <path d="M1.2 13.8 V6.5 Q10 0.6 18.8 6.5 V13.8 Z" />}
      {kind === "gate" && variant === "custom" && (
        <rect x="1.2" y="1.2" width="17.6" height="12.6" rx="1.2" strokeDasharray="2.6 2.2" />
      )}
      {kind === "door" && variant === "solid" && (
        <>
          <rect x="6.2" y="1.2" width="7.6" height="12.6" rx="1" />
          <rect x="8.4" y="3.8" width="3.2" height="5.2" rx="0.6" />
        </>
      )}
      {kind === "door" && variant === "slatted" && (
        <>
          <rect x="6.2" y="1.2" width="7.6" height="12.6" rx="1" />
          <line x1="7.6" y1="5" x2="12.4" y2="5" />
          <line x1="7.6" y1="8" x2="12.4" y2="8" />
          <line x1="7.6" y1="11" x2="12.4" y2="11" />
        </>
      )}
      {kind === "door" && variant === "custom" && (
        <rect x="6.2" y="1.2" width="7.6" height="12.6" rx="1" strokeDasharray="2.6 2.2" />
      )}
    </svg>
  );
}
