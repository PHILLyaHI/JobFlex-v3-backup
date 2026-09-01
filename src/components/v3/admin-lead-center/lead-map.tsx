"use client";

// LEAD CENTER — the live coverage map.
//
// Replaces the schematic site plan. Two point sets on one Google satellite/road
// map: HOMEOWNER LEADS in red and CONTRACTOR SHOPS in blue, filtered by a
// three-way switch (leads / shops / both).
//
// THE FLOW IT EXISTS FOR
//   1. Open the page: every lead of the last 30 days is on the map.
//   2. Click a lead pin: the map turns to that lead — every shop appears, so
//      you can see who is actually near it.
//   3. Click a shop pin: a panel opens with that shop, the lead you picked, and
//      one button that sends the lead to them.
//
// SCALE. A platform with thousands of leads cannot put a DOM node on each one,
// so the points are CLUSTERED in screen space: the visible set is bucketed into
// a grid of ~64px cells at the current zoom and one marker is drawn per cell,
// labelled with its count. Panning and zooming re-bucket. Rendering is bounded
// by the number of cells on screen (a few hundred at most), not by the number
// of leads, and the maths is a single pass over the points.
//
// The markers are plain `google.maps.Marker` with SVG path symbols — no
// AdvancedMarkerElement (needs a Map ID) and no external clustering library.

import * as React from "react";
import { isMapsBrowserEnabled, loadMapsLibrary } from "@/lib/googleMaps";

/* eslint-disable @typescript-eslint/no-explicit-any */
type GMaps = any;

export interface MapLead {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  trade: string | null;
  city: string | null;
}

export interface MapShop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  matchable: boolean;
}

export type MapFilter = "leads" | "shops" | "both";

/** Ink-frame red for a homeowner, blueprint blue for a shop — the page's two
 *  colours, so the legend is the only thing that has to say so. */
const LEAD_RED = "#b3261e";
const SHOP_BLUE = "#1854a0";
const INK = "#101010";

/** Cell size for the screen-space clusterer, in pixels. Two points closer than
 *  this at the current zoom are one marker. */
const CELL_PX = 64;
/** Above this, drawing every point individually is cheaper than clustering it. */
const CLUSTER_MIN = 2;

type Point = { id: string; lat: number; lng: number; kind: "lead" | "shop"; muted?: boolean };

type Cluster = {
  key: string;
  lat: number;
  lng: number;
  count: number;
  kind: "lead" | "shop";
  /** The only member, when the cell holds exactly one. */
  single: Point | null;
};

/** World-coordinate projection (Google's 256px tile space) — enough to bucket
 *  by screen distance without asking the map for a projection per point. */
function project(lat: number, lng: number): { x: number; y: number } {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: 128 * (1 + lng / 180),
    y: 128 * (1 - Math.log((1 + siny) / (1 - siny)) / (2 * Math.PI)),
  };
}

/** How far apart co-located markers are fanned, in screen pixels. */
const FAN_PX = 26;

/**
 * Pull apart points that sit on the SAME spot.
 *
 * Four contractors registered at one address are four markers stacked
 * perfectly — the map shows one square and swallows three clicks. Anything
 * sharing a position to ~1m is fanned onto a small ring around it, so every
 * record is visible and clickable. Sub-metre movement at the scale a map is
 * read at; the pin still points at the address.
 */
function fanOut(points: Point[], zoom: number): Point[] {
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const out: Point[] = [];
  const scale = Math.pow(2, zoom); // world px per degree-ish, via the projection
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push(g[0]);
      continue;
    }
    // World units → degrees: the projection is 256 world px across 360°, so a
    // screen pixel at this zoom is (360 / 256 / scale) degrees of longitude.
    const degPerPx = 360 / 256 / scale;
    const r = FAN_PX * degPerPx;
    g.forEach((p, i) => {
      const a = (2 * Math.PI * i) / g.length;
      out.push({
        ...p,
        lat: p.lat + r * Math.sin(a) * 0.6, // latitude degrees are ~1.5x longer here
        lng: p.lng + r * Math.cos(a),
      });
    });
  }
  return out;
}

