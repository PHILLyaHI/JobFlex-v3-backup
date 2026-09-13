"use client";

// VARIANT B of the "Build an estimate" card — TITLE BLOCK + SCHEDULE.
// Reached at /dashboard/roof-estimator?builder=b.
//
// Read like a drawing sheet. The TITLE BLOCK is the one figure that matters:
// the package total as a single large numeral, its materials/labor split, the
// two ways out, and the roof it prices; it stays in view while the rows are
// worked, so the total moves under the reader's hand. The SCHEDULE beside it
// is the package: seven numbered rows, one line each, and that row's money on
// the right like an estimate's line items — where the price comes from is
// visible before anything is opened. Inside an open row the entries are a
// ledger (a label column, fields inline, units inside the boxes) and the
// rates — set once, kept — are one folded line at the bottom of the row.
//
// Every function of the incumbent survives: the chrome's four basis states,
// the mode switch, the pitch and waste pickers, Generate, the output slot, and
// the whole builder — its state block is the incumbent's, verbatim, and its
// helpers are imported from it. Only the markup, the copy and the CSS are new.

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
  type PkgLine,
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
  rate,
  readLocal,
  reconcile,
  saneLists,
  writeLocal,
  type Prefs,
} from "./roof-package-builder";
import type { BuildEstimateCardProps } from "./build-estimate-card";
import "./build-estimate-card-b.css";

// ── Field primitives ───────────────────────────────────────────────────────
// A caption beside the box (`label`), or none and an accessible name (`aria`).

/** A number box. Keeps what is typed; adopts a changed prop (a pick reset the
 *  price, another roof opened) during render, not in an effect. */
function NumIn({ label, aria, value, onChange, unit, disabled, min = 0, lg }: { label?: string; aria?: string; value: number; onChange: (n: number) => void; unit?: string; disabled?: boolean; min?: number; lg?: boolean }) {
  const [txt, setTxt] = React.useState(String(value));
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  return (
    <label className="beb-f">
      {label && <span className="beb-k">{label}</span>}
      <span className={"beb-in" + (unit ? " has-unit" : "") + (lg ? " beb-in--lg" : "")}>
        <input
          className="est-in"
          inputMode="decimal"
          value={txt}
          disabled={disabled}
          aria-label={label ?? aria}
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
        {unit && <span className="beb-unit">{unit}</span>}
      </span>
    </label>
  );
}

