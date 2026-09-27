"use client";

// VARIANT F of the "Build an estimate" card — the 2026-09-26 high-contrast
// round, reached at /dashboard/roof-estimator?builder=f (and on the sample
// house at /dashboard/roof-estimator/card-preview?builder=f).
//
// THE OPEN FORM SHEET. Nothing folds. Every part of the roof is a short
// section of one sheet, always in view: a bold ink title in the left margin,
// the section's fields beside it, a continuous ink rule between sections.
// The contractor reads the whole roof top to bottom without opening a row.
//
//   HEAD    the card title, one plain line on what to do, the mode switch.
//   SHEET   roof system · underlayment · edges · flashing · vents · tear-off
//           (a flat roof swaps rows 2–6 for its own five) · commercial job ·
//           custom lines. Field labels are full ink, bold, uppercase; every
//           control is framed in ink at a 44px height.
//   RATES   the contractor's prices change rarely, so they sit behind ONE
//           disclosure at the foot of the sheet — grouped under the same
//           section names — beside Save as defaults. A "Custom…" pick (drip
//           edge profile, valley type, step size) shows its price inline,
//           because that is the moment a price has to be typed.
//   BAR     the total and Convert, sticky at the bottom of the screen while
//           the sheet scrolls, landing at the foot of the sheet at its end.
//
// Functionality is variant C's (build-estimate-card-c.tsx), copied: the state
// block, the helpers, the catalog load and save, the localStorage keys, the
// entry cap, the list editors, every row (flat, commercial, custom), the
// report order / check, the pitch and waiting states. Only markup, copy and
// CSS are new. The one state this card adds is the rates disclosure.

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
  displayPitch12,
  FASCIA_OPTIONS,
  GUTTER_PLANS,
  type FasciaRun,
  type GutterPlan,
} from "@/lib/roofPackage/catalog";
import {
  buildRoofPackage,
  checkVentilation,
  defaultSpec,
  estimateEdges,
  fasciaFeet,
  gutterFeet,
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
import "./build-estimate-card-f.css";

// ── Icons: the shell sprite for file / board / bulb; these three inline ──
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
const IcChev = () => (
  <svg className="ic rbf-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// ── Field primitives ──

/** The house dropdown (advanced-ai-blueprint/blueprint-select) drawn by this
 *  card's stylesheet. Its option LIST is portalled into `.content`, so the list
 *  rules in build-estimate-card-f.css are scoped to `.content`, not `.rbf`. */
const SEL_STYLES: SelectStyles = {
  bsel: "rbf-sel",
  "bsel-btn": "rbf-sel-btn",
  "bsel-val": "rbf-sel-val",
  "bsel-caret": "rbf-sel-caret",
  "bsel-list": "rbf-sel-list",
  "bsel-opt": "rbf-sel-opt",
};

/** Field widths. Desk: a number 156px, a select 208px, sm 164px, md 244px,
 *  wide 336px. Handheld: numbers and sm pair up two to a line; every other
 *  select takes the whole line, so a long pick never wraps in half a line. */
type FieldSize = "sm" | "md" | "wide";
const fieldCls = (size?: FieldSize, extra?: string) => "rbf-f" + (extra ? ` ${extra}` : "") + (size ? ` rbf-f--${size}` : "");

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
  size,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  disabled?: boolean;
  min?: number;
  /** Accessible name when the visible label is hidden or too short to stand alone. */
  aria?: string;
  size?: FieldSize;
  className?: string;
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
    <label className={fieldCls(size, className)}>
      {label && <span className="rbf-lbl">{label}</span>}
      <span className={"rbf-in" + (disabled ? " is-disabled" : "")}>
        <input
          className="rbf-input"
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
        {unit && <span className="rbf-unit">{unit}</span>}
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
  size,
  aria,
  id,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: FieldSize;
  aria?: string;
  id?: string;
}) {
  return (
    <div className={fieldCls(size, "rbf-f--sel")}>
      {/* The combobox carries the same words as its accessible name. */}
      {label && (
        <span className="rbf-lbl" aria-hidden="true">
          {label}
        </span>
      )}
      <BlueprintSelect
        id={id}
        value={value}
        onChange={(v) => onChange(v as T)}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        placeholder=""
        ariaLabel={label || aria || ""}
        disabled={disabled}
        styles={SEL_STYLES}
      />
    </div>
  );
}

/** Where the fascia runs. Gutters hang on the eaves, so that is the default. */
const FASCIA_RUNS = [
  { id: "eaves" as const, label: "Eaves" },
  { id: "eaves_rakes" as const, label: "Eaves + rakes" },
  { id: "custom" as const, label: "A length I enter" },
];

/** A drawn checkbox: a square ink box and the tick; the native input stays
 *  for the keyboard and screen readers. */
function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={"rbf-check" + (checked ? " is-on" : "") + (disabled ? " is-off" : "")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="rbf-box" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      <span className="rbf-check-t">{label}</span>
    </label>
  );
}

