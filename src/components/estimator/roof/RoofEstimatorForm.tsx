"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import {
  Box,
  Layers,
  Ruler,
  Sparkles,
  Loader2,
  AlertCircle,
  MapPin,
  Home,
  Square,
  FileText,
  Download,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toast } from "@/components/ui/Toast";
import { EstimatorBreakdown, type EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { EstimatorSummary } from "@/components/estimator/EstimatorSummary";
import { RoofWireframe } from "./RoofWireframe";
import { RoofFacetTable } from "./RoofFacetTable";
import { PlacesAutocomplete, type PickedAddress } from "./PlacesAutocomplete";
import { pitchLabel, LABEL_MODES, EV_SAMPLES, type LabelMode } from "./roofViz";
import { evRoofModel, evPriceRoof, evOrderRoof, evReportStatus } from "@/actions/eagleview";
import type { RoofModel } from "@/lib/eagleview";
import { estimateRoof, convertRoofEstimateToProposal } from "@/actions/roofEstimator";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";
import { listStagger, listItem } from "@/lib/theme/motion";

// Lazy-load the Three.js 3D roof viewer so it stays OUT of the estimator page's
// initial JS chunk (~150-180KB gzip). ssr:false is safe — it's a client-only
// WebGL component that never server-renders. It's preloaded in the background
// after first paint (see the effect in the component), so the first switch to
// the 3D view is instant rather than "load-on-click".
const RoofModel3D = dynamic(() => import("./RoofModel3D").then((m) => m.RoofModel3D), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full grid place-items-center text-[11px] text-[color:var(--ink-muted)]">
      Loading 3D…
    </div>
  ),
});

interface Props {
  evEnabled: boolean;
  aiEnabled: boolean;
}

const WASTES = ["8%", "10%", "12%", "15%"];
const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const FLOAT_CTRL = "backdrop-blur shadow-[var(--shadow-sm)]";

