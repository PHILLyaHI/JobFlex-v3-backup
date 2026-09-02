"use client";

// Roof estimator (Blueprint) — the donor's three-panel markup (intake →
// measuring → report) over the EagleView measurement engine:
//
//   evRoofModel        sample tiles + collected orders → contract-grade RoofModel
//   reconRoofPreview   "Free estimate" — Google-DSM reconstruction, synthetic,
//                      barred from pricing by design
//   evPriceRoof / evOrderRoof / evReportStatus   the billable order path
//   estimateRoof       "Generate estimate" → materials / labor lines
//   convertRoofEstimateToProposal
//
// The viewers are the engine's own: RoofWireframe (2D SVG) and RoofModel3D
// (Three.js), both reading the same RoofModel. The markup and class names are
// the blueprint donor's — roof-estimator.module.css dresses everything.

import * as React from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { toast } from "@/components/ui/Toast";
import type { EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import {
  EV_SAMPLES,
  LABEL_MODES,
  LINE_COLORS,
  LINE_LABEL,
  PRIMARY_LINE_TYPES,
  pitchLabel,
  type LabelMode,
} from "@/components/estimator/roof/roofViz";
import { RoofWireframe } from "@/components/estimator/roof/RoofWireframe";
import { evRoofModel, evPriceRoof, evOrderRoof, evReportStatus, evDiagnostics } from "@/actions/eagleview";
import { reconRoofPreview } from "@/actions/roofRecon";
import type { RoofModel, EvDiagnostics } from "@/lib/eagleview";
import { estimateRoof, convertRoofEstimateToProposal } from "@/actions/roofEstimator";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";
import { attachPlacesSuggest, type PickedPlace } from "@/components/v3/blueprint-shell/places-suggest";

const RoofModel3D = dynamic(
  () => import("@/components/estimator/roof/RoofModel3D").then((m) => m.RoofModel3D),
  { ssr: false, loading: () => <div className="rf-3d-loading">Loading 3D…</div> },
);

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const WASTES = [8, 10, 12, 15];
// Donor: the measuring screen's stage captions, re-worded for the engine
// (order/report fetch → parse → viewers).
const MS_STAGES = ["Requesting data…", "Locating the structure…", "Tracing facets…", "Preparing the drawing…", "Report ready"];

const num = (n: number, d = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Rise of a "10/12" label, for the steep / low-slope callouts. */
const riseOf = (label: string) => Number(label.split("/")[0]);

type Panel = "intake" | "measuring" | "report";

/** Deepest number under a price-ish key — EagleView's pricing payload varies. */
function findPrice(payload: unknown): number | null {
  let best: number | null = null;
  const visit = (v: unknown): void => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (/price|cost|total/i.test(k) && typeof val === "number" && best == null) best = val;
        visit(val);
      }
    }
  };
  visit(payload);
  return best;
}

