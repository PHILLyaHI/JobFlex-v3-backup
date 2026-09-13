"use client";

// VARIANT C of the "Build an estimate" card — the 2026-09-12 three-way
// comparison, reached at /dashboard/roof-estimator?builder=c.
//
// THE READ, in one second, top to bottom:
//   HEAD        the title says what the card does; the switch beside it, how;
//               the roof's facts are one mono annotation, stated once.
//   TITLE BLOCK the answer — the total, its materials / labor split, and the
//               two ways out (Review lines, Convert to proposal as a stamp).
//   LEDGER      01–07, one row per part of the roof, each closed to a one-line
//               summary of WHAT is picked (rates stay inside).
//   FOOT        the total again where the reader ends up, Convert, and the
//               rates' source + save.
// Nothing in between: no sentence subtitle, no second header band, no facts
// stated twice, no second toolbar.
//
// Open a row: this roof's ENTRIES (counts, lengths, picks) on the left and the
// contractor's RATES as a ruled margin column on the right — set once, kept —
// so the two kinds of number are two places, not one mixed strip. The list
// editors (Add roof type / Add underlayment) open from a link under the
// select they edit, not from the row header.
//
// Everything the incumbent does survives: the same helpers, the same state
// block (copied verbatim from roof-package-builder.tsx), the same localStorage
// keys, the same saveRoofCatalog write. Only markup, copy and CSS are new.

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
  type Basis,
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
import {
  LISTS_KEY,
  PREFS_KEY,
  applyPrefs,
  factsKey,
  fmt,
  money,
  prefsOf,
  readLocal,
  reconcile,
  saneLists,
  writeLocal,
  type Prefs,
} from "./roof-package-builder";
import type { BuildEstimateCardProps } from "./build-estimate-card";
import { BlueprintSelect, type SelectStyles } from "@/components/v3/advanced-ai-blueprint/blueprint-select";
import "./build-estimate-card-c.css";

// ── Icons: the shell sprite for file / target / bulb; the rest inline ──
const IcChev = () => (
  <svg className="ic bec-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IcPlus = () => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IcX = () => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// ── Field primitives on the page's est-field / est-in classes ──

/** The house dropdown (advanced-ai-blueprint/blueprint-select) drawn by this
 *  card's stylesheet. A native <select> styles only its closed state; the OS
 *  draws the open list in its own chrome. The list is portalled into
 *  `.content`, so its rules live outside `.bec` in build-estimate-card-c.css. */
const SEL_STYLES: SelectStyles = {
  bsel: "bec-sel",
  "bsel-btn": "bec-sel-btn",
  "bsel-val": "bec-sel-val",
  "bsel-caret": "bec-sel-caret",
  "bsel-list": "bec-sel-list",
  "bsel-opt": "bec-sel-opt",
};

/** No rate, count or length on a roof is over a billion: a slipped key
 *  (1252222…) used to turn the total into a 39-digit number. */
const MAX_ENTRY = 1e9;
function Num({
  label,
  value,
  onChange,
  unit,
  disabled,
  min = 0,
  aria,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  disabled?: boolean;
  min?: number;
  /** Accessible name for a field whose visible label is hidden (a ledger cell). */
  aria?: string;
}) {
  const [txt, setTxt] = React.useState(String(value));
  // The prop moved away from what is typed (a pick reset the price, another
  // roof opened): adopt it. Done during render, not in an effect.
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  return (
    <label className={"est-field bec-f" + (label ? "" : " bec-f--bare")}>
      {label && <span className="est-lbl">{label}</span>}
      <span className={"bec-in" + (unit ? " has-unit" : "")}>
        <input
          className="est-in"
          inputMode="decimal"
          value={txt}
          disabled={disabled}
          aria-label={label ? undefined : aria}
          onChange={(e) => {
            const v = e.target.value;
            setTxt(v);
            const n = Number(v.replace(/,/g, ""));
            if (v.trim() !== "" && Number.isFinite(n) && n >= min && n <= MAX_ENTRY) onChange(n);
          }}
          onBlur={() => {
            if (txt.trim() === "" || !Number.isFinite(Number(txt)) || Number(txt) > MAX_ENTRY) setTxt(String(value));
          }}
        />
        {unit && <span className="bec-unit">{unit}</span>}
      </span>
    </label>
  );
}

function Sel<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  wide,
  aria,
  after,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
  wide?: boolean;
  aria?: string;
  /** A link that changes this field's list — under the box, not beside it. */
  after?: React.ReactNode;
}) {
  return (
    <div className={"est-field bec-f" + (label ? "" : " bec-f--bare") + (wide ? " bec-f--wide" : "")}>
      {label && <span className="est-lbl">{label}</span>}
      <BlueprintSelect
        value={value}
        onChange={(v) => onChange(v as T)}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        placeholder=""
        ariaLabel={label || aria || ""}
        disabled={disabled}
        styles={SEL_STYLES}
      />
      {after}
    </div>
  );
}

