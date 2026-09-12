"use client";

// Roof package builder — the contractor picks what goes on the roof and the
// measured figures do the takeoff (lib/roofPackage). Replaces the one-button
// AI guess as the DEFAULT way to price a measured roof (2026-09-12, owner's
// call: "very plain, no details into the roof — not going to work for a
// client and contractor"); the AI path stays beside it.
//
// Two kinds of state live in the spec. PREFERENCES — selections and unit
// prices — are the contractor's and persist in the browser across roofs.
// PER-ROOF entries — counts and lengths — start from this roof's facts and
// reset when another measurement opens. A saved, crew-wide price book needs
// a schema change and is a follow-up.

import * as React from "react";
import { nanoid } from "nanoid";
import {
  CHIMNEY_SIZES,
  DRIP_EDGE_PROFILES,
  DRIP_EDGE_SIZES,
  ICE_WATER,
  PIPE_BOOT_SIZES,
  PKG_UNITS,
  ROOF_SYSTEMS,
  STEP_FLASHING_SIZES,
  UNDERLAYMENTS,
  VALLEY_TYPES,
  VENT_TYPES,
  WASTE_OPTIONS,
  type IceWaterCoverage,
  type PkgUnit,
} from "@/lib/roofPackage/catalog";
import {
  buildRoofPackage,
  checkVentilation,
  defaultSpec,
  estimateEdges,
  type RoofFacts,
  type RoofPackage,
  type RoofPackageSpec,
} from "@/lib/roofPackage/takeoff";

const PREFS_KEY = "jf.roofPackage.prefs.v1";

/** The spec fields that are the contractor's standing preferences, not this roof's entries. */
const PREF_KEYS = [
  "systemId", "systemName", "systemMatPerSq", "systemLaborPerSq", "capPerFt", "wastePct",
  "underlaymentId", "underlaymentName", "underlaymentPerSq", "iceWater", "iceWaterPerSqft",
  "dripEdgeOn", "dripProfileId", "dripSizeId", "dripPerFt", "starterOn", "starterPerFt",
  "valleyTypeId", "valleyMatPerFt", "valleyLaborPerFt", "stepSizeId", "stepPerPiece", "stepLaborPerFt",
  "apronPerFt", "apronLaborPerFt", "counterPerFt", "counterLaborPerFt", "pipeBootPrices",
  "chimneySizeId", "chimneyEach", "chimneyLabor", "curbEach", "curbLabor", "ventBalanced",
  "tearOffPerSqLayer", "disposalPerSqLayer", "plywoodEach", "plywoodLabor",
  "nailsPerSq", "sealantPerSq", "cleanupLump", "safetyLump", "permitLump",
] as const satisfies ReadonlyArray<keyof RoofPackageSpec>;

type Prefs = Partial<Pick<RoofPackageSpec, (typeof PREF_KEYS)[number]>> & {
  /** Vent unit prices by vent id — quantities are per roof. */
  ventPrices?: Record<string, { each: number; labor: number }>;
};

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}
function writePrefs(spec: RoofPackageSpec) {
  try {
    const p: Prefs = {};
    for (const k of PREF_KEYS) (p as Record<string, unknown>)[k] = spec[k];
    p.ventPrices = Object.fromEntries(spec.vents.map((v) => [v.id, { each: v.each, labor: v.labor }]));
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private window, blocked storage — the builder still works, it just forgets */
  }
}
function applyPrefs(spec: RoofPackageSpec, p: Prefs): RoofPackageSpec {
  const out: RoofPackageSpec = { ...spec };
  for (const k of PREF_KEYS) {
    const v = p[k];
    if (v !== undefined && v !== null) (out as unknown as Record<string, unknown>)[k] = v;
  }
  if (p.ventPrices) {
    out.vents = out.vents.map((v) => (p.ventPrices?.[v.id] ? { ...v, ...p.ventPrices[v.id] } : v));
  }
  return out;
}

/** Facts that, when they change, mean a different roof is open. */
const factsKey = (f: RoofFacts) =>
  [f.squares, f.perimeterFt, f.footprintSqft, f.chimney, f.rooftopAcCount, f.shape, f.pitchFamilies.map((p) => `${p.pitch12}:${p.share}`).join(",")].join("|");

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmt = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

