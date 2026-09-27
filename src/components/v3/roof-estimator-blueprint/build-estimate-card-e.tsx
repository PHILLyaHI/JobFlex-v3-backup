"use client";

// VARIANT E of the "Build an estimate" card — the 2026-09-26 high-contrast
// round. /dashboard/roof-estimator?builder=e, or on a sample house at
// /dashboard/roof-estimator/card-preview?builder=e.
//
// CALM LEDGER — the HVAC estimator's voice on the roof package.
//   HEAD    the title, one sentence on what is being priced, the mode switch.
//   LEDGER  01–08, one row per part of the roof. A closed row is its name in
//           bold ink with what is picked under it, in plain dark text. One
//           row opens at a time. Inside, every LINE reads left to right: the
//           thing, this roof's quantities, then the contractor's prices for
//           it — a rate sits on the line of the thing it prices, never in a
//           separate column the eye has to match back.
//   FOOT    whose rates these are, Save as defaults, Review lines.
//   BAND    the total and Convert, once — pinned to the foot of the screen
//           while the card is in view, so the figure follows every edit.
//
// Everything variant C does survives: the same helpers, the same state block
// (from roof-package-builder.tsx), the same localStorage keys, the same
// saveRoofCatalog write, every row, rate, editor and state. Only markup, copy
// and CSS are new.

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
import "./build-estimate-card-e.css";

// ── Icons: the shell sprite for file / board / bulb; the rest inline ──
const IcChev = () => (
  <svg className="ic rbe-chev" viewBox="0 0 24 24" aria-hidden="true">
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

// ── Field primitives ──

/** The house dropdown (advanced-ai-blueprint/blueprint-select), drawn by this
 *  card's stylesheet. Its option list is portalled into `.content`, so the
 *  list rules in build-estimate-card-e.css sit outside `.rbe`. */
const SEL_STYLES: SelectStyles = {
  bsel: "rbe-sel",
  "bsel-btn": "rbe-sel-btn",
  "bsel-val": "rbe-sel-val",
  "bsel-caret": "rbe-sel-caret",
  "bsel-list": "rbe-sel-list",
  "bsel-opt": "rbe-sel-opt",
};

/** Field widths: sm is a count or a rate, md a short pick, lg a long name. */
type Size = "sm" | "md" | "lg";
const sizeClass = (s?: Size) => (s === "md" ? " rbe-f--md" : s === "lg" ? " rbe-f--lg" : "");

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
  rate,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  disabled?: boolean;
  min?: number;
  /** Accessible name when the visible label needs its context ("Valley metal"). */
  aria?: string;
  size?: Size;
  /** A price the contractor keeps — set once, saved as a default. */
  rate?: boolean;
}) {
  const [txt, setTxt] = React.useState(String(value));
  // The prop moved away from what is typed (a pick reset the price, another
  // roof opened): adopt it. Done during render, not in an effect.
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  // A plain dollar amount reads "$ 250", the sign in front; every other
  // unit ("$/sq", "ft", "each") follows the figure.
  const lead = unit === "$";
  return (
    <label className={"rbe-f" + sizeClass(size) + (rate ? " rbe-f--rate" : "")}>
      {label && <span className="rbe-lbl">{label}</span>}
      <span className={"rbe-box" + (disabled ? " is-off" : "") + (lead ? " has-lead" : "")}>
        {lead && <span className="rbe-unit rbe-unit--lead">$</span>}
        <input
          className="rbe-in"
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
        {unit && !lead && <span className="rbe-unit">{unit}</span>}
      </span>
    </label>
  );
}

