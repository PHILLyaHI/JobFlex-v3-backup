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
import type { TopoOverlay } from "./fenceTopo";
import { ringAreaSqFt, ringEdges, snapToTargets, type Seg } from "./fenceHouse";
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
// Surveyed property line — FenceScan's survey style, by the owner's call
// (2026-09-15): a dashed emerald core on a heavy dark casing, a faint emerald
// tint over the lot and a dot on every corner. The casing is what keeps the
// line legible on bright driveways AND dark tree cover (the old thin blue line
// "could barely be seen"), and emerald never collides with the fence's blue,
// the contours' cream or the slope overlay's amber and red.
export interface ParcelPalette {
  /** Dashed core of the property line, and the corner dots' ring. */
  line: string;
  /** Wide dark casing under the dashes. */
  casing: string;
  /** Corner dot fill. */
  dot: string;
}
const DEFAULT_PARCEL: ParcelPalette = { line: "#4ade80", casing: "#06120a", dot: "#0d1b12" };
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
  /** Finish what is being traced: stop the fence run, or close the house outline. */
  finishDraft: () => void;
  /** Take back the last dot of the fence run or the last house corner. */
  undoDraft: () => void;
  /** Drop an unfinished house outline / stop the fence run. */
  cancelDraft: () => void;
  /** House tool on/off (the `houseMode` prop drives it). */
  setHouseMode: (on: boolean) => void;
};

/** What is being traced right now, for a host that renders its own controls. */
export interface DraftState {
  /** A fence run is following the cursor. */
  fence: boolean;
  /** Corners placed on an unfinished house outline (0 = none). */
  houseCorners: number;
}

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
  /** Host colours for the property line (Maps needs literal colour strings). */
  parcelPalette?: Partial<ParcelPalette>;
  /**
   * Measured slope per NON-LEVEL traced segment (fenceTerrain classes). Each
   * entry recolours its segment on the map — amber for racked, red for
   * stepped — and a click on the coloured line answers with the slope and the
   * rise. Level segments stay the accent colour and are not listed here.
   */
  terrain?: TerrainSegView[] | null;
  /**
   * Lot topography (fenceTopo): contour lines drawn on the land — the lot's
   * own lines strong with a dark casing so they read on grass, roof and
   * asphalt alike, the neighbours' faint — elevation labels along the lines
   * ("+4 ft" above the lot's low point), and HIGH / LOW marks. Display only:
   * nothing here is clickable, so tracing and placement clicks pass through.
   */
  topo?: TopoOverlay | null;
  /** Host colours for the topo layer (Maps needs literal colour strings). */
  topoPalette?: Partial<TopoPalette>;
  /** Padding for the one-time fit to a new lot, px — a host that lays a plate
   *  over a corner of the map passes more room on that side. Default 48. */
  fitPadding?: number | { top: number; right: number; bottom: number; left: number };
  /** Footprints found for the site (OSM / Regrid): drawn faint, and snap targets. */
  detectedBuildings?: LatLng[][];
  /** House outlines the user traced. Editable while `houseMode` is on. */
  houses?: Array<{ id: string; ring: LatLng[]; label: string }>;
  /** House tool: clicks trace a house outline instead of a fence run. */
  houseMode?: boolean;
  /** A traced outline was closed (local feet). */
  onHouseAdd?: (ring: PathPoint[]) => void;
  /** A traced outline's corner was dragged (local feet). */
  onHouseChange?: (id: string, ring: PathPoint[]) => void;
  /** Run ends fixed to a house wall — labelled on the map. */
  wallMounts?: LatLng[];
  /** What is being traced, whenever it changes. */
  onDraftChange?: (state: DraftState) => void;
};

export interface TopoPalette {
  /** Minor contour. */
  line: string;
  /** Index contour, every fifth interval. */
  major: string;
  /** The dark stroke under a lot line that separates it from the photo. */
  casing: string;
  /** Label text. */
  ink: string;
  /** Label ground. */
  paper: string;
  /** Label face — the annotation (mono) face. */
  font: string;
}