export function RoofEstimatorBlueprintForm({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();

  // ── Screen ──
  const [panel, setPanel] = React.useState<Panel>("intake");
  const [msStage, setMsStage] = React.useState(0);
  const [msReport, setMsReport] = React.useState<string>("—");
  const [msHint, setMsHint] = React.useState<string | null>(null);

  // ── Measurement / viewer ──
  const [model, setModel] = React.useState<RoofModel | null>(null);
  const [cost, setCost] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState<"2d" | "3d">("2d");
  const [labelMode, setLabelMode] = React.useState<LabelMode>("shaded");
  const [showHouse, setShowHouse] = React.useState(true);
  // Free-preview provenance (synthetic models only).
  const [googleArea, setGoogleArea] = React.useState<number | null>(null);
  const [excludedSqft, setExcludedSqft] = React.useState<number[]>([]);

  // Warm the 3D chunk after first paint so the first switch is instant.
  React.useEffect(() => {
    void import("@/components/estimator/roof/RoofModel3D");
  }, []);

  // The measuring screen's staged captions: a timer, not real progress — the
  // engine's calls are opaque. Order polling overrides the hint with status.
  React.useEffect(() => {
    if (panel !== "measuring") return;
    const t = setInterval(() => setMsStage((s) => Math.min(s + 1, MS_STAGES.length - 2)), 1600);
    return () => clearInterval(t);
  }, [panel]);

  // ── EagleView diagnostics (intake) ──
  const [diag, setDiag] = React.useState<EvDiagnostics | null>(null);
  const [diagBusy, setDiagBusy] = React.useState(false);

  // ── Address / ordering ──
  const addrRef = React.useRef<HTMLInputElement>(null);
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  const [city, setCity] = React.useState("");
  const [stateCode, setStateCode] = React.useState("");
  const [zip, setZip] = React.useState("");
  const [price, setPrice] = React.useState<number | null>(null);
  const [pricing, setPricing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [ordering, setOrdering] = React.useState(false);

  React.useEffect(() => {
    if (!addrRef.current) return;
    return attachPlacesSuggest(addrRef.current, {
      onPick: (p) => {
        setPicked(p);
        if (p.city) setCity(p.city);
        if (p.state) setStateCode(p.state);
        if (p.zip) setZip(p.zip);
        setPrice(null);
      },
    });
  }, []);

  // ── Estimate ──
  const [waste, setWaste] = React.useState(10);
  const [genBusy, setGenBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  const [convertBusy, setConvertBusy] = React.useState(false);

  function resetResult() {
    setModel(null);
    setMaterials([]);
    setLabor([]);
    setAssumptions([]);
    setGoogleArea(null);
    setExcludedSqft([]);
  }

  function addressInput() {
    const address = picked?.address ?? addrRef.current?.value.trim() ?? "";
    return { address, city, state: stateCode, zip, lat: picked?.lat, lng: picked?.lng };
  }

  async function loadReport(reportId: number, label?: string) {
    setBusy(true);
    resetResult();
    setMsReport(label ?? `Report #${reportId}`);
    setMsHint(null);
    setMsStage(0);
    setPanel("measuring");
    try {
      const res = await evRoofModel(reportId);
      if (!res.ok) throw new Error(res.error);
      setModel(res.model);
      setCost(res.totalCost);
      setPanel("report");
      toast.success(
        res.cached ? "Roof measurement loaded" : "Roof measured",
        `${res.model.totals.facetCount} facets · ${res.model.totals.squares.toFixed(1)} squares`,
      );
    } catch (err) {
      setPanel("intake");
      toast.error("Couldn't load measurement", errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  // Free preview — no order, no charge. Produces the same RoofModel the viewers
  // render, tagged synthetic so it can never reach the pricing path.
  async function runFree() {
    const input = addressInput();
    if (!input.address) {
      toast.error("Enter an address first");
      return;
    }
    setBusy(true);
    resetResult();
    setMsReport(input.address);
    setMsHint("Reconstructing from Google aerial elevation data — free, no order placed.");
    setMsStage(0);
    setPanel("measuring");
    try {
      const res = await reconRoofPreview(input);
      if (!res.ok) throw new Error(res.error);
      const { model: m, googleAreaSqft, multiStructure, excludedSqft: excluded } = res.preview;
      setModel(m);
      setCost(null);
      setGoogleArea(googleAreaSqft);
      setExcludedSqft(excluded.filter((a) => a > 120)); // ignore sheds/noise
      setPanel("report");
      toast.success(
        "Roof estimated from aerial imagery",
        `${m.totals.facetCount} facets · ${m.totals.squares.toFixed(1)} squares${multiStructure ? " · multiple structures" : ""}`,
      );
    } catch (err) {
      setPanel("intake");
      toast.error("Couldn't estimate this roof", errMsg(err));
    } finally {
      setBusy(false);
      setMsHint(null);
    }
  }

  async function runDiag() {
    setDiagBusy(true);
    try {
      const res = await evDiagnostics();
      if (!res.ok) {
        toast.error("Diagnostics failed", res.error);
        return;
      }
      setDiag(res.diag);
    } finally {
      setDiagBusy(false);
    }
  }

  async function getPrice() {
    const input = addressInput();
    if (!input.address) {
      toast.error("Enter an address first");
      return;
    }
    setPricing(true);
    setPrice(null);
    try {
      const res = await evPriceRoof(input);
      if (!res.ok) throw new Error(res.error);
      const p = findPrice(res.price);
      setPrice(p);
      toast.success("Priced", p != null ? `$${p} for this measurement` : "See pricing details");
    } catch (err) {
      toast.error("Couldn't price", errMsg(err));
    } finally {
      setPricing(false);
    }
  }

  async function placeOrder() {
    const input = addressInput();
    setConfirming(false);
    setOrdering(true);
    setBusy(true);
    resetResult();
    setMsReport(input.address);
    setMsHint("Placing the order…");
    setMsStage(0);
    setPanel("measuring");
    try {
      const res = await evOrderRoof(input);
      if (!res.ok) throw new Error(res.error);
      const reportId = res.reportId;
      setMsReport(`Report #${reportId}`);
      toast.success("Order placed", `Report #${reportId} — measuring…`);
      for (let i = 0; i < 40; i++) {
        await sleep(12000);
        const st = await evReportStatus(reportId);
        if (!st.ok) {
          setMsHint(`Status check failed: ${st.error}`);
          continue;
        }
        setMsHint(`Status: ${st.displayStatus}…`);
        if (st.completed) {
          setOrdering(false);
          setBusy(false);
          setMsHint(null);
          await loadReport(reportId);
          return;
        }
      }
      setPanel("intake");
      toast.info("Still processing", "Your report is saved — re-open this page later to view it.");
    } catch (err) {
      setPanel("intake");
      toast.error("Order failed", errMsg(err));
    } finally {
      setOrdering(false);
      setBusy(false);
      setMsHint(null);
    }
  }

  async function generate() {
    if (!model) return;
    if (isSynthetic) {
      toast.error(
        "Estimated measurements can't be priced",
        "Order an EagleView measurement for this address to build a priced estimate.",
      );
      return;
    }
    setGenBusy(true);
    try {
      const facetSummary = model.faces
        .slice(0, 12)
        .map((f) => `${f.designator || "?"}: ${pitchLabel(f.pitch)} pitch, ${f.areaSqft.toFixed(0)} sqft`)
        .join("; ");
      const res = await estimateRoof({
        address: model.location.address || undefined,
        lat: model.location.lat,
        lng: model.location.lng,
        pitch: pitchLabel(model.totals.predominantPitch),
        squares: Number(model.totals.squares.toFixed(1)),
        wastePct: waste,
        measurementNotes: `EagleView measured: ${model.totals.squares.toFixed(1)} squares (${model.totals.areaSqft.toFixed(0)} sqft) across ${model.totals.facetCount} facets. Ridge ${model.totals.footageByType.RIDGE.toFixed(0)}ft, Hip ${model.totals.footageByType.HIP.toFixed(0)}ft, Valley ${model.totals.footageByType.VALLEY.toFixed(0)}ft, Eave ${model.totals.footageByType.EAVE.toFixed(0)}ft, Rake ${model.totals.footageByType.RAKE.toFixed(0)}ft. Facets — ${facetSummary}.`,
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
    if (isSynthetic) {
      toast.error(
        "Estimated measurements can't become a proposal",
        "Order an EagleView measurement for this address first.",
      );
      return;
    }
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      const res = await convertRoofEstimateToProposal({
        title: title || `Roof · ${model?.location.address || "site"}`,
        scope: assumptions.join("\n"),
        materials: materials.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, unit: l.unit })),
        labor: labor.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, unit: l.unit })),
        assumptions,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as never);
    } catch (err) {
      setConvertBusy(false);
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't convert", errMsg(err));
    }
  }

  // Synthetic = reconstructed from aerial imagery, not measured. Renders and
  // reports, but never prices — enforced on the buttons AND in generate()/
  // convert(), so no future caller can route around the UI.
  const isSynthetic = model?.source === "synthetic";
  const hasEstimate = materials.length > 0 || labor.length > 0;
  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  // ── Derived report figures (all straight from the model's totals) ──
  const totals = model?.totals ?? null;
  const footage = totals
    ? PRIMARY_LINE_TYPES.map((t) => ({ type: t, ft: totals.footageByType[t] ?? 0 })).filter((r) => r.ft > 0.5)
    : [];
  const pitchMix = React.useMemo(() => {
    if (!model) return [];
    const byPitch = new Map<number, number>();
    for (const f of model.faces) byPitch.set(f.pitch, (byPitch.get(f.pitch) ?? 0) + f.areaSqft);
    const total = model.totals.areaSqft || 1;
    return [...byPitch.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pitch, areaSqft]) => ({ pitchLabel: pitchLabel(pitch), areaSqft, pct: (areaSqft / total) * 100 }));
  }, [model]);
  const steepSqft = pitchMix.filter((g) => riseOf(g.pitchLabel) >= 8).reduce((a, g) => a + g.areaSqft, 0);
  const lowSqft = pitchMix.filter((g) => riseOf(g.pitchLabel) <= 2).reduce((a, g) => a + g.areaSqft, 0);
  const addrLine = model
    ? [model.location.address, [model.location.city, model.location.state].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      {/* ===== INTAKE: measure a roof ===== */}
      <section className={"ppanel" + (panel === "intake" ? "" : " is-hidden")} data-panel="intake">
        <div className="card rf-card">
          <div className="rf-head rf-head--bar">
            <div>
              <div className="card-title">Measure a roof</div>
              <div className="card-sub">Pull contract-grade EagleView geometry — every facet’s pitch, area and edges, ready to price.</div>
            </div>
            <span className={"chip" + (diag && !diag.isSandboxApi ? " ok" : "")}>
              {diag ? (diag.isSandboxApi ? "Sandbox" : "Production") : "EagleView"}
            </span>
          </div>

          <div className="rf-body">
            <p className="rf-note">
              <b>Free estimate</b> reconstructs the roof from Google aerial elevation data — instant, no
              charge, accurate to a few percent on area and pitch, but an estimate: it can’t be priced or
              sent as a proposal. <b>Price → Order</b> places a real EagleView measurement for
              contract-grade geometry.
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
              <button className="btn btn-primary btn--sm" type="button" id="freeBtn" disabled={busy} onClick={() => void runFree()}>
                <svg className="ic"><use href="#i-roof" /></svg>
                {busy && !ordering ? "Estimating…" : "Free estimate"}
              </button>
              <button className="btn btn-ghost btn--sm" type="button" id="priceBtn" disabled={busy || pricing} onClick={() => void getPrice()}>
                <svg className="ic"><use href="#i-tag" /></svg>
                {pricing ? "Pricing…" : "Price"}
              </button>
              {price != null && (
                <button className="btn btn-primary btn--sm" type="button" id="orderBtn" disabled={busy} onClick={() => setConfirming(true)}>
                  <svg className="ic"><use href="#i-target" /></svg>
                  Order · ${price}
                </button>
              )}
              <button className="btn btn-ghost btn--sm" type="button" id="diagBtn" disabled={diagBusy} onClick={() => void runDiag()}>
                <svg className="ic"><use href="#i-bulb" /></svg>
                {diagBusy ? "Checking…" : "Diagnostics"}
              </button>
            </div>

            {diag && (
              <div className="rf-diag">
                <p className="rf-note">
                  <b>{diag.isSandboxApi ? "SANDBOX host" : "PRODUCTION host"}</b> · <code>{diag.apiBase}</code>
                  {diag.isSandboxApi
                    ? " — the sandbox only prices/orders its built-in samples; a real address needs a production account."
                    : ""}
                </p>
                <ul className="lf-list">
                  {diag.checks.map((c, i) => (
                    <li key={i}>
                      <span className="lf-k">
                        <i style={{ background: c.ok ? "var(--success)" : "var(--danger)" }} />
                        {c.name}
                      </span>
                      <span className="lf-v" style={{ fontSize: 11 }}>{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Instant samples — the sandbox's canned reports, free to open. */}
        <div className="card rf-card rf-recent-card">
          <div className="rf-head rf-head--bar">
            <div>
              <div className="card-title">Instant samples</div>
            </div>
            <span className="chip">no charge</span>
          </div>
          <ul className="lf-list rf-recent">
            {EV_SAMPLES.map((s) => (
              <li key={s.reportId}>
                <button
                  className="rf-recent-row"
                  type="button"
                  disabled={busy}
                  onClick={() => void loadReport(s.reportId, s.label)}
                >
                  <span className="rf-recent-main">
                    <span className="rf-recent-addr">{s.label}</span>
                    <span className="rf-recent-meta">{s.detail}</span>
                  </span>
                  <span className="chip rf-recent-src ok">Sample</span>
                </button>
              </li>
            ))}
          </ul>
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
            <div className="ms-hint">{msHint ?? "Measuring the structure, pitch by pitch."}</div>
          </div>
        </div>
      </section>

      {/* ===== RESULT ===== */}
      <section className={"ppanel" + (panel === "report" && model ? "" : " is-hidden")} data-panel="report">
        {model && totals && (
          <>
            {isSynthetic && (
              <div className="rf-notice">
                <div className="call warn">
                  <div>
                    <span className="rf-stamp">ESTIMATE — NOT MEASURED</span>
                    Reconstructed from Google elevation data
                    {model.provenance?.imageryDate ? ` captured ${model.provenance.imageryDate}` : ""}
                    {model.provenance ? ` at ${model.provenance.pixelSizeM} m/px` : ""}. Area and pitch are
                    typically within a few percent; roof-to-wall flashing can’t be seen from above and is
                    not included. This drawing can be read but not priced or attached to a proposal.
                    {googleArea != null && (
                      <> Google’s own figure for this roof: {num(googleArea)} sq ft.</>
                    )}
                    {excludedSqft.length > 0 && (
                      <>
                        {" "}{excludedSqft.length} other structure{excludedSqft.length > 1 ? "s" : ""} nearby
                        ({excludedSqft.map((a) => num(a)).join(", ")} sq ft) were excluded as off-parcel — if
                        any belong to this job, order a measurement instead.
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="card rf-hero" id="rfHero">
              <HeroCell l="Total area" v={num(totals.areaSqft)} h="sq ft" />
              <HeroCell l="Roofing squares" v={num(totals.squares, 1)} h="× 100 sq ft" accent />
              <HeroCell l="Predominant pitch" v={pitchLabel(totals.predominantPitch)} h="rise / 12" />
              <HeroCell l="Roof facets" v={String(totals.facetCount)} h="planes" />
            </div>

            <div className="rf-grid">
              <div className="card rf-card rf-viewer">
                <div className="rf-head rf-head--bar">
                  <div>
                    <div className="card-title" id="vwTitle">{view === "2d" ? "Roof plan" : "Roof model"}</div>
                    <div className="card-sub" id="vwSub">
                      {addrLine || "Roof"}
                      {model.reportId != null ? ` · REPORT № ${model.reportId}` : ""}
                      {cost != null ? ` · fee $${cost}` : ""}
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
                    <div className="vsw" role="radiogroup" aria-label="Annotations">
                      {LABEL_MODES.map((m) => (
                        <button
                          key={m.id}
                          className={"vsw-btn" + (labelMode === m.id ? " active" : "")}
                          type="button"
                          role="radio"
                          aria-checked={labelMode === m.id}
                          onClick={() => setLabelMode(m.id)}
                        >
                          {m.label}
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
                      gives them the fixed box both size themselves from. */}
                  <div className="rfx rf-stage">
                    <div className="rf-stage-host" hidden={view !== "2d"}>
                      <RoofWireframe
                        key={`wf-${model.reportId ?? model.location.address ?? "m"}`}
                        model={model}
                        mode={labelMode}
                        className="rfx-2d w-full h-full"
                      />
                    </div>
                    {view === "3d" && (
                      <RoofModel3D
                        key={`3d-${model.reportId ?? model.location.address ?? "m"}`}
                        model={model}
                        labelMode={labelMode}
                        showHouse={showHouse}
                        className="rfx-3d w-full h-full"
                      />
                    )}
                  </div>
                </div>
                <div className="rf-legend" id="rfLegend">
                  {footage.map((r) => (
                    <span className="lg" key={r.type}>
                      <i style={{ background: LINE_COLORS[r.type] }} />
                      {LINE_LABEL[r.type]}
                    </span>
                  ))}
                  {model.reportId != null && (
                    <span className="rf-files">
                      <a
                        className="btn btn-ghost btn--sm"
                        href={`/api/eagleview/file?reportId=${model.reportId}&fileType=206`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg className="ic"><use href="#i-file" /></svg>
                        EagleView PDF report
                      </a>
                      <a className="btn btn-ghost btn--sm" href={`/api/eagleview/file?reportId=${model.reportId}&fileType=26`}>
                        <svg className="ic"><use href="#i-download" /></svg>
                        DXF (CAD)
                      </a>
                    </span>
                  )}
                </div>
              </div>

              <div className="rf-side">
                <div className="card rf-card">
                  <div className="rf-head">
                    <div className="card-title">Linear footage</div>
                    <div className="card-sub">Edge lengths that drive trim, ridge vent and flashing.</div>
                  </div>
                  {footage.length > 0 ? (
                    <ul className="lf-list" id="lfList">
                      {footage.map((r) => (
                        <li key={r.type}>
                          <span className="lf-k">
                            <i style={{ background: LINE_COLORS[r.type] }} />
                            {LINE_LABEL[r.type]}
                          </span>
                          <span className="lf-v">
                            {num(r.ft)}
                            <span>ft</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rf-recent-empty">No edge lengths on this model</div>
                  )}
                </div>

                <div className="card rf-card">
                  <div className="rf-head">
                    <div className="card-title">Pitch mix</div>
                    <div className="card-sub" id="pmSub">
                      {totals.facetCount} facets · {num(totals.areaSqft)} sq ft
                    </div>
                  </div>
                  <div className="pm-body" id="pmBody">
                    {pitchMix.map((g) => {
                      const rise = riseOf(g.pitchLabel);
                      return (
                        <div className="pm-row" key={g.pitchLabel}>
                          <div className="pm-top">
                            <span className="pm-p">{g.pitchLabel}</span>
                            <span className="pm-a">
                              {num(g.areaSqft)} sq ft · {g.pct.toFixed(0)}%
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
                        {num(steepSqft)} sq ft at 8/12 or steeper — plan for roof jacks and a steep-pitch labor rate.
                      </div>
                    )}
                    {lowSqft > 0 && (
                      <div className="call info">
                        {num(lowSqft)} sq ft of low slope — shingles are out of spec; price a membrane instead.
                      </div>
                    )}
                    {steepSqft <= 0 && lowSqft <= 0 && pitchMix.length > 0 && (
                      <div className="call info">All facets are walkable — standard labor rate applies.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card rf-card rf-build">
              <div className="rf-head rf-head--bar">
                <div>
                  <div className="card-title">Build an estimate</div>
                  <div className="card-sub">
                    {isSynthetic
                      ? "These measurements are estimated from aerial imagery, so they can’t be priced. Order an EagleView measurement for this address to build a quote."
                      : `Measurements feed the takeoff — adjust waste and price it out against the measured ${totals.squares.toFixed(1)} squares.`}
                    {!isSynthetic && !aiEnabled ? " AI disabled — you’ll get a sample to tune." : ""}
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
                    disabled={isSynthetic || genBusy}
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
                        <button className="btn btn-primary btn--sm" type="button" id="convertBtn" disabled={convertBusy || isSynthetic} onClick={() => void convert()}>
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

      {/* Billable-order confirm — the shared .mdl dialog shape. */}
      <div className={"mdl" + (confirming ? " open" : "")} role="dialog" aria-modal="true" aria-label="Place a billable order">
        <div className="mdl-bg" onClick={() => setConfirming(false)} />
        <div className="mdl-box">
          <div className="mdl-head">
            <div className="mdl-title">Place a billable order?</div>
            <button className="mdl-x" type="button" aria-label="Close" onClick={() => setConfirming(false)}>
              <svg className="ic"><use href="#i-x" /></svg>
            </button>
          </div>
          <div className="mdl-body">
            <p className="rf-note">
              This orders an EagleView measurement report{price != null ? ` for $${price}` : ""} on{" "}
              <b>{picked?.address || "this address"}</b>. The report takes a little
              time — we’ll poll for it and open the drawing when it lands.
            </p>
            <div className="rf-actions">
              <button className="btn btn-primary btn--sm" type="button" disabled={ordering} onClick={() => void placeOrder()}>
                <svg className="ic"><use href="#i-target" /></svg>
                Confirm order
              </button>
              <button className="btn btn-ghost btn--sm" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <AgainPortal show={panel === "report"} disabled={busy} onClick={() => setPanel("intake")} />
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
function AgainPortal({ show, disabled, onClick }: { show: boolean; disabled?: boolean; onClick: () => void }) {
  const host = React.useSyncExternalStore(
    () => () => {},
    () => document.querySelector<HTMLElement>(".jf-blueprint .content #rfAgainHost"),
    () => null,
  );
  if (!host) return null;
  return createPortal(
    <button className={"btn btn-ghost" + (show ? "" : " is-hidden")} type="button" id="againBtn" disabled={disabled} onClick={onClick}>
      <svg className="ic"><use href="#i-roof" /></svg>
      Measure another
    </button>,
    host,
  );
}
