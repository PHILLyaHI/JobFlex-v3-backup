"use client";

// HVAC estimator — the page's one flow, in five cards:
//
//   1 SITE     address → county design day, footprint, storeys, elevation
//   2 INTAKE   the video walk (with the filming guide), nameplate photos,
//              and the typed confirmations — each fact badged by its source
//   3 DESIGN   block load, the unit the catalog fits, the capacity chart,
//              the code / duct / electrical / gas checks, every assumption
//   4 LEDGER   priced lines from the shop's rate card, editable, then
//              Save / Convert to proposal
//   5 RECENT   the org's last estimates, to reopen
//
// The building model is DERIVED, never stored as state: site facts → era
// defaults → the walk's reading → each plate → the typed answers, in that
// order, every render. So a typed answer always wins, a re-read walk never
// clobbers a photo, and the engine (pure, src/lib/hvac) re-runs as you type.

import * as React from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { toast } from "@/components/ui/Toast";
import { attachPlacesSuggest, type PickedPlace } from "@/components/v3/blueprint-shell/places-suggest";
import { ensureWithinLimit, reportPlanLimit, reportPlanLimitResult } from "@/stores/usePlanLimitStore";
import { VIDEO_ACCEPT, fmtClock, stripFrames } from "@/components/v3/video-estimator-blueprint/video-ingest";
import type { WalkthroughAnalysis } from "@/lib/estimate/video-schema";
import type { BuildingModel, CatalogItem, EngineResult, Provenance } from "@/lib/hvac/types";
import { runEngine } from "@/lib/hvac/engine";
import { countiesFor } from "@/lib/hvac/designConditions";
import { CATALOG_CSV_COLUMNS, DEFAULT_RATE_CARD, buildLedger, normalizeRateCard, tiersFor, waterHeaterOptions, type HvacRateCard, type LedgerLine } from "@/lib/hvac/ledger";
import { DEFAULT_JOB, JOBS, jobDef, type JobInput, type JobKind , type OutdoorKind } from "@/lib/hvac/jobs";
import { applyNameplate, applyStated, applyStatedNested, applyTypedModelNumber, applyWalkthrough, modelFromSite, type NameplateRead, type SiteFacts } from "@/lib/hvac/intake";
import { designConditionsFor } from "@/lib/hvac/designConditions";
import {
  attachHvacPermitReport,
  clearHvacCatalog,
  convertHvacEstimateToProposal,
  getHvacEstimate,
  getHvacRateCard,
  hvacCalibration,
  hvacPermitStatus,
  hvacSiteFacts,
  importHvacCatalogCsv,
  listHvacCatalog,
  listHvacEstimates,
  loadUsCatalog,
  readHvacNameplate,
  saveHvacCatalogItem,
  recordHvacActual,
  requestHvacPermitReport,
  saveHvacEstimate,
  saveHvacRateCard,
  type HvacEstimateSummary,
  type HvacPermit,
} from "@/actions/hvacEstimator";
import { calibrationLine, type CalibrationStats } from "@/lib/hvac/calibration";
import { useHvacWalk } from "./use-hvac-walk";
import { SHOTS, TIPS, coverageFor } from "./filming-guide";
import { CapacityChart } from "./capacity-chart";
import s from "./hvac-estimator.module.css";

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).map((n) => (s as Record<string, string>)[n as string] ?? (n as string)).join(" ");
}

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const num = (n: number, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const RATE_CARD_KEY = "jf.hvac.rateCard.v1";

type SlotKey = "outdoor" | "indoor" | "panel";
interface Slot { thumb: string; read?: NameplateRead; busy?: boolean; error?: string }
const SLOTS: Array<{ key: SlotKey; title: string; sub: string; hint: "outdoor" | "indoor" | "panel" }> = [
  { key: "outdoor", title: "Outdoor plate", sub: "Condenser or heat pump nameplate, straight on", hint: "outdoor" },
  { key: "indoor", title: "Indoor plate", sub: "Furnace or air handler nameplate", hint: "indoor" },
  { key: "panel", title: "Panel", sub: "Door open, main breaker in frame", hint: "panel" },
];

const getPath = (m: BuildingModel, path: string): unknown => {
  const [g, f] = path.split(".");
  if (!f) return (m as unknown as Record<string, unknown>)[g];
  return ((m as unknown as Record<string, Record<string, unknown>>)[g] ?? {})[f];
};

async function fileToJpegDataUrl(file: File, max = 1600): Promise<string> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } catch {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Couldn't read that photo."));
      r.readAsDataURL(file);
    });
  }
}

// ── small parts ─────────────────────────────────────────────────────────────

function Chip({ p }: { p?: Provenance }) {
  if (!p) return null;
  return <span className={cx("chip", `chip-${p.source}`)} title={p.note}>{p.source}</span>;
}

type FieldKind = "num" | "text" | "select" | "bool";
function Field({ label, path, model, kind, options, onChange, placeholder, step }: {
  label: string; path: string; model: BuildingModel; kind: FieldKind;
  options?: Array<[string, string]>; onChange: (path: string, v: unknown) => void; placeholder?: string; step?: string;
}) {
  const raw = getPath(model, path);
  const p = model.provenance[path];
  const id = `hv-${path.replace(/\./g, "-")}`;
  if (kind === "bool") {
    return (
      <label className={cx("field")} htmlFor={id}>
        <span className={cx("lbl")}><span>{label}</span><Chip p={p} /></span>
        <select id={id} className={cx("sel")} value={raw === true ? "yes" : raw === false ? "no" : ""} onChange={(e) => onChange(path, e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
          <option value="">not seen</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    );
  }
  return (
    <label className={cx("field")} htmlFor={id}>
      <span className={cx("lbl")}><span>{label}</span><Chip p={p} /></span>
      {kind === "select" ? (
        <select id={id} className={cx("sel")} value={raw === undefined || raw === null ? "" : String(raw)} onChange={(e) => onChange(path, e.target.value === "" ? undefined : options?.find(([v]) => v === e.target.value)?.[0] ?? e.target.value)}>
          <option value="">—</option>
          {options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <input
          id={id}
          className={cx("in", kind === "num" && "num")}
          inputMode={kind === "num" ? "decimal" : undefined}
          step={step}
          placeholder={placeholder}
          defaultValue={raw === undefined || raw === null || raw === 0 ? "" : String(raw)}
          key={`${id}:${String(raw ?? "")}:${p?.source ?? ""}`}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (kind === "num") {
              const n = Number(v.replace(/,/g, ""));
              if (v === "") return;
              if (Number.isFinite(n) && n !== raw) onChange(path, n);
            } else if (v !== (raw ?? "")) onChange(path, v || undefined);
          }}
        />
      )}
    </label>
  );
}

function LinesTable({ title, rows, onChange }: { title: string; rows: LedgerLine[]; onChange: (rows: LedgerLine[]) => void }) {
  const sum = rows.reduce((a, r) => a + r.quantity * r.unitPrice, 0);
  const patch = (id: string, p: Partial<LedgerLine>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <div className={cx("bo-sec")}>
      <div className={cx("bo-head")}><span className={cx("kpi-lbl")}>{title}</span><span className={cx("bo-sum")}>{money(sum)}</span></div>
      <div className={cx("tbl-wrap")}>
        <table className={cx("bo-table")}>
          <thead><tr><th>Item</th><th className={cx("num")}>Qty</th><th>Unit</th><th className={cx("num")}>Unit price</th><th className={cx("num")}>Total</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input className={cx("bo-in")} value={r.name} aria-label="Item" onChange={(e) => patch(r.id, { name: e.target.value })} />
                  {r.note && <span className={cx("bo-note")}>{r.note}</span>}
                </td>
                <td className={cx("num")}><NumCell value={r.quantity} ariaLabel="Quantity" onCommit={(n) => patch(r.id, { quantity: n })} /></td>
                <td><input className={cx("bo-in")} style={{ width: 84 }} value={r.unit} aria-label="Unit" onChange={(e) => patch(r.id, { unit: e.target.value })} /></td>
                <td className={cx("num")}><NumCell value={r.unitPrice} ariaLabel="Unit price" onCommit={(n) => patch(r.id, { unitPrice: n })} /></td>
                <td className={cx("num")}><b>{money(r.quantity * r.unitPrice)}</b><span className={cx("bo-note")}>{r.basis}</span></td>
                <td><button type="button" className={cx("bo-x")} aria-label="Remove line" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}><svg className={cx("ic")}><use href="#i-x" /></svg></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={cx("bo-add")}><button type="button" className={cx("link")} onClick={() => onChange([...rows, { id: nanoid(6), name: "", quantity: 1, unitPrice: 0, unit: "each", basis: "entered" }])}>+ Add line</button></div>
    </div>
  );
}

function NumCell({ value, onCommit, ariaLabel }: { value: number; onCommit: (n: number) => void; ariaLabel: string }) {
  const [txt, setTxt] = React.useState(String(value));
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  return (
    <input
      className={cx("bo-in", "num")}
      inputMode="decimal"
      value={txt}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        setTxt(v);
        const n = Number(v.replace(/,/g, ""));
        if (v.trim() !== "" && Number.isFinite(n) && n >= 0) onCommit(n);
      }}
      onBlur={() => { if (txt.trim() === "" || !Number.isFinite(Number(txt))) setTxt(String(value)); }}
    />
  );
}

// ── the form ────────────────────────────────────────────────────────────────