export function RoofEstimatorForm({ evEnabled, aiEnabled }: Props) {
  const router = useRouter();

  // ── Measurement / viewer ──
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<RoofModel | null>(null);
  const [cost, setCost] = React.useState<number | null>(null);
  const [view, setView] = React.useState<"2d" | "3d">("2d");
  const [labelMode, setLabelMode] = React.useState<LabelMode>("shaded");
  const [showHouse, setShowHouse] = React.useState(true);
  const [showIntake, setShowIntake] = React.useState(true);

  // Warm the 3D viewer chunk in the background after first paint, so switching
  // to the 3D view later is instant (the page still loads light without it).
  React.useEffect(() => {
    void import("./RoofModel3D");
  }, []);

  // ── Address / ordering ──
  const [picked, setPicked] = React.useState<PickedAddress | null>(null);
  const [city, setCity] = React.useState("");
  const [stateCode, setStateCode] = React.useState("");
  const [zip, setZip] = React.useState("");
  const [price, setPrice] = React.useState<number | null>(null);
  const [pricing, setPricing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [ordering, setOrdering] = React.useState(false);
  const [pollMsg, setPollMsg] = React.useState<string | null>(null);

  // ── Estimate ──
  const [waste, setWaste] = React.useState("10%");
  const [genBusy, setGenBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  const [convertBusy, setConvertBusy] = React.useState(false);

  function onPick(a: PickedAddress) {
    setPicked(a);
    if (a.city) setCity(a.city);
    if (a.state) setStateCode(a.state);
    if (a.zip) setZip(a.zip);
    setPrice(null);
  }

  async function loadReport(reportId: number) {
    setLoading(true);
    setModel(null);
    setMaterials([]);
    setLabor([]);
    try {
      const res = await evRoofModel(reportId);
      if (!res.ok) throw new Error(res.error);
      setModel(res.model);
      setCost(res.totalCost);
      setShowIntake(false);
      toast.success(
        res.cached ? "Roof measurement loaded" : "Roof measured",
        `${res.model.totals.facetCount} facets · ${res.model.totals.squares.toFixed(1)} squares`,
      );
    } catch (err: any) {
      toast.error("Couldn't load measurement", err?.message);
    } finally {
      setLoading(false);
    }
  }

  function orderInput() {
    return { address: picked?.address ?? "", city, state: stateCode, zip, lat: picked?.lat, lng: picked?.lng };
  }

  async function getPrice() {
    if (!picked?.address) return;
    setPricing(true);
    setPrice(null);
    try {
      const res = await evPriceRoof(orderInput());
      if (!res.ok) throw new Error(res.error);
      const p = findPrice(res.price);
      setPrice(p);
      toast.success("Priced", p != null ? `$${p} for this measurement` : "See pricing details");
    } catch (err: any) {
      toast.error("Couldn't price", err?.message);
    } finally {
      setPricing(false);
    }
  }

  async function placeOrder() {
    setConfirming(false);
    setOrdering(true);
    setPollMsg("Placing order…");
    try {
      const res = await evOrderRoof(orderInput());
      if (!res.ok) throw new Error(res.error);
      const reportId = res.reportId;
      toast.success("Order placed", `Report #${reportId} — measuring…`);
      for (let i = 0; i < 40; i++) {
        await sleep(12000);
        const st = await evReportStatus(reportId);
        if (!st.ok) {
          setPollMsg(`Status check failed: ${st.error}`);
          continue;
        }
        setPollMsg(`Status: ${st.displayStatus}…`);
        if (st.completed) {
          setOrdering(false);
          setPollMsg(null);
          await loadReport(reportId);
          return;
        }
      }
      setPollMsg("Still processing — your report is saved. Re-open this page later to view it.");
    } catch (err: any) {
      toast.error("Order failed", err?.message);
      setPollMsg(null);
    } finally {
      setOrdering(false);
    }
  }

  async function generate() {
    if (!model) return;
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
        wastePct: Number(waste.replace("%", "")),
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
    } catch (err: any) {
      toast.error("Generation failed", err?.message);
    } finally {
      setGenBusy(false);
    }
  }

  async function convert() {
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      const res = await convertRoofEstimateToProposal({
        title: title || `Roof · ${model?.location.address || "site"}`,
        scope: assumptions.join("\n"),
        materials: materials.map(({ id: _id, ...rest }) => rest),
        labor: labor.map(({ id: _id, ...rest }) => rest),
        assumptions,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as any);
    } catch (err: any) {
      setConvertBusy(false);
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't convert", err?.message);
    }
  }

  const hasEstimate = materials.length > 0 || labor.length > 0;
  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  if (!evEnabled) {
    return (
      <Card>
        <div className="flex items-start gap-3 p-1">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
          <div className="text-[13px] leading-relaxed">
            <div className="font-medium text-[color:var(--ink)]">EagleView isn’t configured.</div>
            <div className="text-[color:var(--ink-muted)] mt-0.5">
              Set <code className="font-mono text-[11px]">EAGLEVIEW_CLIENT_ID</code> and{" "}
              <code className="font-mono text-[11px]">EAGLEVIEW_CLIENT_SECRET</code> in{" "}
              <code className="font-mono text-[11px]">.env.local</code> to enable roof measurement.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <motion.div variants={listStagger} initial="initial" animate="animate" className="space-y-6">
      {/* ── B1 · Source ── */}
      <motion.section variants={listItem}>
        {showIntake ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Measure a roof</CardTitle>
                <CardSubtitle>
                  Pull contract-grade EagleView geometry — every facet’s pitch, area, and edges.
                </CardSubtitle>
              </div>
              <Badge tone="neutral">Sandbox</Badge>
            </CardHeader>

            <div className="grid lg:grid-cols-2 lg:gap-8 gap-6">
              {/* Instant samples */}
              <div className="space-y-2">
                <div className="quiet-caps text-[color:var(--ink-faint)]">Instant samples · no charge</div>
                <div className="space-y-2">
                  {EV_SAMPLES.map((s) => (
                    <button
                      key={s.reportId}
                      type="button"
                      disabled={loading}
                      onClick={() => loadReport(s.reportId)}
                      className="group w-full flex items-center gap-3 text-left rounded-[var(--r-md)] hairline px-3 py-2.5 hover:bg-[color:var(--accent-soft)] transition-colors disabled:opacity-50"
                    >
                      <span className="h-2 w-2 rounded-full bg-[color:var(--accent)] shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-[color:var(--ink)]">{s.label}</span>
                        <span className="block text-[11px] text-[color:var(--ink-muted)] truncate">{s.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live address */}
              <div className="space-y-3 lg:border-l lg:border-[color:var(--ink-line)] lg:pl-8">
                <div className="quiet-caps text-[color:var(--ink-faint)]">Or measure a new address</div>
                <p className="text-[11px] text-[color:var(--ink-muted)] leading-relaxed">
                  Ordering places a real EagleView measurement. The current <strong>sandbox</strong> account
                  only returns the canned samples — measuring a real address needs a <strong>production</strong>{" "}
                  account.
                </p>
                <PlacesAutocomplete onPick={onPick} enableFind />
                <div className="grid grid-cols-3 gap-2">
                  <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
                  <Input label="State" value={stateCode} onChange={(e) => setStateCode(e.target.value)} />
                  <Input label="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={pricing}
                    disabled={!picked?.address || ordering}
                    onClick={getPrice}
                    icon={<Ruler className="h-3.5 w-3.5" />}
                  >
                    Price
                  </Button>
                  {price != null && (
                    <div className="flex-1 flex items-center justify-between rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] px-3 py-1.5">
                      <span className="text-[12px] text-[color:var(--accent-ink)] tabular">${price}</span>
                      <Button
                        size="sm"
                        loading={ordering}
                        onClick={() => setConfirming(true)}
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                      >
                        Order
                      </Button>
                    </div>
                  )}
                </div>
                {pollMsg && (
                  <div className="flex items-center gap-2 text-[12px] text-[color:var(--ink-muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {pollMsg}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <div className="paper-card p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] min-w-0">
              <MapPin className="h-4 w-4 text-[color:var(--ink-muted)] shrink-0" />
              <span className="truncate text-[color:var(--ink)]">
                {model?.location.address}
                {model?.location.city ? `, ${model.location.city} ${model.location.state}` : ""}
              </span>
              {cost != null && <Badge tone="neutral">${cost}</Badge>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowIntake(true)} icon={<Ruler className="h-3.5 w-3.5" />}>
              Measure another
            </Button>
          </div>
        )}
      </motion.section>

      {loading && (
        <motion.div variants={listItem}>
          <MeasurementSkeleton />
        </motion.div>
      )}

      {model && !loading && (
        <>
          {/* ── B2 · Hero viewer ── */}
          <motion.section
            variants={listItem}
            className="rounded-[var(--r-lg)] overflow-hidden shadow-[var(--shadow-md)] hairline bg-white"
          >
            {/* tone-flooded identity header */}
            <div
              className="relative overflow-hidden px-5 py-4"
              style={{ background: "color-mix(in srgb, var(--accent), var(--ink) 58%)" }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 140% at 90% -30%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 60%), radial-gradient(ellipse at 0% 130%, rgba(255,255,255,0.10), transparent 55%)",
                }}
              />
              <div className="relative flex items-end justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/55">
                    EagleView measurement
                  </div>
                  <div className="text-[19px] font-semibold text-white truncate">
                    {model.location.address || "Roof model"}
                    {model.location.city ? ` · ${model.location.city}, ${model.location.state}` : ""}
                  </div>
                  <div
                    className="text-[12px] text-white/65"
                    title="EagleView's price to produce this measurement report (the Bid Perfect report-tier fee). Sandbox samples are free; this is what it costs to order live."
                  >
                    {cost != null ? `EagleView report fee · $${cost}` : "Contract-grade measurement"}
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <HeroStat label="Squares" value={num(model.totals.squares, 1)} />
                  <HeroStat label="Pitch" value={pitchLabel(model.totals.predominantPitch)} />
                  <HeroStat label="Facets" value={num(model.totals.facetCount)} />
                </div>
              </div>
            </div>

            {/* light canvas + overlaid controls — 2D gets a distinct inset drawing
                surface (subtle tone + faint dot grid); 3D's sky covers its own. */}
            <div
              className="relative h-[360px] sm:h-[480px]"
              style={
                view === "2d"
                  ? {
                      backgroundColor: "var(--paper-deep)",
                      backgroundImage:
                        "radial-gradient(circle, color-mix(in srgb, var(--ink) 7%, transparent) 1px, transparent 1.4px)",
                      backgroundSize: "20px 20px",
                    }
                  : { backgroundColor: "var(--paper)" }
              }
            >
              <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2">
                <SegmentedControl
                  aria-label="Viewer"
                  value={view}
                  onChange={setView}
                  className={FLOAT_CTRL}
                  options={[
                    { value: "2d", label: "2D", icon: <Layers className="h-3.5 w-3.5" /> },
                    { value: "3d", label: "3D", icon: <Box className="h-3.5 w-3.5" /> },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <SegmentedControl
                    aria-label="Annotations"
                    variant="surface"
                    value={labelMode}
                    onChange={(v) => setLabelMode(v as LabelMode)}
                    className={FLOAT_CTRL}
                    options={LABEL_MODES.map((m) => ({ value: m.id, label: m.label }))}
                  />
                  {view === "3d" && (
                    <SegmentedControl
                      aria-label="Structure"
                      variant="surface"
                      value={showHouse ? "house" : "roof"}
                      onChange={(v) => setShowHouse(v === "house")}
                      className={FLOAT_CTRL}
                      options={[
                        { value: "house", label: "House", icon: <Home className="h-3.5 w-3.5" /> },
                        { value: "roof", label: "Roof", icon: <Square className="h-3.5 w-3.5" /> },
                      ]}
                    />
                  )}
                </div>
              </div>

              {view === "2d" ? (
                <RoofWireframe
                  key={`wf-${model.reportId ?? model.location.address ?? "m"}`}
                  model={model}
                  mode={labelMode}
                  className="w-full h-full"
                />
              ) : (
                <RoofModel3D
                  key={`3d-${model.reportId ?? model.location.address ?? "m"}`}
                  model={model}
                  labelMode={labelMode}
                  showHouse={showHouse}
                  className="w-full h-full"
                />
              )}
            </div>

            {/* EagleView's own deliverables — to compare with our interactive view */}
            {model.reportId != null && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-[color:var(--ink-line)] bg-white">
                <span className="text-[11px] text-[color:var(--ink-muted)]">
                  Compare with EagleView’s own deliverables
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/eagleview/file?reportId=${model.reportId}&fileType=206`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] hairline px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--paper-deep)] transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" /> EagleView PDF report
                    <ExternalLink className="h-3 w-3 text-[color:var(--ink-faint)]" />
                  </a>
                  <a
                    href={`/api/eagleview/file?reportId=${model.reportId}&fileType=26`}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] hairline px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--paper-deep)] transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" /> DXF (CAD)
                  </a>
                </div>
              </div>
            )}
          </motion.section>

          {/* ── B3 · Metrics ── */}
          <motion.div variants={listItem} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total area" value={`${num(model.totals.areaSqft)}`} hint="sq ft" hover />
            <StatCard label="Roofing squares" value={num(model.totals.squares, 1)} hint="× 100 sq ft" accent hover />
            <StatCard label="Predominant pitch" value={pitchLabel(model.totals.predominantPitch)} hint="rise / 12" hover />
            <StatCard label="Roof facets" value={num(model.totals.facetCount)} hint="planes" hover />
          </motion.div>

          {/* ── B4 · Detail ── */}
          <motion.section variants={listItem}>
            <RoofFacetTable model={model} />
          </motion.section>

          {/* ── B5 · Estimate ── */}
          <motion.section variants={listItem}>
            <Card className="border-l-[3px] border-l-[color:var(--accent)]">
              <CardHeader>
                <div>
                  <CardTitle>Build an estimate</CardTitle>
                  <CardSubtitle>
                    Price materials and labor against the measured {model.totals.squares.toFixed(1)} squares.
                  </CardSubtitle>
                </div>
              </CardHeader>
              <div className="flex flex-wrap items-end gap-3">
                <Select label="Waste factor" value={waste} onChange={(e) => setWaste(e.target.value)} className="w-32">
                  {WASTES.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </Select>
                <Button size="lg" loading={genBusy} onClick={generate} icon={<Sparkles className="h-4 w-4" />}>
                  Generate estimate
                </Button>
                {!aiEnabled && (
                  <span className="text-[11px] text-[color:var(--ink-faint)]">
                    AI disabled — you’ll get a sample to tune.
                  </span>
                )}
              </div>
            </Card>
          </motion.section>

          {hasEstimate && (
            <motion.div variants={listItem} className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3 space-y-5">
                <EstimatorBreakdown
                  title="Materials"
                  subtitle="Shingles, underlayment, flashing, fasteners"
                  rows={materials}
                  onChange={setMaterials}
                />
                <EstimatorBreakdown
                  title="Labor"
                  subtitle="Tear-off, install, cleanup"
                  rows={labor}
                  onChange={setLabor}
                />
              </div>
              <div className="lg:col-span-2">
                <EstimatorSummary
                  materialsTotal={materialsTotal}
                  laborTotal={laborTotal}
                  assumptions={assumptions}
                  onConvert={convert}
                  onSave={async () => toast.info("Estimate ready — convert to a proposal to save")}
                  convertLoading={convertBusy}
                />
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Billable confirm */}
      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--ink)_45%,transparent)] p-4">
          <div className="paper-card p-5 max-w-sm w-full">
            <div className="font-medium text-[color:var(--ink)]">Place a billable order?</div>
            <p className="mt-1.5 text-[13px] text-[color:var(--ink-muted)] leading-relaxed">
              This orders an EagleView measurement report{price != null ? ` for $${price}` : ""} on{" "}
              <span className="text-[color:var(--ink)]">{picked?.address}</span>. The report takes a little
              time — we’ll poll for it.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={placeOrder} icon={<Sparkles className="h-3.5 w-3.5" />}>
                Confirm order
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[18px] font-semibold text-white tabular leading-none">{value}</div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/55 mt-1">{label}</div>
    </div>
  );
}

function MeasurementSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-[360px] sm:h-[480px] rounded-[var(--r-lg)] bg-black/[0.04]" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[var(--r-lg)] bg-black/[0.04]" />
        ))}
      </div>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// PriceOrder responses vary; dig for the first plausible dollar amount.
function findPrice(payload: unknown): number | null {
  let best: number | null = null;
  const visit = (v: any) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (/price|cost|total/i.test(k) && typeof val === "number" && best == null) best = val;
        visit(val);
      }
    }
  };
  visit(payload);
  return best;
}
