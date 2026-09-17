"use client";

// VARIANT C of the "Build an estimate" card — the 2026-09-12 three-way
// comparison, reached at /dashboard/roof-estimator?builder=c.
//
// THE READ, in one second, top to bottom:
//   HEAD        the title says what the card does; the switch beside it, how;
//               the roof's facts are one mono annotation, stated once.
//   TITLE BLOCK the answer — the total, its materials / labor split, and the
//               two ways out (Review lines, Convert to proposal as a stamp).
//   LEDGER      01–08, one row per part of the roof, each closed to a one-line
//               summary of WHAT is picked (rates stay inside). A flat roof
//               swaps rows 02–06 for its own assembly (insulation, edges and
//               walls, drains and curbs, rooftop and warranty, tear-off);
//               07 is commercial pricing on either kind of roof.
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
  familyLabel,
  ICE_WATER,
  likeForLikeSystem,
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
  likeForLikeFamily,
  withJobClass,
  withMeasured,
  withSystem,
  type RoofFacts,
  type RoofPackage,
  type RoofPackageSpec,
} from "@/lib/roofPackage/takeoff";
import { isFlatRoof } from "@/lib/roofPackage/flatRule";
import {
  COVER_BOARDS,
  DRAIN_WORK,
  EXISTING_LOW_SLOPE,
  FLAT_RATE_DEFS,
  INSULATION_OPTIONS,
  SECONDARY_DRAINAGE,
  WARRANTIES,
  isSurfaceApplied,
  lowSlopeRule,
  rate as flatRate,
  takesBoards,
  type DrainWork,
  type ExistingLowSlope,
  type FlatRateKey,
  type FlatSpec,
  type SecondaryDrainage,
} from "@/lib/roofPackage/lowSlope";
import {
  COMMERCIAL_RATE_DEFS,
  SHIFTS,
  WAGE_REGIMES,
  cRate,
  productivityFactor,
  type CommercialRateKey,
  type CommercialSpec,
  type Shift,
  type WageRegime,
} from "@/lib/roofPackage/commercial";
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
  applyPickedPrices,
  familyFit,
  pickSystemOn,
} from "./roof-package-builder";
import type { BuildEstimateCardProps, ReportProp } from "./build-estimate-card";
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
          aria-label={aria || undefined}
          onChange={(e) => {
            const v = e.target.value;
            setTxt(v);
            const n = Number(v.replace(/,/g, ""));
            if (v.trim() !== "" && Number.isFinite(n) && n >= min && n <= MAX_ENTRY) onChange(n);
          }}
          onBlur={() => {
            setTxt(String(value));
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
    <section className={`bec-row bec-row--${id}` + (open ? " is-open" : "")}>
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

// ═══════════════════════════════════════════════════════════════════════════
// THE PACKAGE LEDGER — title block, seven rows, foot. Owns the builder state.
// ═══════════════════════════════════════════════════════════════════════════
function PackageLedger({
  facts,
  onBuild,
  onConvert,
  report,
  disabled: incomingDisabled,
  converting,
  lead,
  needsPitch = false,
  onBuildingUse,
}: {
  facts: RoofFacts;
  onBuildingUse?: (use: "residential" | "commercial") => void;
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  onConvert: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  report?: ReportProp | null;
  disabled?: boolean;
  converting?: boolean;
  /** The pitch picker, when the aerial data carried no pitch: it leads the title block. */
  lead?: React.ReactNode;
  needsPitch?: boolean;
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
    const saved = typeof window === "undefined" ? null : readLocal<Prefs>(PREFS_KEY);
    return familyFit(reconcile(applyPrefs(defaultSpec(facts, l, saved?.lowSlopeSystemId), saved), l), facts, l, saved);
  });
  // A different roof opened: the per-roof entries start over from its facts,
  // the preferences stay. Adjusted during render, not in an effect.
  const [seenKey, setSeenKey] = React.useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    const saved = readLocal<Prefs>(PREFS_KEY);
    setSpec(familyFit(reconcile(applyPrefs(defaultSpec(facts, lists, saved?.lowSlopeSystemId), saved), lists), facts, lists, saved));
  }
  // The contractor answered residential or commercial (the report panel asks
  // when the roof reads commercial). Applied IN PLACE: the job-class defaults
  // follow the answer, nothing else they entered is lost.
  const use = facts.buildingUse ?? null;
  const [seenUse, setSeenUse] = React.useState(use);
  if (use !== seenUse) {
    setSeenUse(use);
    setSpec((s) => applyPickedPrices(withJobClass(s, facts, lists, use === "commercial"), readLocal<Prefs>(PREFS_KEY)));
  }
  // A full measurement report landed for this roof: its lengths replace the
  // estimates in place — nothing the contractor entered is wiped.
  const reportId = facts.measured?.reportId ?? null;
  const [seenReport, setSeenReport] = React.useState(reportId);
  if (reportId !== seenReport) {
    setSeenReport(reportId);
    if (reportId != null) {
      setSpec((s) => {
        const merged = withMeasured(s, facts, lists);
        const flatNow = isFlatRoof(facts);
        return flatNow !== (merged.systemFamily === "low-slope") ? familyFit(merged, facts, lists, readLocal<Prefs>(PREFS_KEY)) : merged;
      });
    }
  }
  // The latest facts, for the one effect that runs once (the org catalog load).
  const factsRef = React.useRef(facts);
  React.useEffect(() => {
    factsRef.current = facts;
  });

  // The org's saved catalog, when the table exists and a save has happened:
  // its lists and prices win over the browser's copy.
  const [source, setSource] = React.useState<"loading" | "org" | "browser">("loading");
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Wait for the company defaults before accepting edits; a late response
  // must never overwrite a rate the contractor has just entered.
  const disabled = incomingDisabled || source === "loading" || saving;
  React.useEffect(() => {
    let cancelled = false;
    getRoofCatalog()
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          const l = saneLists({ systems: doc.systems, underlayments: doc.underlayments }) ?? BUILTIN_LISTS;
          setLists(l);
          setSpec((s) => familyFit(reconcile(applyPrefs(s, doc.prefs), l), factsRef.current, l, doc.prefs as Prefs));
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
  const setValleyField = (k: "valleyCount" | "valleyFtEach", v: number) => setSpec((s) => ({ ...s, [k]: v, valleyBasis: "entered" }));
  const setStepField = (k: "stepWallCount" | "stepWallFtEach", v: number) => setSpec((s) => ({ ...s, [k]: v, stepBasis: "entered" }));
  const resetEdges = () => {
    const e = estimateEdges(facts);
    if (e) setSpec((s) => ({ ...s, ...e, edgesBasis: "estimated" }));
  };
  const updateLists = (next: CatalogLists) => {
    setLists(next);
    setSpec((s) => {
      const r = reconcile(s, next);
      if (r.systemFamily === s.systemFamily) return r;
      // The family ran out of rows: cross to the new family properly.
      const target = next.systems.find((x) => x.id === r.systemId);
      return target ? withSystem(s, target, facts, next) : r;
    });
    writeLocal(LISTS_KEY, next);
    setDirty(true);
  };

  async function saveDefaults() {
    if (saving || source === "loading") return;
    setSaving(true);
    setSaveError(null);
    const prefs = prefsOf(spec);
    try {
      const res = await saveRoofCatalog({ version: 1, systems: lists.systems, underlayments: lists.underlayments, prefs });
      if (res.ok) {
        writeLocal(LISTS_KEY, lists);
        writeLocal(PREFS_KEY, prefs);
        setSource("org");
        setDirty(false);
        toast.success("Defaults saved", "Your roof types, underlayments and rates now load for everyone in your company.");
      } else {
        setSaveError(res.error);
        toast.error("Couldn't save", res.error);
      }
    } catch {
      const message = "Company defaults could not be saved. Check your connection and try again.";
      setSaveError(message);
      toast.error("Couldn't save", message);
    } finally {
      setSaving(false);
    }
  }

  const pkg = React.useMemo(() => buildRoofPackage(spec, facts), [spec, facts]);
  const vent = React.useMemo(() => checkVentilation(spec, facts), [spec, facts]);
  const total = [...pkg.materials, ...pkg.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const materialsTotal = pkg.materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  // ── Picks copy the catalog row's prices into the spec ──
  // withSystem does the work (the underlayment and valley follow a steep
  // family; a flat system follows its method; crossing between steep and flat
  // rebuilds the roof-shaped part), and after a crossing the saved rates for
  // the new side are laid back on.
  const pickSystem = (id: string, from: CatalogLists = lists, opts: { auto?: boolean; force?: boolean } = {}) => {
    const s = from.systems.find((x) => x.id === id);
    if (!s) return;
    if (id === spec.systemId && !opts.force) return;
    setSpec((prev) => {
      const next = pickSystemOn(prev, s, facts, from, { auto: opts.auto });
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  /** A row-01 rate edit is a catalog edit: it lands on the system's row, so
   *  Manage roof types, the next roof and "Save as defaults" all see it. */
  const setSystemRate = (field: "matPerSq" | "laborPerSq" | "capPerFt", v: number) => {
    // A system with no row (never after reconcile, but never assume) keeps
    // the edit on this estimate only, rather than letting reconcile swap it.
    if (lists.systems.some((x) => x.id === spec.systemId)) {
      updateLists({ ...lists, systems: lists.systems.map((x) => (x.id === spec.systemId ? { ...x, [field]: v } : x)) });
    }
    const key = field === "matPerSq" ? "systemMatPerSq" : field === "laborPerSq" ? "systemLaborPerSq" : "capPerFt";
    setSpec((prev) => ({ ...prev, [key]: v }));
  };
  /** Roof type first, then the system within it: the contractor's usual flat
   *  system for "Flat / low slope", like-for-like for the family otherwise. */
  const pickFamily = (fam: RoofFamily) => {
    if (fam === spec.systemFamily) return;
    const usual = fam === "low-slope" ? readLocal<Prefs>(PREFS_KEY)?.lowSlopeSystemId : null;
    const s = (usual ? lists.systems.find((x) => x.id === usual && x.family === fam) : null) ?? likeForLikeSystem(fam, lists);
    if (s) pickSystem(s.id);
    else toast.info(`No ${familyLabel(fam).toLowerCase()} systems in your list`, "Add one with Add roof type.");
  };
  const setFlat = <K extends keyof FlatSpec>(k: K, v: FlatSpec[K]) => {
    setSpec((prev) => {
      const next = { ...prev, flat: { ...prev.flat, [k]: v } };
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  const setFlatRate = (k: FlatRateKey, v: number) => {
    setSpec((prev) => {
      const next = { ...prev, flat: { ...prev.flat, rates: { ...prev.flat.rates, [k]: v } } };
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  // Option picks copy the catalog price, then the price this contractor last
  // set for that same option, if any.
  const pickBoard = (kind: "insulation" | "cover", id: string) => {
    const o = (kind === "insulation" ? INSULATION_OPTIONS : COVER_BOARDS).find((x) => x.id === id);
    if (!o) return;
    setSpec((prev) =>
      applyPickedPrices(
        {
          ...prev,
          flat:
            kind === "insulation"
              ? { ...prev.flat, insulationId: o.id, insulationMatPerSq: o.matPerSq, insulationLaborPerSq: o.laborPerSq, insulationThicknessIn: o.thicknessIn }
              : { ...prev.flat, coverBoardId: o.id, coverBoardMatPerSq: o.matPerSq, coverBoardLaborPerSq: o.laborPerSq, coverBoardThicknessIn: o.thicknessIn },
        },
        readLocal<Prefs>(PREFS_KEY),
      ),
    );
    setDirty(true);
  };
  const pickWarranty = (id: string) => {
    const w = WARRANTIES.find((x) => x.id === id);
    if (w) setSpec((prev) => applyPickedPrices({ ...prev, flat: { ...prev.flat, warrantyId: w.id, warrantyPerSq: w.perSq } }, readLocal<Prefs>(PREFS_KEY)));
    setDirty(true);
  };
  const pickExisting = (id: string) => {
    const e = EXISTING_LOW_SLOPE.find((x) => x.id === id);
    if (e) setSpec((prev) => applyPickedPrices({ ...prev, flat: { ...prev.flat, existing: e.id }, tearOffPerSqLayer: e.tearOffPerSqLayer, disposalPerSqLayer: e.disposalPerSqLayer }, readLocal<Prefs>(PREFS_KEY)));
    setDirty(true);
  };
  const setCommercial = <K extends keyof CommercialSpec>(k: K, v: CommercialSpec[K]) => {
    setSpec((prev) => {
      const next = { ...prev, commercial: { ...prev.commercial, [k]: v } };
      if (k === "wage") writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  const setCommercialRate = (k: CommercialRateKey, v: number) => {
    setSpec((prev) => {
      const next = { ...prev, commercial: { ...prev.commercial, rates: { ...prev.commercial.rates, [k]: v } } };
      writeLocal(PREFS_KEY, prefsOf(next));
      return next;
    });
    setDirty(true);
  };
  /** Commercial on or off from the builder. On a measured roof it is the
   *  page's one answer (the seenUse block applies it here); on a hand-entered
   *  takeoff it stays local. */
  const toggleCommercial = (on: boolean) => {
    if (onBuildingUse) onBuildingUse(on ? "commercial" : "residential");
    else setSpec((prev) => applyPickedPrices(withJobClass(prev, facts, lists, on), readLocal<Prefs>(PREFS_KEY)));
    setDirty(true);
  };
  /** The select's last option: a new row of the contractor's own, picked and opened for editing. */
  const CUSTOM_SYSTEM = "__custom";
  /** What a replacement is like-for-like with, when that is true (likeForLikeFamily). */
  const existingFam = likeForLikeFamily(facts);
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
      const saved = readLocal<Prefs>(PREFS_KEY)?.ventPrices?.[id];
      const each = saved && Number.isFinite(saved.each) && saved.each >= 0 ? saved.each : t.each;
      const labor = saved && Number.isFinite(saved.labor) && saved.labor >= 0 ? saved.labor : t.labor;
      const has = s.vents.some((v) => v.id === id);
      const vents = has ? s.vents.map((v) => (v.id === id ? { ...v, ...patch } : v)) : [...s.vents, { id, qty: 0, each, labor, ...patch }];
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
    if (id !== spec.systemId) return;
    const row = next.systems.find((s) => s.id === id)!;
    if (row.family !== spec.systemFamily) {
      pickSystem(id, next, { force: true });
      return;
    }
    // Same system, same family: take the edited label and prices only — the
    // flat-roof choices that follow a system's method stay as they are.
    setSpec((prev) => ({ ...prev, systemName: row.label, systemMatPerSq: row.matPerSq, systemLaborPerSq: row.laborPerSq, wastePct: row.wastePct, capPerFt: prev.systemFamily === "low-slope" ? 0 : row.capPerFt }));
  };
  const addSystem = () => {
    const s: RoofSystem = { id: "s_" + nanoid(6), label: spec.systemFamily === "low-slope" ? "Custom flat system" : "Custom roof type", family: spec.systemFamily, matPerSq: 0, laborPerSq: 0, wastePct: spec.systemFamily === "low-slope" ? 8 : 10, capPerFt: 0 };
    const next = { ...lists, systems: [...lists.systems, s] };
    updateLists(next);
    pickSystem(s.id, next);
    setManage("systems");
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
    !spec.commercial.on && spec.permitLump > 0 ? `permit ${money(spec.permitLump)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sumCustom = spec.custom.length ? `${spec.custom.length} line${spec.custom.length === 1 ? "" : "s"}` : "None";

  // ── The flat roof's rows ──
  const F = spec.flat;
  const rule = lowSlope ? lowSlopeRule(spec.systemId, spec.systemName) : null;
  const boards = rule ? takesBoards(rule) : false;
  const surface = rule ? isSurfaceApplied(rule) : false;
  const perimeterFt = Math.max(0, spec.eaveFt + spec.rakeFt);
  const splitOff = perimeterFt > 0 && Math.abs(F.parapetFt + F.edgeMetalFt - perimeterFt) > 0.1 * perimeterFt;
  const insLabel = INSULATION_OPTIONS.find((o) => o.id === F.insulationId)?.label ?? "Insulation";
  const coverLabel = COVER_BOARDS.find((o) => o.id === F.coverBoardId)?.label ?? "Cover board";
  const plural = (n: number, one: string, many = one + "s") => `${fmt(n)} ${n === 1 ? one : many}`;
  const sumBoards = surface
    ? ["Wash, repair & fabric", F.primerOn ? "primer" : null, F.wetInsulationSqft > 0 ? `${fmt(F.wetInsulationSqft)} sq ft wet insulation` : null, F.coreCuts > 0 ? plural(F.coreCuts, "core cut") : null].filter(Boolean).join(" · ")
    : !boards
      ? "Straight on the deck — no insulation or cover board"
      : [F.insulationId !== "none" ? insLabel : "No insulation", F.coverBoardId !== "none" ? coverLabel : null, F.taperedSqft > 0 ? `${fmt(F.taperedSqft)} sq ft tapered` : null].filter(Boolean).join(" · ");
  const sumWalls =
    F.parapetFt + F.edgeMetalFt + F.wallFt <= 0
      ? "No perimeter yet — enter the parapet and open-edge lengths"
      : [F.parapetFt > 0 ? `${fmt(F.parapetFt)} ft parapet` : null, F.edgeMetalFt > 0 ? `${fmt(F.edgeMetalFt)} ft open edge` : null, F.wallFt > 0 ? `${fmt(F.wallFt)} ft wall` : null].filter(Boolean).join(" · ");
  const sumDrains =
    [
      !surface && F.drains > 0 ? `${plural(F.drains, "drain")}${F.secondary !== "none" ? " + overflow" : ""}` : null,
      F.scuppers > 0 ? plural(F.scuppers, "scupper") : null,
      F.gutterFt > 0 ? `${fmt(F.gutterFt)} ft gutter` : null,
      F.pipeBoots > 0 ? plural(F.pipeBoots, "boot") : null,
      F.pitchPockets > 0 ? plural(F.pitchPockets, "pitch pocket") : null,
      !surface && F.rtuCount > 0 ? plural(F.rtuCount, "rooftop unit") : null,
      !surface && F.curbs > 0 ? plural(F.curbs, "curb") : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Nothing counted yet — drains, boots, units, curbs";
  const warrantyLabel = WARRANTIES.find((w) => w.id === F.warrantyId)?.label ?? "Workmanship only";
  const sumRooftop = [
    F.walkwayFt > 0 ? `${fmt(F.walkwayFt)} ft walkway` : null,
    F.craneHours > 0 ? `crane ${fmt(F.craneHours)} h` : F.hoistOn ? "ladder hoist" : null,
    !surface && F.coreCuts > 0 ? plural(F.coreCuts, "core cut") : null,
    warrantyLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const existingLabel = EXISTING_LOW_SLOPE.find((e) => e.id === F.existing)?.label ?? "Existing roof";
  const sumFlatTear = [
    surface ? "Over the existing roof, no tear-off" : spec.tearOffLayers === 0 ? "Recover, no tear-off" : `Tear-off ${existingLabel.toLowerCase()} · ${plural(spec.tearOffLayers, "layer")}`,
    spec.plywoodSheets > 0 ? plural(spec.plywoodSheets, "deck sheet") : null,
    spec.cleanupLump > 0 ? `cleanup ${money(spec.cleanupLump)}` : null,
    !spec.commercial.on && spec.permitLump > 0 ? `permit ${money(spec.permitLump)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const attachRates: FlatRateKey[] = !rule
    ? []
    : [
        ...(rule.method === "mech" ? (["mechFasteners"] as const) : []),
        ...(rule.method === "induction" ? (["inductionPlates"] as const) : []),
        ...(rule.method === "adhered" ? ([rule.fleece ? "foamAdhesive" : "bondingAdhesive"] as const) : []),
        ...(rule.method === "ballasted" ? (["ballastMat", "ballastLabor"] as const) : []),
        ...(rule.method === "torch" ? (["primerTorch"] as const) : []),
        ...(rule.method === "self_adhered" ? (["primerSa"] as const) : []),
        ...(rule.method === "nailed" ? (["capNails"] as const) : []),
        ...(rule.membrane === "tpo" || rule.membrane === "pvc" || rule.membrane === "kee" ? (["seamSingle"] as const) : []),
        ...(rule.membrane === "epdm" ? (["seamEpdm"] as const) : []),
      ];
  const flatRates = (keys: ReadonlyArray<FlatRateKey | false | null>) =>
    keys.filter((k): k is FlatRateKey => !!k).map((k) => (
      <Rate key={k} label={FLAT_RATE_DEFS[k].label} unit={FLAT_RATE_DEFS[k].unit} value={flatRate(F, k)} onChange={(v) => setFlatRate(k, v)} disabled={disabled} />
    ));

  // ── Commercial ──
  const C = spec.commercial;
  const prod = productivityFactor(facts.squares);
  const wageLabel = WAGE_REGIMES.find((w) => w.id === C.wage)?.label ?? "Open shop";
  const shiftLabel = SHIFTS.find((x) => x.id === C.shift)?.label ?? "Day shift";
  const sumCommercial = C.on
    ? [`Commercial · ${wageLabel.toLowerCase()}`, shiftLabel.toLowerCase(), C.occupied ? "occupied" : null, C.stories > 2 ? `${C.stories} stories` : null, `GC ${cRate(C, "gcPct") + cRate(C, "insurancePct")}%`].filter(Boolean).join(" · ")
    : "Residential pricing";
  const commercialRates = (keys: CommercialRateKey[]) =>
    keys.map((k) => (
      <Rate key={k} label={COMMERCIAL_RATE_DEFS[k].label} unit={COMMERCIAL_RATE_DEFS[k].unit} value={cRate(C, k)} onChange={(v) => setCommercialRate(k, v)} disabled={disabled} />
    ));
  const roofIsFlat = isFlatRoof(facts);

  const ventsToAdd = VENT_TYPES.filter((t) => ventOf(t.id).qty <= 0);
  const edgeEstimated = spec.edgesBasis === "estimated";
  const edgeMeasured = spec.edgesBasis === "measured";
  const lineCount = pkg.materials.length + pkg.labor.length;

  const convertBtn = (
    <button
      type="button"
      className="btn btn-primary bec-btn bec-btn--stamp"
      disabled={disabled || converting || needsPitch}
      onClick={() => onConvert(pkg, spec)}
      title={needsPitch ? "Enter pitch to price." : "Straight to a proposal with these lines — you can still edit them there"}
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
            <span className="bec-tk-l">{spec.commercial.on ? "Total · commercial" : "Total"}</span>
            <span className="bec-tk-v" key={total}>{needsPitch ? "—" : money(total)}</span>
          </div>
          <div className="bec-tk-c">
            <span className="bec-tk-l">Materials</span>
            <span className="bec-tk-v">{needsPitch ? "—" : money(materialsTotal)}</span>
          </div>
          <div className="bec-tk-c">
            <span className="bec-tk-l">Labor</span>
            <span className="bec-tk-v">{needsPitch ? "—" : money(total - materialsTotal)}</span>
          </div>
        </div>
        <div className="bec-acts">
          <button
            type="button"
            className="btn btn-ghost bec-btn"
            disabled={disabled || needsPitch}
            onClick={() => onBuild(pkg, spec)}
            title={needsPitch ? "Enter pitch to price." : "Fill the estimate tables below to review and adjust before converting"}
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
                <Rate label="Material" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => setSystemRate("matPerSq", v)} disabled={disabled} />
                <Rate label="Install labor" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => setSystemRate("laborPerSq", v)} disabled={disabled} />
                {!lowSlope && <Rate label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => setSystemRate("capPerFt", v)} disabled={disabled} />}
              </>
            )
          }
        >
          {manage === "systems" ? (
            <div className="bec-tbl">
              <div className="bec-tr bec-tr--sys bec-th" aria-hidden="true">
                <span>Roof type</span><span>Family</span><span>Material</span><span>Labor</span><span>Waste</span><span>Cap</span><span />
              </div>
              {lists.systems.filter((x) => x.family === spec.systemFamily).map((s) => (
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
                  <button type="button" className="bec-x" disabled={disabled || lists.systems.length <= 1 || s.id === spec.systemId} aria-label={`Remove ${s.label}`} title={s.id === spec.systemId ? "In use on this estimate — pick another system first" : "Remove"} onClick={() => removeSystem(s.id)}>
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
                label="Roof type"
                value={spec.systemFamily}
                options={ROOF_FAMILIES.filter((f) => f.id === spec.systemFamily || lists.systems.some((x) => x.family === f.id))}
                onChange={(v) => pickFamily(v as RoofFamily)}
                disabled={disabled}
                after={
                  lowSlope ? (
                    <div className="bec-lfl">
                      {roofIsFlat
                        ? `Flat roof${facts.existingMaterial ? ` · existing ${facts.existingMaterial.toLowerCase()}` : ""} · priced as a full assembly`
                        : "Priced as a full flat-roof assembly"}
                    </div>
                  ) : roofIsFlat && spec.systemId !== "standing_seam_low" ? (
                    <div className="bec-lfl is-diff">
                      This roof reads flat — a steep system here prices a conversion.
                      <button type="button" className="bec-link" disabled={disabled} onClick={() => pickFamily("low-slope")}>
                        Price it flat
                      </button>
                    </div>
                  ) : undefined
                }
              />
              <Sel
                label="System"
                value={spec.systemId}
                options={[...lists.systems.filter((x) => x.family === spec.systemFamily || x.id === spec.systemId), { id: CUSTOM_SYSTEM, label: lowSlope ? "＋ Custom flat system…" : "＋ Custom roof type…" }]}
                onChange={(id) => (id === CUSTOM_SYSTEM ? addSystem() : pickSystem(id))}
                disabled={disabled}
                wide
                after={
                  <>
                    {existingFam && !lowSlope && (
                      <div className={"bec-lfl" + (spec.systemFamily === existingFam ? "" : " is-diff")}>
                        {spec.systemFamily === existingFam ? (
                          `Existing roof: ${facts.existingMaterial} · priced like-for-like`
                        ) : (
                          <>
                            {`Existing roof: ${facts.existingMaterial} — this prices a change to ${familyLabel(spec.systemFamily).toLowerCase()}.`}
                            {likeForLikeSystem(existingFam, lists) && (
                              <button
                                type="button"
                                className="bec-link"
                                disabled={disabled}
                                onClick={() => {
                                  const s = likeForLikeSystem(existingFam, lists);
                                  if (s) pickSystem(s.id, lists, { auto: true });
                                }}
                              >
                                {`Back to ${familyLabel(existingFam).toLowerCase()}`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <button type="button" className="bec-link bec-link--under" disabled={disabled} onClick={() => setManage("systems")}>
                      Add roof type
                    </button>
                  </>
                }
              />
              <Sel label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} />
            </Group>
          )}
        </Row>

        {!lowSlope ? (
          <>
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
          chip={<span className={"chip " + (edgeMeasured ? "ok" : edgeEstimated ? "wait" : "")}>{edgeMeasured ? "measured" : edgeEstimated ? "estimated" : "entered"}</span>}
          open={!!open.edges}
          onToggle={() => toggle("edges")}
        >
          <div className="bec-edge-lengths">
            <Num label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
            <Num label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
            <Num label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
            <Num label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
          </div>
          <div className="bec-edge-options">
            <div className="bec-edge-option">
              <Check label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />
              {spec.dripEdgeOn && (
                <>
                  <Sel label="Profile" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} />
                  <Sel label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} />
                  <Num label="Rate" aria="Drip edge rate" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />
                </>
              )}
            </div>
            {!noStarter && (
              <div className="bec-edge-option bec-edge-option--starter">
                <Check label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />
                {spec.starterOn && <Num label="Rate" aria="Starter rate" unit="$/ft" value={spec.starterPerFt} onChange={(v) => set("starterPerFt", v)} disabled={disabled} />}
              </div>
            )}
          </div>
          <details className="bec-details">
            <summary>Measurement source & report</summary>
            <div className="bec-details-body">
              {edgeMeasured ? (
                <p className="bec-note">Lengths from aerial report{report?.reportId ? ` #${report.reportId}` : ""}.</p>
              ) : edgeEstimated ? (
                <p className="bec-note">Estimated from the building outline. Check lengths against the roof.</p>
              ) : estimateEdges(facts) ? (
                <button type="button" className="bec-link" onClick={resetEdges} disabled={disabled}>Reset to outline estimate</button>
              ) : <p className="bec-note">Lengths entered for this roof.</p>}
              {report && report.state === "none" && !edgeMeasured && (
                <div className="bec-offer">
                  <button type="button" className="btn btn-ghost bec-btn bec-btn--sm" onClick={report.onOrder} disabled={disabled || report.busy}>
                    {report.busy ? "Pricing…" : "Order measurement report"}
                  </button>
                  <span className="bec-note">Paid report · usually within 48 hours · lengths update automatically.</span>
                </div>
              )}
              {report && report.state === "pending" && (
                <div className="bec-offer">
                  <span className="bec-note">Report #{report.reportId} · {report.status ?? "in process"}</span>
                  <button type="button" className="btn btn-ghost bec-btn bec-btn--sm" onClick={report.onCheck} disabled={disabled || report.busy}>
                    {report.busy ? "Checking…" : "Check report status"}
                  </button>
                </div>
              )}
            </div>
          </details>
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
            <Num label="Count" unit="each" value={spec.valleyCount} onChange={(v) => setValleyField("valleyCount", v)} disabled={disabled} />
            <Num label="Length each" unit="ft" value={spec.valleyFtEach} onChange={(v) => setValleyField("valleyFtEach", v)} disabled={disabled} />
            <Sel label="Type" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} wide />
          </Group>
          <Group label="Sidewalls · step flashing">
            <Num label="Walls" unit="each" value={spec.stepWallCount} onChange={(v) => setStepField("stepWallCount", v)} disabled={disabled} />
            <Num label="Length each" unit="ft" value={spec.stepWallFtEach} onChange={(v) => setStepField("stepWallFtEach", v)} disabled={disabled} />
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
            /* The attic check as four figures, label over value — read at a
               glance, not decoded from one mono line. */
            <div className="bec-figs" role="group" aria-label="Attic ventilation check">
              <div className="bec-fig">
                <span className="bec-fig-l">Attic</span>
                <span className="bec-fig-v">
                  {fmt(facts.footprintSqft ?? 0)}
                  <small>sq ft</small>
                </span>
              </div>
              <div className="bec-fig">
                <span className="bec-fig-l">Needs</span>
                <span className="bec-fig-v">
                  {fmt(vent.requiredSqIn)}
                  <small>sq in net free area</small>
                </span>
              </div>
              <div className="bec-fig">
                <span className="bec-fig-l">Exhaust</span>
                <span className="bec-fig-v">
                  {fmt(vent.exhaustSqIn)}
                  <small>sq in</small>
                  {vent.poweredExhaust ? <small>+ {vent.poweredExhaust} powered</small> : null}
                </span>
              </div>
              <div className="bec-fig">
                <span className="bec-fig-l">Intake</span>
                <span className="bec-fig-v">
                  {fmt(vent.intakeSqIn)}
                  <small>sq in</small>
                </span>
              </div>
            </div>
          ) : (
            <div className="bec-note">No footprint on this measurement, so the attic check is off — add what the roof needs.</div>
          )}
          {ventsOn.length > 0 && (
            <div className="bec-tbl">
              <div className="bec-tr bec-tr--vent bec-th" aria-hidden="true">
                <span>Vent</span><span>Qty</span><span>Material rate</span><span>Labor rate</span><span>Total</span><span />
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
                    <span className="bec-vent-total"><span>Total</span>{money(v.qty * (v.each + v.labor))}</span>
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
            {!spec.commercial.on && <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />}
            <Num label="Delivery" unit="$" value={spec.deliveryLump ?? 0} onChange={(v) => set("deliveryLump", v)} disabled={disabled} />
          </Group>
        </Row>

          </>
        ) : (
          <>
        {/* 02 · INSULATION & COVER BOARD — or the prep a coating needs */}
        <Row
          n="02"
          id="boards"
          // Row names live in a fixed 158px column — longer names ran into the summary.
          title={surface ? "Surface prep" : "Insulation"}
          summary={sumBoards}
          open={!!open.boards}
          onToggle={() => toggle("boards")}
          rates={
            surface ? (
              <>{flatRates(["washMat", "washLabor", "repairMat", "repairLabor", F.primerOn && "primerCoatMat", F.primerOn && "primerCoatLabor", "wetIns", "coreEach"])}</>
            ) : (
              <>
                {boards && F.insulationId !== "none" && (
                  <>
                    <Rate label="Insulation" unit="$/sq" value={F.insulationMatPerSq} onChange={(v) => setFlat("insulationMatPerSq", v)} disabled={disabled} />
                    <Rate label="Insulation labor" unit="$/sq" value={F.insulationLaborPerSq} onChange={(v) => setFlat("insulationLaborPerSq", v)} disabled={disabled} />
                  </>
                )}
                {boards && F.coverBoardId !== "none" && (
                  <>
                    <Rate label="Cover board" unit="$/sq" value={F.coverBoardMatPerSq} onChange={(v) => setFlat("coverBoardMatPerSq", v)} disabled={disabled} />
                    <Rate label="Cover labor" unit="$/sq" value={F.coverBoardLaborPerSq} onChange={(v) => setFlat("coverBoardLaborPerSq", v)} disabled={disabled} />
                  </>
                )}
                {flatRates([
                  ...attachRates,
                  ...(rule?.method === "overburden" ? (["waterproofMat", "waterproofLabor"] as const) : []),
                  boards && (F.insulationId !== "none" || F.coverBoardId !== "none") && rule?.method !== "ballasted" && rule?.method !== "overburden" && rule?.method !== "induction" && "insFasteners",
                  boards && F.taperedSqft > 0 && "taperedMat",
                  boards && F.taperedSqft > 0 && "taperedLabor",
                  F.wetInsulationSqft > 0 && "wetIns",
                ])}
              </>
            )
          }
        >
          {surface ? (
            <Group note={<div className="bec-note">Goes over the existing roof — no tear-off, insulation or new edge metal. Core cuts confirm the roof underneath is dry; wet areas are cut out and replaced first.</div>}>
              <Check label="Primer" checked={F.primerOn} onChange={(v) => setFlat("primerOn", v)} disabled={disabled} />
              <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
              <Num label="Core cuts" unit="each" value={F.coreCuts} onChange={(v) => setFlat("coreCuts", v)} disabled={disabled} />
            </Group>
          ) : boards ? (
            <>
              <Group
                note={
                  spec.commercial.on && F.insulationId === "none" ? (
                    <div className="bec-note">A tear-off to the deck on a commercial building usually has to meet the energy code — about R-25 to R-30 of insulation.</div>
                  ) : null
                }
              >
                <Sel label="Insulation" value={F.insulationId} options={INSULATION_OPTIONS} onChange={(v) => pickBoard("insulation", v)} disabled={disabled} wide />
                <Sel label="Cover board" value={F.coverBoardId} options={COVER_BOARDS} onChange={(v) => pickBoard("cover", v)} disabled={disabled} wide />
                <Num label="Tapered & crickets" unit="sq ft" value={F.taperedSqft} onChange={(v) => setFlat("taperedSqft", v)} disabled={disabled} />
              </Group>
              <Group label="Wet areas">
                <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
              </Group>
            </>
          ) : (
            <Group note={<div className="bec-note">{rule?.method === "nailed" ? "Rolled roofing is nailed to the deck" : "A liquid-applied membrane goes on the prepared deck"} — no insulation or cover board.</div>}>
              <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
            </Group>
          )}
        </Row>

        {/* 03 · EDGES & WALLS */}
        <Row
          n="03"
          id="walls"
          title="Edges & walls"
          summary={sumWalls}
          chip={splitOff ? <span className="chip bad">check split</span> : undefined}
          open={!!open.walls}
          onToggle={() => toggle("walls")}
          rates={
            surface ? (
              <>{flatRates(["warningLine"])}</>
            ) : (
              <>{flatRates(["edgeMat", "edgeLabor", "copingMat", "copingLabor", "baseFlashMat", "baseFlashLabor", F.wallFt > 0 && "termBarMat", F.wallFt > 0 && "termBarLabor", F.wallFt > 0 && "counterMat", F.wallFt > 0 && "counterLabor", boards && F.nailersOn && "nailerMat", boards && F.nailersOn && "nailerLabor", "warningLine"])}</>
            )
          }
        >
          <Group
            note={
              <div className="bec-note">
                {perimeterFt > 0 ? `Outline perimeter ${fmt(perimeterFt)} ft — parapet plus open edge should add up to it. ` : "No outline perimeter — enter the lengths from the photo. "}
                {surface ? "A coating keeps the existing edge metal and coping; these lengths still size the fall protection." : "Coping caps the parapets; ES-1 edge metal finishes the open edges; wall flashing is wherever the roof meets a taller wall."}
              </div>
            }
          >
            <Num label="Perimeter" unit="ft" value={perimeterFt} onChange={(v) => setSpec((prev) => ({ ...prev, eaveFt: v, rakeFt: 0, edgesBasis: "entered" }))} disabled={disabled} />
            <Num label="Parapet" unit="ft" value={F.parapetFt} onChange={(v) => setFlat("parapetFt", v)} disabled={disabled} />
            <Num label="Parapet height" unit="in" value={F.parapetHeightIn} onChange={(v) => setFlat("parapetHeightIn", v)} disabled={disabled} />
            <Num label="Open edge" unit="ft" value={F.edgeMetalFt} onChange={(v) => setFlat("edgeMetalFt", v)} disabled={disabled} />
            {!surface && <Num label="Wall flashing" unit="ft" value={F.wallFt} onChange={(v) => setFlat("wallFt", v)} disabled={disabled} />}
            {boards && !surface && <Check label="Wood nailers to insulation height" checked={F.nailersOn} onChange={(v) => setFlat("nailersOn", v)} disabled={disabled} />}
          </Group>
        </Row>

        {/* 04 · DRAINS & PENETRATIONS */}
        <Row
          n="04"
          id="drains"
          title="Drains & curbs"
          summary={sumDrains}
          open={!!open.drains}
          onToggle={() => toggle("drains")}
          rates={
            <>
              {flatRates([
                !surface && F.drains > 0 && (F.drainWork === "new" ? "drainNewMat" : F.drainWork === "ring" ? "drainRingMat" : "drainInsertMat"),
                !surface && F.drains > 0 && (F.drainWork === "new" ? "drainNewLabor" : F.drainWork === "ring" ? "drainRingLabor" : "drainInsertLabor"),
                !surface && F.drains > 0 && F.secondary === "scupper" && "overflowScupperMat",
                !surface && F.drains > 0 && F.secondary === "scupper" && "overflowScupperLabor",
                !surface && F.drains > 0 && F.secondary === "drain" && "overflowDrainMat",
                !surface && F.drains > 0 && F.secondary === "drain" && "overflowDrainLabor",
                F.scuppers > 0 && "scupperMat",
                F.scuppers > 0 && "scupperLabor",
                F.gutterFt > 0 && "gutterMat",
                F.gutterFt > 0 && "gutterLabor",
                "bootMat",
                "bootLabor",
                F.pitchPockets > 0 && "pocketMat",
                F.pitchPockets > 0 && "pocketLabor",
                !surface && F.rtuCount > 0 && "rtuMat",
                !surface && F.rtuCount > 0 && "rtuLabor",
                F.rtuResetCount > 0 && "rtuReset",
                !surface && F.curbs > 0 && "curbMat",
                !surface && F.curbs > 0 && "curbLabor",
              ])}
            </>
          }
        >
          {!surface && (
            <Group label="Drains">
              <Num label="Roof drains" unit="each" value={F.drains} onChange={(v) => setFlat("drains", Math.round(v))} disabled={disabled} />
              <Sel label="Drain work" value={F.drainWork} options={DRAIN_WORK} onChange={(v) => setFlat("drainWork", v as DrainWork)} disabled={disabled} wide />
              <Sel label="Overflow" value={F.secondary} options={SECONDARY_DRAINAGE} onChange={(v) => setFlat("secondary", v as SecondaryDrainage)} disabled={disabled} />
            </Group>
          )}
          <Group label="Scuppers & gutters">
            <Num label="Thru-wall scuppers" unit="each" value={F.scuppers} onChange={(v) => setFlat("scuppers", Math.round(v))} disabled={disabled} />
            <Num label="Gutter" unit="ft" value={F.gutterFt} onChange={(v) => setFlat("gutterFt", v)} disabled={disabled} />
          </Group>
          <Group
            label="Penetrations & curbs"
            note={surface ? <div className="bec-note">A coating details drains and curbs with fabric and coating — no new drains or curb flashing are priced.</div> : null}
          >
            <Num label="Pipe boots" unit="each" value={F.pipeBoots} onChange={(v) => setFlat("pipeBoots", Math.round(v))} disabled={disabled} />
            <Num label="Pitch pockets" unit="each" value={F.pitchPockets} onChange={(v) => setFlat("pitchPockets", Math.round(v))} disabled={disabled} />
            {!surface && <Num label="Rooftop units" unit="each" value={F.rtuCount} onChange={(v) => setFlat("rtuCount", Math.round(v))} disabled={disabled} />}
            <Num label="Units raised & reset" unit="each" value={F.rtuResetCount} onChange={(v) => setFlat("rtuResetCount", Math.round(v))} disabled={disabled} />
            {!surface && <Num label="Skylights, hatches, curbs" unit="each" value={F.curbs} onChange={(v) => setFlat("curbs", Math.round(v))} disabled={disabled} />}
          </Group>
        </Row>

        {/* 05 · ROOFTOP, ACCESS & WARRANTY */}
        <Row
          n="05"
          id="rooftop"
          title="Access & warranty"
          summary={sumRooftop}
          open={!!open.rooftop}
          onToggle={() => toggle("rooftop")}
          rates={
            <>
              {flatRates([
                F.walkwayFt > 0 && "walkwayMat",
                F.walkwayFt > 0 && "walkwayLabor",
                F.craneHours > 0 && "craneRate",
                F.craneHours > 0 && "craneMob",
                F.craneHours <= 0 && F.hoistOn && "hoist",
                !surface && F.coreCuts > 0 && "coreEach",
                rule?.method === "torch" && "fireWatch",
                rule?.method === "hot" && "kettle",
                !surface && spec.tearOffLayers > 0 && "nightSeal",
              ])}
              {F.warrantyId !== "none" && (
                <>
                  <Rate label="Warranty fee" unit="$/sq" value={F.warrantyPerSq} onChange={(v) => setFlat("warrantyPerSq", v)} disabled={disabled} />
                  {flatRates(["warrantyInspection"])}
                </>
              )}
            </>
          }
        >
          <Group label="Access">
            <Num label="Walkway pads" unit="ft" value={F.walkwayFt} onChange={(v) => setFlat("walkwayFt", v)} disabled={disabled} />
            <Num label="Crane" unit="hours" value={F.craneHours} onChange={(v) => setFlat("craneHours", v)} disabled={disabled} />
            {F.craneHours <= 0 && <Check label="Ladder hoist / conveyor" checked={F.hoistOn} onChange={(v) => setFlat("hoistOn", v)} disabled={disabled} />}
            {!surface && <Num label="Core cuts" unit="each" value={F.coreCuts} onChange={(v) => setFlat("coreCuts", Math.round(v))} disabled={disabled} />}
          </Group>
          <Group label="Warranty & pace">
            <Sel label="Warranty" value={F.warrantyId} options={WARRANTIES} onChange={pickWarranty} disabled={disabled} wide />
            <Num label="Squares per day" unit="sq" value={F.productionSqPerDay} onChange={(v) => setFlat("productionSqPerDay", Math.max(1, v))} disabled={disabled} />
          </Group>
        </Row>

        {/* 06 · TEAR-OFF & EXTRAS */}
        <Row
          n="06"
          id="flatTear"
          title="Tear-off & extras"
          summary={sumFlatTear}
          open={!!open.flatTear}
          onToggle={() => toggle("flatTear")}
          rates={
            <>
              {!surface && spec.tearOffLayers > 0 && (
                <>
                  <Rate label="Tear-off labor" unit="$/sq·layer" value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />
                  <Rate label="Disposal" unit="$/sq·layer" value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />
                  {F.existing === "bur_gravel" && flatRates(["gravelVac"])}
                </>
              )}
              <Rate label="Deck sheet" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />
              <Rate label="Sheet labor" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />
            </>
          }
        >
          <Group note={spec.commercial.on ? <div className="bec-note">The permit is priced on the job value in 07 · Commercial job.</div> : null}>
            {!surface && (
              <>
                <Sel label="Existing roof" value={F.existing} options={EXISTING_LOW_SLOPE} onChange={(v) => pickExisting(v as ExistingLowSlope)} disabled={disabled} wide />
                <Sel
                  label="Layers"
                  value={String(spec.tearOffLayers)}
                  options={[
                    { id: "0", label: "Recover (none)" },
                    { id: "1", label: "1 layer" },
                    { id: "2", label: "2 layers" },
                    { id: "3", label: "3 layers" },
                  ]}
                  onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)}
                  disabled={disabled}
                />
              </>
            )}
            <Num label="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
            <Num label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
            {!spec.commercial.on && <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />}
          </Group>
        </Row>

          </>
        )}

        {/* 07 · COMMERCIAL JOB — either kind of roof */}
        <Row
          n="07"
          id="commercial"
          title="Commercial job"
          summary={sumCommercial}
          chip={C.on ? <span className="chip ok">commercial</span> : undefined}
          open={!!open.commercial}
          onToggle={() => toggle("commercial")}
          rates={C.on ? <>{commercialRates(["gcPct", "insurancePct", facts.squares < 30 ? "mobSmall" : "mob", "safetyPlan", "asbestos", "superRate", ...(C.occupied ? (["interior"] as const) : []), ...(C.shift === "night" ? (["lightTower"] as const) : []), ...(C.wage === "prevailing" ? (["payroll"] as const) : []), "permitBase", "permitPct", "permitMin"])}</> : undefined}
        >
          <Group
            note={
              <div className="bec-note">
                {C.on
                  ? `${prod < 1 ? `Field install labor ×${prod} at ${fmt(facts.squares)} squares — a big deck goes down faster per square. ` : ""}Adds mobilization, a safety plan${spec.tearOffLayers > 0 ? ", the asbestos survey before tear-off" : ""}${facts.squares >= 50 ? ", a superintendent" : ""}, a permit on the job value, and general conditions & insurance on everything except the at-cost fees.`
                  : "Priced as residential. Turn this on for a store, warehouse, school or apartment building."}
              </div>
            }
          >
            <Check label="Price as a commercial job" checked={C.on} onChange={toggleCommercial} disabled={disabled} />
            {C.on && (
              <>
                <Sel label="Labor" value={C.wage} options={WAGE_REGIMES} onChange={(v) => setCommercial("wage", v as WageRegime)} disabled={disabled} />
                <Sel label="Schedule" value={C.shift} options={SHIFTS} onChange={(v) => setCommercial("shift", v as Shift)} disabled={disabled} wide />
                <Num label="Stories" unit="floors" value={C.stories} onChange={(v) => setCommercial("stories", Math.max(1, Math.round(v)))} disabled={disabled} />
                <Check label="Occupied during work" checked={C.occupied} onChange={(v) => setCommercial("occupied", v)} disabled={disabled} />
                <Check label="Payment & performance bond" checked={C.bondOn} onChange={(v) => setCommercial("bondOn", v)} disabled={disabled} />
              </>
            )}
          </Group>
        </Row>

        {/* 08 · CUSTOM LINES */}
        <Row n="08" id="custom" title="Custom lines" summary={sumCustom} open={!!open.custom} onToggle={() => toggle("custom")}>
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
            {source === "loading" ? "Loading company defaults…" : source === "org" ? "Company defaults" : "Browser defaults"}
            {dirty && source !== "loading" ? <em> · unsaved</em> : null}
          </span>
          <button
            type="button"
            className={"btn btn-ghost bec-btn bec-btn--sm" + (dirty ? " is-dirty" : "")}
            disabled={disabled}
            onClick={() => void saveDefaults()}
          >
            {saving ? "Saving…" : "Save as defaults"}
          </button>
        </div>
        <div className="bec-foot-r">
          <span className="bec-foot-v">{needsPitch ? "—" : money(total)}</span>
          {convertBtn}
        </div>
      </div>
      {saveError && <p className="bec-save-error" role="alert">{saveError}</p>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CARD
// ═══════════════════════════════════════════════════════════════════════════
export default function BuildEstimateCardC({
  isRecon,
  buildMode,
  onBuildMode,
  waste,
  onWaste,
  wasteOptions,
  caution,
  pitchEntry,
  generate,
  facts,
  builderDisabled,
  converting,
  onBuild,
  onConvert,
  report,
  output,
  onBuildingUse,
}: BuildEstimateCardProps) {
  const needsPitch = !!pitchEntry && !pitchEntry.value;
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
      {needsPitch && <p className="bec-note bec-pitch-help">Enter pitch to price.</p>}
    </div>
  ) : null;

  const reason = generate.disabled && generate.reason ? generate.reason : null;

  return (
    <div className="card bec" data-build-card="c" data-mode={buildMode}>
      <div className="bec-head">
        <div className="bec-head-l">
          <div className="card-title">Build an estimate</div>
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

      {caution && (
        <div className="bec-caution" role="note">
          <p><strong>{caution.stamp}.</strong> {caution.text}</p>
          {caution.action && (
            <button type="button" className="bec-caution-action" onClick={caution.action.onClick}>
              {caution.action.label}
            </button>
          )}
        </div>
      )}
      {isRecon && (
        <div className="bec-empty">
          These figures are estimated from aerial imagery, so they can’t be priced. Run <b>Instant measure</b> for this address to build a quote.
        </div>
      )}

      {buildMode === "package" ? (
        !isRecon && facts ? (
          <PackageLedger facts={facts} disabled={builderDisabled} converting={converting} onBuild={onBuild} onConvert={onConvert} lead={pitchSel} needsPitch={needsPitch} report={report} onBuildingUse={onBuildingUse} />
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
            {reason ??
              (facts?.existingMaterial && likeForLikeFamily(facts)
                ? `Existing roof: ${facts.existingMaterial}. Drafts a like-for-like package from the measured figures — every line stays editable below.`
                : "Drafts the full package from the measured figures — every line stays editable below.")}
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