/** A drawn checkbox: the square ink box and the checklist mark, the native input kept for keyboard and screen readers. */
function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={"bec-check" + (checked ? " is-on" : "") + (disabled ? " is-off" : "")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="bec-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}

/** One rate in the margin column: a plain label, a narrow input carrying its unit. */
function Rate({ label, unit, value, onChange, disabled }: { label: string; unit: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="bec-rate">
      <span className="bec-rate-l">{label}</span>
      <Num label="" aria={`${label} rate`} unit={unit} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/** A named cluster of this roof's entries. */
function Group({ label, children, note }: { label?: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="bec-g">
      {label && <div className="bec-g-h">{label}</div>}
      <div className="bec-fields">{children}</div>
      {note}
    </div>
  );
}

/** One ledger row: index · name · what is picked · status · chevron. The body
 *  splits into this roof's entries and, when the row has any, the rates. */
function Row({
  n,
  id,
  title,
  summary,
  chip,
  open,
  onToggle,
  children,
  rates,
}: {
  n: string;
  id: string;
  title: string;
  summary: string;
  chip?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  rates?: React.ReactNode;
}) {
  const bodyId = `bec-body-${id}`;
  return (
    <section className={"bec-row" + (open ? " is-open" : "")}>
      <button type="button" className="bec-row-btn" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={onToggle}>
        <span className="bec-row-n">{n}</span>
        <span className="bec-row-t">{title}</span>
        <span className="bec-row-s">{summary}</span>
        <span className="bec-row-c">{chip}</span>
        <IcChev />
      </button>
      {open && (
        <div className={"bec-body" + (rates ? " has-rates" : "")} id={bodyId}>
          <div className="bec-entries">{children}</div>
          {rates && (
            <aside className="bec-rates">
              <div className="bec-rates-k">Rates</div>
              {rates}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}

const BASIS_WORD: Record<Basis, string> = { measured: "measured", estimated: "estimated", entered: "by hand" };

/** The basis line: the roof's facts as one mono annotation, or — before a
 *  takeoff exists — just the squares and where they came from. */
function Facts({ facts, squares, manual }: { facts: RoofFacts | null; squares: number | null; manual: BuildEstimateCardProps["manual"] }) {
  const items: React.ReactNode[] = [];
  if (facts) {
    const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
    items.push(<b key="sq">{facts.squares.toFixed(1)} sq</b>);
    if (facts.pitchFamilies.length > 0) {
      items.push(
        <b key="pitch">{facts.pitchFamilies.map((f) => `${Math.round(f.pitch12)}/12${facts.pitchFamilies.length > 1 ? ` ${Math.round(f.share * 100)}%` : ""}`).join(" + ")}</b>,
      );
      if (steepest >= 8) items.push(<i key="steep">steep</i>);
    }
    items.push(<i key="basis">{BASIS_WORD[facts.squaresBasis]}</i>);
    if (facts.perimeterFt != null) items.push(<b key="outline">{fmt(facts.perimeterFt)} ft outline</b>);
    if (facts.footprintSqft != null) items.push(<b key="fp">{fmt(facts.footprintSqft)} sq ft footprint</b>);
    if (facts.shape) items.push(<b key="shape">{facts.shape.toLowerCase()}</b>);
    if (facts.chimney) items.push(<b key="chimney">chimney</b>);
    if (facts.rooftopAcCount != null && facts.rooftopAcCount > 0) {
      items.push(
        <b key="ac">
          {facts.rooftopAcCount} rooftop unit{facts.rooftopAcCount === 1 ? "" : "s"}
        </b>,
      );
    }
  } else if (squares != null) {
    items.push(<b key="sq">{squares.toFixed(1)} sq</b>);
    if (manual) items.push(<b key="pitch">{manual.pitchLabel}</b>);
    items.push(<i key="basis">{manual ? "by hand" : "measured"}</i>);
  }
  if (!items.length) return null;
  return <span className="bec-facts">{items}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PACKAGE LEDGER — title block, seven rows, foot. Owns the builder state.
// ═══════════════════════════════════════════════════════════════════════════
function PackageLedger({
  facts,
  onBuild,
  onConvert,
  disabled,
  converting,
  lead,
}: {
  facts: RoofFacts;
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  onConvert: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  disabled?: boolean;
  converting?: boolean;
  /** The pitch picker, when the aerial data carried no pitch: it leads the title block. */
  lead?: React.ReactNode;
}) {
  // ── State, effects, handlers and derived values: verbatim from
  //    roof-package-builder.tsx (the functionality). ──
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
        toast.success("Defaults saved", "Your roof types, underlayments and rates now load for everyone in your company.");
      } else {
        toast.error("Couldn't save", res.error);
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

  // ── Which rows are open. The first one opens by default; the rest read
  //    from their summary line until the contractor needs them. ──
  const [open, setOpen] = React.useState<Record<string, boolean>>({ system: true });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  // ── end of the verbatim block ──

  // ── Summaries: what is picked, in one breath. Rates stay inside the row. ──
  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
  const lowSlope = spec.systemFamily === "low-slope";
  const noStarter = lowSlope || spec.systemFamily === "metal";
  const sumSystem = `${spec.systemName} · ${spec.wastePct}% waste`;
  const iceLabel = ICE_WATER.find((i) => i.id === spec.iceWater)?.label ?? spec.iceWater;
  const sumUnder = `${spec.underlaymentName} · ${spec.iceWater === "none" ? "no ice & water" : `ice & water ${iceLabel.split(" (")[0].toLowerCase()}`}`;
  const noEdges = spec.eaveFt + spec.rakeFt + spec.ridgeFt + spec.hipFt <= 0;
  const sumEdges = [
    noEdges
      ? "No lengths yet — enter eave, rake and ridge"
      : `Eave ${fmt(spec.eaveFt)} · rake ${fmt(spec.rakeFt)} · ridge ${fmt(spec.ridgeFt)}${spec.hipFt > 0 ? ` · hip ${fmt(spec.hipFt)}` : ""} ft`,
    spec.dripEdgeOn ? "drip edge" : null,
    !noStarter && spec.starterOn ? "starter" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pipeTotal = PIPE_BOOT_SIZES.reduce((a, s) => a + (spec.pipeBoots[s.id] ?? 0), 0);
  const flashBits = [
    spec.valleyCount > 0 ? `${spec.valleyCount} valley${spec.valleyCount === 1 ? "" : "s"}` : null,
    spec.stepWallCount > 0 ? `${spec.stepWallCount} sidewall${spec.stepWallCount === 1 ? "" : "s"}` : null,
    spec.apronFt > 0 ? `apron ${fmt(spec.apronFt)} ft` : null,
    spec.counterFt > 0 ? `counter ${fmt(spec.counterFt)} ft` : null,
    pipeTotal > 0 ? `${pipeTotal} pipe boot${pipeTotal === 1 ? "" : "s"}` : null,
    spec.chimneyCount > 0 ? `${spec.chimneyCount} chimney${spec.chimneyCount === 1 ? "" : "s"}` : null,
    spec.curbCount > 0 ? `${spec.curbCount} curb${spec.curbCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const sumFlash = flashBits.length ? flashBits.join(" · ") : "Nothing counted yet — valleys, walls, pipes, chimney";
  const ventsOn = VENT_TYPES.filter((t) => ventOf(t.id).qty > 0);
  const sumVents = ventsOn.length
    ? ventsOn.map((t) => `${fmt(ventOf(t.id).qty)}${t.unit === "linear ft" ? " ft" : " ×"} ${t.label.split(" · ")[0].toLowerCase()}`).join(" · ")
    : "No vents yet";
  const sumTear = [
    spec.tearOffLayers === 0 ? "Overlay, no tear-off" : `Tear-off ${spec.tearOffLayers} layer${spec.tearOffLayers === 1 ? "" : "s"}`,
    spec.plywoodSheets > 0 ? `${spec.plywoodSheets} deck sheet${spec.plywoodSheets === 1 ? "" : "s"}` : null,
    spec.cleanupLump > 0 ? `cleanup ${money(spec.cleanupLump)}` : null,
    steepest >= 8 && spec.safetyLump > 0 ? `steep safety ${money(spec.safetyLump)}` : null,
    spec.permitLump > 0 ? `permit ${money(spec.permitLump)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sumCustom = spec.custom.length ? `${spec.custom.length} line${spec.custom.length === 1 ? "" : "s"}` : "None";

  const ventsToAdd = VENT_TYPES.filter((t) => ventOf(t.id).qty <= 0);
  const edgeEstimated = spec.edgesBasis === "estimated";
  const lineCount = pkg.materials.length + pkg.labor.length;

  const convertBtn = (
    <button
      type="button"
      className="btn btn-primary bec-btn bec-btn--stamp"
      disabled={disabled || converting}
      onClick={() => onConvert(pkg, spec)}
      title="Straight to a proposal with these lines — you can still edit them there"
    >
      <svg className="ic"><use href="#i-file" /></svg>
      {converting ? "Creating…" : "Convert to proposal"}
    </button>
  );

  return (
    <>
      {/* TITLE BLOCK — the answer and the two ways out */}
      <div className="bec-console">
        {lead}
        <div className="bec-tk">
          <div className="bec-tk-c bec-tk-c--total">
            <span className="bec-tk-l">Total</span>
            <span className="bec-tk-v" key={total}>{money(total)}</span>
          </div>
          <div className="bec-tk-c">
            <span className="bec-tk-l">Materials</span>
            <span className="bec-tk-v">{money(materialsTotal)}</span>
          </div>
          <div className="bec-tk-c">
            <span className="bec-tk-l">Labor</span>
            <span className="bec-tk-v">{money(total - materialsTotal)}</span>
          </div>
        </div>
        <div className="bec-acts">
          <button
            type="button"
            className="btn btn-ghost bec-btn"
            disabled={disabled}
            onClick={() => onBuild(pkg, spec)}
            title="Fill the estimate tables below to review and adjust before converting"
          >
            <svg className="ic"><use href="#i-board" /></svg>
            Review {lineCount} lines
          </button>
          {convertBtn}
        </div>
      </div>

      <div className="bec-ledger">
        {/* 01 · ROOF SYSTEM */}
        <Row
          n="01"
          id="system"
          title="Roof system"
          summary={sumSystem}
          open={!!open.system}
          onToggle={() => toggle("system")}
          rates={
            manage === "systems" ? undefined : (
              <>
                <Rate label="Material" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => set("systemMatPerSq", v)} disabled={disabled} />
                <Rate label="Install labor" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => set("systemLaborPerSq", v)} disabled={disabled} />
                {!lowSlope && <Rate label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => set("capPerFt", v)} disabled={disabled} />}
              </>
            )
          }
        >
          {manage === "systems" ? (
            <div className="bec-tbl">
              <div className="bec-tr bec-tr--sys bec-th" aria-hidden="true">
                <span>Roof type</span><span>Family</span><span>Material</span><span>Labor</span><span>Waste</span><span>Cap</span><span />
              </div>
              {lists.systems.map((s) => (
                <div className="bec-tr bec-tr--sys" key={s.id}>
                  <label className="est-field bec-f bec-tn">
                    <span className="est-lbl">Roof type</span>
                    <input className="est-in" value={s.label} disabled={disabled} aria-label="Roof type name" onChange={(e) => patchSystem(s.id, { label: e.target.value })} />
                  </label>
                  <Sel label="Family" value={s.family} options={ROOF_FAMILIES} onChange={(v) => patchSystem(s.id, { family: v as RoofFamily })} disabled={disabled} />
                  <Num label="Material" aria="Material $/sq" unit="$/sq" value={s.matPerSq} onChange={(n) => patchSystem(s.id, { matPerSq: n })} disabled={disabled} />
                  <Num label="Labor" aria="Labor $/sq" unit="$/sq" value={s.laborPerSq} onChange={(n) => patchSystem(s.id, { laborPerSq: n })} disabled={disabled} />
                  <Num label="Waste" aria="Waste %" unit="%" value={s.wastePct} onChange={(n) => patchSystem(s.id, { wastePct: n })} disabled={disabled} />
                  <Num label="Cap" aria="Cap $/ft" unit="$/ft" value={s.capPerFt} onChange={(n) => patchSystem(s.id, { capPerFt: n })} disabled={disabled} />
                  <button type="button" className="bec-x" disabled={disabled || lists.systems.length <= 1} aria-label={`Remove ${s.label}`} title="Remove" onClick={() => removeSystem(s.id)}>
                    <IcX />
                  </button>
                </div>
              ))}
              <div className="bec-add">
                <button type="button" className="btn btn-ghost bec-btn bec-btn--sm" disabled={disabled} onClick={addSystem}>
                  <IcPlus />
                  Roof type
                </button>
                <button type="button" className="bec-link" disabled={disabled} onClick={resetLists}>Restore built-in list</button>
                <button type="button" className="bec-link" onClick={() => setManage(null)}>Done</button>
              </div>
            </div>
          ) : (
            <Group>
              <Sel
                label="System"
                value={spec.systemId}
                options={lists.systems}
                onChange={(id) => pickSystem(id)}
                disabled={disabled}
                wide
                after={
                  <button type="button" className="bec-link bec-link--under" disabled={disabled} onClick={() => setManage("systems")}>
                    Add roof type
                  </button>
                }
              />
              <Sel label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} />
            </Group>
          )}
        </Row>

        {/* 02 · UNDERLAYMENT */}
        <Row
          n="02"
          id="under"
          title="Underlayment"
          summary={sumUnder}
          open={!!open.under}
          onToggle={() => toggle("under")}
          rates={
            manage === "underlayments" ? undefined : (
              <>
                <Rate label="Underlayment" unit="$/sq" value={spec.underlaymentPerSq} onChange={(v) => set("underlaymentPerSq", v)} disabled={disabled} />
                {spec.iceWater !== "none" && <Rate label="Ice & water" unit="$/sq ft" value={spec.iceWaterPerSqft} onChange={(v) => set("iceWaterPerSqft", v)} disabled={disabled} />}
              </>
            )
          }
        >
          {manage === "underlayments" ? (
            <div className="bec-tbl">
              <div className="bec-tr bec-tr--und bec-th" aria-hidden="true">
                <span>Underlayment</span><span>Rate</span><span />
              </div>
              {lists.underlayments.map((u) => (
                <div className="bec-tr bec-tr--und" key={u.id}>
                  <label className="est-field bec-f bec-tn">
                    <span className="est-lbl">Underlayment</span>
                    <input className="est-in" value={u.label} disabled={disabled} aria-label="Underlayment name" onChange={(e) => patchUnderlayment(u.id, { label: e.target.value })} />
                  </label>
                  <Num label="Rate" aria="Underlayment $/sq" unit="$/sq" value={u.perSq} onChange={(n) => patchUnderlayment(u.id, { perSq: n })} disabled={disabled} />
                  <button type="button" className="bec-x" disabled={disabled || lists.underlayments.length <= 1} aria-label={`Remove ${u.label}`} title="Remove" onClick={() => removeUnderlayment(u.id)}>
                    <IcX />
                  </button>
                </div>
              ))}
              <div className="bec-add">
                <button type="button" className="btn btn-ghost bec-btn bec-btn--sm" disabled={disabled} onClick={addUnderlayment}>
                  <IcPlus />
                  Underlayment
                </button>
                <button type="button" className="bec-link" onClick={() => setManage(null)}>Done</button>
              </div>
            </div>
          ) : (
            <Group>
              <Sel
                label="Underlayment"
                value={spec.underlaymentId}
                options={lists.underlayments}
                onChange={(id) => pickUnderlayment(id)}
                disabled={disabled}
                wide
                after={
                  <button type="button" className="bec-link bec-link--under" disabled={disabled} onClick={() => setManage("underlayments")}>
                    Add underlayment
                  </button>
                }
              />
              <Sel label="Ice & water" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} wide />
            </Group>
          )}
        </Row>

        {/* 03 · EDGES */}
        <Row
          n="03"
          id="edges"
          title="Edges"
          summary={sumEdges}
          chip={<span className={"chip " + (edgeEstimated ? "wait" : "")}>{edgeEstimated ? "from outline" : "entered"}</span>}
          open={!!open.edges}
          onToggle={() => toggle("edges")}
          rates={
            spec.dripEdgeOn || (spec.starterOn && !noStarter) ? (
              <>
                {spec.dripEdgeOn && <Rate label="Drip edge" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />}
                {spec.starterOn && !noStarter && <Rate label="Starter" unit="$/ft" value={spec.starterPerFt} onChange={(v) => set("starterPerFt", v)} disabled={disabled} />}
              </>
            ) : undefined
          }
        >
          <Group
            label="Lengths"
            note={
              edgeEstimated ? (
                <div className="bec-note">Estimated from the building outline — check them against the photo.</div>
              ) : estimateEdges(facts) ? (
                <button type="button" className="bec-link" onClick={resetEdges} disabled={disabled}>Back to the outline estimate</button>
              ) : null
            }
          >
            <Num label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
            <Num label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
            <Num label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
            <Num label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
          </Group>
          <Group label="Drip edge & starter">
            <Check label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />
            {spec.dripEdgeOn && (
              <>
                <Sel label="Profile" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} wide />
                <Sel label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} />
              </>
            )}
            {!noStarter && <Check label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />}
          </Group>
        </Row>

        {/* 04 · FLASHING */}
        <Row
          n="04"
          id="flash"
          title="Flashing"
          summary={sumFlash}
          open={!!open.flash}
          onToggle={() => toggle("flash")}
          rates={
            <>
              <Rate label="Valley metal" unit="$/ft" value={spec.valleyMatPerFt} onChange={(v) => set("valleyMatPerFt", v)} disabled={disabled} />
              <Rate label="Valley labor" unit="$/ft" value={spec.valleyLaborPerFt} onChange={(v) => set("valleyLaborPerFt", v)} disabled={disabled} />
              <Rate label="Step piece" unit="$/ea" value={spec.stepPerPiece} onChange={(v) => set("stepPerPiece", v)} disabled={disabled} />
              <Rate label="Step labor" unit="$/ft" value={spec.stepLaborPerFt} onChange={(v) => set("stepLaborPerFt", v)} disabled={disabled} />
              <Rate label="Apron" unit="$/ft" value={spec.apronPerFt} onChange={(v) => set("apronPerFt", v)} disabled={disabled} />
              <Rate label="Apron labor" unit="$/ft" value={spec.apronLaborPerFt} onChange={(v) => set("apronLaborPerFt", v)} disabled={disabled} />
              <Rate label="Counter" unit="$/ft" value={spec.counterPerFt} onChange={(v) => set("counterPerFt", v)} disabled={disabled} />
              <Rate label="Counter labor" unit="$/ft" value={spec.counterLaborPerFt} onChange={(v) => set("counterLaborPerFt", v)} disabled={disabled} />
              <Rate label="Chimney kit" unit="$/ea" value={spec.chimneyEach} onChange={(v) => set("chimneyEach", v)} disabled={disabled} />
              <Rate label="Chimney labor" unit="$/ea" value={spec.chimneyLabor} onChange={(v) => set("chimneyLabor", v)} disabled={disabled} />
              <Rate label="Curb kit" unit="$/ea" value={spec.curbEach} onChange={(v) => set("curbEach", v)} disabled={disabled} />
              <Rate label="Curb labor" unit="$/ea" value={spec.curbLabor} onChange={(v) => set("curbLabor", v)} disabled={disabled} />
            </>
          }
        >
          <Group label="Valleys">
            <Num label="Count" unit="each" value={spec.valleyCount} onChange={(v) => set("valleyCount", v)} disabled={disabled} />
            <Num label="Length each" unit="ft" value={spec.valleyFtEach} onChange={(v) => set("valleyFtEach", v)} disabled={disabled} />
            <Sel label="Type" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} wide />
          </Group>
          <Group label="Sidewalls · step flashing">
            <Num label="Walls" unit="each" value={spec.stepWallCount} onChange={(v) => set("stepWallCount", v)} disabled={disabled} />
            <Num label="Length each" unit="ft" value={spec.stepWallFtEach} onChange={(v) => set("stepWallFtEach", v)} disabled={disabled} />
            <Sel label="Step size" value={spec.stepSizeId} options={STEP_FLASHING_SIZES} onChange={pickStep} disabled={disabled} wide />
          </Group>
          <Group label="Apron & counter">
            <Num label="Apron / headwall" unit="ft" value={spec.apronFt} onChange={(v) => set("apronFt", v)} disabled={disabled} />
            <Num label="Counter flashing" unit="ft" value={spec.counterFt} onChange={(v) => set("counterFt", v)} disabled={disabled} />
          </Group>
          <Group label="Pipe boots">
            {PIPE_BOOT_SIZES.map((s) => (
              <Num key={s.id} label={s.label} unit="each" value={spec.pipeBoots[s.id] ?? 0} onChange={(v) => set("pipeBoots", { ...spec.pipeBoots, [s.id]: v })} disabled={disabled} />
            ))}
          </Group>
          <Group label="Chimneys & curbs">
            <Num label="Chimneys" unit="each" value={spec.chimneyCount} onChange={(v) => set("chimneyCount", v)} disabled={disabled} />
            <Sel label="Chimney size" value={spec.chimneySizeId} options={CHIMNEY_SIZES} onChange={pickChimney} disabled={disabled} wide />
            <Num label="Curbs" unit="each" value={spec.curbCount} onChange={(v) => set("curbCount", v)} disabled={disabled} />
          </Group>
        </Row>

        {/* 05 · VENTS */}
        <Row
          n="05"
          id="vents"
          title="Vents"
          summary={sumVents}
          chip={vent ? <span className={"chip " + (vent.ok ? "ok" : "bad")}>{vent.ok ? "balanced" : "short"}</span> : undefined}
          open={!!open.vents}
          onToggle={() => toggle("vents")}
        >
          {vent ? (
            <div className="bec-annot">
              Attic <b>{fmt(facts.footprintSqft ?? 0)} sq ft</b> · needs <b>{fmt(vent.requiredSqIn)} sq in</b> net free area · exhaust <b>{fmt(vent.exhaustSqIn)}</b>
              {vent.poweredExhaust ? (
                <>
                  {" "}+ <b>{vent.poweredExhaust} powered</b>
                </>
              ) : null}{" "}
              · intake <b>{fmt(vent.intakeSqIn)}</b>
            </div>
          ) : (
            <div className="bec-note">No footprint on this measurement, so the attic check is off — add what the roof needs.</div>
          )}
          {ventsOn.length > 0 && (
            <div className="bec-tbl">
              <div className="bec-tr bec-tr--vent bec-th" aria-hidden="true">
                <span>Vent</span><span>Qty</span><span>Material</span><span>Labor</span><span />
              </div>
              {ventsOn.map((t) => {
                const v = ventOf(t.id);
                const each = t.unit === "each";
                return (
                  <div className="bec-tr bec-tr--vent" key={t.id}>
                    <span className="bec-vname bec-tn">
                      {t.label}
                      <em>{t.role}{t.nfaSqIn ? ` · ${t.nfaSqIn} sq in${each ? "" : "/ft"}` : " · powered"}</em>
                    </span>
                    <Num label="Qty" aria={`${t.label} quantity`} unit={each ? "each" : "ft"} value={v.qty} onChange={(n) => setVent(t.id, { qty: n })} disabled={disabled} />
                    <Num label="Material" aria={`${t.label} material`} unit={each ? "$/ea" : "$/ft"} value={v.each} onChange={(n) => setVent(t.id, { each: n })} disabled={disabled} />
                    <Num label="Labor" aria={`${t.label} labor`} unit={each ? "$/ea" : "$/ft"} value={v.labor} onChange={(n) => setVent(t.id, { labor: n })} disabled={disabled} />
                    <button type="button" className="bec-x" disabled={disabled} aria-label={`Remove ${t.label}`} title="Remove" onClick={() => setVent(t.id, { qty: 0 })}>
                      <IcX />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="bec-add">
            <Check label="Balanced system · 1/300 rule" checked={spec.ventBalanced} onChange={(v) => set("ventBalanced", v)} disabled={disabled} />
            {ventsToAdd.length > 0 && (
              <div className="est-field bec-f bec-f--wide">
                <BlueprintSelect
                  value=""
                  onChange={(id) => {
                    if (id) setVent(id, { qty: 1 });
                  }}
                  options={ventsToAdd.map((t) => ({ value: t.id, label: t.label }))}
                  placeholder="+ Add vent…"
                  ariaLabel="Add a vent"
                  disabled={disabled}
                  styles={SEL_STYLES}
                />
              </div>
            )}
          </div>
        </Row>

        {/* 06 · TEAR-OFF & EXTRAS */}
        <Row
          n="06"
          id="tear"
          title="Tear-off & extras"
          summary={sumTear}
          open={!!open.tear}
          onToggle={() => toggle("tear")}
          rates={
            <>
              <Rate label="Tear-off labor" unit="$/sq·layer" value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />
              <Rate label="Disposal" unit="$/sq·layer" value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />
              <Rate label="Deck sheet" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />
              <Rate label="Sheet labor" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />
              <Rate label="Nails & fasteners" unit="$/sq" value={spec.nailsPerSq} onChange={(v) => set("nailsPerSq", v)} disabled={disabled} />
              <Rate label="Sealant & collars" unit="$/sq" value={spec.sealantPerSq} onChange={(v) => set("sealantPerSq", v)} disabled={disabled} />
            </>
          }
        >
          <Group
            note={
              steepest < 8 ? (
                <div className="bec-note">Steep safety applies from 8/12 — this roof is {steepest > 0 ? `${Math.round(steepest)}/12` : "flatter"}, so it stays off.</div>
              ) : null
            }
          >
            <Sel
              label="Tear-off"
              value={String(spec.tearOffLayers)}
              options={[
                { id: "0", label: "None · overlay" },
                { id: "1", label: "1 layer" },
                { id: "2", label: "2 layers" },
                { id: "3", label: "3 layers" },
              ]}
              onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)}
              disabled={disabled}
            />
            <Num label="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
            <Num label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
            <Num label="Steep safety" unit="$" value={spec.safetyLump} onChange={(v) => set("safetyLump", v)} disabled={disabled} />
            <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />
          </Group>
        </Row>

        {/* 07 · CUSTOM LINES */}
        <Row n="07" id="custom" title="Custom lines" summary={sumCustom} open={!!open.custom} onToggle={() => toggle("custom")}>
          {spec.custom.length > 0 && (
            <div className="bec-tbl">
              <div className="bec-tr bec-tr--custom bec-th" aria-hidden="true">
                <span>Item</span><span>Qty</span><span>Unit</span><span>Price</span><span>Material or labor</span><span />
              </div>
              {spec.custom.map((c) => (
                <div className="bec-tr bec-tr--custom" key={c.id}>
                  <label className="est-field bec-f bec-tn">
                    <span className="est-lbl">Item</span>
                    <input className="est-in" placeholder="A skylight, gutters, a fascia repair" value={c.name} disabled={disabled} onChange={(e) => setCustom(c.id, { name: e.target.value })} aria-label="Custom item" />
                  </label>
                  <Num label="Qty" aria="Quantity" value={c.qty} onChange={(n) => setCustom(c.id, { qty: n })} disabled={disabled} />
                  <Sel label="Unit" aria="Unit" value={c.unit} options={PKG_UNITS.map((u) => ({ id: u, label: u }))} onChange={(v) => setCustom(c.id, { unit: v as PkgUnit })} disabled={disabled} />
                  <Num label="Price" aria="Unit price" unit="$" value={c.unitPrice} onChange={(n) => setCustom(c.id, { unitPrice: n })} disabled={disabled} />
                  <Sel
                    label="Kind"
                    aria="Material or labor"
                    value={c.kind}
                    options={[
                      { id: "material", label: "material" },
                      { id: "labor", label: "labor" },
                    ]}
                    onChange={(v) => setCustom(c.id, { kind: v as "material" | "labor" })}
                    disabled={disabled}
                  />
                  <button type="button" className="bec-x" disabled={disabled} aria-label="Remove custom line" title="Remove" onClick={() => removeCustom(c.id)}>
                    <IcX />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="bec-add">
            <button type="button" className="btn btn-ghost bec-btn bec-btn--sm" disabled={disabled} onClick={() => addCustom("material")}>
              <IcPlus />
              Material
            </button>
            <button type="button" className="btn btn-ghost bec-btn bec-btn--sm" disabled={disabled} onClick={() => addCustom("labor")}>
              <IcPlus />
              Labor
            </button>
          </div>
        </Row>
      </div>

      {/* FOOT — where the reader ends up: the total again and the way out;
          whose rates these are, and the save, off to the left. */}
      <div className="bec-foot">
        <div className="bec-cat">
          <span className="bec-cat-t">
            {source === "loading" ? "Loading rates…" : source === "org" ? "Your company’s rates" : "Built-in rates"}
            {dirty && source !== "loading" ? <em> · unsaved</em> : null}
          </span>
          <button
            type="button"
            className={"btn btn-ghost bec-btn bec-btn--sm" + (dirty ? " is-dirty" : "")}
            disabled={disabled || saving || source === "loading"}
            onClick={() => void saveDefaults()}
          >
            {saving ? "Saving…" : "Save as defaults"}
          </button>
        </div>
        <div className="bec-foot-r">
          <span className="bec-foot-v">{money(total)}</span>
          {convertBtn}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CARD
// ═══════════════════════════════════════════════════════════════════════════
export default function BuildEstimateCardC({
  isRecon,
  squares,
  manual,
  buildMode,
  onBuildMode,
  waste,
  onWaste,
  wasteOptions,
  pitchEntry,
  generate,
  facts,
  builderDisabled,
  converting,
  onBuild,
  onConvert,
  output,
}: BuildEstimateCardProps) {
  // EagleView supplied no pitch (pack 002 not bought): the contractor states
  // one before anything is priced, in either mode.
  const pitchSel = pitchEntry ? (
    <div className="est-field bec-f bec-f--pitch">
      <span className="est-lbl">Pitch</span>
      <BlueprintSelect
        id="pitchEntered"
        value={pitchEntry.value ?? ""}
        onChange={(p) => pitchEntry.onChange(p || null)}
        options={pitchEntry.options.map((p) => ({ value: p, label: p }))}
        placeholder="Enter pitch…"
        ariaLabel="Pitch"
        styles={SEL_STYLES}
      />
    </div>
  ) : null;

  const reason = generate.disabled && generate.reason ? generate.reason : null;

  return (
    <div className="card bec" data-build-card="c" data-mode={buildMode}>
      <div className="bec-head">
        <div className="bec-head-l">
          <div className="card-title">Build an estimate</div>
          {!isRecon && <Facts facts={facts} squares={squares} manual={manual} />}
        </div>
        <div className="vsw" role="radiogroup" aria-label="How to build the estimate">
          {(["package", "ai"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={buildMode === m}
              className={"vsw-btn" + (buildMode === m ? " active" : "")}
              onClick={() => onBuildMode(m)}
            >
              {m === "package" ? "Roof package" : "Smart estimate"}
            </button>
          ))}
        </div>
      </div>

      {/* Doubtful figures (`caution`) are NOT restated here: the page's own
          notice above the card carries the full account and the way out. */}
      {isRecon && (
        <div className="bec-empty">
          These figures are estimated from aerial imagery, so they can’t be priced. Run <b>Instant measure</b> for this address to build a quote.
        </div>
      )}

      {buildMode === "package" ? (
        !isRecon && facts ? (
          <PackageLedger facts={facts} disabled={builderDisabled} converting={converting} onBuild={onBuild} onConvert={onConvert} lead={pitchSel} />
        ) : pitchSel ? (
          <div className="bec-console">{pitchSel}</div>
        ) : null
      ) : (
        <div className="bec-console bec-console--smart">
          {pitchSel}
          <div className="est-field bec-f bec-f--waste">
            <span className="est-lbl">Waste</span>
            <BlueprintSelect
              id="waste"
              value={String(waste)}
              onChange={(w) => onWaste(Number(w))}
              options={wasteOptions.map((w) => ({ value: String(w), label: `${w}%` }))}
              placeholder=""
              ariaLabel="Waste"
              styles={SEL_STYLES}
            />
          </div>
          <p className={"bec-hint" + (reason ? " is-reason" : "")}>
            {reason ?? "Drafts the full package from the measured figures — every line stays editable below."}
          </p>
          <button
            className="btn btn-primary bec-btn bec-btn--stamp"
            type="button"
            id="buildBtn"
            disabled={generate.disabled}
            title={generate.reason}
            onClick={generate.onClick}
          >
            <svg className="ic"><use href="#i-bulb" /></svg>
            {generate.busy ? "Generating…" : "Generate estimate"}
          </button>
        </div>
      )}

      {output}
    </div>
  );
}