function SelIn<T extends string>({ label, aria, value, options, onChange, disabled, w }: { label?: string; aria?: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (v: T) => void; disabled?: boolean; w?: "sm" | "wide" }) {
  return (
    <label className={"est-field beb-f" + (w ? ` beb-f--${w}` : " beb-f--sel")}>
      {label && <span className="beb-k">{label}</span>}
      <span className="bp-sel">
        <select className="bp-sel-in est-in" value={value} disabled={disabled} aria-label={label ?? aria} onChange={(e) => onChange(e.target.value as T)}>
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

function CheckIn({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="beb-chk">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const Chev = () => (
  <svg className="beb-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One schedule row: number, name, what is picked, its money; the body on demand. */
function Sec({ n, id, title, value, chip, sum, open, onToggle, children }: { n: string; id: string; title: string; value: string; chip?: React.ReactNode; sum: number | null; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className={"beb-sec" + (open ? " is-open" : "")}>
      <button type="button" className="beb-sec-hd" aria-expanded={open} aria-controls={`beb-sec-${id}`} onClick={onToggle}>
        <span className="beb-sec-n">{n}</span>
        <span className="beb-sec-t">{title}</span>
        <span className="beb-sec-v">{value}</span>
        {chip}
        {sum != null ? <span className={"beb-sec-m" + (sum > 0 ? "" : " is-zero")}>{sum > 0 ? money(sum) : "—"}</span> : <span />}
        <Chev />
      </button>
      {open && (
        <div className="beb-sec-bd" id={`beb-sec-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
}

/** A ledger row inside an open section: a label, the fields, an optional note under them. */
function LRow({ k, children, note, rates }: { k: string; children: React.ReactNode; note?: React.ReactNode; rates?: boolean }) {
  return (
    <div className={"beb-lr" + (rates ? " beb-lr--rates" : "")}>
      <span className="beb-lr-k">{k}</span>
      <div className="beb-lr-v">{children}</div>
      {note && <div className="beb-lr-note">{note}</div>}
    </div>
  );
}

/** The contractor's unit prices for a row: one folded line, the boxes on demand. */
function RatesRow({ id, open, onToggle, summary, children }: { id: string; open: boolean; onToggle: () => void; summary: string; children: React.ReactNode }) {
  return (
    <div className={"beb-lr beb-lr--rates" + (open ? " is-open" : "")}>
      <span className="beb-lr-k">Rates</span>
      <div className="beb-lr-v" id={`beb-rates-${id}`}>
        {open ? children : <span className="beb-rates-sum">{summary}</span>}
        <button type="button" className="beb-link" aria-expanded={open} aria-controls={`beb-rates-${id}`} onClick={onToggle}>
          {open ? "Done" : "Edit"}
        </button>
      </div>
    </div>
  );
}

/** A ledger-table cell; its caption shows only where the header row is gone (handheld). */
function Cell({ cap, name, children }: { cap: string; name?: boolean; children: React.ReactNode }) {
  return (
    <div className={"beb-c" + (name ? " beb-c--name" : "")}>
      <span className="beb-c-k" aria-hidden="true">{cap}</span>
      {children}
    </div>
  );
}

// ── Copy helpers ───────────────────────────────────────────────────────────
/** "Architectural shingle (30-yr laminated)" → "Architectural shingle". */
const shortName = (s: string) => s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
const plural = (n: number, one: string, many = one + "s") => `${fmt(n)} ${n === 1 ? one : many}`;

// ── Each row's money ───────────────────────────────────────────────────────
// The package's lines, attributed to the row that owns them by the names
// takeoff.ts gives them; custom lines are the tail of each table. If a line
// ever fails to attribute, the column hides rather than show a wrong figure.
type SecId = "system" | "under" | "edges" | "flash" | "vents" | "tear" | "custom";
const VENT_LABELS = new Set(VENT_TYPES.map((t) => t.label));
const MAT_FLASH = /^(Valley metal|Step flashing|Apron \/ headwall flashing|Counter flashing|Pipe boot|Chimney flashing kit|Curb flashing)/;
const MAT_TEAR = /^(Roof deck replacement|Roofing nails|Sealant, caulk)/;
const LAB_FLASH = /^(Valleys|Step flashing|Apron \/ headwall flashing|Counter flashing|Pipe boots|Chimney flashing|Curb flashing)/;
const LAB_TEAR = /^(Tear-off|Disposal|Roof deck replacement|Steep-slope safety|Cleanup|Permit)/;

function sectionSums(pkg: RoofPackage, spec: RoofPackageSpec): Record<SecId, number> | null {
  const sums: Record<SecId, number> = { system: 0, under: 0, edges: 0, flash: 0, vents: 0, tear: 0, custom: 0 };
  const underName = spec.underlaymentName.trim() || "Underlayment";
  const customMat = spec.custom.filter((c) => c.kind === "material" && c.name.trim()).length;
  const customLab = spec.custom.filter((c) => c.kind === "labor" && c.name.trim()).length;
  const add = (id: SecId | null, l: PkgLine) => {
    if (!id) return false;
    sums[id] += l.quantity * l.unitPrice;
    return true;
  };
  for (let i = 0; i < pkg.materials.length; i++) {
    const l = pkg.materials[i];
    const n = l.name;
    const id: SecId | null =
      i >= pkg.materials.length - customMat ? "custom"
      : i === 0 ? "system"
      : n === underName || n.startsWith("Ice & water shield") ? "under"
      : n.startsWith("Drip edge") || n.startsWith("Starter strip") ? "edges"
      : n === "Hip & ridge cap" || n === "Ridge / hip cap · metal" ? "system"
      : MAT_FLASH.test(n) ? "flash"
      : VENT_LABELS.has(n) ? "vents"
      : MAT_TEAR.test(n) ? "tear"
      : null;
    if (!add(id, l)) return null;
  }
  for (let i = 0; i < pkg.labor.length; i++) {
    const l = pkg.labor[i];
    const n = l.name;
    const id: SecId | null =
      i >= pkg.labor.length - customLab ? "custom"
      : n.startsWith("Install · ") ? "system"
      : LAB_TEAR.test(n) ? "tear"
      : LAB_FLASH.test(n) ? "flash"
      : VENT_LABELS.has(n.replace(/ · install$/, "")) ? "vents"
      : null;
    if (!add(id, l)) return null;
  }
  return sums;
}

// ── The builder ────────────────────────────────────────────────────────────
function PackageLedger({
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
  // ── State, effects, handlers and derived values: the incumbent's block
  //    (roof-package-builder.tsx, lines 283–469), verbatim. ──
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

  // Rates fold per row: closed reads as one mono line, open shows the boxes.
  const [ratesOpen, setRatesOpen] = React.useState<Record<string, boolean>>({});
  const toggleRates = (id: string) => setRatesOpen((o) => ({ ...o, [id]: !o[id] }));

  // ── What each row says, in one short line ──
  const steepest = facts.pitchFamilies.reduce((m, f) => Math.max(m, f.pitch12), 0);
  const lowSlope = spec.systemFamily === "low-slope";
  const starterApplies = !lowSlope && spec.systemFamily !== "metal";
  const sums = React.useMemo(() => sectionSums(pkg, spec), [pkg, spec]);
  const lineCount = pkg.materials.length + pkg.labor.length;

  const vSystem = [shortName(spec.systemName), `${spec.wastePct}% waste`].join(" · ");
  const iceLabel = shortName(ICE_WATER.find((i) => i.id === spec.iceWater)?.label ?? spec.iceWater).toLowerCase();
  const vUnder = [shortName(spec.underlaymentName), spec.iceWater === "none" ? "no ice & water" : `ice & water · ${iceLabel}`].join(" · ");
  const noEdges = spec.eaveFt + spec.rakeFt + spec.ridgeFt + spec.hipFt <= 0;
  const vEdges = [
    noEdges ? "Enter eave, rake and ridge" : `Eave ${fmt(spec.eaveFt)} · rake ${fmt(spec.rakeFt)} · ridge ${fmt(spec.ridgeFt)}${spec.hipFt > 0 ? ` · hip ${fmt(spec.hipFt)}` : ""} ft`,
    spec.dripEdgeOn ? null : "no drip edge",
    starterApplies && !spec.starterOn ? "no starter" : null,
  ].filter(Boolean).join(" · ");
  const pipeTotal = PIPE_BOOT_SIZES.reduce((a, s) => a + (spec.pipeBoots[s.id] ?? 0), 0);
  const flashBits = [
    spec.valleyCount > 0 ? plural(spec.valleyCount, "valley") : null,
    spec.stepWallCount > 0 ? plural(spec.stepWallCount, "sidewall") : null,
    spec.apronFt > 0 ? `apron ${fmt(spec.apronFt)} ft` : null,
    spec.counterFt > 0 ? `counter ${fmt(spec.counterFt)} ft` : null,
    pipeTotal > 0 ? plural(pipeTotal, "pipe boot") : null,
    spec.chimneyCount > 0 ? plural(spec.chimneyCount, "chimney") : null,
    spec.curbCount > 0 ? plural(spec.curbCount, "curb") : null,
  ].filter(Boolean);
  const vFlash = flashBits.length ? flashBits.join(" · ") : "Nothing counted";
  const ventsOn = VENT_TYPES.filter((t) => ventOf(t.id).qty > 0);
  const ventsToAdd = VENT_TYPES.filter((t) => ventOf(t.id).qty <= 0);
  const vVents = ventsOn.length
    ? ventsOn.map((t) => `${fmt(ventOf(t.id).qty)}${t.unit === "linear ft" ? " ft" : " ×"} ${t.label.split(" · ")[0].toLowerCase()}`).join(" · ")
    : "No vents";
  const vTear = [
    spec.tearOffLayers === 0 ? "No tear-off · overlay" : `Tear-off ${plural(spec.tearOffLayers, "layer")}`,
    spec.plywoodSheets > 0 ? plural(spec.plywoodSheets, "deck sheet") : null,
    spec.cleanupLump > 0 ? `cleanup ${money(spec.cleanupLump)}` : null,
    steepest >= 8 && spec.safetyLump > 0 ? `steep safety ${money(spec.safetyLump)}` : null,
    spec.permitLump > 0 ? `permit ${money(spec.permitLump)}` : null,
  ].filter(Boolean).join(" · ");
  const vCustom = spec.custom.length ? plural(spec.custom.length, "line") : "None";
  const edgeEstimated = spec.edgesBasis === "estimated";
  const ratesOn = spec.dripEdgeOn || (starterApplies && spec.starterOn);

  // ── The rates, folded ──
  const rsSystem = [`${rate(spec.systemMatPerSq)} + ${rate(spec.systemLaborPerSq)} /sq`, !lowSlope ? `cap ${rate(spec.capPerFt)}/ft` : null].filter(Boolean).join(" · ");
  const rsUnder = [`${rate(spec.underlaymentPerSq)}/sq`, spec.iceWater !== "none" ? `ice & water ${rate(spec.iceWaterPerSqft)}/sq ft` : null].filter(Boolean).join(" · ");
  const rsEdges = [spec.dripEdgeOn ? `drip edge ${rate(spec.dripPerFt)}/ft` : null, starterApplies && spec.starterOn ? `starter ${rate(spec.starterPerFt)}/ft` : null].filter(Boolean).join(" · ");
  const rsFlash = [
    `valley ${rate(spec.valleyMatPerFt)} + ${rate(spec.valleyLaborPerFt)} /ft`,
    `step ${rate(spec.stepPerPiece)}/pc + ${rate(spec.stepLaborPerFt)}/ft`,
    `apron ${rate(spec.apronPerFt)} + ${rate(spec.apronLaborPerFt)} /ft`,
    `counter ${rate(spec.counterPerFt)} + ${rate(spec.counterLaborPerFt)} /ft`,
    `chimney ${rate(spec.chimneyEach)} + ${rate(spec.chimneyLabor)}`,
    `curb ${rate(spec.curbEach)} + ${rate(spec.curbLabor)}`,
  ].join(" · ");
  const rsTear = [
    `tear-off ${rate(spec.tearOffPerSqLayer)} + disposal ${rate(spec.disposalPerSqLayer)} /sq·layer`,
    `deck sheet ${rate(spec.plywoodEach)} + ${rate(spec.plywoodLabor)}`,
    `nails ${rate(spec.nailsPerSq)}/sq`,
    `sealant ${rate(spec.sealantPerSq)}/sq`,
  ].join(" · ");

  // ── The roof, as a drawing annotation: only what exists ──
  const facts_: React.ReactNode[] = [];
  facts_.push(
    <span key="sq">
      {facts.squares.toFixed(1)} sq<i>{facts.squaresBasis}</i>
    </span>,
  );
  if (facts.pitchFamilies.length > 0) {
    facts_.push(
      <span key="pitch">
        {facts.pitchFamilies.map((f) => `${Math.round(f.pitch12)}/12${facts.pitchFamilies.length > 1 ? ` ${Math.round(f.share * 100)}%` : ""}`).join(" + ")}
        {steepest >= 8 && <span className="chip wait">steep</span>}
      </span>,
    );
  }
  if (facts.perimeterFt != null) facts_.push(<span key="per">{fmt(facts.perimeterFt)} ft outline</span>);
  if (facts.footprintSqft != null) facts_.push(<span key="fp">{fmt(facts.footprintSqft)} sq ft footprint</span>);
  if (facts.shape) facts_.push(<span key="shape">{facts.shape.toLowerCase()}</span>);
  if (facts.chimney) facts_.push(<span key="ch">chimney</span>);
  if (facts.rooftopAcCount != null && facts.rooftopAcCount > 0) facts_.push(<span key="ac">{plural(facts.rooftopAcCount, "rooftop unit")}</span>);

  const convertBtn = (
    <button type="button" className="btn btn-primary" disabled={disabled || converting} onClick={() => onConvert(pkg, spec)} title="Straight to a proposal with these lines — you can still edit them there">
      <svg className="ic"><use href="#i-target" /></svg>
      {converting ? "Creating…" : "Convert to proposal"}
    </button>
  );

  return (
    <>
      <div className="beb-sheet">
        {/* THE TITLE BLOCK — the price, the ways out, the roof. Sticky on the
            desk, so the total travels with the reader down the schedule. */}
        <div className="beb-tcol">
          <aside className="beb-ticket" aria-label="Package total">
            <span className="beb-kick">Package</span>
            <span className="beb-total">{money(total)}</span>
            <div className="beb-split">
              <div className="beb-split-r">
                <span className="beb-split-k">Materials</span>
                <span className="beb-lead" />
                <span>{money(materialsTotal)}</span>
              </div>
              <div className="beb-split-r">
                <span className="beb-split-k">Labor</span>
                <span className="beb-lead" />
                <span>{money(total - materialsTotal)}</span>
              </div>
            </div>
            <span className="beb-lines">{plural(lineCount, "line")}</span>
            <div className="beb-acts">
              {convertBtn}
              <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => onBuild(pkg, spec)} title="Fill the estimate tables below to review and adjust before converting">
                <svg className="ic"><use href="#i-file" /></svg>
                Review lines
              </button>
            </div>
            <div className="beb-roof">
              <span className="beb-kick">Roof</span>
              <span className="beb-facts">
                {facts_.map((node, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="beb-dot">·</span>}
                    {node}
                  </React.Fragment>
                ))}
              </span>
            </div>
          </aside>
        </div>

        {/* THE SCHEDULE — seven rows, the money on the right. */}
        <div className="beb-schedule">
          {/* 01 · ROOF SYSTEM */}
          <Sec n="01" id="system" title="Roof system" value={vSystem} sum={sums?.system ?? null} open={!!open.system} onToggle={() => toggle("system")}>
            {manage === "systems" ? (
              <div className="beb-tbl">
                <div className="beb-tr beb-tr--sys beb-th">
                  <span>Roof type</span><span>Family</span><span>Material $/sq</span><span>Labor $/sq</span><span>Waste %</span><span>Cap $/ft</span><span />
                </div>
                {lists.systems.map((s) => (
                  <div className="beb-tr beb-tr--sys" key={s.id}>
                    <Cell cap="Roof type" name>
                      <input className="est-in" value={s.label} disabled={disabled} aria-label="Roof type name" onChange={(e) => patchSystem(s.id, { label: e.target.value })} />
                    </Cell>
                    <Cell cap="Family"><SelIn aria="Family" value={s.family} options={ROOF_FAMILIES} onChange={(v) => patchSystem(s.id, { family: v as RoofFamily })} disabled={disabled} /></Cell>
                    <Cell cap="Material $/sq"><NumIn aria="Material $ per square" value={s.matPerSq} onChange={(n) => patchSystem(s.id, { matPerSq: n })} disabled={disabled} /></Cell>
                    <Cell cap="Labor $/sq"><NumIn aria="Labor $ per square" value={s.laborPerSq} onChange={(n) => patchSystem(s.id, { laborPerSq: n })} disabled={disabled} /></Cell>
                    <Cell cap="Waste %"><NumIn aria="Waste percent" value={s.wastePct} onChange={(n) => patchSystem(s.id, { wastePct: n })} disabled={disabled} /></Cell>
                    <Cell cap="Cap $/ft"><NumIn aria="Cap $ per ft" value={s.capPerFt} onChange={(n) => patchSystem(s.id, { capPerFt: n })} disabled={disabled} /></Cell>
                    <button type="button" className="beb-x" disabled={disabled || lists.systems.length <= 1} aria-label={`Remove ${s.label}`} title="Remove" onClick={() => removeSystem(s.id)}>×</button>
                  </div>
                ))}
                <div className="beb-tfoot">
                  <button type="button" className="btn btn-ghost" disabled={disabled} onClick={addSystem}>+ Roof type</button>
                  <button type="button" className="beb-link" disabled={disabled} onClick={resetLists}>Restore built-in list</button>
                  <button type="button" className="btn btn-primary" onClick={() => setManage(null)}>Done</button>
                </div>
              </div>
            ) : (
              <>
                <LRow k="System">
                  <SelIn aria="Roof system" value={spec.systemId} options={lists.systems} onChange={(id) => pickSystem(id)} disabled={disabled} w="wide" />
                  <SelIn label="Waste" value={String(spec.wastePct)} options={WASTE_OPTIONS.map((w) => ({ id: String(w), label: `${w}%` }))} onChange={(v) => set("wastePct", Number(v))} disabled={disabled} w="sm" />
                  <button type="button" className="beb-link" disabled={disabled} onClick={() => setManage("systems")}>Edit roof types</button>
                </LRow>
                <RatesRow id="system" open={!!ratesOpen.system} onToggle={() => toggleRates("system")} summary={rsSystem}>
                  <NumIn label="Material" unit="$/sq" value={spec.systemMatPerSq} onChange={(v) => set("systemMatPerSq", v)} disabled={disabled} />
                  <NumIn label="Labor" unit="$/sq" value={spec.systemLaborPerSq} onChange={(v) => set("systemLaborPerSq", v)} disabled={disabled} />
                  {!lowSlope && <NumIn label="Hip & ridge cap" unit="$/ft" value={spec.capPerFt} onChange={(v) => set("capPerFt", v)} disabled={disabled} />}
                </RatesRow>
              </>
            )}
          </Sec>

          {/* 02 · UNDERLAYMENT */}
          <Sec n="02" id="under" title="Underlayment" value={vUnder} sum={sums?.under ?? null} open={!!open.under} onToggle={() => toggle("under")}>
            {manage === "underlayments" ? (
              <div className="beb-tbl">
                <div className="beb-tr beb-tr--und beb-th">
                  <span>Underlayment</span><span>$/sq</span><span />
                </div>
                {lists.underlayments.map((u) => (
                  <div className="beb-tr beb-tr--und" key={u.id}>
                    <Cell cap="Underlayment" name>
                      <input className="est-in" value={u.label} disabled={disabled} aria-label="Underlayment name" onChange={(e) => patchUnderlayment(u.id, { label: e.target.value })} />
                    </Cell>
                    <Cell cap="$/sq"><NumIn aria="$ per square" value={u.perSq} onChange={(n) => patchUnderlayment(u.id, { perSq: n })} disabled={disabled} /></Cell>
                    <button type="button" className="beb-x" disabled={disabled || lists.underlayments.length <= 1} aria-label={`Remove ${u.label}`} title="Remove" onClick={() => removeUnderlayment(u.id)}>×</button>
                  </div>
                ))}
                <div className="beb-tfoot">
                  <button type="button" className="btn btn-ghost" disabled={disabled} onClick={addUnderlayment}>+ Underlayment</button>
                  <button type="button" className="btn btn-primary" onClick={() => setManage(null)}>Done</button>
                </div>
              </div>
            ) : (
              <>
                <LRow k="Membrane">
                  <SelIn aria="Underlayment" value={spec.underlaymentId} options={lists.underlayments} onChange={(id) => pickUnderlayment(id)} disabled={disabled} w="wide" />
                  <SelIn label="Ice & water" value={spec.iceWater} options={ICE_WATER} onChange={(v) => set("iceWater", v as IceWaterCoverage)} disabled={disabled} w="wide" />
                  <button type="button" className="beb-link" disabled={disabled} onClick={() => setManage("underlayments")}>Edit underlayments</button>
                </LRow>
                <RatesRow id="under" open={!!ratesOpen.under} onToggle={() => toggleRates("under")} summary={rsUnder}>
                  <NumIn label="Underlayment" unit="$/sq" value={spec.underlaymentPerSq} onChange={(v) => set("underlaymentPerSq", v)} disabled={disabled} />
                  {spec.iceWater !== "none" && <NumIn label="Ice & water" unit="$/sq ft" lg value={spec.iceWaterPerSqft} onChange={(v) => set("iceWaterPerSqft", v)} disabled={disabled} />}
                </RatesRow>
              </>
            )}
          </Sec>

          {/* 03 · EDGES */}
          <Sec
            n="03"
            id="edges"
            title="Edges"
            value={vEdges}
            chip={edgeEstimated ? <span className="chip wait">from outline</span> : !noEdges ? <span className="chip">entered</span> : undefined}
            sum={sums?.edges ?? null}
            open={!!open.edges}
            onToggle={() => toggle("edges")}
          >
            <LRow
              k="Lengths"
              note={
                edgeEstimated ? (
                  "Estimated from the building outline — check them against the photo."
                ) : estimateEdges(facts) ? (
                  <button type="button" className="beb-link" onClick={resetEdges} disabled={disabled}>Back to the outline estimate</button>
                ) : null
              }
            >
              <NumIn label="Eave" unit="ft" value={spec.eaveFt} onChange={(v) => setEdge("eaveFt", v)} disabled={disabled} />
              <NumIn label="Rake" unit="ft" value={spec.rakeFt} onChange={(v) => setEdge("rakeFt", v)} disabled={disabled} />
              <NumIn label="Ridge" unit="ft" value={spec.ridgeFt} onChange={(v) => setEdge("ridgeFt", v)} disabled={disabled} />
              <NumIn label="Hip" unit="ft" value={spec.hipFt} onChange={(v) => setEdge("hipFt", v)} disabled={disabled} />
            </LRow>
            <LRow k="Metal & starter">
              <CheckIn label="Drip edge" checked={spec.dripEdgeOn} onChange={(v) => set("dripEdgeOn", v)} disabled={disabled} />
              {spec.dripEdgeOn && (
                <>
                  <SelIn label="Profile" value={spec.dripProfileId} options={DRIP_EDGE_PROFILES} onChange={pickDrip} disabled={disabled} />
                  <SelIn label="Size" value={spec.dripSizeId} options={DRIP_EDGE_SIZES} onChange={(v) => set("dripSizeId", v)} disabled={disabled} w="sm" />
                </>
              )}
              {starterApplies && <CheckIn label="Starter strip" checked={spec.starterOn} onChange={(v) => set("starterOn", v)} disabled={disabled} />}
            </LRow>
            {ratesOn && (
              <RatesRow id="edges" open={!!ratesOpen.edges} onToggle={() => toggleRates("edges")} summary={rsEdges}>
                {spec.dripEdgeOn && <NumIn label="Drip edge" unit="$/ft" value={spec.dripPerFt} onChange={(v) => set("dripPerFt", v)} disabled={disabled} />}
                {starterApplies && spec.starterOn && <NumIn label="Starter" unit="$/ft" value={spec.starterPerFt} onChange={(v) => set("starterPerFt", v)} disabled={disabled} />}
              </RatesRow>
            )}
          </Sec>

          {/* 04 · FLASHING */}
          <Sec n="04" id="flash" title="Flashing" value={vFlash} sum={sums?.flash ?? null} open={!!open.flash} onToggle={() => toggle("flash")}>
            <LRow k="Valleys">
              <NumIn label="Count" unit="each" value={spec.valleyCount} onChange={(v) => set("valleyCount", v)} disabled={disabled} />
              <span className="beb-times" aria-hidden="true">×</span>
              <NumIn label="Length" unit="ft each" value={spec.valleyFtEach} onChange={(v) => set("valleyFtEach", v)} disabled={disabled} />
              <SelIn label="Type" value={spec.valleyTypeId} options={VALLEY_TYPES} onChange={pickValley} disabled={disabled} w="wide" />
            </LRow>
            <LRow k="Sidewalls">
              <NumIn label="Walls" unit="each" value={spec.stepWallCount} onChange={(v) => set("stepWallCount", v)} disabled={disabled} />
              <span className="beb-times" aria-hidden="true">×</span>
              <NumIn label="Length" unit="ft each" value={spec.stepWallFtEach} onChange={(v) => set("stepWallFtEach", v)} disabled={disabled} />
              <SelIn label="Step" value={spec.stepSizeId} options={STEP_FLASHING_SIZES} onChange={pickStep} disabled={disabled} />
            </LRow>
            <LRow k="Apron · counter">
              <NumIn label="Apron / headwall" unit="ft" value={spec.apronFt} onChange={(v) => set("apronFt", v)} disabled={disabled} />
              <NumIn label="Counter" unit="ft" value={spec.counterFt} onChange={(v) => set("counterFt", v)} disabled={disabled} />
            </LRow>
            <LRow k="Pipe boots">
              {PIPE_BOOT_SIZES.map((s) => (
                <NumIn key={s.id} label={s.label} unit="each" value={spec.pipeBoots[s.id] ?? 0} onChange={(v) => set("pipeBoots", { ...spec.pipeBoots, [s.id]: v })} disabled={disabled} />
              ))}
            </LRow>
            <LRow k="Chimneys · curbs">
              <NumIn label="Chimneys" unit="each" value={spec.chimneyCount} onChange={(v) => set("chimneyCount", v)} disabled={disabled} />
              <SelIn label="Size" value={spec.chimneySizeId} options={CHIMNEY_SIZES} onChange={pickChimney} disabled={disabled} />
              <NumIn label="Curbs" unit="each" value={spec.curbCount} onChange={(v) => set("curbCount", v)} disabled={disabled} />
            </LRow>
            <RatesRow id="flash" open={!!ratesOpen.flash} onToggle={() => toggleRates("flash")} summary={rsFlash}>
              <NumIn label="Valley metal" unit="$/ft" value={spec.valleyMatPerFt} onChange={(v) => set("valleyMatPerFt", v)} disabled={disabled} />
              <NumIn label="Valley labor" unit="$/ft" value={spec.valleyLaborPerFt} onChange={(v) => set("valleyLaborPerFt", v)} disabled={disabled} />
              <NumIn label="Step piece" unit="$/ea" value={spec.stepPerPiece} onChange={(v) => set("stepPerPiece", v)} disabled={disabled} />
              <NumIn label="Step labor" unit="$/ft" value={spec.stepLaborPerFt} onChange={(v) => set("stepLaborPerFt", v)} disabled={disabled} />
              <NumIn label="Apron" unit="$/ft" value={spec.apronPerFt} onChange={(v) => set("apronPerFt", v)} disabled={disabled} />
              <NumIn label="Apron labor" unit="$/ft" value={spec.apronLaborPerFt} onChange={(v) => set("apronLaborPerFt", v)} disabled={disabled} />
              <NumIn label="Counter" unit="$/ft" value={spec.counterPerFt} onChange={(v) => set("counterPerFt", v)} disabled={disabled} />
              <NumIn label="Counter labor" unit="$/ft" value={spec.counterLaborPerFt} onChange={(v) => set("counterLaborPerFt", v)} disabled={disabled} />
              <NumIn label="Chimney kit" unit="$/ea" value={spec.chimneyEach} onChange={(v) => set("chimneyEach", v)} disabled={disabled} />
              <NumIn label="Chimney labor" unit="$/ea" value={spec.chimneyLabor} onChange={(v) => set("chimneyLabor", v)} disabled={disabled} />
              <NumIn label="Curb kit" unit="$/ea" value={spec.curbEach} onChange={(v) => set("curbEach", v)} disabled={disabled} />
              <NumIn label="Curb labor" unit="$/ea" value={spec.curbLabor} onChange={(v) => set("curbLabor", v)} disabled={disabled} />
            </RatesRow>
          </Sec>

          {/* 05 · VENTS */}
          <Sec
            n="05"
            id="vents"
            title="Vents"
            value={vVents}
            chip={vent ? <span className={"chip " + (vent.ok ? "ok" : "bad")}>{vent.ok ? "balanced" : "short"}</span> : undefined}
            sum={sums?.vents ?? null}
            open={!!open.vents}
            onToggle={() => toggle("vents")}
          >
            <LRow k="Attic">
              <span className="beb-rates-sum">
                {vent
                  ? `${fmt(facts.footprintSqft ?? 0)} sq ft attic needs ${fmt(vent.requiredSqIn)} sq in net free area · this package: ${fmt(vent.exhaustSqIn)} exhaust${vent.poweredExhaust ? ` + ${vent.poweredExhaust} powered` : ""}, ${fmt(vent.intakeSqIn)} intake`
                  : "No footprint on this measurement, so the attic check is off — add what the roof needs"}
              </span>
            </LRow>
            <LRow k="In the package">
              {ventsOn.length > 0 ? (
                <div className="beb-tbl">
                  <div className="beb-tr beb-tr--vent beb-th">
                    <span>Vent</span><span>Qty</span><span>Material</span><span>Labor</span><span />
                  </div>
                  {ventsOn.map((t) => {
                    const v = ventOf(t.id);
                    const per = t.unit === "each" ? "$/ea" : "$/ft";
                    return (
                      <div className="beb-tr beb-tr--vent" key={t.id}>
                        <Cell cap="Vent" name>
                          <span className="beb-tname">
                            {t.label}
                            <em>{t.role}{t.nfaSqIn ? ` · ${t.nfaSqIn} sq in${t.unit === "linear ft" ? "/ft" : ""}` : " · powered"}</em>
                          </span>
                        </Cell>
                        <Cell cap="Qty"><NumIn aria={`${t.label} quantity`} unit={t.unit === "each" ? "each" : "ft"} value={v.qty} onChange={(n) => setVent(t.id, { qty: n })} disabled={disabled} /></Cell>
                        <Cell cap="Material"><NumIn aria={`${t.label} material`} unit={per} value={v.each} onChange={(n) => setVent(t.id, { each: n })} disabled={disabled} /></Cell>
                        <Cell cap="Labor"><NumIn aria={`${t.label} labor`} unit={per} value={v.labor} onChange={(n) => setVent(t.id, { labor: n })} disabled={disabled} /></Cell>
                        <button type="button" className="beb-x" disabled={disabled} aria-label={`Remove ${t.label}`} title="Remove" onClick={() => setVent(t.id, { qty: 0 })}>×</button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="beb-add">
                {ventsToAdd.length > 0 && (
                  <label className="est-field beb-f beb-f--wide">
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
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </span>
                  </label>
                )}
                <CheckIn label="Balanced · 1/300 rule" checked={spec.ventBalanced} onChange={(v) => set("ventBalanced", v)} disabled={disabled} />
              </div>
            </LRow>
          </Sec>

          {/* 06 · TEAR-OFF & EXTRAS */}
          <Sec n="06" id="tear" title="Tear-off & extras" value={vTear} sum={sums?.tear ?? null} open={!!open.tear} onToggle={() => toggle("tear")}>
            <LRow k="Tear-off">
              <SelIn label="Layers" value={String(spec.tearOffLayers)} options={[{ id: "0", label: "None · overlay" }, { id: "1", label: "1 layer" }, { id: "2", label: "2 layers" }, { id: "3", label: "3 layers" }]} onChange={(v) => set("tearOffLayers", Number(v) as 0 | 1 | 2 | 3)} disabled={disabled} w="sm" />
              <NumIn label="Deck sheets" unit="each" value={spec.plywoodSheets} onChange={(v) => set("plywoodSheets", v)} disabled={disabled} />
            </LRow>
            <LRow
              k="Lump sums"
              note={steepest < 8 ? `Steep safety is charged from 8/12 up — this roof is ${steepest > 0 ? `${Math.round(steepest)}/12` : "flatter"}, so it stays off.` : null}
            >
              <NumIn label="Cleanup" unit="$" value={spec.cleanupLump} onChange={(v) => set("cleanupLump", v)} disabled={disabled} />
              <NumIn label="Steep safety" unit="$" value={spec.safetyLump} onChange={(v) => set("safetyLump", v)} disabled={disabled} />
              <NumIn label="Permit" unit="$" value={spec.permitLump} onChange={(v) => set("permitLump", v)} disabled={disabled} />
            </LRow>
            <RatesRow id="tear" open={!!ratesOpen.tear} onToggle={() => toggleRates("tear")} summary={rsTear}>
              <NumIn label="Tear-off labor" unit="$/sq·layer" lg value={spec.tearOffPerSqLayer} onChange={(v) => set("tearOffPerSqLayer", v)} disabled={disabled} />
              <NumIn label="Disposal" unit="$/sq·layer" lg value={spec.disposalPerSqLayer} onChange={(v) => set("disposalPerSqLayer", v)} disabled={disabled} />
              <NumIn label="Deck sheet" unit="$/ea" value={spec.plywoodEach} onChange={(v) => set("plywoodEach", v)} disabled={disabled} />
              <NumIn label="Sheet labor" unit="$/ea" value={spec.plywoodLabor} onChange={(v) => set("plywoodLabor", v)} disabled={disabled} />
              <NumIn label="Nails & fasteners" unit="$/sq" value={spec.nailsPerSq} onChange={(v) => set("nailsPerSq", v)} disabled={disabled} />
              <NumIn label="Sealant & collars" unit="$/sq" value={spec.sealantPerSq} onChange={(v) => set("sealantPerSq", v)} disabled={disabled} />
            </RatesRow>
          </Sec>

          {/* 07 · CUSTOM LINES */}
          <Sec n="07" id="custom" title="Custom lines" value={vCustom} sum={sums?.custom ?? null} open={!!open.custom} onToggle={() => toggle("custom")}>
            <div className="beb-tbl">
              {spec.custom.length > 0 && (
                <div className="beb-tr beb-tr--cu beb-th">
                  <span>Item</span><span>Qty</span><span>Unit</span><span>Price</span><span>Kind</span><span />
                </div>
              )}
              {spec.custom.map((c) => (
                <div className="beb-tr beb-tr--cu" key={c.id}>
                  <Cell cap="Item" name>
                    <input className="est-in" placeholder="A skylight, gutters, a fascia repair" value={c.name} disabled={disabled} onChange={(e) => setCustom(c.id, { name: e.target.value })} aria-label="Custom item" />
                  </Cell>
                  <Cell cap="Qty"><NumIn aria="Quantity" value={c.qty} onChange={(n) => setCustom(c.id, { qty: n })} disabled={disabled} /></Cell>
                  <Cell cap="Unit"><SelIn aria="Unit" value={c.unit} options={PKG_UNITS.map((u) => ({ id: u, label: u }))} onChange={(v) => setCustom(c.id, { unit: v as PkgUnit })} disabled={disabled} /></Cell>
                  <Cell cap="Price"><NumIn aria="Unit price" unit="$" value={c.unitPrice} onChange={(n) => setCustom(c.id, { unitPrice: n })} disabled={disabled} /></Cell>
                  <Cell cap="Kind"><SelIn aria="Material or labor" value={c.kind} options={[{ id: "material", label: "material" }, { id: "labor", label: "labor" }]} onChange={(v) => setCustom(c.id, { kind: v as "material" | "labor" })} disabled={disabled} /></Cell>
                  <button type="button" className="beb-x" disabled={disabled} aria-label="Remove custom line" title="Remove" onClick={() => removeCustom(c.id)}>×</button>
                </div>
              ))}
              <div className="beb-tfoot">
                <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => addCustom("material")}>+ Material</button>
                <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => addCustom("labor")}>+ Labor</button>
              </div>
            </div>
          </Sec>
        </div>
      </div>

      {/* THE FOOT — whose rates these are, and the total where the reader ends up. */}
      <div className="beb-foot">
        <div className="beb-cat">
          <span className="beb-cat-txt">
            {source === "loading" ? "Loading rates…" : source === "org" ? "Your company’s rates" : "Built-in rates"}
            {dirty && source !== "loading" ? <em> · unsaved</em> : null}
          </span>
          <button type="button" className={"btn " + (dirty ? "btn-primary" : "btn-ghost")} disabled={disabled || saving || source === "loading"} onClick={() => void saveDefaults()}>
            {saving ? "Saving…" : "Save as defaults"}
          </button>
        </div>
        <div className="beb-foot-sum">
          <span className="beb-foot-v">{money(total)}</span>
          {convertBtn}
        </div>
      </div>
    </>
  );
}

// ── The card ───────────────────────────────────────────────────────────────
export default function BuildEstimateCardB({
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
  const basis = isRecon ? (
    "Estimated from aerial imagery, so these figures can’t be priced. Run Instant measure for this address to build a quote."
  ) : manual && squares != null ? (
    <>
      Your takeoff — <b>{squares.toFixed(1)} squares</b> at <b>{manual.pitchLabel}</b>.
    </>
  ) : squares != null ? (
    <>
      Measured — <b>{squares.toFixed(1)} squares</b>.
    </>
  ) : (
    "Measure the roof to price it."
  );

  return (
    <div className="card beb" data-build-card="b">
      <div className="beb-head">
        <div className="beb-head-l">
          <div className="card-title">Build an estimate</div>
          <div className="beb-basis">{basis}</div>
        </div>
        <div className="beb-head-r">
          {pitchEntry && (
            /* The aerial data carried no pitch: the contractor states one before anything is priced. */
            <label className="est-field beb-f">
              <span className="beb-k">Pitch</span>
              <span className="bp-sel">
                <select
                  className="bp-sel-in est-in"
                  id="pitchEntered"
                  value={pitchEntry.value ?? ""}
                  data-empty={pitchEntry.value ? undefined : "1"}
                  onChange={(e) => pitchEntry.onChange(e.target.value || null)}
                >
                  <option value="">Select pitch…</option>
                  {pitchEntry.options.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          )}
          <div className="vsw" role="radiogroup" aria-label="How to build the estimate">
            {(["package", "ai"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={buildMode === m} className={"vsw-btn" + (buildMode === m ? " active" : "")} onClick={() => onBuildMode(m)}>
                {m === "package" ? "Roof package" : "AI estimate"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {buildMode === "ai" && (
        <div className="beb-ai">
          <label className="est-field beb-f">
            <span className="beb-k">Waste factor</span>
            <span className="bp-sel">
              <select className="bp-sel-in est-in" id="waste" value={waste} onChange={(e) => onWaste(Number(e.target.value))}>
                {wasteOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}%
                  </option>
                ))}
              </select>
            </span>
          </label>
          <button className="btn btn-primary" type="button" id="buildBtn" disabled={generate.disabled} title={generate.reason} onClick={generate.onClick}>
            <svg className="ic"><use href="#i-bulb" /></svg>
            {generate.busy ? "Generating…" : "Generate estimate"}
          </button>
          <p className="beb-ai-hint">
            {generate.disabled && generate.reason ? generate.reason : "Drafts a full package from the measured figures; every line stays editable below."}
          </p>
        </div>
      )}

      {buildMode === "package" && facts && !isRecon && (
        <PackageLedger facts={facts} disabled={builderDisabled} converting={converting} onBuild={onBuild} onConvert={onConvert} />
      )}

      {output}
    </div>
  );
}
