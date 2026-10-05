"use client";
// THE DECK ESTIMATOR (2026-10-04) — page CONTENT (the shell owns the chrome).
// Marked Coming soon: only admins reach this component (lib/deck/access);
// everyone else gets deck-coming-soon.tsx at the same URL.
//
// Five steps on the left — Shape, Height and house, Frame, Surface, Railing
// and stairs — and the deck on the right, standing up in 3D (or as a framing
// plan) with the code-check verdict under it. Every change re-frames,
// re-counts and re-prices the deck in the browser (lib/deck is pure); below
// sit the full code-check strip, the price as the proposal will carry it,
// the material package, and the shop's own prices.
//
// On a phone (≤768px, in the handheld frame) the same page reads as one
// column: the deck first, then the steps, the price and the lists.

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { resolveMarket, parseStateZip, type MarketSnapshot } from "@/lib/fence/market";
import { DECKING, DECKING_FAMILY_LABEL, DECKING_FAMILY_ORDER, FRAMING_SPECIES, RAIL_TYPES, WALL_TYPES, defaultDecking, defaultFramingSpecies, wallType } from "@/lib/deck/catalog";
import { LEDGER_FASTENER_LABEL, LOADS, POST_SIZES, SOLID_BEAMS, ftIn, type LoadPsf, type SoilPsf } from "@/lib/deck/codeTables";
import { BUILT_UP_CHOICES, DECK_LIMITS, NOTCH_CORNERS, PLACEMENT_LABEL, defaultDeckDesign, sizeWords, type DeckDesign, type NotchCorner, type Placement } from "@/lib/deck/design";
import { priceDeck, deckNotes, deckScope } from "@/lib/deck/pricing";
import { applyDeckPatch, checkSummary, deckChecks, type DeckCheck, type DeckPatch } from "@/lib/deck/checks";
import { deckScene, SCENE_LAYERS, SCENE_LAYER_LABEL } from "@/lib/deck/scene";
import { BOM_STEP_LABEL, type BomStep } from "@/lib/deck/takeoff";
import { DECK_RATES, DECK_RATE_GROUP_LABEL, deckRate, sanitizeDeckRateBook, type DeckRateBook, type DeckRateGroup } from "@/lib/deck/rates";
import { convertDeckEstimateToProposal, saveDeckRateBook } from "@/actions/deckEstimator";
import { reportPlanLimitResult } from "@/stores/usePlanLimitStore";
import { DeckPlan } from "./deck-plan";
import s from "./deck-studio.module.css";

const DeckModel3D = dynamic(() => import("@/components/estimator/deck/DeckModel3D").then((m) => m.DeckModel3D), {
  ssr: false,
  loading: () => <div className={s.viewWait}>Setting up the 3D view…</div>,
});

const LAYERS = SCENE_LAYERS.length;
const money = (n: number, cents = false) => `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/** "16", "16.5", "16'6", 16' 6"" → feet. */
function parseFeet(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/i.exec(t);
  if (!m) return null;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
}
/** Inches; a foot mark reads as feet ("3'" = 36, "3'6" = 42). */
function parseInches(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/['f]/i.test(t)) {
    const ft = parseFeet(t);
    return ft === null ? null : ft * 12;
  }
  const n = Number(t.replace(/("|in)$/i, ""));
  return Number.isFinite(n) ? n : null;
}
const feetText = (ft: number) => {
  const inches = Math.round(ft * 12);
  return inches % 12 === 0 ? String(inches / 12) : `${Math.floor(inches / 12)}'${inches % 12}"`;
};

/* ------------------------------------------------------------------ */
/*  Small controls                                                     */
/* ------------------------------------------------------------------ */

function Field({ label, aside, children, wide }: { label: string; aside?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cx(s.field, wide && s.fieldWide)}>
      <span className={s.lbl}>
        <span>{label}</span>
        {aside ? <span className={s.lblAside}>{aside}</span> : null}
      </span>
      {children}
    </label>
  );
}

