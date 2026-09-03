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
import type { InstantStructure } from "@/lib/eagleview";
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stripId = ({ id: _id, ...rest }: EstimateLine) => rest;

/** The structure the report is about: the largest by roof area (footprint when area is missing). */
function mainStructure(structures: InstantStructure[] | undefined): InstantStructure | null {
  if (!structures?.length) return null;
  const size = (s: InstantStructure) => s.areaSqft ?? s.footprintSqft ?? -1;
  return structures.reduce((best, s) => (size(s) > size(best) ? s : best));
}

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
      pitchSource: p.pitchSource ?? null,
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

  function showMeasurement(m: RoofMeasurementDTO, wasUnsaved: boolean) {
    setMeasurement(m);
    setUnsaved(wasUnsaved);
    setPanel("report");
    if (!wasUnsaved && m.id !== "unsaved") loadSatellite(m.id);
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
    setMsHint("EagleView Property Data (production, billed per lookup) — the measured totals, structures and imagery, saved to the history.");
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
      const t = res.measurement.instant?.totals;
      toast.success(
        res.unsaved ? "Roof measured — not saved" : "Roof measured",
        `${t?.facetCount ?? "—"} facets · ${t?.squares != null ? t.squares.toFixed(1) : "—"} squares` +
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
    const t = measurement?.instant?.totals;
    if (!measurement || t?.squares == null) return;
    if (isRecon) {
      toast.error(
        "Estimated measurements can’t be priced",
        "Run Instant measure for this address to build a priced estimate.",
      );
      return;
    }
    setGenBusy(true);
    try {
      const res = await estimateRoof({
        address: measurement.address || undefined,
        lat: measurement.lat ?? undefined,
        lng: measurement.lng ?? undefined,
        pitch: pitchMeasured ? `${Math.round(pitchRep!.families[0].pitch12)}/12` : (t.pitchLabel ?? "6/12"),
        squares: Number(t.squares.toFixed(1)),
        wastePct: waste,
        measurementNotes: `EagleView Instant (calibrated): ${t.squares.toFixed(1)} squares (${num(
          t.areaSqft ?? 0,
        )} sq ft), predominant pitch ${
          pitchMeasured
            ? `${pitchRep!.families.map((f) => f.pitch12.toFixed(1)).join(" + ")}/12 (measured from aerial elevation data on ${Math.round((pitchRep!.trustedShare ?? 0) * 100)}% of the roof)`
            : `${t.pitchLabel ?? "?"} (EagleView published figure)`
        }, ${
          measurement.instant?.structures.length ?? 1
        } structure(s), footprint ${num(t.footprintSqft ?? 0)} sq ft. No facet or linear-footage breakdown — the drawing tool is offline; allow for ridge/valley/flashing from the aerial photo.`,
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
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      const res = await convertRoofEstimateToProposal({
        title: title || `Roof · ${measurement.address || "site"}`,
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

  // ── Derived report figures (all from EagleView Instant's totals) ──
  const totals = measurement?.instant?.totals ?? null;

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
  const pitchLabelShown = pitchMeasured
    ? [...new Set(pitchRep!.families.map((f) => `${Math.round(f.pitch12)}/12`))].join(" + ")
    : totals?.pitchLabel ?? "—";
  const pitchHint = pitchMeasured
    ? `measured · ${Math.round((pitchRep!.trustedShare ?? 0) * 100)}% of roof`
    : "rise / 12 · EagleView";
  const structure = mainStructure(measurement?.instant?.structures);
  const eaveHeights = structure?.eaveHeightFt
    ? Object.entries(structure.eaveHeightFt).map(([facade, ft]) => ({ facade, ft }))
    : [];
  const hasDetails = eaveHeights.length > 0 || !!structure || (measurement?.chimneys.length ?? 0) > 0;
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
              <div className="card-sub">One address → EagleView’s measured figures: area, pitch, structures and the aerial photo, ready to price.</div>
            </div>
            <span className="chip ok">Instant · production</span>
          </div>

          <div className="rf-body">
            <p className="rf-note">
              <b>Instant measure</b> pulls real EagleView Property Data in seconds — production account, billed
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

            <div className="rf-actions">
              <button className="btn btn-primary btn--sm" type="button" id="instantBtn" disabled={busy} onClick={() => void runInstant()}>
                <svg className="ic"><use href="#i-target" /></svg>
                {instantBusy ? "Measuring…" : "Instant measure"}
              </button>
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
      <section className={"ppanel" + (panel === "report" && measurement ? "" : " is-hidden")} data-panel="report">
        {measurement && (
          <>
            {(builtByOldPipeline || unsaved || reconDown || partialCoverage || pitchRep?.disagrees || (assessment && assessment.confidence !== "high")) && (
              <div className="rf-notice">
                {builtByOldPipeline && (
                  <div className="call warn">
                    <div>
                      <span className="rf-stamp">MEASURED BY THE PREVIOUS PIPELINE</span>
                      This measurement was saved by the earlier drawing pipeline and is shown exactly as it was
                      recorded — reopening a measurement never re-measures it. Its figures are EagleView’s
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
                      about the address — EagleView’s measured totals above are unaffected. Measure again — the
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
                      <b>Measured pitch disagrees with EagleView.</b> The elevation data measures{" "}
                      {pitchRep.families[0].pitch12.toFixed(1)}/12 on this roof; EagleView publishes{" "}
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
                          {v === "satellite" ? "Satellite" : "Ortho"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rf-canvas rf-canvas--live" id="rfCanvas">
                  {/* `.rfx` exempts the viewer from the donor reset; `.rf-stage`
                      gives the photo the same fixed box the drawing had. */}
                  <div className="rfx rf-stage">
                    {photoShown ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data: URL from the server-side photo cache; next/image adds nothing here
                      <img
                        src={photoShown}
                        alt={view === "satellite" ? "Satellite view" : "EagleView ortho"}
                        className={"rf-photo" + (view === "ortho" ? " rf-photo--ortho" : "")}
                      />
                    ) : (
                      <div className="rf-3d-loading">
                        {photoBusy ? "Loading photo…" : photoError ? `Photo unavailable — ${photoError}` : " "}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rf-legend" id="rfLegend">
                  <span className="lg">
                    {view === "satellite"
                      ? "Google Maps satellite"
                      : `EagleView ortho${orthoShotDate ? ` · ${orthoShotDate}` : ""}`}
                  </span>
                </div>
              </div>

              <div className="rf-side">
                {hasDetails && (
                  <div className="card rf-card">
                    <div className="rf-head">
                      <div className="card-title">Details</div>
                      <div className="card-sub">EagleView Instant Property Data</div>
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
                      {measurement.instant?.structures.length ?? 0} on the property
                      {totals?.footprintSqft != null ? ` · footprint ${num(totals.footprintSqft)} sq ft` : ""}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card rf-card rf-build">
              <div className="rf-head rf-head--bar">
                <div>
                  <div className="card-title">Build an estimate</div>
                  <div className="card-sub">
                    {isRecon
                      ? "These measurements are estimated from aerial imagery, so they can’t be priced. Run Instant measure for this address to build a quote."
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
                  <button
                    className="btn btn-primary btn--sm"
                    type="button"
                    id="buildBtn"
                    disabled={isRecon || genBusy || totals?.squares == null || assessment?.estimable === false}
                    title={
                      assessment?.estimable === false
                        ? "Part of this property is missing from the figures, so they are not reliable enough to price from."
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
      {/* The photo frame is ALWAYS SQUARE (owner's call), both modes in the
          same box: the satellite square fills it edge to edge; the EagleView
          ortho keeps its own framing inside it (contain, never cropped). */}
      <style jsx global>{`
        .jf-blueprint .content .rf-canvas--live .rf-stage {
          height: var(--viewer-h);
          aspect-ratio: 1 / 1;
          width: auto;
          margin: 0 auto;
        }
        .jf-blueprint .content .rf-stage .rf-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .jf-blueprint .content .rf-stage .rf-photo--ortho {
          object-fit: contain;
          background: #0d0f12;
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
