"use client";

// Roof package builder — the contractor picks what goes on the roof and the
// measured figures do the takeoff (lib/roofPackage). The DEFAULT way to price
// a measured roof since 2026-09-12 (owner: "very plain, no details into the
// roof — not going to work for a client and contractor"); the AI path stays
// beside it.
//
// THE CATALOG IS THE CONTRACTOR'S. Roof types and underlayments are editable
// lists (Manage → rename, price, add, remove) and every other item has an
// editable unit price. "Save as my defaults" writes the lists and the
// standing prices to the org (actions/roofCatalog) so the whole crew prices
// the same way; the browser keeps a copy so a device that cannot reach the
// table — or an environment where it is not pushed yet — still works.
//
// Two kinds of state live in the spec. PREFERENCES — selections and unit
// prices — persist. PER-ROOF entries — counts and lengths — start from this
// roof's facts and reset when another measurement opens.

import * as React from "react";
import { nanoid } from "nanoid";
import { toast } from "@/components/ui/Toast";
import { getRoofCatalog, saveRoofCatalog } from "@/actions/roofCatalog";
import {
  BUILTIN_LISTS,
  CHIMNEY_SIZES,
  DRIP_EDGE_PROFILES,
  DRIP_EDGE_SIZES,
  ICE_WATER,
  PIPE_BOOT_SIZES,
  PKG_UNITS,
  ROOF_FAMILIES,
  STEP_FLASHING_SIZES,
  VALLEY_TYPES,
  VENT_TYPES,
  WASTE_OPTIONS,
  type CatalogLists,
  type IceWaterCoverage,
  type PkgUnit,
  type RoofFamily,
  type RoofSystem,
  type Underlayment,
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
const LISTS_KEY = "jf.roofPackage.lists.v1";

/** The spec fields that are the contractor's standing preferences, not this roof's entries. */
const PREF_KEYS = [
  "systemId", "systemName", "systemFamily", "systemMatPerSq", "systemLaborPerSq", "capPerFt", "wastePct",
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

function prefsOf(spec: RoofPackageSpec): Prefs {
  const p: Prefs = {};
  for (const k of PREF_KEYS) (p as Record<string, unknown>)[k] = spec[k];
  p.ventPrices = Object.fromEntries(spec.vents.map((v) => [v.id, { each: v.each, labor: v.labor }]));
  return p;
}
function readLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window, blocked storage — the builder still works, it just forgets */
  }
}
/** Overlay saved preferences, field by field, only where the saved value has the field's type. */
function applyPrefs(spec: RoofPackageSpec, p: Prefs | Record<string, unknown> | null | undefined): RoofPackageSpec {
  if (!p) return spec;
  const out: RoofPackageSpec = { ...spec };
  const src = p as Record<string, unknown>;
  for (const k of PREF_KEYS) {
    const v = src[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== typeof spec[k]) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  const vp = src.ventPrices as Prefs["ventPrices"];
  if (vp && typeof vp === "object") {
    out.vents = out.vents.map((v) => {
      const s = vp[v.id];
      return s && typeof s.each === "number" && typeof s.labor === "number" ? { ...v, each: s.each, labor: s.labor } : v;
    });
  }
  return out;
}
/** A saved list is only trusted when it still reads like one. */
function saneLists(l: unknown): CatalogLists | null {
  const x = l as CatalogLists | null;
  if (!x || !Array.isArray(x.systems) || !Array.isArray(x.underlayments) || !x.systems.length || !x.underlayments.length) return null;
  const okSys = x.systems.every((s) => s && typeof s.id === "string" && typeof s.label === "string" && typeof s.matPerSq === "number" && typeof s.laborPerSq === "number");
  const okUnd = x.underlayments.every((u) => u && typeof u.id === "string" && typeof u.label === "string" && typeof u.perSq === "number");
  return okSys && okUnd ? x : null;
}
/** Keep the spec's picks pointing at rows that exist in the lists. */
function reconcile(spec: RoofPackageSpec, lists: CatalogLists): RoofPackageSpec {
  let out = spec;
  if (!lists.systems.some((s) => s.id === spec.systemId)) {
    const s = lists.systems[0];
    out = { ...out, systemId: s.id, systemName: s.label, systemFamily: s.family, systemMatPerSq: s.matPerSq, systemLaborPerSq: s.laborPerSq, capPerFt: s.capPerFt, wastePct: s.wastePct };
  }
  if (!lists.underlayments.some((u) => u.id === spec.underlaymentId)) {
    const u = lists.underlayments[0];
    out = { ...out, underlaymentId: u.id, underlaymentName: u.label, underlaymentPerSq: u.perSq };
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
    <label className={"est-field pk-f" + (label ? "" : " pk-f--bare")}>
      {label && <span className="est-lbl">{label}</span>}
      <span className={"pk-in" + (unit ? " has-unit" : "")}>
        <input
          className="est-in"
          inputMode="decimal"
          value={txt}
          disabled={disabled}
          aria-label={label || undefined}
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
    <label className={"est-field pk-f" + (label ? "" : " pk-f--bare")}>
      {label && <span className="est-lbl">{label}</span>}
      <span className="bp-sel">
        <select className="bp-sel-in est-in" value={value} disabled={disabled} aria-label={label || undefined} onChange={(e) => onChange(e.target.value as T)}>
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

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="pk-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Section({ title, hint, children, chip, action }: { title: string; hint?: string; children: React.ReactNode; chip?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="pk-sec">
      <div className="pk-sec-head">
        <span className="pk-sec-title">{title}</span>
        {chip}
        {action && <span className="pk-sec-action">{action}</span>}
        {hint && <span className="pk-sec-hint">{hint}</span>}
      </div>
      <div className="pk-grid">{children}</div>
    </section>
  );
}

export function RoofPackageBuilder({
  facts,
  onBuild,
  onConvert,
  disabled,
  converting,
}: {
  facts: RoofFacts;
  /** The built package; the parent owns the estimate tables. */
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  /** "Convert as is": the package straight to a proposal. */
  onConvert: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  disabled?: boolean;
  converting?: boolean;
}) {
  const key = factsKey(facts);
  // The builder only mounts on the report panel, after a measurement is
  // opened client-side, so the browser's copy can be read at first render;
  // the window guard keeps a stray server render from throwing.
  const [lists, setLists] = React.useState<CatalogLists>(() =>
    (typeof window === "undefined" ? null : saneLists(readLocal<CatalogLists>(LISTS_KEY))) ?? BUILTIN_LISTS,
  );
  const [spec, setSpec] = React.useState<RoofPackageSpec>(() => {
    const l = (typeof window === "undefined" ? null : saneLists(readLocal<CatalogLists>(LISTS_KEY))) ?? BUILTIN_LISTS;
    return reconcile(applyPrefs(defaultSpec(facts, l), typeof window === "undefined" ? null : readLocal<Prefs>(PREFS_KEY)), l);
  });
  // A different roof opened: the per-roof entries start over from its facts,
  // the preferences stay. Adjusted during render, not in an effect.
  const [seenKey, setSeenKey] = React.useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setSpec(reconcile(applyPrefs(defaultSpec(facts, lists), readLocal<Prefs>(PREFS_KEY)), lists));
  }

  // The org's saved catalog, when the table exists and a save has happened:
  // its lists and prices win over the browser's copy.
  const [source, setSource] = React.useState<"loading" | "org" | "browser">("loading");
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    getRoofCatalog()
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          const l = saneLists({ systems: doc.systems, underlayments: doc.underlayments }) ?? BUILTIN_LISTS;
          setLists(l);
          setSpec((s) => reconcile(applyPrefs(s, doc.prefs), l));
          writeLocal(LISTS_KEY, l);
          writeLocal(PREFS_KEY, doc.prefs);
          setSource("org");
        } else {
          setSource("browser");
        }
      })
      .catch(() => {
        if (!cancelled) setSource("browser");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = React.useCallback(<K extends keyof RoofPackageSpec>(k: K, v: RoofPackageSpec[K]) => {
    setSpec((s) => {
      const next = { ...s, [k]: v };
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  }, []);
  const setEdge = (k: "eaveFt" | "rakeFt" | "ridgeFt" | "hipFt", v: number) => setSpec((s) => ({ ...s, [k]: v, edgesBasis: "entered" }));
  const resetEdges = () => {
    const e = estimateEdges(facts);
    if (e) setSpec((s) => ({ ...s, ...e, edgesBasis: "estimated" }));
  };
  const updateLists = (next: CatalogLists) => {
    setLists(next);
    setSpec((s) => reconcile(s, next));
    writeLocal(LISTS_KEY, next);
    setDirty(true);
  };

  async function saveDefaults() {
    setSaving(true);
    try {
      const res = await saveRoofCatalog({ version: 1, systems: lists.systems, underlayments: lists.underlayments, prefs: prefsOf(spec) });
      if (res.ok) {
        setSource("org");
        setDirty(false);
        toast.success("Roof catalog saved", "Your roof types, underlayments and prices now load for everyone in your company.");
      } else {
        toast.error("Couldn't save the catalog", res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const pkg = React.useMemo(() => buildRoofPackage(spec, facts), [spec, facts]);
  const vent = React.useMemo(() => checkVentilation(spec, facts), [spec, facts]);
  const total = [...pkg.materials, ...pkg.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const materialsTotal = pkg.materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  // ── Picks copy the catalog row's prices into the spec ──
  const pickSystem = (id: string, from: CatalogLists = lists) => {
    const s = from.systems.find((x) => x.id === id);
    if (!s) return;
    setSpec((prev) => {
      const next = { ...prev, systemId: id, systemName: s.label, systemFamily: s.family, systemMatPerSq: s.matPerSq, systemLaborPerSq: s.laborPerSq, capPerFt: s.capPerFt, wastePct: s.wastePct };
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  const pickUnderlayment = (id: string, from: CatalogLists = lists) => {
    const u = from.underlayments.find((x) => x.id === id);
    if (!u) return;
    set("underlaymentId", id);
    set("underlaymentName", u.label);
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
      const vents = has ? s.vents.map((v) => (v.id === id ? { ...v, ...patch } : v)) : [...s.vents, { id, qty: 0, each: t.each, labor: t.labor, ...patch }];
      const next = { ...s, vents };
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  const ventOf = (id: string) => spec.vents.find((v) => v.id === id) ?? { id, qty: 0, each: VENT_TYPES.find((x) => x.id === id)!.each, labor: VENT_TYPES.find((x) => x.id === id)!.labor };
  const setCustom = (id: string, patch: Partial<RoofPackageSpec["custom"][number]>) => setSpec((s) => ({ ...s, custom: s.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const addCustom = (kind: "material" | "labor") => setSpec((s) => ({ ...s, custom: [...s.custom, { id: nanoid(6), name: "", qty: 1, unit: "each", unitPrice: 0, kind }] }));
  const removeCustom = (id: string) => setSpec((s) => ({ ...s, custom: s.custom.filter((c) => c.id !== id) }));

  // ── Manage the contractor's lists ──
  const [manage, setManage] = React.useState<null | "systems" | "underlayments">(null);
  const patchSystem = (id: string, patch: Partial<RoofSystem>) => {
    const next = { ...lists, systems: lists.systems.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
    updateLists(next);
    if (id === spec.systemId) pickSystem(id, next);
  };
  const addSystem = () => {
    const s: RoofSystem = { id: "s_" + nanoid(6), label: "New roof type", family: "asphalt", matPerSq: 0, laborPerSq: 0, wastePct: 10, capPerFt: 0 };
    updateLists({ ...lists, systems: [...lists.systems, s] });
  };
  const removeSystem = (id: string) => {
    if (lists.systems.length <= 1) return;
    updateLists({ ...lists, systems: lists.systems.filter((s) => s.id !== id) });
  };
  const patchUnderlayment = (id: string, patch: Partial<Underlayment>) => {
    const next = { ...lists, underlayments: lists.underlayments.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
    updateLists(next);
    if (id === spec.underlaymentId) pickUnderlayment(id, next);
  };
  const addUnderlayment = () => {
    updateLists({ ...lists, underlayments: [...lists.underlayments, { id: "u_" + nanoid(6), label: "New underlayment", perSq: 0 }] });
  };
  const removeUnderlayment = (id: string) => {
    if (lists.underlayments.length <= 1) return;
    updateLists({ ...lists, underlayments: lists.underlayments.filter((u) => u.id !== id) });
  };
  const resetLists = () => {
    updateLists(BUILTIN_LISTS);
    toast.info("Built-in roof types restored — save to keep them.");
  };

  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
  const edgeChip = <span className={"chip " + (spec.edgesBasis === "estimated" ? "wait" : "")}>{spec.edgesBasis === "estimated" ? "estimated from outline" : "entered"}</span>;
  const manageBtn = (which: "systems" | "underlayments", label: string) => (
    <button type="button" className={"pk-link" + (manage === which ? " on" : "")} onClick={() => setManage(manage === which ? null : which)} disabled={disabled}>
      {manage === which ? "Done" : label}
    </button>
  );

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

      {/* Whose catalog this is, and the one button that makes it the company's. */}
      <div className="pk-catalog">
        <span className="pk-catalog-txt">
          {source === "loading"
            ? "Loading your roof catalog…"
            : source === "org"
              ? "Your company's roof catalog — roof types, underlayments and prices, shared with your team."
              : "Built-in roof types and prices. Edit them below, then save to make them your company's."}
          {dirty && source !== "loading" ? <b> Unsaved changes.</b> : null}
        </span>
        <button type="button" className={"btn btn--sm " + (dirty ? "btn-primary" : "btn-ghost")} disabled={disabled || saving || source === "loading"} onClick={() => void saveDefaults()}>
          {saving ? "Saving…" : "Save as my defaults"}
        </button>
      </div>

      <Section title="Roof system" hint="Material and install labor per square; the pitch multiplier applies per family." action={manageBtn("systems", "Manage roof types")}>
        {manage === "systems" ? (
          <div className="pk-manage">
            <div className="pk-manage-row pk-manage-head">
              <span>Roof type</span><span>Family</span><span>Material $/sq</span><span>Labor $/sq</span><span>Waste %</span><span>Cap $/ft</span><span />
            </div>
            {lists.systems.map((s) => (
              <div className="pk-manage-row" key={s.id}>
                <input className="est-in" value={s.label} disabled={disabled} aria-label="Roof type name" onChange={(e) => patchSystem(s.id, { label: e.target.value })} />
                <Sel label="" value={s.family} options={ROOF_FAMILIES} onChange={(v) => patchSystem(s.id, { family: v as RoofFamily })} disabled={disabled} />
                <Num label="" value={s.matPerSq} onChange={(n) => patchSystem(s.id, { matPerSq: n })} disabled={disabled} />
                <Num label="" value={s.laborPerSq} onChange={(n) => patchSystem(s.id, { laborPerSq: n })} disabled={disabled} />
                <Num label="" value={s.wastePct} onChange={(n) => patchSystem(s.id, { wastePct: n })} disabled={disabled} />
                <Num label="" value={s.capPerFt} onChange={(n) => patchSystem(s.id, { capPerFt: n })} disabled={disabled} />
                <button type="button" className="pk-x" disabled={disabled || lists.systems.length <= 1} aria-label={`Remove ${s.label}`} title="Remove" onClick={() => removeSystem(s.id)}>×</button>
              </div>
            ))}
            <div className="pk-custom-add">
              <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={addSystem}>+ Add roof type</button>
              <button type="button" className="pk-link" disabled={disabled} onClick={resetLists}>Restore built-in list</button>
            </div>
          </div>
        ) : (
          <>
            <Sel label="System" value={spec.systemId} options={lists.systems} onChange={(id) => pickSystem(id)} disabled={disabled} />
            <Num label="Material" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => set("systemMatPerSq", v)} disabled={disabled} />
            <Num label="Install labor" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => set("systemLaborPerSq", v)} disabled={disabled} />
            <Sel label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} />
            {spec.systemFamily !== "low-slope" && <Num label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => set("capPerFt", v)} disabled={disabled} />}
          </>
        )}
      </Section>

      <Section title="Underlayment" hint="Full-deck underlayment by the square; ice & water by the foot of eave and valley." action={manageBtn("underlayments", "Manage underlayments")}>
        {manage === "underlayments" ? (
          <div className="pk-manage pk-manage--und">
            <div className="pk-manage-row pk-manage-head">
              <span>Underlayment</span><span>$/sq</span><span />
            </div>
            {lists.underlayments.map((u) => (
              <div className="pk-manage-row" key={u.id}>
                <input className="est-in" value={u.label} disabled={disabled} aria-label="Underlayment name" onChange={(e) => patchUnderlayment(u.id, { label: e.target.value })} />
                <Num label="" value={u.perSq} onChange={(n) => patchUnderlayment(u.id, { perSq: n })} disabled={disabled} />
                <button type="button" className="pk-x" disabled={disabled || lists.underlayments.length <= 1} aria-label={`Remove ${u.label}`} title="Remove" onClick={() => removeUnderlayment(u.id)}>×</button>
              </div>
            ))}
            <div className="pk-custom-add">
              <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={addUnderlayment}>+ Add underlayment</button>
            </div>
          </div>
        ) : (
          <>
            <Sel label="Underlayment" value={spec.underlaymentId} options={lists.underlayments} onChange={(id) => pickUnderlayment(id)} disabled={disabled} />
            <Num label="Price" unit="$/sq" value={spec.underlaymentPerSq} onChange={(v) => set("underlaymentPerSq", v)} disabled={disabled} />
            <Sel label="Ice & water shield" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} />
            {spec.iceWater !== "none" && <Num label="Ice & water" unit="$/sq ft" value={spec.iceWaterPerSqft} onChange={(v) => set("iceWaterPerSqft", v)} disabled={disabled} />}
          </>
        )}
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
        {spec.systemFamily !== "low-slope" && spec.systemFamily !== "metal" && (
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
        <div className="pk-foot-acts">
          <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={() => onBuild(pkg, spec)} title="Fill the estimate tables below to review and adjust before converting">
            <svg className="ic"><use href="#i-file" /></svg>
            Build & review
          </button>
          <button type="button" className="btn btn-primary btn--sm" disabled={disabled || converting} onClick={() => onConvert(pkg, spec)} title="Straight to a proposal with these lines — you can still edit them there">
            <svg className="ic"><use href="#i-target" /></svg>
            {converting ? "Creating…" : "Convert as is"}
          </button>
        </div>
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
        .jf-blueprint .content .pk-catalog {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1.5px solid var(--hair-soft);
        }
        .jf-blueprint .content .pk-catalog-txt {
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--muted);
        }
        .jf-blueprint .content .pk-catalog-txt b {
          color: var(--ink);
        }
        .jf-blueprint .content .pk-catalog .btn {
          flex-shrink: 0;
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
        .jf-blueprint .content .pk-sec-action {
          margin-left: auto;
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
        .jf-blueprint .content .pk-link.on {
          color: var(--ink);
        }
        .jf-blueprint .content .pk-link:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .jf-blueprint .content .pk-manage {
          grid-column: 1 / -1;
          display: grid;
          gap: 6px;
        }
        .jf-blueprint .content .pk-manage-row {
          display: grid;
          grid-template-columns: minmax(180px, 2fr) 150px 110px 110px 90px 90px 32px;
          gap: 8px;
          align-items: center;
        }
        .jf-blueprint .content .pk-manage--und .pk-manage-row {
          grid-template-columns: minmax(180px, 2fr) 120px 32px;
        }
        .jf-blueprint .content .pk-manage-head {
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted-light);
          padding-bottom: 4px;
          border-bottom: 1.5px solid var(--hair-soft);
        }
        .jf-blueprint .content .pk-f--bare {
          display: block;
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
        .jf-blueprint .content .pk-custom-add {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
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
        .jf-blueprint .content .pk-x:hover:not(:disabled) {
          color: var(--ink);
          border-color: var(--ink);
        }
        .jf-blueprint .content .pk-x:disabled {
          opacity: 0.4;
          cursor: default;
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
        .jf-blueprint .content .pk-foot-acts {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .jf-blueprint .content .pk-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .jf-blueprint .content .pk-catalog {
            flex-direction: column;
            align-items: stretch;
          }
          .jf-blueprint .content .pk-manage-row {
            grid-template-columns: minmax(0, 1fr) 110px 80px 80px 64px 64px 32px;
            gap: 6px;
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
          .jf-blueprint .content .pk-foot-acts .btn {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
