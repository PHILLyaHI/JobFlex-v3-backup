"use client";

// Roof estimator — the ea9ad01 design, restored one-to-one (owner confirmed
// that commit's look as THE reference), with exactly two differences while the
// drawing engine is reworked (ROOF_DRAWING_ENABLED=false):
//
//   · the 2D | 3D tabs are the same vsw switch, relabelled SATELLITE | ORTHO —
//     SATELLITE (default) is a clean Google Maps satellite photo, ORTHO is the
//     EagleView clear ortho from the measurement (tab hidden when the
//     measurement carries no imagery); no outlines, no lines on either;
//   · everything derived from the drawn MODEL is honestly absent, not zeroed:
//     the layer toggles, PNG/PDF export, LINEAR FOOTAGE and the pitch-mix
//     panel are gone with the drawing. The numbers shown are EagleView
//     Instant's calibrated totals; DETAILS stays (it is Instant data).
//
// Actions: measureRoofInstant / listRoofMeasurements / getRoofMeasurement
// (src/actions/roofMeasurement.ts, data-only) + getMeasurementPhoto (Google
// Static Maps, disk-cached) + getMeasurementOrtho (EagleView clear).
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import type { InstantRoofData, InstantStructure } from "@/lib/eagleview";
import { toast } from "@/components/ui/Toast";
import type { EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { assessRoof, confidenceLabel } from "@/lib/roofDiagram/confidence";
import type { MeasurementSource, RoofMeasurementDTO, RoofMeasurementSummary } from "@/lib/roofDiagram/types";
import {
  getMeasurementOrtho,
  getMeasurementPhoto,
  getRoofMeasurement,
  listRoofMeasurements,
  measureRoofInstant,
} from "@/actions/roofMeasurement";
import { estimateRoof, convertRoofEstimateToProposal } from "@/actions/roofEstimator";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";
import { attachPlacesSuggest, type PickedPlace } from "@/components/v3/blueprint-shell/places-suggest";
import { AddressPinPreview } from "./address-pin-preview";
import { isMapsBrowserEnabled, loadMapsLibrary } from "@/lib/googleMaps";
import { displayedPitchLabel, foreignIndices, instantTotalsOf, pickMainStructure, pitchFamilyShares } from "@/lib/roofDiagram/instantTotals";
import { AERIAL } from "@/lib/vendorLabels";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const WASTES = [8, 10, 12, 15];
const FACADE: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };
// Donor: the measuring screen's stage captions, re-worded for the data path
// (Instant request → totals → save; no facet tracing happens any more).
const MS_STAGES = ["Requesting data…", "Locating the structure…", "Reading the measurements…", "Saving…", "Report ready"];
const RECENT_LIMIT = 12;

// `instant-outline` is a FAILED measurement wearing the totals of a successful
// one: EagleView's numbers are there, the roof is not. "Outline" in a warning
// tone read as a variety of result rather than a shortfall, so the row invited
// no second look — and on 2026-08-28 a retry was all it needed.
const SOURCE_CHIP: Record<MeasurementSource, { label: string; tone: "ok" | "wait" | "bad" }> = {
  "instant+recon": { label: "Instant", tone: "ok" },
  "instant-outline": { label: "No facets", tone: "bad" },
  recon: { label: "Estimate", tone: "wait" },
};