export function HvacEstimatorForm({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();

  // 0 · the job
  const [job, setJob] = React.useState<JobKind>(DEFAULT_JOB);
  const [jobInput, setJobInput] = React.useState<JobInput>({});
  const def = jobDef(job);
  const setWh = (patch: Partial<NonNullable<JobInput["wh"]>>) => {
    setJobInput((j) => ({ ...j, wh: { ...(j.wh ?? {}), ...patch } }));
    // A new fuel or type is a different appliance: the maker is picked again.
    if ("fuel" in patch || "type" in patch) { setPickId(null); setCustom(null); }
  };
  const setSvc = (patch: Partial<NonNullable<JobInput["service"]>>) => setJobInput((j) => ({ ...j, service: { ...(j.service ?? {}), ...patch } }));

  // 1 · site
  const addrRef = React.useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  const [stateCode, setStateCode] = React.useState("");
  const [county, setCounty] = React.useState("");
  const [countyPicked, setCountyPicked] = React.useState(false);
  const [site, setSite] = React.useState<SiteFacts | null>(null);
  /** True when the site was set from the typed address alone (no lookup). */
  const [siteLocal, setSiteLocal] = React.useState(false);
  const [siteWarnings, setSiteWarnings] = React.useState<string[]>([]);
  const [siteBusy, setSiteBusy] = React.useState(false);
  const [siteError, setSiteError] = React.useState("");

  // 2 · intake
  const walk = useHvacWalk(aiEnabled);
  const [analysis, setAnalysis] = React.useState<WalkthroughAnalysis | null>(null);
  const [plates, setPlates] = React.useState<Partial<Record<SlotKey, Slot>>>({});
  const [typed, setTyped] = React.useState<Record<string, unknown>>({});
  const [restored, setRestored] = React.useState<BuildingModel | null>(null);
  const [linesetFt, setLinesetFt] = React.useState<number | undefined>(undefined);
  // The filming guide folds away: it is a reference, not a step, and it sits
  // between the clip and the plates. It reopens on a tap and remembers.
  const [guideOpen, setGuideOpen] = React.useState(false);
  React.useEffect(() => {
    try { if (window.localStorage.getItem("jf.hvac.guideOpen") === "1") setGuideOpen(true); } catch { /* blocked storage */ }
  }, []);
  /** A unit the contractor picked over the engine's first choice (catalog id). */
  const [pickId, setPickId] = React.useState<string | null>(null);
  // Full system / outdoor unit: AC or heat pump outside. null = the engine's pick.
  const [outdoorKind, setOutdoorKind] = React.useState<OutdoorKind | null>(null);
  /** A unit the contractor typed because the catalog has nothing like it. */
  const [custom, setCustom] = React.useState<CatalogItem | null>(null);
  const [swapOpen, setSwapOpen] = React.useState(false);
  const [swapQ, setSwapQ] = React.useState("");
  const [swapMsg, setSwapMsg] = React.useState("");
  const [unitDraft, setUnitDraft] = React.useState<Record<string, string>>({});

  // shop data
  const [catalog, setCatalog] = React.useState<{ items: CatalogItem[]; own: boolean } | null>(null);
  const [card, setCard] = React.useState<{ card: HvacRateCard; own: boolean }>({ card: DEFAULT_RATE_CARD, own: false });
  const [cardDraft, setCardDraft] = React.useState<HvacRateCard | null>(null);
  const [cardMsg, setCardMsg] = React.useState("");
  const [catMsg, setCatMsg] = React.useState("");
  const [replaceCat, setReplaceCat] = React.useState(true);

  // 4 · ledger
  const [title, setTitle] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<{ key: string; materials: LedgerLine[]; labor: LedgerLine[] } | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [recent, setRecent] = React.useState<HvacEstimateSummary[]>([]);
  const [calib, setCalib] = React.useState<CalibrationStats | null>(null);
  const [actualFor, setActualFor] = React.useState<string | null>(null);
  const [actualDraft, setActualDraft] = React.useState<{ tons: string; price: string; notes: string }>({ tons: "", price: "", notes: "" });
  // permit-grade report
  const [permitEnabled, setPermitEnabled] = React.useState(false);
  const [permit, setPermit] = React.useState<HvacPermit | null>(null);
  const [reportUrl, setReportUrl] = React.useState<string | null>(null);
  const [permitBusy, setPermitBusy] = React.useState(false);
  const [permitMsg, setPermitMsg] = React.useState("");
  const [linkDraft, setLinkDraft] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    void listHvacCatalog().then((c) => { if (alive) setCatalog(c); }).catch(() => { if (alive) setCatalog({ items: [], own: false }); });
    void getHvacRateCard().then((c) => {
      if (!alive) return;
      if (c.own) setCard(c);
      else {
        try {
          const local = window.localStorage.getItem(RATE_CARD_KEY);
          if (local) setCard({ card: normalizeRateCard(JSON.parse(local)), own: false });
        } catch { /* keep defaults */ }
      }
    }).catch(() => undefined);
    void listHvacEstimates().then((r) => { if (alive) setRecent(r); }).catch(() => undefined);
    void hvacCalibration().then((c) => { if (alive) setCalib(c); }).catch(() => undefined);
    void hvacPermitStatus().then((p) => { if (alive) setPermitEnabled(p.enabled); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const refreshRecent = React.useCallback(() => {
    void listHvacEstimates().then(setRecent).catch(() => undefined);
    void hvacCalibration().then(setCalib).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const el = addrRef.current;
    if (!el) return;
    return attachPlacesSuggest(el, {
      onPick: (p) => {
        setPicked(p);
        if (p.state) setStateCode(p.state.toUpperCase());
      },
      onError: (msg) => toast.error("Address lookup", msg),
    });
  }, []);

  // ── derived model, engine, ledger ─────────────────────────────────────────
  const model = React.useMemo<BuildingModel | null>(() => {
    if (!site) return null;
    const m = restored ? (structuredClone(restored) as BuildingModel) : modelFromSite(site);
    // The state and county selects correct what the lookup guessed, and the
    // state decides which code rules the job answers to — not just the design day.
    if (stateCode && stateCode !== m.state) { m.state = stateCode; m.county = county || ""; }
    if (county && county !== m.county) m.county = county;
    if (analysis) applyWalkthrough(m, analysis);
    for (const k of ["outdoor", "indoor", "panel"] as SlotKey[]) {
      const r = plates[k]?.read;
      if (!r) continue;
      if (k === "panel") {
        if (r.mcaAmps && [60, 100, 125, 150, 200, 225, 400].includes(r.mcaAmps)) applyStatedNested(m, "electrical.mainAmps", r.mcaAmps);
        const slots = r.notes?.match(/(\d+)\s*(free|open|spare)/i);
        if (slots) applyStatedNested(m, "electrical.freeSlots", Number(slots[1]));
        if (m.provenance["electrical.mainAmps"]) m.provenance["electrical.mainAmps"] = { source: "read", confidence: r.confidence, note: "panel photo" };
        if (m.provenance["electrical.freeSlots"] && slots) m.provenance["electrical.freeSlots"] = { source: "read", confidence: r.confidence, note: "panel photo" };
      } else applyNameplate(m, r);
    }
    // The typed model number decodes first, so a typed tonnage still wins.
    if (typeof typed["existing.model"] === "string" && typed["existing.model"]) applyTypedModelNumber(m, typed["existing.model"]);
    for (const [path, v] of Object.entries(typed)) {
      if (v === undefined) continue;
      if (path.includes(".")) applyStatedNested(m, path, v);
      else applyStated(m, path as keyof BuildingModel, v as never);
    }
    return m;
  }, [site, restored, stateCode, county, analysis, plates, typed]);

  const conditions = React.useMemo(() => (model ? designConditionsFor(model.state, model.county, model.elevationFt ?? 0) : null), [model]);
  const ready = !!model && (!def.needs.load || (def.needs.zone ? (jobInput.zoneSqft ?? 0) > 0 : model.conditionedSqft > 0));
  // Everything downstream reads one list: the shop's rows plus the unit the
  // contractor typed for this estimate.
  const catalogItems = React.useMemo(() => (custom ? [...(catalog?.items ?? []).filter((c) => c.id !== custom.id), custom] : catalog?.items ?? []), [catalog, custom]);
  const engineRaw = React.useMemo<EngineResult | null>(() => (model && catalog && ready ? runEngine(model, { catalog: catalogItems, job, input: jobInput, outdoorKind: outdoorKind ?? undefined }) : null), [model, catalog, catalogItems, ready, job, jobInput, outdoorKind]);
  // AC or heat pump outside, each priced as the whole job at its Better tier,
  // when the job allows both and the catalog fits both.
  const kindQuotes = React.useMemo(() => {
    if (!model || !catalog || !ready || !(def.id === "replace-outdoor" || def.id === "replace-system") || model.existing.kind === "package-unit") return [];
    return (["air-conditioner", "heat-pump"] as const).flatMap((kind) => {
      const r0 = runEngine(model, { catalog: catalogItems, job, input: jobInput, outdoorKind: kind });
      // The engine fell back to the other kind: this one is not on offer.
      if (!r0.selection.chosen || r0.selection.chosen.item.kind !== kind) return [];
      const fits = r0.selection.candidates.filter((c) => !c.disqualified && c.item.kind === kind);
      const base = fits.filter((c) => c.item.tier === "mid").sort((a, b) => b.score - a.score)[0] ?? r0.selection.chosen;
      const r = base.item.id === r0.selection.chosen.item.id ? r0 : runEngine(model, { catalog: catalogItems, job, input: jobInput, outdoorKind: kind, pick: base.item.id });
      const l = buildLedger(r, model, card.card, catalogItems, { job, input: jobInput, linesetFt });
      const furnace = l.materials.some((x) => x.id === "eq-furnace");
      const airHandler = l.materials.some((x) => x.id === "eq-ah");
      const hpHouse = model.existing.kind === "split-heat-pump";
      const sub = kind === "air-conditioner"
        ? (def.id === "replace-outdoor" ? (hpHouse ? "in place of the heat pump — heating falls to the backup heat" : "like for like — the indoor unit stays") : furnace ? "AC + gas furnace" : "AC + air handler, electric heat")
        : def.id === "replace-outdoor" && hpHouse ? (r.dualFuel ? "like for like — dual fuel, the furnace stays as backup" : "like for like — the air handler stays")
        : r.dualFuel ? "dual fuel — the furnace stays as backup" : airHandler ? "heat pump + air handler, all-electric" : "on the existing air handler";
      return [{ kind, subtotal: l.subtotal, sub, unit: base.item }];
    });
  }, [model, catalog, catalogItems, ready, def.id, job, jobInput, card, linesetFt]);
  // The unit on the estimate: the contractor's pick (a unit the engine ruled
  // out included), else the Better tier as the base quote when the catalog has
  // tiers, else the engine's own first choice. The run is repeated for that
  // unit so the checks and the notes describe what is being sold.
  const engine = React.useMemo<EngineResult | null>(() => {
    if (!engineRaw || !model) return engineRaw;
    const rerun = (id: string) => runEngine(model, { catalog: catalogItems, job, input: jobInput, outdoorKind: outdoorKind ?? undefined, custom: custom ?? undefined, pick: id });
    if (pickId) {
      if (engineRaw.selection.chosen?.item.id === pickId) return engineRaw;
      return engineRaw.selection.candidates.some((c) => c.item.id === pickId) ? rerun(pickId) : engineRaw;
    }
    const chosen = engineRaw.selection.chosen;
    if (!chosen) return engineRaw;
    const mid = engineRaw.selection.candidates.filter((c) => !c.disqualified && c.item.kind === chosen.item.kind && c.item.tier === "mid").sort((a, b) => b.score - a.score)[0];
    return mid && mid.item.id !== chosen.item.id ? rerun(mid.item.id) : engineRaw;
  }, [engineRaw, pickId, model, catalogItems, custom, job, jobInput, outdoorKind]);
  const ledger = React.useMemo(() => (engine && model && catalog ? buildLedger(engine, model, card.card, catalogItems, { job, input: jobInput, linesetFt, pick: pickId ?? undefined }) : null), [engine, model, catalog, catalogItems, card, job, jobInput, linesetFt, pickId]);
  // Good · Better · Best: the best fitting unit of each tier, priced as a whole job.
  const tiers = React.useMemo(() => (engineRaw && model && catalog ? tiersFor(engineRaw, model, card.card, catalogItems, { job, input: jobInput, linesetFt }, (id) => runEngine(model, { catalog: catalogItems, job, input: jobInput, outdoorKind: outdoorKind ?? undefined, custom: custom ?? undefined, pick: id })) : []), [engineRaw, model, catalog, catalogItems, custom, card, job, jobInput, linesetFt, outdoorKind]);

  // Every unit the contractor could put on this estimate: what the engine
  // ranked for a sized job, the catalog's tanks for a water-heater job. Rows
  // the engine ruled out stay on the list with their reason.
  const swapRows = React.useMemo(() => {
    const q = swapQ.trim().toLowerCase();
    const hit = (i: CatalogItem) => !q || `${i.brand} ${i.model}`.toLowerCase().includes(q);
    if (def.id === "water-heater") {
      const plan = engine?.waterHeater;
      // Only this job's kind of appliance is on the list: a gas tank is not an
      // option on a heat-pump job — the Type select is.
      const rows = catalogItems.filter((c) => c.kind === "water-heater" && hit(c) && (!plan || ((c.fuel ?? "gas") === plan.fuel && (c.whType ?? "tank") === plan.type)));
      return rows.map((item) => {
        const small = plan && plan.type !== "tankless" ? (item.gallons ?? 0) < plan.gallons : plan?.btuInput ? (item.btuInput ?? 0) < plan.btuInput : false;
        const out = small ? `Smaller than the ${plan && plan.type !== "tankless" ? `${plan.gallons} gal` : `${Math.round((plan?.btuInput ?? 0) / 1000)}k BTU/h`} the household sizes to.` : undefined;
        const why = [item.gallons ? `${item.gallons} gal` : "", item.btuInput ? `${Math.round(item.btuInput / 1000)}k BTU/h` : "", item.uef ? `${item.uef} UEF` : "", item.vent && item.vent !== "none" ? `${item.vent} vent` : ""].filter(Boolean).join(" · ");
        return { item, out, why, score: (item.gallons ?? item.btuInput ?? 0), miss: 0 };
      }).sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || a.score - b.score);
    }
    const kind = engine?.selection.chosen?.item.kind;
    return (engine?.selection.candidates ?? [])
      .filter((c) => (!kind || c.item.kind === kind) && hit(c.item))
      .map((c) => ({
        item: c.item,
        out: c.disqualified,
        why: c.coolingRatio !== undefined ? `Cooling ${Math.round(c.coolingRatio * 100)}% of the load` : c.outputRatio !== undefined ? `Output ${Math.round(c.outputRatio * 100)}% of the load` : c.reasons[0] ?? "",
        score: c.score,
        // Ruled-out rows are ordered by how near they came, so the 4½-ton that
        // just missed is at the top and the 1½-ton is not.
        miss: Math.abs((c.coolingRatio ?? c.outputRatio ?? 0) - 1),
      }))
      .sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (a.out ? a.miss - b.miss : b.score - a.score));
  }, [engine, catalogItems, def.id, swapQ]);
  const swapFits = swapRows.filter((r) => !r.out);
  const swapOut = swapRows.filter((r) => r.out);
  const swapShown = [...swapFits.slice(0, 10), ...swapOut.slice(0, 6)];
  const chosenId = def.id === "water-heater" ? pickId : engine?.selection.chosen?.item.id ?? null;
  // "no cost" is worth saying only when the shop has priced some of its rows.
  const someCost = swapRows.some((r) => r.item.cost);

  /** The unit the contractor typed, as a catalog row. */
  const buildTypedUnit = (): CatalogItem | null => {
    const brand = (unitDraft.brand ?? "").trim();
    const modelNo = (unitDraft.model ?? "").trim();
    if (!brand || !modelNo) return null;
    const kind = (unitDraft.kind || engine?.selection.chosen?.item.kind || (def.id === "water-heater" ? "water-heater" : def.kinds[0]) || "air-conditioner") as CatalogItem["kind"];
    const n = (k: string) => { const v = Number(unitDraft[k]); return Number.isFinite(v) && v > 0 ? v : undefined; };
    const tons = n("tons");
    const kbtu = n("kbtu");
    const afue = n("afue");
    const cold = unitDraft.coldClimate === "yes";
    const item: CatalogItem = {
      id: `custom-${kind}-${brand}-${modelNo}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""),
      kind, brand, model: modelNo, typed: true, source: "shop",
      tons: kind === "furnace" || kind === "water-heater" ? undefined : tons,
      coolingBtuh: tons && !["furnace", "water-heater", "air-handler", "coil"].includes(kind) ? Math.round(tons * 12000) : undefined,
      btuInput: kbtu ? Math.round(kbtu * 1000) : undefined,
      afue: afue ? (afue > 1 ? afue / 100 : afue) : undefined,
      seer2: n("seer2"), hspf2: n("hspf2"), eer2: n("eer2"),
      refrigerant: (unitDraft.refrigerant || undefined) as CatalogItem["refrigerant"],
      staging: (unitDraft.staging || undefined) as CatalogItem["staging"],
      mcaAmps: n("mca"),
      cost: n("cost"),
      ahriRef: (unitDraft.ahri ?? "").trim() || undefined,
      ratedStaticInWc: kind === "furnace" || kind === "air-handler" || kind === "coil" ? 0.5 : undefined,
      maxTons: kind === "furnace" || kind === "air-handler" ? n("maxTons") ?? (kbtu ? (kbtu <= 45 ? 3 : kbtu <= 70 ? 4 : 5) : tons) : undefined,
      gallons: kind === "water-heater" ? n("gallons") : undefined,
      whType: kind === "water-heater" ? ((unitDraft.whType || "tank") as CatalogItem["whType"]) : undefined,
      fuel: kind === "water-heater" ? ((unitDraft.fuel || "gas") as CatalogItem["fuel"]) : undefined,
      uef: kind === "water-heater" ? n("uef") : undefined,
      vent: kind === "water-heater" ? ((unitDraft.vent || undefined) as CatalogItem["vent"]) : undefined,
    };
    if ((kind === "heat-pump" || kind === "ductless") && tons) {
      const rated = Math.round(tons * 12000);
      item.coldClimate = cold || undefined;
      item.heat47Btuh = n("h47") ? Math.round((n("h47") ?? 0) * 1000) : rated;
      item.heat17Btuh = n("h17") ? Math.round((n("h17") ?? 0) * 1000) : Math.round(rated * (cold ? 0.85 : 0.62));
      item.heat5Btuh = n("h5") ? Math.round((n("h5") ?? 0) * 1000) : Math.round(rated * (cold ? 0.7 : 0.48));
    }
    return item;
  };
  const useTypedUnit = () => {
    const item = buildTypedUnit();
    if (!item) { setSwapMsg("Brand and model, at least — the rest can follow from the submittal."); return; }
    setCustom(item);
    setPickId(item.id);
    setSwapMsg(`${item.brand} ${item.model} is on the estimate. It is typed in, not a catalog row, so the checks say to confirm it against the submittal${item.cost ? "" : " and the price is a rate-card default until you add the cost"}.`);
  };
  const saveTypedUnit = async () => {
    const item = buildTypedUnit();
    if (!item) { setSwapMsg("Brand and model, at least — the rest can follow from the submittal."); return; }
    setSwapMsg("Saving…");
    const res = await saveHvacCatalogItem({ ...item, typed: undefined });
    if (!res.ok) { setSwapMsg(res.error); return; }
    setCatalog(await listHvacCatalog());
    setCustom(null);
    setPickId(res.item.id);
    setSwapMsg(`${res.item.brand} ${res.item.model} is in your catalog now, and on this estimate.`);
  };

  // Water heater: one tank per maker that fits the sized plan, each priced as
  // the whole job; the first is the engine's own pick unless one is chosen.
  const whOptions = React.useMemo(() => {
    if (def.id !== "water-heater" || !engine?.waterHeater || !model || !catalog) return [];
    return waterHeaterOptions(catalogItems, engine.waterHeater).slice(0, 4).map((item) => ({ item, subtotal: buildLedger(engine, model, card.card, catalogItems, { job, input: jobInput, linesetFt, pick: item.id }).subtotal }));
  }, [def.id, engine, model, catalog, catalogItems, card, job, jobInput, linesetFt]);
  const whChosen = def.id === "water-heater" ? (whOptions.find((o) => o.item.id === pickId)?.item ?? catalogItems.find((c) => c.id === pickId && c.kind === "water-heater") ?? whOptions[0]?.item ?? null) : null;

  // The editable lines follow the ledger until the contractor edits them, and
  // reset when the design behind them changes. Derived state, adopted in render.
  // The names are part of the key: a catalog swap that keeps the size and
  // the price still renames the unit, and the lines must follow.
  const ledgerKey = ledger ? `${ledger.subtotal}|${ledger.materials.map((l) => l.id + l.name + l.quantity).join(",")}|${ledger.labor.map((l) => l.id + l.name + l.quantity).join(",")}` : "";
  if (ledger && lines?.key !== ledgerKey) setLines({ key: ledgerKey, materials: ledger.materials, labor: ledger.labor });

  const onTyped = React.useCallback((path: string, v: unknown) => setTyped((t) => ({ ...t, [path]: v })), []);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ── 1 · site lookup ───────────────────────────────────────────────────────
  const lookupSite = async () => {
    const text = (addrRef.current?.value ?? "").trim();
    const full = picked?.formatted && picked.typed !== true ? picked.formatted : text;
    if (!full) { setSiteError("Enter the address first."); return; }
    if (!def.needs.load) {
      // A tank swap or a service call does not wait for the parcel: the form
      // is up at once on the address and the state, and the house record
      // (county, year built, area) fills in behind it when the lookup lands.
      const st = (stateCode || (full.match(/\b([A-Z]{2})\b(?=\s*\d{5}|\s*$)/) ?? [])[1] || "").toUpperCase();
      if (!st) { setSiteError("Add the state to the address (e.g. WA)."); return; }
      setSiteError("");
      setRestored(null); setPickId(null); setOutdoorKind(null); setCustom(null); setSwapMsg(""); setSavedId(null); setPermit(null); setReportUrl(null); setPermitMsg(""); setTitle(null);
      setSite({ address: full, state: st, county: countyPicked && county ? county : undefined, sources: {} });
      setSiteLocal(true);
      setStateCode(st);
      setSiteWarnings([]);
      setTimeout(() => scrollTo("hv-intake"), 60);
      setSiteBusy(true);
      try {
        const res = await hvacSiteFacts({ address: full, state: st, county: countyPicked && county ? county : undefined, lat: picked?.lat, lng: picked?.lng });
        // The contractor may have moved on to another address meanwhile.
        if ((addrRef.current?.value ?? "").trim() !== text) return;
        if (!res.ok) { setSiteWarnings([`House record not found for this address (${res.error}) — the job runs on the address and the state.`]); return; }
        setSite(res.facts);
        setSiteLocal(false);
        setStateCode(res.facts.state);
        if (res.facts.county) {
          const hit = designConditionsFor(res.facts.state, res.facts.county);
          setCounty(hit.match === "county" || hit.match === "fuzzy" ? hit.conditions.county : res.facts.county);
        }
        setCountyPicked(false);
        setSiteWarnings(res.warnings);
      } catch (err) {
        setSiteWarnings([`House record not reached (${errMsg(err)}) — the job runs on the address and the state.`]);
      } finally {
        setSiteBusy(false);
      }
      return;
    }
    const hasIntake = analysis || Object.keys(plates).length > 0 || Object.keys(typed).length > 0;
    const sameHouse = site?.address === full;
    if (hasIntake && !sameHouse && !window.confirm("Start over? The walk, plates and typed answers for this house will be cleared.")) return;
    setSiteBusy(true);
    setSiteError("");
    try {
      const res = await hvacSiteFacts({ address: full, state: stateCode || undefined, county: countyPicked && county ? county : undefined, lat: picked?.lat, lng: picked?.lng });
      if (!res.ok) { setSiteError(res.error); reportPlanLimitResult(res); return; }
      setRestored(null);
      setPickId(null); setOutdoorKind(null); setCustom(null); setSwapMsg("");
      setSavedId(null);
      setPermit(null);
      setReportUrl(null);
      setPermitMsg("");
      setTitle(null);
      if (!sameHouse) { setTyped({}); setAnalysis(null); setPlates({}); }
      setSite(res.facts);
      setSiteLocal(false);
      setStateCode(res.facts.state);
      if (res.facts.county) {
        const hit = designConditionsFor(res.facts.state, res.facts.county);
        setCounty(hit.match === "county" || hit.match === "fuzzy" ? hit.conditions.county : res.facts.county);
      } else setCounty("");
      setCountyPicked(false);
      setSiteWarnings(res.warnings);
      setTimeout(() => scrollTo("hv-intake"), 60);
    } catch (err) {
      setSiteError(errMsg(err));
    } finally {
      setSiteBusy(false);
    }
  };

  // ── 2 · the walk + plates ────────────────────────────────────────────────
  const onWalkFile = (f: File | undefined) => { if (f) void walk.pickFile(f); };
  const readWalk = async () => {
    const a = await walk.read(site?.address ?? "");
    if (a) {
      setAnalysis(a);
      const probe = model ? structuredClone(model) : null;
      const applied = probe ? applyWalkthrough(probe, a).applied : [];
      toast.success("Walk read", applied.length ? `Filled: ${applied.slice(0, 6).join(", ")}${applied.length > 6 ? ` +${applied.length - 6}` : ""}` : `${a.measurements.length} figures, ${a.observations.length} observations — nothing new for the model.`);
    }
  };
  const onPlateFile = async (key: SlotKey, hint: "outdoor" | "indoor" | "panel", f: File | undefined) => {
    if (!f) return;
    let dataUrl = "";
    try { dataUrl = await fileToJpegDataUrl(f); } catch (err) { toast.error("Photo", errMsg(err)); return; }
    setPlates((p) => ({ ...p, [key]: { thumb: dataUrl, busy: true } }));
    if (!(await ensureWithinLimit("estimatorUses"))) { setPlates((p) => ({ ...p, [key]: { thumb: dataUrl, error: "Plan limit reached" } })); return; }
    try {
      const res = await readHvacNameplate({ dataUrl, hint });
      if (!res.ok) {
        reportPlanLimitResult(res);
        setPlates((p) => ({ ...p, [key]: { thumb: dataUrl, error: res.error } }));
        return;
      }
      setPlates((p) => ({ ...p, [key]: { thumb: dataUrl, read: res.read } }));
      const probe = model ? structuredClone(model) : null;
      const applied = probe ? (key === "panel" ? (res.read.mcaAmps ? ["main breaker"] : []) : applyNameplate(probe, res.read).applied.map((x) => x.replace(/^existing\./, ""))) : [];
      toast.success(`${SLOTS.find((s) => s.key === key)?.title ?? "Plate"} read`, applied.length ? `Filled: ${applied.join(", ")}` : "Nothing readable — type the figures.");
    } catch (err) {
      setPlates((p) => ({ ...p, [key]: { thumb: dataUrl, error: errMsg(err) } }));
    }
  };

  // ── shop data ────────────────────────────────────────────────────────────
  const onCsv = async (f: File | undefined) => {
    if (!f) return;
    setCatMsg("Importing…");
    try {
      const csv = await f.text();
      const res = await importHvacCatalogCsv({ csv, replace: replaceCat });
      if (!res.ok) { setCatMsg(res.error); return; }
      setCatMsg(`${res.imported} rows imported${res.errors.length ? ` · ${res.errors.length} not: ${res.errors[0]}` : ""}.${res.note ? ` ${res.note}.` : ""}`);
      setCatalog(await listHvacCatalog());
    } catch (err) { setCatMsg(errMsg(err)); }
  };
  const onLoadUs = async () => {
    setCatMsg("Loading the US catalog…");
    const res = await loadUsCatalog({ replace: replaceCat });
    if (!res.ok) { setCatMsg(res.error); return; }
    setCatMsg(`${res.imported} rows loaded — the popular US families, ratings as published ${res.verifiedOn}. Add your costs to price from them.`);
    setCatalog(await listHvacCatalog());
  };
  // The current catalog as the import sheet: add costs in a spreadsheet, import it back.
  const onDownloadCatalog = () => {
    if (!catalog) return;
    const esc = (v: unknown) => { const s = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = catalog.items.map((c) => CATALOG_CSV_COLUMNS.map((k) => esc(k === "afue" && c.afue ? Math.round(c.afue * 100) : (c as unknown as Record<string, unknown>)[k])).join(","));
    const blob = new Blob([[CATALOG_CSV_COLUMNS.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hvac-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const onClearCatalog = async () => {
    const res = await clearHvacCatalog();
    setCatMsg(res.ok ? "Catalog cleared — the starter ladder is back." : res.error);
    setCatalog(await listHvacCatalog());
  };
  const saveCard = async () => {
    if (!cardDraft) return;
    setCardMsg("Saving…");
    const res = await saveHvacRateCard(cardDraft);
    try { window.localStorage.setItem(RATE_CARD_KEY, JSON.stringify(cardDraft)); } catch { /* blocked storage */ }
    setCard({ card: cardDraft, own: res.ok });
    setCardMsg(res.ok ? "Rate card saved for the whole shop." : res.error);
  };
  const templateHref = React.useMemo(() => {
    const rows = [CATALOG_CSV_COLUMNS.join(","), "heat pump,Brand,MODEL-036,3,36000,38000,30000,25000,,,18,12.5,10,R-454B,variable,yes,,25,,3450", "AC,Brand,MODEL-036,3,36000,,,,,,14.3,11.7,,R-454B,single,,,20,,1150", "furnace,Brand,MODEL-080,,,,,,80000,96,,,,,,,,,0.5,1290", "coil,Brand,MODEL-C36,3,,,,,,,,,,,,,,,,310", "air handler,Brand,MODEL-AH36,3,,,,,,,,,,,,,,,0.5,890"];
    return "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
  }, []);

  // ── 4 · save / convert / reopen ──────────────────────────────────────────
  const draft = () => ({
    job,
    input: jobInput,
    outdoorKind: kindQuotes.length === 2 ? outdoorKind ?? undefined : undefined,
    pick: engine?.selection.chosen?.item.id,
    custom: custom ?? undefined,
    title: title ?? ledger?.title ?? "HVAC replacement",
    scope: ledger?.scope ?? "",
    materials: lines?.materials ?? [],
    labor: lines?.labor ?? [],
    assumptions: ledger?.assumptions ?? [],
  });
  const save = async (): Promise<string | null> => {
    if (!site || !model || !engine) return null;
    setSaving(true);
    try {
      const res = await saveHvacEstimate({ id: savedId ?? undefined, address: site.address, siteFacts: site, model, engine, draft: draft() });
      if (!res.ok) { toast.error("Couldn't save", res.error); reportPlanLimitResult(res); return null; }
      setSavedId(res.id);
      toast.success("Estimate saved");
      refreshRecent();
      return res.id;
    } finally { setSaving(false); }
  };
  const convert = async () => {
    if (!lines || !ledger) return;
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConverting(true);
    try {
      const id = savedId ?? (await save());
      const d = draft();
      const res = await convertHvacEstimateToProposal({ estimateId: id, title: d.title, scope: d.scope, materials: d.materials, labor: d.labor, permitNote: reportUrl ? `Manual J load calculation: ACCA-approved report attached (Cool Calc${permit ? ` project ${permit.projectId}` : ""}).` : undefined });
      router.push(`/dashboard/manual-blueprint?proposal=${res.id}`);
    } catch (err) {
      if (!reportPlanLimit(err)) toast.error("Couldn't convert", errMsg(err));
    } finally { setConverting(false); }
  };
  const reopen = async (id: string) => {
    const res = await getHvacEstimate(id);
    if (!res.ok) { toast.error("Couldn't open", res.error); return; }
    const facts = res.row.siteFacts as SiteFacts;
    const m = res.row.model as BuildingModel;
    if (!facts?.address || !m?.provenance) { toast.error("Couldn't open", "That estimate is missing its site facts."); return; }
    setAnalysis(null);
    setPlates({});
    setTyped({});
    setSite(facts);
    setStateCode(facts.state);
    {
      const raw = m.county ?? facts.county ?? "";
      const hit = raw ? designConditionsFor(facts.state, raw) : null;
      setCounty(hit && (hit.match === "county" || hit.match === "fuzzy") ? hit.conditions.county : raw);
    }
    setRestored(m);
    const savedJob = (res.row.draft as { job?: string; input?: JobInput }).job;
    setJob(JOBS.some((j) => j.id === savedJob) ? (savedJob as JobKind) : DEFAULT_JOB);
    setJobInput((res.row.draft as { input?: JobInput }).input ?? {});
    setOutdoorKind((res.row.draft as { outdoorKind?: OutdoorKind }).outdoorKind ?? null);
    const d = res.row.draft as { pick?: string; custom?: CatalogItem };
    setCustom(d.custom ?? null);
    setPickId(d.pick ?? null);
    setSavedId(res.row.id);
    setPermit(res.row.permit);
    setReportUrl(res.row.approvedReportUrl);
    setPermitMsg("");
    setTitle(res.row.draft.title);
    setSiteWarnings([]);
    if (addrRef.current) addrRef.current.value = facts.address;
    setTimeout(() => scrollTo("hv-design"), 60);
  };

  // ── permit-grade report ──────────────────────────────────────────────────
  const requestPermit = async () => {
    const id = savedId ?? (await save());
    if (!id) return;
    setPermitBusy(true);
    setPermitMsg("");
    try {
      const res = await requestHvacPermitReport({ estimateId: id });
      if (!res.ok) { setPermitMsg(res.error); return; }
      setPermit(res.permit);
      setPermitMsg(`Project ${res.permit.projectId} created in Cool Calc — finish the envelope there, then pull the report.`);
      window.open(res.appUrl, "_blank", "noopener");
    } finally { setPermitBusy(false); }
  };
  const attachPermit = async (url?: string) => {
    const id = savedId ?? (await save());
    if (!id) return;
    setPermitBusy(true);
    setPermitMsg("");
    try {
      const res = await attachHvacPermitReport({ estimateId: id, url });
      if (!res.ok) { setPermitMsg(res.error); return; }
      setReportUrl(res.url);
      setLinkDraft("");
      setPermitMsg("Report attached — the proposal will say so.");
      refreshRecent();
    } finally { setPermitBusy(false); }
  };
  const saveActual = async (id: string) => {
    const tons = Number(actualDraft.tons);
    const price = Number(actualDraft.price.replace(/[$,]/g, ""));
    const res = await recordHvacActual({ estimateId: id, actual: { tons: actualDraft.tons.trim() && Number.isFinite(tons) ? tons : undefined, price: actualDraft.price.trim() && Number.isFinite(price) ? price : undefined, notes: actualDraft.notes.trim() || undefined } });
    if (!res.ok) { toast.error("Couldn't record", res.error); return; }
    setActualFor(null);
    setActualDraft({ tons: "", price: "", notes: "" });
    refreshRecent();
  };

  // ── render ────────────────────────────────────────────────────────────────
  const cov = coverageFor(model);
  // What a folded group already knows, so the contractor does not have to open
  // it to see whether it is filled in.
  const EXISTING_WORDS: Record<string, string> = { "split-ac-furnace": "AC + furnace", "split-heat-pump": "heat pump", "furnace-only": "furnace only", "package-unit": "package unit", ductless: "ductless", boiler: "boiler", none: "nothing there" };
  const sumExisting = model ? [EXISTING_WORDS[model.existing.kind] ?? model.existing.kind.replace(/-/g, " "), model.existing.tons ? `${model.existing.tons} t` : "", model.existing.btuInput ? `${Math.round(model.existing.btuInput / 1000)}k BTU` : "", model.existing.fuel ?? "", model.existing.refrigerant ?? "", model.existing.yearMade ? String(model.existing.yearMade) : ""].filter(Boolean).join(" · ") : "";
  const sumPanel = model ? [model.electrical.mainAmps ? `${model.electrical.mainAmps} A main` : "panel not read", model.electrical.freeSlots !== undefined ? `${model.electrical.freeSlots} free slots` : ""].filter(Boolean).join(" · ") : "";
  const sumDucts = model ? [
    ...(def.needs.ducts ? [model.ducts.location !== "none" ? `in the ${model.ducts.location}` : "no ducts", model.ducts.condition !== "unknown" ? model.ducts.condition : "", model.ducts.returnGrilleSqIn ? `${model.ducts.returnGrilleSqIn} sq in return` : "return not measured"] : []),
    ...(def.needs.gas ? [model.gas.available === false ? "no gas at the house" : model.gas.pipeIn ? `${model.gas.pipeIn === 0.5 ? "½" : model.gas.pipeIn === 0.75 ? "¾" : model.gas.pipeIn} in gas${model.gas.longestRunFt ? ` · ${model.gas.longestRunFt} ft run` : ""}` : model.gas.available ? "gas at the house · pipe not measured" : "gas not confirmed"] : []),
  ].filter(Boolean).join(" · ") : "";
  const chosen = engine?.selection.chosen ?? null;
  const counties = stateCode ? countiesFor(stateCode) : [];
  const subtotal = lines ? [...lines.materials, ...lines.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0) : 0;
  const defaultedCount = engine ? engine.notes.filter((n) => n.kind === "assumption").length : 0;

  return (
    <>
      {/* ── 0 · THE JOB ──────────────────────────────────────────────────── */}
      <section className={cx("card")} id="hv-job">
        <div className={cx("head")}>
          <div className={cx("head-txt")}>
            <div className={cx("card-title")}><span className={cx("step", "done")}>1</span>The job</div>
            <div className={cx("card-sub")}>Pick what you are pricing. It decides what the walk needs to catch, what the engine sizes and picks, and which lines land on the estimate.</div>
          </div>
        </div>
        <div className={cx("body")}>
          <div className={cx("jobs")} role="radiogroup" aria-label="Job">
            {JOBS.map((j) => (
              <button key={j.id} type="button" role="radio" aria-checked={job === j.id} className={cx("job", job === j.id && "on")} onClick={() => { setJob(j.id); setTitle(null); setPickId(null); setOutdoorKind(null); setCustom(null); setSwapMsg(""); if (!site) setTimeout(() => addrRef.current?.focus(), 30); else if (siteLocal && j.needs.load) { setSite(null); setSiteLocal(false); setTimeout(() => { addrRef.current?.focus(); scrollTo("hv-site"); }, 30); } }}>
                <span className={cx("job-t")}>{j.title}</span>
                <span className={cx("job-s")}>{j.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 1 · SITE ─────────────────────────────────────────────────────── */}
      <section className={cx("card")} id="hv-site">
        <div className={cx("head")}>
          <div className={cx("head-txt")}>
            <div className={cx("card-title")}><span className={cx("step", site && "done")}>2</span>The house</div>
            <div className={cx("card-sub")}>Type the address. The county sets the design day (ENERGY STAR 2019 table), the footprint sets the area, and the records fill what they can — everything else starts as an era default you can see.</div>
          </div>
        </div>
        <div className={cx("body")}>
          <div className={cx("grid", site ? "grid-addr" : "grid-1")}>
            <label className={cx("field")} htmlFor="hv-addr">
              <span className={cx("lbl")}>Address</span>
              <input ref={addrRef} id="hv-addr" className={cx("in")} placeholder="4518 Bluestem Hollow Dr, Frisco, TX 75034" autoComplete="off" onChange={() => setPicked(null)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupSite(); } }} />
            </label>
            {(site || /state/i.test(siteError)) && <label className={cx("field")} htmlFor="hv-state">
              <span className={cx("lbl")}>State</span>
              <select id="hv-state" className={cx("sel")} value={stateCode} onChange={(e) => { setStateCode(e.target.value); setCounty(""); setCountyPicked(false); }}>
                <option value="">auto</option>
                {STATES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </label>}
            {site && def.needs.load && <label className={cx("field")} htmlFor="hv-county">
              <span className={cx("lbl")}>County <span className={cx("mono")} style={{ textTransform: "none", letterSpacing: 0 }}>{site?.sources.county ?? "auto"}</span></span>
              <select id="hv-county" className={cx("sel")} value={county} onChange={(e) => { setCounty(e.target.value); setCountyPicked(true); }} disabled={!stateCode}>
                <option value="">{stateCode ? "auto from the address" : "pick the state first"}</option>
                {counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>}
          </div>
          {siteError && <div className={cx("call", "bad")} style={{ marginTop: 12 }}>{siteError}</div>}
          <div className={cx("acts")}>
            <button type="button" className={cx("btn", "btn-primary")} disabled={siteBusy} onClick={() => void lookupSite()}>
              <svg className={cx("ic")}><use href="#i-pin" /></svg>{siteBusy ? "Looking up…" : site ? "Look up another" : "Look up the house"}
            </button>
            <span className={cx("acts-note")}>{def.needs.load ? "Parcel · footprint · elevation · county design day" : siteBusy ? "The form is ready — the house record is on its way" : siteLocal ? "Running on the address and the state" : "Parcel · county · year built"}</span>
          </div>
        </div>
        {site && model && !def.needs.load && (
          <div className={cx("hero")}>
            <div className={cx("hero-cell")}>
              <div className={cx("kpi-lbl")}>The house</div>
              <div className={cx("hero-v")}>{siteLocal ? (siteBusy ? "…" : "—") : model.conditionedSqft ? num(model.conditionedSqft) : "—"}<small>{siteLocal ? "" : "sq ft"}</small></div>
              <div className={cx("hero-h")}>{siteLocal ? (siteBusy ? "looking up the record — the form below is already live" : "no house record found — running on the address and the state") : [model.yearBuilt ? `built ${model.yearBuilt}` : "", model.county ? `${model.county} County` : ""].filter(Boolean).join(" · ") || "record found"}</div>
            </div>
            <div className={cx("hero-cell")}>
              <div className={cx("kpi-lbl")}>Existing</div>
              <div className={cx("hero-v")}>{model.existing.tons ? `${model.existing.tons}` : "—"}<small>ton</small></div>
              <div className={cx("hero-h")}>{model.existing.kind.replace(/-/g, " ")}{model.existing.yearMade ? ` · ${model.existing.yearMade}` : ""}{model.existing.refrigerant ? ` · ${model.existing.refrigerant}` : ""}</div>
            </div>
            <div className={cx("hero-cell")}>
              <div className={cx("kpi-lbl")}>State</div>
              <div className={cx("hero-v")}>{model.state}</div>
              <div className={cx("hero-h")}>code and strapping rules by state</div>
            </div>
          </div>
        )}
        {site && model && def.needs.load && (
          <>
            <div className={cx("hero")}>
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Design day</div>
                <div className={cx("hero-v", "accent")}>{conditions ? `${conditions.conditions.coolingF}° / ${conditions.conditions.heatingF}°` : "—"}</div>
                <div className={cx("hero-h")} title={conditions?.conditions.source}>{conditions?.match === "county" || conditions?.match === "fuzzy" ? `${conditions.conditions.county} County` : conditions?.match === "state" ? "state median — pick the county" : "no table"} · {conditions?.conditions.state}{conditions?.approx ? " · approx" : ""}</div>
              </div>
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Conditioned area</div>
                <div className={cx("hero-v")}>{model.conditionedSqft ? num(model.conditionedSqft) : "—"}<small>sq ft</small></div>
                <div className={cx("hero-h")} title={model.provenance.conditionedSqft?.note}>{model.conditionedSqft ? <><Chip p={model.provenance.conditionedSqft} /> {model.provenance.conditionedSqft?.note}</> : <button type="button" className={cx("link")} onClick={() => document.getElementById("hv-conditionedSqft")?.focus()}>not on record — type it below</button>}</div>
              </div>
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Storeys · built</div>
                <div className={cx("hero-v")}>{model.storeys}<small>·</small>{model.yearBuilt ?? "—"}</div>
                <div className={cx("hero-h")} title={`${model.provenance.storeys?.note ?? ""} · ${model.provenance.yearBuilt?.note ?? ""}`}><Chip p={model.provenance.storeys} /> <Chip p={model.provenance.yearBuilt} /></div>
              </div>
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Elevation</div>
                <div className={cx("hero-v")}>{site.elevationFt !== undefined ? num(site.elevationFt) : "—"}<small>ft</small></div>
                <div className={cx("hero-h")}>{site.sources.elevation ?? "not sampled"}</div>
              </div>
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Existing</div>
                <div className={cx("hero-v")}>{model.existing.tons ? `${model.existing.tons}` : "—"}<small>ton</small></div>
                <div className={cx("hero-h")}>{model.existing.kind.replace(/-/g, " ")}{model.existing.yearMade ? ` · ${model.existing.yearMade}` : ""}{model.existing.refrigerant ? ` · ${model.existing.refrigerant}` : ""}</div>
              </div>
            </div>
            {siteWarnings.length > 0 && (
              <div className={cx("body")} style={{ paddingTop: 12 }}>
                {siteWarnings.map((w) => <div key={w} className={cx("call", "warn")}><span className={cx("stamp")}>note</span><span>{w}</span></div>)}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 2 · INTAKE ───────────────────────────────────────────────────── */}
      {site && model && (
        <section className={cx("card")} id="hv-intake">
          <div className={cx("head")}>
            <div className={cx("head-txt")}>
              <div className={cx("card-title")}><span className={cx("step", (analysis || Object.keys(plates).length > 0) && "done")}>3</span>What is there</div>
              <div className={cx("card-sub")}>Walk it on video and the reading fills the model; photograph the plates for the exact numbers; type over anything. Every figure keeps its source badge — <b>measured</b>, <b>read</b>, <b>stated</b> or <b>default</b>.</div>
            </div>
          </div>
          {!aiEnabled && <div className={cx("body")} style={{ paddingBottom: 0 }}><div className={cx("call", "warn")}><span className={cx("stamp")}>off</span><span>Plate and video reading need OPENAI_API_KEY on the server — type the facts in Confirm below; a typed model number still decodes.</span></div></div>}
          <div className={cx("intake")}>
            <div>
              <div className={cx("sec-title")}>Video walk</div>
              <div className={cx("sec-sub")}>Two to four minutes, talking as you go. The stills are read for what is there, the audio for what you said.</div>
              {!walk.file ? (
                <label className={cx("drop")} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onWalkFile(e.dataTransfer.files?.[0]); }}>
                  <input type="file" accept={VIDEO_ACCEPT} onChange={(e) => onWalkFile(e.target.files?.[0])} />
                  <svg className={cx("ic")}><use href="#i-video" /></svg>
                  <span className={cx("drop-t")}>Record or choose the walk</span>
                  <span className={cx("drop-s")}>Film it first, then pick it from the camera roll — or record now. Up to 5 minutes; the video never uploads, only stills and the audio do.</span>
                </label>
              ) : (
                <div className={cx("clip")}>
                  {walk.previewUrl && <video src={walk.previewUrl} muted playsInline preload="metadata" />}
                  <div style={{ minWidth: 0 }}>
                    <div className={cx("clip-t")}>{walk.file.name}</div>
                    <div className={cx("mono", "clip-m")}>{walk.probe ? `${fmtClock(walk.probe.duration)} · ${walk.probe.width}×${walk.probe.height}` : ""} · {walk.frames.length} stills{walk.audioState !== "pending" ? ` · audio ${walk.audioState}` : ""}</div>
                  </div>
                  <button type="button" className={cx("link")} onClick={() => { walk.removeFile(); setAnalysis(null); }}>Remove</button>
                </div>
              )}
              {walk.stage && (
                <div className={cx("stage")}><div className={cx("stage-bar")}><div className={cx("stage-fill")} style={{ width: `${walk.stagePct}%` }} /></div><span className={cx("stage-t")}>{walk.stageText}</span></div>
              )}
              {walk.error && <div className={cx("call", "bad")} style={{ marginTop: 10 }}>{walk.error}</div>}
              {walk.frames.length > 0 && !analysis && (
                <div className={cx("frames")}>
                  {/* Data URLs pulled from the clip in this browser — nothing for next/image to optimise. */}
                  {stripFrames(walk.frames, 6).map((f) => (
                    <div key={f.t} className={cx("frame")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.dataUrl} alt="" />
                      <span>{fmtClock(f.t)}</span>
                    </div>
                  ))}
                </div>
              )}
              {walk.file && !analysis && (
                <div className={cx("acts")}>
                  <button type="button" className={cx("btn", "btn-primary")} disabled={!walk.canRead} onClick={() => void readWalk()}>
                    <svg className={cx("ic")}><use href="#i-eye" /></svg>{walk.busy ? "Reading…" : "Read the walk"}
                  </button>
                  <span className={cx("acts-note")}>One estimator run · frames + audio only</span>
                </div>
              )}
              {analysis && (
                <div className={cx("call", "info")} style={{ marginTop: 12 }}>
                  <span className={cx("stamp")}>read</span>
                  <span><b>{analysis.measurements.length} figures, {analysis.observations.length} observations</b> — {analysis.measurements.slice(0, 6).map((m) => `${m.label} ${m.value}${m.unit ? " " + m.unit : ""}`).join(" · ")}{analysis.measurements.length > 6 ? " · …" : ""}{analysis.questions.length ? ` Still asks: ${analysis.questions.map((q) => q.question).join(" ")}` : ""}</span>
                </div>
              )}
              <details className={cx("guide")} open={guideOpen} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setGuideOpen(o); try { window.localStorage.setItem("jf.hvac.guideOpen", o ? "1" : "0"); } catch { /* blocked storage */ } }}>
                <summary><svg className={cx("ic")}><use href="#i-video" /></svg>How to shoot the walk<span className={cx("mono")}>{def.shots.length} shots · {def.shots.length >= 6 ? "2–4" : "1–2"} min · {guideOpen ? "hide" : "show"}</span></summary>
                <div className={cx("guide-body")}>
                  <div className={cx("shots")}>
                    {SHOTS.filter((sh) => def.shots.includes(sh.n)).map((sh) => (
                      <div key={sh.n} className={cx("shot")}>
                        <div className={cx("shot-n")}>{sh.n}</div>
                        <div>
                          <div className={cx("shot-t")}>{sh.title}</div>
                          <div className={cx("shot-d")}>{sh.detail}</div>
                          <div className={cx("shot-say")}>say: {sh.say}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={cx("tips")}>{TIPS.map((t) => <span key={t} className={cx("tip")}>{t}</span>)}</div>
                </div>
              </details>
              {(def.needs.load || def.needs.existing) && <div className={cx("cover")}>
                {cov.filter((c) => (def.needs.load || !["sqft", "year", "windows"].includes(c.key)) && (def.needs.existing || !["outdoor", "indoor"].includes(c.key)) && (def.needs.electrical || c.key !== "panel") && (def.needs.ducts || c.key !== "ducts") && (def.needs.gas || c.key !== "fuel")).map((c) => (
                  <button key={c.key} type="button" className={cx("cov", c.got && "got")} onClick={() => { const el = document.getElementById(({ outdoor: "hv-existing-model", indoor: "hv-existing-btuInput", panel: "hv-electrical-mainAmps", ducts: "hv-ducts-location", fuel: "hv-gas-available", sqft: "hv-conditionedSqft", year: "hv-yearBuilt", windows: "hv-windowType" } as Record<string, string>)[c.key] ?? ""); el?.closest("details")?.setAttribute("open", "true"); el?.focus(); el?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
                    <span className={cx("cov-i")}>{c.got ? "✓" : ""}</span>
                    <span><span className={cx("cov-t")}>{c.title}</span><br /><span className={cx("cov-s")}>{c.got ? "caught" : c.fix}</span></span>
                  </button>
                ))}
              </div>}
            </div>
            <div>
              <div className={cx("sec-title")}>Nameplate photos</div>
              <div className={cx("sec-sub")}>Close, straight on, plate filling the frame. The plate is read and the model number is decoded by the rules — a misread capacity never goes unchecked.</div>
              <div className={cx("slots")}>
                {SLOTS.map((sl) => {
                  const p = plates[sl.key];
                  const r = p?.read;
                  return (
                    <label key={sl.key} className={cx("slot", p && "has")}>
                      <input type="file" accept="image/*" onChange={(e) => void onPlateFile(sl.key, sl.hint, e.target.files?.[0])} />
                      {r && <span className={cx("chip", r.confidence === "high" ? "chip-pass" : r.confidence === "medium" ? "chip-verify" : "chip-fix")}>{r.confidence}</span>}
                      <span className={cx("slot-t")}>{sl.title}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL the browser just rendered */}
                      {p?.thumb ? <img src={p.thumb} alt={sl.title} /> : <span className={cx("slot-s")}>{sl.sub}</span>}
                      {p?.busy && <span className={cx("mono")}>Reading…</span>}
                      {p?.error && <span className={cx("slot-r")} style={{ color: "var(--danger)" }}>{p.error}</span>}
                      {r && (
                        <span className={cx("slot-r")}>
                          {sl.key === "panel"
                            ? <>{r.mcaAmps ? <><b>{r.mcaAmps} A</b> main</> : "main not read"}{r.notes ? ` · ${r.notes}` : ""}</>
                            : <>{[r.brand, r.model].filter(Boolean).join(" ") || "model not read"}{r.tons ? <> · <b>{r.tons} t</b></> : ""}{r.btuInput ? <> · <b>{num(r.btuInput / 1000)}k BTU</b></> : ""}{r.refrigerant ? ` · ${r.refrigerant}` : ""}{r.yearMade ? ` · ${r.yearMade}` : ""}{r.seer ? ` · ${r.seer} SEER` : ""}{r.afue ? ` · ${r.afue > 1 ? r.afue : Math.round(r.afue * 100)}% AFUE` : ""}</>}
                        </span>
                      )}
                      {p && !p.busy && <span className={cx("link")}>Retake</span>}
                    </label>
                  );
                })}
              </div>

            </div>
          </div>

          <div className={cx("confirm")}>
            <div className={cx("sec-title")}>Confirm</div>
            <div className={cx("sec-sub")}>What the engine is using.</div>
            {def.needs.load && !def.needs.zone && !model.conditionedSqft && <div className={cx("call", "warn")} style={{ marginBottom: 12 }}><span className={cx("stamp")}>needed</span><span>The conditioned square footage — nothing else can stand in for it. <button type="button" className={cx("link")} onClick={() => document.getElementById("hv-conditionedSqft")?.focus()}>Type it</button> or say it on the walk.</span></div>}
            {def.needs.zone && !jobInput.zoneSqft && <div className={cx("call", "warn")} style={{ marginBottom: 12 }}><span className={cx("stamp")}>needed</span><span>The zone’s square footage — the rooms the heads will serve. <button type="button" className={cx("link")} onClick={() => document.getElementById("hv-zone-sqft")?.focus()}>Type it</button>.</span></div>}

            <div className={cx("grp", "grp-house")}>
              <div className={cx("grp-t")}><span className={cx("grp-k")}>The house as it is</span><span className={cx("grp-s")}>What the records, the walk and the plates found. Type over anything — what you type wins, and the badge shows where each figure came from.</span></div>
            {def.needs.load && !def.needs.zone && <div className={cx("fs")}>
              <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>House</span><span className={cx("mono")}>{model.yearBuilt ? `era defaults from ${model.yearBuilt}` : "era defaults from 1985 until the year is known"}</span></div>
              <div className={cx("grid-f")}>
                <Field label="Conditioned sq ft" path="conditionedSqft" model={model} kind="num" onChange={onTyped} placeholder="2,400" />
                <Field label="Storeys" path="storeys" model={model} kind="num" onChange={onTyped} />
                <Field label="Year built" path="yearBuilt" model={model} kind="num" onChange={onTyped} placeholder="1998" />
                <Field label="Windows" path="windowType" model={model} kind="select" onChange={onTyped} options={[["single", "Single pane"], ["double", "Double pane"], ["double-lowe", "Double, low-E"], ["triple", "Triple pane"]]} />
                <Field label="Foundation" path="foundation" model={model} kind="select" onChange={onTyped} options={[["slab", "Slab"], ["crawl-vented", "Crawlspace, vented"], ["crawl-sealed", "Crawlspace, sealed"], ["basement-unconditioned", "Basement, unconditioned"], ["basement-conditioned", "Basement, conditioned"]]} />
              </div>
              <details className={cx("more")}>
                <summary>More about the house <span className={cx("mono")}>ceiling · insulation · tightness · roof · shade · occupants</span></summary>
                <div className={cx("grid-f")} style={{ marginTop: 10 }}>
                  <Field label="Ceiling ft" path="ceilingHeightFt" model={model} kind="num" onChange={onTyped} />
                  <Field label="Occupants" path="occupants" model={model} kind="num" onChange={onTyped} />
                  <Field label="Wall insulation" path="wallInsulation" model={model} kind="select" onChange={onTyped} options={[["none", "None"], ["r11", "R-11"], ["r13", "R-13"], ["r19", "R-19"], ["r21", "R-21"]]} />
                  <Field label="Attic insulation" path="ceilingInsulation" model={model} kind="select" onChange={onTyped} options={[["none", "None"], ["r11", "R-11"], ["r19", "R-19"], ["r30", "R-30"], ["r38", "R-38"], ["r49", "R-49"]]} />
                  <Field label="Air tightness" path="tightness" model={model} kind="select" onChange={onTyped} options={[["leaky", "Leaky"], ["average", "Average"], ["tight", "Tight"], ["very-tight", "Very tight"]]} />
                  <Field label="Roof colour" path="roofColor" model={model} kind="select" onChange={onTyped} options={[["light", "Light"], ["medium", "Medium"], ["dark", "Dark"]]} />
                  <Field label="Shading" path="shading" model={model} kind="select" onChange={onTyped} options={[["none", "None — full sun"], ["some", "Some"], ["heavy", "Heavy trees"]]} />
                </div>
              </details>
            </div>}
            {def.needs.zone && <div className={cx("fs")}>
              <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>The envelope</span><span className={cx("mono")}>{model.yearBuilt ? `era defaults from ${model.yearBuilt}` : "era defaults from 1985 until the year is known"}</span></div>
              <div className={cx("grid-f")}>
                <Field label="Year built" path="yearBuilt" model={model} kind="num" onChange={onTyped} placeholder="1998" />
                <Field label="Ceiling ft" path="ceilingHeightFt" model={model} kind="num" onChange={onTyped} />
                <Field label="Windows" path="windowType" model={model} kind="select" onChange={onTyped} options={[["single", "Single pane"], ["double", "Double pane"], ["double-lowe", "Double, low-E"], ["triple", "Triple pane"]]} />
                <Field label="Wall insulation" path="wallInsulation" model={model} kind="select" onChange={onTyped} options={[["none", "None"], ["r11", "R-11"], ["r13", "R-13"], ["r19", "R-19"], ["r21", "R-21"]]} />
                <Field label="Attic insulation" path="ceilingInsulation" model={model} kind="select" onChange={onTyped} options={[["none", "None"], ["r11", "R-11"], ["r19", "R-19"], ["r30", "R-30"], ["r38", "R-38"], ["r49", "R-49"]]} />
                <Field label="Shading" path="shading" model={model} kind="select" onChange={onTyped} options={[["none", "None — full sun"], ["some", "Some"], ["heavy", "Heavy trees"]]} />
              </div>
            </div>}

            {def.needs.existing && <details className={cx("fs", "fold")}>
              <summary className={cx("fs-t")}><span className={cx("kpi-lbl")}>Existing system</span><span className={cx("fold-s")}>{sumExisting}</span></summary>
              <div className={cx("grid-f")}>
                <Field label="Kind" path="existing.kind" model={model} kind="select" onChange={onTyped} options={[["split-ac-furnace", "AC + furnace"], ["split-heat-pump", "Heat pump"], ["furnace-only", "Furnace only"], ["package-unit", "Package / rooftop"], ["ductless", "Ductless"], ["none", "None"]]} />
                <Field label="Tons" path="existing.tons" model={model} kind="num" onChange={onTyped} step="0.5" />
                <Field label="Furnace BTU input" path="existing.btuInput" model={model} kind="num" onChange={onTyped} placeholder="80,000" />
                <Field label="Fuel" path="existing.fuel" model={model} kind="select" onChange={onTyped} options={[["gas", "Natural gas"], ["propane", "Propane"], ["electric", "Electric"], ["oil", "Oil"], ["none", "None"]]} />
                <Field label="Refrigerant" path="existing.refrigerant" model={model} kind="select" onChange={onTyped} options={[["R-22", "R-22"], ["R-410A", "R-410A"], ["R-454B", "R-454B"], ["R-32", "R-32"]]} />
                <Field label="Year made" path="existing.yearMade" model={model} kind="num" onChange={onTyped} />
                <Field label="Brand" path="existing.brand" model={model} kind="text" onChange={onTyped} />
                <Field label="Model number" path="existing.model" model={model} kind="text" onChange={onTyped} placeholder="24ACC636A003" />
              </div>
            </details>}

            {def.needs.electrical && <details className={cx("fs", "fold")}>
              <summary className={cx("fs-t")}><span className={cx("kpi-lbl")} title="The panel count the checks run: NEC 220.83(B)">Electrical</span><span className={cx("fold-s")}>{sumPanel}</span></summary>
              <div className={cx("grid-f")}>
                <Field label="Main breaker" path="electrical.mainAmps" model={model} kind="select" onChange={(p, v) => onTyped(p, v === undefined ? undefined : Number(v))} options={[["60", "60 A"], ["100", "100 A"], ["125", "125 A"], ["150", "150 A"], ["200", "200 A"], ["400", "400 A"]]} />
                <Field label="Open breaker slots" path="electrical.freeSlots" model={model} kind="num" onChange={onTyped} />
                {job !== "water-heater" && <>
                  <Field label="Electric range" path="electrical.electricRange" model={model} kind="bool" onChange={onTyped} />
                  <Field label="Electric dryer" path="electrical.electricDryer" model={model} kind="bool" onChange={onTyped} />
                  <Field label="Electric water heater" path="electrical.electricWaterHeater" model={model} kind="bool" onChange={onTyped} />
                  <Field label="EV charger" path="electrical.evCharger" model={model} kind="bool" onChange={onTyped} />
                </>}
              </div>
            </details>}

            {(def.needs.ducts || def.needs.gas) && <details className={cx("fs", "fold")}>
              <summary className={cx("fs-t")}><span className={cx("kpi-lbl")}>{def.needs.ducts && def.needs.gas ? "Ducts · gas" : def.needs.ducts ? "Ducts" : "Gas supply"}</span><span className={cx("fold-s")}>{sumDucts}</span></summary>
              <div className={cx("grid-f")}>
                {def.needs.ducts && <>
                  <Field label="Ducts are in" path="ducts.location" model={model} kind="select" onChange={onTyped} options={[["conditioned", "Conditioned space"], ["attic", "Attic"], ["crawl", "Crawlspace"], ["basement", "Basement"], ["none", "No ducts"]]} />
                  <Field label="Duct condition" path="ducts.condition" model={model} kind="select" onChange={onTyped} options={[["good", "Good"], ["fair", "Fair"], ["poor", "Poor"], ["unknown", "Not seen"]]} />
                  <Field label="Ducts insulated" path="ducts.insulated" model={model} kind="bool" onChange={onTyped} />
                  <Field label="Supply registers" path="ducts.supplyRegisters" model={model} kind="num" onChange={onTyped} placeholder="8" />
                  <Field label="Return grille (sq in, W×H)" path="ducts.returnGrilleSqIn" model={model} kind="num" onChange={onTyped} placeholder="20×25 = 500" />
                  <Field label="Static pressure (in. w.c.)" path="ducts.measuredTespInWc" model={model} kind="num" onChange={onTyped} step="0.05" />
                </>}
                {def.needs.gas && <>
                  <Field label="Gas at the house" path="gas.available" model={model} kind="bool" onChange={onTyped} />
                  <Field label="Gas pipe" path="gas.pipeIn" model={model} kind="select" onChange={(p, v) => onTyped(p, v === undefined ? undefined : Number(v))} options={[["0.5", "½ in"], ["0.75", "¾ in"], ["1", "1 in"], ["1.25", "1¼ in"]]} />
                  <Field label="Gas run ft" path="gas.longestRunFt" model={model} kind="num" onChange={onTyped} />
                </>}
              </div>
            </details>}
                        {def.needs.waterHeater && (
              <div className={cx("fs")}>
                <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>The water heater that is there</span></div>
                <div className={cx("grid-f")}>
                  <label className={cx("field")} htmlFor="hv-wh-old"><span className={cx("lbl")}>Existing tank</span><select id="hv-wh-old" className={cx("sel")} value={jobInput.wh?.existingFuel ?? ""} onChange={(e) => setWh({ existingFuel: (e.target.value || undefined) as NonNullable<JobInput["wh"]>["existingFuel"] })}><option value="">not seen</option><option value="gas">Gas</option><option value="electric">Electric</option><option value="propane">Propane</option></select></label>
                  <Field label="Occupants" path="occupants" model={model} kind="num" onChange={onTyped} />
                </div>
              </div>
            )}
            </div>
            <div className={cx("grp", "grp-job")}>
              <div className={cx("grp-t")}><span className={cx("grp-k")}>What we&rsquo;re putting in</span><span className={cx("grp-s")}>The calls for this job. These set the size, the parts and the price.</span></div>
            {def.needs.zone && (
              <div className={cx("fs")}>
                <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>The zone</span><span className={cx("mono")}>the rooms the heads will serve</span></div>
                <div className={cx("grid-f")}>
                  <label className={cx("field")} htmlFor="hv-zone-sqft"><span className={cx("lbl")}><span>Zone sq ft</span>{jobInput.zoneSqft ? <span className={cx("chip", "chip-stated")}>stated</span> : <span className={cx("chip", "chip-default")}>needed</span>}</span><input id="hv-zone-sqft" className={cx("in", "num")} inputMode="decimal" placeholder="420" defaultValue={jobInput.zoneSqft ?? ""} onBlur={(e) => { const n = Number(e.target.value.replace(/,/g, "")); setJobInput((j) => ({ ...j, zoneSqft: e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined })); }} /></label>
                  <label className={cx("field")} htmlFor="hv-heads"><span className={cx("lbl")}>Indoor heads</span><select id="hv-heads" className={cx("sel")} value={String(jobInput.heads ?? 1)} onChange={(e) => setJobInput((j) => ({ ...j, heads: Number(e.target.value) }))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                </div>
              </div>
            )}
            {def.needs.waterHeater && (
              <div className={cx("fs")}>
                <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>The new water heater</span><span className={cx("mono")}>{jobInput.wh?.gallons ? "size entered" : `sized from ${model.occupants} occupants`}</span></div>
                <div className={cx("grid-f")}>
                  <label className={cx("field")} htmlFor="hv-wh-fuel"><span className={cx("lbl")}>New fuel</span><select id="hv-wh-fuel" className={cx("sel")} value={jobInput.wh?.fuel ?? ""} onChange={(e) => setWh({ fuel: (e.target.value || undefined) as NonNullable<JobInput["wh"]>["fuel"] })}><option value="">as the house ({model.gas.available === false ? "electric" : "gas"})</option><option value="gas">Natural gas</option><option value="propane">Propane</option><option value="electric">Electric</option></select></label>
                  <label className={cx("field")} htmlFor="hv-wh-type"><span className={cx("lbl")}>Type</span><select id="hv-wh-type" className={cx("sel")} value={jobInput.wh?.type ?? "tank"} onChange={(e) => { const type = e.target.value as NonNullable<JobInput["wh"]>["type"]; setWh(type === "heat-pump" ? { type, fuel: "electric" } : { type }); }}><option value="tank">Tank</option><option value="heat-pump">Heat-pump tank</option><option value="tankless">Tankless</option></select></label>
                  <label className={cx("field")} htmlFor="hv-wh-gal"><span className={cx("lbl")}>Gallons</span><input id="hv-wh-gal" className={cx("in", "num")} inputMode="decimal" placeholder="auto" defaultValue={jobInput.wh?.gallons ?? ""} onBlur={(e) => { const n = Number(e.target.value); setWh({ gallons: e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined }); }} /></label>
                  <label className={cx("field")} htmlFor="hv-wh-vent"><span className={cx("lbl")}>Venting</span><select id="hv-wh-vent" className={cx("sel")} value={jobInput.wh?.vent ?? ""} onChange={(e) => setWh({ vent: (e.target.value || undefined) as NonNullable<JobInput["wh"]>["vent"] })}><option value="">as existing</option><option value="atmospheric">Atmospheric (B-vent)</option><option value="power">Power vent</option><option value="direct">Direct vent</option><option value="none">None (electric)</option></select></label>
                  <label className={cx("field")} htmlFor="hv-wh-loc"><span className={cx("lbl")}>Location</span><select id="hv-wh-loc" className={cx("sel")} value={jobInput.wh?.location ?? "garage"} onChange={(e) => setWh({ location: e.target.value as NonNullable<JobInput["wh"]>["location"] })}><option value="garage">Garage</option><option value="closet">Closet</option><option value="basement">Basement</option><option value="utility">Utility room</option><option value="attic">Attic</option><option value="outdoor">Outdoor</option></select></label>
                </div>
              </div>
            )}
            {job === "service" && (
              <div className={cx("fs")}>
                <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>The visit</span></div>
                <div className={cx("grid-f")}>
                  <label className={cx("field")} htmlFor="hv-svc-task" style={{ gridColumn: "1 / -1" }}><span className={cx("lbl")}>Repair task</span><input id="hv-svc-task" className={cx("in")} placeholder="Replace the capacitor and contactor" defaultValue={jobInput.service?.task ?? ""} onBlur={(e) => setSvc({ task: e.target.value.trim() || undefined })} /></label>
                  <label className={cx("field")} htmlFor="hv-svc-lb"><span className={cx("lbl")}>Refrigerant lb</span><input id="hv-svc-lb" className={cx("in", "num")} inputMode="decimal" placeholder="0" defaultValue={jobInput.service?.refrigerantLb ?? ""} onBlur={(e) => { const n = Number(e.target.value); setSvc({ refrigerantLb: e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined }); }} /></label>
                  {[0, 1, 2].map((i) => (
                    <React.Fragment key={i}>
                      <label className={cx("field")} htmlFor={`hv-part-${i}`}><span className={cx("lbl")}>Part {i + 1}</span><input id={`hv-part-${i}`} className={cx("in")} placeholder={i === 0 ? "Run capacitor 45/5" : ""} defaultValue={jobInput.service?.parts?.[i]?.name ?? ""} onBlur={(e) => setSvc({ parts: [0, 1, 2].map((k) => (k === i ? { name: e.target.value.trim(), cost: jobInput.service?.parts?.[k]?.cost ?? 0 } : jobInput.service?.parts?.[k] ?? { name: "", cost: 0 })) })} /></label>
                      <label className={cx("field")} htmlFor={`hv-part-cost-${i}`}><span className={cx("lbl")}>Part {i + 1} cost $</span><input id={`hv-part-cost-${i}`} className={cx("in", "num")} inputMode="decimal" defaultValue={jobInput.service?.parts?.[i]?.cost || ""} onBlur={(e) => { const n = Number(e.target.value.replace(/[$,]/g, "")); setSvc({ parts: [0, 1, 2].map((k) => (k === i ? { name: jobInput.service?.parts?.[k]?.name ?? "", cost: Number.isFinite(n) && n > 0 ? n : 0 } : jobInput.service?.parts?.[k] ?? { name: "", cost: 0 })) }); }} /></label>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
{(def.selection !== "none" || def.needs.ducts) && <div className={cx("fs")}>
              <div className={cx("fs-t")}><span className={cx("kpi-lbl")}>How you want it done</span><span className={cx("mono")}>the calls that are yours, not the house&rsquo;s</span></div>
              <div className={cx("grid-f")}>
                {(job === "replace-system" || job === "heat-pump-conversion") && (
                  <label className={cx("field")} htmlFor="hv-heatpref">
                    <span className={cx("lbl")}><span>Heat preference</span>{(model.provenance["preferences.keepGas"] || model.provenance["preferences.allElectric"]) && <Chip p={model.provenance["preferences.keepGas"] ?? model.provenance["preferences.allElectric"]} />}</span>
                    <select id="hv-heatpref" className={cx("sel")} value={model.preferences.allElectric ? "electric" : model.preferences.keepGas ? "gas" : ""} onChange={(e) => { const v = e.target.value; onTyped("preferences.keepGas", v === "gas" ? true : v === "electric" ? false : undefined); onTyped("preferences.allElectric", v === "electric" ? true : v === "gas" ? false : undefined); }}>
                      <option value="">no preference</option>
                      <option value="gas">Keep gas heat</option>
                      <option value="electric">Go all-electric</option>
                    </select>
                  </label>
                )}
                {def.selection !== "none" && <Field label="Noise sensitive" path="preferences.noiseSensitive" model={model} kind="bool" onChange={onTyped} />}
                {def.selection !== "none" && def.selection !== "furnace" && <label className={cx("field")} htmlFor="hv-lineset">
                  <span className={cx("lbl")}><span>Line set ft</span>{linesetFt !== undefined && <span className={cx("chip", "chip-stated")}>stated</span>}</span>
                  <input id="hv-lineset" className={cx("in", "num")} inputMode="decimal" placeholder={String(card.card.linesetFtDefault)} defaultValue={linesetFt ?? ""} onBlur={(e) => { const n = Number(e.target.value); setLinesetFt(e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined); }} />
                </label>}
          </div>
            </div>}
            </div>

          </div>
        </section>
      )}

      {site && model && !engine && (
        <section className={cx("card")} id="hv-design">
          <div className={cx("head")}><div className={cx("head-txt")}><div className={cx("card-title")}><span className={cx("step")}>4</span>{def.needs.load ? "The design" : "The checks"}</div><div className={cx("card-sub")}>Waiting on the {def.needs.zone ? "zone’s" : "conditioned"} square footage above — the load, the unit and the price follow the moment it is in.</div></div></div>
        </section>
      )}

      {/* ── 3 · DESIGN ───────────────────────────────────────────────────── */}
      {engine && model && (
        <section className={cx("card")} id="hv-design">
          <div className={cx("head")}>
            <div className={cx("head-txt")}>
              <div className={cx("card-title")}><span className={cx("step", "done")}>4</span>{def.needs.load ? "The design" : "The checks"}</div>
              <div className={cx("card-sub")}>{def.needs.load ? `${def.needs.zone ? "Zone load" : "Block load"} at the county’s design day, ${def.selection === "none" ? "the airflow the ducts must carry" : "the unit the catalog fits within Manual S limits"}, and the checks a permit desk or a customer would ask about.` : engine.waterHeater ? `The tank sized from the household, and the gas, circuit and venting checks an inspector asks about.` : "What the visit needs, and the rule that applies."} Engine {engine.engineVersion}{def.needs.load ? ` · ${engine.conditions.source}${engine.conditions.verifiedOn ? ` · verified ${engine.conditions.verifiedOn}` : ""}` : ""}.</div>
            </div>
            <div className={cx("head-acts")}>{defaultedCount > 0 && <span className={cx("chip", "chip-default")}>{defaultedCount} assumption{defaultedCount === 1 ? "" : "s"}</span>}</div>
          </div>
          {engine.waterHeater && (
            <div className={cx("hero")}>
              <div className={cx("hero-cell")}><div className={cx("kpi-lbl")}>Tank</div><div className={cx("hero-v", "accent")}>{engine.waterHeater.type === "tankless" ? "tankless" : engine.waterHeater.gallons}<small>{engine.waterHeater.type === "tankless" ? "" : "gal"}</small></div><div className={cx("hero-h")}>{engine.waterHeater.sizedFrom}</div></div>
              <div className={cx("hero-cell")}><div className={cx("kpi-lbl")}>Fuel · type</div><div className={cx("hero-v")}>{engine.waterHeater.fuel}</div><div className={cx("hero-h")}>{engine.waterHeater.type === "heat-pump" ? "heat-pump tank" : engine.waterHeater.type} · {engine.waterHeater.vent === "none" ? "no vent" : `${engine.waterHeater.vent} vent`}</div></div>
              <div className={cx("hero-cell")}><div className={cx("kpi-lbl")}>{engine.waterHeater.btuInput ? "Gas input" : "Circuit"}</div><div className={cx("hero-v")}>{engine.waterHeater.btuInput ? num(engine.waterHeater.btuInput) : engine.waterHeater.circuitAmps ? `${engine.waterHeater.circuitAmps}` : "—"}<small>{engine.waterHeater.btuInput ? "BTU/h" : "A · 240 V"}</small></div><div className={cx("hero-h")}>{engine.waterHeater.location}</div></div>
            </div>
          )}
          {def.needs.load && <div className={cx("hero")}>
            <div className={cx("hero-cell")}>
              <div className={cx("kpi-lbl")}>Cooling load</div>
              <div className={cx("hero-v", "accent")}>{num(engine.load.coolingTotalBtuh)}</div>
              <div className={cx("hero-h")}>BTU/h · {engine.load.coolingTons.toFixed(1)} tons · SHR {engine.load.sensibleHeatRatio.toFixed(2)}</div>
            </div>
            <div className={cx("hero-cell")}>
              <div className={cx("kpi-lbl")}>Heating load</div>
              <div className={cx("hero-v")}>{num(engine.load.heatingBtuh)}</div>
              <div className={cx("hero-h")}>BTU/h at {engine.conditions.heatingF}° outdoor</div>
            </div>
            <div className={cx("hero-cell")}>
              <div className={cx("kpi-lbl")}>Size</div>
              <div className={cx("hero-v")}>{def.selection === "furnace" ? (chosen?.item.btuInput ? `${Math.round(chosen.item.btuInput / 1000)}k` : "—") : engine.selection.systems > 1 ? `${engine.selection.systems} × ${chosen?.item.tons ?? "?"}` : chosen?.item.tons ?? engine.selection.targetTons}<small>{def.selection === "furnace" ? "BTU in" : "ton"}</small></div>
              <div className={cx("hero-h")}>{def.selection === "furnace" ? `output ${chosen?.furnaceOutputBtuh ? num(chosen.furnaceOutputBtuh) : "—"} BTU/h` : engine.selection.systems > 1 ? "two zones, one system each" : `target ${engine.selection.targetTons} t`}</div>
            </div>
            {engine.zone ? (
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Zone</div>
                <div className={cx("hero-v")}>{num(engine.zone.sqft)}<small>sq ft</small></div>
                <div className={cx("hero-h")}>{engine.zone.heads} head{engine.zone.heads === 1 ? "" : "s"} · no ducts</div>
              </div>
            ) : (
              <div className={cx("hero-cell")}>
                <div className={cx("kpi-lbl")}>Airflow</div>
                <div className={cx("hero-v")}>{num(engine.load.coolingCfm)}<small>CFM</small></div>
                <div className={cx("hero-h")}>{engine.load.cfmPerTon} CFM/ton · ducts {Math.round(engine.load.ductGainCooling * 100)}% gain</div>
              </div>
            )}
          </div>}
          {kindQuotes.length === 2 && (
            <div className={cx("kinds")} role="radiogroup" aria-label={def.id === "replace-outdoor" ? "What goes outside" : "System type"}>
              <span className={cx("kinds-lbl")}>{def.id === "replace-outdoor" ? "What goes outside" : "System"}</span>
              {kindQuotes.map((q) => {
                const on = engineRaw?.selection.chosen?.item.kind === q.kind;
                return (
                  <button key={q.kind} type="button" role="radio" aria-checked={on} className={cx("kind", on && "on")} onClick={() => { setOutdoorKind(q.kind); setPickId(null); }}>
                    <span className={cx("kind-t")}>{q.kind === "air-conditioner" ? "Air conditioner" : "Heat pump"}<span className={cx("kind-v")}>{money(on && ledger ? ledger.subtotal : q.subtotal)}</span></span>
                    <span className={cx("kind-s")}>{q.sub}</span>
                  </button>
                );
              })}
            </div>
          )}
          {whOptions.length > 0 && (
            <div className={cx("tiers", "tiers-wh")} role="radiogroup" aria-label="Which tank">
              {whOptions.map((o, i) => {
                const on = (whChosen?.id ?? "") === o.item.id;
                return (
                  <button key={o.item.id} type="button" role="radio" aria-checked={on} className={cx("tier", on && "on")} onClick={() => { setPickId(o.item.id); setSwapMsg(""); }}>
                    <span className={cx("tier-k")}>{i === 0 && !pickId ? "Engine's pick" : o.item.brand}</span>
                    <span className={cx("tier-t")}>{o.item.brand} {o.item.model}</span>
                    <span className={cx("tier-m")}>{[o.item.gallons ? `${o.item.gallons} gal` : o.item.btuInput ? `${Math.round(o.item.btuInput / 1000)}k BTU/h` : "", o.item.uef ? `${o.item.uef} UEF` : "", o.item.vent && o.item.vent !== "none" ? `${o.item.vent} vent` : "", o.item.typed ? "typed in" : ""].filter(Boolean).join(" · ")}</span>
                    <span className={cx("tier-v")}>{money(o.subtotal)}{!o.item.cost && <small className={cx("tier-m")}> · rate-card price, no cost on the row</small>}</span>
                  </button>
                );
              })}
            </div>
          )}
          {tiers.length > 1 && (
            <div className={cx("tiers")} role="radiogroup" aria-label="Good, better, best">
              {tiers.map((t) => {
                const on = (engine?.selection.chosen?.item.id ?? "") === t.candidate.item.id;
                return (
                  <button key={t.tier} type="button" role="radio" aria-checked={on} className={cx("tier", on && "on")} onClick={() => setPickId(t.candidate.item.id)}>
                    <span className={cx("tier-k")}>{t.tier === "value" ? "Good" : t.tier === "mid" ? "Better" : "Best"}</span>
                    <span className={cx("tier-t")}>{t.candidate.item.brand} {t.candidate.item.model}</span>
                    <span className={cx("tier-m")}>{t.candidate.item.seer2 ? `${t.candidate.item.seer2} SEER2` : ""}{t.candidate.item.hspf2 ? ` · ${t.candidate.item.hspf2} HSPF2` : ""}{t.candidate.item.afue ? `${Math.round(t.candidate.item.afue * 100)}% AFUE` : ""}{t.candidate.item.staging ? ` · ${t.candidate.item.staging}` : ""}</span>
                    <span className={cx("tier-v")}>{money(t.subtotal)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className={cx("design")}>
            <div>
              {def.selection === "none" ? (
                <>
                  {def.id === "water-heater" && engine.waterHeater && (
                    <div className={cx("unit")}>
                      <div className={cx("unit-t")}>{whChosen ? `${whChosen.brand} ${whChosen.model}` : `${engine.waterHeater.gallons ? `${engine.waterHeater.gallons} gal ` : ""}${engine.waterHeater.fuel} ${engine.waterHeater.type === "heat-pump" ? "heat-pump tank" : engine.waterHeater.type} — no catalog row fits`}</div>
                      <div className={cx("mono", "unit-m")}>{whChosen ? [whChosen.gallons ? `${whChosen.gallons} gal` : "", whChosen.btuInput ? `${Math.round(whChosen.btuInput / 1000)}k BTU/h` : "", whChosen.uef ? `${whChosen.uef} UEF` : "", whChosen.vent && whChosen.vent !== "none" ? `${whChosen.vent} vent` : "", whChosen.typed ? "typed in" : whChosen.source === "shop" ? "your catalog" : "US catalog"].filter(Boolean).join(" · ") : "priced from the rate card until a row fits — pick or type one below"}</div>
                      <ul>
                        <li>{engine.waterHeater.sizedFrom}{whChosen && engine.waterHeater.type !== "tankless" && whChosen.gallons && whChosen.gallons > engine.waterHeater.gallons ? ` — the catalog's next size up is ${whChosen.gallons} gal` : ""}.</li>
                        {whOptions.length > 1 && <li>{whOptions.length} makers fit this tank: {whOptions.map((o) => o.item.brand).join(", ")}. Tap one above to price it.</li>}
                        {whChosen && whChosen.typed && <li>Typed in for this estimate — confirm it against the submittal.</li>}
                      </ul>
                    </div>
                  )}
                  <ul className={cx("notes")}>{engine.notes.filter((n) => n.kind === "contractor").map((n) => <li key={n.text}><span className={cx("chip", "chip-read")}>job</span><span>{n.text}</span></li>)}</ul>
                </>
              ) : chosen ? (
                <div className={cx("unit")}>
                  <div className={cx("unit-t")}>{engine.selection.systems > 1 ? `${engine.selection.systems} × ` : ""}{chosen.item.brand} {chosen.item.model}</div>
                  <div className={cx("mono", "unit-m")}>{chosen.item.kind.replace(/-/g, " ")}{chosen.item.tons ? ` · ${chosen.item.tons} t` : ""}{chosen.item.seer2 ? ` · ${chosen.item.seer2} SEER2` : ""}{chosen.item.hspf2 ? ` · ${chosen.item.hspf2} HSPF2` : ""}{chosen.item.refrigerant ? ` · ${chosen.item.refrigerant}` : ""}{chosen.item.staging ? ` · ${chosen.item.staging}` : ""}{chosen.item.coldClimate ? " · cold climate" : ""}</div>
                  {chosen.overridden && <div className={cx("call", "warn")} style={{ margin: "8px 0" }}><span className={cx("stamp")}>your pick</span><span>The engine ruled this unit out: {chosen.overridden} It is on the estimate because you chose it.</span></div>}
                  {chosen.item.typed && <div className={cx("call")} style={{ margin: "8px 0" }}><span className={cx("stamp")}>typed in</span><span>Typed in for this estimate, not a catalog row. Save it to the catalog below and it is there next time.</span></div>}
                  <ul>{chosen.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  {!catalog?.own && <div className={cx("runner")}>Starter ladder — no shop costs on these rows. Import the shop catalog below and the same engine picks from it.</div>}
                  {engine.selection.runnerUp && <div className={cx("runner")}><b>Runner-up:</b> {engine.selection.runnerUp.item.brand} {engine.selection.runnerUp.item.model} — {engine.selection.runnerUp.reasons[0]}</div>}
                </div>
              ) : (
                <div className={cx("call", "warn")}><span className={cx("stamp")}>no fit</span><span>{model?.existing.kind === "package-unit" && engine.selection.candidates.length === 0 ? "No package rows in the catalog — the estimate prices a package unit from the rate card. Add your package rows (kind: package) to pick a model." : <>No catalog unit lands within Manual S limits for a {num(engine.load.coolingTotalBtuh)} BTU/h load. Target {engine.selection.targetTons} t — import the shop catalog or check the disqualifiers: {engine.selection.candidates.filter((c) => c.disqualified).slice(0, 3).map((c) => `${c.item.model}: ${c.disqualified}`).join(" · ")}</>}</span></div>
              )}
              {chosen?.curve && chosen.item.kind === "heat-pump" && (
                <>
                  <CapacityChart curve={chosen.curve} designF={engine.conditions.heatingF} balanceF={chosen.balancePointF} cx={cx} />
                  <div className={cx("legend")}><span><i />capacity</span><span><i className={cx("d")} />heating load</span>{chosen.backupKw ? (engine.dualFuel ? <span>furnace carries {num(Math.max(0, engine.load.heatingBtuh - (chosen.heatAtDesignBtuh ?? 0)))} BTU/h at design</span> : <span>backup {chosen.backupKw} kW at design</span>) : <span>no backup at design</span>}</div>
                </>
              )}
              {chosen && chosen.item.kind !== "heat-pump" && chosen.coolingRatio !== undefined && (
                <div className={cx("fit")}>
                  <div className={cx("mono")}>Cooling fit · Manual S 90–{chosen.item.staging === "variable" ? 125 : 115}%</div>
                  <div className={cx("fit-bar")} style={{ marginTop: 6 }}>
                    <div className={cx("fit-band")} style={{ left: `${((0.9 - 0.7) / 0.7) * 100}%`, width: `${(((chosen.item.staging === "variable" ? 1.25 : 1.15) - 0.9) / 0.7) * 100}%` }} />
                    <div className={cx("fit-mark")} style={{ left: `calc(${Math.min(1, Math.max(0, (chosen.coolingRatio - 0.7) / 0.7)) * 100}% - 1px)` }} />
                  </div>
                  <div className={cx("fit-ax")}><span className={cx("mono")}>70%</span><span className={cx("mono")}>{Math.round(chosen.coolingRatio * 100)}% of load</span><span className={cx("mono")}>140%</span></div>
                </div>
              )}
              {def.needs.load && <table className={cx("comp")}>
                <thead><tr><th>Component</th><th>Heating</th><th>Cooling sens.</th><th>Latent</th></tr></thead>
                <tbody>{engine.load.components.map((c) => <tr key={c.name}><td>{c.name}</td><td>{num(c.heatingBtuh)}</td><td>{num(c.coolingSensibleBtuh)}</td><td>{num(c.coolingLatentBtuh)}</td></tr>)}</tbody>
              </table>}
            </div>
            <div>
              <div className={cx("kpi-lbl")} style={{ marginBottom: 8 }}>Checks</div>
              <div className={cx("checks")}>
                {engine.checks.map((c) => (
                  <div key={c.id + c.title} className={cx("check")}>
                    <span className={cx("chip", `chip-${c.status}`)}>{c.status}</span>
                    <div><div className={cx("check-t")}>{c.title}</div><div className={cx("check-d")}>{c.detail}</div>{c.rule && <div className={cx("check-r")}>{c.rule}</div>}</div>
                  </div>
                ))}
              </div>
              <div className={cx("kpi-lbl")} style={{ margin: "16px 0 8px" }}>Assumptions · incentives · code</div>
              <ul className={cx("notes")}>
                {engine.notes.filter((n) => n.kind !== "contractor").map((n) => (
                  <li key={n.kind + n.text}><span className={cx("chip", n.kind === "assumption" ? "chip-default" : n.kind === "incentive" ? "chip-measured" : "chip-read")}>{n.kind}</span><span>{n.text}</span></li>
                ))}
              </ul>
            </div>
          </div>
          {(def.selection !== "none" || def.id === "water-heater") && swapRows.length > 0 && (
            <details className={cx("panel")} open={swapOpen} onToggle={(e) => setSwapOpen(e.currentTarget.open)}>
              <summary><svg className={cx("ic")}><use href="#i-box" /></svg>Change the unit<span className={cx("mono")}>{swapFits.length} fit{swapOut.length ? ` · ${swapOut.length} ruled out` : ""} · or type your own</span></summary>
              <div className={cx("panel-body")}>
                <div className={cx("note")}>The engine ranks what the catalog has and puts the best fit on the estimate. Pick another and the whole estimate re-prices. A unit the engine ruled out can still go on the job — the reason follows it onto the estimate as a check, so the customer and the permit desk see it. Nothing like it in the catalog? Type the unit at the bottom.</div>
                <input id="hv-swap-q" className={cx("in")} placeholder="Filter by brand or model" value={swapQ} onChange={(e) => setSwapQ(e.target.value)} style={{ maxWidth: 320 }} />
                <div className={cx("swap")}>
                  {swapShown.map((r) => {
                    const on = chosenId === r.item.id;
                    return (
                      <button key={r.item.id} type="button" className={cx("swap-row", on && "on", r.out && "out")} onClick={() => { setPickId(r.item.id); setSwapMsg(on ? "" : `${r.item.brand} ${r.item.model} is on the estimate.${r.out ? " The engine ruled it out — the reason is on the checks." : ""}`); }}>
                        <span className={cx("swap-t")}>{r.item.brand} {r.item.model}{r.item.typed ? " · typed in" : ""}{!r.item.cost && someCost ? " · no cost" : ""}</span>
                        <span className={cx("mono", "swap-m")}>{[r.item.tons ? `${r.item.tons} t` : "", r.item.btuInput && r.item.kind !== "water-heater" ? `${Math.round(r.item.btuInput / 1000)}k BTU` : "", r.item.seer2 ? `${r.item.seer2} SEER2` : "", r.item.hspf2 ? `${r.item.hspf2} HSPF2` : "", r.item.afue ? `${Math.round(r.item.afue * 100)}% AFUE` : "", r.item.staging ?? "", r.item.refrigerant ?? "", r.item.coldClimate ? "cold climate" : "", r.item.tier ?? ""].filter(Boolean).join(" · ")}</span>
                        <span className={cx("swap-w")}>{r.out ?? r.why}</span>
                        <span className={cx("swap-a")}>{on ? "on the estimate" : r.out ? "Use anyway" : "Use this"}</span>
                      </button>
                    );
                  })}
                </div>
                {swapRows.length > swapShown.length && <div className={cx("note")}>Showing {swapShown.length} of {swapRows.length} — type a brand or a model to narrow it.</div>}
                <div className={cx("kpi-lbl")} style={{ margin: "16px 0 8px" }}>Not in the catalog — type the unit</div>
                <div className={cx("grid", "grid-rc")}>
                  <label className={cx("field")} htmlFor="hv-u-brand"><span className={cx("lbl")}>Brand</span><input id="hv-u-brand" className={cx("in")} placeholder="Trane" value={unitDraft.brand ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, brand: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-model"><span className={cx("lbl")}>Model</span><input id="hv-u-model" className={cx("in")} placeholder="4TWR7048N1000A" value={unitDraft.model ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, model: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-kind"><span className={cx("lbl")}>What it is</span><select id="hv-u-kind" className={cx("sel")} value={unitDraft.kind ?? (engine?.selection.chosen?.item.kind ?? (def.id === "water-heater" ? "water-heater" : def.kinds[0] ?? "air-conditioner"))} onChange={(e) => setUnitDraft((u) => ({ ...u, kind: e.target.value }))}><option value="air-conditioner">Condenser (AC)</option><option value="heat-pump">Heat pump</option><option value="furnace">Furnace</option><option value="air-handler">Air handler</option><option value="coil">Coil</option><option value="ductless">Ductless</option><option value="package">Package unit</option><option value="water-heater">Water heater</option></select></label>
                  <label className={cx("field")} htmlFor="hv-u-tons"><span className={cx("lbl")}>Tons</span><input id="hv-u-tons" className={cx("in", "num")} inputMode="decimal" placeholder="4" value={unitDraft.tons ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, tons: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-kbtu"><span className={cx("lbl")}>BTU input, thousands</span><input id="hv-u-kbtu" className={cx("in", "num")} inputMode="decimal" placeholder="80" value={unitDraft.kbtu ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, kbtu: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-seer2"><span className={cx("lbl")}>SEER2</span><input id="hv-u-seer2" className={cx("in", "num")} inputMode="decimal" placeholder="17.2" value={unitDraft.seer2 ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, seer2: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-hspf2"><span className={cx("lbl")}>HSPF2</span><input id="hv-u-hspf2" className={cx("in", "num")} inputMode="decimal" placeholder="8.5" value={unitDraft.hspf2 ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, hspf2: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-afue"><span className={cx("lbl")}>AFUE %</span><input id="hv-u-afue" className={cx("in", "num")} inputMode="decimal" placeholder="96" value={unitDraft.afue ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, afue: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-h17"><span className={cx("lbl")}>Heat at 17 °F, thousands</span><input id="hv-u-h17" className={cx("in", "num")} inputMode="decimal" placeholder="34" value={unitDraft.h17 ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, h17: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-h5"><span className={cx("lbl")}>Heat at 5 °F, thousands</span><input id="hv-u-h5" className={cx("in", "num")} inputMode="decimal" placeholder="27" value={unitDraft.h5 ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, h5: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-refr"><span className={cx("lbl")}>Refrigerant</span><select id="hv-u-refr" className={cx("sel")} value={unitDraft.refrigerant ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, refrigerant: e.target.value }))}><option value="">not seen</option><option value="R-454B">R-454B</option><option value="R-32">R-32</option><option value="R-410A">R-410A</option><option value="R-22">R-22</option></select></label>
                  <label className={cx("field")} htmlFor="hv-u-stg"><span className={cx("lbl")}>Staging</span><select id="hv-u-stg" className={cx("sel")} value={unitDraft.staging ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, staging: e.target.value }))}><option value="">not seen</option><option value="single">single stage</option><option value="two-stage">two stage</option><option value="variable">variable</option></select></label>
                  <label className={cx("field")} htmlFor="hv-u-cold"><span className={cx("lbl")}>Cold-climate rated</span><select id="hv-u-cold" className={cx("sel")} value={unitDraft.coldClimate ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, coldClimate: e.target.value }))}><option value="">no</option><option value="yes">yes</option></select></label>
                  <label className={cx("field")} htmlFor="hv-u-gal"><span className={cx("lbl")}>Gallons (water heater)</span><input id="hv-u-gal" className={cx("in", "num")} inputMode="decimal" placeholder="50" value={unitDraft.gallons ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, gallons: e.target.value }))} /></label>
                  <label className={cx("field")} htmlFor="hv-u-cost"><span className={cx("lbl")}>Your cost $</span><input id="hv-u-cost" className={cx("in", "num")} inputMode="decimal" placeholder="3200" value={unitDraft.cost ?? ""} onChange={(e) => setUnitDraft((u) => ({ ...u, cost: e.target.value }))} /></label>
                </div>
                <div className={cx("acts")}>
                  <button type="button" className={cx("btn", "btn-primary")} onClick={useTypedUnit}>Use this unit</button>
                  <button type="button" className={cx("btn", "btn-ghost")} onClick={() => void saveTypedUnit()}>Save it to my catalog</button>
                  {(custom || pickId) && <button type="button" className={cx("btn", "btn-ghost")} onClick={() => { setCustom(null); setPickId(null); setSwapMsg("Back to the engine's pick."); }}>Back to the engine&rsquo;s pick</button>}
                  <span className={cx("acts-note")}>{swapMsg}</span>
                </div>
              </div>
            </details>
          )}
        </section>
      )}

      {/* ── 4 · LEDGER ───────────────────────────────────────────────────── */}
      {engine && ledger && lines && (
        <section className={cx("card")} id="hv-ledger">
          <div className={cx("head")}>
            <div className={cx("head-txt")}>
              <div className={cx("card-title")}><span className={cx("step", savedId && "done")}>5</span>The estimate</div>
              <div className={cx("card-sub")}>Priced from the shop’s rate card: {catalog?.own ? "your catalog rows" : "rate-card defaults"} plus stock, labor by the task against its measure (per unit, per ln ft, per register), permit and disposal. Edit any line; the assumptions stay on the estimate and never print on the proposal.</div>
            </div>
            <div className={cx("head-acts")}>
              <button type="button" className={cx("btn", "btn-ghost", "btn-sm")} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : savedId ? "Saved · save again" : "Save estimate"}</button>
              <button type="button" className={cx("btn", "btn-primary", "btn-sm")} disabled={converting || !(lines.materials.length || lines.labor.length)} onClick={() => void convert()}><svg className={cx("ic")}><use href="#i-doc" /></svg>{converting ? "Converting…" : "Convert to proposal"}</button>
            </div>
          </div>
          <div className={cx("body")} style={{ paddingBottom: 12 }}>
            <label className={cx("field")} htmlFor="hv-title">
              <span className={cx("lbl")}>Title</span>
              <input id="hv-title" className={cx("in")} value={title ?? ledger.title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className={cx("note")} style={{ marginTop: 10 }}>{ledger.scope}</div>
          </div>
          <LinesTable title="Equipment & materials" rows={lines.materials} onChange={(rows) => setLines({ ...lines, materials: rows })} />
          <LinesTable title="Labor · permit · disposal" rows={lines.labor} onChange={(rows) => setLines({ ...lines, labor: rows })} />
          <div className={cx("bo-total", "bo-total--acts")}>
            <span><span className={cx("kpi-lbl")}>Subtotal</span><span className={cx("bo-total-v")} style={{ marginLeft: 12 }}>{money(subtotal)}</span></span>
            <span className={cx("head-acts")}>
              <button type="button" className={cx("btn", "btn-ghost", "btn-sm")} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : savedId ? "Saved · save again" : "Save"}</button>
              <button type="button" className={cx("btn", "btn-primary", "btn-sm")} disabled={converting || !(lines.materials.length || lines.labor.length)} onClick={() => void convert()}>{converting ? "Converting…" : "Convert to proposal"}</button>
            </span>
          </div>
          <div className={cx("assump")}>
            <span className={cx("kpi-lbl")}>Assumptions on this estimate</span>
            <ul>{ledger.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>

          <div className={cx("permit")} style={def.needs.load ? undefined : { display: "none" }}>
            <div className={cx("permit-txt")}>
              <span className={cx("kpi-lbl")}>Permit-grade report</span>
              <div className={cx("note")} style={{ marginTop: 6 }}>
                {reportUrl
                  ? <>ACCA-approved Manual J attached — <a className={cx("link")} href={reportUrl} target="_blank" rel="noreferrer">view the report</a>. The proposal carries one sentence saying so.</>
                  : permit
                    ? <>Cool Calc project <b>{permit.projectId}</b> created {dateShort(permit.requestedAt)}. Finish the envelope in Cool Calc, then pull the report here.</>
                    : <>The load above is Manual J-based, estimating grade. For a permit that wants an ACCA-approved calc, {permitEnabled ? "request the Cool Calc report" : "paste the report link from the approved tool you use"}.</>}
              </div>
              {permitMsg && <div className={cx("mono")} style={{ marginTop: 6, textTransform: "none", letterSpacing: 0 }}>{permitMsg}</div>}
            </div>
            <div className={cx("permit-acts")}>
              {!reportUrl && permitEnabled && !permit && <button type="button" className={cx("btn", "btn-primary", "btn-sm")} disabled={permitBusy} onClick={() => void requestPermit()}>{permitBusy ? "Requesting…" : "Request Cool Calc report"}</button>}
              {!reportUrl && permit && <button type="button" className={cx("btn", "btn-primary", "btn-sm")} disabled={permitBusy} onClick={() => void attachPermit()}>{permitBusy ? "Attaching…" : "Pull the report"}</button>}
              {!reportUrl && (
                <span className={cx("permit-link")}>
                  <input className={cx("in")} placeholder="https://… report link" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} aria-label="Report link" />
                  <button type="button" className={cx("btn", "btn-ghost", "btn-sm")} disabled={permitBusy || !/^https:\/\//i.test(linkDraft)} onClick={() => void attachPermit(linkDraft)}>Attach link</button>
                </span>
              )}
            </div>
          </div>

          <details className={cx("panel")} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !cardDraft) setCardDraft(card.card); }}>
            <summary><svg className={cx("ic")}><use href="#i-gear" /></svg>Rate card<span className={cx("mono")}>{card.own ? "the shop's" : "defaults — edit once, it sticks"}</span></summary>
            <div className={cx("panel-body")}>
              {cardDraft && (
                <>
                  <div className={cx("grid-rc")}>
                    {([
                      ["equipmentMarkupPct", "Equipment markup %"], ["materialsMarkupPct", "Materials markup %"], ["permitFee", "Permit $"], ["disposalFee", "Disposal $"], ["craneFee", "Crane $"], ["linesetFtDefault", "Line set ft default"],
                    ] as Array<[keyof HvacRateCard, string]>).map(([k, l]) => (
                      <label key={k} className={cx("field")} htmlFor={`rc-${k}`}><span className={cx("lbl")}>{l}</span><input id={`rc-${k}`} className={cx("in", "num")} inputMode="decimal" value={String(cardDraft[k] as number)} onChange={(e) => setCardDraft({ ...cardDraft, [k]: Number(e.target.value) || 0 })} /></label>
                    ))}
                  </div>
                  <div className={cx("fs-t")} style={{ marginTop: 14 }}><span className={cx("kpi-lbl")}>Equipment defaults</span><span className={cx("mono")}>used when a catalog row has no cost</span></div>
                  <div className={cx("grid-rc")}>
                    {(Object.keys(cardDraft.equipmentDefaults) as Array<keyof HvacRateCard["equipmentDefaults"]>).map((k) => (
                      <label key={k} className={cx("field")} htmlFor={`rc-eq-${k}`}><span className={cx("lbl")}>{k.replace(/([A-Z])/g, " $1").replace(/Per/, "/").toLowerCase()}</span><input id={`rc-eq-${k}`} className={cx("in", "num")} inputMode="decimal" value={String(cardDraft.equipmentDefaults[k])} onChange={(e) => setCardDraft({ ...cardDraft, equipmentDefaults: { ...cardDraft.equipmentDefaults, [k]: Number(e.target.value) || 0 } })} /></label>
                    ))}
                  </div>
                  <div className={cx("fs-t")} style={{ marginTop: 14 }}><span className={cx("kpi-lbl")}>Labor by the task</span><span className={cx("mono")}>$ per each · per ln ft · per register · per lb</span></div>
                  <div className={cx("grid-rc")}>
                    {(Object.keys(cardDraft.labor) as Array<keyof HvacRateCard["labor"]>).map((k) => (
                      <label key={k} className={cx("field")} htmlFor={`rc-l-${k}`}><span className={cx("lbl")}>{k.replace(/([A-Z])/g, " $1").replace(/Per Ft/, "/ ft").replace(/Per Register/, "/ register").replace(/Per Lb/, "/ lb").replace(/Each$/, "").toLowerCase()}</span><input id={`rc-l-${k}`} className={cx("in", "num")} inputMode="decimal" value={String(cardDraft.labor[k])} onChange={(e) => setCardDraft({ ...cardDraft, labor: { ...cardDraft.labor, [k]: Number(e.target.value) || 0 } })} /></label>
                    ))}
                  </div>
                  <div className={cx("fs-t")} style={{ marginTop: 14 }}><span className={cx("kpi-lbl")}>Stock prices</span><span className={cx("mono")}>shop cost, before markup</span></div>
                  <div className={cx("grid-rc")}>
                    {(Object.keys(cardDraft.materials) as Array<keyof HvacRateCard["materials"]>).map((k) => (
                      <label key={k} className={cx("field")} htmlFor={`rc-m-${k}`}><span className={cx("lbl")}>{k.replace(/([A-Z])/g, " $1").replace(/Per/, "/").toLowerCase()}</span><input id={`rc-m-${k}`} className={cx("in", "num")} inputMode="decimal" value={String(cardDraft.materials[k])} onChange={(e) => setCardDraft({ ...cardDraft, materials: { ...cardDraft.materials, [k]: Number(e.target.value) || 0 } })} /></label>
                    ))}
                  </div>
                  <div className={cx("acts")}>
                    <button type="button" className={cx("btn", "btn-primary")} onClick={() => void saveCard()}>Save rate card</button>
                    <button type="button" className={cx("btn", "btn-ghost")} onClick={() => setCardDraft(DEFAULT_RATE_CARD)}>Reset to defaults</button>
                    <span className={cx("acts-note")}>{cardMsg || "Saved for everyone in the shop"}</span>
                  </div>
                </>
              )}
            </div>
          </details>

          <details className={cx("panel")}>
            <summary><svg className={cx("ic")}><use href="#i-file" /></svg>Catalog<span className={cx("mono")}>{catalog?.own ? `${catalog.items.length} rows from the shop` : "starter ladder · import your CSV"}</span></summary>
            <div className={cx("panel-body")}>
              <div className={cx("note")}><b>Load the US catalog</b> puts the most-sold American families on the pick list — Goodman, Carrier, Trane, Lennox, Rheem, Mitsubishi and the water-heater makers — as Good · Better · Best ladders with their published ratings. Download the CSV, put your costs in the <b>cost</b> column, delete what you don’t sell, and import it back with “Replace”. A hyphenated size (GLXT7C-036) is the family plus the nominal size — swap in your distributor’s exact model there. Or bring your own: one row per unit the shop installs. Columns: <b>{CATALOG_CSV_COLUMNS.join(", ")}</b> — kind, brand and model are required; a <b>cost</b> lets the ledger price from your number instead of the rate-card default; heat-pump rows want heat47/17/5 for the capacity curve. <a className={cx("link")} href={templateHref} download="jobflex-hvac-catalog-template.csv">Download the template</a>. An <b>AHRI</b> subscriber export or the <b>NEEP</b> cold-climate list (saved as CSV) imports as is — the columns are read by meaning and the import says which it used.</div>
              <div className={cx("acts")}>
                <button type="button" className={cx("btn", "btn-primary")} onClick={() => void onLoadUs()}><svg className={cx("ic")}><use href="#i-box" /></svg>Load the US catalog</button>
                <label className={cx("btn", "btn-ghost")} htmlFor="hv-csv"><svg className={cx("ic")}><use href="#i-download" /></svg>Import CSV<input id="hv-csv" type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => void onCsv(e.target.files?.[0])} /></label>
                <label className={cx("chk")} htmlFor="hv-replace" style={{ height: 38 }}><input id="hv-replace" type="checkbox" checked={replaceCat} onChange={(e) => setReplaceCat(e.target.checked)} /><span>Replace the current catalog</span></label>
                <button type="button" className={cx("btn", "btn-ghost")} onClick={onDownloadCatalog} disabled={!catalog}>Download CSV</button>
                {catalog?.own && <button type="button" className={cx("btn", "btn-ghost")} onClick={() => void onClearCatalog()}>Clear</button>}
                <span className={cx("acts-note")}>{catMsg}</span>
              </div>
              {catalog?.own && catalog.items.length > 0 && (
                <div className={cx("note", "mono")}>
                  {(["air-conditioner", "heat-pump", "furnace", "air-handler", "coil", "ductless", "package", "water-heater"] as const)
                    .map((k) => ({ k, n: catalog.items.filter((c) => c.kind === k).length }))
                    .filter((x) => x.n)
                    .map((x) => `${x.n} ${({ "air-conditioner": "AC", "heat-pump": "heat pump", furnace: "furnace", "air-handler": "air handler", coil: "coil", ductless: "ductless", package: "package", "water-heater": "water heater" } as const)[x.k]}`)
                    .join(" · ")}
                  {" — "}
                  {Array.from(new Set(catalog.items.map((c) => c.brand))).sort().join(", ")}
                  {catalog.items.some((c) => c.cost) ? "" : " · no shop costs yet: priced by tier"}
                </div>
              )}
            </div>
          </details>
        </section>
      )}

      {/* ── 5 · RECENT ───────────────────────────────────────────────────── */}
      <section className={cx("card")}>
        <div className={cx("head")}>
          <div className={cx("head-txt")}>
            <div className={cx("card-title")}>Recent estimates</div>
            <div className={cx("card-sub")}>Reopen one to change the design or convert it. Record what you actually quoted on a job and the fit shows here — {calib ? calibrationLine(calib) : "loading…"}</div>
          </div>
        </div>
        {recent.length ? (
          <div className={cx("recent")}>
            {recent.map((r) => (
              <div key={r.id} className={cx("rrow-wrap")}>
                <div className={cx("rrow")}>
                  <button type="button" className={cx("rrow-open")} onClick={() => void reopen(r.id)}>
                    <span className={cx("rrow-a")}>{r.title || r.address}</span>
                    <span className={cx("mono", "rrow-m")}>{r.address} · {dateShort(r.createdAt)} · {r.status}{r.jobKind ? ` · ${jobDef(r.jobKind).title.toLowerCase()}` : ""}{r.sizedTons ? ` · sized ${r.sizedTons} t` : ""}{r.permit === "attached" ? " · report attached" : r.permit === "requested" ? " · Cool Calc requested" : ""}</span>
                    {r.actual && <span className={cx("mono", "rrow-m")}>actual: {r.actual.tons ? `${r.actual.tons} t` : "—"} · {r.actual.price ? money(r.actual.price) : "—"}{r.actual.notes ? ` · ${r.actual.notes}` : ""}</span>}
                  </button>
                  <span className={cx("rrow-v")}>{money(r.subtotal)}</span>
                  <button type="button" className={cx("link")} onClick={() => { setActualFor(actualFor === r.id ? null : r.id); setActualDraft({ tons: r.actual?.tons ? String(r.actual.tons) : "", price: r.actual?.price ? String(r.actual.price) : "", notes: r.actual?.notes ?? "" }); }}>{r.actual ? "Edit actual" : "Record actual"}</button>
                </div>
                {actualFor === r.id && (
                  <div className={cx("actual")}>
                    <label className={cx("field")} htmlFor={`act-t-${r.id}`}><span className={cx("lbl")}>Quoted / installed tons</span><input id={`act-t-${r.id}`} className={cx("in", "num")} inputMode="decimal" value={actualDraft.tons} onChange={(e) => setActualDraft({ ...actualDraft, tons: e.target.value })} /></label>
                    <label className={cx("field")} htmlFor={`act-p-${r.id}`}><span className={cx("lbl")}>Quoted price $</span><input id={`act-p-${r.id}`} className={cx("in", "num")} inputMode="decimal" value={actualDraft.price} onChange={(e) => setActualDraft({ ...actualDraft, price: e.target.value })} /></label>
                    <label className={cx("field")} htmlFor={`act-n-${r.id}`}><span className={cx("lbl")}>Notes</span><input id={`act-n-${r.id}`} className={cx("in")} value={actualDraft.notes} placeholder="what changed and why" onChange={(e) => setActualDraft({ ...actualDraft, notes: e.target.value })} /></label>
                    <button type="button" className={cx("btn", "btn-primary", "btn-sm")} onClick={() => void saveActual(r.id)}>Save actual</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={cx("empty")}>Nothing saved yet — the first estimate you save lands here.</div>
        )}
      </section>
    </>
  );
}