/** A name the contractor types (a roof type, an underlayment, a custom item). */
function Text({
  label,
  value,
  onChange,
  disabled,
  aria,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  aria: string;
  placeholder?: string;
}) {
  return (
    <label className="rbe-f rbe-f--lg rbe-tn">
      <span className="rbe-lbl">{label}</span>
      <span className={"rbe-box" + (disabled ? " is-off" : "")}>
        <input className="rbe-in rbe-in--text" value={value} placeholder={placeholder} disabled={disabled} aria-label={aria} onChange={(e) => onChange(e.target.value)} />
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
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: Size;
  /** Accessible name when the visible label needs its context. */
  aria?: string;
}) {
  return (
    <div className={"rbe-f" + sizeClass(size)}>
      {label && (
        <span className="rbe-lbl" aria-hidden="true">
          {label}
        </span>
      )}
      <BlueprintSelect
        value={value}
        onChange={(v) => onChange(v as T)}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        placeholder=""
        ariaLabel={aria || label}
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

/** A drawn checkbox: a square ink box and the tick, the native input kept for
 *  keyboard and screen readers. `title` sets it as a line's name. */
function Check({
  label,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: boolean;
}) {
  return (
    <label className={"rbe-check" + (title ? " rbe-check--title" : "") + (checked ? " is-on" : "") + (disabled ? " is-off" : "")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="rbe-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      <span className="rbe-check-t">{label}</span>
    </label>
  );
}

/** A price on the line it prices. */
function Rate({
  label,
  unit,
  value,
  onChange,
  disabled,
  aria,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  aria?: string;
}) {
  return <Num rate label={label} aria={aria ?? `${label} rate`} unit={unit} value={value} onChange={onChange} disabled={disabled} />;
}

/** The rates a line carries, falsy entries dropped — an empty list shows no rate cell. */
const rl = (...xs: Array<React.ReactElement | false | null | undefined>) => xs.filter(Boolean) as React.ReactElement[];

/** One line of an open row: the thing · this roof's quantities · its prices. */
function Line({
  title,
  rates,
  children,
  note,
}: {
  title?: React.ReactNode;
  rates?: React.ReactElement[];
  children?: React.ReactNode;
  note?: React.ReactNode;
}) {
  const hasEntries = React.Children.toArray(children).length > 0;
  const hasRates = !!rates && rates.length > 0;
  return (
    <div className={"rbe-line" + (title ? "" : " rbe-line--bare")}>
      {title ? <div className="rbe-line-t">{title}</div> : null}
      {(hasEntries || hasRates || note) && (
        <div className="rbe-line-b">
          {(hasEntries || hasRates) && (
            <div className="rbe-line-f">
              {hasEntries && <div className="rbe-ents">{children}</div>}
              {hasRates && <div className="rbe-rates">{rates}</div>}
            </div>
          )}
          {note}
        </div>
      )}
    </div>
  );
}

/** A status stamp: ok / warn / bad in the semantic tones, plain ink otherwise. */
function Stamp({ tone, children }: { tone?: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  return <span className={"rbe-stamp" + (tone ? ` is-${tone}` : "")}>{children}</span>;
}

/** One ledger row: number · name · status · chevron, and — while closed — what
 *  is picked under the name. Open, the summary gives way to the fields. */
function Row({
  n,
  id,
  title,
  summary,
  chip,
  open,
  onToggle,
  children,
}: {
  n: string;
  id: string;
  title: string;
  summary: string;
  chip?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  // Opening a row closes the open one; when that one sat above, this header
  // moves up the page. Keep it where the contractor can see it.
  const wasOpen = React.useRef(open);
  React.useLayoutEffect(() => {
    if (open && !wasOpen.current) btnRef.current?.scrollIntoView({ block: "nearest" });
    wasOpen.current = open;
  }, [open]);
  const btnId = `rbe-row-${id}`;
  const bodyId = `rbe-body-${id}`;
  return (
    <section className={`rbe-row rbe-row--${id}` + (open ? " is-open" : "")}>
      <h3 className="rbe-row-h">
        <button ref={btnRef} id={btnId} type="button" className="rbe-row-btn" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={onToggle}>
          <span className="rbe-row-n" aria-hidden="true">
            {n}
          </span>
          <span className="rbe-row-t">{title}</span>
          {chip ? <span className="rbe-row-c">{chip}</span> : null}
          <IcChev />
          {!open && <span className="rbe-row-s">{summary}</span>}
        </button>
      </h3>
      {open && (
        <div className="rbe-body" id={bodyId} role="region" aria-labelledby={btnId}>
          {children}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PACKAGE LEDGER — rows, foot, band. Owns the builder state.
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
  /** The pitch line, when the aerial data carried no pitch: it leads the ledger. */
  lead?: React.ReactNode;
  needsPitch?: boolean;
  /** Why nothing is priced while `needsPitch`: the pitch, or packs still on the way. */
  blockedReason?: string;
}) {
  // ── State, effects, handlers and derived values: verbatim from
  //    roof-package-builder.tsx (the functionality), as in variant C. ──
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
  // ── end of the verbatim block ──

  // ── Which row is open: one at a time, the roof system first. ──
  const [openId, setOpenId] = React.useState<string | null>("system");
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  // ── Summaries: what is picked, in one breath. Rates stay inside the row. ──
  // The DISPLAYED pitch, the same number the package prices on
  // (catalog.displayPitch12) — a roof this card calls 8/12 is charged as 8/12.
  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, displayPitch12(f.pitch12)), 0);
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
    spec.fasciaOn ? `fascia ${fmt(fasciaFeet(spec))} ft` : null,
    spec.fasciaOn && spec.gutterPlan !== "none" ? (spec.gutterPlan === "replace" ? "new gutters" : "gutters reset") : null,
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
  /** The flat roof's rates. `as` relabels a rate on a line that already names
   *  the thing ("Material", "Labor", "Price"); its accessible name keeps the
   *  catalog's full label, so "Price" on the hoist line is still read as the
   *  ladder hoist's price. */
  const flatRates = (keys: ReadonlyArray<FlatRateKey | false | null>, as?: Partial<Record<FlatRateKey, string>>) =>
    keys.filter((k): k is FlatRateKey => !!k).map((k) => {
      const full = FLAT_RATE_DEFS[k].label;
      const label = as?.[k] ?? full;
      const aria = label === full ? undefined : full.toLowerCase().includes(label.toLowerCase()) ? full : `${full} ${label.toLowerCase()}`;
      return <Rate key={k} label={label} aria={aria} unit={FLAT_RATE_DEFS[k].unit} value={flatRate(F, k)} onChange={(v) => setFlatRate(k, v)} disabled={disabled} />;
    });
  // How the membrane holds down — the method's plates, adhesive, ballast or
  // primer, the waterproofing under an overburden, the insulation plates.
  const attachList = flatRates([
    ...attachRates,
    ...(rule?.method === "overburden" ? (["waterproofMat", "waterproofLabor"] as const) : []),
    boards && (F.insulationId !== "none" || F.coverBoardId !== "none") && rule?.method !== "ballasted" && rule?.method !== "overburden" && rule?.method !== "induction" && "insFasteners",
  ]);

  // ── Commercial ──
  const C = spec.commercial;
  const prod = productivityFactor(facts.squares);
  const wageLabel = WAGE_REGIMES.find((w) => w.id === C.wage)?.label ?? "Open shop";
  const shiftLabel = SHIFTS.find((x) => x.id === C.shift)?.label ?? "Day shift";
  const sumCommercial = C.on
    ? [`Commercial · ${wageLabel.toLowerCase()}`, shiftLabel.toLowerCase(), C.occupied ? "occupied" : null, C.stories > 2 ? `${C.stories} stories` : null, `GC ${cRate(C, "gcPct") + cRate(C, "insurancePct")}%`].filter(Boolean).join(" · ")
    : "Residential pricing";
  const cr = (k: CommercialRateKey) => (
    <Rate key={k} label={COMMERCIAL_RATE_DEFS[k].label} unit={COMMERCIAL_RATE_DEFS[k].unit} value={cRate(C, k)} onChange={(v) => setCommercialRate(k, v)} disabled={disabled} />
  );
  const roofIsFlat = isFlatRoof(facts);

  const ventsToAdd = VENT_TYPES.filter((t) => ventOf(t.id).qty <= 0);
  const edgeEstimated = spec.edgesBasis === "estimated";
  const edgeMeasured = spec.edgesBasis === "measured";
  const lineCount = pkg.materials.length + pkg.labor.length;
  const layerOptions = (none: string) => [
    { id: "0", label: none },
    { id: "1", label: "1 layer" },
    { id: "2", label: "2 layers" },
    { id: "3", label: "3 layers" },
  ];

  // What the roof type and system picks mean against the roof that is there.
  const familyNote = lowSlope ? (
    <p className="rbe-note">
      {roofIsFlat ? `Flat roof${facts.existingMaterial ? ` · existing ${facts.existingMaterial.toLowerCase()}` : ""} · priced as a full assembly.` : "Priced as a full flat-roof assembly."}
    </p>
  ) : roofIsFlat && spec.systemId !== "standing_seam_low" ? (
    <p className="rbe-note is-warn">
      This roof reads flat — a steep system here prices a conversion.{" "}
      <button type="button" className="rbe-link" disabled={disabled} onClick={() => pickFamily("low-slope")}>
        Price it flat
      </button>
    </p>
  ) : null;
  const existingNote =
    existingFam && !lowSlope ? (
      spec.systemFamily === existingFam ? (
        <p className="rbe-note">{`Existing roof: ${facts.existingMaterial} · priced like-for-like.`}</p>
      ) : (
        <p className="rbe-note is-warn">
          {`Existing roof: ${facts.existingMaterial} — this prices a change to ${familyLabel(spec.systemFamily).toLowerCase()}.`}{" "}
          {likeForLikeSystem(existingFam, lists) && (
            <button
              type="button"
              className="rbe-link"
              disabled={disabled}
              onClick={() => {
                const s = likeForLikeSystem(existingFam, lists);
                if (s) pickSystem(s.id, lists, { auto: true });
              }}
            >
              {`Back to ${familyLabel(existingFam).toLowerCase()}`}
            </button>
          )}
        </p>
      )
    ) : null;

  // Where the edge lengths came from, and the paid report that measures them.
  const edgeSource = (
    <div className="rbe-src-note">
      {edgeMeasured ? (
        <p className="rbe-note">Lengths from aerial report{report?.reportId ? ` #${report.reportId}` : ""}.</p>
      ) : edgeEstimated ? (
        <p className="rbe-note">Estimated from the building outline. Check the lengths against the roof.</p>
      ) : estimateEdges(facts) ? (
        <p className="rbe-note">
          Lengths entered for this roof.{" "}
          <button type="button" className="rbe-link" onClick={resetEdges} disabled={disabled}>
            Reset to outline estimate
          </button>
        </p>
      ) : (
        <p className="rbe-note">Lengths entered for this roof.</p>
      )}
      {report && report.state === "none" && !edgeMeasured && (
        <div className="rbe-offer">
          <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" onClick={report.onOrder} disabled={disabled || report.busy}>
            {report.busy ? "Pricing…" : "Order measurement report"}
          </button>
          <span className="rbe-note">Paid report · usually within 48 hours · the lengths update on their own.</span>
        </div>
      )}
      {report && report.state === "pending" && (
        <div className="rbe-offer">
          <span className="rbe-note">
            Report #{report.reportId} · {report.status ?? "in process"}
          </span>
          <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" onClick={report.onCheck} disabled={disabled || report.busy}>
            {report.busy ? "Checking…" : "Check report status"}
          </button>
        </div>
      )}
    </div>
  );

  const reviewBtn = (
    <button
      type="button"
      className="btn btn-ghost rbe-btn"
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
  const convertBtn = (
    <button
      type="button"
      className="btn btn-primary rbe-btn rbe-btn--go"
      disabled={disabled || converting || needsPitch}
      onClick={() => onConvert(pkg, spec)}
      title={needsPitch ? blockedReason : "Straight to a proposal with these lines — lines you already edited below are what gets converted"}
    >
      <svg className="ic" aria-hidden="true">
        <use href="#i-file" />
      </svg>
      {converting ? "Creating…" : "Convert to proposal"}
    </button>
  );

  return (
    <>
      <div className="rbe-ledger">
        {lead}

        {/* 01 · ROOF SYSTEM */}
        <Row n="01" id="system" title="Roof system" summary={sumSystem} open={openId === "system"} onToggle={() => toggle("system")}>
          {manage === "systems" ? (
            <div className="rbe-editor">
              <p className="rbe-editor-t">Your {familyLabel(spec.systemFamily).toLowerCase()} roof types</p>
              <div className="rbe-tbl rbe-tbl--sys">
                <div className="rbe-tr rbe-th" aria-hidden="true">
                  <span>Roof type</span>
                  <span>Family</span>
                  <span>Material</span>
                  <span>Labor</span>
                  <span>Waste</span>
                  <span>Hip & ridge cap</span>
                  <span />
                </div>
                {lists.systems
                  .filter((x) => x.family === spec.systemFamily)
                  .map((s) => (
                    <div className="rbe-tr" key={s.id}>
                      <Text label="Roof type" aria="Roof type name" value={s.label} onChange={(v) => patchSystem(s.id, { label: v })} disabled={disabled} />
                      <Sel label="Family" size="md" value={s.family} options={ROOF_FAMILIES} onChange={(v) => patchSystem(s.id, { family: v as RoofFamily })} disabled={disabled} />
                      <Num label="Material" aria="Material $/sq" unit="$/sq" value={s.matPerSq} onChange={(n) => patchSystem(s.id, { matPerSq: n })} disabled={disabled} />
                      <Num label="Labor" aria="Labor $/sq" unit="$/sq" value={s.laborPerSq} onChange={(n) => patchSystem(s.id, { laborPerSq: n })} disabled={disabled} />
                      <Num label="Waste" aria="Waste %" unit="%" value={s.wastePct} onChange={(n) => patchSystem(s.id, { wastePct: n })} disabled={disabled} />
                      <Num label="Hip & ridge cap" aria="Cap $/ft" unit="$/ft" value={s.capPerFt} onChange={(n) => patchSystem(s.id, { capPerFt: n })} disabled={disabled} />
                      <button
                        type="button"
                        className="rbe-x"
                        disabled={disabled || lists.systems.length <= 1 || s.id === spec.systemId}
                        aria-label={`Remove ${s.label}`}
                        title={s.id === spec.systemId ? "In use on this estimate — pick another system first" : "Remove"}
                        onClick={() => removeSystem(s.id)}
                      >
                        <IcX />
                      </button>
                    </div>
                  ))}
              </div>
              <div className="rbe-acts">
                <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" disabled={disabled} onClick={addSystem}>
                  <IcPlus />
                  Add roof type
                </button>
                <button type="button" className="rbe-link" disabled={disabled} onClick={resetLists}>
                  Restore built-in list
                </button>
                <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet rbe-done" onClick={() => setManage(null)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <Line
              rates={rl(
                <Rate key="m" label="Material" aria="System material rate" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => setSystemRate("matPerSq", v)} disabled={disabled} />,
                <Rate key="l" label="Install labor" aria="System install labor rate" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => setSystemRate("laborPerSq", v)} disabled={disabled} />,
                !lowSlope && <Rate key="c" label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => setSystemRate("capPerFt", v)} disabled={disabled} />,
              )}
              note={
                <div className="rbe-notes">
                  {familyNote}
                  {existingNote}
                  <p className="rbe-note">
                    <button type="button" className="rbe-link" disabled={disabled} onClick={() => setManage("systems")}>
                      Add roof type
                    </button>
                  </p>
                </div>
              }
            >
              <Sel
                label="Roof type"
                size="md"
                value={spec.systemFamily}
                options={ROOF_FAMILIES.filter((f) => f.id === spec.systemFamily || lists.systems.some((x) => x.family === f.id))}
                onChange={(v) => pickFamily(v as RoofFamily)}
                disabled={disabled}
              />
              <Sel
                label="System"
                size="lg"
                value={spec.systemId}
                options={[...lists.systems.filter((x) => x.family === spec.systemFamily || x.id === spec.systemId), { id: CUSTOM_SYSTEM, label: lowSlope ? "＋ Custom flat system…" : "＋ Custom roof type…" }]}
                onChange={(id) => (id === CUSTOM_SYSTEM ? addSystem() : pickSystem(id))}
                disabled={disabled}
              />
              <Sel label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} />
            </Line>
          )}
        </Row>

        {!lowSlope ? (
          <>
            {/* 02 · UNDERLAYMENT */}
            <Row n="02" id="under" title="Underlayment" summary={sumUnder} open={openId === "under"} onToggle={() => toggle("under")}>
              {manage === "underlayments" ? (
                <div className="rbe-editor">
                  <p className="rbe-editor-t">Your underlayments</p>
                  <div className="rbe-tbl rbe-tbl--und">
                    <div className="rbe-tr rbe-th" aria-hidden="true">
                      <span>Underlayment</span>
                      <span>Price</span>
                      <span />
                    </div>
                    {lists.underlayments.map((u) => (
                      <div className="rbe-tr" key={u.id}>
                        <Text label="Underlayment" aria="Underlayment name" value={u.label} onChange={(v) => patchUnderlayment(u.id, { label: v })} disabled={disabled} />
                        <Num label="Price" aria="Underlayment $/sq" unit="$/sq" value={u.perSq} onChange={(n) => patchUnderlayment(u.id, { perSq: n })} disabled={disabled} />
                        <button type="button" className="rbe-x" disabled={disabled || lists.underlayments.length <= 1} aria-label={`Remove ${u.label}`} title="Remove" onClick={() => removeUnderlayment(u.id)}>
                          <IcX />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="rbe-acts">
                    <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" disabled={disabled} onClick={addUnderlayment}>
                      <IcPlus />
                      Add underlayment
                    </button>
                    <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet rbe-done" onClick={() => setManage(null)}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Line
                    rates={rl(<Rate key="u" label="Price" aria="Underlayment price rate" unit="$/sq" value={spec.underlaymentPerSq} onChange={(v) => set("underlaymentPerSq", v)} disabled={disabled} />)}
                    note={
                      <p className="rbe-note">
                        <button type="button" className="rbe-link" disabled={disabled} onClick={() => setManage("underlayments")}>
                          Add underlayment
                        </button>
                      </p>
                    }
                  >
                    <Sel label="Underlayment" size="lg" value={spec.underlaymentId} options={lists.underlayments} onChange={(id) => pickUnderlayment(id)} disabled={disabled} />
                  </Line>
                  <Line
                    rates={rl(
                      spec.iceWater !== "none" && (
                        <Rate key="i" label="Price" aria="Ice & water price rate" unit="$/sq ft" value={spec.iceWaterPerSqft} onChange={(v) => set("iceWaterPerSqft", v)} disabled={disabled} />
                      ),
                    )}
                  >
                    <Sel label="Ice & water" size="lg" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} />
                  </Line>
                </>
              )}
            </Row>

            {/* 03 · EDGES */}
            <Row
              n="03"
              id="edges"
              title="Edges"
              summary={sumEdges}
              chip={<Stamp tone={edgeMeasured ? "ok" : edgeEstimated ? "warn" : undefined}>{edgeMeasured ? "measured" : edgeEstimated ? "estimated" : "entered"}</Stamp>}
              open={openId === "edges"}
              onToggle={() => toggle("edges")}
            >
              <Line title="Lengths" note={edgeSource}>
                <Num label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
                <Num label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
                <Num label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
                <Num label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
              </Line>
              <Line
                title={<Check title label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />}
                rates={spec.dripEdgeOn ? rl(<Rate key="d" label="Price" aria="Drip edge price rate" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />) : undefined}
              >
                {spec.dripEdgeOn && (
                  <>
                    <Sel label="Profile" size="md" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} />
                    <Sel label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} />
                  </>
                )}
              </Line>
              {!noStarter && (
                <Line
                  title={<Check title label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />}
                  rates={spec.starterOn ? rl(<Rate key="s" label="Price" aria="Starter strip price rate" unit="$/ft" value={spec.starterPerFt} onChange={(v) => set("starterPerFt", v)} disabled={disabled} />) : undefined}
                />
              )}
              {/* FASCIA (owner, 2026-09-19) — the board the gutter hangs on,
                  open only while the roof is off, so a tear-off opens with it
                  in. The gutters have to come down either way. */}
              <Line
                title={<Check title label="Replace fascia" checked={spec.fasciaOn} onChange={(v) => set("fasciaOn", v)} disabled={disabled} />}
                rates={
                  spec.fasciaOn
                    ? rl(
                        <Rate key="b" label="Material" aria="Fascia material rate" unit="$/ft" value={spec.fasciaPerFt} onChange={(v) => set("fasciaPerFt", v)} disabled={disabled} />,
                        <Rate key="l" label="Labor" aria="Fascia labor rate" unit="$/ft" value={spec.fasciaLaborPerFt} onChange={(v) => set("fasciaLaborPerFt", v)} disabled={disabled} />,
                      )
                    : undefined
                }
                note={
                  spec.fasciaOn && fasciaFeet(spec) <= 0 ? (
                    <p className="rbe-note is-warn">Fascia is on, but there is no length to price it — enter the eave, or set the run to a figure of your own.</p>
                  ) : !spec.fasciaOn && spec.tearOffLayers > 0 ? (
                    <p className="rbe-note">The fascia stays. It is only reachable while the roof is off, so it is worth a look before the tear-off.</p>
                  ) : null
                }
              >
                {spec.fasciaOn && (
                  <>
                    <Sel label="Board" aria="Fascia board" size="lg" value={spec.fasciaOptionId} options={FASCIA_OPTIONS} onChange={pickFascia} disabled={disabled} />
                    <Sel label="Runs" aria="Fascia runs" size="md" value={spec.fasciaRun} options={FASCIA_RUNS} onChange={(v) => set("fasciaRun", v as FasciaRun)} disabled={disabled} />
                    {spec.fasciaRun === "custom" && <Num label="Length" aria="Fascia length" unit="ft" value={spec.fasciaFt} onChange={(v) => set("fasciaFt", v)} disabled={disabled} />}
                  </>
                )}
              </Line>
              {spec.fasciaOn && (
                <Line
                  title="Gutters"
                  rates={
                    spec.gutterPlan !== "none"
                      ? rl(
                          <Rate
                            key="g"
                            label={spec.gutterPlan === "replace" ? "New gutter" : "Reset"}
                            aria="Gutter rate"
                            unit="$/ft"
                            value={spec.gutterPlan === "replace" ? spec.gutterPerFt : spec.gutterResetPerFt}
                            onChange={(v) => set(spec.gutterPlan === "replace" ? "gutterPerFt" : "gutterResetPerFt", v)}
                            disabled={disabled}
                          />,
                        )
                      : undefined
                  }
                >
                  <Sel label="While the fascia is off" aria="Gutters" size="lg" value={spec.gutterPlan} options={GUTTER_PLANS} onChange={(v) => set("gutterPlan", v as GutterPlan)} disabled={disabled} />
                  {spec.gutterPlan !== "none" && (
                    <Num label="Length" aria="Gutter length" unit="ft" value={spec.gutterFt > 0 ? spec.gutterFt : Math.round(gutterFeet(spec))} onChange={(v) => set("gutterFt", v)} disabled={disabled} />
                  )}
                </Line>
              )}
            </Row>

            {/* 04 · FLASHING */}
            <Row n="04" id="flash" title="Flashing" summary={sumFlash} open={openId === "flash"} onToggle={() => toggle("flash")}>
              <Line
                title="Valleys"
                rates={rl(
                  <Rate key="m" label="Metal" aria="Valley metal rate" unit="$/ft" value={spec.valleyMatPerFt} onChange={(v) => set("valleyMatPerFt", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Valley labor rate" unit="$/ft" value={spec.valleyLaborPerFt} onChange={(v) => set("valleyLaborPerFt", v)} disabled={disabled} />,
                )}
              >
                <Num label="Count" aria="Valley count" unit="each" value={spec.valleyCount} onChange={(v) => setValleyField("valleyCount", v)} disabled={disabled} />
                <Num label="Length each" aria="Valley length each" unit="ft" value={spec.valleyFtEach} onChange={(v) => setValleyField("valleyFtEach", v)} disabled={disabled} />
                <Sel label="Type" aria="Valley type" size="lg" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} />
              </Line>
              <Line
                title="Sidewalls · step flashing"
                rates={rl(
                  <Rate key="p" label="Step piece" unit="$/ea" value={spec.stepPerPiece} onChange={(v) => set("stepPerPiece", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Step labor rate" unit="$/ft" value={spec.stepLaborPerFt} onChange={(v) => set("stepLaborPerFt", v)} disabled={disabled} />,
                )}
              >
                <Num label="Walls" unit="each" value={spec.stepWallCount} onChange={(v) => setStepField("stepWallCount", v)} disabled={disabled} />
                <Num label="Length each" aria="Sidewall length each" unit="ft" value={spec.stepWallFtEach} onChange={(v) => setStepField("stepWallFtEach", v)} disabled={disabled} />
                <Sel label="Step size" size="lg" value={spec.stepSizeId} options={STEP_FLASHING_SIZES} onChange={pickStep} disabled={disabled} />
              </Line>
              <Line
                title="Apron / headwall"
                rates={rl(
                  <Rate key="m" label="Metal" aria="Apron metal rate" unit="$/ft" value={spec.apronPerFt} onChange={(v) => set("apronPerFt", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Apron labor rate" unit="$/ft" value={spec.apronLaborPerFt} onChange={(v) => set("apronLaborPerFt", v)} disabled={disabled} />,
                )}
              >
                <Num label="Length" aria="Apron / headwall length" unit="ft" value={spec.apronFt} onChange={(v) => set("apronFt", v)} disabled={disabled} />
              </Line>
              <Line
                title="Counter flashing"
                rates={rl(
                  <Rate key="m" label="Metal" aria="Counter metal rate" unit="$/ft" value={spec.counterPerFt} onChange={(v) => set("counterPerFt", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Counter labor rate" unit="$/ft" value={spec.counterLaborPerFt} onChange={(v) => set("counterLaborPerFt", v)} disabled={disabled} />,
                )}
              >
                <Num label="Length" aria="Counter flashing length" unit="ft" value={spec.counterFt} onChange={(v) => set("counterFt", v)} disabled={disabled} />
              </Line>
              <Line title="Pipe boots">
                {PIPE_BOOT_SIZES.map((s) => (
                  <Num key={s.id} label={s.label} aria={`Pipe boots ${s.label}`} unit="each" value={spec.pipeBoots[s.id] ?? 0} onChange={(v) => set("pipeBoots", { ...spec.pipeBoots, [s.id]: v })} disabled={disabled} />
                ))}
              </Line>
              <Line
                title="Chimneys"
                rates={rl(
                  <Rate key="k" label="Kit" aria="Chimney kit rate" unit="$/ea" value={spec.chimneyEach} onChange={(v) => set("chimneyEach", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Chimney labor rate" unit="$/ea" value={spec.chimneyLabor} onChange={(v) => set("chimneyLabor", v)} disabled={disabled} />,
                )}
              >
                <Num label="Count" aria="Chimney count" unit="each" value={spec.chimneyCount} onChange={(v) => set("chimneyCount", v)} disabled={disabled} />
                <Sel label="Size" aria="Chimney size" size="lg" value={spec.chimneySizeId} options={CHIMNEY_SIZES} onChange={pickChimney} disabled={disabled} />
              </Line>
              <Line
                title="Curbs"
                rates={rl(
                  <Rate key="k" label="Kit" aria="Curb kit rate" unit="$/ea" value={spec.curbEach} onChange={(v) => set("curbEach", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Curb labor rate" unit="$/ea" value={spec.curbLabor} onChange={(v) => set("curbLabor", v)} disabled={disabled} />,
                )}
              >
                <Num label="Count" aria="Curb count" unit="each" value={spec.curbCount} onChange={(v) => set("curbCount", v)} disabled={disabled} />
              </Line>
            </Row>

            {/* 05 · VENTS */}
            <Row
              n="05"
              id="vents"
              title="Vents"
              summary={sumVents}
              chip={vent ? <Stamp tone={vent.ok ? "ok" : "bad"}>{vent.ok ? "balanced" : "short"}</Stamp> : undefined}
              open={openId === "vents"}
              onToggle={() => toggle("vents")}
            >
              {vent ? (
                <Line title="Attic check">
                  {/* The attic check as four figures, label over value. */}
                  <dl className="rbe-figs" aria-label="Attic ventilation check">
                    <div className="rbe-fig">
                      <dt>Attic</dt>
                      <dd>
                        {fmt(facts.footprintSqft ?? 0)}
                        <small>sq ft</small>
                      </dd>
                    </div>
                    <div className="rbe-fig">
                      <dt>Needs</dt>
                      <dd>
                        {fmt(vent.requiredSqIn)}
                        <small>sq in net free area</small>
                      </dd>
                    </div>
                    <div className="rbe-fig">
                      <dt>Exhaust</dt>
                      <dd>
                        {fmt(vent.exhaustSqIn)}
                        <small>sq in</small>
                        {vent.poweredExhaust ? <small>+ {vent.poweredExhaust} powered</small> : null}
                      </dd>
                    </div>
                    <div className="rbe-fig">
                      <dt>Intake</dt>
                      <dd>
                        {fmt(vent.intakeSqIn)}
                        <small>sq in</small>
                      </dd>
                    </div>
                  </dl>
                </Line>
              ) : (
                <p className="rbe-note">No footprint on this measurement, so the attic check is off — add what the roof needs.</p>
              )}
              {ventsOn.length > 0 && (
                <div className="rbe-tbl rbe-tbl--vent">
                  <div className="rbe-tr rbe-th" aria-hidden="true">
                    <span>Vent</span>
                    <span>Quantity</span>
                    <span>Material</span>
                    <span>Labor</span>
                    <span className="rbe-th-r">Total</span>
                    <span />
                  </div>
                  {ventsOn.map((t) => {
                    const v = ventOf(t.id);
                    const each = t.unit === "each";
                    return (
                      <div className="rbe-tr" key={t.id}>
                        <span className="rbe-vname rbe-tn">
                          {t.label}
                          <em>
                            {t.role}
                            {t.nfaSqIn ? ` · ${t.nfaSqIn} sq in${each ? "" : "/ft"}` : " · powered"}
                          </em>
                        </span>
                        <Num label="Quantity" aria={`${t.label} quantity`} unit={each ? "each" : "ft"} value={v.qty} onChange={(n) => setVent(t.id, { qty: n })} disabled={disabled} />
                        <Num rate label="Material" aria={`${t.label} material`} unit={each ? "$/ea" : "$/ft"} value={v.each} onChange={(n) => setVent(t.id, { each: n })} disabled={disabled} />
                        <Num rate label="Labor" aria={`${t.label} labor`} unit={each ? "$/ea" : "$/ft"} value={v.labor} onChange={(n) => setVent(t.id, { labor: n })} disabled={disabled} />
                        <span className="rbe-vtotal">
                          <span>Total</span>
                          {money(v.qty * (v.each + v.labor))}
                        </span>
                        <button type="button" className="rbe-x" disabled={disabled} aria-label={`Remove ${t.label}`} title="Remove" onClick={() => setVent(t.id, { qty: 0 })}>
                          <IcX />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="rbe-acts rbe-acts--vents">
                {ventsToAdd.length > 0 && (
                  <div className="rbe-f rbe-f--lg rbe-f--add">
                    <BlueprintSelect
                      value=""
                      onChange={(id) => {
                        if (id) setVent(id, { qty: 1 });
                      }}
                      options={ventsToAdd.map((t) => ({ value: t.id, label: t.label }))}
                      placeholder="＋ Add a vent…"
                      ariaLabel="Add a vent"
                      disabled={disabled}
                      styles={SEL_STYLES}
                    />
                  </div>
                )}
                <Check label="Balanced system · 1/300 rule" checked={spec.ventBalanced} onChange={(v) => set("ventBalanced", v)} disabled={disabled} />
              </div>
            </Row>

            {/* 06 · TEAR-OFF & EXTRAS */}
            <Row n="06" id="tear" title="Tear-off & extras" summary={sumTear} open={openId === "tear"} onToggle={() => toggle("tear")}>
              <Line
                title="Tear-off"
                rates={rl(
                  <Rate key="t" label="Labor" aria="Tear-off labor rate" unit="$/sq·layer" value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />,
                  <Rate key="d" label="Disposal" unit="$/sq·layer" value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />,
                )}
              >
                <Sel label="Layers" aria="Tear-off layers" size="md" value={String(spec.tearOffLayers)} options={layerOptions("None · overlay")} onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)} disabled={disabled} />
              </Line>
              <Line
                title="Deck sheets"
                rates={rl(
                  <Rate key="s" label="Sheet" aria="Deck sheet rate" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Deck sheet labor rate" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />,
                )}
              >
                <Num label="Sheets" aria="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
              </Line>
              <Line
                title="Nails & sealant"
                rates={rl(
                  <Rate key="n" label="Nails & fasteners" unit="$/sq" value={spec.nailsPerSq} onChange={(v) => set("nailsPerSq", v)} disabled={disabled} />,
                  <Rate key="s" label="Sealant & collars" unit="$/sq" value={spec.sealantPerSq} onChange={(v) => set("sealantPerSq", v)} disabled={disabled} />,
                )}
              />
              <Line
                title="Job extras"
                note={steepest < 8 ? <p className="rbe-note">Steep safety applies from 8/12 — this roof is {steepest > 0 ? `${steepest}/12` : "flatter"}, so it stays off.</p> : null}
              >
                <Num label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
                <Num label="Steep safety" unit="$" value={spec.safetyLump} onChange={(v) => set("safetyLump", v)} disabled={disabled} />
                {!spec.commercial.on && <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />}
                <Num label="Delivery" unit="$" value={spec.deliveryLump ?? 0} onChange={(v) => set("deliveryLump", v)} disabled={disabled} />
              </Line>
            </Row>
          </>
        ) : (
          <>
            {/* 02 · INSULATION & COVER BOARD — or the prep a coating needs */}
            <Row n="02" id="boards" title={surface ? "Surface prep" : "Insulation & cover board"} summary={sumBoards} open={openId === "boards"} onToggle={() => toggle("boards")}>
              {surface ? (
                <>
                  <Line title="Wash, repair & fabric" rates={flatRates(["washMat", "washLabor", "repairMat", "repairLabor"])} />
                  <Line
                    title={<Check title label="Primer" checked={F.primerOn} onChange={(v) => setFlat("primerOn", v)} disabled={disabled} />}
                    rates={flatRates([F.primerOn && "primerCoatMat", F.primerOn && "primerCoatLabor"])}
                  />
                  <Line title="Wet insulation" rates={flatRates(["wetIns"], { wetIns: "Price" })}>
                    <Num label="Area" aria="Wet insulation area" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
                  </Line>
                  <Line
                    title="Core cuts"
                    rates={flatRates(["coreEach"], { coreEach: "Price" })}
                    note={<p className="rbe-note">Goes over the existing roof — no tear-off, insulation or new edge metal. Core cuts confirm the roof underneath is dry; wet areas are cut out and replaced first.</p>}
                  >
                    <Num label="Count" aria="Core cut count" unit="each" value={F.coreCuts} onChange={(v) => setFlat("coreCuts", v)} disabled={disabled} />
                  </Line>
                </>
              ) : boards ? (
                <>
                  <Line
                    title="Insulation"
                    rates={
                      F.insulationId !== "none"
                        ? rl(
                            <Rate key="m" label="Material" aria="Insulation material rate" unit="$/sq" value={F.insulationMatPerSq} onChange={(v) => setFlat("insulationMatPerSq", v)} disabled={disabled} />,
                            <Rate key="l" label="Labor" aria="Insulation labor rate" unit="$/sq" value={F.insulationLaborPerSq} onChange={(v) => setFlat("insulationLaborPerSq", v)} disabled={disabled} />,
                          )
                        : undefined
                    }
                    note={
                      spec.commercial.on && F.insulationId === "none" ? (
                        <p className="rbe-note is-warn">A tear-off to the deck on a commercial building usually has to meet the energy code — about R-25 to R-30 of insulation.</p>
                      ) : null
                    }
                  >
                    <Sel label="Type" aria="Insulation" size="lg" value={F.insulationId} options={INSULATION_OPTIONS} onChange={(v) => pickBoard("insulation", v)} disabled={disabled} />
                  </Line>
                  <Line
                    title="Cover board"
                    rates={
                      F.coverBoardId !== "none"
                        ? rl(
                            <Rate key="m" label="Material" aria="Cover board material rate" unit="$/sq" value={F.coverBoardMatPerSq} onChange={(v) => setFlat("coverBoardMatPerSq", v)} disabled={disabled} />,
                            <Rate key="l" label="Labor" aria="Cover board labor rate" unit="$/sq" value={F.coverBoardLaborPerSq} onChange={(v) => setFlat("coverBoardLaborPerSq", v)} disabled={disabled} />,
                          )
                        : undefined
                    }
                  >
                    <Sel label="Type" aria="Cover board" size="lg" value={F.coverBoardId} options={COVER_BOARDS} onChange={(v) => pickBoard("cover", v)} disabled={disabled} />
                  </Line>
                  <Line title="Tapered & crickets" rates={flatRates([F.taperedSqft > 0 && "taperedMat", F.taperedSqft > 0 && "taperedLabor"], { taperedMat: "Material", taperedLabor: "Labor" })}>
                    <Num label="Area" aria="Tapered & crickets area" unit="sq ft" value={F.taperedSqft} onChange={(v) => setFlat("taperedSqft", v)} disabled={disabled} />
                  </Line>
                  {attachList.length > 0 && <Line title="Attachment" rates={attachList} />}
                  <Line title="Wet areas" rates={flatRates([F.wetInsulationSqft > 0 && "wetIns"], { wetIns: "Price" })}>
                    <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
                  </Line>
                </>
              ) : (
                <>
                  <p className="rbe-note">
                    {rule?.method === "nailed" ? "Rolled roofing is nailed to the deck" : "A liquid-applied membrane goes on the prepared deck"} — no insulation or cover board.
                  </p>
                  {attachList.length > 0 && <Line title="Attachment" rates={attachList} />}
                  <Line title="Wet areas" rates={flatRates([F.wetInsulationSqft > 0 && "wetIns"], { wetIns: "Price" })}>
                    <Num label="Wet insulation" unit="sq ft" value={F.wetInsulationSqft} onChange={(v) => setFlat("wetInsulationSqft", v)} disabled={disabled} />
                  </Line>
                </>
              )}
            </Row>

            {/* 03 · EDGES & WALLS */}
            <Row
              n="03"
              id="walls"
              title="Edges & walls"
              summary={sumWalls}
              chip={splitOff ? <Stamp tone="bad">check split</Stamp> : undefined}
              open={openId === "walls"}
              onToggle={() => toggle("walls")}
            >
              <Line
                title="Perimeter"
                note={
                  <p className={"rbe-note" + (splitOff ? " is-warn" : "")}>
                    {perimeterFt > 0 ? `Outline perimeter ${fmt(perimeterFt)} ft — parapet plus open edge should add up to it. ` : "No outline perimeter — enter the lengths from the photo. "}
                    {surface
                      ? "A coating keeps the existing edge metal and coping; these lengths still size the fall protection."
                      : "Coping caps the parapets; ES-1 edge metal finishes the open edges; wall flashing is wherever the roof meets a taller wall."}
                  </p>
                }
              >
                <Num label="Outline" aria="Perimeter" unit="ft" value={perimeterFt} onChange={(v) => setSpec((prev) => ({ ...prev, eaveFt: v, rakeFt: 0, edgesBasis: "entered" }))} disabled={disabled} />
              </Line>
              <Line title="Parapet" rates={surface ? undefined : flatRates(["copingMat", "copingLabor"])}>
                <Num label="Length" aria="Parapet length" unit="ft" value={F.parapetFt} onChange={(v) => setFlat("parapetFt", v)} disabled={disabled} />
                <Num label="Height" aria="Parapet height" unit="in" value={F.parapetHeightIn} onChange={(v) => setFlat("parapetHeightIn", v)} disabled={disabled} />
              </Line>
              <Line title="Open edge" rates={surface ? undefined : flatRates(["edgeMat", "edgeLabor"])}>
                <Num label="Length" aria="Open edge length" unit="ft" value={F.edgeMetalFt} onChange={(v) => setFlat("edgeMetalFt", v)} disabled={disabled} />
              </Line>
              {!surface && (
                <Line title="Wall flashing" rates={flatRates([F.wallFt > 0 && "termBarMat", F.wallFt > 0 && "termBarLabor", F.wallFt > 0 && "counterMat", F.wallFt > 0 && "counterLabor"])}>
                  <Num label="Length" aria="Wall flashing length" unit="ft" value={F.wallFt} onChange={(v) => setFlat("wallFt", v)} disabled={disabled} />
                </Line>
              )}
              {!surface && <Line title="Base flashing" rates={flatRates(["baseFlashMat", "baseFlashLabor"], { baseFlashMat: "Material", baseFlashLabor: "Labor" })} />}
              {boards && !surface && (
                <Line
                  title={<Check title label="Wood nailers" checked={F.nailersOn} onChange={(v) => setFlat("nailersOn", v)} disabled={disabled} />}
                  rates={flatRates([F.nailersOn && "nailerMat", F.nailersOn && "nailerLabor"])}
                  note={<p className="rbe-note">Built up to the insulation height at the open edges.</p>}
                />
              )}
              <Line title="Fall protection" rates={flatRates(["warningLine"])} />
            </Row>

            {/* 04 · DRAINS & PENETRATIONS */}
            <Row n="04" id="drains" title="Drains & curbs" summary={sumDrains} open={openId === "drains"} onToggle={() => toggle("drains")}>
              {!surface && (
                <Line
                  title="Roof drains"
                  rates={flatRates([
                    F.drains > 0 && (F.drainWork === "new" ? "drainNewMat" : F.drainWork === "ring" ? "drainRingMat" : "drainInsertMat"),
                    F.drains > 0 && (F.drainWork === "new" ? "drainNewLabor" : F.drainWork === "ring" ? "drainRingLabor" : "drainInsertLabor"),
                  ])}
                >
                  <Num label="Count" aria="Roof drain count" unit="each" value={F.drains} onChange={(v) => setFlat("drains", Math.round(v))} disabled={disabled} />
                  <Sel label="Drain work" size="lg" value={F.drainWork} options={DRAIN_WORK} onChange={(v) => setFlat("drainWork", v as DrainWork)} disabled={disabled} />
                </Line>
              )}
              {!surface && (
                <Line
                  title="Overflow"
                  rates={flatRates([
                    F.drains > 0 && F.secondary === "scupper" && "overflowScupperMat",
                    F.drains > 0 && F.secondary === "scupper" && "overflowScupperLabor",
                    F.drains > 0 && F.secondary === "drain" && "overflowDrainMat",
                    F.drains > 0 && F.secondary === "drain" && "overflowDrainLabor",
                  ])}
                >
                  <Sel label="Type" aria="Overflow" size="md" value={F.secondary} options={SECONDARY_DRAINAGE} onChange={(v) => setFlat("secondary", v as SecondaryDrainage)} disabled={disabled} />
                </Line>
              )}
              <Line title="Thru-wall scuppers" rates={flatRates([F.scuppers > 0 && "scupperMat", F.scuppers > 0 && "scupperLabor"])}>
                <Num label="Count" aria="Thru-wall scupper count" unit="each" value={F.scuppers} onChange={(v) => setFlat("scuppers", Math.round(v))} disabled={disabled} />
              </Line>
              <Line title="Gutter" rates={flatRates([F.gutterFt > 0 && "gutterMat", F.gutterFt > 0 && "gutterLabor"], { gutterMat: "Material", gutterLabor: "Labor" })}>
                <Num label="Length" aria="Gutter length" unit="ft" value={F.gutterFt} onChange={(v) => setFlat("gutterFt", v)} disabled={disabled} />
              </Line>
              <Line title="Pipe boots" rates={flatRates(["bootMat", "bootLabor"])}>
                <Num label="Count" aria="Pipe boot count" unit="each" value={F.pipeBoots} onChange={(v) => setFlat("pipeBoots", Math.round(v))} disabled={disabled} />
              </Line>
              <Line title="Pitch pockets" rates={flatRates([F.pitchPockets > 0 && "pocketMat", F.pitchPockets > 0 && "pocketLabor"], { pocketMat: "Material", pocketLabor: "Labor" })}>
                <Num label="Count" aria="Pitch pocket count" unit="each" value={F.pitchPockets} onChange={(v) => setFlat("pitchPockets", Math.round(v))} disabled={disabled} />
              </Line>
              {!surface && (
                <Line title="Rooftop units" rates={flatRates([F.rtuCount > 0 && "rtuMat", F.rtuCount > 0 && "rtuLabor"])}>
                  <Num label="Count" aria="Rooftop unit count" unit="each" value={F.rtuCount} onChange={(v) => setFlat("rtuCount", Math.round(v))} disabled={disabled} />
                </Line>
              )}
              <Line title="Units raised & reset" rates={flatRates([F.rtuResetCount > 0 && "rtuReset"], { rtuReset: "Price" })}>
                <Num label="Count" aria="Units raised & reset count" unit="each" value={F.rtuResetCount} onChange={(v) => setFlat("rtuResetCount", Math.round(v))} disabled={disabled} />
              </Line>
              {!surface && (
                <Line title="Skylights, hatches, curbs" rates={flatRates([F.curbs > 0 && "curbMat", F.curbs > 0 && "curbLabor"])}>
                  <Num label="Count" aria="Skylights, hatches, curbs count" unit="each" value={F.curbs} onChange={(v) => setFlat("curbs", Math.round(v))} disabled={disabled} />
                </Line>
              )}
              {surface && <p className="rbe-note">A coating details drains and curbs with fabric and coating — no new drains or curb flashing are priced.</p>}
            </Row>

            {/* 05 · ROOFTOP, ACCESS & WARRANTY */}
            <Row n="05" id="rooftop" title="Access & warranty" summary={sumRooftop} open={openId === "rooftop"} onToggle={() => toggle("rooftop")}>
              <Line title="Walkway pads" rates={flatRates([F.walkwayFt > 0 && "walkwayMat", F.walkwayFt > 0 && "walkwayLabor"], { walkwayMat: "Material", walkwayLabor: "Labor" })}>
                <Num label="Length" aria="Walkway pads length" unit="ft" value={F.walkwayFt} onChange={(v) => setFlat("walkwayFt", v)} disabled={disabled} />
              </Line>
              <Line title="Crane" rates={flatRates([F.craneHours > 0 && "craneRate", F.craneHours > 0 && "craneMob"])}>
                <Num label="Hours" aria="Crane hours" unit="hours" value={F.craneHours} onChange={(v) => setFlat("craneHours", v)} disabled={disabled} />
              </Line>
              {F.craneHours <= 0 && (
                <Line title={<Check title label="Ladder hoist / conveyor" checked={F.hoistOn} onChange={(v) => setFlat("hoistOn", v)} disabled={disabled} />} rates={flatRates([F.hoistOn && "hoist"], { hoist: "Price" })} />
              )}
              {!surface && (
                <Line title="Core cuts" rates={flatRates([F.coreCuts > 0 && "coreEach"], { coreEach: "Price" })}>
                  <Num label="Count" aria="Core cut count" unit="each" value={F.coreCuts} onChange={(v) => setFlat("coreCuts", Math.round(v))} disabled={disabled} />
                </Line>
              )}
              <Line
                title="Warranty"
                rates={
                  F.warrantyId !== "none"
                    ? [<Rate key="fee" label="Warranty fee" unit="$/sq" value={F.warrantyPerSq} onChange={(v) => setFlat("warrantyPerSq", v)} disabled={disabled} />, ...flatRates(["warrantyInspection"])]
                    : undefined
                }
              >
                <Sel label="Coverage" aria="Warranty" size="lg" value={F.warrantyId} options={WARRANTIES} onChange={pickWarranty} disabled={disabled} />
              </Line>
              <Line title="Crew pace" rates={flatRates([rule?.method === "torch" && "fireWatch", rule?.method === "hot" && "kettle", !surface && spec.tearOffLayers > 0 && "nightSeal"])}>
                <Num label="Squares per day" unit="sq" value={F.productionSqPerDay} onChange={(v) => setFlat("productionSqPerDay", Math.max(1, v))} disabled={disabled} />
              </Line>
            </Row>

            {/* 06 · TEAR-OFF & EXTRAS */}
            <Row n="06" id="flatTear" title="Tear-off & extras" summary={sumFlatTear} open={openId === "flatTear"} onToggle={() => toggle("flatTear")}>
              {!surface && (
                <Line
                  title="Tear-off"
                  rates={
                    spec.tearOffLayers > 0
                      ? [
                          <Rate key="t" label="Labor" aria="Tear-off labor rate" unit="$/sq·layer" value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />,
                          <Rate key="d" label="Disposal" unit="$/sq·layer" value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />,
                          ...(F.existing === "bur_gravel" ? flatRates(["gravelVac"]) : []),
                        ]
                      : undefined
                  }
                >
                  <Sel label="Existing roof" size="lg" value={F.existing} options={EXISTING_LOW_SLOPE} onChange={(v) => pickExisting(v as ExistingLowSlope)} disabled={disabled} />
                  <Sel label="Layers" aria="Tear-off layers" size="md" value={String(spec.tearOffLayers)} options={layerOptions("Recover (none)")} onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)} disabled={disabled} />
                </Line>
              )}
              <Line
                title="Deck sheets"
                rates={rl(
                  <Rate key="s" label="Sheet" aria="Deck sheet rate" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />,
                  <Rate key="l" label="Labor" aria="Deck sheet labor rate" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />,
                )}
              >
                <Num label="Sheets" aria="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
              </Line>
              <Line title="Job extras" note={spec.commercial.on ? <p className="rbe-note">The permit is priced on the job value in 07 · Commercial job.</p> : null}>
                <Num label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
                {!spec.commercial.on && <Num label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />}
              </Line>
            </Row>
          </>
        )}

        {/* 07 · COMMERCIAL JOB — either kind of roof */}
        <Row n="07" id="commercial" title="Commercial job" summary={sumCommercial} chip={C.on ? <Stamp>commercial</Stamp> : undefined} open={openId === "commercial"} onToggle={() => toggle("commercial")}>
          <Line
            title={<Check title label="Commercial pricing" checked={C.on} onChange={toggleCommercial} disabled={disabled} />}
            note={
              <p className="rbe-note">
                {C.on
                  ? `${prod < 1 ? `Field install labor ×${prod} at ${fmt(facts.squares)} squares — a big deck goes down faster per square. ` : ""}Adds mobilization, a safety plan${spec.tearOffLayers > 0 ? ", the asbestos survey before tear-off" : ""}${facts.squares >= 50 ? ", a superintendent" : ""}, a permit on the job value, and general conditions & insurance on everything except the at-cost fees.`
                  : "Priced as residential. Turn this on for a store, warehouse, school or apartment building."}
              </p>
            }
          />
          {C.on && (
            <>
              <Line title="Crew" rates={rl(C.wage === "prevailing" && cr("payroll"))}>
                <Sel label="Labor" aria="Labor rules" size="md" value={C.wage} options={WAGE_REGIMES} onChange={(v) => setCommercial("wage", v as WageRegime)} disabled={disabled} />
              </Line>
              <Line title="Schedule" rates={rl(C.shift === "night" && cr("lightTower"))}>
                <Sel label="Shift" aria="Schedule" size="lg" value={C.shift} options={SHIFTS} onChange={(v) => setCommercial("shift", v as Shift)} disabled={disabled} />
              </Line>
              <Line title="Building" rates={rl(C.occupied && cr("interior"))}>
                <Num label="Stories" unit="floors" value={C.stories} onChange={(v) => setCommercial("stories", Math.max(1, Math.round(v)))} disabled={disabled} />
                <Check label="Occupied during work" checked={C.occupied} onChange={(v) => setCommercial("occupied", v)} disabled={disabled} />
                <Check label="Payment & performance bond" checked={C.bondOn} onChange={(v) => setCommercial("bondOn", v)} disabled={disabled} />
              </Line>
              <Line title="Overhead" rates={rl(cr("gcPct"), cr("insurancePct"))} />
              <Line title="Mobilization & safety" rates={rl(cr(facts.squares < 30 ? "mobSmall" : "mob"), cr("safetyPlan"), cr("asbestos"), cr("superRate"))} />
              <Line title="Permit" rates={rl(cr("permitBase"), cr("permitPct"), cr("permitMin"))} />
            </>
          )}
        </Row>

        {/* 08 · CUSTOM LINES */}
        <Row n="08" id="custom" title="Custom lines" summary={sumCustom} open={openId === "custom"} onToggle={() => toggle("custom")}>
          {spec.custom.length > 0 && (
            <div className="rbe-tbl rbe-tbl--custom">
              <div className="rbe-tr rbe-th" aria-hidden="true">
                <span>Item</span>
                <span>Quantity</span>
                <span>Unit</span>
                <span>Price</span>
                <span>Material or labor</span>
                <span />
              </div>
              {spec.custom.map((c) => (
                <div className="rbe-tr" key={c.id}>
                  <Text label="Item" aria="Custom item" placeholder="A skylight, gutters, a fascia repair" value={c.name} onChange={(v) => setCustom(c.id, { name: v })} disabled={disabled} />
                  <Num label="Quantity" aria="Quantity" value={c.qty} onChange={(n) => setCustom(c.id, { qty: n })} disabled={disabled} />
                  <Sel label="Unit" value={c.unit} options={PKG_UNITS.map((u) => ({ id: u, label: u }))} onChange={(v) => setCustom(c.id, { unit: v as PkgUnit })} disabled={disabled} />
                  <Num label="Price" aria="Unit price" unit="$" value={c.unitPrice} onChange={(n) => setCustom(c.id, { unitPrice: n })} disabled={disabled} />
                  <Sel
                    label="Material or labor"
                    value={c.kind}
                    options={[
                      { id: "material", label: "Material" },
                      { id: "labor", label: "Labor" },
                    ]}
                    onChange={(v) => setCustom(c.id, { kind: v as "material" | "labor" })}
                    disabled={disabled}
                  />
                  <button type="button" className="rbe-x" disabled={disabled} aria-label="Remove custom line" title="Remove" onClick={() => removeCustom(c.id)}>
                    <IcX />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="rbe-acts">
            <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" disabled={disabled} onClick={() => addCustom("material")}>
              <IcPlus />
              Add a material line
            </button>
            <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" disabled={disabled} onClick={() => addCustom("labor")}>
              <IcPlus />
              Add a labor line
            </button>
          </div>
        </Row>
      </div>

      {/* FOOT — whose rates these are, the save, and the line review. */}
      <div className="rbe-foot">
        <div className="rbe-src">
          <span className="rbe-src-k">Rates</span>
          <span className="rbe-src-v">{source === "loading" ? "Loading company defaults…" : source === "org" ? "Company defaults" : "Saved in this browser only"}</span>
          {dirty && source !== "loading" ? <Stamp tone="warn">unsaved</Stamp> : null}
        </div>
        <div className="rbe-foot-acts">
          <button type="button" className={"btn btn-ghost rbe-btn" + (dirty ? " is-dirty" : "")} disabled={disabled} onClick={() => void saveDefaults()}>
            {saving ? "Saving…" : "Save as defaults"}
          </button>
          {reviewBtn}
        </div>
      </div>
      {saveError && (
        <p className="rbe-save-error" role="alert">
          {saveError}
        </p>
      )}

      {/* BAND — the answer and the way out, once. Pinned to the foot of the
          screen while the card is in view, so the total follows every edit. */}
      <div className="rbe-band" role="group" aria-label="Estimate total">
        <div className="rbe-sum">
          <div className="rbe-sum-t">
            <span className="rbe-sum-k">{spec.commercial.on ? "Total · commercial" : "Total"}</span>
            <span className={"rbe-sum-v" + (needsPitch ? " is-none" : "")} key={needsPitch ? "none" : total}>
              {needsPitch ? "Not priced yet" : money(total)}
            </span>
          </div>
          {!needsPitch && (
            <dl className="rbe-split">
              <div>
                <dt>Materials</dt>
                <dd>{money(materialsTotal)}</dd>
              </div>
              <div>
                <dt>Labor</dt>
                <dd>{money(total - materialsTotal)}</dd>
              </div>
            </dl>
          )}
        </div>
        {convertBtn}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CARD
// ═══════════════════════════════════════════════════════════════════════════
export default function BuildEstimateCardE({
  isRecon,
  squares,
  manual,
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
  const pitchField = waiting ? (
    <div className="rbe-f rbe-f--pitch" data-waiting="1">
      <span className="rbe-lbl">Pitch</span>
      <p className="rbe-wait">{waiting}</p>
    </div>
  ) : pitchEntry ? (
    <div className="rbe-f rbe-f--md rbe-f--pitch">
      <span className="rbe-lbl" aria-hidden="true">
        Pitch
      </span>
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
  const pitchBand = pitchField ? (
    <div className={"rbe-pitch" + (needsPitch ? " is-needed" : "")}>
      {pitchField}
      {needsPitch && !waiting && <p className="rbe-pitch-note">The measurement has no pitch. Enter it to price this roof.</p>}
    </div>
  ) : null;

  const reason = generate.disabled && generate.reason ? generate.reason : null;
  const lead =
    isRecon || !facts || buildMode !== "package"
      ? null
      : squares != null
        ? manual
          ? `Priced on your own takeoff — ${squares.toFixed(1)} squares at ${manual.pitchLabel}. Open a part to change it.`
          : `Priced on ${squares.toFixed(1)} measured squares. Open a part to change it.`
        : "Open a part of the roof to change it.";

  return (
    <div className="rbe" data-build-card="e" data-mode={buildMode}>
      <div className="rbe-head">
        <div className="rbe-head-t">
          <h2 className="rbe-title">Build an estimate</h2>
          {lead && <p className="rbe-lead">{lead}</p>}
        </div>
        <div className="rbe-mode" role="radiogroup" aria-label="How to build the estimate">
          {(aiEnabled ? (["package", "ai"] as const) : (["package"] as const)).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={buildMode === m} className={"rbe-mode-btn" + (buildMode === m ? " is-on" : "")} onClick={() => onBuildMode(m)}>
              {m === "package" ? "Roof package" : "Smart estimate"}
            </button>
          ))}
        </div>
      </div>

      {caution && (
        <div className="rbe-caution" role="note">
          <Stamp tone="warn">{caution.stamp}</Stamp>
          <p>{caution.text}</p>
          {caution.action && (
            <button type="button" className="btn btn-ghost rbe-btn rbe-btn--quiet" onClick={caution.action.onClick}>
              {caution.action.label}
            </button>
          )}
        </div>
      )}
      {isRecon && (
        <p className="rbe-empty">
          These figures are estimated from aerial imagery, so they can’t be priced. Use <b>Measure this roof</b> on this address to build a quote.
        </p>
      )}

      {buildMode === "package" ? (
        !isRecon && facts ? (
          <PackageLedger
            facts={facts}
            disabled={builderDisabled}
            converting={converting}
            onBuild={onBuild}
            onConvert={onConvert}
            lead={pitchBand}
            needsPitch={needsPitch}
            blockedReason={blockedReason}
            report={report}
            onBuildingUse={onBuildingUse}
          />
        ) : (
          pitchBand
        )
      ) : (
        <div className="rbe-smart">
          <div className="rbe-smart-f">
            {/* While the packs are on the way the line under the pickers says
                so; a pitch field holding the same sentence would repeat it. */}
            {!waiting && pitchField}
            <div className="rbe-f rbe-f--waste">
              <span className="rbe-lbl" aria-hidden="true">
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
          </div>
          <p className={"rbe-hint" + (reason || waiting ? " is-reason" : "")}>
            {reason ??
              waiting ??
              (facts?.existingMaterial && likeForLikeFamily(facts)
                ? `Existing roof: ${facts.existingMaterial}. Drafts a like-for-like package from the measured figures — every line stays editable below.`
                : "Drafts the full package from the measured figures — every line stays editable below.")}
          </p>
          <button className="btn btn-primary rbe-btn rbe-btn--go" type="button" id="buildBtn" disabled={generate.disabled} title={generate.reason} onClick={generate.onClick}>
            <svg className="ic" aria-hidden="true">
              <use href="#i-bulb" />
            </svg>
            {generate.busy ? "Generating…" : "Generate estimate"}
          </button>
        </div>
      )}

      {output}
    </div>
  );
}