const num = (n: number, d = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const yesNo = (v: boolean | null | undefined) => (v == null ? "—" : v ? "Yes" : "No");

type Panel = "intake" | "measuring" | "report";
type PhotoView = "satellite" | "ortho";

// A takeoff the contractor typed in — squares and pitch, nothing measured.
// This is the path that exists because EagleView Property Data is refusing
// the account (403 "missing or incomplete entitlement", 2026-09-05): until the
// entitlement lands, Instant measure fails for every address and nothing on
// this page could ever reach a proposal. Hand-entered figures are the
// contractor's own, so they price and convert like measured ones; they are
// NOT the aerial "recon" estimate, which stays unpriceable on purpose.
type ManualTakeoff = { squares: number; pitchLabel: string; address: string | null };
const PITCHES = ["2/12", "3/12", "4/12", "5/12", "6/12", "7/12", "8/12", "9/12", "10/12", "12/12"];

/** The report reads one `totals` shape; a hand takeoff fills the same fields. */
function manualTotals(m: ManualTakeoff): InstantRoofData["totals"] {
  const rise = Number(m.pitchLabel.split("/")[0]);
  return {
    areaSqft: m.squares * 100,
    squares: m.squares,
    predominantPitch: Number.isFinite(rise) ? rise : null,
    pitchLabel: m.pitchLabel,
    maxEaveFt: null,
    facetCount: null,
    footprintSqft: null,
  };
}

// Live Google map on the SATELLITE tab (owner's call: pan + zoom). Minimal
// structural types for the JS SDK — the repo carries no @types/google.maps,
// same approach as lead-map.tsx. Initial zoom matches the static photo's z20.
const LIVE_MAP_ZOOM = 20;
interface LiveGoogleMap {
  setCenter(c: { lat: number; lng: number }): void;
  setZoom(z: number): void;
}
interface LiveMapMarker {
  setPosition(c: { lat: number; lng: number }): void;
}
type GMapsLib = { Map: new (el: HTMLElement, opts: Record<string, unknown>) => LiveGoogleMap };
type MarkerCtor = new (opts: Record<string, unknown>) => LiveMapMarker;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stripId = ({ id: _id, ...rest }: EstimateLine) => rest;


/** "2025-07-11" → "Jul 2025" for the photo caption; unparsable input passes through. */
function shotDateLabel(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function RoofEstimatorDataForm() {
  const router = useRouter();

  // ── Screen ──
  const [panel, setPanel] = React.useState<Panel>("intake");
  const [msStage, setMsStage] = React.useState(0);
  const [msReport, setMsReport] = React.useState<string>("—");
  const [msHint, setMsHint] = React.useState<string | null>(null);

  // ── Measurement / photo viewer ──
  const [measurement, setMeasurement] = React.useState<RoofMeasurementDTO | null>(null);
  // Set when the action measured (and, for Instant, billed) but could not save.
  const [unsaved, setUnsaved] = React.useState(false);
  const [instantBusy, setInstantBusy] = React.useState(false);
  // Set when the shown measurement reused an already-paid EagleView answer —
  // the explicit paid re-measure button renders only then.
  const [reusedInstant, setReusedInstant] = React.useState<"stored" | "recovered" | null>(null);
  const [view, setView] = React.useState<PhotoView>("satellite");
  const [satPhoto, setSatPhoto] = React.useState<string | null>(null);
  const [satErr, setSatErr] = React.useState<string | null>(null);
  const [orthoPhoto, setOrthoPhoto] = React.useState<string | null>(null);
  const [orthoErr, setOrthoErr] = React.useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  // Live satellite map. `mapDown` flips once when the JS SDK refuses to load —
  // the cached static photo then takes over for the rest of the session.
  const mapHostRef = React.useRef<HTMLDivElement | null>(null);
  const liveMapRef = React.useRef<{ host: HTMLDivElement; map: LiveGoogleMap; marker: LiveMapMarker | null } | null>(null);
  const [mapDown, setMapDown] = React.useState(false);

  // The data path never draws, so the CONFIDENCE verdict comes straight from
  // the stored provenance (coverage, completeness, EagleView's own occlusion
  // survey) — the same assessRoof, on its data-only inputs.
  const assessment = React.useMemo(() => {
    if (!measurement) return null;
    const p = measurement.provenance;
    return assessRoof({
      coverage: p.coverage ?? null,
      structures:
        p.structures?.map((st) => ({
          prefix: st.prefix,
          contourSqft: st.contourSqft,
          share: st.coverage?.insetShare ?? st.coverage?.share ?? null,
        })) ?? null,
      // Rows from before 2026-09-08 carry no instantPitch12: fall back to the
      // published label the row has, so "published figure" is only claimed
      // when a figure exists.
      pitchSource: p.pitchSource
        ? {
            ...p.pitchSource,
            instantPitch12:
              p.pitchSource.instantPitch12 !== undefined
                ? p.pitchSource.instantPitch12
                : measurement.instant?.totals.pitchLabel
                  ? Number(measurement.instant.totals.pitchLabel.split("/")[0])
                  : null,
          }
        : null,
      completeness: p.completeness ?? null,
      parcelBlocked: p.parcelBlocked ?? null,
      instantOcclusion: p.instantSurvey
        ? {
            occlusion: p.instantSurvey.occlusion,
            treeOverhang: p.instantSurvey.treeOverhang,
            occlusionConfidence: p.instantSurvey.confidence?.occlusion ?? null,
            overhangConfidence: p.instantSurvey.confidence?.treeOverhang ?? null,
          }
        : null,
    });
  }, [measurement]);
  /**
   * Built by the OLD calibrated pipeline. Only that path stores a calibration
   * report, so this is the reliable discriminator — and a saved row always
   * shows its own stored numbers, never rebuilt ones.
   */
  const builtByOldPipeline = !!measurement?.calibration;

  // ── Recent measurements ──
  const [recent, setRecent] = React.useState<RoofMeasurementSummary[]>([]);
  const [recentBusy, setRecentBusy] = React.useState(true);
  const [recentError, setRecentError] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);

  const loadRecent = React.useCallback(
    () =>
      listRoofMeasurements(RECENT_LIMIT).then(
        (rows) => {
          setRecent(rows);
          setRecentError(null);
          setRecentBusy(false);
        },
        (err: unknown) => {
          setRecentError(errMsg(err));
          setRecentBusy(false);
        },
      ),
    [],
  );
  React.useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // ── Address ──
  const addrRef = React.useRef<HTMLInputElement>(null);
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  const [city, setCity] = React.useState("");
  const [stateCode, setStateCode] = React.useState("");
  const [zip, setZip] = React.useState("");

  // Google Places on the donor's plain <input>, the same module the Fence
  // studio uses. Uncontrolled on purpose: the module writes the field itself.
  React.useEffect(() => {
    if (panel !== "intake") return;
    const input = addrRef.current;
    if (!input) return;
    return attachPlacesSuggest(input, {
      onPick(p) {
        setPicked(p);
        if (p.typed) return;
        if (p.city) setCity(p.city);
        if (p.state) setStateCode(p.state);
        if (p.zip) setZip(p.zip);
      },
      // The field still works typed out in full; say so, with Google's reason,
      // rather than leave a list that never opens.
      onError(message) {
        toast.error("Address suggestions are unavailable", `${message}. Fill in the address, city, state and ZIP by hand.`);
      },
    });
  }, [panel]);

  // ── Estimate ──
  const [waste, setWaste] = React.useState(12);
  const [genBusy, setGenBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  const [convertBusy, setConvertBusy] = React.useState(false);
  // Hand-entered takeoff (runManual). Cleared by resetResult, so it never
  // coexists with a measurement.
  const [manual, setManual] = React.useState<ManualTakeoff | null>(null);
  const [manSquares, setManSquares] = React.useState("");
  const [manPitch, setManPitch] = React.useState("6/12");
  // Other structures on the parcel the contractor has ticked INTO the figures
  // (indices into instant.structures). Empty by default: the page is about the
  // main structure; a barn joins the total only when someone says so.
  const [extra, setExtra] = React.useState<ReadonlySet<number>>(() => new Set());
  // The pitch the contractor typed when EagleView had none (pack 002 not
  // bought). Nothing is priced on a pitch nobody stated.
  const [pitchEntered, setPitchEntered] = React.useState<string | null>(null);

  // A free estimate is never priced; the data path only saves Instant rows,
  // but old "recon" rows can still be opened from history.
  const isRecon = measurement?.source === "recon";
  const savedId = measurement && !unsaved && measurement.id !== "unsaved" ? measurement.id : null;
  const hasEstimate = materials.length > 0 || labor.length > 0;
  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const busy = instantBusy || openingId != null;

  function resetResult() {
    setMeasurement(null);
    setManual(null);
    setExtra(new Set());
    setPitchEntered(null);
    setUnsaved(false);
    setMaterials([]);
    setLabor([]);
    setAssumptions([]);
    setView("satellite");
    setSatPhoto(null);
    setSatErr(null);
    setOrthoPhoto(null);
    setOrthoErr(null);
  }

  // The donor's measuring screen stepped through MS_STAGES on a timer. Here the
  // stages pace a REAL await: the bar advances while the action runs and jumps
  // to "Report ready" when it resolves.
  function runStages(): () => void {
    setMsStage(0);
    let i = 0;
    const t = setInterval(() => {
      i = Math.min(i + 1, MS_STAGES.length - 2);
      setMsStage(i);
    }, 900);
    return () => clearInterval(t);
  }

  function orderInput() {
    return { address: picked?.address ?? "", city, state: stateCode, zip, lat: picked?.lat, lng: picked?.lng };
  }

  // ── Photos ──
  // The EagleView clear ortho exists only when the paid answer carried imagery;
  // without it the ORTHO tab is hidden (not disabled) per the owner's call.
  const hasOrtho = !!measurement?.instant?.imagery?.some(
    (im) => im.view === "ortho" && im.masked === false && !!im.token && !!im.bbox,
  );
  const orthoShotDate = shotDateLabel(
    measurement?.instant?.imagery?.find((im) => im.view === "ortho" && im.masked === false)?.shotDate ??
      measurement?.provenance?.instantImageryDate,
  );

  const loadSatellite = React.useCallback((id: string) => {
    setSatPhoto(null);
    setSatErr(null);
    if (id === "unsaved") return;
    setPhotoBusy(true);
    void getMeasurementPhoto(id)
      .then((res) => {
        if (res.ok) setSatPhoto(res.dataUrl);
        else setSatErr(res.error);
      })
      .catch((err: unknown) => setSatErr(errMsg(err)))
      .finally(() => setPhotoBusy(false));
  }, []);

  const loadOrtho = React.useCallback((id: string) => {
    setOrthoPhoto(null);
    setOrthoErr(null);
    if (id === "unsaved") return;
    setPhotoBusy(true);
    void getMeasurementOrtho(id)
      .then((res) => {
        if (res.ok) setOrthoPhoto(res.dataUrl);
        else setOrthoErr(res.error);
      })
      .catch((err: unknown) => setOrthoErr(errMsg(err)))
      .finally(() => setPhotoBusy(false));
  }, []);

  // Ortho is fetched lazily, on the first switch to the tab; the choice and
  // both fetched photos then stick for the life of the open measurement.
  function switchView(v: PhotoView) {
    setView(v);
    if (v === "ortho" && savedId && !orthoPhoto && !orthoErr && !photoBusy) loadOrtho(savedId);
  }

  // Live SATELLITE map (owner's call: drag to pan, scroll to zoom). Needs the
  // browser key and the measurement's pin; either missing → the cached static
  // photo (getMeasurementPhoto) serves exactly as before.
  const mapLat = measurement?.instant?.lat ?? null;
  const mapLng = measurement?.instant?.lng ?? null;
  const liveMap = isMapsBrowserEnabled() && !mapDown && mapLat != null && mapLng != null;

  // The map is built only while the SATELLITE tab is visible (the SDK lays
  // out broken tiles inside display:none), and recentred only when the OPEN
  // MEASUREMENT changes — a mere tab flip keeps the user's pan/zoom.
  const centeredOnRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!liveMap || panel !== "report" || view !== "satellite" || mapLat == null || mapLng == null) return;
    let cancelled = false;
    void loadMapsLibrary<GMapsLib>("maps")
      .then(async ({ Map: GMap }) => {
        // Classic Marker comes off the global namespace once the marker
        // library is up (AdvancedMarkerElement needs a Map ID) — the same way
        // lead-map.tsx and the intake's pin preview read it. A failed marker
        // library costs only the pin, never the map.
        await loadMapsLibrary("marker").catch(() => null);
        const Marker =
          (window as unknown as { google?: { maps?: { Marker?: MarkerCtor } } }).google?.maps?.Marker ?? null;
        const host = mapHostRef.current;
        if (cancelled || !host) return;
        const center = { lat: mapLat, lng: mapLng };
        const key = `${mapLat},${mapLng}`;
        if (liveMapRef.current?.host === host) {
          if (centeredOnRef.current !== key) {
            liveMapRef.current.map.setCenter(center);
            liveMapRef.current.map.setZoom(LIVE_MAP_ZOOM);
            liveMapRef.current.marker?.setPosition(center);
          }
        } else {
          const map = new GMap(host, {
            center,
            zoom: LIVE_MAP_ZOOM,
            mapTypeId: "satellite",
            tilt: 0,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
          });
          // The map's whole reason to exist on this panel is "which house was
          // measured" — mark the point the measurement read.
          const marker = Marker ? new Marker({ map, position: center, title: "The point the measurement read" }) : null;
          liveMapRef.current = { host, map, marker };
        }
        centeredOnRef.current = key;
      })
      .catch(() => {
        if (cancelled) return;
        setMapDown(true);
        if (savedId) loadSatellite(savedId);
      });
    return () => {
      cancelled = true;
    };
  }, [liveMap, panel, view, mapLat, mapLng, savedId, loadSatellite]);

  // The "back to the house" button: the live map's escape hatch after a wander.
  function recenterMap() {
    const m = liveMapRef.current?.map;
    if (!m || mapLat == null || mapLng == null) return;
    m.setCenter({ lat: mapLat, lng: mapLng });
    m.setZoom(LIVE_MAP_ZOOM);
  }

  function showMeasurement(m: RoofMeasurementDTO, wasUnsaved: boolean) {
    setMeasurement(m);
    setExtra(new Set());
    setPitchEntered(null);
    setUnsaved(wasUnsaved);
    setPanel("report");
    const willLiveMap = isMapsBrowserEnabled() && !mapDown && m.instant?.lat != null && m.instant?.lng != null;
    if (!wasUnsaved && m.id !== "unsaved" && !willLiveMap) loadSatellite(m.id);
  }

  // Instant measure. A repeat of an address the org already paid for REUSES
  // the stored EagleView answer (no new bill); `forceNewOrder` is the explicit
  // "re-measure at a new cost" gesture and is never set by a plain click.
  async function runInstant(forceNewOrder = false) {
    if (!picked?.address) {
      addrRef.current?.focus();
      return;
    }
    if (forceNewOrder && !window.confirm(`Order a NEW ${AERIAL.vendor.toLowerCase()} lookup for this address? This is billed, even though a paid answer already exists.`)) {
      return;
    }
    resetResult();
    setInstantBusy(true);
    setReusedInstant(null);
    setMsReport("Instant measure");
    setMsHint(`${AERIAL.property} (billed per lookup) — the measured totals, structures and imagery, saved to the history.`);
    setPanel("measuring");
    const stop = runStages();
    try {
      const res = await measureRoofInstant(orderInput(), forceNewOrder ? { forceNewOrder } : undefined);
      // DEBUG (2026-09-08, owner's call — on until told otherwise): the whole
      // EagleView story for this click, in the browser console.
      console.info(
        "[roof:debug] Instant measure",
        res.ok
          ? {
              ok: true,
              requestId: res.measurement.instant?.requestId ?? null,
              packs: res.debug?.packs ?? null,
              reused: res.reusedInstant ?? null,
              totals: res.measurement.instant?.totals ?? null,
              structures: res.measurement.instant?.structures.length ?? 0,
              source: res.measurement.source,
              identity: res.debug,
            }
          : res,
      );
      if (!res.ok) throw new Error(res.error);
      stop();
      setMsStage(MS_STAGES.length - 1);
      await sleep(420);
      showMeasurement(res.measurement, !!res.unsaved);
      setReusedInstant(res.reusedInstant?.how ?? null);
      // The row's own columns: the main structure's figures, not the parcel's.
      const t = { facetCount: res.measurement.facetCount, squares: res.measurement.squares };
      toast.success(
        res.unsaved ? "Roof measured — not saved" : "Roof measured",
        `${t?.facetCount ?? "—"} facets · ${t?.squares != null ? t.squares.toFixed(1) : "—"} squares` +
          (res.reusedInstant
            ? res.reusedInstant.how === "recovered"
              ? " · collected the earlier paid order — nothing new was billed"
              : " · reused the already-paid aerial data — nothing new was billed"
            : ""),
      );
      if (!res.unsaved) void loadRecent();
    } catch (err) {
      stop();
      setPanel("intake");
      toast.error("Couldn't measure this roof", errMsg(err));
    } finally {
      setInstantBusy(false);
    }
  }

  // Hand-entered takeoff: no lookup, nothing billed, nothing saved to history.
  // The address is whatever is in the intake fields — typed or picked.
  function runManual() {
    const sq = Number(manSquares.replace(/,/g, ""));
    if (!Number.isFinite(sq) || sq <= 0) {
      toast.error("Enter the roof size in squares", "One square is 100 sq ft of roof surface.");
      return;
    }
    resetResult();
    setReusedInstant(null);
    const street = (picked?.address ?? addrRef.current?.value ?? "").trim();
    const address = [street, [city, stateCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    setManual({ squares: Math.round(sq * 10) / 10, pitchLabel: manPitch, address: address || null });
    setPanel("report");
  }

  // Reopen a saved measurement — no lookup, nothing billed.
  async function openRecent(id: string) {
    setOpeningId(id);
    try {
      const m = await getRoofMeasurement(id);
      if (!m) throw new Error("This measurement is no longer available.");
      resetResult();
      showMeasurement(m, false);
    } catch (err) {
      toast.error("Couldn't open measurement", errMsg(err));
    } finally {
      setOpeningId(null);
    }
  }

  async function generate() {
    const t = totals;
    if (t?.squares == null) return;
    if (isRecon) {
      toast.error(
        "Estimated measurements can’t be priced",
        "Run Instant measure for this address to build a priced estimate.",
      );
      return;
    }
    // No pitch, no price: the button is disabled in this state, this is the belt.
    if (!pitchForEstimate || !pitchKind) {
      toast.error("Enter the pitch first", "The aerial data has no pitch for this roof; pick one to price it.");
      return;
    }
    setGenBusy(true);
    try {
      const families = pitchMeasured ? pitchFamilyShares(pitchRep!.families) : [];
      const pitchNote =
        pitchKind === "measured"
          ? families.length > 1
            ? `two-pitch roof: ${families.map((f) => `${Math.round(f.pitch12)}/12 (${Math.round(f.share * 100)}% of the roof)`).join(" + ")} — measured from aerial elevation data (${Math.round((pitchRep!.trustedShare ?? 0) * 100)}% of the roof read cleanly)`
            : `pitch ${pitchForEstimate} over the whole roof — measured from aerial elevation data (${Math.round((pitchRep!.trustedShare ?? 0) * 100)}% of the roof read cleanly; that is the measurement's coverage, not a share of the roof at this pitch)`
          : pitchKind === "eagleview"
            ? `pitch ${pitchForEstimate} (${AERIAL.reported} figure)`
            : `pitch ${pitchForEstimate} entered by user — not measured`;
      const extrasNote =
        !manual && extra.size
          ? ` Includes ${extra.size} other structure(s) on the parcel the contractor ticked in (${num(
              otherStructures.filter(({ i }) => extra.has(i)).reduce((a, { s }) => a + (s.areaSqft ?? 0), 0),
            )} sq ft); the main structure alone is ${num(structure?.areaSqft ?? 0)} sq ft.`
          : "";
      const res = await estimateRoof({
        address: siteAddress || undefined,
        lat: measurement?.lat ?? undefined,
        lng: measurement?.lng ?? undefined,
        pitch: pitchForEstimate,
        pitchSource: pitchKind,
        pitchFamilies: families.length > 1 ? families : undefined,
        squares: Number(t.squares.toFixed(1)),
        wastePct: waste,
        measurementNotes: manual
          ? `Contractor-entered takeoff: ${t.squares.toFixed(1)} squares (${num(t.areaSqft ?? 0)} sq ft), ${pitchNote}. No facet or linear-footage breakdown; allow for ridge, valley and flashing.`
          : `${AERIAL.vendor} (calibrated): ${t.squares.toFixed(1)} squares (${num(t.areaSqft ?? 0)} sq ft) for the main structure, ${pitchNote}, footprint ${
              structure?.footprintSqft != null ? num(structure.footprintSqft) + " sq ft" : "not purchased"
            }.${extrasNote} No facet or linear-footage breakdown — the drawing tool is offline; allow for ridge/valley/flashing from the aerial photo.`,
      });
      if (!res.ok) {
        if (reportPlanLimitResult(res)) return;
        throw new Error(res.error);
      }
      if (res.disabled) toast.info("AI disabled · sample estimate loaded");
      setTitle(res.data.title);
      setAssumptions(res.data.assumptions);
      setMaterials(res.data.materials.map((m) => ({ id: nanoid(6), ...m })));
      setLabor(res.data.labor.map((m) => ({ id: nanoid(6), ...m })));
      toast.success("Estimate ready");
    } catch (err) {
      toast.error("Generation failed", errMsg(err));
    } finally {
      setGenBusy(false);
    }
  }

  async function convert() {
    if (!measurement && !manual) return;
    if (isRecon) {
      toast.error("Estimated measurements can’t become a proposal", "Run Instant measure for this address first.");
      return;
    }
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      const res = await convertRoofEstimateToProposal({
        title: title || `Roof · ${siteAddress || "site"}`,
        scope: assumptions.join("\n"),
        materials: materials.map(stripId),
        labor: labor.map(stripId),
        assumptions,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as Parameters<typeof router.push>[0]);
    } catch (err) {
      setConvertBusy(false);
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't convert", errMsg(err));
    }
  }

  // ── Derived report figures: the MAIN structure, plus whatever the contractor ticked ──
  // EagleView answers with every structure on the parcel (12117: the house and
  // nineteen outbuildings). The page is about one of them — the one the
  // server chose and recorded (provenance.mainStructure), or, for rows saved
  // before that existed, the same rule applied here — and the rest are listed
  // with checkboxes. A ticked structure joins the total and the estimate.
  const inst = measurement?.instant ?? null;
  const prov = measurement?.provenance;
  const veto = (prov as Record<string, unknown> | undefined)?.parcelVeto as { foreignStructures?: string[] } | undefined;
  const mainPick: { index: number | null; how: string } = !inst
    ? { index: null, how: "none" }
    : prov?.mainStructure
      ? { index: prov.mainStructure.index, how: prov.mainStructure.how }
      : pickMainStructure(inst.structures, {
          foreign: foreignIndices(veto?.foreignStructures),
          origin: measurement?.lat != null && measurement?.lng != null ? { lat: measurement.lat, lng: measurement.lng } : null,
          parcelKnown: !!veto,
        });
  const structure: InstantStructure | null = inst && mainPick.index != null ? (inst.structures[mainPick.index] ?? null) : null;
  const otherStructures = inst ? inst.structures.map((s, i) => ({ s, i })).filter(({ i }) => i !== mainPick.index) : [];
  const includedStructures: InstantStructure[] = structure
    ? [structure, ...otherStructures.filter(({ i }) => extra.has(i)).map(({ s }) => s)]
    : [];
  const totals = inst
    ? includedStructures.length
      ? instantTotalsOf(includedStructures)
      : inst.totals
    : manual
      ? manualTotals(manual)
      : null;
  const siteAddress = measurement?.address ?? manual?.address ?? null;

  // Measured pitch (provenance.pitchMeasurement — the retired line's DSM
  // measurement, saved by the data path). Families are rounded to whole /12
  // for display, largest area first; the exact figures stay in provenance.
  const pitchRep = (measurement?.provenance as Record<string, unknown> | undefined)?.pitchMeasurement as
    | {
        source: "measured" | "instant";
        families: Array<{ pitch12: number; planSqft: number }>;
        trustedShare: number;
        instantPitch12?: number | null;
        disagrees?: boolean;
        reason?: string;
      }
    | undefined;
  const pitchMeasured = pitchRep?.source === "measured" && pitchRep.families.length > 0;
  // EagleView's published pitch for the MAIN structure (null without pack 002).
  const evPitch = manual ? null : structure?.pitch ?? null;
  // Where the pitch the page shows (and prices) comes from — never a default.
  const pitchKind: "measured" | "eagleview" | "entered" | null = manual
    ? "entered"
    : pitchMeasured
      ? "measured"
      : evPitch
        ? "eagleview"
        : pitchEntered
          ? "entered"
          : null;
  const pitchLabelShown = manual
    ? totals?.pitchLabel ?? "—"
    : displayedPitchLabel(pitchRep, evPitch) ?? pitchEntered ?? "—";
  const pitchHint =
    pitchKind === "measured"
      ? `measured · ${Math.round((pitchRep!.trustedShare ?? 0) * 100)}% of roof`
      : pitchKind === "entered"
        ? "rise / 12 · entered by hand"
        : pitchKind === "eagleview"
          ? `rise / 12 · ${AERIAL.reported}`
          : measurement && !inst
            ? "drawing pipeline (legacy) · no source"
            : "pitch not available — enter pitch to price";
  // The pitch the estimate will be priced on, or null: no pitch, no estimate.
  const pitchForEstimate = pitchKind === "measured" ? `${Math.round(pitchRep!.families[0].pitch12)}/12` : pitchKind === "eagleview" ? evPitch : pitchKind === "entered" ? (manual ? manual.pitchLabel : pitchEntered) : null;
  const eaveHeights = structure?.eaveHeightFt
    ? Object.entries(structure.eaveHeightFt).map(([facade, ft]) => ({ facade, ft }))
    : [];
  // The provider's own score for the eave figure (one score for the whole
  // field, 0..1; "not scored" was dropped at parse). Identical classes on all
  // four sides read as suspicious — this says how much the provider itself
  // stands behind them.
  const eaveConf = structure?.confidence?.eaveHeightFt ?? null;
  const hasDetails = eaveHeights.length > 0 || !!structure || (measurement?.chimneys.length ?? 0) > 0;
  // "EagleView data packs: area ✓ · pitch ✗ (not entitled) · …" — one line
  // under the hero figures naming what was bought and what the account was
  // refused, so a "—" in a cell is read as "not purchased", not "not measured".
  const packsLine = React.useMemo(() => {
    const ip = measurement?.provenance?.instantPacks;
    if (!ip || (!ip.denied.length && !ip.missing.length && !ip.failed.length && !ip.unknown?.length)) return null;
    const NAMES: Record<string, string> = {
      property_data_id_001: "area",
      property_data_id_002: "pitch",
      property_data_id_003: "material & condition",
      property_data_id_004: "roof age",
      property_data_id_005: "shape & details",
      property_data_id_007: "outline",
      property_data_id_008: "imagery",
    };
    const parts = Object.keys(NAMES).map((pack) => {
      const name = NAMES[pack];
      if (ip.have.includes(pack)) return `${name} ✓`;
      if (ip.unknown?.includes(pack)) return `${name} ?`;
      return `${name} ✗`;
    });
    return `${AERIAL.coverage}: ` + parts.join(" · ");
  }, [measurement]);
  const reconDown = measurement?.provenance?.reconUnavailable ?? null;
  const partialCoverage = measurement?.provenance?.partialCoverage ?? null;
  const photoShown = view === "satellite" ? satPhoto : orthoPhoto;
  const photoError = view === "satellite" ? satErr : orthoErr;

  return (
    <>
      {/* ===== INTAKE: measure a roof ===== */}
      <section className={"ppanel" + (panel === "intake" ? "" : " is-hidden")} data-panel="intake">
        <div className="card rf-card">
          <div className="rf-head rf-head--bar">
            <div>
              <div className="card-title">Measure a roof</div>
              <div className="card-sub">One address → measured figures from aerial data: area, pitch, structures and the aerial photo, ready to price.</div>
            </div>
            <span className="chip ok">Instant · production</span>
          </div>

          <div className="rf-body">
            <p className="rf-note">
              <b>Instant measure</b> pulls real aerial property data in seconds — production account, billed
              per lookup; an already-paid answer for the same address is reused automatically. The drawing tool
              is offline while it is reworked: the page shows the measured <b>data</b> and the aerial photo.
            </p>

            <div className="addr-grid">
              <label className="est-field addr-wide">
                <span className="est-lbl">Address</span>
                <input ref={addrRef} className="est-in" id="addr" placeholder="4812 Maple Ave" autoComplete="off" />
              </label>
              <label className="est-field">
                <span className="est-lbl">City</span>
                <input className="est-in" id="city" placeholder="Bothell" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label className="est-field est-field--sm">
                <span className="est-lbl">State</span>
                <span className="bp-sel">
                  <select
                    className="bp-sel-in est-in"
                    id="state"
                    value={stateCode}
                    data-empty={stateCode ? undefined : "1"}
                    onChange={(e) => setStateCode(e.target.value)}
                  >
                    <option value="">State…</option>
                    {STATES.map((st) => (
                      <option key={st}>{st}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="est-field est-field--sm">
                <span className="est-lbl">ZIP</span>
                <input className="est-in" id="zip" placeholder="98011" value={zip} onChange={(e) => setZip(e.target.value)} />
              </label>
            </div>

            {/* Pin-on-the-roof check before the BILLED lookup. Only a picked
                suggestion carries the rooftop point; free typing hides it. */}
            {picked && !picked.typed && picked.lat != null && picked.lng != null && (
              <AddressPinPreview lat={picked.lat} lng={picked.lng} label={picked.formatted} />
            )}

            <div className="rf-actions">
              <button className="btn btn-primary btn--sm" type="button" id="instantBtn" disabled={busy} onClick={() => void runInstant()}>
                <svg className="ic"><use href="#i-target" /></svg>
                {instantBusy ? "Measuring…" : "Instant measure"}
              </button>
            </div>

            {/* The no-EagleView path: the contractor's own squares + pitch price
                and convert exactly like a measured roof. See ManualTakeoff. */}
            <div className="rf-manual">
              <div className="rf-manual-head">
                <b>Already know the roof?</b> Enter the takeoff yourself — the roof size in squares and the
                pitch are enough to price it and turn it into a proposal. Nothing is ordered or billed.
              </div>
              <div className="rf-manual-grid">
                <label className="est-field est-field--sm">
                  <span className="est-lbl">Roof size · squares</span>
                  <input
                    className="est-in"
                    id="manSquares"
                    inputMode="decimal"
                    placeholder="24"
                    value={manSquares}
                    onChange={(e) => setManSquares(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runManual();
                    }}
                  />
                </label>
                <label className="est-field est-field--sm">
                  <span className="est-lbl">Pitch</span>
                  <span className="bp-sel">
                    <select className="bp-sel-in est-in" id="manPitch" value={manPitch} onChange={(e) => setManPitch(e.target.value)}>
                      {PITCHES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <button className="btn btn-ghost btn--sm" type="button" id="manualBtn" disabled={busy} onClick={runManual}>
                  <svg className="ic"><use href="#i-file" /></svg>
                  Price by hand
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent measurements — reopen a saved measurement without paying again. */}
        <div className="card rf-card rf-recent-card">
          <div className="rf-head rf-head--bar">
            <div>
              <div className="card-title">Recent measurements</div>
            </div>
            {recent.length > 0 && <span className="chip">{recent.length} saved</span>}
          </div>
          {recent.length > 0 ? (
            <ul className="lf-list rf-recent" id="rfRecent">
              {recent.map((r) => {
                const chip = SOURCE_CHIP[r.source];
                const addr = [r.address, [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
                return (
                  <li key={r.id}>
                    <button
                      className="rf-recent-row"
                      type="button"
                      disabled={busy}
                      aria-busy={openingId === r.id || undefined}
                      onClick={() => openRecent(r.id)}
                    >
                      <span className="rf-recent-main">
                        <span className="rf-recent-addr">{addr || "Unnamed site"}</span>
                        <span className="rf-recent-meta">
                          {dateShort(r.createdAt)}
                          {r.predominantPitch ? ` · ${r.predominantPitch}` : ""}
                          {r.facetCount != null ? ` · ${r.facetCount} facets` : ""}
                          {r.pitchKind === "legacy" ? " · drawing pipeline (legacy)" : ""}
                        </span>
                      </span>
                      <span className={"chip rf-recent-src " + chip.tone}>{chip.label}</span>
                      <span className="rf-recent-fig">
                        {r.squares != null ? num(r.squares, 1) : r.areaSqft != null ? num(r.areaSqft) : "—"}
                        <span>{r.squares != null ? "sq" : r.areaSqft != null ? "sq ft" : ""}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rf-recent-empty">
              {recentBusy ? "Loading…" : recentError ? `Couldn’t load history — ${recentError}` : "No measurements yet — the first one lands here"}
            </div>
          )}
        </div>
      </section>

      {/* ===== MEASUREMENT IN PROGRESS ===== */}
      <section className={"ppanel" + (panel === "measuring" ? "" : " is-hidden")} data-panel="measuring">
        <div className="card rf-card measuring">
          <div className="ms-body">
            <div className="ms-num">{msReport}</div>
            <div className="ms-stage">{MS_STAGES[msStage]}</div>
            <div className="ms-track">
              <span className="ms-fill" style={{ width: `${Math.min(100, 8 + msStage * 24)}%` }} />
            </div>
            <div className="ms-hint">
              {msHint ?? "Measuring the structure, pitch by pitch."}
            </div>
          </div>
        </div>
      </section>

      {/* ===== RESULT ===== */}
      <section className={"ppanel" + (panel === "report" && (measurement || manual) ? "" : " is-hidden")} data-panel="report">
        {(measurement || manual) && (
          <>
            {manual && (
              <div className="rf-notice">
                <div className="call info">
                  <div>
                    <span className="rf-stamp">ENTERED BY HAND</span>
                    These figures are yours, not measured — {num(manual.squares, 1)} squares at {manual.pitchLabel}
                    {manual.address ? ` for ${manual.address}` : ""}. The estimate and the proposal carry them as
                    stated; nothing was ordered from the aerial data provider and nothing is saved to Recent measurements.
                  </div>
                </div>
              </div>
            )}
            {(builtByOldPipeline || unsaved || reconDown || partialCoverage || pitchRep?.disagrees || (assessment && assessment.confidence !== "high")) && (
              <div className="rf-notice">
                {builtByOldPipeline && (
                  <div className="call warn">
                    <div>
                      <span className="rf-stamp">MEASURED BY THE PREVIOUS PIPELINE</span>
                      This measurement was saved by the earlier drawing pipeline and is shown exactly as it was
                      recorded — reopening a measurement never re-measures it. Its figures are the aerial data’s
                      calibrated totals and remain valid.
                    </div>
                  </div>
                )}
                {reconDown && (
                  <div className="call warn">
                    <div>
                      <span className="rf-stamp">ELEVATION DATA NOT RECEIVED</span>
                      The aerial elevation data for this address did not arrive
                      {reconDown.kind === "config" ? " because the imagery service rejected our request" : " in time"}
                      , so the source-status figures (coverage, registration) are absent. This is not a statement
                      about the address — the measured totals above are unaffected. Measure again — the
                      paid answer is reused, so a retry costs nothing.
                      {reconDown.message && <span className="rf-why">{reconDown.message}</span>}
                      <button
                        type="button"
                        className="btn btn-primary btn--sm"
                        onClick={() => void runInstant()}
                        disabled={instantBusy}
                      >
                        {instantBusy ? "Measuring…" : "Measure again — free"}
                      </button>
                    </div>
                  </div>
                )}
                {assessment && assessment.confidence !== "high" && (
                  <div className="call warn">
                    <div>
                      <span className="rf-stamp">{confidenceLabel(assessment.confidence)}</span>
                      {assessment.reasons.join(" ")}
                      {!assessment.estimable && <> These figures should not be used to price the job as they stand.</>}
                    </div>
                  </div>
                )}
                {partialCoverage && (
                  <div className="call warn">
                    <div>
                      <b>Part of the property was not measured.</b> {partialCoverage.reason} Only{" "}
                      {partialCoverage.measuredStructures}{" "}
                      {partialCoverage.measuredStructures === 1 ? "building is" : "buildings are"} included in the
                      figures below — check the aerial view and add anything missing by hand.
                    </div>
                  </div>
                )}
                {pitchRep?.disagrees && (
                  <div className="call info">
                    <div>
                      <b>Measured pitch differs from the reported figure.</b> The elevation data measures{" "}
                      {pitchRep.families[0].pitch12.toFixed(1)}/12 on this roof; the reported figure is{" "}
                      {pitchRep.instantPitch12}/12. The measured figure is shown; both are recorded.
                    </div>
                  </div>
                )}
                {unsaved && (
                  <div className="call warn">
                    <div>
                      <b>Measured but not saved.</b> The figures below are real, but the record could not be
                      written, so this measurement will not appear in Recent measurements.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="card rf-hero" id="rfHero">
              <HeroCell l="Total area" v={totals?.areaSqft != null ? num(totals.areaSqft) : "—"} h="sq ft" />
              <HeroCell l="Roofing squares" v={totals?.squares != null ? num(totals.squares, 1) : "—"} h="× 100 sq ft" accent />
              <HeroCell l="Predominant pitch" v={pitchLabelShown} h={pitchHint} />
              <HeroCell l="Roof facets" v={totals?.facetCount != null ? String(totals.facetCount) : "—"} h="planes" />
            </div>
            {/* Which EagleView packs this answer is made of. Shown only when the
                measurement knows (rows since per-pack ordering, 2026-09-08) and
                something is not there — a full seven-pack answer says nothing. */}
            {packsLine && (
              <div className="rf-notice">
                <div className="rf-note rf-packs">{packsLine}</div>
              </div>
            )}

            {measurement && (
            <div className="rf-grid">
              <div className="card rf-card rf-viewer">
                <div className="rf-head rf-head--bar">
                  <div>
                    <div className="card-title" id="vwTitle">{view === "satellite" ? "Satellite view" : "Ortho view"}</div>
                    <div className="card-sub" id="vwSub">
                      {[measurement.address, [measurement.city, measurement.state].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Roof"}
                      {savedId ? ` · DRAWING № RM-${savedId.slice(-6).toUpperCase()}` : ""}
                    </div>
                  </div>
                  <div className="vw-controls">
                    {/* The 2D|3D switch, verbatim — only the labels changed. */}
                    <div className="vsw" id="viewSwitch" role="radiogroup" aria-label="Photo source">
                      {(["satellite", ...(hasOrtho ? (["ortho"] as const) : [])] as PhotoView[]).map((v) => (
                        <button
                          key={v}
                          className={"vsw-btn" + (view === v ? " active" : "")}
                          type="button"
                          role="radio"
                          aria-checked={view === v}
                          onClick={() => switchView(v)}
                        >
                          {v === "satellite" ? "Satellite" : AERIAL.ortho}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rf-canvas rf-canvas--live" id="rfCanvas">
                  {/* `.rfx` exempts the viewer from the donor reset; `.rf-stage`
                      gives the photo the same fixed box the drawing had. */}
                  <div className="rfx rf-stage">
                    {/* The live map stays mounted across the tab switch so the
                        user's pan/zoom survives a look at the ortho. */}
                    {liveMap && <div ref={mapHostRef} className="rf-map" hidden={view !== "satellite"} aria-label="Satellite map" />}
                    {liveMap && view === "satellite" && (
                      <button
                        type="button"
                        className="rf-home"
                        onClick={recenterMap}
                        title="Back to the house"
                        aria-label="Back to the house"
                      >
                        <svg className="ic"><use href="#i-roof" /></svg>
                      </button>
                    )}
                    {(view === "ortho" || !liveMap) && (photoShown ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from the server-side photo cache; next/image adds nothing here */}
                        <img
                          src={photoShown}
                          alt={view === "satellite" ? "Satellite view" : AERIAL.ortho}
                          className="rf-photo"
                        />
                        {/* The static photo is CENTERED on the measured point
                            (getMeasurementPhoto: center=lat,lng), so a pin
                            anchored to the stage's centre is exact. Ortho is
                            EagleView's own crop — no such guarantee, no pin. */}
                        {view === "satellite" && (
                          <div className="rf-pin-center" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" />
                              <circle cx="12" cy="9" r="2.5" fill="#fff" />
                            </svg>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rf-3d-loading">
                        {photoBusy ? "Loading photo…" : photoError ? `Photo unavailable — ${photoError}` : " "}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rf-legend" id="rfLegend">
                  <span className="lg">
                    {view === "satellite"
                      ? liveMap
                        ? "Google Maps satellite · the pin marks the measured point · drag to pan · scroll to zoom"
                        : "Google Maps satellite · the pin marks the measured point"
                      : `${AERIAL.ortho}${orthoShotDate ? ` · ${orthoShotDate}` : ""}`}
                  </span>
                </div>
              </div>

              <div className="rf-side">
                {hasDetails && (
                  <div className="card rf-card">
                    <div className="rf-head">
                      <div className="card-title">Details</div>
                      <div className="card-sub">{AERIAL.property}</div>
                    </div>
                    <dl className="rf-details" id="rfDetails">
                      {eaveHeights.length > 0 && (
                        <>
                          {/* EagleView's per-facade figure, in 10 ft classes (9903: 10 on every side;
                              12117: 20 on the house, 10 on the outbuildings) — a class, not a measurement. */}
                          <div className="rf-details-sec">
                            Eave height · {AERIAL.eave}
                            {eaveConf != null && ` · ${Math.round(eaveConf * 100)}% confidence`}
                          </div>
                          {eaveHeights.map((e) => (
                            <div className="rf-details-row" key={e.facade}>
                              <dt>{FACADE[e.facade] ?? e.facade}</dt>
                              <dd>
                                {num(e.ft)}
                                <span>ft</span>
                              </dd>
                            </div>
                          ))}
                        </>
                      )}
                      {structure && (
                        <>
                          <div className="rf-details-sec">Property data</div>
                          <div className="rf-details-row"><dt>Chimney</dt><dd>{yesNo(structure.chimney)}</dd></div>
                          <div className="rf-details-row"><dt>Solar panels</dt><dd>{yesNo(structure.solarPanels)}</dd></div>
                          <div className="rf-details-row"><dt>Rooftop AC</dt><dd>{structure.rooftopAcCount ?? "—"}</dd></div>
                          <div className="rf-details-row"><dt>Material</dt><dd>{structure.material ?? "—"}</dd></div>
                          <div className="rf-details-row"><dt>Condition</dt><dd>{structure.conditionRating ?? "—"}</dd></div>
                          <div className="rf-details-row">
                            <dt>Roof age</dt>
                            <dd>
                              {structure.roofAgeYears != null ? (
                                <>
                                  {num(structure.roofAgeYears)}
                                  <span>yrs</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                        </>
                      )}
                      {measurement.chimneys.length > 0 && (
                        <>
                          <div className="rf-details-sec">Penetrations detected</div>
                          {measurement.chimneys.map((c, i) => (
                            <div className="rf-details-row" key={i}>
                              <dt>
                                {c.kind.charAt(0).toUpperCase() + c.kind.slice(1)} <span className="rf-details-how">{c.method}</span>
                              </dt>
                              <dd>
                                {Math.round(c.confidence * 100)}
                                <span>% conf.</span>
                              </dd>
                            </div>
                          ))}
                        </>
                      )}
                    </dl>
                  </div>
                )}
                <div className="card rf-card">
                  <div className="rf-head">
                    <div className="card-title">Structures</div>
                    <div className="card-sub">
                      {structure
                        ? `Main structure: ${structure.areaSqft != null ? num(structure.areaSqft) + " sq ft" : "no area"}${structure.footprintSqft != null ? ` · footprint ${num(structure.footprintSqft)} sq ft` : ""}${mainPick.how === "nearest-pin" ? " · nearest the pin" : mainPick.how === "area+parcel" ? " · largest on the parcel" : ""}`
                        : `${measurement.instant?.structures.length ?? 0} on the property`}
                    </div>
                  </div>
                  {otherStructures.length > 0 && (
                    /* The Details card's own <dl> rhythm and the page's
                       checklist mark (.rf-attach): nothing new is styled. */
                    <dl className="rf-details rf-others">
                      <div className="rf-details-sec">
                        Other structures on the parcel · {otherStructures.length} ·{" "}
                        {num(otherStructures.reduce((a, { s }) => a + (s.areaSqft ?? 0), 0))} sq ft
                      </div>
                      <div className="rf-note">Off by default. Tick one to add it to the total and the estimate.</div>
                      {otherStructures.map(({ s, i }) => (
                        <div className="rf-details-row" key={i}>
                          <dt>
                            <label className={"rf-attach" + (extra.has(i) ? "" : " is-off")}>
                              <input
                                type="checkbox"
                                checked={extra.has(i)}
                                onChange={(e) => {
                                  const next = new Set(extra);
                                  if (e.target.checked) next.add(i); else next.delete(i);
                                  setExtra(next);
                                }}
                              />
                              s{i}
                            </label>
                          </dt>
                          <dd>
                            {s.areaSqft != null ? num(s.areaSqft) : "—"}
                            <span>sq ft</span>
                            {s.pitch && <span>· {s.pitch}</span>}
                            {s.footprintSqft != null && <span>· footprint {num(s.footprintSqft)}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </div>
            )}

            <div className="card rf-card rf-build">
              <div className="rf-head rf-head--bar">
                <div>
                  <div className="card-title">Build an estimate</div>
                  <div className="card-sub">
                    {isRecon
                      ? "These measurements are estimated from aerial imagery, so they can’t be priced. Run Instant measure for this address to build a quote."
                      : manual && totals?.squares != null
                        ? `Priced from your own takeoff — ${totals.squares.toFixed(1)} squares at ${manual.pitchLabel}. Adjust waste and generate.`
                        : totals?.squares != null
                          ? `Measurements feed the takeoff — adjust waste and price it out against the measured ${totals.squares.toFixed(1)} squares.`
                          : "Measurements feed the takeoff."}
                    {!isRecon ? " Linear footage is not included while the drawing tool is offline." : ""}
                  </div>
                </div>
                <div className="build-ctl">
                  <label className="est-field est-field--sm">
                    <span className="est-lbl">Waste factor</span>
                    <span className="bp-sel">
                      <select className="bp-sel-in est-in" id="waste" value={waste} onChange={(e) => setWaste(Number(e.target.value))}>
                        {WASTES.map((w) => (
                          <option key={w} value={w}>
                            {w}%
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  {!manual && !pitchMeasured && !evPitch && totals?.squares != null && (
                    /* EagleView supplied no pitch (pack 002 not bought): the
                       contractor states one, and the estimate says so. */
                    <label className="est-field est-field--sm">
                      <span className="est-lbl">Pitch · enter</span>
                      <span className="bp-sel">
                        <select
                          className="bp-sel-in est-in"
                          id="pitchEntered"
                          value={pitchEntered ?? ""}
                          onChange={(e) => setPitchEntered(e.target.value || null)}
                        >
                          <option value="">Select pitch…</option>
                          {PITCHES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>
                  )}
                  <button
                    className="btn btn-primary btn--sm"
                    type="button"
                    id="buildBtn"
                    disabled={isRecon || genBusy || totals?.squares == null || assessment?.estimable === false || !pitchForEstimate}
                    title={
                      assessment?.estimable === false
                        ? "Part of this property is missing from the figures, so they are not reliable enough to price from."
                        : !pitchForEstimate
                          ? "Enter the pitch first — the aerial data has none for this roof."
                          : undefined
                    }
                    onClick={() => void generate()}
                  >
                    <svg className="ic"><use href="#i-bulb" /></svg>
                    {genBusy ? "Generating…" : "Generate estimate"}
                  </button>
                </div>
              </div>
              <div className={"build-out" + (hasEstimate ? "" : " is-hidden")} id="buildOut">
                {hasEstimate && (
                  <>
                    <EstimateTable title={`Materials · ${waste}% waste`} rows={materials} />
                    <EstimateTable title="Labor" rows={labor} />
                    {assumptions.length > 0 && (
                      <div className="bo-assume">
                        <span className="kpi-lbl">Assumptions</span>
                        <ul>
                          {assumptions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="bo-total">
                      <span className="kpi-lbl">Estimate total</span>
                      <span className="bo-total-v">{money(materialsTotal + laborTotal)}</span>
                      <span className="bo-total-acts">
                        <button className="btn btn-primary btn--sm" type="button" id="convertBtn" disabled={convertBusy || isRecon} onClick={() => void convert()}>
                          <svg className="ic"><use href="#i-file" /></svg>
                          {convertBusy ? "Creating…" : "Convert to proposal"}
                        </button>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <AgainPortal
        show={panel === "report"}
        disabled={busy}
        onClick={() => {
          setPanel("intake");
        }}
        showRemeasure={panel === "report" && reusedInstant != null}
        onRemeasure={() => void runInstant(true)}
      />
      {/* The photo CARD is square (owner's call): the card hugs the square
          stage, head and caption ride above/below it, and DETAILS/STRUCTURES
          move up beside it in the same grid row — no black bars, no holes.
          A non-square ortho is centre-cropped to fill (cover), never
          letterboxed. On handheld the square goes full-width, details under.
          --sq sizes the square: bigger than the old 460px viewer (owner's
          call), scaling with the window so DETAILS keeps a real column. */}
      <style jsx global>{`
        .jf-blueprint .content .rf-grid {
          grid-template-columns: auto minmax(0, 1fr);
        }
        .jf-blueprint .content .rf-viewer {
          --sq: clamp(460px, 42vw, 680px);
          width: calc(var(--sq) + 3px);
          max-width: 100%;
        }
        .jf-blueprint .content .rf-viewer .card-sub {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .jf-blueprint .content .rf-canvas--live .rf-stage {
          width: var(--sq);
          height: var(--sq);
          max-width: 100%;
        }
        .jf-blueprint .content .rf-stage .rf-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .jf-blueprint .content .rf-stage .rf-map {
          width: 100%;
          height: 100%;
        }
        .jf-blueprint .content .rf-stage .rf-map[hidden] {
          display: none;
        }
        /* Back-to-the-house: top-right of the stage, clear of Google's
           bottom-right zoom control; the vsw's own hairline language. */
        .jf-blueprint .content .rf-stage .rf-home {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 5;
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          padding: 0;
          background: #fff;
          border: 1.5px solid var(--hair-soft);
          border-radius: var(--radius);
          color: var(--ink);
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
          transition: background 0.12s;
        }
        .jf-blueprint .content .rf-stage .rf-home:hover {
          background: var(--paper-deep);
        }
        /* Centre-anchored pin over the STATIC satellite photo (the photo is
           centred on the measured point). Tip of the pin sits on the exact
           centre; Google-marker red on purpose, to match the live map's pin. */
        .jf-blueprint .content .rf-stage .rf-pin-center {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -100%);
          z-index: 4;
          pointer-events: none;
          color: #ea4335;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
        }
        .jf-blueprint .content .rf-stage .rf-pin-center svg {
          display: block;
          width: 28px;
          height: 28px;
        }
        .jf-blueprint .content .rf-stage .rf-home .ic {
          width: 19px;
          height: 19px;
        }
        @media (max-width: 1100px) {
          .jf-blueprint .content .rf-grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .jf-blueprint .content .rf-viewer {
            width: auto;
          }
          .jf-blueprint .content .rf-canvas--live .rf-stage {
            width: 100%;
            height: auto;
            aspect-ratio: 1 / 1;
          }
        }
      `}</style>
    </>
  );
}

function HeroCell({ l, v, h, accent }: { l: string; v: string; h: string; accent?: boolean }) {
  return (
    <div className="hero-cell">
      <div className="kpi-lbl">{l}</div>
      <div className={"hero-v" + (accent ? " accent" : "")}>{v}</div>
      <div className="hero-h">{h}</div>
    </div>
  );
}

function EstimateTable({ title, rows }: { title: string; rows: EstimateLine[] }) {
  const sum = rows.reduce((a, r) => a + r.quantity * r.unitPrice, 0);
  return (
    <div className="bo-sec">
      <div className="bo-head">
        <span className="kpi-lbl">{title}</span>
        <span className="bo-sum">{money(sum)}</span>
      </div>
      <table className="bo-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th>Unit</th>
            <th className="num">Unit</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="num">{num(r.quantity, Number.isInteger(r.quantity) ? 0 : 1)}</td>
              <td>{r.unit}</td>
              <td className="num">{money(r.unitPrice)}</td>
              <td className="num">
                <b>{money(r.quantity * r.unitPrice)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The donor's "Measure another" button sits in `.page-actions` inside
// `.page-head`, which content.tsx renders above this component. Rendering it
// there from here keeps one source of truth for the panel state.
function AgainPortal({
  show,
  disabled,
  onClick,
  showRemeasure,
  onRemeasure,
}: {
  show: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** The shown result reused an already-paid answer — offer the explicit paid re-order. */
  showRemeasure?: boolean;
  onRemeasure?: () => void;
}) {
  // The host is a sibling in the same React tree, so it exists by the time this
  // commits; the store only exists to defer the lookup past SSR/hydration.
  const host = React.useSyncExternalStore(
    () => () => {},
    () => document.querySelector<HTMLElement>(".jf-blueprint .content #rfAgainHost"),
    () => null,
  );
  if (!host) return null;
  return createPortal(
    <>
      {showRemeasure && onRemeasure && (
        <button
          className={"btn btn-ghost" + (show ? "" : " is-hidden")}
          type="button"
          id="remeasureBtn"
          disabled={disabled}
          onClick={onRemeasure}
          title="This result reused already-paid aerial data. Re-measuring orders a fresh lookup, which is billed."
        >
          Re-measure — new paid lookup
        </button>
      )}
      <button className={"btn btn-ghost" + (show ? "" : " is-hidden")} type="button" id="againBtn" disabled={disabled} onClick={onClick}>
        <svg className="ic"><use href="#i-roof" /></svg>
        Measure another
      </button>
    </>,
    host,
  );
}