/** One marker per ~CELL_PX cell of screen space. */
function clusterPoints(points: Point[], zoom: number): Cluster[] {
  const scale = Math.pow(2, zoom); // world px → screen px
  const cell = CELL_PX / scale;
  const cells = new Map<string, { sx: number; sy: number; n: number; kind: "lead" | "shop"; single: Point | null }>();
  for (const p of points) {
    const w = project(p.lat, p.lng);
    const key = `${p.kind}:${Math.floor(w.x / cell)}:${Math.floor(w.y / cell)}`;
    const cur = cells.get(key);
    if (cur) {
      cur.sx += p.lat;
      cur.sy += p.lng;
      cur.n += 1;
      cur.single = null;
    } else {
      cells.set(key, { sx: p.lat, sy: p.lng, n: 1, kind: p.kind, single: p });
    }
  }
  return [...cells.entries()].map(([key, c]) => ({
    key,
    lat: c.sx / c.n,
    lng: c.sy / c.n,
    count: c.n,
    kind: c.kind,
    single: c.single,
  }));
}

function markerIcon(maps: GMaps, kind: "lead" | "shop", active: boolean, muted: boolean) {
  const fill = kind === "lead" ? LEAD_RED : SHOP_BLUE;
  return {
    // A square, like every other mark in the system.
    path: "M -7 -7 L 7 -7 L 7 7 L -7 7 Z",
    fillColor: active ? INK : fill,
    fillOpacity: muted ? 0.45 : 1,
    strokeColor: "#ffffff",
    strokeWeight: active ? 3 : 2,
    scale: active ? 1.5 : 1,
    anchor: new maps.Point(0, 0),
  };
}

function clusterIcon(maps: GMaps, kind: "lead" | "shop", count: number) {
  const fill = kind === "lead" ? LEAD_RED : SHOP_BLUE;
  const r = count > 99 ? 22 : count > 9 ? 18 : 15;
  return {
    path: maps.SymbolPath.CIRCLE,
    fillColor: fill,
    fillOpacity: 0.92,
    strokeColor: "#ffffff",
    strokeWeight: 2.5,
    scale: r,
  };
}

