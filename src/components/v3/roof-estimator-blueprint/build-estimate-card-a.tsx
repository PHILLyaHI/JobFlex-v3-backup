"use client";

// VARIANT A of the "Build an estimate" card — THE ESTIMATE SHEET.
// Reached at /dashboard/roof-estimator?builder=a.
//
// THESIS: the card is a one-page estimate sheet, not a form. One number on
// top, seven parts as ledger lines (name · what is picked · what it costs),
// one closing total with the way out. The eye lands on the number, reads
// down the parts, ends on Convert. Nothing is explained in a sentence that a
// figure already says.
// OWN-WORLD: the page's blueprint vocabulary — a white ledger between two
// paper bands (card zoning), 2px ink rules, Inter 900 numerals, mono only
// for annotations and the right-hand numeral column, one blueprint accent.
// STORY: "this roof is $11,747, made of these seven parts — change one and
// the number follows — convert."
// FIRST VIEWPORT: head (title · the roof's facts · mode switch) → paper band
// with the running total → seven closed lines, each with its subtotal →
// a rates footnote → paper foot: Total · Review lines · Convert.
// FORM: a bill of materials; every field lives behind the line that owns it.
//
// Function is the incumbent's (roof-package-builder.tsx): the state block is
// copied verbatim and the helpers are imported. Only markup, copy and CSS
// are new. The per-part subtotals are derived from the same package math —
// a part's cost is the total minus the total with that part's prices at
// zero — and the column hides itself if the seven ever stop adding up.

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
  type VentType,
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
import "./build-estimate-card-a.css";

// ── The seven parts of the sheet ────────────────────────────────────────────
type PartId = "system" | "under" | "edges" | "flash" | "vents" | "tear" | "custom";

const sumLines = (p: RoofPackage) => [...p.materials, ...p.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0);

/** The same spec with one part's prices at zero — what the package costs without it. */
const SILENCE: Record<PartId, (s: RoofPackageSpec) => RoofPackageSpec> = {
  system: (s) => ({ ...s, systemMatPerSq: 0, systemLaborPerSq: 0, capPerFt: 0 }),
  under: (s) => ({ ...s, underlaymentPerSq: 0, iceWaterPerSqft: 0 }),
  edges: (s) => ({ ...s, dripPerFt: 0, starterPerFt: 0 }),
  flash: (s) => ({
    ...s,
    valleyMatPerFt: 0,
    valleyLaborPerFt: 0,
    stepPerPiece: 0,
    stepLaborPerFt: 0,
    apronPerFt: 0,
    apronLaborPerFt: 0,
    counterPerFt: 0,
    counterLaborPerFt: 0,
    pipeBootPrices: Object.fromEntries(PIPE_BOOT_SIZES.map((p) => [p.id, { each: 0, labor: 0 }])),
    chimneyEach: 0,
    chimneyLabor: 0,
    curbEach: 0,
    curbLabor: 0,
  }),
  vents: (s) => ({ ...s, vents: s.vents.map((v) => ({ ...v, each: 0, labor: 0 })) }),
  tear: (s) => ({
    ...s,
    tearOffPerSqLayer: 0,
    disposalPerSqLayer: 0,
    plywoodEach: 0,
    plywoodLabor: 0,
    nailsPerSq: 0,
    sealantPerSq: 0,
    cleanupLump: 0,
    safetyLump: 0,
    permitLump: 0,
  }),
  custom: (s) => ({ ...s, custom: s.custom.map((c) => ({ ...c, unitPrice: 0 })) }),
};

/** Each part's share of the total. null when the seven do not add up — then the column stays off. */
function partTotals(spec: RoofPackageSpec, facts: RoofFacts, total: number): Record<PartId, number> | null {
  const out = {} as Record<PartId, number>;
  let sum = 0;
  for (const id of Object.keys(SILENCE) as PartId[]) {
    const v = total - sumLines(buildRoofPackage(SILENCE[id](spec), facts));
    out[id] = v;
    sum += v;
  }
  return Math.abs(sum - total) < 0.5 ? out : null;
}

const ICE_SHORT: Record<IceWaterCoverage, string> = { none: "no ice & water", eaves: "ice & water at eaves", eaves_valleys: "ice & water at eaves + valleys", full: "ice & water · full deck" };