/** One of the contractor's rates: a labelled field that carries its unit. */
function Rate({ label, unit, value, onChange, disabled }: { label: string; unit: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return <Num label={label} aria={`${label} rate`} unit={unit} value={value} onChange={onChange} disabled={disabled} />;
}

type Tone = "ok" | "warn" | "bad" | "ink";
function Stamp({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`rbf-stamp rbf-stamp--${tone}`}>{children}</span>;
}

/** A section of the sheet: its title (and state) in the left margin, the
 *  fields beside it, an ink rule above. */
function Sec({
  id,
  title,
  stamp,
  caption,
  wide,
  children,
}: {
  id: string;
  title: string;
  stamp?: React.ReactNode;
  caption?: React.ReactNode;
  /** The title goes above and the body takes the card's whole width (a list editor's table). */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const hid = React.useId();
  return (
    <section className={`rbf-block rbf-sec rbf-sec--${id}` + (wide ? " is-wide" : "")} aria-labelledby={hid}>
      <div className="rbf-sec-h">
        <h3 className="rbf-sec-t" id={hid}>
          {title}
        </h3>
        {stamp}
        {caption ? <p className="rbf-sec-cap">{caption}</p> : null}
      </div>
      <div className="rbf-sec-b">{children}</div>
    </section>
  );
}

/** A row of fields that wraps; controls line up on one floor. */
function Fields({ children }: { children: React.ReactNode }) {
  return <div className="rbf-fields">{children}</div>;
}

/** A named line of a section (Valleys, Pipe boots…): the name, then its fields. */
function Grp({ title, children, note }: { title: React.ReactNode; children?: React.ReactNode; note?: React.ReactNode }) {
  const has = React.Children.toArray(children).length > 0;
  return (
    <div className="rbf-grp">
      <div className="rbf-grp-t">{title}</div>
      <div className="rbf-grp-b">
        {has && <div className="rbf-fields">{children}</div>}
        {note}
      </div>
    </div>
  );
}

/** An option that is on or off (Drip edge, Replace fascia…): the checkbox,
 *  and under it the fields it brings with it. */
function Opt({ check, children, note }: { check: React.ReactNode; children?: React.ReactNode; note?: React.ReactNode }) {
  const has = React.Children.toArray(children).length > 0;
  return (
    <div className="rbf-opt">
      {check}
      {(has || note) && (
        <div className="rbf-opt-b">
          {has && <div className="rbf-fields">{children}</div>}
          {note}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PACKAGE SHEET — every section, the rates, the bar. Owns the builder state.
// ═══════════════════════════════════════════════════════════════════════════
function PackageSheet({
  facts,
  onBuild,
  onConvert,
  report,
  disabled: incomingDisabled,
  converting,
  lead,
  needsPitch = false,
  blockedReason = "Enter pitch to price.",
  onBuildingUse,
}: {
  facts: RoofFacts;
  onBuildingUse?: (use: "residential" | "commercial") => void;
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  onConvert: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  report?: ReportProp | null;
  disabled?: boolean;
  converting?: boolean;
  /** The pitch section, when the aerial data carried no pitch: it leads the sheet. */
  lead?: React.ReactNode;
  needsPitch?: boolean;
  /** Why nothing is priced while `needsPitch`: the pitch, or packs still on the way. */
  blockedReason?: string;
}) {
  // ── State, effects, handlers and derived values: verbatim from
  //    build-estimate-card-c.tsx (itself from roof-package-builder.tsx). ──
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
  /** A fascia board carries its own two rates; picking one seeds both. */
  const pickFascia = (id: string) => {
    const f = FASCIA_OPTIONS.find((x) => x.id === id);
    if (!f) return;
    set("fasciaOptionId", f.id);
    set("fasciaPerFt", f.perFt);
    set("fasciaLaborPerFt", f.laborPerFt);
  };
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
  /** A roof-system rate edit is a catalog edit: it lands on the system's row,
   *  so the roof type list, the next roof and "Save as defaults" all see it. */
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
  // ── end of the verbatim block ──

  // Nothing folds on this sheet; the one thing that opens is the rates.
  const [ratesOpen, setRatesOpen] = React.useState(false);
  const ratesId = React.useId();

  // The DISPLAYED pitch, the same number the package prices on
  // (catalog.displayPitch12) — a roof this card calls 8/12 is charged as 8/12.
  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, displayPitch12(f.pitch12)), 0);
  const lowSlope = spec.systemFamily === "low-slope";
  const noStarter = lowSlope || spec.systemFamily === "metal";

  // ── The flat roof ──
  const F = spec.flat;
  const rule = lowSlope ? lowSlopeRule(spec.systemId, spec.systemName) : null;
  const boards = rule ? takesBoards(rule) : false;
  const surface = rule ? isSurfaceApplied(rule) : false;
  const perimeterFt = Math.max(0, spec.eaveFt + spec.rakeFt);
  const splitOff = perimeterFt > 0 && Math.abs(F.parapetFt + F.edgeMetalFt - perimeterFt) > 0.1 * perimeterFt;
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
  const commercialRates = (keys: CommercialRateKey[]) =>
    keys.map((k) => (
      <Rate key={k} label={COMMERCIAL_RATE_DEFS[k].label} unit={COMMERCIAL_RATE_DEFS[k].unit} value={cRate(C, k)} onChange={(v) => setCommercialRate(k, v)} disabled={disabled} />
    ));
  const roofIsFlat = isFlatRoof(facts);

  const ventsOn = VENT_TYPES.filter((t) => ventOf(t.id).qty > 0);
  const ventsToAdd = VENT_TYPES.filter((t) => ventOf(t.id).qty <= 0);
  const edgeEstimated = spec.edgesBasis === "estimated";
  const edgeMeasured = spec.edgesBasis === "measured";
  const lineCount = pkg.materials.length + pkg.labor.length;

  // ── The rates, grouped under the section that uses them (C's margin
  //    columns, one group each). A group with nothing to price is left out. ──
  const rt = (k: string, label: string, unit: string, value: number, onChange: (n: number) => void) => (
    <Rate key={k} label={label} unit={unit} value={value} onChange={onChange} disabled={disabled} />
  );
  const rateGroups: { id: string; title: string; rates: React.ReactNode[] }[] = [];
  // The roof type list shows the system's prices while it is open, so the
  // group steps aside for it (as C's margin column did).
  if (manage !== "systems") {
    rateGroups.push({
      id: "system",
      title: "Roof system",
      rates: [
        rt("mat", "Material", "$/sq", spec.systemMatPerSq, (v) => setSystemRate("matPerSq", v)),
        rt("lab", "Install labor", "$/sq", spec.systemLaborPerSq, (v) => setSystemRate("laborPerSq", v)),
        ...(!lowSlope ? [rt("cap", "Hip & ridge cap", "$/ft", spec.capPerFt, (v) => setSystemRate("capPerFt", v))] : []),
      ],
    });
  }
  if (!lowSlope) {
    if (manage !== "underlayments") {
      rateGroups.push({
        id: "under",
        title: "Underlayment",
        rates: [
          rt("und", "Underlayment", "$/sq", spec.underlaymentPerSq, (v) => set("underlaymentPerSq", v)),
          ...(spec.iceWater !== "none" ? [rt("ice", "Ice & water", "$/sq ft", spec.iceWaterPerSqft, (v) => set("iceWaterPerSqft", v))] : []),
        ],
      });
    }
    rateGroups.push({
      id: "edges",
      title: "Edges",
      rates: [
        ...(spec.dripEdgeOn ? [rt("drip", "Drip edge", "$/ft", spec.dripPerFt, (v) => set("dripPerFt", v))] : []),
        ...(!noStarter && spec.starterOn ? [rt("starter", "Starter strip", "$/ft", spec.starterPerFt, (v) => set("starterPerFt", v))] : []),
        ...(spec.fasciaOn
          ? [
              rt("fascia", "Fascia board", "$/ft", spec.fasciaPerFt, (v) => set("fasciaPerFt", v)),
              rt("fasciaLabor", "Fascia labor", "$/ft", spec.fasciaLaborPerFt, (v) => set("fasciaLaborPerFt", v)),
            ]
          : []),
        ...(spec.fasciaOn && spec.gutterPlan !== "none"
          ? [
              rt(
                "gutter",
                spec.gutterPlan === "replace" ? "New gutter" : "Gutter reset",
                "$/ft",
                spec.gutterPlan === "replace" ? spec.gutterPerFt : spec.gutterResetPerFt,
                (v) => set(spec.gutterPlan === "replace" ? "gutterPerFt" : "gutterResetPerFt", v),
              ),
            ]
          : []),
      ],
    });
    rateGroups.push({
      id: "flash",
      title: "Flashing",
      rates: [
        rt("valleyMat", "Valley metal", "$/ft", spec.valleyMatPerFt, (v) => set("valleyMatPerFt", v)),
        rt("valleyLabor", "Valley labor", "$/ft", spec.valleyLaborPerFt, (v) => set("valleyLaborPerFt", v)),
        rt("step", "Step piece", "$/ea", spec.stepPerPiece, (v) => set("stepPerPiece", v)),
        rt("stepLabor", "Step labor", "$/ft", spec.stepLaborPerFt, (v) => set("stepLaborPerFt", v)),
        rt("apron", "Apron", "$/ft", spec.apronPerFt, (v) => set("apronPerFt", v)),
        rt("apronLabor", "Apron labor", "$/ft", spec.apronLaborPerFt, (v) => set("apronLaborPerFt", v)),
        rt("counter", "Counter", "$/ft", spec.counterPerFt, (v) => set("counterPerFt", v)),
        rt("counterLabor", "Counter labor", "$/ft", spec.counterLaborPerFt, (v) => set("counterLaborPerFt", v)),
        rt("chimney", "Chimney kit", "$/ea", spec.chimneyEach, (v) => set("chimneyEach", v)),
        rt("chimneyLabor", "Chimney labor", "$/ea", spec.chimneyLabor, (v) => set("chimneyLabor", v)),
        rt("curb", "Curb kit", "$/ea", spec.curbEach, (v) => set("curbEach", v)),
        rt("curbLabor", "Curb labor", "$/ea", spec.curbLabor, (v) => set("curbLabor", v)),
      ],
    });
    rateGroups.push({
      id: "tear",
      title: "Tear-off & extras",
      rates: [
        rt("tear", "Tear-off labor", "$/sq·layer", spec.tearOffPerSqLayer, (v) => set("tearOffPerSqLayer", v)),
        rt("disposal", "Disposal", "$/sq·layer", spec.disposalPerSqLayer, (v) => set("disposalPerSqLayer", v)),
        rt("deck", "Deck sheet", "$/ea", spec.plywoodEach, (v) => set("plywoodEach", v)),
        rt("deckLabor", "Sheet labor", "$/ea", spec.plywoodLabor, (v) => set("plywoodLabor", v)),
        rt("nails", "Nails & fasteners", "$/sq", spec.nailsPerSq, (v) => set("nailsPerSq", v)),
        rt("sealant", "Sealant & collars", "$/sq", spec.sealantPerSq, (v) => set("sealantPerSq", v)),
      ],
    });
  } else {
    rateGroups.push({
      id: "boards",
      title: surface ? "Surface prep" : "Insulation",
      rates: surface
        ? flatRates(["washMat", "washLabor", "repairMat", "repairLabor", F.primerOn && "primerCoatMat", F.primerOn && "primerCoatLabor", "wetIns", "coreEach"])
        : [
            ...(boards && F.insulationId !== "none"
              ? [
                  rt("ins", "Insulation", "$/sq", F.insulationMatPerSq, (v) => setFlat("insulationMatPerSq", v)),
                  rt("insLabor", "Insulation labor", "$/sq", F.insulationLaborPerSq, (v) => setFlat("insulationLaborPerSq", v)),
                ]
              : []),
            ...(boards && F.coverBoardId !== "none"
              ? [
                  rt("cover", "Cover board", "$/sq", F.coverBoardMatPerSq, (v) => setFlat("coverBoardMatPerSq", v)),
                  rt("coverLabor", "Cover labor", "$/sq", F.coverBoardLaborPerSq, (v) => setFlat("coverBoardLaborPerSq", v)),
                ]
              : []),
            ...flatRates([
              ...attachRates,
              ...(rule?.method === "overburden" ? (["waterproofMat", "waterproofLabor"] as const) : []),
              boards && (F.insulationId !== "none" || F.coverBoardId !== "none") && rule?.method !== "ballasted" && rule?.method !== "overburden" && rule?.method !== "induction" && "insFasteners",
              boards && F.taperedSqft > 0 && "taperedMat",
              boards && F.taperedSqft > 0 && "taperedLabor",
              F.wetInsulationSqft > 0 && "wetIns",
            ]),
          ],
    });
    rateGroups.push({
      id: "walls",
      title: "Edges & walls",
      rates: surface
        ? flatRates(["warningLine"])
        : flatRates(["edgeMat", "edgeLabor", "copingMat", "copingLabor", "baseFlashMat", "baseFlashLabor", F.wallFt > 0 && "termBarMat", F.wallFt > 0 && "termBarLabor", F.wallFt > 0 && "counterMat", F.wallFt > 0 && "counterLabor", boards && F.nailersOn && "nailerMat", boards && F.nailersOn && "nailerLabor", "warningLine"]),
    });
    rateGroups.push({
      id: "drains",
      title: "Drains & curbs",
      rates: flatRates([
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
      ]),
    });
    rateGroups.push({
      id: "rooftop",
      title: "Access & warranty",
      rates: [
        ...flatRates([
          F.walkwayFt > 0 && "walkwayMat",
          F.walkwayFt > 0 && "walkwayLabor",
          F.craneHours > 0 && "craneRate",
          F.craneHours > 0 && "craneMob",
          F.craneHours <= 0 && F.hoistOn && "hoist",
          !surface && F.coreCuts > 0 && "coreEach",
          rule?.method === "torch" && "fireWatch",
          rule?.method === "hot" && "kettle",
          !surface && spec.tearOffLayers > 0 && "nightSeal",
        ]),
        ...(F.warrantyId !== "none"
          ? [rt("warranty", "Warranty fee", "$/sq", F.warrantyPerSq, (v) => setFlat("warrantyPerSq", v)), ...flatRates(["warrantyInspection"])]
          : []),
      ],
    });
    rateGroups.push({
      id: "flatTear",
      title: "Tear-off & extras",
      rates: [
        ...(!surface && spec.tearOffLayers > 0
          ? [
              rt("tear", "Tear-off labor", "$/sq·layer", spec.tearOffPerSqLayer, (v) => set("tearOffPerSqLayer", v)),
              rt("disposal", "Disposal", "$/sq·layer", spec.disposalPerSqLayer, (v) => set("disposalPerSqLayer", v)),
              ...(F.existing === "bur_gravel" ? flatRates(["gravelVac"]) : []),
            ]
          : []),
        rt("deck", "Deck sheet", "$/ea", spec.plywoodEach, (v) => set("plywoodEach", v)),
        rt("deckLabor", "Sheet labor", "$/ea", spec.plywoodLabor, (v) => set("plywoodLabor", v)),
      ],
    });
  }
  if (C.on) {
    rateGroups.push({
      id: "commercial",
      title: "Commercial job",
      rates: commercialRates([
        "gcPct",
        "insurancePct",
        facts.squares < 30 ? "mobSmall" : "mob",
        "safetyPlan",
        "asbestos",
        "superRate",
        ...(C.occupied ? (["interior"] as const) : []),
        ...(C.shift === "night" ? (["lightTower"] as const) : []),
        ...(C.wage === "prevailing" ? (["payroll"] as const) : []),
        "permitBase",
        "permitPct",
        "permitMin",
      ]),
    });
  }

  const reviewBtn = (extra: string) => (
    <button
      type="button"
      className={"btn btn-ghost rbf-btn " + extra}
      disabled={disabled || needsPitch}
      data-blocked={needsPitch ? blockedReason : undefined}
      onClick={() => onBuild(pkg, spec)}
      title={needsPitch ? "Enter pitch to price." : "Fill the estimate tables below to review and adjust before converting"}
    >
      <svg className="ic" aria-hidden="true">
        <use href="#i-board" />
      </svg>
      Review {lineCount} lines
    </button>
  );
  const split = (extra: string) => (
    <dl className={"rbf-split " + extra}>
      <div>
        <dt>Materials</dt>
        <dd>{needsPitch ? "—" : money(materialsTotal)}</dd>
      </div>
      <div>
        <dt>Labor</dt>
        <dd>{needsPitch ? "—" : money(total - materialsTotal)}</dd>
      </div>
    </dl>
  );

  return (
    <>
      {lead}

      {/* ROOF SYSTEM */}
      <Sec
        id="system"
        title="Roof system"
        wide={manage === "systems"}
        caption={manage === "systems" ? "Editing your roof types. Save as defaults keeps the list for everyone." : undefined}
      >
        {manage === "systems" ? (
          <div className="rbf-tbl">
            <div className="rbf-tr rbf-tr--sys rbf-th" aria-hidden="true">
              <span>Roof type</span>
              <span>Family</span>
              <span>Material</span>
              <span>Labor</span>
              <span>Waste</span>
              <span>Cap</span>
              <span />
            </div>
            {lists.systems.filter((x) => x.family === spec.systemFamily).map((s) => (
              <div className="rbf-tr rbf-tr--sys" key={s.id}>
                <label className="rbf-f rbf-tn">
                  <span className="rbf-lbl">Roof type</span>
                  <span className={"rbf-in" + (disabled ? " is-disabled" : "")}>
                    <input className="rbf-input" value={s.label} disabled={disabled} aria-label="Roof type name" onChange={(e) => patchSystem(s.id, { label: e.target.value })} />
                  </span>
                </label>
                <Sel label="Family" value={s.family} options={ROOF_FAMILIES} onChange={(v) => patchSystem(s.id, { family: v as RoofFamily })} disabled={disabled} />
                <Num label="Material" aria="Material $/sq" unit="$/sq" value={s.matPerSq} onChange={(n) => patchSystem(s.id, { matPerSq: n })} disabled={disabled} />
                <Num label="Labor" aria="Labor $/sq" unit="$/sq" value={s.laborPerSq} onChange={(n) => patchSystem(s.id, { laborPerSq: n })} disabled={disabled} />
                <Num label="Waste" aria="Waste %" unit="%" value={s.wastePct} onChange={(n) => patchSystem(s.id, { wastePct: n })} disabled={disabled} />
                <Num label="Cap" aria="Cap $/ft" unit="$/ft" value={s.capPerFt} onChange={(n) => patchSystem(s.id, { capPerFt: n })} disabled={disabled} />
                <button
                  type="button"
                  className="rbf-x"
                  disabled={disabled || lists.systems.length <= 1 || s.id === spec.systemId}
                  aria-label={`Remove ${s.label}`}
                  title={s.id === spec.systemId ? "In use on this estimate — pick another system first" : "Remove"}
                  onClick={() => removeSystem(s.id)}
                >
                  <IcX />
                </button>
              </div>
            ))}
            <div className="rbf-add">
              <button type="button" className="btn btn-ghost rbf-btn" disabled={disabled} onClick={addSystem}>
                <IcPlus />
                Roof type
              </button>
              <button type="button" className="rbf-link" disabled={disabled} onClick={resetLists}>
                Restore built-in list
              </button>
              <button type="button" className="btn btn-ghost rbf-btn rbf-done" onClick={() => setManage(null)}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <Fields>
              <Sel
                label="Roof type"
                value={spec.systemFamily}
                options={ROOF_FAMILIES.filter((f) => f.id === spec.systemFamily || lists.systems.some((x) => x.family === f.id))}
                onChange={(v) => pickFamily(v as RoofFamily)}
                disabled={disabled}
                size="md"
              />
              <Sel
                label="System"
                value={spec.systemId}
                options={[...lists.systems.filter((x) => x.family === spec.systemFamily || x.id === spec.systemId), { id: CUSTOM_SYSTEM, label: lowSlope ? "＋ Custom flat system…" : "＋ Custom roof type…" }]}
                onChange={(id) => (id === CUSTOM_SYSTEM ? addSystem() : pickSystem(id))}
                disabled={disabled}
                size="wide"
              />
              <Sel label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} size="sm" />
            </Fields>
            <div className="rbf-after">
              {lowSlope ? (
                <p className="rbf-note">
                  {roofIsFlat
                    ? `Flat roof${facts.existingMaterial ? ` · existing ${facts.existingMaterial.toLowerCase()}` : ""} · priced as a full assembly.`
                    : "Priced as a full flat-roof assembly."}
                </p>
              ) : roofIsFlat && spec.systemId !== "standing_seam_low" ? (
                <p className="rbf-note is-warn">
                  This roof reads flat — a steep system here prices a conversion.
                  <button type="button" className="rbf-link rbf-link--inline" disabled={disabled} onClick={() => pickFamily("low-slope")}>
                    Price it flat
                  </button>
                </p>
              ) : null}
              {existingFam && !lowSlope && (
                <p className={"rbf-note" + (spec.systemFamily === existingFam ? "" : " is-warn")}>
                  {spec.systemFamily === existingFam ? (
                    `Existing roof: ${facts.existingMaterial} — priced like-for-like.`
                  ) : (
                    <>
                      {`Existing roof: ${facts.existingMaterial} — this prices a change to ${familyLabel(spec.systemFamily).toLowerCase()}.`}
                      {likeForLikeSystem(existingFam, lists) && (
                        <button
                          type="button"
                          className="rbf-link rbf-link--inline"
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
                </p>
              )}
              <button type="button" className="rbf-link" disabled={disabled} onClick={() => setManage("systems")}>
                <IcPlus />
                Add roof type
              </button>
            </div>
          </>
        )}
      </Sec>

      {!lowSlope ? (
        <>
          {/* UNDERLAYMENT */}
          <Sec id="under" title="Underlayment" caption={manage === "underlayments" ? "Editing your underlayments. Save as defaults keeps the list for everyone." : undefined}>
            {manage === "underlayments" ? (
              <div className="rbf-tbl">
                <div className="rbf-tr rbf-tr--und rbf-th" aria-hidden="true">
                  <span>Underlayment</span>
                  <span>Rate</span>
                  <span />
                </div>
                {lists.underlayments.map((u) => (
                  <div className="rbf-tr rbf-tr--und" key={u.id}>
                    <label className="rbf-f rbf-tn">
                      <span className="rbf-lbl">Underlayment</span>
                      <span className={"rbf-in" + (disabled ? " is-disabled" : "")}>
                        <input className="rbf-input" value={u.label} disabled={disabled} aria-label="Underlayment name" onChange={(e) => patchUnderlayment(u.id, { label: e.target.value })} />
                      </span>
                    </label>
                    <Num label="Rate" aria="Underlayment $/sq" unit="$/sq" value={u.perSq} onChange={(n) => patchUnderlayment(u.id, { perSq: n })} disabled={disabled} />
                    <button type="button" className="rbf-x" disabled={disabled || lists.underlayments.length <= 1} aria-label={`Remove ${u.label}`} title="Remove" onClick={() => removeUnderlayment(u.id)}>
                      <IcX />
                    </button>
                  </div>
                ))}
                <div className="rbf-add">
                  <button type="button" className="btn btn-ghost rbf-btn" disabled={disabled} onClick={addUnderlayment}>
                    <IcPlus />
                    Underlayment
                  </button>
                  <button type="button" className="btn btn-ghost rbf-btn rbf-done" onClick={() => setManage(null)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Fields>
                  <Sel label="Underlayment" value={spec.underlaymentId} options={lists.underlayments} onChange={(id) => pickUnderlayment(id)} disabled={disabled} size="wide" />
                  <Sel label="Ice & water" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} size="wide" />
                </Fields>
                <div className="rbf-after">
                  <button type="button" className="rbf-link" disabled={disabled} onClick={() => setManage("underlayments")}>
                    <IcPlus />
                    Add underlayment
                  </button>
                </div>
              </>
            )}
          </Sec>

          {/* EDGES */}
          <Sec
            id="edges"
            title="Edges"
            stamp={<Stamp tone={edgeMeasured ? "ok" : edgeEstimated ? "warn" : "ink"}>{edgeMeasured ? "Measured" : edgeEstimated ? "Estimated" : "Entered"}</Stamp>}
            caption={
              edgeMeasured
                ? `Lengths from aerial report${report?.reportId ? ` #${report.reportId}` : ""}.`
                : edgeEstimated
                  ? "Estimated from the building outline. Check them against the roof."
                  : "Lengths entered for this roof."
            }
          >
            <Fields>
              <Num label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
              <Num label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
              <Num label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
              <Num label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
            </Fields>
            <div className="rbf-opts">
              <Opt check={<Check label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />}>
                {spec.dripEdgeOn && (
                  <>
                    <Sel label="Profile" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} size="md" />
                    <Sel label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} size="sm" />
                    {spec.dripProfileId === "custom" && <Rate label="Drip edge" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />}
                  </>
                )}
              </Opt>
              {!noStarter && <Opt check={<Check label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />} />}
              {/* FASCIA (owner, 2026-09-19) — the board the gutter hangs on,
                  open only while the roof is off, so a tear-off opens with it
                  in. The gutters have to come down either way. */}
              <Opt
                check={<Check label="Replace fascia" checked={spec.fasciaOn} onChange={(v) => set("fasciaOn", v)} disabled={disabled} />}
                note={
                  spec.fasciaOn && fasciaFeet(spec) <= 0 ? (
                    <p className="rbf-note is-warn">Fascia is on, but there is no length to price it — enter the eave, or set the run to a figure of your own.</p>
                  ) : !spec.fasciaOn && spec.tearOffLayers > 0 ? (
                    <p className="rbf-note">The fascia stays. It is only reachable while the roof is off, so it is worth a look before the tear-off.</p>
                  ) : null
                }
              >
                {spec.fasciaOn && (
                  <>
                    {/* The three picks, then the two lengths they bring — so
                        on a phone the lengths pair up on one line. */}
                    <Sel label="Board" value={spec.fasciaOptionId} options={FASCIA_OPTIONS} onChange={pickFascia} disabled={disabled} size="md" />
                    <Sel label="Runs" value={spec.fasciaRun} options={FASCIA_RUNS} onChange={(v) => set("fasciaRun", v as FasciaRun)} disabled={disabled} />
                    <Sel label="Gutters" value={spec.gutterPlan} options={GUTTER_PLANS} onChange={(v) => set("gutterPlan", v as GutterPlan)} disabled={disabled} size="md" />
                    {spec.fasciaRun === "custom" && <Num label="Fascia length" aria="Fascia length" unit="ft" value={spec.fasciaFt} onChange={(v) => set("fasciaFt", v)} disabled={disabled} />}
                    {spec.gutterPlan !== "none" && (
                      <Num label="Gutter length" aria="Gutter length" unit="ft" value={spec.gutterFt > 0 ? spec.gutterFt : Math.round(gutterFeet(spec))} onChange={(v) => set("gutterFt", v)} disabled={disabled} />
                    )}
                  </>
                )}
              </Opt>
            </div>
            {((!edgeMeasured && !edgeEstimated && !!estimateEdges(facts)) || (report && report.state === "none" && !edgeMeasured) || (report && report.state === "pending")) && (
              <div className="rbf-src">
                {!edgeMeasured && !edgeEstimated && estimateEdges(facts) && (
                  <button type="button" className="rbf-link" onClick={resetEdges} disabled={disabled}>
                    Reset to outline estimate
                  </button>
                )}
                {report && report.state === "none" && !edgeMeasured && (
                  <>
                    <button type="button" className="btn btn-ghost rbf-btn" onClick={report.onOrder} disabled={disabled || report.busy}>
                      {report.busy ? "Pricing…" : "Order measurement report"}
                    </button>
                    <p className="rbf-src-note">Paid report · usually within 48 hours · the lengths update by themselves.</p>
                  </>
                )}
                {report && report.state === "pending" && (
                  <>
                    <p className="rbf-src-note">
                      Report #{report.reportId} · {report.status ?? "in process"}
                    </p>
                    <button type="button" className="btn btn-ghost rbf-btn" onClick={report.onCheck} disabled={disabled || report.busy}>
                      {report.busy ? "Checking…" : "Check report status"}
                    </button>
                  </>
                )}
              </div>
            )}
          </Sec>

          {/* FLASHING */}
          <Sec id="flash" title="Flashing">
            <div className="rbf-grps">
              <Grp title="Valleys">
                <Num label="Count" unit="each" value={spec.valleyCount} onChange={(v) => setValleyField("valleyCount", v)} disabled={disabled} />
                <Num label="Length each" unit="ft" value={spec.valleyFtEach} onChange={(v) => setValleyField("valleyFtEach", v)} disabled={disabled} />
                <Sel label="Type" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} size="wide" />
                {spec.valleyTypeId === "custom" && (
                  <>
                    <Rate label="Valley metal" unit="$/ft" value={spec.valleyMatPerFt} onChange={(v) => set("valleyMatPerFt", v)} disabled={disabled} />
                    <Rate label="Valley labor" unit="$/ft" value={spec.valleyLaborPerFt} onChange={(v) => set("valleyLaborPerFt", v)} disabled={disabled} />
                  </>
                )}
              </Grp>
              <Grp title="Step flashing">
                <Num label="Walls" unit="each" value={spec.stepWallCount} onChange={(v) => setStepField("stepWallCount", v)} disabled={disabled} />
                <Num label="Length each" unit="ft" value={spec.stepWallFtEach} onChange={(v) => setStepField("stepWallFtEach", v)} disabled={disabled} />
                <Sel label="Step size" value={spec.stepSizeId} options={STEP_FLASHING_SIZES} onChange={pickStep} disabled={disabled} />
                {spec.stepSizeId === "custom" && <Rate label="Step piece" unit="$/ea" value={spec.stepPerPiece} onChange={(v) => set("stepPerPiece", v)} disabled={disabled} />}
              </Grp>
              <Grp title="Apron & counter">
                <Num label="Apron / headwall" unit="ft" value={spec.apronFt} onChange={(v) => set("apronFt", v)} disabled={disabled} />
                <Num label="Counter flashing" unit="ft" value={spec.counterFt} onChange={(v) => set("counterFt", v)} disabled={disabled} />
              </Grp>
              <Grp title="Pipe boots">
                {PIPE_BOOT_SIZES.map((s) => (
                  <Num key={s.id} label={s.label} aria={`Pipe boots ${s.label}`} unit="each" value={spec.pipeBoots[s.id] ?? 0} onChange={(v) => set("pipeBoots", { ...spec.pipeBoots, [s.id]: v })} disabled={disabled} />
                ))}
              </Grp>
              <Grp title="Chimneys & curbs">
                <Num label="Chimneys" unit="each" value={spec.chimneyCount} onChange={(v) => set("chimneyCount", v)} disabled={disabled} />
                <Num label="Curbs" unit="each" value={spec.curbCount} onChange={(v) => set("curbCount", v)} disabled={disabled} />
                <Sel label="Chimney size" value={spec.chimneySizeId} options={CHIMNEY_SIZES} onChange={pickChimney} disabled={disabled} size="wide" />
              </Grp>
            </div>
          </Sec>

          {/* VENTS */}
          <Sec
            id="vents"
            title="Vents"
            stamp={vent ? <Stamp tone={vent.ok ? "ok" : "bad"}>{vent.ok ? "Balanced" : "Short"}</Stamp> : undefined}
            caption={vent && !vent.ok ? "Intake and exhaust should each cover half of what the attic needs, and intake at least match exhaust." : undefined}
          >
            {vent ? (
              /* The attic check as four figures, label over value. */
              <div className="rbf-figs" role="group" aria-label="Attic ventilation check">
                <div className="rbf-fig">
                  <span className="rbf-fig-k">Attic</span>
                  <span className="rbf-fig-v">
                    {fmt(facts.footprintSqft ?? 0)}
                    <small>sq ft</small>
                  </span>
                </div>
                <div className="rbf-fig">
                  <span className="rbf-fig-k">Needs</span>
                  <span className="rbf-fig-v">
                    {fmt(vent.requiredSqIn)}
                    <small>sq in net free area</small>
                  </span>
                </div>
                <div className="rbf-fig">
                  <span className="rbf-fig-k">Exhaust</span>
                  <span className="rbf-fig-v">
                    {fmt(vent.exhaustSqIn)}
                    <small>sq in</small>
                    {vent.poweredExhaust ? <small>+ {vent.poweredExhaust} powered</small> : null}
                  </span>
                </div>
                <div className="rbf-fig">
                  <span className="rbf-fig-k">Intake</span>
                  <span className="rbf-fig-v">
                    {fmt(vent.intakeSqIn)}
                    <small>sq in</small>
                  </span>
                </div>
              </div>
            ) : (
              <p className="rbf-note">No footprint on this measurement, so the attic check is off — add what the roof needs.</p>
            )}
            {ventsOn.length > 0 && (
              <div className="rbf-tbl">
                <div className="rbf-tr rbf-tr--vent rbf-th" aria-hidden="true">
                  <span>Vent</span>
                  <span>Qty</span>
                  <span>Material</span>
                  <span>Labor</span>
                  <span className="rbf-th-r">Total</span>
                  <span />
                </div>
                {ventsOn.map((t) => {
                  const v = ventOf(t.id);
                  const each = t.unit === "each";
                  return (
                    <div className="rbf-tr rbf-tr--vent" key={t.id}>
                      <span className="rbf-vname rbf-tn">
                        {t.label}
                        <em>
                          {t.role}
                          {t.nfaSqIn ? ` · ${t.nfaSqIn} sq in${each ? "" : "/ft"}` : " · powered"}
                        </em>
                      </span>
                      <Num label="Qty" aria={`${t.label} quantity`} unit={each ? "each" : "ft"} value={v.qty} onChange={(n) => setVent(t.id, { qty: n })} disabled={disabled} />
                      <Num label="Material" aria={`${t.label} material`} unit={each ? "$/ea" : "$/ft"} value={v.each} onChange={(n) => setVent(t.id, { each: n })} disabled={disabled} />
                      <Num label="Labor" aria={`${t.label} labor`} unit={each ? "$/ea" : "$/ft"} value={v.labor} onChange={(n) => setVent(t.id, { labor: n })} disabled={disabled} />
                      <span className="rbf-vtot">
                        <span>Total</span>
                        {money(v.qty * (v.each + v.labor))}
                      </span>
                      <button type="button" className="rbf-x" disabled={disabled} aria-label={`Remove ${t.label}`} title="Remove" onClick={() => setVent(t.id, { qty: 0 })}>
                        <IcX />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="rbf-add rbf-add--vents">
              {ventsToAdd.length > 0 && (
                <div className="rbf-f rbf-f--wide">
                  <BlueprintSelect
                    value=""
                    onChange={(id) => {
                      if (id) setVent(id, { qty: 1 });
                    }}
                    options={ventsToAdd.map((t) => ({ value: t.id, label: t.label }))}
                    placeholder="+ Add a vent…"
                    ariaLabel="Add a vent"
                    disabled={disabled}
                    styles={SEL_STYLES}
                  />
                </div>
              )}
              <Check label="Balanced system · 1/300 rule" checked={spec.ventBalanced} onChange={(v) => set("ventBalanced", v)} disabled={disabled} />
            </div>
          </Sec>

          {/* TEAR-OFF & EXTRAS */}
          <Sec id="tear" title="Tear-off & extras">
            <div className="rbf-grps">
              <Grp title="Tear-off">
                <Sel
                  label="Layers"
                  aria="Tear-off"
                  value={String(spec.tearOffLayers)}
                  options={[
                    { id: "0", label: "None · overlay" },
                    { id: "1", label: "1 layer" },
                    { id: "2", label: "2 layers" },
                    { id: "3", label: "3 layers" },
                  ]}
                  onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)}
                  disabled={disabled}
                  size="sm"
                />
                <Num label="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
              </Grp>
              <Grp
                title="Job extras"
                note={steepest < 8 ? <p className="rbf-note">Steep safety applies from 8/12 — this roof is {steepest > 0 ? `${steepest}/12` : "flatter"}, so it stays off.</p> : null}
              >
                <Num label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
                <Num label="Steep safety" unit="$" value={spec.safetyLump} onChange={(v) => set("safetyLump", v)} disabled={disabled} />
                {!spec.commercial.on && <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />}
                <Num label="Delivery" unit="$" value={spec.deliveryLump ?? 0} onChange={(v) => set("deliveryLump", v)} disabled={disabled} />
              </Grp>
            </div>
          </Sec>
        </>
      ) : (
        <>
          {/* INSULATION & COVER BOARD — or the prep a coating needs */}
          <Sec id="boards" title={surface ? "Surface prep" : "Insulation"}>
            {surface ? (
              <>
                <Fields>
                  <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
                  <Num label="Core cuts" unit="each" value={F.coreCuts} onChange={(v) => setFlat("coreCuts", v)} disabled={disabled} />
                </Fields>
                <div className="rbf-opts">
                  <Opt check={<Check label="Primer" checked={F.primerOn} onChange={(v) => setFlat("primerOn", v)} disabled={disabled} />} />
                </div>
                <p className="rbf-note">Goes over the existing roof — no tear-off, insulation or new edge metal. Core cuts confirm the roof underneath is dry; wet areas are cut out and replaced first.</p>
              </>
            ) : boards ? (
              <div className="rbf-grps">
                <Grp
                  title="Boards"
                  note={
                    spec.commercial.on && F.insulationId === "none" ? (
                      <p className="rbf-note is-warn">A tear-off to the deck on a commercial building usually has to meet the energy code — about R-25 to R-30 of insulation.</p>
                    ) : null
                  }
                >
                  <Sel label="Insulation" value={F.insulationId} options={INSULATION_OPTIONS} onChange={(v) => pickBoard("insulation", v)} disabled={disabled} size="wide" />
                  <Sel label="Cover board" value={F.coverBoardId} options={COVER_BOARDS} onChange={(v) => pickBoard("cover", v)} disabled={disabled} size="md" />
                  <Num label="Tapered & crickets" unit="sq ft" value={F.taperedSqft} onChange={(v) => setFlat("taperedSqft", v)} disabled={disabled} />
                </Grp>
                <Grp title="Wet areas">
                  <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
                </Grp>
              </div>
            ) : (
              <>
                <Fields>
                  <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
                </Fields>
                <p className="rbf-note">{rule?.method === "nailed" ? "Rolled roofing is nailed to the deck" : "A liquid-applied membrane goes on the prepared deck"} — no insulation or cover board.</p>
              </>
            )}
          </Sec>

          {/* EDGES & WALLS */}
          <Sec id="walls" title="Edges & walls" stamp={splitOff ? <Stamp tone="bad">Check split</Stamp> : undefined}>
            <Fields>
              <Num label="Perimeter" unit="ft" value={perimeterFt} onChange={(v) => setSpec((prev) => ({ ...prev, eaveFt: v, rakeFt: 0, edgesBasis: "entered" }))} disabled={disabled} />
              <Num label="Parapet" unit="ft" value={F.parapetFt} onChange={(v) => setFlat("parapetFt", v)} disabled={disabled} />
              <Num label="Parapet height" unit="in" value={F.parapetHeightIn} onChange={(v) => setFlat("parapetHeightIn", v)} disabled={disabled} />
              <Num label="Open edge" unit="ft" value={F.edgeMetalFt} onChange={(v) => setFlat("edgeMetalFt", v)} disabled={disabled} />
              {!surface && <Num label="Wall flashing" unit="ft" value={F.wallFt} onChange={(v) => setFlat("wallFt", v)} disabled={disabled} />}
            </Fields>
            {boards && !surface && (
              <div className="rbf-opts">
                <Opt check={<Check label="Wood nailers to insulation height" checked={F.nailersOn} onChange={(v) => setFlat("nailersOn", v)} disabled={disabled} />} />
              </div>
            )}
            <p className={"rbf-note" + (splitOff ? " is-warn" : "")}>
              {perimeterFt > 0 ? `Outline perimeter ${fmt(perimeterFt)} ft — parapet plus open edge should add up to it. ` : "No outline perimeter — enter the lengths from the photo. "}
              {surface ? "A coating keeps the existing edge metal and coping; these lengths still size the fall protection." : "Coping caps the parapets; ES-1 edge metal finishes the open edges; wall flashing is wherever the roof meets a taller wall."}
            </p>
          </Sec>

          {/* DRAINS & PENETRATIONS */}
          <Sec id="drains" title="Drains & curbs">
            <div className="rbf-grps">
              {!surface && (
                <Grp title="Drains">
                  <Num label="Roof drains" unit="each" value={F.drains} onChange={(v) => setFlat("drains", Math.round(v))} disabled={disabled} />
                  <Sel label="Drain work" value={F.drainWork} options={DRAIN_WORK} onChange={(v) => setFlat("drainWork", v as DrainWork)} disabled={disabled} size="wide" />
                  <Sel label="Overflow" value={F.secondary} options={SECONDARY_DRAINAGE} onChange={(v) => setFlat("secondary", v as SecondaryDrainage)} disabled={disabled} />
                </Grp>
              )}
              <Grp title="Scuppers & gutters">
                <Num label="Thru-wall scuppers" unit="each" value={F.scuppers} onChange={(v) => setFlat("scuppers", Math.round(v))} disabled={disabled} />
                <Num label="Gutter" unit="ft" value={F.gutterFt} onChange={(v) => setFlat("gutterFt", v)} disabled={disabled} />
              </Grp>
              <Grp
                title="Penetrations & curbs"
                note={surface ? <p className="rbf-note">A coating details drains and curbs with fabric and coating — no new drains or curb flashing are priced.</p> : null}
              >
                <Num label="Pipe boots" unit="each" value={F.pipeBoots} onChange={(v) => setFlat("pipeBoots", Math.round(v))} disabled={disabled} />
                <Num label="Pitch pockets" unit="each" value={F.pitchPockets} onChange={(v) => setFlat("pitchPockets", Math.round(v))} disabled={disabled} />
                {!surface && <Num label="Rooftop units" unit="each" value={F.rtuCount} onChange={(v) => setFlat("rtuCount", Math.round(v))} disabled={disabled} />}
                <Num label="Units raised & reset" unit="each" value={F.rtuResetCount} onChange={(v) => setFlat("rtuResetCount", Math.round(v))} disabled={disabled} />
                {!surface && <Num label="Skylights, hatches, curbs" unit="each" value={F.curbs} onChange={(v) => setFlat("curbs", Math.round(v))} disabled={disabled} />}
              </Grp>
            </div>
          </Sec>

          {/* ROOFTOP, ACCESS & WARRANTY */}
          <Sec id="rooftop" title="Access & warranty">
            <div className="rbf-grps">
              <Grp title="Access" note={F.craneHours <= 0 ? <Check label="Ladder hoist / conveyor" checked={F.hoistOn} onChange={(v) => setFlat("hoistOn", v)} disabled={disabled} /> : null}>
                <Num label="Walkway pads" unit="ft" value={F.walkwayFt} onChange={(v) => setFlat("walkwayFt", v)} disabled={disabled} />
                <Num label="Crane" unit="hours" value={F.craneHours} onChange={(v) => setFlat("craneHours", v)} disabled={disabled} />
                {!surface && <Num label="Core cuts" unit="each" value={F.coreCuts} onChange={(v) => setFlat("coreCuts", Math.round(v))} disabled={disabled} />}
              </Grp>
              <Grp title="Warranty & pace">
                <Sel label="Warranty" value={F.warrantyId} options={WARRANTIES} onChange={pickWarranty} disabled={disabled} size="md" />
                <Num label="Squares per day" unit="sq" value={F.productionSqPerDay} onChange={(v) => setFlat("productionSqPerDay", Math.max(1, v))} disabled={disabled} />
              </Grp>
            </div>
          </Sec>

          {/* TEAR-OFF & EXTRAS */}
          <Sec id="flatTear" title="Tear-off & extras">
            <Fields>
              {!surface && (
                <>
                  <Sel label="Existing roof" value={F.existing} options={EXISTING_LOW_SLOPE} onChange={(v) => pickExisting(v as ExistingLowSlope)} disabled={disabled} size="md" />
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
                    size="sm"
                  />
                </>
              )}
              <Num label="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
              <Num label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
              {!spec.commercial.on && <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />}
            </Fields>
            {spec.commercial.on && <p className="rbf-note">The permit is priced on the job value, under Commercial job.</p>}
          </Sec>
        </>
      )}

      {/* COMMERCIAL JOB — either kind of roof */}
      <Sec id="commercial" title="Commercial job" stamp={C.on ? <Stamp tone="ink">Commercial</Stamp> : undefined}>
        <div className="rbf-opts">
          <Opt
            check={<Check label="Price as a commercial job" checked={C.on} onChange={toggleCommercial} disabled={disabled} />}
            note={
              <p className="rbf-note">
                {C.on
                  ? `${prod < 1 ? `Field install labor ×${prod} at ${fmt(facts.squares)} squares — a big deck goes down faster per square. ` : ""}Adds mobilization, a safety plan${spec.tearOffLayers > 0 ? ", the asbestos survey before tear-off" : ""}${facts.squares >= 50 ? ", a superintendent" : ""}, a permit on the job value, and general conditions & insurance on everything except the at-cost fees.`
                  : "Priced as residential. Turn this on for a store, warehouse, school or apartment building."}
              </p>
            }
          >
            {C.on && (
              <>
                <Sel label="Labor" value={C.wage} options={WAGE_REGIMES} onChange={(v) => setCommercial("wage", v as WageRegime)} disabled={disabled} />
                <Sel label="Schedule" value={C.shift} options={SHIFTS} onChange={(v) => setCommercial("shift", v as Shift)} disabled={disabled} />
                <Num label="Stories" unit="floors" value={C.stories} onChange={(v) => setCommercial("stories", Math.max(1, Math.round(v)))} disabled={disabled} />
              </>
            )}
          </Opt>
          {C.on && <Opt check={<Check label="Occupied during work" checked={C.occupied} onChange={(v) => setCommercial("occupied", v)} disabled={disabled} />} />}
          {C.on && <Opt check={<Check label="Payment & performance bond" checked={C.bondOn} onChange={(v) => setCommercial("bondOn", v)} disabled={disabled} />} />}
        </div>
      </Sec>

      {/* CUSTOM LINES */}
      <Sec id="custom" title="Custom lines">
        {spec.custom.length > 0 ? (
          <div className="rbf-tbl">
            <div className="rbf-tr rbf-tr--custom rbf-th" aria-hidden="true">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Price</span>
              <span>Material or labor</span>
              <span />
            </div>
            {spec.custom.map((c) => (
              <div className="rbf-tr rbf-tr--custom" key={c.id}>
                <label className="rbf-f rbf-tn">
                  <span className="rbf-lbl">Item</span>
                  <span className={"rbf-in" + (disabled ? " is-disabled" : "")}>
                    <input className="rbf-input" placeholder="A skylight, gutters, a fascia repair" value={c.name} disabled={disabled} onChange={(e) => setCustom(c.id, { name: e.target.value })} aria-label="Custom item" />
                  </span>
                </label>
                <Num label="Qty" aria="Quantity" value={c.qty} onChange={(n) => setCustom(c.id, { qty: n })} disabled={disabled} />
                <Sel label="Unit" aria="Unit" value={c.unit} options={PKG_UNITS.map((u) => ({ id: u, label: u }))} onChange={(v) => setCustom(c.id, { unit: v as PkgUnit })} disabled={disabled} />
                <Num label="Price" aria="Unit price" unit="$" value={c.unitPrice} onChange={(n) => setCustom(c.id, { unitPrice: n })} disabled={disabled} />
                <Sel
                  label="Kind"
                  aria="Material or labor"
                  value={c.kind}
                  options={[
                    { id: "material", label: "Material" },
                    { id: "labor", label: "Labor" },
                  ]}
                  onChange={(v) => setCustom(c.id, { kind: v as "material" | "labor" })}
                  disabled={disabled}
                />
                <button type="button" className="rbf-x" disabled={disabled} aria-label="Remove custom line" title="Remove" onClick={() => removeCustom(c.id)}>
                  <IcX />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rbf-note">Add what the package does not cover — a skylight, a gutter run, a repair.</p>
        )}
        <div className="rbf-add">
          <button type="button" className="btn btn-ghost rbf-btn" disabled={disabled} onClick={() => addCustom("material")} aria-label="Add a material line">
            <IcPlus />
            Material
          </button>
          <button type="button" className="btn btn-ghost rbf-btn" disabled={disabled} onClick={() => addCustom("labor")} aria-label="Add a labor line">
            <IcPlus />
            Labor
          </button>
        </div>
      </Sec>

      {/* RATES & DEFAULTS — the contractor's prices, set once, behind one disclosure */}
      <Sec id="rates" title="Rates & defaults">
        <div className="rbf-def">
          <p className="rbf-def-src">
            <span>
              {source === "loading"
                ? "Loading your company defaults…"
                : source === "org"
                  ? "Prices and picks load from your company defaults."
                  : "Prices and picks are saved in this browser only."}
            </span>
            {dirty && source !== "loading" ? <Stamp tone="warn">Unsaved changes</Stamp> : null}
          </p>
          <div className="rbf-add rbf-add--def">
            <button
              type="button"
              className={"btn btn-ghost rbf-btn rbf-disclose" + (ratesOpen ? " is-open" : "")}
              aria-expanded={ratesOpen}
              aria-controls={ratesOpen ? ratesId : undefined}
              onClick={() => setRatesOpen((o) => !o)}
            >
              <IcChev />
              {ratesOpen ? "Hide rates" : "Show rates"}
            </button>
            <button type="button" className={"btn btn-ghost rbf-btn" + (dirty ? " is-dirty" : "")} disabled={disabled} onClick={() => void saveDefaults()}>
              {saving ? "Saving…" : "Save as defaults"}
            </button>
          </div>
          {saveError && (
            <p className="rbf-save-error" role="alert">
              {saveError}
            </p>
          )}
        </div>
        {ratesOpen && (
          <div className="rbf-rates" id={ratesId}>
            <div className="rbf-grps">
              {rateGroups
                .filter((g) => g.rates.length > 0)
                .map((g) => (
                  <Grp key={g.id} title={g.title}>
                    {g.rates}
                  </Grp>
                ))}
            </div>
          </div>
        )}
      </Sec>

      {/* HANDHELD SUMMARY — the split and Review, above the bar (the bar keeps
          only the total and Convert on a phone). */}
      <div className="rbf-block rbf-sum">
        {split("rbf-split--sum")}
        {needsPitch && <p className="rbf-note is-warn">{blockedReason}</p>}
        {reviewBtn("rbf-sum-review")}
      </div>

      {/* THE BAR — sticky while the sheet scrolls, at rest at its foot. */}
      <div className="rbf-bar" role="region" aria-label="Estimate total">
        <div className="rbf-bar-sum">
          <div className="rbf-bar-total">
            <span className="rbf-bar-k">{spec.commercial.on ? "Total · commercial" : "Total"}</span>
            <span className="rbf-bar-v" key={total}>
              {needsPitch ? "—" : money(total)}
            </span>
          </div>
          {split("rbf-split--bar")}
          {needsPitch && <p className="rbf-bar-why">{blockedReason}</p>}
        </div>
        <div className="rbf-bar-acts">
          {reviewBtn("rbf-bar-review")}
          <button
            type="button"
            className="btn btn-primary rbf-btn rbf-btn--go"
            disabled={disabled || converting || needsPitch}
            onClick={() => onConvert(pkg, spec)}
            title={needsPitch ? blockedReason : "Straight to a proposal with these lines — lines you already edited below are what gets converted"}
          >
            <svg className="ic" aria-hidden="true">
              <use href="#i-file" />
            </svg>
            {converting ? "Creating…" : "Convert to proposal"}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CARD
// ═══════════════════════════════════════════════════════════════════════════
export default function BuildEstimateCardF({
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
  aiEnabled = true,
  waiting = null,
}: BuildEstimateCardProps) {
  // Nothing is priced while the aerial provider is still delivering the
  // packs pricing needs, nor on a pitch nobody stated.
  const needsPitch = !!waiting || (!!pitchEntry && !pitchEntry.value);
  const blockedReason = waiting ?? "Enter pitch to price.";

  // EagleView supplied no pitch (pack 002 not bought): the contractor states
  // one before anything is priced, in either mode.
  const pitchPick = pitchEntry ? (
    <BlueprintSelect
      id="pitchEntered"
      value={pitchEntry.value ?? ""}
      onChange={(p) => pitchEntry.onChange(p || null)}
      options={pitchEntry.options.map((p) => ({ value: p, label: p }))}
      placeholder="Enter pitch…"
      ariaLabel="Pitch"
      styles={SEL_STYLES}
    />
  ) : null;

  // Package mode: the pitch is the sheet's first section.
  const pitchSection =
    waiting || pitchPick ? (
      <Sec
        id="pitch"
        title="Roof pitch"
        stamp={waiting ? <Stamp tone="warn">On its way</Stamp> : needsPitch ? <Stamp tone="warn">Needed to price</Stamp> : <Stamp tone="ink">Entered</Stamp>}
      >
        {waiting ? (
          <p className="rbf-wait" data-waiting="1">
            {waiting}
          </p>
        ) : (
          <>
            {/* The section title names the field; the combobox carries "Pitch". */}
            <Fields>
              <div className="rbf-f rbf-f--pitch">{pitchPick}</div>
            </Fields>
            {needsPitch && <p className="rbf-note">The measurement has no pitch for this roof. Enter it to price the estimate.</p>}
          </>
        )}
      </Sec>
    ) : null;

  const reason = generate.disabled && generate.reason ? generate.reason : null;
  const lede = isRecon
    ? null
    : buildMode === "package"
      ? facts
        ? "Pick what goes on this roof. Every change updates the total."
        : null
      : facts?.existingMaterial && likeForLikeFamily(facts)
        ? `Existing roof: ${facts.existingMaterial}. Drafts a like-for-like package from the measured figures — every line stays editable below.`
        : "Drafts the full package from the measured figures — every line stays editable below.";

  return (
    <div className="card rbf" data-build-card="f" data-mode={buildMode}>
      <div className="rbf-head">
        <div className="rbf-head-t">
          <h2 className="rbf-title">Build an estimate</h2>
          {lede && <p className="rbf-lede">{lede}</p>}
        </div>
        <div className="rbf-mode" role="radiogroup" aria-label="How to build the estimate">
          {(aiEnabled ? (["package", "ai"] as const) : (["package"] as const)).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={buildMode === m} className="rbf-mode-btn" onClick={() => onBuildMode(m)}>
              {m === "package" ? "Roof package" : "Smart estimate"}
            </button>
          ))}
        </div>
      </div>

      {caution && (
        <div className="rbf-block rbf-caution" role="note">
          <Stamp tone="warn">{caution.stamp}</Stamp>
          <p className="rbf-caution-t">{caution.text}</p>
          {caution.action && (
            <button type="button" className="btn btn-ghost rbf-btn rbf-caution-go" onClick={caution.action.onClick}>
              {caution.action.label}
            </button>
          )}
        </div>
      )}
      {isRecon && (
        <div className="rbf-block rbf-empty">
          <p>
            These figures are estimated from aerial imagery, so they can’t be priced. Use <b>Measure this roof</b> on this address to build a quote.
          </p>
        </div>
      )}

      {buildMode === "package" ? (
        !isRecon && facts ? (
          <PackageSheet
            facts={facts}
            disabled={builderDisabled}
            converting={converting}
            onBuild={onBuild}
            onConvert={onConvert}
            lead={pitchSection}
            needsPitch={needsPitch}
            blockedReason={blockedReason}
            report={report}
            onBuildingUse={onBuildingUse}
          />
        ) : (
          pitchSection
        )
      ) : (
        <section className="rbf-block rbf-smart" aria-label="Smart estimate">
          <Fields>
            {waiting ? (
              <div className="rbf-f rbf-f--wide" data-waiting="1">
                <span className="rbf-lbl">Pitch</span>
                <p className="rbf-wait">{waiting}</p>
              </div>
            ) : pitchPick ? (
              <div className="rbf-f rbf-f--pitch">
                <span className="rbf-lbl" aria-hidden="true">
                  Pitch
                </span>
                {pitchPick}
              </div>
            ) : null}
            <div className="rbf-f rbf-f--sm">
              <span className="rbf-lbl" aria-hidden="true">
                Waste
              </span>
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
          </Fields>
          <div className="rbf-go">
            <button className="btn btn-primary rbf-btn rbf-btn--go" type="button" id="buildBtn" disabled={generate.disabled} title={generate.reason} onClick={generate.onClick}>
              <svg className="ic" aria-hidden="true">
                <use href="#i-bulb" />
              </svg>
              {generate.busy ? "Generating…" : "Generate estimate"}
            </button>
            {reason && <p className="rbf-go-why">{reason}</p>}
          </div>
        </section>
      )}

      {output}
    </div>
  );
}
