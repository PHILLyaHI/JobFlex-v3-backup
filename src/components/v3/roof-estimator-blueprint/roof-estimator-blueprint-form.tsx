"use client";

// Roof estimator blueprint — the donor's markup on REAL data.
//
// The donor file (jobflex-roof-estimator-blueprint_3.html) drew four screens:
// intake → measuring → report → build. This component keeps the donor's
// markup class for class (rf-card / addr-grid / rf-hero / rf-grid / lf-list /
// pm-* / bo-table) and fills every figure from the measurement actions:
//
//   measureRoofInstant   "Instant measure" — EagleView Property Data (BILLED,
//                        production) + the free reconstruction, calibrated,
//                        chimney-scanned and saved as a RoofMeasurement
//   measureRoofFree      "Free estimate" — reconstruction only, saved as an
//                        ESTIMATE (never priced, never attached)
//   listRoofMeasurements "Recent measurements" — reopen without paying again
//   getRoofMeasurement
//   saveRoofDiagramPng   "Export PNG" — the client capture goes to Blob
//   estimateRoof         "Generate estimate" → materials / labor lines
//   convertRoofEstimateToProposal   (+ the diagram PNG as the first photo)
//
// The Measurement Orders flow (sample tiles, report price, order + polling)
// is gone from this page; its code stays in actions/eagleview.ts.
//
// Drawing: one pure layout (lib/roofDiagram/layout.ts) is built from the saved
// measurement and handed to the interactive RoofDiagram (2D) — the same layout
// the PNG export and the PDF route print, so every number on screen is the
// number on paper. Nothing here re-measures a polygon: figures come from the
// model's lengthFt / areaSqft / totals. The 3D view stays RoofModel3D.
//
// The viewers are Tailwind components, so their host carries `.rfx`, which
// exempts the subtree from the donor's `* { margin:0; padding:0 }` reset.
//
// It is an ordinary React child of the page (NOT a react-island): the convert
// action needs `useRouter()`, which a detached root has no context for.

import * as React from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import type { EvLineType, InstantStructure } from "@/lib/eagleview";
import { toast } from "@/components/ui/Toast";
import type { EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { LINE_COLORS, type LabelMode } from "@/components/estimator/roof/roofViz";
import { RoofDiagram, type RoofDiagramHandle } from "@/components/estimator/roof/RoofDiagram";
import { ALL_LAYERS_ON, type DiagramLayer, type DiagramLayers, type DiagramLayout } from "@/lib/roofDiagram/layoutTypes";
import { LAYER_LABELS, fmtArea, fmtLength, layoutFromMeasurement } from "@/lib/roofDiagram/layout";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { assessRoof, confidenceLabel } from "@/lib/roofDiagram/confidence";
import type { MeasurementSource, RoofMeasurementDTO, RoofMeasurementSummary } from "@/lib/roofDiagram/types";
import {
  getRoofMeasurement,
  listRoofMeasurements,
  measureRoofFree,
  measureRoofInstant,
  saveRoofDiagramPng,
} from "@/actions/roofMeasurement";
import { estimateRoof, convertRoofEstimateToProposal } from "@/actions/roofEstimator";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";
import { attachPlacesSuggest, type PickedPlace } from "@/components/v3/blueprint-shell/places-suggest";

// Three.js stays out of the page's first chunk; warmed after first paint below.
const RoofModel3D = dynamic(
  () => import("@/components/estimator/roof/RoofModel3D").then((m) => m.RoofModel3D),
  { ssr: false, loading: () => <div className="rf-3d-loading">Loading 3D…</div> },
);

/** Company header for the drawing — read on the server in page.tsx. */
export interface RoofCompany {
  name: string;
  logoUrl?: string | null;
}

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const WASTES = [8, 10, 12, 15];
const FACADE: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };
// Donor: the measuring screen's stage captions, re-worded for the pipeline
// (Instant request ∥ reconstruction → calibration → chimneys → save).
const MS_STAGES = ["Requesting data…", "Locating the structure…", "Tracing facets…", "Calibrating…", "Report ready"];
const LAYER_ORDER: DiagramLayer[] = ["lengths", "pitch", "area", "ids", "north", "chimneys", "legend"];
const RECENT_LIMIT = 12;

const SOURCE_CHIP: Record<MeasurementSource, { label: string; tone: "ok" | "wait" }> = {
  "instant+recon": { label: "Instant", tone: "ok" },
  "instant-outline": { label: "Outline", tone: "wait" },
  recon: { label: "Estimate", tone: "wait" },
};