/** A number typed freely: committed while it is inside its rails, and on leaving the field (held to them). */
function NumberInput({ value, onCommit, parse, format, min, max, label }: { value: number; onCommit: (n: number) => void; parse: (t: string) => number | null; format: (n: number) => string; min: number; max: number; label: string }) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <input
      className={cx(s.in, s.num)}
      inputMode="decimal"
      aria-label={label}
      value={draft ?? format(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = parse(text);
        if (n !== null && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => {
        if (draft === null) return;
        const n = parse(draft);
        if (n !== null) onCommit(Math.min(max, Math.max(min, n)));
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Seg<T extends string | number>({ value, options, onChange, label, small }: { value: T; options: ReadonlyArray<{ value: T; label: string; title?: string }>; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div className={cx(s.seg, small && s.segSmall)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={cx(s.segBtn, o.value === value && s.segOn)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={s.toggleBox} aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

function Step({ n, title, summary, children }: { n: number; title: string; summary: string; children: React.ReactNode }) {
  return (
    <details className={s.step} open>
      <summary className={s.stepHead}>
        <span className={s.stepN}>{n}</span>
        <span className={s.stepTitle}>{title}</span>
        <span className={s.stepSum}>{summary}</span>
      </summary>
      <div className={s.stepBody}>{children}</div>
    </details>
  );
}

const LEVEL_LABEL: Record<DeckCheck["level"], string> = { fail: "Fix", warn: "Check", info: "Note", pass: "Pass" };

/* ------------------------------------------------------------------ */
/*  The studio                                                         */
/* ------------------------------------------------------------------ */

const HEIGHT_PRESETS: ReadonlyArray<{ label: string; inches: number }> = [
  { label: "Near the ground", inches: 14 },
  { label: "Two steps", inches: 24 },
  { label: "First floor", inches: 36 },
  { label: "Walk-out", inches: 96 },
  { label: "Second storey", inches: 120 },
];
const CORNER_LABEL: Record<NotchCorner, string> = { "front-left": "Front left", "front-right": "Front right", "back-left": "Back left", "back-right": "Back right" };

export function DeckStudio({ initialBook, homeState, initialAddress, clientId, adminPreview = false }: { initialBook: DeckRateBook; homeState: string | null; initialAddress?: string; clientId?: string; adminPreview?: boolean }) {
  const router = useRouter();
  const [address, setAddress] = React.useState(initialAddress ?? "");
  const [addressDraft, setAddressDraft] = React.useState(initialAddress ?? "");
  const market: MarketSnapshot = React.useMemo(() => {
    const parsed = parseStateZip(address);
    return parsed.state || parsed.zip ? resolveMarket({ address }) : resolveMarket({ state: homeState });
  }, [address, homeState]);
  const [design, setDesign] = React.useState<DeckDesign>(() => defaultDeckDesign({ state: market.state || homeState, frostIn: market.frostIn }));
  const [book, setBook] = React.useState<DeckRateBook>(initialBook);
  /** What the contractor chose by hand; a new address does not overwrite those. */
  const touched = React.useRef(new Set<string>());

  const patch = React.useCallback((p: DeckPatch, keys: string[] = []) => {
    for (const k of keys) touched.current.add(k);
    setDesign((d) => applyDeckPatch(d, p));
  }, []);

  const commitAddress = (text: string) => {
    const next = text.trim();
    setAddress(next);
    const parsed = parseStateZip(next);
    const m = parsed.state || parsed.zip ? resolveMarket({ address: next }) : resolveMarket({ state: homeState });
    const p: DeckPatch = {};
    if (!touched.current.has("frost")) p.frostIn = m.frostIn ?? design.frostIn;
    if (!touched.current.has("species")) p.framing = { species: defaultFramingSpecies(m.state || homeState) };
    if (!touched.current.has("decking")) p.decking = { product: defaultDecking(m.state || homeState) };
    setDesign((d) => applyDeckPatch(d, p));
  };

  const pkg = React.useMemo(() => priceDeck(design, { rates: book, market }), [design, book, market]);
  const frame = pkg.frame;
  const checks = React.useMemo(() => deckChecks(frame), [frame]);
  const summary = checkSummary(checks);
  const scene = React.useMemo(() => deckScene(frame, pkg.takeoff.surface), [frame, pkg.takeoff.surface]);
  const wall = wallType(design.wall);

  /* ── the 3D's build-up ── */
  const [view, setView] = React.useState<"3d" | "plan">("3d");
  const [built, setBuilt] = React.useState<number>(LAYERS);
  const [xray, setXray] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [resetToken, setResetToken] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const seconds = 7;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / (seconds * 1000));
      setBuilt(t * LAYERS);
      if (t < 1) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const play = () => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    setView("3d");
    if (reduced) {
      setBuilt(LAYERS);
      return;
    }
    setBuilt(0);
    setPlaying(true);
  };
  const layerNow = built >= LAYERS ? "Finished deck" : `Building: ${SCENE_LAYER_LABEL[SCENE_LAYERS[Math.min(LAYERS - 1, Math.floor(built))]]}`;

  /* ── the proposal ── */
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const title = `${sizeWords(design)} deck — ${frame.decking.label}`;
  const convert = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await convertDeckEstimateToProposal({
        title,
        scope: deckScope(pkg, address || null).join("\n"),
        assumptions: deckNotes(pkg),
        lines: pkg.lines.map((l) => ({ name: l.name, description: l.description, quantity: l.quantity, unit: l.unit, materialCost: l.materialCost, laborCost: l.laborCost })),
        address: address || null,
        plan: { design, scene },
        clientId: clientId ?? null,
      });
      if (res.ok) {
        router.push(`/dashboard/manual-blueprint?proposal=${res.id}` as Route);
        return;
      }
      if (res.code === "PLAN_LIMIT_REACHED") reportPlanLimitResult(res);
      setError(res.error);
    } catch {
      setError("The proposal could not be saved. Check the connection and try again.");
    }
    setBusy(false);
  };

  /* ── the shop's prices ── */
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialBook).map(([k, v]) => [k, String(v)])));
  const [saving, setSaving] = React.useState<"idle" | "saving" | "saved" | "failed">("idle");
  const draftBook = React.useMemo(() => sanitizeDeckRateBook(Object.fromEntries(Object.entries(drafts).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]))), [drafts]);
  const unsaved = JSON.stringify(draftBook) !== JSON.stringify(book);
  const saveBook = async () => {
    setSaving("saving");
    const res = await saveDeckRateBook(draftBook).catch(() => ({ ok: false as const, error: "" }));
    if (res.ok) {
      setBook(res.book);
      setDrafts(Object.fromEntries(Object.entries(res.book).map(([k, v]) => [k, String(v)])));
      setSaving("saved");
    } else setSaving("failed");
  };

  const exampleShare = Math.round(pkg.exampleShare * 100);
  const shapeSummary = `${sizeWords(design)} · ${Math.round(pkg.areaSqFt)} sq ft`;
  const heightSummary = `${design.heightIn >= 24 ? ftIn(design.heightIn) : `${design.heightIn} in.`} · ${design.placement === "attached" ? "ledger" : design.placement === "beside" ? "own posts" : "freestanding"}`;
  const frameSummary = `${frame.joistSize} @ ${frame.spacingIn}" · ${[...new Set(frame.beams.map((b) => b.spec.size))].join(", ")} ${frame.beamStyle === "flush" ? "flush" : "beam"}`;
  const surfaceSummary = frame.decking.label;
  const extrasSummary = [pkg.railFt ? `${Math.round(pkg.railFt)} ft rail` : null, pkg.stairSteps ? `${pkg.stairSteps} steps` : null].filter(Boolean).join(" · ") || "None yet";

  const bomByStep = React.useMemo(() => {
    const out = new Map<BomStep, typeof pkg.bom>();
    for (const l of pkg.bom) out.set(l.step, [...(out.get(l.step) ?? []), l]);
    return out;
  }, [pkg]);

  const issues = checks.filter((c) => c.level === "fail" || c.level === "warn");
  const ordered = [...checks].sort((a, b) => ["fail", "warn", "info", "pass"].indexOf(a.level) - ["fail", "warn", "info", "pass"].indexOf(b.level));

  return (
    <div className={s.studio}>
      <div className={s.pageHead}>
        <div>
          <div className={s.kicker}>Automation · Estimating</div>
          <h1 className={s.pageTitle}>Deck estimator</h1>
          {adminPreview ? (
            <div className={s.previewNote}>
              <span className={cx(s.stamp, s.stampWarn)}>Coming soon</span>
              <span>Customers see a coming-soon page here. You can work and test it because you are an admin.</span>
            </div>
          ) : null}
          <p className={s.pageSub}>Size the deck, pick what it is built from, and it frames itself from the code tables — joists, beams, posts, footings and the ledger — stands up in 3D and prices the material package.</p>
        </div>
      </div>

      {/* The job: where it is decides the lumber, the frost line and the market's prices. */}
      <section className={cx(s.card, s.jobBar)} aria-label="Job">
        <form
          className={s.addrForm}
          onSubmit={(e) => {
            e.preventDefault();
            commitAddress(addressDraft);
          }}
        >
          <Field label="Job address" aside={<span>{market.label}{market.frostIn !== undefined ? ` · frost ${market.frostIn} in.` : ""}</span>} wide>
            <input className={s.in} value={addressDraft} placeholder="Street, city, state ZIP" autoComplete="street-address" onChange={(e) => setAddressDraft(e.target.value)} onBlur={() => addressDraft.trim() !== address && commitAddress(addressDraft)} />
          </Field>
        </form>
        <div className={s.jobFacts}>
          <span className={s.mono}>{frame.species.region} lumber: {frame.species.short}</span>
          {exampleShare > 0 ? <span className={cx(s.stamp, s.stampWarn)}>{exampleShare}% example prices</span> : <span className={cx(s.stamp, s.stampPass)}>Your prices</span>}
        </div>
      </section>

      <div className={s.layout}>
        {/* ── the deck ───────────────────────────────────────────── */}
        <section className={cx(s.card, s.viewer)} aria-label="The deck">
          <div className={s.viewHead}>
            <div className={s.viewTitle}>
              <span className={s.cardTitle}>The deck</span>
              <span className={s.mono}>{scene.facts}</span>
            </div>
            <Seg small label="View" value={view} onChange={setView} options={[{ value: "3d", label: "3D" }, { value: "plan", label: "Framing plan" }]} />
          </div>
          <div className={s.viewBox}>
            {view === "3d" ? <DeckModel3D scene={scene} built={built} xray={xray} resetToken={resetToken} className={s.canvas} label={`The deck in 3D: ${scene.facts}`} /> : <div className={s.planWrap}><DeckPlan frame={frame} /></div>}
          </div>
          {view === "3d" ? (
            <div className={s.buildRow}>
              <button type="button" className={cx(s.btn, s.btnSm, playing && s.btnOn)} onClick={() => (playing ? setPlaying(false) : play())}>
                {playing ? "Pause" : "Build it"}
              </button>
              <label className={s.buildSlider}>
                <span className={s.mono}>{layerNow}</span>
                <input type="range" min={0} max={LAYERS} step={0.01} value={built} aria-label="How much of the deck is standing" onChange={(e) => { setPlaying(false); setBuilt(Number(e.target.value)); }} />
              </label>
              <button type="button" className={cx(s.btn, s.btnSm, xray && s.btnOn)} aria-pressed={xray} onClick={() => setXray((x) => !x)}>
                X-ray
              </button>
              <button type="button" className={cx(s.btn, s.btnSm)} onClick={() => setResetToken((t) => t + 1)}>
                Reset view
              </button>
            </div>
          ) : null}
          <a className={s.verdict} href="#deck-checks">
            {summary.fail ? <span className={cx(s.stamp, s.stampBad)}>{summary.fail} to fix</span> : <span className={cx(s.stamp, s.stampPass)}>Inside the tables</span>}
            {summary.warn ? <span className={cx(s.stamp, s.stampWarn)}>{summary.warn} to check</span> : null}
            <span className={s.verdictText}>{issues[0] ? `${issues[0].part}: ${issues[0].text}` : `${summary.pass} checks pass — every number names its table.`}</span>
            <span className={s.verdictTotal}>{money(pkg.subtotal)}</span>
          </a>
        </section>

        {/* ── the steps ──────────────────────────────────────────── */}
        <div className={s.steps}>
          <Step n={1} title="Shape" summary={shapeSummary}>
            <Seg label="Shape" value={design.shape.kind} onChange={(k) => patch({ shape: k === "rect" ? { kind: "rect", widthFt: design.shape.widthFt, depthFt: design.shape.depthFt } : { kind: "L", widthFt: design.shape.widthFt, depthFt: design.shape.depthFt, notch: { corner: "front-right", widthFt: Math.round(design.shape.widthFt / 3), depthFt: Math.round(design.shape.depthFt / 3) } } })} options={[{ value: "rect", label: "Rectangle" }, { value: "L", label: "L-shape" }]} />
            <div className={s.grid2}>
              <Field label="Along the house" aside="ft">
                <NumberInput label="Width along the house, feet" value={design.shape.widthFt} parse={parseFeet} format={feetText} min={DECK_LIMITS.widthFt.min} max={DECK_LIMITS.widthFt.max} onCommit={(n) => patch({ shape: { ...design.shape, widthFt: n } })} />
              </Field>
              <Field label="Out from the house" aside="ft">
                <NumberInput label="Depth out from the house, feet" value={design.shape.depthFt} parse={parseFeet} format={feetText} min={DECK_LIMITS.depthFt.min} max={DECK_LIMITS.depthFt.max} onCommit={(n) => patch({ shape: { ...design.shape, depthFt: n } })} />
              </Field>
            </div>
            {design.shape.kind === "L" ? (
              <>
                <Field label="Corner cut away" wide>
                  <Seg small label="Corner cut away" value={design.shape.notch.corner} onChange={(c) => design.shape.kind === "L" && patch({ shape: { ...design.shape, notch: { ...design.shape.notch, corner: c } } })} options={NOTCH_CORNERS.map((c) => ({ value: c, label: CORNER_LABEL[c] }))} />
                </Field>
                <div className={s.grid2}>
                  <Field label="Cut along the house" aside="ft">
                    <NumberInput label="Corner cut along the house, feet" value={design.shape.notch.widthFt} parse={parseFeet} format={feetText} min={2} max={design.shape.widthFt - 3} onCommit={(n) => design.shape.kind === "L" && patch({ shape: { ...design.shape, notch: { ...design.shape.notch, widthFt: n } } })} />
                  </Field>
                  <Field label="Cut out from the house" aside="ft">
                    <NumberInput label="Corner cut out from the house, feet" value={design.shape.notch.depthFt} parse={parseFeet} format={feetText} min={2} max={design.shape.depthFt - 3} onCommit={(n) => design.shape.kind === "L" && patch({ shape: { ...design.shape, notch: { ...design.shape.notch, depthFt: n } } })} />
                  </Field>
                </div>
                <p className={s.hint}>A back corner is where the house steps out into the deck — a bump-out or a bay.</p>
              </>
            ) : null}
          </Step>

          <Step n={2} title="Height and house" summary={heightSummary}>
            <Field label="How it meets the house" wide>
              <Seg small label="How it meets the house" value={design.placement} onChange={(p: Placement) => patch({ placement: p })} options={(["attached", "beside", "detached"] as const).map((p) => ({ value: p, label: PLACEMENT_LABEL[p].split(" — ")[0], title: PLACEMENT_LABEL[p] }))} />
            </Field>
            {design.placement !== "detached" ? (
              <Field label="The house wall there" wide>
                <select className={s.sel} value={design.wall} onChange={(e) => patch({ wall: e.target.value as DeckDesign["wall"] })}>
                  {WALL_TYPES.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                      {w.ledger ? "" : " — no ledger"}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {design.placement !== "detached" && !wall.ledger ? <p className={cx(s.hint, s.hintWarn)}>{wall.why}</p> : null}
            <div className={s.grid2}>
              <Field label="Deck height" aside={`in. · ${ftIn(design.heightIn)}`}>
                <NumberInput label="Height of the deck surface above the ground, inches" value={design.heightIn} parse={parseInches} format={(n) => String(Math.round(n * 4) / 4)} min={DECK_LIMITS.heightIn.min} max={DECK_LIMITS.heightIn.max} onCommit={(n) => patch({ heightIn: n })} />
              </Field>
              <Field label="Frost depth" aside="in.">
                <NumberInput label="Frost depth, inches" value={design.frostIn} parse={(t) => (t.trim() === "" ? null : Number(t))} format={String} min={0} max={96} onCommit={(n) => patch({ frostIn: n }, ["frost"])} />
              </Field>
            </div>
            <div className={s.chips}>
              {HEIGHT_PRESETS.map((h) => (
                <button key={h.label} type="button" className={cx(s.chip, design.heightIn === h.inches && s.chipOn)} onClick={() => patch({ heightIn: h.inches })}>
                  {h.label} <span>{ftIn(h.inches)}</span>
                </button>
              ))}
            </div>
            <div className={s.grid2}>
              <Field label="Design load" aside="live or snow">
                <select className={s.sel} value={design.loadPsf} onChange={(e) => patch({ loadPsf: Number(e.target.value) as LoadPsf })}>
                  {LOADS.map((l) => (
                    <option key={l} value={l}>
                      {l === 40 ? "40 psf — live load" : `${l} psf ground snow`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Soil bears">
                <select className={s.sel} value={design.soilPsf} onChange={(e) => patch({ soilPsf: Number(e.target.value) as SoilPsf })}>
                  <option value={1500}>1,500 psf — the code&apos;s default</option>
                  <option value={2000}>2,000 psf</option>
                  <option value={3000}>3,000 psf or more</option>
                </select>
              </Field>
            </div>
          </Step>

          <Step n={3} title="Frame" summary={frameSummary}>
            <Field label="Framing lumber" wide>
              <select className={s.sel} value={design.framing.species} onChange={(e) => patch({ framing: { species: e.target.value as DeckDesign["framing"]["species"] } }, ["species"])}>
                <optgroup label="Pressure-treated">
                  {FRAMING_SPECIES.filter((f) => f.treated).map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Naturally durable, not treated">
                  {FRAMING_SPECIES.filter((f) => !f.treated).map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <p className={s.hint}>{frame.species.note}</p>
            <Field label="Joists" aside={design.framing.joist === "auto" ? `picked: ${frame.joistSize}` : undefined} wide>
              <Seg small label="Joists" value={design.framing.joist} onChange={(v) => patch({ framing: { joist: v } })} options={[{ value: "auto", label: "Auto" }, ...(["2x6", "2x8", "2x10", "2x12"] as const).map((v) => ({ value: v, label: v }))]} />
            </Field>
            <Field label="Joist spacing" aside={design.framing.spacingIn === "auto" ? `${frame.spacingIn} in. on center` : "on center"} wide>
              <Seg small label="Joist spacing" value={design.framing.spacingIn} onChange={(v) => patch({ framing: { spacingIn: v } })} options={[{ value: "auto", label: "Auto" }, { value: 12, label: '12"' }, { value: 16, label: '16"' }, { value: 24, label: '24"' }]} />
            </Field>
            <Field label="Beams" aside={design.framing.beamStyle === "auto" ? (frame.beamStyle === "flush" ? "picked: flush" : "picked: under the joists") : undefined} wide>
              <Seg small label="Beams" value={design.framing.beamStyle} onChange={(v) => patch({ framing: { beamStyle: v } })} options={[{ value: "auto", label: "Auto" }, { value: "dropped", label: "Under the joists" }, { value: "flush", label: "Flush, joists hung" }]} />
            </Field>
            <div className={s.grid2}>
              <Field label="Beam made of">
                <select className={s.sel} value={design.framing.beamKind} onChange={(e) => patch({ framing: { beamKind: e.target.value as DeckDesign["framing"]["beamKind"], beam: "auto" } })}>
                  <option value="solid">Solid 4x</option>
                  <option value="built-up">Built up from 2x</option>
                </select>
              </Field>
              <Field label="Beam size" aside={design.framing.beam === "auto" ? `picked: ${[...new Set(frame.beams.map((b) => b.spec.size))].join(", ")}` : undefined}>
                <select className={s.sel} value={design.framing.beam} onChange={(e) => patch({ framing: { beam: e.target.value as DeckDesign["framing"]["beam"] } })}>
                  <option value="auto">Auto — least cost</option>
                  {(frame.beamKind === "solid" ? SOLID_BEAMS : BUILT_UP_CHOICES).map((b) => (
                    <option key={b} value={b}>{b.includes("-") ? `${b[0]}-ply ${b.slice(2)}` : b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Posts">
                <select className={s.sel} value={design.framing.post} onChange={(e) => patch({ framing: { post: e.target.value as DeckDesign["framing"]["post"] } })}>
                  {POST_SIZES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Joists past the beam" aside={design.framing.overhangFt === "auto" ? `auto: ${ftIn(frame.zones[0].frontCantIn)}` : "ft"}>
                <select className={s.sel} value={String(design.framing.overhangFt)} onChange={(e) => patch({ framing: { overhangFt: e.target.value === "auto" ? "auto" : Number(e.target.value) } })}>
                  <option value="auto">Auto — up to 2 ft</option>
                  {[0, 0.5, 1, 1.5, 2, 2.5, 3].map((v) => (
                    <option key={v} value={v}>{v === 0 ? "None" : feetText(v).replace(/^(\d+)$/, "$1 ft")}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className={s.toggles}>
              <Toggle checked={design.framing.doubleRim} onChange={(v) => patch({ framing: { doubleRim: v } })}>Doubled rim and outside joists</Toggle>
              <Toggle checked={design.framing.joistTape} onChange={(v) => patch({ framing: { joistTape: v } })}>Joist tape on every top</Toggle>
              <Toggle checked={design.framing.braces} onChange={(v) => patch({ framing: { braces: v } })}>Knee braces at corner posts over 2 ft</Toggle>
              <Toggle checked={design.framing.blocking === "mid-span"} onChange={(v) => patch({ framing: { blocking: v ? "mid-span" : "auto" } })}>Mid-span blocking on spans over 8 ft</Toggle>
            </div>
            {design.placement === "attached" ? (
              <div className={s.grid2}>
                <Field label="Ledger fastened with">
                  <select className={s.sel} value={design.ledger.fastener} onChange={(e) => patch({ ledger: { fastener: e.target.value as DeckDesign["ledger"]["fastener"] } })}>
                    {wall.fasteners.map((f) => (
                      <option key={f} value={f}>{LEDGER_FASTENER_LABEL[f]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ties to the house">
                  <select className={s.sel} value={design.ledger.lateral} onChange={(e) => patch({ ledger: { lateral: e.target.value as "two" | "four" } })}>
                    <option value="two">Two 1,500-lb hold-downs</option>
                    <option value="four">Four 750-lb ties</option>
                  </select>
                </Field>
              </div>
            ) : null}
            <Field label="Footings" wide>
              <Seg small label="Footings" value={design.footing.type} onChange={(v) => patch({ footing: { type: v } })} options={[{ value: "poured", label: "Poured concrete" }, { value: "pier-block", label: "Precast pier blocks" }]} />
            </Field>
            {design.placement !== "attached" ? <Toggle checked={design.footing.frostAlways} onChange={(v) => patch({ footing: { frostAlways: v } })}>Dig to the frost line anyway</Toggle> : null}
          </Step>

          <Step n={4} title="Surface" summary={surfaceSummary}>
            <Field label="Deck boards" wide>
              <select className={s.sel} value={design.decking.product} onChange={(e) => patch({ decking: { product: e.target.value } }, ["decking"])}>
                {DECKING_FAMILY_ORDER.map((fam) => (
                  <optgroup key={fam} label={DECKING_FAMILY_LABEL[fam]}>
                    {DECKING.filter((d) => d.family === fam).map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <p className={s.hint}>
              Joists no more than {frame.decking.maxSpacingIn.square} in. apart ({frame.decking.maxSpacingIn.diagonal} in. on the diagonal) — {frame.decking.sourceNote}.
            </p>
            <div className={s.grid2}>
              <Field label="Fastened with">
                <select className={s.sel} value={design.decking.fastening} onChange={(e) => patch({ decking: { fastening: e.target.value as DeckDesign["decking"]["fastening"] } })}>
                  <option value="auto">Auto — {pkg.takeoff.surface.fastening === "hidden" ? "hidden clips" : "screws"}</option>
                  <option value="screws">Deck screws</option>
                  {frame.decking.hiddenFasteners ? <option value="hidden">Hidden clips</option> : null}
                </select>
              </Field>
              <Field label="Fascia">
                <select className={s.sel} value={design.decking.fascia} onChange={(e) => patch({ decking: { fascia: e.target.value as DeckDesign["decking"]["fascia"] } })}>
                  <option value="auto">Auto — {pkg.takeoff.surface.fascia.on ? "on" : "none"}</option>
                  <option value="match">Fascia on the open edges</option>
                  <option value="none">No fascia</option>
                </select>
              </Field>
              <Field label="Waste" aside="%">
                <NumberInput label="Waste allowance on the boards, percent" value={design.decking.wastePct} parse={(t) => (t.trim() === "" ? null : Number(t))} format={String} min={0} max={30} onCommit={(n) => patch({ decking: { wastePct: n } })} />
              </Field>
            </div>
            <Toggle checked={design.decking.diagonal} onChange={(v) => patch({ decking: { diagonal: v } })}>Boards on the diagonal (45°)</Toggle>
          </Step>

          <Step n={5} title="Railing and stairs" summary={extrasSummary}>
            <p className={s.hint}>Priced as allowances until the rail and stair builder lands.</p>
            <div className={s.grid2}>
              <Field label="Railing">
                <select className={s.sel} value={design.extras.rail} onChange={(e) => patch({ extras: { rail: e.target.value as DeckDesign["extras"]["rail"] } })}>
                  {RAIL_TYPES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Railing length" aside={design.extras.railFt === "auto" ? `auto: ${Math.round(pkg.railFt)} ft` : "ft"}>
                <NumberInput label="Railing length, feet (blank for every open edge)" value={design.extras.railFt === "auto" ? pkg.railFt : design.extras.railFt} parse={(t) => (t.trim() === "" ? null : Number(t))} format={(n) => String(Math.round(n * 10) / 10)} min={0} max={400} onCommit={(n) => patch({ extras: { railFt: n } })} />
              </Field>
              {design.extras.rail === "custom" ? (
                <Field label="Your rail price, installed" aside="$/ft">
                  <NumberInput label="Custom rail price per foot, installed" value={design.extras.railCustomPerFt} parse={(t) => (t.trim() === "" ? null : Number(t))} format={String} min={0} max={1000} onCommit={(n) => patch({ extras: { railCustomPerFt: n } })} />
                </Field>
              ) : null}
              <Field label="Flights of stairs">
                <NumberInput label="Flights of stairs" value={design.extras.stairFlights} parse={(t) => (t.trim() === "" ? null : Math.round(Number(t)))} format={String} min={0} max={6} onCommit={(n) => patch({ extras: { stairFlights: n } })} />
              </Field>
              <Field label="Stair width" aside="ft">
                <NumberInput label="Stair width, feet" value={design.extras.stairWidthFt} parse={parseFeet} format={feetText} min={3} max={12} onCommit={(n) => patch({ extras: { stairWidthFt: n } })} />
              </Field>
              <Field label="Tear out an old deck" aside="sq ft">
                <NumberInput label="Old deck to tear out, square feet" value={design.extras.demoSqFt} parse={(t) => (t.trim() === "" ? null : Number(t))} format={String} min={0} max={4000} onCommit={(n) => patch({ extras: { demoSqFt: n } })} />
              </Field>
            </div>
            {design.extras.railFt !== "auto" ? (
              <button type="button" className={s.link} onClick={() => patch({ extras: { railFt: "auto" } })}>
                Railing on every open edge
              </button>
            ) : null}
            <Toggle checked={design.extras.stainless} onChange={(v) => patch({ extras: { stainless: v } })}>Stainless connectors — within 300 ft of salt water</Toggle>
          </Step>
        </div>
      </div>

      {/* ── the price ─────────────────────────────────────────────── */}
      <section className={cx(s.card, s.price)} aria-label="Price">
        <div className={s.hero}>
          <div className={s.heroCell}>
            <div className={s.kpi}>Deck price</div>
            <div className={cx(s.heroV, s.accent)}>{money(pkg.subtotal)}</div>
            <div className={s.heroH}>before tax</div>
          </div>
          <div className={s.heroCell}>
            <div className={s.kpi}>Per square foot</div>
            <div className={s.heroV}>{money(pkg.pricePerSqFt, true)}</div>
            <div className={s.heroH}>{Math.round(pkg.areaSqFt)} sq ft</div>
          </div>
          <div className={s.heroCell}>
            <div className={s.kpi}>Material</div>
            <div className={s.heroV}>{money(pkg.materialSubtotal)}</div>
            <div className={s.heroH}>{pkg.bom.length} lines in the package</div>
          </div>
          <div className={s.heroCell}>
            <div className={s.kpi}>Labor</div>
            <div className={s.heroV}>{money(pkg.laborSubtotal)}</div>
            <div className={s.heroH}>by the measure</div>
          </div>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>On the proposal</th>
                <th className={s.r}>Qty</th>
                <th className={s.r}>Material</th>
                <th className={s.r}>Labor</th>
                <th className={s.r}>Total</th>
              </tr>
            </thead>
            <tbody>
              {pkg.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className={s.lineName}>{l.name}</div>
                    {l.description ? <div className={s.lineDesc}>{l.description}</div> : null}
                  </td>
                  <td className={cx(s.r, s.nums)}>
                    {l.quantity.toLocaleString("en-US")} <span className={s.unit}>{l.unit}</span>
                  </td>
                  <td className={cx(s.r, s.nums)}>{money(l.materialCost, true)}</td>
                  <td className={cx(s.r, s.nums)}>{money(l.laborCost, true)}</td>
                  <td className={cx(s.r, s.nums, s.strong)}>{money(l.quantity * l.unitPrice, true)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Subtotal, before tax</td>
                <td className={cx(s.r, s.nums, s.strong)}>{money(pkg.subtotal, true)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={s.convert}>
          {exampleShare > 0 ? (
            <p className={cx(s.call, s.callWarn)}>
              <b>{exampleShare}% of this price stands on example prices.</b> Set your own under <a href="#deck-rates">Your prices</a> before it goes to a client — the proposal can still be edited line by line after.
            </p>
          ) : null}
          {summary.fail ? (
            <p className={cx(s.call, s.callBad)}>
              <b>{summary.fail === 1 ? "One check fails" : `${summary.fail} checks fail`}.</b> The proposal can be made, but fix the frame before the client sees it — see <a href="#deck-checks">the checks</a>.
            </p>
          ) : null}
          {error ? <p className={cx(s.call, s.callBad)} role="alert">{error}</p> : null}
          <div className={s.convertRow}>
            <div className={s.mono}>{title}</div>
            <button type="button" className={cx(s.btn, s.btnPrimary)} disabled={busy} onClick={convert}>
              {busy ? "Making the proposal…" : summary.fail ? "Convert anyway" : "Convert to proposal"}
            </button>
          </div>
        </div>
      </section>

      {/* ── the checks ────────────────────────────────────────────── */}
      <section className={s.card} id="deck-checks" aria-label="Code checks">
        <div className={s.head}>
          <div>
            <div className={s.cardTitle}>Code checks</div>
            <div className={s.cardSub}>Each part of the frame against the table it is sized from. Estimating grade — the building department decides.</div>
          </div>
          <div className={s.headStamps}>
            {summary.fail ? <span className={cx(s.stamp, s.stampBad)}>{summary.fail} fix</span> : null}
            {summary.warn ? <span className={cx(s.stamp, s.stampWarn)}>{summary.warn} check</span> : null}
            <span className={cx(s.stamp, s.stampPass)}>{summary.pass} pass</span>
          </div>
        </div>
        <ul className={s.checks}>
          {ordered.map((c) => (
            <li key={c.id} className={cx(s.check, s[`level_${c.level}`])}>
              <span className={s.checkLevel}>{LEVEL_LABEL[c.level]}</span>
              <div className={s.checkBody}>
                <div className={s.checkText}>
                  <b>{c.part}.</b> {c.text}
                </div>
                {c.rule ? <div className={s.checkRule}>{c.rule}</div> : null}
              </div>
              {c.fix ? (
                <button type="button" className={cx(s.btn, s.btnSm)} onClick={() => patch(c.fix!.patch)}>
                  {c.fix.label}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* ── the material package ──────────────────────────────────── */}
      <section className={s.card} aria-label="Material package">
        <div className={s.head}>
          <div>
            <div className={s.cardTitle}>Material package</div>
            <div className={s.cardSub}>What to load on the truck, in the lengths the yard sells. Lumber near the soil is ordered ground-contact.</div>
          </div>
          <div className={s.mono}>{Math.round(pkg.takeoff.framingLf)} ft of framing · {pkg.takeoff.concreteBags} bags · {pkg.takeoff.footings} footings</div>
        </div>
        <div className={s.tableWrap}>
          <table className={cx(s.table, s.bom)}>
            <thead>
              <tr>
                <th className={s.r}>Qty</th>
                <th>Item</th>
                <th className={s.r}>Each</th>
                <th className={s.r}>Cost</th>
              </tr>
            </thead>
            {[...bomByStep].map(([step, rows]) => (
              <tbody key={step}>
                <tr className={s.groupRow}>
                  <td colSpan={3}>{BOM_STEP_LABEL[step]}</td>
                  <td className={cx(s.r, s.nums)}>{money(rows.reduce((a, l) => a + l.cost, 0), true)}</td>
                </tr>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className={cx(s.r, s.nums)}>
                      {l.qty.toLocaleString("en-US")} <span className={s.unit}>{l.unit}</span>
                    </td>
                    <td>
                      <div className={s.lineName}>{l.label}</div>
                      {l.note ? <div className={s.lineDesc}>{l.note}</div> : null}
                    </td>
                    <td className={cx(s.r, s.nums)}>
                      {money(l.unitPrice, true)}
                      {l.source !== "book" ? <span className={s.example} title="An example price — set yours under Your prices">ex</span> : null}
                    </td>
                    <td className={cx(s.r, s.nums)}>{money(l.cost, true)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {/* ── the shop's prices ─────────────────────────────────────── */}
      <section className={s.card} id="deck-rates" aria-label="Your prices">
        <div className={s.head}>
          <div>
            <div className={s.cardTitle}>Your prices</div>
            <div className={s.cardSub}>Every default here is an example, scaled to {market.label}. Type your own and save: your number is charged as typed, on every deck from then on. Leave a row blank to keep the example.</div>
          </div>
          <div className={s.headStamps}>
            {saving === "saved" && !unsaved ? <span className={cx(s.stamp, s.stampPass)}>Saved</span> : null}
            {saving === "failed" ? <span className={cx(s.stamp, s.stampBad)}>Not saved</span> : null}
            <button type="button" className={cx(s.btn, s.btnPrimary, s.btnSm)} disabled={!unsaved || saving === "saving"} onClick={saveBook}>
              {saving === "saving" ? "Saving…" : "Save my prices"}
            </button>
          </div>
        </div>
        <div className={s.rates}>
          {(Object.keys(DECK_RATE_GROUP_LABEL) as DeckRateGroup[]).map((group) => (
            <details key={group} className={s.rateGroup}>
              <summary>
                {DECK_RATE_GROUP_LABEL[group]}
                <span className={s.mono}>{DECK_RATES.filter((r) => r.group === group && draftBook[r.key] !== undefined).length || "no"} set</span>
              </summary>
              <div className={s.rateRows}>
                {DECK_RATES.filter((r) => r.group === group).map((r) => {
                  const example = deckRate(r.key, undefined, market).price;
                  return (
                    <label key={r.key} className={s.rateRow}>
                      <span className={s.rateLabel}>{r.label}</span>
                      <span className={s.rateUnit}>per {r.unit}</span>
                      <input className={cx(s.in, s.num, s.rateIn)} inputMode="decimal" placeholder={example.toFixed(2)} value={drafts[r.key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))} aria-label={`${r.label}, your price per ${r.unit}`} />
                    </label>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