export function LeadMap({
  leads,
  shops,
  filter,
  selectedLeadId,
  onPickLead,
  onPickShop,
  className,
}: {
  leads: MapLead[];
  shops: MapShop[];
  filter: MapFilter;
  selectedLeadId: string | null;
  onPickLead: (id: string) => void;
  onPickShop: (id: string) => void;
  className?: string;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GMaps>(null);
  const mapsRef = React.useRef<GMaps>(null);
  const markersRef = React.useRef<GMaps[]>([]);
  const [ready, setReady] = React.useState(false);
  const [zoom, setZoom] = React.useState(9);

  // Callback props change on every parent render; the draw effect must not.
  const onPickLeadRef = React.useRef(onPickLead);
  const onPickShopRef = React.useRef(onPickShop);
  React.useEffect(() => {
    onPickLeadRef.current = onPickLead;
    onPickShopRef.current = onPickShop;
  });

  // ── build the map once ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (!isMapsBrowserEnabled() || !hostRef.current) return;
    let cancelled = false;
    void (async () => {
      // `importLibrary("maps")` returns the MAPS namespace only; LatLngBounds,
      // Point, SymbolPath and Marker are core / marker classes. Awaiting the
      // import is what guarantees the SDK is up — the classes then come off the
      // global namespace it populated, the same way FenceDrawMap reads them.
      await loadMapsLibrary<GMaps>("maps");
      await loadMapsLibrary<GMaps>("marker").catch(() => null);
      const maps = (window as unknown as { google: { maps: GMaps } }).google.maps;
      if (cancelled || !hostRef.current) return;
      const map = new maps.Map(hostRef.current, {
        center: { lat: 39.83, lng: -98.58 }, // continental US, until points arrive
        zoom: 4,
        mapTypeId: "roadmap",
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
        ],
      });
      mapRef.current = map;
      mapsRef.current = maps;
      map.addListener("idle", () => setZoom(map.getZoom() ?? 9));
      setReady(true);
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  // ── fit to whatever is being shown, when the SET changes ────────────────
  const fitKey = React.useMemo(() => {
    const ids = filter === "shops" ? shops.map((s) => s.id) : leads.map((l) => l.id);
    return filter + "|" + ids.join(",");
  }, [filter, leads, shops]);

  React.useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;
    const pts = [
      ...(filter === "shops" ? [] : leads.map((l) => ({ lat: l.lat, lng: l.lng }))),
      ...(filter === "leads" ? [] : shops.map((s) => ({ lat: s.lat, lng: s.lng }))),
    ];
    if (!pts.length) return;
    const b = new maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, 56);
    // One point fits to the maximum zoom, which lands on a rooftop.
    if (pts.length === 1) {
      const once = map.addListener("idle", () => {
        if ((map.getZoom() ?? 0) > 13) map.setZoom(13);
        once.remove();
      });
    }
  }, [fitKey, ready, filter, leads, shops]);

  // ── draw ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const points: Point[] = [];
    if (filter !== "shops") {
      for (const l of leads) {
        points.push({ id: l.id, lat: l.lat, lng: l.lng, kind: "lead" });
      }
    }
    if (filter !== "leads") {
      for (const s of shops) {
        // A shop that cannot receive offers is on the map, but reads as off.
        points.push({ id: s.id, lat: s.lat, lng: s.lng, kind: "shop", muted: !s.matchable });
      }
    }

    const leadById = new Map(leads.map((l) => [l.id, l]));
    const shopById = new Map(shops.map((s) => [s.id, s]));

    // DOM markers up to a point, canvas beyond it. Google's `optimized` renderer
    // paints every marker into one canvas — fast for thousands, but the markers
    // stop being elements (no hit-testing from the outside, no accessible name).
    // Under a few hundred the DOM cost is nothing and the map stays inspectable.
    const asDom = points.length <= 150;

    const draw = (c: Cluster) => {
      const single = c.count === 1 ? c.single : null;
      if (single) {
        const isLead = single.kind === "lead";
        const active = isLead && single.id === selectedLeadId;
        const rec = isLead ? leadById.get(single.id) : shopById.get(single.id);
        const marker = new maps.Marker({
          map,
          position: { lat: single.lat, lng: single.lng },
          icon: markerIcon(maps, single.kind, active, Boolean(single.muted)),
          title: rec?.name ?? "",
          zIndex: active ? 20 : isLead ? 10 : 5,
          optimized: !asDom,
        });
        marker.addListener("click", () => {
          if (isLead) onPickLeadRef.current(single.id);
          else onPickShopRef.current(single.id);
        });
        markersRef.current.push(marker);
        return;
      }
      const marker = new maps.Marker({
        map,
        position: { lat: c.lat, lng: c.lng },
        icon: clusterIcon(maps, c.kind, c.count),
        label: {
          text: String(c.count),
          color: "#ffffff",
          fontSize: "12px",
          fontWeight: "700",
          fontFamily: "JetBrains Mono, monospace",
        },
        zIndex: 4,
        optimized: !asDom,
      });
      // A cluster is a zoom affordance: click it and the map goes in far enough
      // to break it apart.
      marker.addListener("click", () => {
        map.setCenter({ lat: c.lat, lng: c.lng });
        map.setZoom(Math.min(18, (map.getZoom() ?? 9) + 3));
      });
      markersRef.current.push(marker);
    };

    if (points.length <= CLUSTER_MIN * 40) {
      // Small sets draw straight through — clustering a dozen pins only hides
      // them from each other — but co-located ones still have to be pulled
      // apart or they are one square with three invisible twins under it.
      fanOut(points, zoom).forEach((p) =>
        draw({ key: p.id, lat: p.lat, lng: p.lng, count: 1, kind: p.kind, single: p }),
      );
    } else {
      clusterPoints(points, zoom).forEach(draw);
    }
  }, [ready, leads, shops, filter, selectedLeadId, zoom]);

  if (!isMapsBrowserEnabled()) {
    return (
      <div className={className}>
        <div style={{ padding: 24, textAlign: "center", fontSize: 13, fontWeight: 600 }}>
          Map needs NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY.
        </div>
      </div>
    );
  }
  return <div ref={hostRef} className={className} />;
}