const num = (n: number, d = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
/** "24.5 ft" → ["24.5", "ft"]; "588 sq ft" → ["588", "sq ft"]. Keeps the donor's value/unit split. */
const splitUnit = (s: string): [string, string] => {
  const i = s.indexOf(" ");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
};
const yesNo = (v: boolean | null | undefined) => (v == null ? "—" : v ? "Yes" : "No");
/** Rise of a "10/12" label, for the steep / low-slope callouts. */
const riseOf = (label: string) => Number(label.split("/")[0]);

type Panel = "intake" | "measuring" | "report";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stripId = ({ id: _id, ...rest }: EstimateLine) => rest;

/** The structure the drawing is of: the largest by roof area (footprint when area is missing). */
function mainStructure(structures: InstantStructure[] | undefined): InstantStructure | null {
  if (!structures?.length) return null;
  const size = (s: InstantStructure) => s.areaSqft ?? s.footprintSqft ?? -1;
  return structures.reduce((best, s) => (size(s) > size(best) ? s : best));
}

/**
 * Open the export tab SYNCHRONOUSLY inside the click, before any await — a
 * window.open after the capture is what popup blockers refuse. `null` here is
 * a real block (the "noopener" feature returns null by spec, so it is never
 * used; the opener is severed by hand instead).
 */
function openExportTab(): Window | null {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

/** Object URL for a PNG data URL — top-frame data: navigations are blocked. Revoked after a minute. */
async function objectUrlFromDataUrl(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

/**
 * Deliver the finished PNG: into the pre-opened tab when there is one, else
 * (popup blocked) as a download of the capture. One click → one tab, or one
 * file — never both.
 */
async function deliverPng(tab: Window | null, storedUrl: string | null, dataUrl: string): Promise<void> {
  if (tab) {
    tab.location.href = storedUrl ?? (await objectUrlFromDataUrl(dataUrl));
    return;
  }
  // The stored file lives on another origin, where `download` is ignored, so
  // the download is always the local capture.
  const a = document.createElement("a");
  a.href = await objectUrlFromDataUrl(dataUrl);
  a.download = "roof-diagram.png";
  a.click();
}

export function RoofEstimatorBlueprintForm({ aiEnabled, company }: { aiEnabled: boolean; company?: RoofCompany }) {
  const router = useRouter();

  // ── Screen ──
  const [panel, setPanel] = React.useState<Panel>("intake");
  const [msStage, setMsStage] = React.useState(0);
  const [msReport, setMsReport] = React.useState<string>("—");
  const [msHint, setMsHint] = React.useState<string | null>(null);

  // ── Measurement / viewer ──
  const [measurement, setMeasurement] = React.useState<RoofMeasurementDTO | null>(null);
  // Set when the action measured (and, for Instant, billed) but could not save.
  const [unsaved, setUnsaved] = React.useState(false);
  const [instantBusy, setInstantBusy] = React.useState(false);
  // Set when the shown measurement reused an already-paid EagleView answer —
  // the explicit paid re-measure button renders only then.
  const [reusedInstant, setReusedInstant] = React.useState<"stored" | "recovered" | null>(null);
  const [freeBusy, setFreeBusy] = React.useState(false);
  const [view, setView] = React.useState<"2d" | "3d">("2d");
  const [layers, setLayers] = React.useState<DiagramLayers>(ALL_LAYERS_ON);
  const [showHouse, setShowHouse] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const diagramRef = React.useRef<RoofDiagramHandle>(null);
  React.useEffect(() => {
    void import("@/components/estimator/roof/RoofModel3D");
  }, []);

  // One layout per measurement — the drawing, the PNG and the PDF all print it.
  const layout: DiagramLayout | null = React.useMemo(
    () => (measurement ? layoutFromMeasurement(measurement, { company }) : null),
    [measurement, company],
  );

  // ── The geometry gate (spec R01–R16, src/lib/roofDiagram/validate.ts) ──
  // A roof that breaks the invariants is not drawn — and nothing DERIVED from
  // that geometry is shown either. Withholding only the picture is the more
  // dangerous half-measure: a contractor prices from total sq ft, and an R04
  // failure means the printed area is inflated by the wrong slope factor. So
  // areas, squares, pitch, facet count, linear footage, waste, the estimate,
  // the exports and the 3D model all go with it. What survives is what does not
  // depend on the geometry: the address, the drawing number, and a way to go
  // trace the roof by hand.
  const gate = React.useMemo(
    () => (measurement ? validateRoofInvariants(measurement.model) : null),
    [measurement],
  );
  // Two states the gate used to conflate. Being unable to CHECK a roof is not
  // the same as checking it and finding it wrong, and only the second is a
  // reason to withhold the drawing.
  //
  //   CANNOT_VALIDATE  the validator could not read the model — its INPUT
  //                    precondition. Either the model has no facets at all (the
  //                    outline-only path saves exactly that, by design, and the
  //                    FACETS UNAVAILABLE stamp already explains it) or we have
  //                    handed it something malformed, which is OUR bug and
  //                    belongs in monitoring. Either way the plan is drawn.
  //   INVALID_GEOMETRY the model was read and the invariants failed. Blocks.
  const cannotValidate = !!gate && gate.errorCodes.includes("INPUT");
  // The drawing and the estimate are gated separately (confidence.ts). A plan
  // is withheld ONLY when the roof cannot be seen; invariant failures flag the
  // figures instead of hiding the roof, because four of the five failure
  // classes this branch found were defects in the rules, not in the roofs.
  const assessment = React.useMemo(
    () =>
      measurement
        ? assessRoof({
            coverage: measurement.provenance.coverage ?? null,
            structures:
              measurement.provenance.structures?.map((st) => ({
                prefix: st.prefix,
                contourSqft: st.contourSqft,
                share: st.coverage?.share ?? null,
              })) ?? null,
            errorCodes: gate?.errorCodes ?? [],
            cannotValidate,
            pitchSource: measurement.provenance.pitchSource ?? null,
            nestedOutlines: measurement.provenance.nestedOutlines ?? null,
            unrecognisedFacets: measurement.provenance.unrecognisedFacets ?? null,
            visionCorroborated: measurement.provenance.visionStructure?.corroborated ?? null,
          })
        : null,
    [measurement, gate, cannotValidate],
  );
  const gateBlocked = !!assessment && !assessment.drawable && process.env.NEXT_PUBLIC_ROOF_GATE !== "off";
  /**
   * Built by the OLD calibrated pipeline. Only that path stores a calibration
   * report; V2 and the outline-only fallback both store null, so this is the
   * reliable discriminator — and a saved row is always drawn from its own
   * stored model, never rebuilt, which is exactly the confusion this line
   * removes.
   */
  const builtByOldPipeline = !!measurement?.calibration;
  /** Instant already answered for this address, so offering to order a report is noise. */
  const hasInstant = measurement?.source === "instant+recon" || measurement?.source === "instant-outline";
  // A poll TIMEOUT on an accepted order is not "no coverage" — the paid order
  // exists and is collected free on the next measure. Never suggest ordering a
  // report while one is already bought and waiting.
  const pendingInstantOrder = measurement?.provenance?.instantMissing?.pendingOrderId ?? null;
  const suggestReport = pendingInstantOrder
    ? "A paid EagleView order for this address is still processing — measure again in a minute to collect it at no extra cost."
    : "or order an EagleView report for this address.";
  React.useEffect(() => {
    if (!gate || !measurement) return;
    const where = measurement.address ?? "(no address)";
    if (cannotValidate) {
      // error, not warn: a roof we cannot check is a hole in the check, and it
      // should be visible in monitoring rather than sitting in a console.
      console.error(
        `[roof-gate] CANNOT_VALIDATE ${where} — the validator could not read the model` +
          ` (${measurement.model.faces.length} facets, ${measurement.model.lines.length} lines).` +
          " Drawing anyway; this is a pipeline defect unless the model is outline-only.",
      );
      return;
    }
    if (gate.errors > 0) {
      console.warn(`[roof-gate] INVALID_GEOMETRY ${where} — ${gate.errors} error(s): ${gate.errorCodes.join(", ")}`);
    }
  }, [gate, cannotValidate, measurement]);

  // ── Recent measurements ──
  const [recent, setRecent] = React.useState<RoofMeasurementSummary[]>([]);
  const [recentBusy, setRecentBusy] = React.useState(true);
  const [recentError, setRecentError] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);

  // The list refreshes silently after a save; `recentBusy` only covers the
  // first load, so the empty state reads "Loading…" rather than "No
  // measurements yet" before the answer arrives.
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
  const [attachDiagram, setAttachDiagram] = React.useState(true);

  // A free estimate is never priced and never attached to a proposal.
  const isRecon = measurement?.source === "recon";
  const savedId = measurement && !unsaved && measurement.id !== "unsaved" ? measurement.id : null;
  const hasEstimate = materials.length > 0 || labor.length > 0;
  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  // Also holds while a PNG upload runs, so the measurement it lands on cannot
  // be swapped out from under it.
  const busy = instantBusy || freeBusy || openingId != null || exporting;

  function resetResult() {
    setMeasurement(null);
    setUnsaved(false);
    setMaterials([]);
    setLabor([]);
    setAssumptions([]);
    setLayers(ALL_LAYERS_ON);
    setView("2d");
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

  function showMeasurement(m: RoofMeasurementDTO, wasUnsaved: boolean) {
    setMeasurement(m);
    setUnsaved(wasUnsaved);
    setPanel("report");
  }

  // Instant measure. A repeat of an address the org already paid for REUSES
  // the stored EagleView answer (no new bill); `forceNewOrder` is the explicit
  // "re-measure at a new cost" gesture and is never set by a plain click.
  async function runInstant(forceNewOrder = false) {
    if (!picked?.address) {
      addrRef.current?.focus();
      return;
    }
    if (forceNewOrder && !window.confirm("Order a NEW EagleView lookup for this address? This is billed, even though a paid answer already exists.")) {
      return;
    }
    resetResult();
    setInstantBusy(true);
    setReusedInstant(null);
    setMsReport("Instant measure");
    setMsHint("EagleView Property Data (production, billed per lookup) and the aerial reconstruction run together, then the facets are calibrated to EagleView’s figures.");
    setPanel("measuring");
    const stop = runStages();
    try {
      const res = await measureRoofInstant(orderInput(), forceNewOrder ? { forceNewOrder } : undefined);
      if (!res.ok) throw new Error(res.error);
      stop();
      setMsStage(MS_STAGES.length - 1);
      await sleep(420);
      showMeasurement(res.measurement, !!res.unsaved);
      setReusedInstant(res.reusedInstant?.how ?? null);
      const t = res.measurement.model.totals;
      toast.success(
        res.unsaved ? "Roof measured — not saved" : "Roof measured",
        `${t.facetCount} facets · ${t.squares.toFixed(1)} squares` +
          (res.reusedInstant
            ? res.reusedInstant.how === "recovered"
              ? " · collected the earlier paid order — nothing new was billed"
              : " · reused the already-paid EagleView answer — nothing new was billed"
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

  // Free estimate — reconstruction only, no charge, saved as an ESTIMATE.
  async function runFree() {
    if (!picked?.address) {
      addrRef.current?.focus();
      return;
    }
    resetResult();
    setFreeBusy(true);
    setMsReport("Free estimate");
    setMsHint("Reconstructing the roof from Google aerial elevation data — no charge. The result is an estimate: it can be drawn and exported, not priced.");
    setPanel("measuring");
    const stop = runStages();
    try {
      const res = await measureRoofFree(orderInput());
      if (!res.ok) throw new Error(res.error);
      stop();
      setMsStage(MS_STAGES.length - 1);
      await sleep(420);
      showMeasurement(res.measurement, !!res.unsaved);
      const t = res.measurement.model.totals;
      toast.success("Roof estimated from aerial imagery", `${t.facetCount} facets · ${t.squares.toFixed(1)} squares`);
      if (!res.unsaved) void loadRecent();
    } catch (err) {
      stop();
      setPanel("intake");
      toast.error("Couldn't estimate this roof", errMsg(err));
    } finally {
      setFreeBusy(false);
    }
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

  function toggleLayer(k: DiagramLayer) {
    setLayers((l) => ({ ...l, [k]: !l[k] }));
  }

  // Export PNG: capture the combined sheet on the client, store it with the
  // measurement (Blob), open the stored file. Unsaved measurements and a
  // disabled Blob store fall back to the capture itself. The tab is opened
  // before the first await (see openExportTab) and closed only when there is
  // nothing to show in it.
  async function exportPng() {
    const handle = diagramRef.current;
    if (!handle || !measurement || exporting) return;
    const tab = openExportTab();
    setExporting(true);
    try {
      const dataUrl = await handle.toPngDataUrl({ scale: 2, layers });
      let storedUrl: string | null = null;
      if (savedId) {
        const res = await saveRoofDiagramPng(savedId, dataUrl).catch(
          (err: unknown) => ({ ok: false as const, error: errMsg(err) }),
        );
        if (res.ok) {
          storedUrl = res.pngUrl;
          // Keyed on the id: the user may have opened another measurement
          // while the upload ran.
          setMeasurement((prev) => (prev && prev.id === savedId ? { ...prev, pngUrl: res.pngUrl } : prev));
          toast.success("PNG exported");
          void loadRecent();
        } else {
          // The capture still opens; only the stored copy is missing.
          toast.info("PNG not stored", res.error);
        }
      }
      await deliverPng(tab, storedUrl, dataUrl);
    } catch (err) {
      tab?.close();
      toast.error("Couldn't export PNG", errMsg(err));
    } finally {
      setExporting(false);
    }
  }

  async function generate() {
    if (!measurement || !layout) return;
    if (isRecon) {
      toast.error(
        "Estimated measurements can’t be priced",
        "Run Instant measure for this address to build a priced estimate.",
      );
      return;
    }
    setGenBusy(true);
    try {
      const t = layout.totals;
      const facetSummary = layout.facets
        .slice(0, 12)
        .map((f) => `${f.label}: ${f.pitchLabel} pitch, ${f.areaLabel}`)
        .join("; ");
      const footageSummary = t.footage.map((r) => `${r.label} ${fmtLength(r.ft)}`).join(", ");
      const res = await estimateRoof({
        address: measurement.address || undefined,
        lat: measurement.lat ?? undefined,
        lng: measurement.lng ?? undefined,
        pitch: t.predominantPitch,
        squares: Number(t.squares.toFixed(1)),
        wastePct: waste,
        measurementNotes: `EagleView measured: ${t.squares.toFixed(1)} squares (${fmtArea(t.areaSqft)}) across ${t.facetCount} facets.${footageSummary ? ` ${footageSummary}.` : ""}${facetSummary ? ` Facets — ${facetSummary}.` : ""}`,
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
    if (!measurement) return;
    if (isRecon) {
      toast.error("Estimated measurements can’t become a proposal", "Run Instant measure for this address first.");
      return;
    }
    // The diagram stays mounted (hidden) under the 3D view, so the ref is only
    // null when there is no drawing to capture — say so instead of attaching nothing.
    if (attachDiagram && !diagramRef.current) {
      toast.error("Switch to the 2D plan to attach the diagram");
      return;
    }
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      let previewDataUrl: string | undefined;
      if (attachDiagram && diagramRef.current) {
        try {
          previewDataUrl = await diagramRef.current.toPngDataUrl({ scale: 2 });
        } catch (err) {
          toast.info("Diagram not attached", errMsg(err));
        }
      }
      const res = await convertRoofEstimateToProposal({
        title: title || `Roof · ${measurement.address || "site"}`,
        scope: assumptions.join("\n"),
        materials: materials.map(stripId),
        labor: labor.map(stripId),
        assumptions,
        previewDataUrl,
        roofMeasurementId: attachDiagram && savedId ? savedId : undefined,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as Parameters<typeof router.push>[0]);
    } catch (err) {
      setConvertBusy(false);
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't convert", errMsg(err));
    }
  }

  // ── Derived report figures (all from the layout's totals) ──
  const totals = layout?.totals ?? null;
  const steepSqft = totals ? totals.pitchMix.filter((g) => riseOf(g.pitchLabel) >= 8).reduce((a, g) => a + g.areaSqft, 0) : 0;
  const lowSqft = totals ? totals.pitchMix.filter((g) => riseOf(g.pitchLabel) <= 2).reduce((a, g) => a + g.areaSqft, 0) : 0;
  const structure = mainStructure(measurement?.instant?.structures);
  const eaveHeights =
    totals?.eaveHeights ??
    (structure?.eaveHeightFt ? Object.entries(structure.eaveHeightFt).map(([facade, ft]) => ({ facade, ft })) : []);
  const flags = totals?.flags ?? {};
  // The 3D viewer paints one annotation at a time; it follows the first label layer that is on.
  const labelMode3d: LabelMode = layers.pitch ? "pitch" : layers.area ? "area" : layers.lengths ? "length" : "shaded";
  const hasDetails =
    eaveHeights.length > 0 || !!structure || (measurement?.chimneys.length ?? 0) > 0;

  return (
    <>
      {/* ===== INTAKE: measure a roof ===== */}
      <section className={"ppanel" + (panel === "intake" ? "" : " is-hidden")} data-panel="intake">
        <div className="card rf-card">
          <div className="rf-head rf-head--bar">
            <div>
              <div className="card-title">Measure a roof</div>
              <div className="card-sub">One address → a dimensioned roof plan: every facet’s pitch, area and edges, ready to price and print.</div>
            </div>
            <span className="chip ok">Instant · production</span>
          </div>

          <div className="rf-body">
            <p className="rf-note">
              <b>Instant measure</b> pulls real EagleView Property Data in seconds — production account, billed
              per lookup — and draws the plan from it. <b>Free estimate</b> reconstructs the roof from Google
              aerial elevation data — no charge, but it’s an estimate: it can’t be priced or attached to a proposal.
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

            <div className="rf-actions">
              <button className="btn btn-primary btn--sm" type="button" id="instantBtn" disabled={busy} onClick={() => void runInstant()}>
                <svg className="ic"><use href="#i-target" /></svg>
                {instantBusy ? "Measuring…" : "Instant measure"}
              </button>
              <button className="btn btn-ghost btn--sm" type="button" id="freeBtn" disabled={busy} onClick={runFree}>
                <svg className="ic"><use href="#i-roof" /></svg>
                {freeBusy ? "Estimating…" : "Free estimate"}
              </button>
            </div>
          </div>
        </div>

        {/* Recent measurements — reopen a saved drawing without paying again. */}
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
      <section className={"ppanel" + (panel === "report" && measurement && layout ? "" : " is-hidden")} data-panel="report">
        {measurement && layout && totals && (
          <>
            {(layout.stamps.length > 0 || unsaved || builtByOldPipeline || (assessment && assessment.confidence !== "high") || measurement.provenance.partialCoverage) && (
              <div className="rf-notice">
                {builtByOldPipeline && (
                  <div className="call warn">
                    <div>
                      <span className="rf-stamp">MEASURED BY THE PREVIOUS PIPELINE</span>
                      This drawing was built before the current measurement path and is shown exactly as it was saved —
                      reopening a measurement never redraws it. Its interior lines and facet count come from the older
                      method, so it is not comparable with a drawing measured today. Measure the address again to see
                      the current one.
                    </div>
                  </div>
                )}
                {layout.stamps.map((s) => (
                  <div className="call warn" key={s}>
                    <div>
                      <span className="rf-stamp">{s}</span>
                      {s === "ESTIMATE — NOT MEASURED" ? (
                        <>
                          Reconstructed from Google elevation data
                          {measurement.provenance.imageryDate ? ` captured ${measurement.provenance.imageryDate}` : ""}
                          {measurement.provenance.pixelSizeM != null ? ` at ${measurement.provenance.pixelSizeM} m/px` : ""}. Area and
                          pitch are typically within a few percent; this drawing can be exported but not priced or attached
                          to a proposal.
                          {measurement.provenance.googleAreaSqft != null && (
                            <> Google’s own figure for this roof: {fmtArea(measurement.provenance.googleAreaSqft)}.</>
                          )}
                        </>
                      ) : s === "FACETS UNAVAILABLE" ? (
                        <>
                          No usable aerial elevation data for this address, so the plan shows EagleView’s building
                          outline with the measured totals — facets, pitches and edge lengths are not drawn.
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
                {assessment && assessment.confidence !== "high" && (
                  <div className="call warn">
                    <div>
                      <span className="rf-stamp">{confidenceLabel(assessment.confidence)}</span>
                      {assessment.reasons.join(" ")}
                      {assessment.inferredShare != null && assessment.inferredShare > 0.05 && (
                        <>
                          {" "}The plan below draws the whole roof; the inferred part is drawn from the shape of what
                          is visible, not measured.
                        </>
                      )}
                      {!assessment.estimable && (
                        <> These figures should not be used to price the job as they stand.</>
                      )}
                    </div>
                  </div>
                )}
                {measurement.provenance.partialCoverage && (
                  <div className="call warn">
                    <div>
                      <b>Part of the property was not measured.</b>{" "}
                      {measurement.provenance.partialCoverage.reason} Only{" "}
                      {measurement.provenance.partialCoverage.measuredStructures}{" "}
                      {measurement.provenance.partialCoverage.measuredStructures === 1 ? "building is" : "buildings are"}{" "}
                      included in the figures below — check the aerial view and add anything missing by hand.
                    </div>
                  </div>
                )}
                {unsaved && (
                  <div className="call warn">
                    <div>
                      <b>Measured but not saved — export now.</b> The figures below are real, but the record could
                      not be written, so this measurement will not appear in Recent measurements. Export the PNG
                      before leaving the page.
                    </div>
                  </div>
                )}
              </div>
            )}

            {gateBlocked ? (
              <div className="card rf-card rf-gate-card">
                <div className="rf-head rf-head--bar">
                  <div>
                    <div className="card-title">Roof plan</div>
                    <div className="card-sub">
                      {[measurement.address, measurement.city, measurement.state, measurement.zip]
                        .filter(Boolean)
                        .join(", ")}
                      {savedId ? ` · DRAWING № RM-${savedId.slice(-6).toUpperCase()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="rf-gate">
                  <div className="rf-gate-title">ROOF NOT VISIBLE</div>
                  <p className="rf-gate-body">
                    {assessment?.reasons.join(" ")}{" "}
                    {hasInstant
                      ? "Trace the roof by hand from the aerial view."
                      : pendingInstantOrder
                        ? `Trace the roof by hand — ${suggestReport}`
                        : `Trace the roof by hand, ${suggestReport}`}
                  </p>
                  {process.env.NODE_ENV !== "production" && (
                    <ul className="rf-gate-codes">
                      {gate?.results
                        .filter((r) => r.level === "error")
                        .slice(0, 12)
                        .map((r, i) => (
                          <li key={`${r.id}-${i}`}>
                            <b>{r.id}</b> {r.msg}
                          </li>
                        ))}
                    </ul>
                  )}
                  <span className="rf-files">
                    {measurement.lat != null && measurement.lng != null && (
                      <a
                        className="btn btn-ghost btn--sm"
                        href={`https://www.google.com/maps/@${measurement.lat},${measurement.lng},80m/data=!3m1!1e3`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open aerial view
                      </a>
                    )}
                    <button className="btn btn-ghost btn--sm" type="button" onClick={() => setMeasurement(null)}>
                      Measure another
                    </button>
                  </span>
                </div>
              </div>
            ) : (
            <>
            <div className="card rf-hero" id="rfHero">
              <HeroCell l="Total area" v={num(totals.areaSqft)} h="sq ft" />
              <HeroCell l="Roofing squares" v={num(totals.squares, 1)} h="× 100 sq ft" accent />
              <HeroCell l="Predominant pitch" v={totals.predominantPitch} h="rise / 12" />
              <HeroCell l="Roof facets" v={String(totals.facetCount)} h="planes" />
            </div>

            <div className="rf-grid">
              <div className="card rf-card rf-viewer">
                <div className="rf-head rf-head--bar">
                  <div>
                    <div className="card-title" id="vwTitle">{view === "2d" ? "Roof plan" : "Roof model"}</div>
                    <div className="card-sub" id="vwSub">
                      {layout.header.address || "Roof"} · {layout.header.drawingNo}
                    </div>
                  </div>
                  <div className="vw-controls">
                    <div className="vsw" id="viewSwitch" role="radiogroup" aria-label="Viewer">
                      {(["2d", "3d"] as const).map((v) => (
                        <button
                          key={v}
                          className={"vsw-btn" + (view === v ? " active" : "")}
                          type="button"
                          role="radio"
                          aria-checked={view === v}
                          onClick={() => setView(v)}
                        >
                          {v.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div className="rf-layers" id="layerSwitch" role="group" aria-label="Drawing layers">
                      {LAYER_ORDER.map((k) => (
                        <button
                          key={k}
                          className="rf-layer"
                          type="button"
                          aria-pressed={layers[k]}
                          onClick={() => toggleLayer(k)}
                        >
                          {LAYER_LABELS[k]}
                        </button>
                      ))}
                    </div>
                    {view === "3d" && (
                      <div className="vsw" role="radiogroup" aria-label="Structure">
                        {[
                          { id: true, label: "House" },
                          { id: false, label: "Roof" },
                        ].map((o) => (
                          <button
                            key={o.label}
                            className={"vsw-btn" + (showHouse === o.id ? " active" : "")}
                            type="button"
                            role="radio"
                            aria-checked={showHouse === o.id}
                            onClick={() => setShowHouse(o.id)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rf-canvas rf-canvas--live" id="rfCanvas">
                  {/* `.rfx` exempts the viewers from the donor reset; `.rf-stage`
                      gives them the fixed box both need to size themselves. */}
                  <div className="rfx rf-stage">
                    {/* The drawing stays MOUNTED under the 3D view — hidden, not
                        unmounted — so diagramRef survives for Export / Attach,
                        which capture from the layout, not from the screen. */}
                    <div className="rf-stage-host" hidden={view !== "2d"}>
                      {gateBlocked ? (
                        <div className="rf-gate" role="status">
                          <div className="rf-gate-title">TRACE MANUALLY</div>
                          <p className="rf-gate-body">
                            This roof fails {gate?.errors} geometry {gate?.errors === 1 ? "check" : "checks"}, so the plan is not
                            drawn — it would misprice the job. Measure it by hand{pendingInstantOrder
                              ? ". A paid EagleView order for this address is still processing — measure again in a minute to collect it at no extra cost."
                              : hasInstant
                                ? "."
                                : " or order an EagleView report."}
                          </p>
                          {process.env.NODE_ENV !== "production" && (
                            <ul className="rf-gate-codes">
                              {gate?.results
                                .filter((r) => r.level === "error")
                                .slice(0, 12)
                                .map((r, i) => (
                                  <li key={`${r.id}-${i}`}>
                                    <b>{r.id}</b> {r.msg}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <RoofDiagram
                          key={`rd-${measurement.id}`}
                          ref={diagramRef}
                          layout={layout}
                          layers={layers}
                          interactive
                          className="rfx-2d w-full h-full"
                        />
                      )}
                    </div>
                    {view === "3d" && (
                      <RoofModel3D
                        key={`3d-${measurement.id}`}
                        model={measurement.model}
                        labelMode={labelMode3d}
                        showHouse={showHouse}
                        className="rfx-3d w-full h-full"
                      />
                    )}
                  </div>
                </div>
                <div className="rf-legend" id="rfLegend">
                  {layout.legend.map((l) => (
                    <span className="lg" key={l.type}>
                      <i style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                  <span className="rf-files">
                    <button
                      className="btn btn-ghost btn--sm"
                      type="button"
                      id="exportPngBtn"
                      disabled={exporting || view !== "2d"}
                      title={view !== "2d" ? "Switch to 2D to export the plan" : undefined}
                      onClick={exportPng}
                    >
                      <svg className="ic"><use href="#i-download" /></svg>
                      {exporting ? "Exporting…" : "Export PNG"}
                    </button>
                    {savedId && (
                      <a className="btn btn-ghost btn--sm" href={`/api/roof-diagram/${savedId}/pdf`} target="_blank" rel="noopener noreferrer">
                        <svg className="ic"><use href="#i-file" /></svg>
                        Export PDF
                      </a>
                    )}
                  </span>
                </div>
              </div>

              <div className="rf-side">
                <div className="card rf-card">
                  <div className="rf-head">
                    <div className="card-title">Linear footage</div>
                    <div className="card-sub">Edge lengths that drive trim, ridge vent and flashing.</div>
                  </div>
                  {totals.footage.length > 0 ? (
                    <ul className="lf-list" id="lfList">
                      {totals.footage.map((r) => {
                        const [v, u] = splitUnit(fmtLength(r.ft));
                        return (
                          <li key={r.type}>
                            <span className="lf-k">
                              <i style={{ background: LINE_COLORS[r.type as EvLineType] }} />
                              {r.label}
                            </span>
                            <span className="lf-v">
                              {v}
                              <span>{u}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="rf-recent-empty">No edge lengths — facets unavailable</div>
                  )}
                </div>

                <div className="card rf-card">
                  <div className="rf-head">
                    <div className="card-title">Pitch mix</div>
                    <div className="card-sub" id="pmSub">
                      {totals.facetCount} facets · {fmtArea(totals.areaSqft)}
                    </div>
                  </div>
                  <div className="pm-body" id="pmBody">
                    {totals.pitchMix.map((g) => {
                      const rise = riseOf(g.pitchLabel);
                      return (
                        <div className="pm-row" key={g.pitchLabel}>
                          <div className="pm-top">
                            <span className="pm-p">{g.pitchLabel}</span>
                            <span className="pm-a">
                              {fmtArea(g.areaSqft)} · {g.pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="pm-track">
                            <span
                              className={"pm-fill" + (rise >= 8 ? " steep" : rise <= 2 ? " low" : "")}
                              style={{ width: `${Math.min(100, g.pct).toFixed(1)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pm-calls" id="pmCalls">
                    {steepSqft > 0 && (
                      <div className="call warn">
                        {fmtArea(steepSqft)} at 8/12 or steeper — plan for roof jacks and a steep-pitch labor rate.
                      </div>
                    )}
                    {lowSqft > 0 && (
                      <div className="call info">
                        {fmtArea(lowSqft)} of low slope — shingles are out of spec; price a membrane instead.
                      </div>
                    )}
                    {steepSqft <= 0 && lowSqft <= 0 && totals.pitchMix.length > 0 && (
                      <div className="call info">All facets are walkable — standard labor rate applies.</div>
                    )}
                  </div>
                </div>

                {hasDetails && (
                  <div className="card rf-card">
                    <div className="rf-head">
                      <div className="card-title">Details</div>
                      <div className="card-sub">{layout.header.source}</div>
                    </div>
                    <dl className="rf-details" id="rfDetails">
                      {eaveHeights.length > 0 && (
                        <>
                          <div className="rf-details-sec">Eave height</div>
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
                          <div className="rf-details-row"><dt>Chimney</dt><dd>{yesNo(flags.chimney ?? structure.chimney)}</dd></div>
                          <div className="rf-details-row"><dt>Solar panels</dt><dd>{yesNo(flags.solarPanels ?? structure.solarPanels)}</dd></div>
                          <div className="rf-details-row"><dt>Rooftop AC</dt><dd>{(flags.rooftopAcCount ?? structure.rooftopAcCount) ?? "—"}</dd></div>
                          <div className="rf-details-row"><dt>Material</dt><dd>{(flags.material ?? structure.material) ?? "—"}</dd></div>
                          <div className="rf-details-row"><dt>Condition</dt><dd>{(flags.conditionRating ?? structure.conditionRating) ?? "—"}</dd></div>
                          <div className="rf-details-row">
                            <dt>Roof age</dt>
                            <dd>
                              {(flags.roofAgeYears ?? structure.roofAgeYears) != null ? (
                                <>
                                  {num((flags.roofAgeYears ?? structure.roofAgeYears) as number)}
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
              </div>
            </div>

            <div className="card rf-card rf-build">
              <div className="rf-head rf-head--bar">
                <div>
                  <div className="card-title">Build an estimate</div>
                  <div className="card-sub">
                    {isRecon
                      ? "These measurements are estimated from aerial imagery, so they can’t be priced. Run Instant measure for this address to build a quote."
                      : `Measurements feed the takeoff — adjust waste and price it out against the measured ${totals.squares.toFixed(1)} squares.`}
                    {!isRecon && !aiEnabled ? " AI disabled — you’ll get a sample to tune." : ""}
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
                  {/* Drawn always, priced only when the geometry holds up: every
                      figure here is computed from it, so an estimate off a
                      defective model misprices the job (confidence.ts). */}
                  <button
                    className="btn btn-primary btn--sm"
                    type="button"
                    id="buildBtn"
                    disabled={isRecon || genBusy || assessment?.estimable === false}
                    title={
                      assessment?.estimable === false
                        ? "The geometry of this roof does not hold together, so its area and footage are not reliable enough to price from. Measure on site."
                        : undefined
                    }
                    onClick={generate}
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
                        {!isRecon && (
                          <label className={"rf-attach" + (attachDiagram ? "" : " is-off")} id="attachRow">
                            <input
                              type="checkbox"
                              checked={attachDiagram}
                              onChange={(e) => setAttachDiagram(e.target.checked)}
                            />
                            Attach roof diagram to proposal
                          </label>
                        )}
                        <button className="btn btn-primary btn--sm" type="button" id="convertBtn" disabled={convertBusy || isRecon} onClick={convert}>
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
          </>
        )}
      </section>

      <AgainPortal
        show={panel === "report"}
        disabled={busy}
        onClick={() => { setPanel("intake"); }}
        showRemeasure={panel === "report" && reusedInstant != null}
        onRemeasure={() => void runInstant(true)}
      />
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
          title="This result reused an already-paid EagleView answer. Re-measuring orders a fresh lookup, which is billed."
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