// ── Field primitives (the page's est-field / est-in / bp-sel classes) ──────
function Num({ label, value, onChange, unit, disabled, min = 0 }: { label: string; value: number; onChange: (n: number) => void; unit?: string; disabled?: boolean; min?: number }) {
  const [txt, setTxt] = React.useState(String(value));
  // The prop moved away from what is typed (a pick reset the price, another
  // roof opened): adopt it. Done during render, not in an effect.
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  return (
    <label className="est-field pk-f">
      <span className="est-lbl">{label}</span>
      <span className={"pk-in" + (unit ? " has-unit" : "")}>
        <input
          className="est-in"
          inputMode="decimal"
          value={txt}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setTxt(v);
            const n = Number(v.replace(/,/g, ""));
            if (v.trim() !== "" && Number.isFinite(n) && n >= min) onChange(n);
          }}
          onBlur={() => {
            if (txt.trim() === "" || !Number.isFinite(Number(txt))) setTxt(String(value));
          }}
        />
        {unit && <span className="pk-unit">{unit}</span>}
      </span>
    </label>
  );
}

function Sel<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <label className="est-field pk-f">
      <span className="est-lbl">{label}</span>
      <span className="bp-sel">
        <select className="bp-sel-in est-in" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function Txt({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <label className="est-field pk-f pk-f--wide">
      <span className="est-lbl">{label}</span>
      <input className="est-in" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="pk-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Section({ title, hint, children, chip }: { title: string; hint?: string; children: React.ReactNode; chip?: React.ReactNode }) {
  return (
    <section className="pk-sec">
      <div className="pk-sec-head">
        <span className="pk-sec-title">{title}</span>
        {chip}
        {hint && <span className="pk-sec-hint">{hint}</span>}
      </div>
      <div className="pk-grid">{children}</div>
    </section>
  );
}

export function RoofPackageBuilder({
  facts,
  onBuild,
  disabled,
}: {
  facts: RoofFacts;
  /** The built package; the parent owns the estimate tables. */
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  disabled?: boolean;
}) {
  const key = factsKey(facts);
  // The builder only mounts on the report panel, after a measurement is
  // opened client-side, so the preferences can be read at first render; the
  // window guard keeps a stray server render from throwing.
  const [spec, setSpec] = React.useState<RoofPackageSpec>(() =>
    applyPrefs(defaultSpec(facts), typeof window === "undefined" ? {} : readPrefs()),
  );
  // A different roof opened: the per-roof entries start over from its facts,
  // the preferences stay. Adjusted during render, not in an effect.
  const [seenKey, setSeenKey] = React.useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setSpec(applyPrefs(defaultSpec(facts), readPrefs()));
  }

  const set = React.useCallback(<K extends keyof RoofPackageSpec>(k: K, v: RoofPackageSpec[K]) => {
    setSpec((s) => {
      const next = { ...s, [k]: v };
      writePrefs(next);
      return next;
    });
  }, []);
  const setEdge = (k: "eaveFt" | "rakeFt" | "ridgeFt" | "hipFt", v: number) => setSpec((s) => ({ ...s, [k]: v, edgesBasis: "entered" }));
  const resetEdges = () => {
    const e = estimateEdges(facts);
    if (e) setSpec((s) => ({ ...s, ...e, edgesBasis: "estimated" }));
  };

  const pkg = React.useMemo(() => buildRoofPackage(spec, facts), [spec, facts]);
  const vent = React.useMemo(() => checkVentilation(spec, facts), [spec, facts]);
  const total = [...pkg.materials, ...pkg.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const materialsTotal = pkg.materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  const system = ROOF_SYSTEMS.find((s) => s.id === spec.systemId);
  const pickSystem = (id: string) => {
    const s = ROOF_SYSTEMS.find((x) => x.id === id);
    if (!s) return;
    setSpec((prev) => {
      const next = {
        ...prev,
        systemId: id,
        systemName: id === "custom" ? (prev.systemId === "custom" ? prev.systemName : "") : s.label,
        systemMatPerSq: s.matPerSq,
        systemLaborPerSq: s.laborPerSq,
        capPerFt: s.capPerFt,
        wastePct: s.wastePct,
      };
      writePrefs(next);
      return next;
    });
  };
  const pickUnderlayment = (id: string) => {
    const u = UNDERLAYMENTS.find((x) => x.id === id);
    if (!u) return;
    set("underlaymentId", id);
    set("underlaymentName", id === "custom" ? "" : u.label);
    set("underlaymentPerSq", u.perSq);
  };
  const pickDrip = (id: string) => {
    const d = DRIP_EDGE_PROFILES.find((x) => x.id === id);
    if (!d) return;
    set("dripProfileId", id);
    if (id !== "custom") set("dripPerFt", d.perFt);
  };
  const pickValley = (id: string) => {
    const v = VALLEY_TYPES.find((x) => x.id === id);
    if (!v) return;
    set("valleyTypeId", id);
    if (id !== "custom") {
      set("valleyMatPerFt", v.matPerFt);
      set("valleyLaborPerFt", v.laborPerFt);
    }
  };
  const pickStep = (id: string) => {
    const s = STEP_FLASHING_SIZES.find((x) => x.id === id);
    if (!s) return;
    set("stepSizeId", id);
    if (id !== "custom") set("stepPerPiece", s.perPiece);
  };
  const pickChimney = (id: string) => {
    const c = CHIMNEY_SIZES.find((x) => x.id === id);
    if (!c) return;
    set("chimneySizeId", id);
    set("chimneyEach", c.each);
    set("chimneyLabor", c.labor);
  };
  const setVent = (id: string, patch: Partial<{ qty: number; each: number; labor: number }>) => {
    setSpec((s) => {
      const t = VENT_TYPES.find((x) => x.id === id)!;
      const has = s.vents.some((v) => v.id === id);
      const vents = has
        ? s.vents.map((v) => (v.id === id ? { ...v, ...patch } : v))
        : [...s.vents, { id, qty: 0, each: t.each, labor: t.labor, ...patch }];
      const next = { ...s, vents };
      writePrefs(next);
      return next;
    });
  };
  const ventOf = (id: string) => spec.vents.find((v) => v.id === id) ?? { id, qty: 0, each: VENT_TYPES.find((x) => x.id === id)!.each, labor: VENT_TYPES.find((x) => x.id === id)!.labor };
  const setCustom = (id: string, patch: Partial<RoofPackageSpec["custom"][number]>) =>
    setSpec((s) => ({ ...s, custom: s.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const addCustom = (kind: "material" | "labor") =>
    setSpec((s) => ({ ...s, custom: [...s.custom, { id: nanoid(6), name: "", qty: 1, unit: "each", unitPrice: 0, kind }] }));
  const removeCustom = (id: string) => setSpec((s) => ({ ...s, custom: s.custom.filter((c) => c.id !== id) }));

  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
  const edgeChip = <span className={"chip " + (spec.edgesBasis === "estimated" ? "wait" : "")}>{spec.edgesBasis === "estimated" ? "estimated from outline" : "entered"}</span>;

  return (
    <div className="pk">
      <div className="pk-facts">
        <span><b>{facts.squares.toFixed(1)}</b> squares · {facts.squaresBasis}</span>
        {facts.pitchFamilies.length > 0 && (
          <span>pitch <b>{facts.pitchFamilies.map((f) => `${Math.round(f.pitch12)}/12${facts.pitchFamilies.length > 1 ? ` (${Math.round(f.share * 100)}%)` : ""}`).join(" + ")}</b>{steepest >= 8 ? " · steep" : ""}</span>
        )}
        {facts.perimeterFt != null && <span>outline <b>{fmt(facts.perimeterFt)} ft</b> around</span>}
        {facts.footprintSqft != null && <span>footprint <b>{fmt(facts.footprintSqft)} sq ft</b></span>}
        {facts.shape && <span>shape <b>{facts.shape.toLowerCase()}</b></span>}
        {facts.chimney != null && <span>chimney <b>{facts.chimney ? "yes" : "no"}</b></span>}
        {facts.rooftopAcCount != null && facts.rooftopAcCount > 0 && <span>rooftop units <b>{facts.rooftopAcCount}</b></span>}
      </div>

      <Section title="Roof system" hint="Material and install labor per square; the pitch multiplier applies per family.">
        <Sel label="System" value={spec.systemId} options={ROOF_SYSTEMS} onChange={pickSystem} disabled={disabled} />
        {spec.systemId === "custom" && <Txt label="Name" value={spec.systemName} placeholder="e.g. Malarkey Vista AR" onChange={(v) => set("systemName", v)} disabled={disabled} />}
        <Num label="Material" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => set("systemMatPerSq", v)} disabled={disabled} />
        <Num label="Install labor" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => set("systemLaborPerSq", v)} disabled={disabled} />
        <Sel label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} />
        {system?.family !== "low-slope" && <Num label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => set("capPerFt", v)} disabled={disabled} />}
      </Section>

      <Section title="Underlayment" hint="Full-deck underlayment by the square; ice & water by the foot of eave and valley.">
        <Sel label="Underlayment" value={spec.underlaymentId} options={UNDERLAYMENTS} onChange={pickUnderlayment} disabled={disabled} />
        {spec.underlaymentId === "custom" && <Txt label="Name" value={spec.underlaymentName} placeholder="e.g. Titanium UDL-30" onChange={(v) => set("underlaymentName", v)} disabled={disabled} />}
        <Num label="Price" unit="$/sq" value={spec.underlaymentPerSq} onChange={(v) => set("underlaymentPerSq", v)} disabled={disabled} />
        <Sel label="Ice & water shield" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} />
        {spec.iceWater !== "none" && <Num label="Ice & water" unit="$/sq ft" value={spec.iceWaterPerSqft} onChange={(v) => set("iceWaterPerSqft", v)} disabled={disabled} />}
      </Section>

      <Section title="Edges · drip edge & starter" chip={edgeChip} hint="Eave + rake run the drip edge and starter; ridge + hip run the cap. Confirm the estimate on the photo.">
        <Num label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
        <Num label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
        <Num label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
        <Num label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
        {spec.edgesBasis === "entered" && estimateEdges(facts) && (
          <button type="button" className="pk-link" onClick={resetEdges} disabled={disabled}>Back to the outline estimate</button>
        )}
        <div className="pk-break" />
        <Check label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />
        {spec.dripEdgeOn && (
          <>
            <Sel label="Profile" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} />
            <Sel label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} />
            <Num label="Drip edge" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />
          </>
        )}
        {system?.family !== "low-slope" && system?.family !== "metal" && (
          <>
            <Check label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />
            {spec.starterOn && <Num label="Starter" unit="$/ft" value={spec.starterPerFt} onChange={(v) => set("starterPerFt", v)} disabled={disabled} />}
          </>
        )}
      </Section>

      <Section title="Flashing" hint="Counts and lengths are yours to enter — the aerial data does not measure them. Chimney and rooftop units come pre-counted from it.">
        <Sel label="Valleys" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} />
        <Num label="Valley count" value={spec.valleyCount} onChange={(v) => set("valleyCount", v)} disabled={disabled} />
        <Num label="Length each" unit="ft" value={spec.valleyFtEach} onChange={(v) => set("valleyFtEach", v)} disabled={disabled} />
        <Num label="Valley metal" unit="$/ft" value={spec.valleyMatPerFt} onChange={(v) => set("valleyMatPerFt", v)} disabled={disabled} />
        <Num label="Valley labor" unit="$/ft" value={spec.valleyLaborPerFt} onChange={(v) => set("valleyLaborPerFt", v)} disabled={disabled} />
        <div className="pk-break" />
        <Num label="Sidewalls (step)" value={spec.stepWallCount} onChange={(v) => set("stepWallCount", v)} disabled={disabled} />
        <Num label="Length each" unit="ft" value={spec.stepWallFtEach} onChange={(v) => set("stepWallFtEach", v)} disabled={disabled} />
        <Sel label="Step size" value={spec.stepSizeId} options={STEP_FLASHING_SIZES} onChange={pickStep} disabled={disabled} />
        <Num label="Step piece" unit="$/ea" value={spec.stepPerPiece} onChange={(v) => set("stepPerPiece", v)} disabled={disabled} />
        <Num label="Step labor" unit="$/ft" value={spec.stepLaborPerFt} onChange={(v) => set("stepLaborPerFt", v)} disabled={disabled} />
        <div className="pk-break" />
        <Num label="Apron / headwall" unit="ft" value={spec.apronFt} onChange={(v) => set("apronFt", v)} disabled={disabled} />
        <Num label="Apron" unit="$/ft" value={spec.apronPerFt} onChange={(v) => set("apronPerFt", v)} disabled={disabled} />
        <Num label="Apron labor" unit="$/ft" value={spec.apronLaborPerFt} onChange={(v) => set("apronLaborPerFt", v)} disabled={disabled} />
        <Num label="Counter flashing" unit="ft" value={spec.counterFt} onChange={(v) => set("counterFt", v)} disabled={disabled} />
        <Num label="Counter" unit="$/ft" value={spec.counterPerFt} onChange={(v) => set("counterPerFt", v)} disabled={disabled} />
        <Num label="Counter labor" unit="$/ft" value={spec.counterLaborPerFt} onChange={(v) => set("counterLaborPerFt", v)} disabled={disabled} />
        <div className="pk-break" />
        {PIPE_BOOT_SIZES.map((s) => (
          <Num key={s.id} label={`Pipe boots · ${s.label}`} value={spec.pipeBoots[s.id] ?? 0} onChange={(v) => set("pipeBoots", { ...spec.pipeBoots, [s.id]: v })} disabled={disabled} />
        ))}
        <Num label="Chimneys" value={spec.chimneyCount} onChange={(v) => set("chimneyCount", v)} disabled={disabled} />
        <Sel label="Chimney size" value={spec.chimneySizeId} options={CHIMNEY_SIZES} onChange={pickChimney} disabled={disabled} />
        <Num label="Chimney kit" unit="$/ea" value={spec.chimneyEach} onChange={(v) => set("chimneyEach", v)} disabled={disabled} />
        <Num label="Chimney labor" unit="$/ea" value={spec.chimneyLabor} onChange={(v) => set("chimneyLabor", v)} disabled={disabled} />
        <Num label="Curbs (AC / skylight)" value={spec.curbCount} onChange={(v) => set("curbCount", v)} disabled={disabled} />
        <Num label="Curb kit" unit="$/ea" value={spec.curbEach} onChange={(v) => set("curbEach", v)} disabled={disabled} />
        <Num label="Curb labor" unit="$/ea" value={spec.curbLabor} onChange={(v) => set("curbLabor", v)} disabled={disabled} />
      </Section>

      <Section
        title="Ventilation"
        chip={vent ? <span className={"chip " + (vent.ok ? "ok" : "bad")}>{vent.ok ? "balanced" : "short"}</span> : undefined}
        hint={
          vent
            ? `Attic ${fmt(facts.footprintSqft ?? 0)} sq ft needs ${fmt(vent.requiredSqIn)} sq in net free area (1/${vent.ratio}) — half intake, half exhaust. Package: ${fmt(vent.exhaustSqIn)} exhaust${vent.poweredExhaust ? ` + ${vent.poweredExhaust} powered` : ""}, ${fmt(vent.intakeSqIn)} intake.`
            : "No footprint on this measurement, so the net-free-area check is off — enter what the attic needs."
        }
      >
        <div className="pk-vents">
          <div className="pk-vent-row pk-vent-head">
            <span>Vent</span><span>Qty</span><span>Unit</span><span>Material</span><span>Labor</span>
          </div>
          {VENT_TYPES.map((t) => {
            const v = ventOf(t.id);
            return (
              <div className="pk-vent-row" key={t.id}>
                <span className="pk-vent-name">{t.label}<em>{t.role}{t.nfaSqIn ? ` · ${t.nfaSqIn} sq in${t.unit === "linear ft" ? "/ft" : ""}` : " · powered"}</em></span>
                <Num label="" value={v.qty} onChange={(n) => setVent(t.id, { qty: n })} disabled={disabled} />
                <span className="pk-vent-unit">{t.unit === "each" ? "each" : "ft"}</span>
                <Num label="" unit={t.unit === "each" ? "$/ea" : "$/ft"} value={v.each} onChange={(n) => setVent(t.id, { each: n })} disabled={disabled} />
                <Num label="" unit={t.unit === "each" ? "$/ea" : "$/ft"} value={v.labor} onChange={(n) => setVent(t.id, { labor: n })} disabled={disabled} />
              </div>
            );
          })}
        </div>
        <Check label="Balanced system with vapor retarder (1/300)" checked={spec.ventBalanced} onChange={(v) => set("ventBalanced", v)} disabled={disabled} />
      </Section>

      <Section title="Tear-off & extras">
        <Sel label="Tear-off" value={String(spec.tearOffLayers)} options={[{ id: "0", label: "None · overlay" }, { id: "1", label: "1 layer" }, { id: "2", label: "2 layers" }, { id: "3", label: "3 layers" }]} onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)} disabled={disabled} />
        <Num label="Tear-off labor" unit="$/sq/layer" value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />
        <Num label="Disposal" unit="$/sq/layer" value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />
        <Num label="Deck sheets to replace" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
        <Num label="Sheet" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />
        <Num label="Sheet labor" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />
        <Num label="Nails & fasteners" unit="$/sq" value={spec.nailsPerSq} onChange={(v) => set("nailsPerSq", v)} disabled={disabled} />
        <Num label="Sealant & collars" unit="$/sq" value={spec.sealantPerSq} onChange={(v) => set("sealantPerSq", v)} disabled={disabled} />
        <Num label="Cleanup & sweep" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
        <Num label={`Steep safety${steepest >= 8 ? "" : " (off below 8/12)"}`} unit="$" value={spec.safetyLump} onChange={(v) => set("safetyLump", v)} disabled={disabled} />
        <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />
      </Section>

      <Section title="Custom lines" hint="Anything the catalog does not have — a skylight, gutters, a fascia repair.">
        <div className="pk-custom">
          {spec.custom.map((c) => (
            <div className="pk-custom-row" key={c.id}>
              <input className="est-in" placeholder="Item" value={c.name} disabled={disabled} onChange={(e) => setCustom(c.id, { name: e.target.value })} aria-label="Custom item" />
              <Num label="" value={c.qty} onChange={(n) => setCustom(c.id, { qty: n })} disabled={disabled} />
              <span className="bp-sel">
                <select className="bp-sel-in est-in" value={c.unit} disabled={disabled} aria-label="Unit" onChange={(e) => setCustom(c.id, { unit: e.target.value as PkgUnit })}>
                  {PKG_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </span>
              <Num label="" unit="$" value={c.unitPrice} onChange={(n) => setCustom(c.id, { unitPrice: n })} disabled={disabled} />
              <span className="bp-sel">
                <select className="bp-sel-in est-in" value={c.kind} disabled={disabled} aria-label="Material or labor" onChange={(e) => setCustom(c.id, { kind: e.target.value as "material" | "labor" })}>
                  <option value="material">material</option>
                  <option value="labor">labor</option>
                </select>
              </span>
              <button type="button" className="pk-x" disabled={disabled} aria-label="Remove custom line" onClick={() => removeCustom(c.id)}>×</button>
            </div>
          ))}
          <div className="pk-custom-add">
            <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={() => addCustom("material")}>+ Custom material</button>
            <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={() => addCustom("labor")}>+ Custom labor</button>
          </div>
        </div>
      </Section>

      <div className="pk-foot">
        <div className="pk-foot-sum">
          <span className="kpi-lbl">Package</span>
          <span className="pk-foot-v">{money(total)}</span>
          <span className="pk-foot-h">{money(materialsTotal)} materials · {money(total - materialsTotal)} labor · {pkg.materials.length + pkg.labor.length} lines</span>
        </div>
        <button type="button" className="btn btn-primary btn--sm" disabled={disabled} onClick={() => onBuild(pkg, spec)}>
          <svg className="ic"><use href="#i-file" /></svg>
          Build the estimate
        </button>
      </div>

      <style jsx global>{`
        .jf-blueprint .content .pk {
          border-top: 1.5px solid var(--hair-soft);
        }
        .jf-blueprint .content .pk-facts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 18px;
          padding: 11px 16px;
          background: var(--paper-deep);
          border-bottom: 1.5px solid var(--hair-soft);
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .jf-blueprint .content .pk-facts b {
          color: var(--ink);
          font-weight: 700;
        }
        .jf-blueprint .content .pk-sec {
          padding: 14px 16px 16px;
          border-bottom: 1.5px solid var(--hair-soft);
        }
        .jf-blueprint .content .pk-sec-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 12px;
          margin-bottom: 10px;
        }
        .jf-blueprint .content .pk-sec-title {
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink);
        }
        .jf-blueprint .content .pk-sec-hint {
          flex-basis: 100%;
          font-size: 12px;
          line-height: 1.5;
          color: var(--muted);
          max-width: 78ch;
        }
        .jf-blueprint .content .pk-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px 11px;
          align-items: end;
        }
        .jf-blueprint .content .pk-f--wide {
          grid-column: span 2;
        }
        .jf-blueprint .content .pk-break {
          grid-column: 1 / -1;
          height: 1.5px;
          background: var(--hair-soft);
          margin: 4px 0;
        }
        .jf-blueprint .content .pk-in {
          position: relative;
          display: block;
        }
        .jf-blueprint .content .pk-in.has-unit .est-in {
          padding-right: 58px;
        }
        .jf-blueprint .content .pk-unit {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--muted);
          pointer-events: none;
        }
        .jf-blueprint .content .pk-check {
          display: flex;
          align-items: center;
          gap: 8px;
          height: var(--field-h);
          font-size: 13px;
          color: var(--ink);
          cursor: pointer;
        }
        .jf-blueprint .content .pk-check input {
          width: 16px;
          height: 16px;
          accent-color: var(--ink);
        }
        .jf-blueprint .content .pk-link {
          height: var(--field-h);
          padding: 0;
          border: 0;
          background: none;
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--blueprint);
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
          text-align: left;
        }
        .jf-blueprint .content .pk-vents {
          grid-column: 1 / -1;
          display: grid;
          gap: 6px;
        }
        .jf-blueprint .content .pk-vent-row {
          display: grid;
          grid-template-columns: minmax(180px, 2fr) 96px 48px 128px 128px;
          gap: 8px;
          align-items: center;
        }
        .jf-blueprint .content .pk-vent-row .est-lbl {
          display: none;
        }
        .jf-blueprint .content .pk-vent-head {
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted-light);
          padding-bottom: 4px;
          border-bottom: 1.5px solid var(--hair-soft);
        }
        .jf-blueprint .content .pk-vent-name {
          font-size: 13px;
          color: var(--ink);
          line-height: 1.25;
        }
        .jf-blueprint .content .pk-vent-name em {
          display: block;
          font-style: normal;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .jf-blueprint .content .pk-vent-unit {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--muted);
        }
        .jf-blueprint .content .pk-custom {
          grid-column: 1 / -1;
          display: grid;
          gap: 8px;
        }
        .jf-blueprint .content .pk-custom-row {
          display: grid;
          grid-template-columns: minmax(160px, 2fr) 96px 120px 120px 120px 32px;
          gap: 8px;
          align-items: center;
        }
        .jf-blueprint .content .pk-custom-row .est-lbl {
          display: none;
        }
        .jf-blueprint .content .pk-custom-add {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jf-blueprint .content .pk-x {
          width: 32px;
          height: var(--field-h);
          border: 1.5px solid var(--hair-soft);
          border-radius: var(--radius);
          background: #fff;
          color: var(--muted);
          font-size: 16px;
          cursor: pointer;
        }
        .jf-blueprint .content .pk-x:hover {
          color: var(--ink);
          border-color: var(--ink);
        }
        .jf-blueprint .content .pk-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          background: var(--paper-deep);
        }
        .jf-blueprint .content .pk-foot-sum {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 4px 12px;
        }
        .jf-blueprint .content .pk-foot-v {
          font-size: 22px;
          font-weight: 900;
          color: var(--blueprint);
          font-variant-numeric: tabular-nums;
        }
        .jf-blueprint .content .pk-foot-h {
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }
        @media (max-width: 768px) {
          .jf-blueprint .content .pk-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .jf-blueprint .content .pk-f--wide {
            grid-column: 1 / -1;
          }
          .jf-blueprint .content .pk-vent-row {
            grid-template-columns: minmax(0, 1fr) 72px 36px 96px 96px;
            gap: 6px;
          }
          .jf-blueprint .content .pk-custom-row {
            grid-template-columns: minmax(0, 1fr) 72px 96px 96px 96px 32px;
            gap: 6px;
          }
          .jf-blueprint .content .pk-foot {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}
