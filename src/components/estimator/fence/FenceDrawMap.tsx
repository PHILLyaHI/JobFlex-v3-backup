"use client";
// Satellite draw surface. Uses an EDITABLE google.maps.Polyline so vertex drag
// and midpoint-insert come for free; we only translate the path to/from local
// feet and push commits to the studio store (debounced to one frame so a drag
// doesn't thrash the 3D rebuild). The store stays the source of truth in feet.
import * as React from "react";
import { Spline, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadMapsLibrary, isMapsBrowserEnabled } from "@/lib/googleMaps";
import { pathToFeet, pathToLatLng, type LatLng } from "./mapProjection";
import type { PathPoint } from "./fenceTypes";

const ACCENT = "#1f7a52"; // Pressed Sage (locked accent) for the drawn line

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

export function FenceDrawMap({
  lat,
  lng,
  points,
  onChange,
  className,
}: {
  lat?: number;
  lng?: number;
  points: PathPoint[];
  onChange: (pts: PathPoint[]) => void;
  className?: string;
}) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const pointsRef = React.useRef(points);
  React.useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const apiRef = React.useRef<{ clear: () => void; closeLoop: () => void; undo: () => void } | null>(null);

  const enabled = isMapsBrowserEnabled();
  const hasOrigin = typeof lat === "number" && typeof lng === "number";

  React.useEffect(() => {
    if (!enabled || !hasOrigin || !mountRef.current) return;
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      try {
        const maps = await loadMapsLibrary<GMaps>("maps");
        if (cancelled || !mountRef.current) return;
        const origin: LatLng = { lat: lat as number, lng: lng as number };
        const map = new maps.Map(mountRef.current, {
          center: origin,
          zoom: 20,
          mapTypeId: "satellite",
          tilt: 0,
          gestureHandling: "greedy",
          disableDefaultUI: true,
          zoomControl: true,
          keyboardShortcuts: false,
        });
        const polyline = new maps.Polyline({
          map,
          editable: true,
          path: pathToLatLng(origin, pointsRef.current),
          strokeColor: ACCENT,
          strokeWeight: 3,
          strokeOpacity: 1,
        });
        const path = polyline.getPath();

        let raf = 0;
        const commit = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const arr: LatLng[] = [];
            path.forEach((ll: GMaps) => arr.push({ lat: ll.lat(), lng: ll.lng() }));
            onChangeRef.current(pathToFeet(origin, arr));
          });
        };

        const listeners = [
          path.addListener("set_at", commit),
          path.addListener("insert_at", commit),
          path.addListener("remove_at", commit),
          map.addListener("click", (e: GMaps) => {
            if (e.latLng) {
              path.push(e.latLng);
              commit();
            }
          }),
          polyline.addListener("rightclick", (e: GMaps) => {
            if (e.vertex != null && path.getLength() > 0) {
              path.removeAt(e.vertex);
              commit();
            }
          }),
        ];

        apiRef.current = {
          clear: () => {
            path.clear();
            commit();
          },
          closeLoop: () => {
            if (path.getLength() >= 3) {
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
        };

        cleanup = () => {
          cancelAnimationFrame(raf);
          for (const l of listeners) l?.remove?.();
          polyline.setMap(null);
        };
      } catch {
        /* leave the disabled message in place */
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
      apiRef.current = null;
    };
    // Rebuild the map when the origin (address) changes.
  }, [enabled, hasOrigin, lat, lng]);

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

  if (!hasOrigin) {
    return (
      <div className={cn("grid place-items-center text-center p-6 bg-[color:var(--paper)]", className)}>
        <div className="max-w-xs text-[12px] text-[color:var(--ink-muted)] leading-relaxed">
          Search a property address above to drop the satellite view and start tracing the fence line.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute left-3 top-3 flex gap-1.5">
        <MapBtn onClick={() => apiRef.current?.closeLoop()} icon={<Spline className="h-3.5 w-3.5" />} label="Close loop" />
        <MapBtn onClick={() => apiRef.current?.undo()} icon={<Undo2 className="h-3.5 w-3.5" />} label="Undo" />
        <MapBtn onClick={() => apiRef.current?.clear()} icon={<Trash2 className="h-3.5 w-3.5" />} label="Clear" />
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
        <span className="rounded-full bg-white/85 backdrop-blur hairline px-3 py-1 text-[11px] text-[color:var(--ink-muted)]">
          Click to add points · drag to adjust · right-click a point to remove
        </span>
      </div>
    </div>
  );
}

function MapBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur hairline px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-soft)] hover:bg-white shadow-[var(--shadow-sm)]"
    >
      {icon}
      {label}
    </button>
  );
}