// ── Bits ────────────────────────────────────────────────────────────────────
const Ic = ({ id }: { id: "i-file" | "i-target" | "i-bulb" | "i-plus" | "i-x" }) => (
  <svg className="ic" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

const Chevron = () => (
  <svg className="bea-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A number the contractor types. Keeps the typed text, adopts a changed prop
 *  during render (a pick reset the price, another roof opened). */
function NumField({ label, value, onChange, unit, disabled, min = 0, wide, ariaLabel }: { label?: string; value: number; onChange: (n: number) => void; unit?: string; disabled?: boolean; min?: number; wide?: boolean; ariaLabel?: string }) {
  const [txt, setTxt] = React.useState(String(value));
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  return (
    <label className={"est-field bea-f" + (wide ? " bea-f--wide" : "")}>
      {label && <span className="est-lbl">{label}</span>}
      <span className={"bea-in" + (unit ? " has-unit" : "")}>
        <input
          className="est-in"
          inputMode="decimal"
          value={txt}
          disabled={disabled}
          aria-label={label || ariaLabel}
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
        {unit && <span className="bea-unit">{unit}</span>}
      </span>
    </label>
  );
}

function SelField<T extends string>({ label, value, options, onChange, disabled, wide, id, placeholder, ariaLabel }: { label?: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (v: T) => void; disabled?: boolean; wide?: boolean; id?: string; placeholder?: string; ariaLabel?: string }) {
  return (
    <label className={"est-field bea-f" + (wide ? " bea-f--wide" : "")}>
      {label && <span className="est-lbl">{label}</span>}
      <span className="bp-sel">
        <select className="bp-sel-in est-in" id={id} value={value} disabled={disabled} aria-label={label || ariaLabel} data-empty={placeholder && !value ? "1" : undefined} onChange={(e) => onChange(e.target.value as T)}>
          {placeholder && <option value="">{placeholder}</option>}
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

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="bea-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** A cluster of this roof's fields. Clusters sit side by side and wrap. */
function Group({ label, children, note }: { label?: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="bea-g">
      {label && <div className="bea-g-lbl">{label}</div>}
      <div className="bea-fields">{children}</div>
      {note}
    </div>
  );
}

/** The contractor's unit prices for a part — set once, kept. */
function Rates({ children }: { children: React.ReactNode }) {
  return (
    <div className="bea-rates">
      <div className="bea-g-lbl">Rates · per unit</div>
      <div className="bea-fields">{children}</div>
    </div>
  );
}

/** One line of the sheet: name · what is picked · what it costs. Opens on demand. */
function Line({ id, label, pick, empty, chip, amount, open, onToggle, children }: { id: PartId; label: string; pick: string; empty?: boolean; chip?: React.ReactNode; amount: number | null; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={"bea-line" + (open ? " is-open" : "")}>
      <button type="button" className="bea-line-hd" aria-expanded={open} aria-controls={`bea-body-${id}`} onClick={onToggle}>
        <span className="bea-line-name">{label}</span>
        <span className={"bea-line-pick" + (empty ? " is-empty" : "")}>{pick}</span>
        {chip}
        {amount != null && <span className={"bea-line-amt" + (amount > 0 ? "" : " is-zero")}>{amount > 0 ? money(amount) : "—"}</span>}
        <Chevron />
      </button>
      {open && (
        <div className="bea-line-body" id={`bea-body-${id}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/** The roof's facts on one line: what was measured or entered, nothing else. */
function FactsLine({ facts }: { facts: RoofFacts }) {
  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
  return (
    <p className="bea-basis">
      <span>
        <b>{facts.squares.toFixed(1)} sq</b> <i>{facts.squaresBasis}</i>
      </span>
      {facts.pitchFamilies.length > 0 && (
        <span>
          <b>{facts.pitchFamilies.map((f) => `${Math.round(f.pitch12)}/12${facts.pitchFamilies.length > 1 ? ` ${Math.round(f.share * 100)}%` : ""}`).join(" + ")}</b>
          {steepest >= 8 && <i> steep</i>}
        </span>
      )}
      {facts.perimeterFt != null && <span>{fmt(facts.perimeterFt)} ft outline</span>}
      {facts.footprintSqft != null && <span>{fmt(facts.footprintSqft)} sq ft footprint</span>}
      {facts.shape && <span>{facts.shape.toLowerCase()}</span>}
      {facts.chimney && <span>chimney</span>}
      {facts.rooftopAcCount != null && facts.rooftopAcCount > 0 && (
        <span>
          {facts.rooftopAcCount} rooftop unit{facts.rooftopAcCount === 1 ? "" : "s"}
        </span>
      )}
    </p>
  );
}

// ── The sheet: running total, seven lines, the total again with the way out ──
function PackageSheet({
  facts,
  onBuild,
  onConvert,
  disabled,
  converting,
}: {
  facts: RoofFacts;
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
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

  // ── Which lines are open. All closed: the sheet reads as a bill first;
  //    a line opens when the contractor needs what is behind it. ──
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  // ── What each line says, in a few words ──
  const parts = React.useMemo(() => partTotals(spec, facts, total), [spec, facts, total]);
  const amt = (id: PartId) => (parts ? parts[id] : null);
  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
  const lowSlope = spec.systemFamily === "low-slope";
  const starterApplies = !lowSlope && spec.systemFamily !== "metal";
  const pickSystemTxt = `${spec.systemName} · ${spec.wastePct}% waste`;
  const pickUnderTxt = `${spec.underlaymentName} · ${ICE_SHORT[spec.iceWater] ?? spec.iceWater}`;
  const noEdges = spec.eaveFt + spec.rakeFt + spec.ridgeFt + spec.hipFt <= 0;
  const edgeEstimated = spec.edgesBasis === "estimated";
  const pickEdgesTxt = [
    noEdges ? "No lengths yet" : `${fmt(spec.eaveFt)} eave · ${fmt(spec.rakeFt)} rake · ${fmt(spec.ridgeFt)} ridge${spec.hipFt > 0 ? ` · ${fmt(spec.hipFt)} hip` : ""} ft`,
    spec.dripEdgeOn ? "drip edge" : "no drip edge",
    starterApplies ? (spec.starterOn ? "starter" : "no starter") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pipeTotal = PIPE_BOOT_SIZES.reduce((a, s) => a + (spec.pipeBoots[s.id] ?? 0), 0);
  const flashBits = [
    spec.valleyCount > 0 ? `${spec.valleyCount} valley${spec.valleyCount === 1 ? "" : "s"}` : null,
    spec.stepWallCount > 0 ? `${spec.stepWallCount} sidewall${spec.stepWallCount === 1 ? "" : "s"}` : null,
    spec.apronFt > 0 ? `${fmt(spec.apronFt)} ft apron` : null,
    spec.counterFt > 0 ? `${fmt(spec.counterFt)} ft counter` : null,
    pipeTotal > 0 ? `${pipeTotal} pipe boot${pipeTotal === 1 ? "" : "s"}` : null,
    spec.chimneyCount > 0 ? `${spec.chimneyCount} chimney${spec.chimneyCount === 1 ? "" : "s"}` : null,
    spec.curbCount > 0 ? `${spec.curbCount} curb${spec.curbCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const ventName = (t: VentType) => t.label.split(" · ")[0].toLowerCase();
  const ventsOn = VENT_TYPES.filter((t) => ventOf(t.id).qty > 0);
  const ventsToAdd = VENT_TYPES.filter((t) => ventOf(t.id).qty <= 0);
  const pickVentsTxt = ventsOn.map((t) => `${fmt(ventOf(t.id).qty)}${t.unit === "linear ft" ? " ft" : " ×"} ${ventName(t)}`).join(" · ");
  const pickTearTxt = [
    spec.tearOffLayers === 0 ? "Overlay, no tear-off" : `Tear-off ${spec.tearOffLayers} layer${spec.tearOffLayers === 1 ? "" : "s"}`,
    spec.plywoodSheets > 0 ? `${spec.plywoodSheets} deck sheet${spec.plywoodSheets === 1 ? "" : "s"}` : null,
    spec.cleanupLump > 0 ? `cleanup ${money(spec.cleanupLump)}` : null,
    steepest >= 8 && spec.safetyLump > 0 ? `steep safety ${money(spec.safetyLump)}` : null,
    spec.permitLump > 0 ? `permit ${money(spec.permitLump)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const convertBtn = (
    <button type="button" className="btn btn-primary bea-btn" disabled={disabled || converting} onClick={() => onConvert(pkg, spec)} title="Straight to a proposal with these lines — you can still edit them there">
      <Ic id="i-target" />
      {converting ? "Creating…" : "Convert to proposal"}
    </button>
  );

  return (
    <>
      {/* THE NUMBER — what this roof costs, and what it is made of. */}
      <div className="bea-sum">
        <span className="bea-total">{money(total)}</span>
        <span className="bea-split">
          {money(materialsTotal)} materials · {money(total - materialsTotal)} labor · {pkg.materials.length + pkg.labor.length} lines
        </span>
      </div>

      <div className="bea-ledger">
        {/* ROOF SYSTEM */}
        <Line id="system" label="Roof system" pick={pickSystemTxt} amount={amt("system")} open={!!open.system} onToggle={() => toggle("system")}>
          {manage === "systems" ? (
            <div className="bea-edit">
              <div className="bea-edit-bar">
                <span className="bea-g-lbl">Your roof types</span>
                <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={() => setManage(null)}>
                  Done
                </button>
              </div>
              <div className="bea-edit-row bea-edit-head" aria-hidden="true">
                <span>Roof type</span>
                <span>Family</span>
                <span>Material $/sq</span>
                <span>Labor $/sq</span>
                <span>Waste %</span>
                <span>Cap $/ft</span>
                <span />
              </div>
              {lists.systems.map((s) => (
                <div className="bea-edit-row" key={s.id}>
                  <label className="est-field bea-f">
                    <span className="est-lbl">Roof type</span>
                    <input className="est-in" value={s.label} disabled={disabled} aria-label="Roof type name" onChange={(e) => patchSystem(s.id, { label: e.target.value })} />
                  </label>
                  <SelField label="Family" value={s.family} options={ROOF_FAMILIES} onChange={(v) => patchSystem(s.id, { family: v as RoofFamily })} disabled={disabled} />
                  <NumField label="Material" unit="$/sq" value={s.matPerSq} onChange={(n) => patchSystem(s.id, { matPerSq: n })} disabled={disabled} />
                  <NumField label="Labor" unit="$/sq" value={s.laborPerSq} onChange={(n) => patchSystem(s.id, { laborPerSq: n })} disabled={disabled} />
                  <NumField label="Waste" unit="%" value={s.wastePct} onChange={(n) => patchSystem(s.id, { wastePct: n })} disabled={disabled} />
                  <NumField label="Cap" unit="$/ft" value={s.capPerFt} onChange={(n) => patchSystem(s.id, { capPerFt: n })} disabled={disabled} />
                  <button type="button" className="bea-x" disabled={disabled || lists.systems.length <= 1} aria-label={`Remove ${s.label}`} title="Remove" onClick={() => removeSystem(s.id)}>
                    <Ic id="i-x" />
                  </button>
                </div>
              ))}
              <div className="bea-add">
                <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={addSystem}>
                  <Ic id="i-plus" />
                  Roof type
                </button>
                <button type="button" className="bea-link" disabled={disabled} onClick={resetLists}>
                  Restore built-in list
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bea-groups">
                <Group>
                  <SelField label="System" value={spec.systemId} options={lists.systems} onChange={(id) => pickSystem(id)} disabled={disabled} wide />
                  <SelField label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} />
                </Group>
                <div className="bea-g bea-g--act">
                  <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={() => setManage("systems")}>
                    Edit roof types
                  </button>
                </div>
              </div>
              <Rates>
                <NumField label="Material" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => set("systemMatPerSq", v)} disabled={disabled} />
                <NumField label="Install labor" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => set("systemLaborPerSq", v)} disabled={disabled} />
                {!lowSlope && <NumField label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => set("capPerFt", v)} disabled={disabled} />}
              </Rates>
            </>
          )}
        </Line>

        {/* UNDERLAYMENT */}
        <Line id="under" label="Underlayment" pick={pickUnderTxt} amount={amt("under")} open={!!open.under} onToggle={() => toggle("under")}>
          {manage === "underlayments" ? (
            <div className="bea-edit bea-edit--und">
              <div className="bea-edit-bar">
                <span className="bea-g-lbl">Your underlayments</span>
                <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={() => setManage(null)}>
                  Done
                </button>
              </div>
              <div className="bea-edit-row bea-edit-head" aria-hidden="true">
                <span>Underlayment</span>
                <span>$/sq</span>
                <span />
              </div>
              {lists.underlayments.map((u) => (
                <div className="bea-edit-row" key={u.id}>
                  <label className="est-field bea-f">
                    <span className="est-lbl">Underlayment</span>
                    <input className="est-in" value={u.label} disabled={disabled} aria-label="Underlayment name" onChange={(e) => patchUnderlayment(u.id, { label: e.target.value })} />
                  </label>
                  <NumField label="Price" unit="$/sq" value={u.perSq} onChange={(n) => patchUnderlayment(u.id, { perSq: n })} disabled={disabled} />
                  <button type="button" className="bea-x" disabled={disabled || lists.underlayments.length <= 1} aria-label={`Remove ${u.label}`} title="Remove" onClick={() => removeUnderlayment(u.id)}>
                    <Ic id="i-x" />
                  </button>
                </div>
              ))}
              <div className="bea-add">
                <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={addUnderlayment}>
                  <Ic id="i-plus" />
                  Underlayment
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bea-groups">
                <Group>
                  <SelField label="Underlayment" value={spec.underlaymentId} options={lists.underlayments} onChange={(id) => pickUnderlayment(id)} disabled={disabled} wide />
                  <SelField label="Ice & water" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} wide />
                </Group>
                <div className="bea-g bea-g--act">
                  <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={() => setManage("underlayments")}>
                    Edit underlayments
                  </button>
                </div>
              </div>
              <Rates>
                <NumField label="Underlayment" unit="$/sq" value={spec.underlaymentPerSq} onChange={(v) => set("underlaymentPerSq", v)} disabled={disabled} />
                {spec.iceWater !== "none" && <NumField label="Ice & water" unit="$/sq ft" value={spec.iceWaterPerSqft} onChange={(v) => set("iceWaterPerSqft", v)} disabled={disabled} />}
              </Rates>
            </>
          )}
        </Line>

        {/* EDGES */}
        <Line
          id="edges"
          label="Edges"
          pick={pickEdgesTxt}
          empty={noEdges}
          chip={<span className={"chip" + (edgeEstimated ? " wait" : "")}>{edgeEstimated ? "from outline" : "entered"}</span>}
          amount={amt("edges")}
          open={!!open.edges}
          onToggle={() => toggle("edges")}
        >
          <div className="bea-groups">
            <Group
              note={
                edgeEstimated ? (
                  <div className="bea-note">Estimated from the building outline — check them against the photo.</div>
                ) : estimateEdges(facts) ? (
                  <button type="button" className="bea-link" onClick={resetEdges} disabled={disabled}>
                    Back to the outline estimate
                  </button>
                ) : null
              }
            >
              <NumField label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
              <NumField label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
              <NumField label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
              <NumField label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
            </Group>
            <Group>
              <Toggle label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />
              {spec.dripEdgeOn && (
                <>
                  <SelField label="Profile" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} wide />
                  <SelField label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} />
                </>
              )}
              {starterApplies && <Toggle label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />}
            </Group>
          </div>
          {(spec.dripEdgeOn || (spec.starterOn && starterApplies)) && (
            <Rates>
              {spec.dripEdgeOn && <NumField label="Drip edge" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />}
              {spec.starterOn && starterApplies && <NumField label="Starter" unit="$/ft" value={spec.starterPerFt} onChange={(v) => set("starterPerFt", v)} disabled={disabled} />}
            </Rates>
          )}
        </Line>

        {/* FLASHING */}
        <Line id="flash" label="Flashing" pick={flashBits.length ? flashBits.join(" · ") : "Nothing counted"} empty={!flashBits.length} amount={amt("flash")} open={!!open.flash} onToggle={() => toggle("flash")}>
          <div className="bea-groups">
            <Group label="Valleys">
              <NumField label="Count" unit="each" value={spec.valleyCount} onChange={(v) => set("valleyCount", v)} disabled={disabled} />
              <NumField label="Length each" unit="ft" value={spec.valleyFtEach} onChange={(v) => set("valleyFtEach", v)} disabled={disabled} />
              <SelField label="Type" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} wide />
            </Group>
            <Group label="Sidewalls · step flashing">
              <NumField label="Walls" unit="each" value={spec.stepWallCount} onChange={(v) => set("stepWallCount", v)} disabled={disabled} />
              <NumField label="Length each" unit="ft" value={spec.stepWallFtEach} onChange={(v) => set("stepWallFtEach", v)} disabled={disabled} />
              <SelField label="Step size" value={spec.stepSizeId} options={STEP_FLASHING_SIZES} onChange={pickStep} disabled={disabled} wide />
            </Group>
            <Group>
              <NumField label="Apron / headwall" unit="ft" value={spec.apronFt} onChange={(v) => set("apronFt", v)} disabled={disabled} />
              <NumField label="Counter flashing" unit="ft" value={spec.counterFt} onChange={(v) => set("counterFt", v)} disabled={disabled} />
            </Group>
            <Group label="Pipe boots">
              {PIPE_BOOT_SIZES.map((s) => (
                <NumField key={s.id} label={s.label} unit="each" value={spec.pipeBoots[s.id] ?? 0} onChange={(v) => set("pipeBoots", { ...spec.pipeBoots, [s.id]: v })} disabled={disabled} />
              ))}
            </Group>
            <Group>
              <NumField label="Chimneys" unit="each" value={spec.chimneyCount} onChange={(v) => set("chimneyCount", v)} disabled={disabled} />
              <SelField label="Chimney size" value={spec.chimneySizeId} options={CHIMNEY_SIZES} onChange={pickChimney} disabled={disabled} wide />
              <NumField label="Curbs" unit="each" value={spec.curbCount} onChange={(v) => set("curbCount", v)} disabled={disabled} />
            </Group>
          </div>
          <Rates>
            <NumField label="Valley metal" unit="$/ft" value={spec.valleyMatPerFt} onChange={(v) => set("valleyMatPerFt", v)} disabled={disabled} />
            <NumField label="Valley labor" unit="$/ft" value={spec.valleyLaborPerFt} onChange={(v) => set("valleyLaborPerFt", v)} disabled={disabled} />
            <NumField label="Step piece" unit="$/ea" value={spec.stepPerPiece} onChange={(v) => set("stepPerPiece", v)} disabled={disabled} />
            <NumField label="Step labor" unit="$/ft" value={spec.stepLaborPerFt} onChange={(v) => set("stepLaborPerFt", v)} disabled={disabled} />
            <NumField label="Apron" unit="$/ft" value={spec.apronPerFt} onChange={(v) => set("apronPerFt", v)} disabled={disabled} />
            <NumField label="Apron labor" unit="$/ft" value={spec.apronLaborPerFt} onChange={(v) => set("apronLaborPerFt", v)} disabled={disabled} />
            <NumField label="Counter" unit="$/ft" value={spec.counterPerFt} onChange={(v) => set("counterPerFt", v)} disabled={disabled} />
            <NumField label="Counter labor" unit="$/ft" value={spec.counterLaborPerFt} onChange={(v) => set("counterLaborPerFt", v)} disabled={disabled} />
            <NumField label="Chimney kit" unit="$/ea" value={spec.chimneyEach} onChange={(v) => set("chimneyEach", v)} disabled={disabled} />
            <NumField label="Chimney labor" unit="$/ea" value={spec.chimneyLabor} onChange={(v) => set("chimneyLabor", v)} disabled={disabled} />
            <NumField label="Curb kit" unit="$/ea" value={spec.curbEach} onChange={(v) => set("curbEach", v)} disabled={disabled} />
            <NumField label="Curb labor" unit="$/ea" value={spec.curbLabor} onChange={(v) => set("curbLabor", v)} disabled={disabled} />
          </Rates>
        </Line>

        {/* VENTS */}
        <Line
          id="vents"
          label="Vents"
          pick={ventsOn.length ? pickVentsTxt : "No vents"}
          empty={!ventsOn.length}
          chip={vent ? <span className={"chip " + (vent.ok ? "ok" : "bad")}>{vent.ok ? "balanced" : "short"}</span> : undefined}
          amount={amt("vents")}
          open={!!open.vents}
          onToggle={() => toggle("vents")}
        >
          <div className="bea-note">
            {vent
              ? `The ${fmt(facts.footprintSqft ?? 0)} sq ft attic needs ${fmt(vent.requiredSqIn)} sq in of net free area. This package: ${fmt(vent.exhaustSqIn)} exhaust${vent.poweredExhaust ? ` + ${vent.poweredExhaust} powered` : ""}, ${fmt(vent.intakeSqIn)} intake.`
              : "This measurement has no footprint, so the attic check is off — add what the roof needs."}
          </div>
          {ventsOn.length > 0 && (
            <div className="bea-vents">
              <div className="bea-vent bea-edit-head" aria-hidden="true">
                <span>Vent</span>
                <span>Qty</span>
                <span>Material</span>
                <span>Labor</span>
                <span />
              </div>
              {ventsOn.map((t) => {
                const v = ventOf(t.id);
                const per = t.unit === "each" ? "$/ea" : "$/ft";
                return (
                  <div className="bea-vent" key={t.id}>
                    <span className="bea-vent-name">
                      {t.label}
                      <em>
                        {t.role}
                        {t.nfaSqIn ? ` · ${t.nfaSqIn} sq in${t.unit === "linear ft" ? "/ft" : ""}` : " · powered"}
                      </em>
                    </span>
                    <NumField label="Qty" unit={t.unit === "each" ? "each" : "ft"} value={v.qty} onChange={(n) => setVent(t.id, { qty: n })} disabled={disabled} />
                    <NumField label="Material" unit={per} value={v.each} onChange={(n) => setVent(t.id, { each: n })} disabled={disabled} />
                    <NumField label="Labor" unit={per} value={v.labor} onChange={(n) => setVent(t.id, { labor: n })} disabled={disabled} />
                    <button type="button" className="bea-x" disabled={disabled} aria-label={`Remove ${t.label}`} title="Remove" onClick={() => setVent(t.id, { qty: 0 })}>
                      <Ic id="i-x" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="bea-add">
            {ventsToAdd.length > 0 && (
              <label className="est-field bea-f bea-f--wide">
                <span className="bp-sel">
                  <select
                    className="bp-sel-in est-in"
                    value=""
                    disabled={disabled}
                    aria-label="Add a vent"
                    onChange={(e) => {
                      if (e.target.value) setVent(e.target.value, { qty: 1 });
                    }}
                  >
                    <option value="">+ Add vent…</option>
                    {ventsToAdd.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}
            <Toggle label="Balanced system · 1/300 rule" checked={spec.ventBalanced} onChange={(v) => set("ventBalanced", v)} disabled={disabled} />
          </div>
        </Line>

        {/* TEAR-OFF & EXTRAS */}
        <Line id="tear" label="Tear-off & extras" pick={pickTearTxt} amount={amt("tear")} open={!!open.tear} onToggle={() => toggle("tear")}>
          <div className="bea-groups">
            <Group note={steepest < 8 ? <div className="bea-note">Steep safety is charged from 8/12 up — this roof is {steepest > 0 ? `${Math.round(steepest)}/12` : "flatter"}, so it stays off.</div> : null}>
              <SelField label="Tear-off" value={String(spec.tearOffLayers)} options={[{ id: "0", label: "None · overlay" }, { id: "1", label: "1 layer" }, { id: "2", label: "2 layers" }, { id: "3", label: "3 layers" }]} onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)} disabled={disabled} />
              <NumField label="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
              <NumField label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
              <NumField label="Steep safety" unit="$" value={spec.safetyLump} onChange={(v) => set("safetyLump", v)} disabled={disabled} />
              <NumField label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />
            </Group>
          </div>
          <Rates>
            <NumField label="Tear-off labor" unit="$/sq·layer" value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />
            <NumField label="Disposal" unit="$/sq·layer" value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />
            <NumField label="Deck sheet" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />
            <NumField label="Sheet labor" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />
            <NumField label="Nails & fasteners" unit="$/sq" value={spec.nailsPerSq} onChange={(v) => set("nailsPerSq", v)} disabled={disabled} />
            <NumField label="Sealant & collars" unit="$/sq" value={spec.sealantPerSq} onChange={(v) => set("sealantPerSq", v)} disabled={disabled} />
          </Rates>
        </Line>

        {/* CUSTOM LINES */}
        <Line id="custom" label="Custom lines" pick={spec.custom.length ? `${spec.custom.length} line${spec.custom.length === 1 ? "" : "s"}` : "None"} empty={!spec.custom.length} amount={amt("custom")} open={!!open.custom} onToggle={() => toggle("custom")}>
          {spec.custom.length > 0 && (
            <div className="bea-custom">
              {spec.custom.map((c) => (
                <div className="bea-custom-row" key={c.id}>
                  <label className="est-field bea-f">
                    <span className="est-lbl">Item</span>
                    <input className="est-in" placeholder="A skylight, gutters, a fascia repair…" value={c.name} disabled={disabled} onChange={(e) => setCustom(c.id, { name: e.target.value })} aria-label="Custom item" />
                  </label>
                  <NumField label="Qty" value={c.qty} onChange={(n) => setCustom(c.id, { qty: n })} disabled={disabled} />
                  <SelField label="Unit" value={c.unit} options={PKG_UNITS.map((u) => ({ id: u, label: u }))} onChange={(v) => setCustom(c.id, { unit: v as PkgUnit })} disabled={disabled} />
                  <NumField label="Price" unit="$" value={c.unitPrice} onChange={(n) => setCustom(c.id, { unitPrice: n })} disabled={disabled} />
                  <SelField
                    label="Kind"
                    value={c.kind}
                    options={[
                      { id: "material", label: "material" },
                      { id: "labor", label: "labor" },
                    ]}
                    onChange={(v) => setCustom(c.id, { kind: v as "material" | "labor" })}
                    disabled={disabled}
                  />
                  <button type="button" className="bea-x" disabled={disabled} aria-label="Remove custom line" title="Remove" onClick={() => removeCustom(c.id)}>
                    <Ic id="i-x" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="bea-add">
            <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={() => addCustom("material")}>
              <Ic id="i-plus" />
              Material
            </button>
            <button type="button" className="btn btn-ghost bea-btn bea-btn--sm" disabled={disabled} onClick={() => addCustom("labor")}>
              <Ic id="i-plus" />
              Labor
            </button>
          </div>
        </Line>
      </div>

      {/* WHOSE RATES — a footnote on the sheet, louder only when unsaved. */}
      <div className={"bea-src" + (dirty && source !== "loading" ? " is-dirty" : "")}>
        <span className="bea-src-txt">
          {source === "loading" ? "Loading rates…" : source === "org" ? "Your company’s rates" : "Built-in rates"}
          {dirty && source !== "loading" ? <em> · unsaved</em> : null}
        </span>
        <button type="button" className={dirty && source !== "loading" ? "btn btn-ghost bea-btn bea-btn--sm" : "bea-link"} disabled={disabled || saving || source === "loading"} onClick={() => void saveDefaults()}>
          {saving ? "Saving…" : "Save as defaults"}
        </button>
      </div>

      {/* THE TOTAL, where the reader ends up, and the way out. */}
      <div className="bea-foot">
        <span className="bea-foot-l">
          <span className="bea-foot-lbl">Total</span>
          <span className="bea-foot-v">{money(total)}</span>
        </span>
        <span className="bea-acts">
          <button type="button" className="btn btn-ghost bea-btn" disabled={disabled} onClick={() => onBuild(pkg, spec)} title="Fill the estimate tables below to review and adjust before converting">
            <Ic id="i-file" />
            Review lines
          </button>
          {convertBtn}
        </span>
      </div>
    </>
  );
}

// ── The card ────────────────────────────────────────────────────────────────
export default function BuildEstimateCardA({
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
  const showSheet = buildMode === "package" && facts != null && !isRecon;
  const hint = generate.disabled && generate.reason ? generate.reason : "Drafts the whole package from the measured figures — every line stays editable below.";
  return (
    <section className={"card bea" + (showSheet || buildMode === "ai" ? "" : " bea--head-only")} data-build-card="a">
      <header className="bea-head">
        <div className="bea-head-l">
          <h3 className="bea-title">Build an estimate</h3>
          {isRecon ? (
            <p className="bea-basis bea-basis--prose">Estimated from aerial imagery, so it can’t be priced. Run Instant measure for this address to build a quote.</p>
          ) : facts ? (
            <FactsLine facts={facts} />
          ) : (
            <p className="bea-basis">
              <span>{squares != null ? (manual ? `${squares.toFixed(1)} sq · ${manual.pitchLabel} · your takeoff` : `${squares.toFixed(1)} sq · measured`) : "No measurement yet"}</span>
            </p>
          )}
        </div>
        <div className="bea-head-r">
          {pitchEntry && (
            /* The aerial data carried no pitch: the contractor states one
               before anything is priced, and the estimate says so. */
            <SelField label="Pitch" id="pitchEntered" value={pitchEntry.value ?? ""} options={pitchEntry.options.map((p) => ({ id: p, label: p }))} placeholder="Select pitch…" onChange={(v) => pitchEntry.onChange(v || null)} />
          )}
          <div className="vsw" role="radiogroup" aria-label="How to build the estimate">
            {(["package", "ai"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={buildMode === m} className={"vsw-btn" + (buildMode === m ? " active" : "")} onClick={() => onBuildMode(m)}>
                {m === "package" ? "Roof package" : "Smart estimate"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {buildMode === "ai" && (
        <div className="bea-ai">
          <SelField label="Waste factor" id="waste" value={String(waste)} options={wasteOptions.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => onWaste(Number(v))} />
          <button className="btn btn-primary bea-btn" type="button" id="buildBtn" disabled={generate.disabled} title={generate.reason} onClick={generate.onClick}>
            <Ic id="i-bulb" />
            {generate.busy ? "Generating…" : "Generate estimate"}
          </button>
          <p className={"bea-ai-hint" + (generate.disabled && generate.reason ? " is-why" : "")}>{hint}</p>
        </div>
      )}

      {showSheet && facts && <PackageSheet facts={facts} disabled={builderDisabled} converting={converting} onBuild={onBuild} onConvert={onConvert} />}

      {output}
    </section>
  );
}
