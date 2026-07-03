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
import { Move, Spline, Trash2, Undo2, DoorOpen, DoorClosed } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadMapsLibrary, isMapsBrowserEnabled } from "@/lib/googleMaps";
import {
  pathToFeet,
  pathToLatLng,
  latLngToLocalFeet,
  localFeetToLatLng,
  type LatLng,
} from "./mapProjection";
import type { PathPoint, GateSpec, OpeningKind } from "./fenceTypes";
import type { ArmedOpening } from "@/stores/useFenceStudioStore";

const ACCENT = "#1f7a52"; // Pressed Sage (locked accent) for the drawn line
const DOOR_INK = "#5a6473"; // cool-ink-muted — doors read neutral vs the sage gate
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

export function FenceDrawMap({
  lat,
  lng,
  points,
  onChange,
  revision,
  className,
  gates,
  armed,
  onArm,
  onDropOpening,
  onUpdateGate,
  onDisarm,
}: {
  lat?: number;
  lng?: number;
  points: PathPoint[];
  onChange: (pts: PathPoint[]) => void;
  revision?: number; // bump to re-seed the polyline from `points` (parcel load / reset)
  className?: string;
  gates: GateSpec[];
  armed: ArmedOpening | null;
  onArm: (kind: OpeningKind, variant: string) => void; // Add gate/door tools (on the map)
  onDropOpening: (segmentIndex: number, t: number, x?: number, y?: number) => void;
  onUpdateGate: (id: string, patch: Partial<GateSpec>) => void; // marker drag → move/resize
  onDisarm: () => void; // Esc / click-in-empty cancels the armed tool
}) {
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
  }, [armed]);
  const onDropRef = React.useRef(onDropOpening);
  const onUpdateGateRef = React.useRef(onUpdateGate);
  const onDisarmRef = React.useRef(onDisarm);
  React.useEffect(() => {
    onDropRef.current = onDropOpening;
    onUpdateGateRef.current = onUpdateGate;
    onDisarmRef.current = onDisarm;
  });

  const apiRef = React.useRef<{
    clear: () => void;
    closeLoop: () => void;
    undo: () => void;
    setFromPoints: () => void;
    setAlign: (on: boolean) => void;
    syncOpenings: () => void;
    refreshCursor: () => void;
  } | null>(null);

  const [aligning, setAligning] = React.useState(false);
  const aligningRef = React.useRef(false);
  const toggleAlign = React.useCallback(() => {
    const next = !aligningRef.current;
    aligningRef.current = next;
    setAligning(next);
    apiRef.current?.setAlign(next);
    apiRef.current?.refreshCursor();
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
        // No address yet → open on a real sample lot so the surface is never blank.
        const origin: LatLng = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : DEFAULT_CENTER;
        const map = new maps.Map(mountRef.current, {
          center: origin,
          zoom: 20,
          mapTypeId: "satellite",
          tilt: 0,
          gestureHandling: "greedy",
          disableDefaultUI: true,
          zoomControl: true,
          keyboardShortcuts: false,
          draggableCursor: "crosshair", // signal "you can draw here"
        });
        const polyline = new maps.Polyline({
          map,
          editable: true,
          path: pathToLatLng(origin, pointsRef.current),
          strokeColor: ACCENT,
          strokeWeight: 3,
          strokeOpacity: 1,
        });
        if (aligningRef.current) polyline.setOptions({ draggable: true, editable: false });
        const path = polyline.getPath();

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
        const commit = () => {
          if (syncing) return;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const arr: LatLng[] = [];
            path.forEach((ll: GMaps) => arr.push({ lat: ll.lat(), lng: ll.lng() }));
            onChangeRef.current(pathToFeet(origin, arr));
          });
        };

        const SNAP_FT = 3;
        let snapping = false;
        const onSetAt = (index: number) => {
          if (!snapping && path.getLength() > 2) {
            const m = ll2ft(path.getAt(index));
            const n = path.getLength();
            for (let j = 0; j < n; j++) {
              if (j === index) continue;
              const f = ll2ft(path.getAt(j));
              if (Math.hypot(m.x - f.x, m.y - f.y) <= SNAP_FT) {
                snapping = true;
                path.setAt(index, path.getAt(j));
                snapping = false;
                break;
              }
            }
          }
          commit();
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
        const onMove = (e: GMaps) => {
          const n = path.getLength();
          if (e.latLng && !armedRef.current && !aligningRef.current && n >= 1) {
            previewLine.setPath([path.getAt(n - 1), e.latLng]);
          } else {
            previewLine.setPath([]);
          }
          if (!measureEl || !e.latLng) return;
          const rect = mountRef.current?.getBoundingClientRect();
          const dom = e.domEvent as MouseEvent | undefined;
          if (rect && dom) {
            measureEl.style.transform = `translate(${dom.clientX - rect.left + 14}px, ${dom.clientY - rect.top + 14}px)`;
          }
          measureEl.style.display = "block";
          if (armedRef.current) {
            measureEl.textContent = `Click to place a ${armedRef.current.kind}`;
            return;
          }
          if (n > 0) {
            let total = 0;
            for (let i = 1; i < n; i++) total += distFt(path.getAt(i - 1), path.getAt(i));
            const seg = distFt(path.getAt(n - 1), e.latLng);
            measureEl.textContent = `+${Math.round(seg)} ft · ${Math.round(total)} ft total`;
          } else {
            measureEl.textContent = "Click to start";
          }
        };
        const hideMeasure = () => {
          if (measureEl) measureEl.style.display = "none";
          previewLine.setPath([]);
        };

        const listeners = [
          path.addListener("set_at", onSetAt),
          path.addListener("insert_at", commit),
          path.addListener("remove_at", commit),
          map.addListener("mousemove", onMove),
          map.addListener("mouseout", hideMeasure),
          map.addListener("click", (e: GMaps) => {
            if (aligningRef.current) return;
            const a = armedRef.current;
            if (a) {
              if (!e.latLng) return;
              const p = ll2ft(e.latLng);
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
            if (e.latLng) {
              path.push(e.latLng);
              commit();
            }
          }),
          polyline.addListener("dragend", commit),
          polyline.addListener("click", (e: GMaps) => {
            if (e.vertex === 0 && path.getLength() >= 3) {
              const a = ll2ft(path.getAt(0));
              const b = ll2ft(path.getAt(path.getLength() - 1));
              if (Math.hypot(a.x - b.x, a.y - b.y) > SNAP_FT) {
                path.push(path.getAt(0));
                commit();
              }
            }
          }),
          polyline.addListener("rightclick", (e: GMaps) => {
            if (e.vertex != null && path.getLength() > 0) {
              path.removeAt(e.vertex);
              commit();
            }
          }),
        ];

        const onKey = (ev: KeyboardEvent) => {
          if (ev.key === "Escape" && armedRef.current) onDisarmRef.current();
        };
        window.addEventListener("keydown", onKey);

        apiRef.current = {
          clear: () => {
            path.clear();
            commit();
          },
          closeLoop: () => {
            const n = path.getLength();
            if (n < 3) return;
            const a = ll2ft(path.getAt(0));
            const b = ll2ft(path.getAt(n - 1));
            if (Math.hypot(a.x - b.x, a.y - b.y) > SNAP_FT) {
              path.push(path.getAt(0));
              commit();
            }
          },
          undo: () => {
            const n = path.getLength();
            if (n > 0) {
              path.removeAt(n - 1);
              commit();
            }
          },
          setFromPoints: () => {
            syncing = true;
            path.clear();
            for (const ll of pathToLatLng(origin, pointsRef.current)) {
              path.push(new LatLngCtor(ll.lat, ll.lng));
            }
            syncing = false;
            renderOpenings();
          },
          setAlign: (on: boolean) => {
            polyline.setOptions({ draggable: on, editable: !on });
          },
          syncOpenings: renderOpenings,
          refreshCursor: () => {
            map.setOptions({ draggableCursor: aligningRef.current ? "move" : "crosshair" });
          },
        };

        renderOpenings();

        cleanup = () => {
          cancelAnimationFrame(raf);
          for (const l of listeners) l?.remove?.();
          window.removeEventListener("keydown", onKey);
          for (const mk of openings.values()) removeMarker(mk);
          openings.clear();
          previewLine.setMap(null);
          polyline.setMap(null);
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

  if (!enabled) {
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

      {/* Live measurement chip — positioned imperatively from map mousemove. */}
      <div
        ref={measureRef}
        style={{ display: "none" }}
        className="pointer-events-none absolute left-0 top-0 z-[5] rounded-full bg-[color:var(--ink)]/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white shadow-[var(--shadow-sm)] will-change-transform"
      />

      {/* Draw controls (left) */}
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

      {/* Add gate / door tools (right) — live on the map, next to the drawing. */}
      <div className="absolute right-3 top-3 flex gap-1.5">
        <AddBtn
          label="Add gate"
          icon={<DoorOpen className="h-3.5 w-3.5" />}
          active={armed?.kind === "gate"}
          disabled={!hasFence}
          onClick={() => (armed?.kind === "gate" ? onDisarm() : onArm("gate", "single"))}
        />
        <AddBtn
          label="Add door"
          icon={<DoorClosed className="h-3.5 w-3.5" />}
          active={armed?.kind === "door"}
          disabled={!hasFence}
          onClick={() => (armed?.kind === "door" ? onDisarm() : onArm("door", "solid"))}
        />
      </div>

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
              : "Click to add · drag a dot onto another to join · click the first dot to close · right-click to remove"}
        </span>
      </div>
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
function AddBtn({
  onClick,
  icon,
  label,
  active,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? "Draw a fence first" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-semibold shadow-[var(--shadow-sm)] transition-colors",
        disabled
          ? "bg-white/70 text-[color:var(--ink-faint)] cursor-not-allowed"
          : active
            ? "bg-[color:var(--accent)] text-white"
            : "bg-white/95 text-[color:var(--accent-ink)] hover:bg-white",
      )}
    >
      {icon}
      {active ? "Placing…" : label}
    </button>
  );
}
