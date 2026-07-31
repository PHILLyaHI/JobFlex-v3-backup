"use client";

// MOBILE ROOF ESTIMATOR (mobile-roof-estimator-v2) — Blueprint system, handheld
// build. Archetype D: the DRAWING is the content.
//
// Tokens, palette, type scale and Motion System "Balanced" are the reference
// dashboard's; the shell (topbar / hamburger drawer / bottom sheets) is the
// shared <MobileNav />, so this surface is the same product as its twelve
// siblings.
//
// Every region of the desktop sheet is covered:
//  · page head + the context-aware primary action ("Measure another" ghost)
//  · INTAKE screen: the three instant samples, the note, and the
//    address/city/state/ZIP order form with its price check
//  · MEASURING screen: report number, the five stage captions, the drawn
//    progress rule
//  · REPORT screen: the four hero figures, the roof drawing with its 2D/3D and
//    Shaded/Pitch/Area/Length switches, the legend, linear footage, pitch mix
//    with its steep/low advisories, and the waste-factor takeoff with its
//    materials/labor tables and the Convert-to-proposal action
//
// What changes versus the desktop sheet, and why:
//  · The drawing is remapped into a fixed 340×230 frame (see
//    roof-estimator-data.ts → buildPlan) and sized from --app-h, so it never
//    needs an inner scroller and its annotations render at handheld sizes.
//  · Overall dimension lines are ADDED to the 2D plan. On a phone the drawing
//    carries the whole page, and a plan without its overall runs is not a
//    drawing — it is a shape.
//  · The two segmented switches (6 controls, ~30px tall on desktop) move into
//    a bottom sheet. Six 30px targets cannot survive 320px, and CLAUDE.md
//    prefers sheets over inline chrome.
//  · The desktop's 5-column takeoff table becomes 3 columns with the unit and
//    unit price folded into the item cell as a mono sub — nothing is hidden.
//  · The samples become row cards with an actions sheet, so removing one (and
//    reaching the empty state) is possible on a phone.
//  · The four hero cells become a masthead: one numeral, a mono kicker and
//    EXACTLY two annotations. Facet count is in the schedule table's own head,
//    where it is a row count rather than a vanity figure.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off. No map, no tiles, no geocoding, no fetch.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-roof-estimator.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { AddressField } from "@/components/v3/mobile-shell/address-field";
import { StatePicker } from "@/components/v3/mobile-shell/state-picker";
import { lockScroll } from "@/lib/scrollLock";
import {
  EDGE_KEYS,
  LINEAR_TOTAL,
  LINE_LABEL,
  MS_STAGES,
  PLAN_VB,
  REPORT_PRICE,
  REPORT_SEED,
  SAMPLES,
  TOTALS,
  WASTE_OPTIONS,
  buildPlan,
  buildTakeoff,
  hasStreetAddress,
  linearByType,
  money,
  num,
  pitchCalls,
  pitchGroups,
  structureKind,
  wasteSquares,
  type LabelMode,
  type Sample,
  type ViewMode,
} from "./roof-estimator-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Facet fills and edge treatments are resolved through explicit maps rather
   than computed style keys, so a missing class is a type error and never a
   silently unstyled polygon. */
const TONES = [styles.tone1, styles.tone2, styles.tone3, styles.tone4];
const EDGE_CLASS: Record<string, string> = {
  RIDGE: styles.eRidge,
  HIP: styles.eHip,
  VALLEY: styles.eValley,
  EAVE: styles.eEave,
  RAKE: styles.eRake,
};

const VIEWS: Array<{ k: ViewMode; t: string; s: string }> = [
  { k: "2d", t: "2D plan", s: "flat" },
  { k: "3d", t: "3D model", s: "axonometric" },
];
const LABELS: Array<{ k: LabelMode; t: string; s: string }> = [
  { k: "shaded", t: "Shaded", s: "id + face" },
  { k: "pitch", t: "Pitch", s: "rise / 12" },
  { k: "area", t: "Area", s: "sq ft" },
  { k: "length", t: "Length", s: "run + edges" },
];

type Phase = "intake" | "measuring" | "report";

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = num(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = num(value * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {num(value)}
    </div>
  );
}

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