const DEFAULT_TOPO: TopoPalette = {
  line: "#fff7df",
  major: "#f3e7c2",
  casing: "#0a0a0a",
  ink: "#0a0a0a",
  paper: "rgba(242, 240, 235, 0.94)",
  font: "'JetBrains Mono', ui-monospace, monospace",
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

// Stacking, bottom to top, in one place so a new layer cannot land between two
// others by accident. Contours lie ON the lot's tint but UNDER its blue
// property line; the fence sits over the land and the line it follows; slope
// recolouring sits over the fence it describes.
const Z = {
  parcelTint: 1,
  topoCasing: 2,
  topo: 3,
  parcelGlow: 4,
  parcelCasing: 5,
  parcelLine: 6,
  house: 7,
  fence: 8,
  highlight: 9,
  terrain: 9,
  preview: 10,
  ghost: 11,
} as const;

/** One text label pinned to the ground. */
interface MapLabel {
  at: LatLng;
  text: string;
  /** Screen rotation, degrees clockwise. */
  angleDeg?: number;
  style: Partial<CSSStyleDeclaration>;
  /** Higher wins a collision. */
  priority: number;
  /** Hidden below this map zoom. */
  minZoom: number;
  /** Sit just above the point — or just below when that spot is taken —
   *  instead of on it, so a chip does not hide its line and a mark does not
   *  hide the corner it names. Contour labels belong ON their line. */
  lift?: boolean;
}

/**
 * A DOM label layer on the map (an OverlayView in the marker pane — above the
 * lines, pointer-events off, so clicks still reach the map and the fence).
 * Every redraw (pan, zoom) re-projects the labels and hides any that would
 * overlap a higher-priority one at THIS zoom, so zooming out thins the labels
 * instead of piling them up. Returns the teardown.
 */
function mountLabelLayer(maps: GMaps, map: GMaps, items: MapLabel[], zIndex: number): () => void {
  const g = (window as unknown as { google?: GMaps }).google;
  const LatLngCtor = g?.maps?.LatLng;
  if (!LatLngCtor || !items.length) return () => {};
  const nodes = [...items]
    .sort((a, b) => b.priority - a.priority)
    .map((it) => ({ it, el: null as HTMLDivElement | null, ll: new LatLngCtor(it.at.lat, it.at.lng), w: 0, h: 0 }));
  const layer = new maps.OverlayView();
  let host: HTMLDivElement | null = null;
  layer.onAdd = () => {
    host = document.createElement("div");
    host.style.cssText = `position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:${zIndex}`;
    for (const n of nodes) {
      const el = document.createElement("div");
      el.textContent = n.it.text;
      Object.assign(
        el.style,
        { position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", transformOrigin: "0 0", pointerEvents: "none" },
        n.it.style,
      );
      host.appendChild(el);
      n.el = el;
    }
    layer.getPanes()?.markerLayer?.appendChild(host);
  };
  layer.draw = () => {
    const proj = layer.getProjection();
    if (!proj || !host) return;
    const zoom = Number(map.getZoom()) || 0;
    const taken: Array<[number, number, number, number]> = [];
    for (const n of nodes) {
      const el = n.el;
      if (!el) continue;
      const px = proj.fromLatLngToDivPixel(n.ll);
      if (!px || zoom < n.it.minZoom) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      if (!n.w) {
        n.w = el.offsetWidth;
        n.h = el.offsetHeight;
      }
      const deg = n.it.angleDeg ?? 0;
      const a = (deg * Math.PI) / 180;
      const bw = Math.abs(n.w * Math.cos(a)) + Math.abs(n.h * Math.sin(a));
      const bh = Math.abs(n.w * Math.sin(a)) + Math.abs(n.h * Math.cos(a));
      const off = bh / 2 + 10;
      const tries = n.it.lift ? [-off, off] : [0];
      let placedAt: number | null = null;
      for (const dy of tries) {
        const cy = px.y + dy;
        const box: [number, number, number, number] = [px.x - bw / 2 - 3, cy - bh / 2 - 3, px.x + bw / 2 + 3, cy + bh / 2 + 3];
        if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
        taken.push(box);
        placedAt = cy;
        break;
      }
      if (placedAt === null) {
        el.style.display = "none";
        continue;
      }
      el.style.transform = `translate(${px.x}px, ${placedAt}px) rotate(${deg}deg) translate(-50%, -50%)`;
    }
  };
  layer.onRemove = () => {
    host?.remove();
    host = null;
  };
  layer.setMap(map);
  return () => layer.setMap(null);
}

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
  topo = null,
  topoPalette,
  fitPadding = 48,
  parcelPalette,
  detectedBuildings,
  houses,
  houseMode = false,
  onHouseAdd,
  onHouseChange,
  wallMounts,
  onDraftChange,
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
  const topoPaletteRef = React.useRef(topoPalette);
  const fitPaddingRef = React.useRef(fitPadding);
  const parcelPaletteRef = React.useRef(parcelPalette);
  const onHouseAddRef = React.useRef(onHouseAdd);
  const onHouseChangeRef = React.useRef(onHouseChange);
  const onDraftChangeRef = React.useRef(onDraftChange);
  const houseModeRef = React.useRef(houseMode);
  /** The draw surface's pointer handlers, for overlays that sit on top of it. */
  const drawHandlersRef = React.useRef<{
    click: (e: GMaps) => void;
    move: (e: GMaps) => void;
    dblclick: () => void;
    rightclick: () => void;
  } | null>(null);
  // Snap targets from the site (lot lines, traced houses, detected buildings),
  // read by the draw handlers at event time — the build effect never re-runs
  // for them.
  const siteRef = React.useRef<{ parcel: FenceDrawMapProps["parcel"]; houses: FenceDrawMapProps["houses"]; detected: LatLng[][] | undefined }>({
    parcel,
    houses,
    detected: detectedBuildings,
  });
  React.useEffect(() => {
    onDropRef.current = onDropOpening;
    onUpdateGateRef.current = onUpdateGate;
    onDisarmRef.current = onDisarm;
    onApiRef.current = onApi;
    chromeRef.current = chrome;
    accentRef.current = accentColor;
    doorRef.current = doorColor;
    topoPaletteRef.current = topoPalette;
    fitPaddingRef.current = fitPadding;
    parcelPaletteRef.current = parcelPalette;
    onHouseAddRef.current = onHouseAdd;
    onHouseChangeRef.current = onHouseChange;
    onDraftChangeRef.current = onDraftChange;
    siteRef.current = { parcel, houses, detected: detectedBuildings };
  });

  const apiRef = React.useRef<FenceDrawMapApi | null>(null);
  const fittedRingRef = React.useRef<string | null>(null);

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

  React.useEffect(() => {
    houseModeRef.current = houseMode;
    apiRef.current?.setHouseMode(houseMode);
  }, [houseMode, mapEpoch]);

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
          // A double-click FINISHES a run or an outline here (FenceScan's
          // gesture); Google's own double-click zoom would fight it.
          disableDoubleClickZoom: true,
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
          zIndex: Z.preview,
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

        // ── Site snapping ──
        // After the fence's own dots: property-line and house CORNERS within
        // the magnet radius, then anywhere ALONG a house wall, a lot line or
        // another run within a tighter one. Targets are rebuilt only when the
        // site props change identity.
        const EDGE_PX = 9;
        let siteKey: unknown[] = [];
        let siteCorners: PathPoint[] = [];
        let siteEdges: Seg[] = [];
        const siteTargets = () => {
          const cur = siteRef.current;
          const key = [cur.parcel, cur.houses, cur.detected];
          if (key.some((k, i) => k !== siteKey[i])) {
            siteKey = key;
            const rings: PathPoint[][] = [];
            const lots = cur.parcel?.rings ?? (cur.parcel?.ring ? [cur.parcel.ring] : []);
            for (const r of lots) rings.push(r.map((q) => latLngToLocalFeet(origin, q)));
            for (const h of cur.houses ?? []) rings.push(h.ring.map((q) => latLngToLocalFeet(origin, q)));
            for (const b of cur.detected ?? []) rings.push(b.map((q) => latLngToLocalFeet(origin, q)));
            const usable = rings.filter((r) => r.length >= 3);
            siteCorners = usable.flat();
            siteEdges = usable.flatMap((r) => ringEdges(r));
          }
          return { corners: siteCorners, edges: siteEdges };
        };
        /** Segments of the traced fence a new dot may land on — every run's
         *  segments except the one the cursor is extending from. */
        const runEdges = (): Seg[] => {
          const out: Seg[] = [];
          runs.forEach((r, ri) => {
            const pa = r.line.getPath();
            const n = pa.getLength();
            for (let j = 1; j < n; j++) {
              if (drawing && ri === activeIdx && j === n - 1) continue;
              out.push([ll2ft(pa.getAt(j - 1)), ll2ft(pa.getAt(j))]);
            }
          });
          return out;
        };
        type SiteSnap = { kind: "corner" | "edge"; ll: GMaps };
        const snapSite = (ll: GMaps, withRuns: boolean): SiteSnap | null => {
          const t = siteTargets();
          const px = ftPerPx();
          const edges = withRuns ? t.edges.concat(runEdges()) : t.edges;
          const hit = snapToTargets(ll2ft(ll), t.corners, edges, MAGNET_PX * px, EDGE_PX * px);
          return hit ? { kind: hit.kind, ll: ft2ll(hit.pt) } : null;
        };
        // The lock ring: where a click will actually land.
        const snapRing = new Marker({
          map,
          clickable: false,
          visible: false,
          zIndex: 28,
          icon: { path: 0, scale: 8, fillColor: "#ffffff", fillOpacity: 0.25, strokeColor: ACCENT, strokeWeight: 2.5 },
        });
        const showRing = (ll: GMaps | null) => {
          if (ll) {
            snapRing.setPosition(ll);
            snapRing.setVisible(true);
          } else snapRing.setVisible(false);
        };

        // ── House outline being traced (House tool) ──
        const houseDraft: GMaps[] = [];
        const houseLine = new maps.Polyline({
          map,
          clickable: false,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 2.5, scale: 3 },
              offset: "0",
              repeat: "11px",
            },
          ],
          path: [],
          zIndex: Z.preview,
        });
        const houseDots: GMaps[] = [];
        const paintHouseDraft = (cursor: GMaps | null) => {
          const path = cursor ? [...houseDraft, cursor] : [...houseDraft];
          houseLine.setPath(path);
          while (houseDots.length > houseDraft.length) houseDots.pop()?.setMap(null);
          houseDraft.forEach((ll, i) => {
            const closable = i === 0 && houseDraft.length >= 3;
            const icon = {
              path: 0,
              scale: closable ? 7 : 4,
              fillColor: closable ? ACCENT : "#ffffff",
              fillOpacity: 1,
              strokeColor: "#0a0a0a",
              strokeWeight: 1.5,
            };
            if (!houseDots[i]) houseDots[i] = new Marker({ map, clickable: false, zIndex: 27, position: ll, icon });
            else {
              houseDots[i].setPosition(ll);
              houseDots[i].setIcon(icon);
            }
          });
        };
        let lastDraft = "false:0";
        const notifyDraft = () => {
          const key = `${drawing}:${houseDraft.length}`;
          if (key === lastDraft) return;
          lastDraft = key;
          onDraftChangeRef.current?.({ fence: drawing, houseCorners: houseDraft.length });
        };
        const closeHouse = () => {
          if (houseDraft.length >= 3) onHouseAddRef.current?.(houseDraft.map((ll) => ll2ft(ll)));
          houseDraft.length = 0;
          paintHouseDraft(null);
          notifyDraft();
        };
        const cancelHouse = () => {
          houseDraft.length = 0;
          paintHouseDraft(null);
          notifyDraft();
        };

        // Dragged vertex magnets onto any nearby vertex (its own run or another —
        // that's the "drag a dot onto another to join" affordance).
        const onVertexDragged = (run: Run, index: number, prev?: GMaps) => {
          // Align moves the whole outline: every vertex fires `set_at`, and
          // snapping any of them would bend the shape the mode promises to keep.
          if (!snapping && !aligningRef.current) {
            const pa = run.line.getPath();
            const m = ll2ft(pa.getAt(index));
            const was = prev ? ll2ft(prev) : null;
            // A dot dragged OFF a target (a corner the fence was laid on, a dot
            // it was joined to) must not be pulled straight back onto it.
            const startedOn = (q: PathPoint) => !!was && Math.hypot(was.x - q.x, was.y - q.y) <= snapFt();
            outer: for (const r of runs) {
              const p2 = r.line.getPath();
              const n = p2.getLength();
              for (let j = 0; j < n; j++) {
                if (r === run && j === index) continue;
                const f = ll2ft(p2.getAt(j));
                if (Math.hypot(m.x - f.x, m.y - f.y) <= snapFt() && !startedOn(f)) {
                  snapping = true;
                  pa.setAt(index, p2.getAt(j));
                  snapping = false;
                  commit();
                  return;
                }
              }
            }
            // No dot in reach: a lot or house corner, or a house wall / lot line.
            const t = siteTargets();
            const hit = snapToTargets(m, t.corners, t.edges, snapFt(), snapFt());
            if (hit && hit.d > 1e-3 && !startedOn(hit.pt)) {
              snapping = true;
              pa.setAt(index, ft2ll(hit.pt));
              snapping = false;
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
            notifyDraft();
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
            zIndex: Z.fence,
          });
          const run: Run = { line, listeners: [] };
          const pa = line.getPath();
          run.listeners.push(
            pa.addListener("set_at", (i: number, prev: GMaps) => onVertexDragged(run, i, prev)),
            pa.addListener("insert_at", commit),
            pa.addListener("remove_at", commit),
            line.addListener("dragend", commit),
            // Polylines swallow the map's mousemove when hovered — without this the
            // rubber band froze the moment the cursor neared a dot. (fix: same handler)
            line.addListener("mousemove", (e: GMaps) => onMove(e)),
            line.addListener("click", (e: GMaps) => onVertexClick(run, e)),
            line.addListener("rightclick", (e: GMaps) => onVertexRightclick(run, e)),
            // A double-click that lands on a line still finishes the run / outline.
            line.addListener("dblclick", () => onDoubleClick()),
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
          notifyDraft();
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
          notifyDraft();
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
          zIndex: Z.ghost,
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
          if (houseModeRef.current && !busy) {
            previewLine.setPath([]);
            hideGhost();
            const first = houseDraft[0];
            const closing = !!first && houseDraft.length >= 3 && distFt(first, at) <= magnetFt();
            const sn = closing ? null : snapSite(at, false);
            const cur = closing ? first : sn ? sn.ll : at;
            showRing(closing || sn ? cur : null);
            paintHouseDraft(houseDraft.length ? cur : null);
            if (measureEl) {
              const rect = mountRef.current?.getBoundingClientRect();
              const dom = e.domEvent as MouseEvent | undefined;
              if (rect && dom) {
                const dx = (dom.clientX - rect.left) / hostZoom + 14;
                const dy = (dom.clientY - rect.top) / hostZoom + 14;
                measureEl.style.transform = `translate(${dx}px, ${dy}px)`;
              }
              measureEl.style.display = "block";
              const last = houseDraft[houseDraft.length - 1];
              measureEl.textContent = closing
                ? "Click to close the outline"
                : last
                  ? `${Math.round(distFt(last, cur))} ft wall · click the next corner`
                  : "Click a corner of the house";
            }
            return;
          }
          // Endpoint magnet: within the pixel radius the cursor locks to the
          // nearest dot (and unlocks the moment it leaves the radius); failing
          // that, a lot or house corner, or a point along a wall or a line.
          const mag = busy ? null : magnetVertex(at, magnetFt());
          const site = busy || mag ? null : snapSite(at, true);
          const cursorLL = mag ? mag.ll : site ? site.ll : at;
          showRing(mag || site ? cursorLL : null);
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
            } else if (site) {
              hint = site.kind === "corner" ? " · on the corner" : " · on the line";
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
          showRing(null);
          if (houseModeRef.current) paintHouseDraft(null);
          hideGhost();
        };

        const stopTrace = () => {
          drawing = false;
          previewLine.setPath([]);
          notifyDraft();
        };

        // Click on an existing dot (fires on the run's polyline, not the map).
        const onVertexClick = (run: Run, e: GMaps) => {
          if (houseModeRef.current) {
            // The house tool owns clicks — a click that lands on a fence dot
            // still places a house corner there.
            const at = trueLL(e);
            if (at) houseClick(at);
            return;
          }
          if (e.vertex == null) {
            // The line itself, not a dot: the same as a click on the ground
            // there — starts a branch from the middle of a run, drops an
            // armed opening, or adds a dot to the run being traced.
            onMapClick(e);
            return;
          }
          if (aligningRef.current || armedRef.current) return;
          const ri = runs.indexOf(run);
          const pa = run.line.getPath();
          const n = pa.getLength();
          if (!drawing) {
            // Idle: clicking an OPEN run's end dot resumes tracing that fence.
            if (!isClosedPath(pa) && e.vertex === n - 1) {
              activeIdx = ri;
              drawing = true;
              notifyDraft();
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

        /** A click while the House tool is on: a corner, or the close. */
        const houseClick = (at: GMaps) => {
          const first = houseDraft[0];
          if (first && houseDraft.length >= 3 && distFt(first, at) <= magnetFt()) {
            closeHouse();
            return;
          }
          const sn = snapSite(at, false);
          const ll = sn ? sn.ll : at;
          const last = houseDraft[houseDraft.length - 1];
          if (last && distFt(last, ll) < 3 * ftPerPx()) return; // double-click's second click
          houseDraft.push(ll);
          paintHouseDraft(null);
          notifyDraft();
        };

        const onVertexRightclick = (run: Run, e: GMaps) => {
          if (houseModeRef.current) {
            if (houseDraft.length >= 3) closeHouse();
            else cancelHouse();
            return;
          }
          if (e.vertex != null) {
            const pa = run.line.getPath();
            pa.removeAt(e.vertex);
            if (pa.getLength() === 0) destroyRun(run);
            commit();
          }
          stopTrace();
        };

        /** A click on open ground — or on a run's LINE away from its dots,
         *  which Google delivers to the polyline instead of the map. */
        const onMapClick = (e: GMaps) => {
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
            if (houseModeRef.current) {
              houseClick(at);
              return;
            }
            const mag = magnetVertex(at, magnetFt());
            const site = mag ? null : snapSite(at, true);
            const place = site ? site.ll : at;
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
              // The second click of a double-click lands where the first did —
              // one dot, then the dblclick finishes the run.
              const last = ap.getLength() ? ap.getAt(ap.getLength() - 1) : null;
              if (last && distFt(last, place) < 3 * ftPerPx()) return;
              ap.push(place);
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
                notifyDraft();
                return;
              }
              startRun(mp.getAt(mag.vi));
              return;
            }
            startRun(place);
          };

        function onDoubleClick() {
          if (houseModeRef.current) {
            if (houseDraft.length >= 3) closeHouse();
            return;
          }
          stopTrace();
        }
        function onRightClick() {
          if (houseModeRef.current) {
            // Close an outline that can close; otherwise drop it.
            if (houseDraft.length >= 3) closeHouse();
            else cancelHouse();
            return;
          }
          // Right-click away from a vertex: just stop the run from following the cursor.
          stopTrace();
        }

        const listeners = [
          map.addListener("mousemove", onMove),
          map.addListener("mouseout", hideMeasure),
          map.addListener("click", (e: GMaps) => onMapClick(e)),
          map.addListener("dblclick", () => onDoubleClick()),
          map.addListener("rightclick", () => onRightClick()),
        ];
        // Traced houses are clickable while the House tool edits them; their
        // events are the draw surface's too (see the buildings effect).
        drawHandlersRef.current = { click: onMapClick, move: onMove, dblclick: onDoubleClick, rightclick: onRightClick };

        const onKey = (ev: KeyboardEvent) => {
          if (ev.key === "Escape" && armedRef.current) {
            onDisarmRef.current();
            return;
          }
          // Drafting keys belong to the surface: not while it is hidden (the 3D
          // panel), and not while focus sits on a field or a button — Enter on a
          // focused "Cancel" is that button's, not "close the outline".
          const mount = mountRef.current;
          if (!mount || mount.offsetParent === null) return;
          const el = document.activeElement as HTMLElement | null;
          const onControl =
            !!el && el !== document.body && !mount.contains(el) &&
            (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName));
          if (onControl) return;
          if (ev.key === "Escape") {
            if (houseDraft.length) cancelHouse();
            else stopTrace();
            return;
          }
          if (ev.key === "Enter") {
            if (houseDraft.length >= 3) closeHouse();
            else if (drawing) stopTrace();
            return;
          }
          if (ev.key === "Backspace" || ev.key === "Delete") {
            if (houseDraft.length) {
              ev.preventDefault();
              houseDraft.pop();
              paintHouseDraft(null);
              notifyDraft();
            } else if (drawing) {
              ev.preventDefault();
              apiRef.current?.undo();
            }
          }
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
              if (!drawing) notifyDraft();
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
          finishDraft: () => {
            if (houseDraft.length >= 3) closeHouse();
            else stopTrace();
          },
          undoDraft: () => {
            if (houseDraft.length) {
              houseDraft.pop();
              paintHouseDraft(null);
              notifyDraft();
            } else if (drawing) apiRef.current?.undo();
          },
          cancelDraft: () => {
            if (houseDraft.length) cancelHouse();
            else stopTrace();
          },
          setHouseMode: (on: boolean) => {
            houseModeRef.current = on;
            if (!on && houseDraft.length) cancelHouse();
            if (on) stopTrace();
            showRing(null);
            previewLine.setPath([]);
            map.setOptions({ draggableCursor: aligningRef.current ? "move" : "crosshair" });
          },
        };

        seedRuns();
        renderOpenings();
        onApiRef.current?.(apiRef.current);
        gmapRef.current = map;
        mapsLibRef.current = maps;
        fittedRingRef.current = null; // a new map has not been fitted to anything
        setMapEpoch((e) => e + 1);

        cleanup = () => {
          onApiRef.current?.(null);
          onDraftChangeRef.current?.({ fence: false, houseCorners: 0 });
          drawHandlersRef.current = null;
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
          snapRing.setMap(null);
          houseLine.setMap(null);
          houseDots.forEach((d) => d.setMap(null));
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
    const pal: ParcelPalette = { ...DEFAULT_PARCEL, ...(parcelPaletteRef.current ?? {}) };
    const g0 = (window as unknown as { google?: GMaps }).google;
    // Maps cannot dash a polygon edge, so the line is a closed POLYLINE whose
    // stroke is a repeated symbol: a 14 px dash every 22 px, FenceScan's
    // "14 8" pattern. The glow under it stands in for FenceScan's drop-shadow.
    const dashes = (color: string, weight: number, opacity: number) => [
      {
        icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, scale: 7 },
        offset: "0",
        repeat: "22px",
      },
    ];
    const polygons: GMaps[] = all.flatMap((r) => {
      const closed = [...r, r[0]];
      return [
        new maps.Polygon({
          map,
          paths: r,
          clickable: false,
          fillColor: pal.line,
          fillOpacity: 0.07,
          strokeOpacity: 0,
          zIndex: Z.parcelTint,
        }),
        new maps.Polyline({
          map,
          path: closed,
          clickable: false,
          strokeColor: pal.line,
          strokeOpacity: 0.2,
          strokeWeight: 11,
          zIndex: Z.parcelGlow,
        }),
        new maps.Polyline({
          map,
          path: closed,
          clickable: false,
          strokeOpacity: 0,
          icons: dashes(pal.casing, 8, 0.85),
          zIndex: Z.parcelCasing,
        }),
        new maps.Polyline({
          map,
          path: closed,
          clickable: false,
          strokeOpacity: 0,
          icons: dashes(pal.line, 3.5, 1),
          zIndex: Z.parcelLine,
        }),
        // Corner dots pin the vertices a run snaps to.
        ...(g0?.maps?.SymbolPath
          ? r.map(
              (p) =>
                new g0.maps.Marker({
                  map,
                  position: p,
                  clickable: false,
                  zIndex: 1,
                  icon: {
                    path: g0.maps.SymbolPath.CIRCLE,
                    scale: 4,
                    fillColor: pal.dot,
                    fillOpacity: 1,
                    strokeColor: pal.line,
                    strokeWeight: 2.2,
                  },
                }),
            )
          : []),
      ];
    });

    let highlightLine: GMaps | null = null;
    const hi = parcel?.highlight;
    if (hi && hi.length >= 2) {
      highlightLine = new maps.Polyline({
        map,
        path: hi,
        clickable: false,
        strokeColor: ACCENT,
        strokeOpacity: 1,
        strokeWeight: 6,
        zIndex: Z.highlight,
      });
    }

    // A NEW ring (not a hover change) gets the camera: fit the lot once so a
    // large parcel is not half off-screen at the address zoom. LatLngBounds is
    // a core class — read off the global namespace the loader has populated.
    const g = (window as unknown as { google?: GMaps }).google;
    // Keyed by the GEOMETRY: a host that rebuilds the prop object on every
    // update (hover, trace commit) must not yank the camera back to the lot.
    const fitKey = all.map((r) => `${r.length}:${r[0].lat.toFixed(6)},${r[0].lng.toFixed(6)}`).join("|");
    if (fittedRingRef.current !== fitKey && g?.maps?.LatLngBounds) {
      fittedRingRef.current = fitKey;
      const b = new g.maps.LatLngBounds();
      for (const r of all) for (const p of r) b.extend(p);
      map.fitBounds(b, fitPaddingRef.current);
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

  // ── Buildings: detected footprints (faint) and traced houses ───────────────
  // A traced house is inked like a drawing — white wall line on a dark casing
  // over a dark tint — and while the House tool is on its corners drag.
  // Detected footprints are context: a thin line so the contractor can see
  // what the 3D will stand up, and what the snapping will catch.
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps) return;
    const objs: GMaps[] = [];
    const listeners: GMaps[] = [];
    const origin: LatLng = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : DEFAULT_CENTER;
    for (const ring of detectedBuildings ?? []) {
      if (ring.length < 3) continue;
      objs.push(
        new maps.Polygon({
          map,
          paths: ring,
          clickable: false,
          fillColor: "#0a0a0a",
          fillOpacity: 0.12,
          strokeColor: "#ffffff",
          strokeOpacity: 0.55,
          strokeWeight: 1.2,
          zIndex: Z.house,
        }),
      );
    }
    for (const h of houses ?? []) {
      if (h.ring.length < 3) continue;
      objs.push(
        new maps.Polyline({
          map,
          path: [...h.ring, h.ring[0]],
          clickable: false,
          strokeColor: "#0a0a0a",
          strokeOpacity: 0.6,
          strokeWeight: 6,
          zIndex: Z.house,
        }),
      );
      const poly = new maps.Polygon({
        map,
        paths: h.ring,
        clickable: houseMode,
        editable: houseMode,
        fillColor: "#0a0a0a",
        fillOpacity: 0.3,
        strokeColor: "#ffffff",
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        zIndex: Z.house,
      });
      objs.push(poly);
      if (houseMode) {
        // Clickable (to edit) means the polygon takes the pointer: pass clicks,
        // moves and finishing gestures on, so a garage traced against this
        // house's wall snaps and draws like anywhere else. A drag on a corner
        // handle is Google's own and is not a click on the surface.
        listeners.push(
          poly.addListener("click", (e: GMaps) => {
            if (e?.vertex == null) drawHandlersRef.current?.click(e);
          }),
          poly.addListener("mousemove", (e: GMaps) => drawHandlersRef.current?.move(e)),
          poly.addListener("dblclick", () => drawHandlersRef.current?.dblclick()),
          poly.addListener("rightclick", (e: GMaps) => {
            if (e?.vertex == null) drawHandlersRef.current?.rightclick();
          }),
        );
        const path = poly.getPath();
        const changed = () =>
          onHouseChangeRef.current?.(
            h.id,
            path.getArray().map((ll: GMaps) => latLngToLocalFeet(origin, { lat: ll.lat(), lng: ll.lng() })),
          );
        listeners.push(path.addListener("set_at", changed), path.addListener("insert_at", changed), path.addListener("remove_at", changed));
      }
    }
    return () => {
      listeners.forEach((l) => l?.remove?.());
      objs.forEach((o) => o.setMap(null));
    };
  }, [houses, detectedBuildings, houseMode, lat, lng, mapEpoch]);

  // ── Topography ─────────────────────────────────────────────────────────────
  // Contours on the land. Built whole from the host's overlay, which the host
  // memoises — the object only changes when the ground, the lot or the toggle
  // does, not on every trace commit.
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps || !topo) return;
    const pal: TopoPalette = { ...DEFAULT_TOPO, ...(topoPaletteRef.current ?? {}) };
    const polys: GMaps[] = [];
    for (const line of topo.lines) {
      const color = line.major ? pal.major : pal.line;
      for (const path of line.inside) {
        polys.push(
          new maps.Polyline({
            map,
            path,
            clickable: false,
            strokeColor: pal.casing,
            strokeOpacity: 0.5,
            strokeWeight: line.major ? 5 : 3.5,
            zIndex: Z.topoCasing,
          }),
          new maps.Polyline({
            map,
            path,
            clickable: false,
            strokeColor: color,
            strokeOpacity: 0.95,
            strokeWeight: line.major ? 2.5 : 1.5,
            zIndex: Z.topo,
          }),
        );
      }
      for (const path of line.outside) {
        polys.push(
          new maps.Polyline({
            map,
            path,
            clickable: false,
            strokeColor: color,
            strokeOpacity: 0.4,
            strokeWeight: line.major ? 1.8 : 1.1,
            zIndex: Z.topo,
          }),
        );
      }
    }
    return () => {
      polys.forEach((p) => p.setMap(null));
    };
  }, [topo, mapEpoch]);

  // ── Terrain overlay ────────────────────────────────────────────────────────
  // Non-level segments recoloured over the trace (amber racked / red stepped).
  // Display only: the grade, rise and class are ON the map in the segment's
  // chip (see Map labels) and in the ledger row, so a click on a sloped line
  // belongs to drawing — branching a new run off it, placing an opening —
  // instead of opening a card over the spot being traced.
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps || !terrain?.length) return;
    const origin: LatLng = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : DEFAULT_CENTER;
    const lines: GMaps[] = [];
    for (const t of terrain) {
      const a = points[t.seg];
      const b = points[t.seg + 1];
      if (!a || !b || b.gap) continue;
      lines.push(
        new maps.Polyline({
          map,
          path: [localFeetToLatLng(origin, a), localFeetToLatLng(origin, b)],
          clickable: false,
          strokeColor: t.cls === "stepped" ? STEPPED_COLOR : RACKED_COLOR,
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: Z.terrain,
        }),
      );
    }
    return () => {
      lines.forEach((l) => l.setMap(null));
    };
  }, [terrain, points, lat, lng, mapEpoch]);

  // ── Map labels ─────────────────────────────────────────────────────────────
  // Every text label on the ground in ONE layer, so a collision is settled
  // across all of them: the slope chips on the fence outrank the HIGH / LOW
  // marks, which outrank index-contour labels, which outrank the rest. Two
  // layers could not see each other, and a chip landed on the "+20 FT" mark.
  React.useEffect(() => {
    const map = gmapRef.current;
    const maps = mapsLibRef.current;
    if (!map || !maps) return;
    const pal: TopoPalette = { ...DEFAULT_TOPO, ...(topoPaletteRef.current ?? {}) };
    const origin: LatLng = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : DEFAULT_CENTER;
    const items: MapLabel[] = [];
    // Every traced segment carries its length on the map; a racked or stepped
    // one also carries its grade, so the slope stays ON the map and not only
    // behind a click.
    const slopeBySeg = new Map((terrain ?? []).map((t) => [t.seg, t]));
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (b.gap) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 4) continue;
      const t = slopeBySeg.get(i);
      const at = localFeetToLatLng(origin, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      if (t) {
        const color = t.cls === "stepped" ? STEPPED_COLOR : RACKED_COLOR;
        const pct = Math.round(Math.tan((t.thetaDeg * Math.PI) / 180) * 100);
        const how = t.cls === "stepped" ? `${t.steps ?? 1} STEPS` : "RACKED";
        items.push({
          at,
          text: `${Math.round(len)} FT · ${pct}% · ${how}`,
          priority: 5,
          minZoom: 16,
          lift: true,
          style: {
            font: `700 10.5px/16px ${pal.font}`,
            color,
            background: "#ffffff",
            border: `2px solid ${color}`,
            borderRadius: "2px",
            padding: "0 6px",
            letterSpacing: "0.04em",
          },
        });
      } else {
        items.push({
          at,
          text: `${Math.round(len)} FT`,
          priority: 4,
          minZoom: 17,
          lift: true,
          style: {
            font: `700 10px/15px ${pal.font}`,
            color: pal.ink,
            background: "#ffffff",
            border: `1.5px solid ${pal.ink}`,
            borderRadius: "2px",
            padding: "0 5px",
            letterSpacing: "0.04em",
          },
        });
      }
    }
    for (const m of wallMounts ?? []) {
      items.push({
        at: m,
        text: "WALL MOUNT",
        priority: 4.5,
        minZoom: 17,
        lift: true,
        style: {
          font: `800 9.5px/14px ${pal.font}`,
          color: "#ffffff",
          background: pal.ink,
          padding: "1px 5px",
          borderRadius: "2px",
          letterSpacing: "0.08em",
        },
      });
    }
    for (const h of houses ?? []) {
      if (h.ring.length < 3) continue;
      const ft = h.ring.map((q) => latLngToLocalFeet(origin, q));
      let cx = 0;
      let cy = 0;
      for (const q of ft) {
        cx += q.x / ft.length;
        cy += q.y / ft.length;
      }
      items.push({
        at: localFeetToLatLng(origin, { x: cx, y: cy }),
        text: `${h.label.toUpperCase()} · ${Math.round(ringAreaSqFt(ft)).toLocaleString("en-US")} SQ FT`,
        priority: 3,
        minZoom: 17,
        style: {
          font: `800 9.5px/14px ${pal.font}`,
          color: pal.ink,
          background: pal.paper,
          border: `1.5px solid ${pal.ink}`,
          padding: "0 5px",
          borderRadius: "2px",
          letterSpacing: "0.08em",
        },
      });
    }
    for (const m of topo?.marks ?? []) {
      items.push({
        at: m.at,
        text: (m.kind === "high" ? "▲ " : "▼ ") + m.text.toUpperCase(),
        priority: 3,
        minZoom: 15,
        lift: true,
        style: {
          font: `700 10px/15px ${pal.font}`,
          color: "#ffffff",
          background: pal.ink,
          padding: "1px 6px",
          borderRadius: "2px",
          letterSpacing: "0.06em",
          boxShadow: `2px 2px 0 ${pal.paper}`,
        },
      });
    }
    for (const l of topo?.labels ?? []) {
      items.push({
        at: l.at,
        text: l.text,
        angleDeg: l.angleDeg,
        priority: l.major ? 2 : 1,
        minZoom: 17,
        style: {
          font: `${l.major ? 800 : 600} 10px/14px ${pal.font}`,
          color: pal.ink,
          background: pal.paper,
          border: l.major ? `1.5px solid ${pal.ink}` : "1px solid rgba(10, 10, 10, 0.45)",
          borderRadius: "2px",
          padding: "0 4px",
          letterSpacing: "0.02em",
        },
      });
    }
    return mountLabelLayer(maps, map, items, 1);
  }, [topo, terrain, points, houses, wallMounts, lat, lng, mapEpoch]);

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