export function MobileRoofEstimator() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const takeoffRef = useRef<HTMLDivElement>(null);
  const wasteRef = useRef<HTMLDivElement>(null);
  const addrRef = useRef<HTMLInputElement>(null);

  /* The donor mutates its REPORT and its sample list at runtime, so both are
     cloned per mount — the last visit must not leak into the next one. */
  const [samples, setSamples] = useState<Sample[]>(() => SAMPLES.map((s) => ({ ...s })));
  const [report, setReport] = useState(() => ({ ...REPORT_SEED }));

  const [phase, setPhase] = useState<Phase>("intake");
  const [stage, setStage] = useState(0);

  const [view, setView] = useState<ViewMode>("2d");
  const [labelMode, setLabelMode] = useState<LabelMode>("shaded");
  const [selFacet, setSelFacet] = useState<string | null>(null);

  const [waste, setWaste] = useState(12);
  const [built, setBuilt] = useState(false);
  const [converted, setConverted] = useState(false);
  /* The pitch bars are DRAWN on arrival rather than mounting at full length —
     "lines get drawn" is the Motion System's character. */
  const [barsIn, setBarsIn] = useState(false);

  const [sheetSample, setSheetSample] = useState<number | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);

  const [form, setForm] = useState({ addr: "", city: "", state: "", zip: "" });
  const [priced, setPriced] = useState(false);
  const [addrErr, setAddrErr] = useState(false);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather
     than trusting a bare 100vh/100dvh. The drawing frame is sized from it, so
     the plan is never taller than the screen it is read on. */
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    const releaseScroll = lockScroll();
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
      releaseScroll();
    };
  }, []);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll --------
     `.rv` is declared in the JSX, not added here, because this page swaps the
     WHOLE content set when the phase changes: adding the hidden class from an
     effect would let the new screen paint once at full opacity before it was
     hidden again. Under prefers-reduced-motion this effect returns early and
     the CSS kill-switch neutralises `.rv` instead. */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    let velLastY = host.scrollTop;
    let velLastT = performance.now();
    let vel = 0;
    const onScroll = () => {
      const now = performance.now();
      vel = Math.abs(host.scrollTop - velLastY) / Math.max(1, now - velLastT);
      velLastY = host.scrollTop;
      velLastT = now;
    };
    host.addEventListener("scroll", onScroll, { passive: true });

    const vpH = window.innerHeight;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          // Below the fold: duration follows scroll speed — slow ≈ 900ms,
          // fast never shorter than 550ms.
          if (t.dataset.rvScroll) {
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - vel * 160))}ms`;
          }
          t.classList.add(styles.rvIn);
          io.unobserve(t);
          const done = () => {
            t.style.transitionDelay = "";
            t.style.transitionDuration = "";
            t.removeEventListener("transitionend", done);
          };
          t.addEventListener("transitionend", done);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, [phase]);

  /* ---------- Motion: graph-paper parallax ----------------------------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Motion: press stamp (delegated, covers late rows) --------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.segBtn, styles.menuItem,
      styles.sheetCancel, styles.srowMain, styles.srowOpen, styles.planBtn,
      styles.priceBtn, styles.fcellBtn, styles.emptyA,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever this PAGE owns (the drawer is MobileNav's) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (wasteOpen) setWasteOpen(false);
      else if (planOpen) setPlanOpen(false);
      else if (orderOpen) setOrderOpen(false);
      else if (sheetSample !== null) setSheetSample(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wasteOpen, planOpen, orderOpen, sheetSample]);

  /* ---------- Waste dropdown: close on outside tap --------------------- */
  useEffect(() => {
    if (!wasteOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!wasteRef.current?.contains(e.target as Node)) setWasteOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [wasteOpen]);

  /* ---------- The measuring screen: donor timings, 650ms per stage ------ */
  useEffect(() => {
    if (phase !== "measuring") return;
    if (stage >= MS_STAGES.length - 1) {
      const t = window.setTimeout(() => setPhase("report"), 420);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setStage((s) => s + 1), 650);
    return () => window.clearTimeout(t);
  }, [phase, stage]);

  /* ---------- Building the takeoff brings it into view ------------------ */
  useEffect(() => {
    if (!built) return;
    const t = window.setTimeout(() => {
      takeoffRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    }, 60);
    return () => window.clearTimeout(t);
  }, [built]);

  /* ---------- Pitch bars draw themselves once the report lands ----------
     The reset lives in the two handlers that LEAVE the report, not here: a
     synchronous setState in an effect body is a cascading render. */
  useEffect(() => {
    if (phase !== "report") return;
    const t = window.setTimeout(() => setBarsIn(true), 40);
    return () => window.clearTimeout(t);
  }, [phase]);

  /* ---------- The "Proposal created" stamp reverts after 1800ms --------- */
  useEffect(() => {
    if (!converted) return;
    const t = window.setTimeout(() => setConverted(false), 1800);
    return () => window.clearTimeout(t);
  }, [converted]);

  /* ---------- derived --------------------------------------------------- */
  const plan = useMemo(() => buildPlan(view, labelMode), [view, labelMode]);
  const linear = useMemo(() => linearByType(), []);
  const groups = useMemo(() => pitchGroups(), []);
  const calls = useMemo(() => pitchCalls(), []);
  const takeoff = useMemo(() => buildTakeoff(waste), [waste]);

  const sampleRec = sheetSample === null ? null : (samples.find((s) => s.id === sheetSample) ?? null);

  const runMeasure = (id: number, address: string) => {
    setReport({ id, address });
    setStage(0);
    setBuilt(false);
    setConverted(false);
    setBarsIn(false);
    setSelFacet(null);
    setSheetSample(null);
    setOrderOpen(false);
    setPlanOpen(false);
    setWasteOpen(false);
    setPhase("measuring");
  };

  const openOrder = (prefill?: string) => {
    setForm({ addr: prefill ?? "", city: "", state: "", zip: "" });
    setPriced(false);
    setAddrErr(false);
    setSheetSample(null);
    setOrderOpen(true);
    // Focus once the slide settles — focusing mid-transform makes the keyboard
    // fight the animation.
    window.setTimeout(() => addrRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const checkPrice = () => {
    if (!form.addr.trim()) {
      setAddrErr(true);
      addrRef.current?.focus();
      return;
    }
    setPriced(true);
  };

  const submitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = form.addr.trim();
    if (!addr) {
      setAddrErr(true);
      addrRef.current?.focus();
      return;
    }
    const city = form.city.trim();
    runMeasure(Math.floor(69000000 + Math.random() * 900000), [addr, city].filter(Boolean).join(", "));
  };

  /* ---------- sample row sheet ------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const s = sampleRec;
    if (!s) return [];
    const street = hasStreetAddress(s);
    return [
      { act: "measure", icon: "i-roof", tone: styles.miBp, title: "Measure this roof",
        sub: "Finished report in seconds" },
      { act: "order", icon: "i-rotate", tone: styles.miOk, title: "Order a fresh report",
        sub: `Re-measures this address for $${REPORT_PRICE}` },
      { act: "copy", icon: "i-copy", tone: styles.miSky, title: "Copy report ID", sub: `#${s.id}` },
      { act: "dir", icon: "i-pin", tone: styles.miWarn, title: "Get directions",
        sub: street ? `${s.detail} — open in maps` : "No street address on this sample",
        disabled: !street },
      { act: "del", icon: "i-trash", tone: styles.miDanger, title: "Remove sample",
        sub: "Takes it off the sample list", danger: true },
    ];
  }, [sampleRec]);

  const runMenu = (act: string) => {
    const s = sampleRec;
    if (!s) {
      setSheetSample(null);
      return;
    }
    if (act === "measure") {
      runMeasure(s.id, s.detail);
      return;
    }
    if (act === "order") {
      openOrder(hasStreetAddress(s) ? s.detail : "");
      return;
    }
    if (act === "copy") {
      navigator.clipboard?.writeText(String(s.id)).catch(() => {});
    } else if (act === "del") {
      setSamples((prev) => prev.filter((x) => x.id !== s.id));
    }
    setSheetSample(null);
  };

  const anyOverlay = orderOpen || planOpen || sheetSample !== null;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const sampleDrag = useSheetDrag(sampleRec !== null, () => setSheetSample(null));
  const planDrag = useSheetDrag(planOpen, () => setPlanOpen(false));
  const orderDrag = useSheetDrag(orderOpen, () => setOrderOpen(false));
  const stageIdx = Math.min(stage, MS_STAGES.length - 1);
  const fill = Math.min(100, 8 + stageIdx * 24);

  return (
    <div className={styles.app} onClick={onRootClick}>
      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so this page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD — the only two filled buttons on the surface live here */}
          <div className={`${styles.pageHead} ${styles.rv}`} key="head">
            <div className={styles.kicker}>Automation · Measurement</div>
            <h1 className={styles.pageTitle}>Roof estimator</h1>
            {phase === "intake" ? (
              <div className={styles.pageActions}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  type="button"
                  onClick={() => openOrder()}
                >
                  <Icon id="i-roof" />
                  Measure a roof
                </button>
              </div>
            ) : null}
            {phase === "report" ? (
              <div className={styles.pageActions}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  type="button"
                  onClick={() => (built ? setConverted(true) : setBuilt(true))}
                >
                  <Icon id={built ? (converted ? "i-check" : "i-file") : "i-bulb"} />
                  {built ? (converted ? "Proposal created" : "Convert to proposal") : "Build estimate"}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnGhost}`}
                  type="button"
                  onClick={() => {
                    setPhase("intake");
                    setBuilt(false);
                    setConverted(false);
                    setBarsIn(false);
                  }}
                >
                  <Icon id="i-rotate" />
                  Measure another
                </button>
              </div>
            ) : null}
          </div>

          {/* ============================================================
              INTAKE — no report loaded yet
              ============================================================ */}
          {phase === "intake" ? (
            <div className={`${styles.card} ${styles.rv}`} key="intro">
              <div className={styles.introK}>Instant samples · no charge</div>
              <div className={styles.introT}>Start from a sample</div>
              <div className={styles.introS}>
                Tap a sample to measure it now, or order a report for any address. Ordering places a
                real measurement report — the sandbox account returns a finished report in a few
                seconds instead of hours.
              </div>
            </div>
          ) : null}

          {phase === "intake" && samples.length > 0 ? (
            <div className={`${styles.book} ${styles.rv}`} key="book">
              {samples.map((s, i) => (
                <div
                  key={s.id}
                  className={`${styles.srow} ${styles.rowIn}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <button
                    className={styles.srowMain}
                    type="button"
                    onClick={() => runMeasure(s.id, s.detail)}
                  >
                    <span className={styles.sname}>{s.label}</span>
                    <span className={styles.swhere}>{s.detail}</span>
                    <span className={styles.srowFoot}>
                      <span className={styles.tag}>{structureKind(s)}</span>
                      <span className={styles.sfig}>#{s.id}</span>
                    </span>
                  </button>
                  <button
                    className={styles.srowOpen}
                    type="button"
                    aria-label={`Actions for ${s.label}`}
                    onClick={() => setSheetSample(s.id)}
                  >
                    <Icon id="i-dots" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {phase === "intake" && samples.length === 0 ? (
            <div className={`${styles.empty} ${styles.rv}`} key="empty">
              <div className={styles.emptyT}>No samples left</div>
              <div className={styles.emptyS}>
                Every sample report was removed. Order a measurement for a real address instead — it
                comes back in minutes.
              </div>
              <button className={styles.emptyA} type="button" onClick={() => openOrder()}>
                <Icon id="i-plus" />
                Measure a roof
              </button>
            </div>
          ) : null}

          {/* ============================================================
              MEASURING — the donor's five stages
              ============================================================ */}
          {phase === "measuring" ? (
            <div className={`${styles.card} ${styles.rv}`} key="meas">
              <div className={styles.measTop}>
                <span className={styles.measNum}>#{report.id}</span>
                <span className={styles.measStep}>
                  Stage {stageIdx + 1} / {MS_STAGES.length}
                </span>
              </div>
              <div className={styles.measStage}>{MS_STAGES[stageIdx]}</div>
              <div
                className={styles.measTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fill}
                aria-label="Measurement progress"
              >
                <span className={styles.measFill} style={{ transform: `scaleX(${fill / 100})` }} />
              </div>
              <div className={styles.measHint}>
                Measuring the structure, pitch by pitch. This normally takes a few hours — sandbox
                returns in seconds.
              </div>
            </div>
          ) : null}

          {/* ============================================================
              REPORT
              ============================================================ */}
          {phase === "report" ? (
            <>
              {/* MASTHEAD — one numeral, a mono kicker, EXACTLY two annotations */}
              <div className={`${styles.mast} ${styles.rv}`} key="mast">
                <div className={styles.mastTop}>
                  <div className={styles.mastLbl}>
                    Roof area · sq ft
                    <span className={styles.mastRule} />
                  </div>
                  <CountUp value={TOTALS.area} className={styles.mastVal} />
                </div>
                <div className={styles.mastCnt}>
                  <div className={styles.mastSub}>
                    <div className={styles.mastSubL}>Squares</div>
                    <div className={styles.mastSubV}>{num(TOTALS.squares, 1)}</div>
                  </div>
                  <div className={styles.mastSub}>
                    <div className={styles.mastSubL}>Pitch</div>
                    <div className={styles.mastSubV}>{TOTALS.pitch}/12</div>
                  </div>
                </div>
              </div>

              {/* THE DRAWING — full-bleed inside its frame, sized from --app-h */}
              <div className={`${styles.card} ${styles.planCard} ${styles.rv}`} key="plan">
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>{view === "2d" ? "Roof plan" : "Roof model"}</div>
                  <div className={styles.cardSub}>
                    {report.address} · report #{report.id}
                  </div>
                </div>

                <div className={styles.planCanvas}>
                  <svg
                    className={styles.planSvg}
                    viewBox={`0 0 ${PLAN_VB.w} ${PLAN_VB.h}`}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label={`Roof ${view === "2d" ? "plan" : "model"} — ${TOTALS.facets} facets, ${num(TOTALS.area)} square feet, predominant pitch ${TOTALS.pitch} in 12`}
                  >
                    {plan.facets.map((f) => (
                      <g
                        key={f.id}
                        className={styles.facetG}
                        onClick={() => setSelFacet((cur) => (cur === f.id ? null : f.id))}
                      >
                        <polygon
                          className={`${styles.facet} ${TONES[f.tone - 1]} ${selFacet === f.id ? styles.isSel : ""}`}
                          points={f.points}
                        >
                          <title>{`${f.name} · ${num(f.area)} sq ft · ${f.pitch}/12 · faces ${f.dir}`}</title>
                        </polygon>
                        <text className={styles.fLbl} x={f.cx} y={f.cy}>
                          {f.head}
                        </text>
                        <text className={styles.fSub} x={f.cx} y={f.cy + 12}>
                          {f.sub}
                        </text>
                      </g>
                    ))}

                    {plan.edges.map((e) => (
                      <line
                        key={e.key}
                        className={`${styles.edgeLine} ${EDGE_CLASS[e.type] ?? styles.eEave}`}
                        x1={e.x1}
                        y1={e.y1}
                        x2={e.x2}
                        y2={e.y2}
                      />
                    ))}

                    {labelMode === "length"
                      ? plan.edges.map((e) => (
                          <text className={styles.edgeLbl} key={`len-${e.key}`} x={e.mx} y={e.my - 4}>
                            {num(e.feet)}&apos;
                          </text>
                        ))
                      : null}

                    {/* Overall dimensions, drawing-sheet style: witness ticks,
                        a mono label knocked out of the line. */}
                    {plan.dims.map((d) => (
                      <g key={d.key}>
                        <line className={styles.dimLine} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
                        {d.vertical ? (
                          <>
                            <line className={styles.dimTick} x1={d.x1 - 4} y1={d.y1} x2={d.x1 + 4} y2={d.y1} />
                            <line className={styles.dimTick} x1={d.x2 - 4} y1={d.y2} x2={d.x2 + 4} y2={d.y2} />
                          </>
                        ) : (
                          <>
                            <line className={styles.dimTick} x1={d.x1} y1={d.y1 - 4} x2={d.x1} y2={d.y1 + 4} />
                            <line className={styles.dimTick} x1={d.x2} y1={d.y2 - 4} x2={d.x2} y2={d.y2 + 4} />
                          </>
                        )}
                        <text
                          className={styles.dimText}
                          x={d.tx}
                          y={d.ty}
                          transform={d.vertical ? `rotate(-90 ${d.tx} ${d.ty})` : undefined}
                        >
                          {d.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                <div className={styles.planLegend}>
                  {EDGE_KEYS.map((k) => (
                    <span className={styles.lg} key={k}>
                      <svg className={styles.lgSw} viewBox="0 0 22 6" aria-hidden="true">
                        <line
                          className={`${styles.edgeLine} ${EDGE_CLASS[k]}`}
                          x1="1"
                          y1="3"
                          x2="21"
                          y2="3"
                        />
                      </svg>
                      {LINE_LABEL[k]}
                    </span>
                  ))}
                </div>

                <div className={styles.planFoot}>
                  <span className={styles.planMode}>
                    {view.toUpperCase()} · {labelMode.toUpperCase()}
                  </span>
                  <button className={styles.planBtn} type="button" onClick={() => setPlanOpen(true)}>
                    <Icon id="i-grid" />
                    Plan options
                  </button>
                </div>
              </div>

              {/* FACET SCHEDULE — the measurement table, under the drawing */}
              <div className={`${styles.card} ${styles.rv}`} key="sched">
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>Facet schedule</div>
                  <div className={styles.cardSub}>
                    {TOTALS.facets} planes · tap one to pick it out on the plan
                  </div>
                </div>
                <table className={styles.tbl}>
                  <thead>
                    <tr>
                      <th scope="col">Facet</th>
                      <th scope="col" className={styles.tblNum}>Pitch</th>
                      <th scope="col" className={styles.tblNum}>Sq ft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.facets.map((f, i) => (
                      <tr
                        key={f.id}
                        className={`${styles.rowIn} ${selFacet === f.id ? styles.rowSel : ""}`}
                        style={{ animationDelay: `${i * 45}ms` }}
                      >
                        <td className={styles.cellFlush}>
                          <button
                            className={styles.fcellBtn}
                            type="button"
                            aria-pressed={selFacet === f.id}
                            onClick={() => setSelFacet((cur) => (cur === f.id ? null : f.id))}
                          >
                            <span className={styles.fcellName}>{f.name}</span>
                            <span className={styles.fcellDir}>
                              {f.id} · faces {f.dir}
                            </span>
                          </button>
                        </td>
                        <td className={styles.tblNum}>{f.pitch}/12</td>
                        <td className={styles.tblNum}>{num(f.area)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={styles.tblTotal}>
                      <td>Total</td>
                      <td className={styles.tblNum}>—</td>
                      <td className={styles.tblNum}>{num(TOTALS.area)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* LINEAR FOOTAGE */}
              <div className={`${styles.card} ${styles.rv}`} key="linear">
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>Linear footage</div>
                  <div className={styles.cardSub}>
                    Edge lengths that drive trim, ridge vent and flashing.
                  </div>
                </div>
                <table className={styles.tbl}>
                  <thead>
                    <tr>
                      <th scope="col">Edge</th>
                      <th scope="col" className={styles.tblNum}>Ft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linear.map((r, i) => (
                      <tr key={r.type} className={styles.rowIn} style={{ animationDelay: `${i * 45}ms` }}>
                        <td>
                          <span className={styles.lfKey}>
                            <svg className={styles.lgSw} viewBox="0 0 22 6" aria-hidden="true">
                              <line
                                className={`${styles.edgeLine} ${EDGE_CLASS[r.type] ?? styles.eEave}`}
                                x1="1"
                                y1="3"
                                x2="21"
                                y2="3"
                              />
                            </svg>
                            {LINE_LABEL[r.type] ?? r.type}
                          </span>
                        </td>
                        <td className={styles.tblNum}>{num(r.feet)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={styles.tblTotal}>
                      <td>Total</td>
                      <td className={styles.tblNum}>{num(LINEAR_TOTAL)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* PITCH MIX */}
              <div className={`${styles.card} ${styles.rv}`} key="pitch">
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>Pitch mix</div>
                  <div className={styles.cardSub}>
                    {TOTALS.facets} facets · {num(TOTALS.area)} sq ft
                  </div>
                </div>
                <div className={styles.pmBody}>
                  {groups.map((g) => (
                    <div className={styles.pmRow} key={g.pitch}>
                      <div className={styles.pmTop}>
                        <span className={styles.pmP}>{g.pitch}/12</span>
                        <span className={styles.pmA}>
                          {num(g.area)} sq ft · {g.pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className={styles.pmTrack}>
                        <span
                          className={`${styles.pmFill} ${g.pitch >= 8 ? styles.isSteep : ""} ${g.pitch <= 2 ? styles.isLow : ""}`}
                          style={{ transform: `scaleX(${barsIn ? (g.pct / 100).toFixed(4) : 0})` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.calls}>
                  {calls.map((c) => (
                    <div
                      className={`${styles.call} ${c.tone === "warn" ? styles.callWarn : styles.callInfo}`}
                      key={c.text}
                    >
                      {c.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* TAKEOFF */}
              <div className={`${styles.card} ${styles.rv}`} key="takeoff" ref={takeoffRef}>
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>Build an estimate</div>
                  <div className={styles.cardSub}>
                    Measurements feed the takeoff — set waste, then price it out.
                  </div>
                </div>

                <div className={styles.tkoCtl}>
                  <div className={`${styles.dd} ${wasteOpen ? styles.open : ""}`} ref={wasteRef}>
                    <button
                      className={styles.ddBtn}
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={wasteOpen}
                      onClick={() => setWasteOpen((v) => !v)}
                    >
                      <Icon id="i-filter" />
                      Waste
                      <span className={styles.ddValue}>
                        {waste}% · {num(wasteSquares(waste), 1)} sq
                      </span>
                      <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
                    </button>
                    <div className={styles.ddMenu} role="listbox" aria-label="Waste factor">
                      {WASTE_OPTIONS.map((w) => (
                        <button
                          key={w}
                          className={`${styles.ddItem} ${waste === w ? styles.active : ""}`}
                          type="button"
                          role="option"
                          aria-selected={waste === w}
                          onClick={() => {
                            setWaste(w);
                            setWasteOpen(false);
                          }}
                        >
                          {w}%
                          <span className={styles.ddCount}>{num(wasteSquares(w), 1)} sq</span>
                          {waste === w ? <Icon id="i-check" /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {built ? (
                  <>
                    {[
                      { key: "mat", title: `Materials · ${waste}% waste`, rows: takeoff.materials, sum: takeoff.matSum },
                      { key: "lab", title: "Labor", rows: takeoff.labor, sum: takeoff.labSum },
                    ].map((sec) => (
                      <div className={styles.boSec} key={sec.key}>
                        <div className={styles.boHead}>
                          <span className={styles.boLbl}>{sec.title}</span>
                          <span className={styles.boSum}>{money(sec.sum)}</span>
                        </div>
                        <table className={styles.tbl}>
                          <thead>
                            <tr>
                              <th scope="col">Item</th>
                              <th scope="col" className={styles.tblNum}>Qty</th>
                              <th scope="col" className={styles.tblNum}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sec.rows.map((r, i) => (
                              <tr key={r.n} className={styles.rowIn} style={{ animationDelay: `${i * 45}ms` }}>
                                <td>
                                  <span className={styles.tkoItem}>{r.n}</span>
                                  <span className={styles.tkoSub}>
                                    {r.u} · {money(r.p)} ea
                                  </span>
                                </td>
                                <td className={styles.tblNum}>{r.q}</td>
                                <td className={styles.tblNum}>{money(r.q * r.p)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                    <div className={styles.boTotal}>
                      <span className={styles.boTotalL}>Estimate total</span>
                      <span className={styles.boTotalV}>{money(takeoff.total)}</span>
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyIn}>
                    <div className={styles.emptyT}>No takeoff yet</div>
                    <div className={styles.emptyS}>
                      Build the estimate to price materials, labor and waste straight from these
                      measurements.
                    </div>
                    <button className={styles.emptyA} type="button" onClick={() => setBuilt(true)}>
                      <Icon id="i-bulb" />
                      Build estimate
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by all three sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => {
          setSheetSample(null);
          setOrderOpen(false);
          setPlanOpen(false);
        }}
        aria-hidden="true"
      />

      {/* ============ SAMPLE ACTIONS SHEET ============ */}
      <div
        className={`${styles.sheet} ${sampleRec ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Sample actions"
        aria-hidden={!sampleRec}
        {...sampleDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...sampleDrag.handleProps} />
        <div className={styles.sheetHead} {...sampleDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sampleRec ? `Sample report · #${sampleRec.id}` : "Sample · —"}
          </div>
          <div className={styles.sheetTitle}>{sampleRec?.label ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button
              key={r.act}
              type="button"
              disabled={r.disabled}
              className={`${styles.menuItem} ${r.danger ? styles.menuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}
            >
              <span className={`${styles.miIc} ${r.tone ?? ""}`}>
                <Icon id={r.icon} />
              </span>
              <span>
                <span className={styles.menuItemT}>{r.title}</span>
                <span className={styles.menuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetSample(null)}>
          Cancel
        </button>
      </div>

      {/* ============ PLAN OPTIONS SHEET ============
          The desktop's two inline switch rails. Six 30px targets cannot hold
          320px, and there is no hover on touch — so they live here, and the
          drawing stays visible above the sheet while you tap. */}
      <div
        className={`${styles.sheet} ${planOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Plan options"
        aria-hidden={!planOpen}
        {...planDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...planDrag.handleProps} />
        <div className={styles.sheetHead} {...planDrag.handleProps}>
          <div className={styles.sheetKicker}>Drawing · report #{report.id}</div>
          <div className={styles.sheetTitle}>Plan options</div>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.segGroup}>
            <div className={styles.segLbl}>Projection</div>
            <div className={styles.segGrid}>
              {VIEWS.map((v) => (
                <button
                  key={v.k}
                  className={`${styles.segBtn} ${view === v.k ? styles.active : ""}`}
                  type="button"
                  aria-pressed={view === v.k}
                  onClick={() => setView(v.k)}
                >
                  <span className={styles.segT}>{v.t}</span>
                  <span className={styles.segS}>{v.s}</span>
                  {view === v.k ? <Icon id="i-check" /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.segGroup}>
            <div className={styles.segLbl}>Facet labels</div>
            <div className={styles.segGrid}>
              {LABELS.map((l) => (
                <button
                  key={l.k}
                  className={`${styles.segBtn} ${labelMode === l.k ? styles.active : ""}`}
                  type="button"
                  aria-pressed={labelMode === l.k}
                  onClick={() => setLabelMode(l.k)}
                >
                  <span className={styles.segT}>{l.t}</span>
                  <span className={styles.segS}>{l.s}</span>
                  {labelMode === l.k ? <Icon id="i-check" /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setPlanOpen(false)}>
          Done
        </button>
      </div>

      {/* ============ ORDER REPORT SHEET ============ */}
      <div
        className={`${styles.sheet} ${orderOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mreOrderTitle"
        aria-hidden={!orderOpen}
        {...orderDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...orderDrag.handleProps} />
        <div className={styles.sheetHead} {...orderDrag.handleProps}>
          <div className={styles.sheetKicker}>Measurement · new address</div>
          <div className={styles.sheetTitle} id="mreOrderTitle">
            Order report
          </div>
        </div>
        <form
          className={`${styles.sheetBody} ${styles.formBody}`}
          id="mreOrderForm"
          noValidate
          onSubmit={submitOrder}
        >
          <div className={`${styles.fld} ${addrErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mreAddr">
              Address<span className={styles.req}>*</span>
            </label>
            {/* Real Google Places suggestions. A PICK carries the parsed parts, so
                choosing one fills city / state / ZIP below in the same gesture —
                the whole point of an address lookup on a phone, where four
                fields is four chances to fat-finger a takeoff. Typing keeps
                writing the street line only, so a half-typed address never
                blanks parts the user already has. */}
            <AddressField
              inputRef={addrRef}
              id="mreAddr"
              placeholder="4812 Maple Ave"
              invalid={addrErr}
              value={form.addr}
              onPick={(p) => {
                setForm((f) => ({
                  ...f,
                  addr: p.address,
                  city: p.typed ? f.city : p.city || f.city,
                  state: p.typed ? f.state : p.state || f.state,
                  zip: p.typed ? f.zip : p.zip || f.zip,
                }));
                if (p.address.trim()) setAddrErr(false);
              }}
            />
            {addrErr ? (
              <span className={styles.fldErr} id="mreAddrErr">
                Enter a street address to measure
              </span>
            ) : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mreCity">
              City
            </label>
            <input
              className={styles.pinput}
              id="mreCity"
              name="city"
              type="text"
              placeholder="Bothell"
              autoComplete="off"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>

          <div className={styles.fldRow}>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mreState">
                State
              </label>
              {/* No `options`: this page's STATES fixture is bare two-letter codes,
                  so the shared canonical list is used instead and the sheet can
                  show "WA — Washington" rather than making the user supply the
                  mapping from memory. */}
              <StatePicker
                id="mreState"
                value={form.state}
                onChange={(code) => setForm((f) => ({ ...f, state: code }))}
              />
            </div>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mreZip">
                ZIP
              </label>
              <input
                className={styles.pinput}
                id="mreZip"
                name="zip"
                type="text"
                inputMode="numeric"
                placeholder="98011"
                autoComplete="off"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
              />
            </div>
          </div>

          <div className={styles.fld}>
            <button className={styles.priceBtn} type="button" onClick={checkPrice}>
              <Icon id="i-card" />
              Check report price
            </button>
            {priced ? (
              <span className={styles.price}>
                Report price <b>${REPORT_PRICE}</b> · delivered in minutes
              </span>
            ) : (
              <span className={styles.fldHint}>
                Sandbox returns a finished report in seconds — a live account bills per report.
              </span>
            )}
          </div>
        </form>
        <div className={styles.formFoot}>
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            type="button"
            onClick={() => setOrderOpen(false)}
          >
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mreOrderForm">
            <Icon id="i-check" />
            Order report
          </button>
        </div>
      </div>
    </div>
  );
}
