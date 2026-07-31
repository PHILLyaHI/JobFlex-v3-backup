"use client";

// MOBILE FENCE STUDIO (mobile-fence-estimator-v2) — Blueprint system, handheld
// build. Archetype D: the DRAWING is the content.
//
// Tokens, palette, type scale and Motion System "Balanced" are the reference
// dashboard's; the shell (topbar + hamburger drawer + shared sprite) is the one
// shared <MobileNav />, so this page is one product with its twelve siblings.
//
// Every region of the desktop studio is covered:
//  · page head (kicker + H1) with the studio's two real actions
//  · the ticket: estimated total, linear feet, $/lf — as the masthead
//  · the Draw / 3D mode switch → two view tabs over ONE drawing surface
//  · the traced run → a drawn orthogonal plan on graph paper, segment lengths
//    annotated in mono, gates as drawn swing marks, corners as drawn squares
//  · the address bar → the drawing's title block (site / material / height)
//  · stage tools: Close loop, Undo, Clear (as the plan card's foot strip)
//  · the Runs ledger → the measurement table, with a per-row actions sheet
//  · the Gates & doors ledger + both Gate/Door popovers → one openings sheet
//  · Material list, Height segmented control, Site teardown toggle → spec sheet
//  · the ticket's line items → the estimate table with a ruled total row
//  · Add run → a real form sheet with a required field and an error state
//  · both empty states (nothing drawn / no openings), reachable from Clear
//
// What changes versus the desktop studio, and why:
//  · NO LIVE MAP. The desktop's stage is an empty Google Maps slot and the
//    Find / Load-property-lines buttons only exist to feed it. The data layer is
//    out of scope and no network call is allowed here, so the fence run is drawn
//    from the ledger instead — which is also the only version of this surface
//    that says something true at 320px.
//  · The right rail is gone. Controls live in bottom sheets (archetype D, and
//    CLAUDE.md prefers sheets over modals).
//  · Zoom +/− is dropped: the plan auto-fits its own bounding box, so there is
//    nothing to zoom to. "Align" is dropped too — on the desktop it only flashes
//    a confirmation and changes no state.
//  · The <select> per opening row becomes a tap-through to the openings sheet:
//    a native picker inside a scrolling ledger row is the wrong control on
//    touch, and the sheet already lists the same six types with their prices.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-fence-estimator.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { AddressField } from "@/components/v3/mobile-shell/address-field";
import { lockScroll } from "@/lib/scrollLock";
import {
  DEFAULT_HEIGHT,
  DEFAULT_MATERIAL,
  DEMO_PER_FT,
  DRAWING_NO,
  EL_BAYS,
  EL_GATE_BAY,
  EL_GROUND,
  EL_H,
  EL_POST_W,
  EL_PX_FT,
  EL_W,
  EL_X0,
  EL_X1,
  HEIGHTS,
  MATERIALS,
  OPENINGS,
  OPENINGS_SEED,
  PLAN_H,
  PLAN_W,
  RESET_OPENINGS,
  RESET_RUNS,
  RUNS_SEED,
  SITE_SEED,
  estimateLines,
  materialOf,
  money,
  openingOf,
  planFit,
  planSegments,
  priceOf,
  scaleUnit,
  totalFt,
  type FenceOpening,
  type FenceRun,
  type Pt,
  type Seg,
} from "./fence-estimator-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/**
 * 750ms easeOutCubic, tabular-nums so the digit columns never jump. Unlike the
 * ledger pages this figure is LIVE — every material tap and every foot typed
 * moves it — so it counts from the previous reading rather than replaying from
 * zero on each edit.
 */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (prefersReducedMotion() || from === value) {
      el.textContent = money(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      const e = 1 - Math.pow(1 - pr, 3);
      el.textContent = money(from + (value - from) * e);
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {money(value)}
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

type SheetKind = "spec" | "gates" | "row" | "run" | null;
type RowRef = { kind: "run" | "open"; id: string };

/* ============================================================
   PLAN VIEW — the traced run, top down, on the graph-paper
   ground. Dimensions annotate the drawing in mono; corners are
   drawn squares (the house's chart mark) and gates are drawn
   swing symbols, never photo pins.
   ============================================================ */
function PlanView({
  segs,
  openings,
  selected,
  onSelect,
}: {
  segs: Seg[];
  openings: FenceOpening[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const fit = useMemo(() => planFit(segs), [segs]);
  const project = useCallback((p: Pt) => ({ x: fit.ox + p.x * fit.s, y: fit.oy + p.y * fit.s }), [fit]);

  const drawn = useMemo(
    () => segs.map((g) => ({ seg: g, a: project(g.a), b: project(g.b) })),
    [segs, project],
  );

  const centre = useMemo(() => {
    if (!drawn.length) return { x: PLAN_W / 2, y: PLAN_H / 2 };
    const pts = drawn.flatMap((d) => [d.a, d.b]);
    return {
      x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
      y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
    };
  }, [drawn]);

  const unit = scaleUnit(fit.s);

  /** Perpendicular to a segment, pointing away from the figure's centre — so a
   *  dimension never lands inside the enclosure it measures. */
  const outward = (a: Pt, b: Pt) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if ((mx - centre.x) * nx + (my - centre.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { mx, my, nx, ny };
  };

  return (
    <svg
      viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
      role="img"
      aria-label={`Site plan: ${segs.length} fence runs totalling ${Math.round(
        segs.reduce((a, g) => a + g.ft, 0),
      )} feet.`}
    >
      {/* the run itself */}
      {drawn.map((d) => {
        const on = selected === d.seg.id;
        return (
          <line
            key={`ln-${d.seg.id}`}
            className={on ? `${styles.pRun} ${styles.pRunOn}` : styles.pRun}
            x1={d.a.x}
            y1={d.a.y}
            x2={d.b.x}
            y2={d.b.y}
          />
        );
      })}

      {/* gates: a gap cut into the line, two jambs and a swing arc */}
      {openings.map((o) => {
        const d = drawn[(o.run ?? 0) - 1];
        if (!o.run || !d) return null;
        const t = openingOf(o.type);
        const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
        const gap = Math.max(11, Math.min(t.width * fit.s, len * 0.55));
        const ux = (d.b.x - d.a.x) / (len || 1);
        const uy = (d.b.y - d.a.y) / (len || 1);
        const mx = (d.a.x + d.b.x) / 2;
        const my = (d.a.y + d.b.y) / 2;
        const g1 = { x: mx - (ux * gap) / 2, y: my - (uy * gap) / 2 };
        const g2 = { x: mx + (ux * gap) / 2, y: my + (uy * gap) / 2 };
        const { nx, ny } = outward(d.a, d.b);
        const leaf = { x: g1.x + nx * gap, y: g1.y + ny * gap };
        return (
          <g key={`gt-${o.id}`}>
            <line className={styles.pGap} x1={g1.x} y1={g1.y} x2={g2.x} y2={g2.y} />
            <line
              className={styles.pJamb}
              x1={g1.x - nx * 5}
              y1={g1.y - ny * 5}
              x2={g1.x + nx * 5}
              y2={g1.y + ny * 5}
            />
            <line
              className={styles.pJamb}
              x1={g2.x - nx * 5}
              y1={g2.y - ny * 5}
              x2={g2.x + nx * 5}
              y2={g2.y + ny * 5}
            />
            <line className={styles.pLeaf} x1={g1.x} y1={g1.y} x2={leaf.x} y2={leaf.y} />
            <path
              className={styles.pArc}
              d={`M ${leaf.x} ${leaf.y} A ${gap} ${gap} 0 0 1 ${g2.x} ${g2.y}`}
            />
          </g>
        );
      })}

      {/* corner marks — squares, never circles */}
      {drawn.map((d, i) => (
        <rect
          key={`vx-${d.seg.id}`}
          className={i === 0 ? `${styles.pVtx} ${styles.pVtxStart}` : styles.pVtx}
          x={d.a.x - 3.5}
          y={d.a.y - 3.5}
          width="7"
          height="7"
        />
      ))}
      {drawn.length ? (
        <rect
          className={styles.pVtx}
          x={drawn[drawn.length - 1].b.x - 3.5}
          y={drawn[drawn.length - 1].b.y - 3.5}
          width="7"
          height="7"
        />
      ) : null}

      {/* dimensions */}
      {drawn.map((d) => {
        const { mx, my, nx, ny } = outward(d.a, d.b);
        const on = selected === d.seg.id;
        return (
          <text
            key={`dm-${d.seg.id}`}
            className={on ? `${styles.pDim} ${styles.pDimOn}` : styles.pDim}
            x={mx + nx * 13}
            y={my + ny * 13}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {d.seg.ft}&#8242;
          </text>
        );
      })}

      {/* touch targets — fat, invisible, one per run */}
      {drawn.map((d) => (
        <line
          key={`hit-${d.seg.id}`}
          className={styles.pHit}
          x1={d.a.x}
          y1={d.a.y}
          x2={d.b.x}
          y2={d.b.y}
          onClick={() => onSelect(d.seg.id)}
        />
      ))}

      {/* north arrow */}
      <g>
        <line className={styles.pNorth} x1={PLAN_W - 20} y1="34" x2={PLAN_W - 20} y2="12" />
        <path className={styles.pNorth} d={`M ${PLAN_W - 24} 18 L ${PLAN_W - 20} 11 L ${PLAN_W - 16} 18`} />
        <text className={styles.pAnno} x={PLAN_W - 20} y="45" textAnchor="middle">
          N
        </text>
      </g>

      {/* scale bar */}
      <g>
        <line className={styles.pScale} x1="14" y1={PLAN_H - 16} x2={14 + unit * fit.s} y2={PLAN_H - 16} />
        <line className={styles.pScale} x1="14" y1={PLAN_H - 21} x2="14" y2={PLAN_H - 11} />
        <line
          className={styles.pScale}
          x1={14 + unit * fit.s}
          y1={PLAN_H - 21}
          x2={14 + unit * fit.s}
          y2={PLAN_H - 11}
        />
        <text className={styles.pAnno} x="14" y={PLAN_H - 26} textAnchor="start">
          0
        </text>
        <text className={styles.pAnno} x={14 + unit * fit.s} y={PLAN_H - 26} textAnchor="middle">
          {unit}&#8242;
        </text>
      </g>
    </svg>
  );
}

/* ============================================================
   ELEVATION VIEW — one typical bay run at true relative height.
   The infill is drawn from the picked material, so the spec
   sheet visibly redraws the fence; the teardown toggle puts the
   existing fence back as a dashed ghost behind it.
   ============================================================ */
function ElevationView({
  materialId,
  heightFt,
  openings,
  demoOn,
}: {
  materialId: string;
  heightFt: number;
  openings: FenceOpening[];
  demoOn: boolean;
}) {
  const fenceH = heightFt * EL_PX_FT;
  const topY = EL_GROUND - fenceH;
  const bayW = (EL_X1 - EL_X0) / EL_BAYS;
  const half = EL_POST_W / 2;
  const gateBay = openings.length ? EL_GATE_BAY : -1;
  const gateType = openings.length ? openingOf(openings[0].type) : null;

  const fillFor = () => {
    if (materialId === "chain-link") return "url(#feMeshPat)";
    if (materialId === "vinyl") return "var(--paper-deep)";
    if (materialId === "aluminum") return "url(#feBarPat)";
    return "url(#fePicketPat)";
  };
  const railed = materialId !== "chain-link";

  const bays = Array.from({ length: EL_BAYS }, (_, i) => i);
  const posts = Array.from({ length: EL_BAYS + 1 }, (_, i) => i);
  const hatch = Array.from({ length: 27 }, (_, i) => 18 + i * 12);

  return (
    <svg
      viewBox={`0 0 ${EL_W} ${EL_H}`}
      role="img"
      aria-label={`Elevation: a typical bay of ${materialOf(materialId).label.toLowerCase()} fence at ${heightFt} feet, posts at eight foot centres${
        gateType ? `, with a ${gateType.label.toLowerCase()}` : ""
      }.`}
    >
      <defs>
        <pattern id="fePicketPat" width="9" height="4" patternUnits="userSpaceOnUse">
          <path className={styles.eFill} d="M1.5 0v4M6.5 0v4" />
        </pattern>
        <pattern id="feBarPat" width="13" height="4" patternUnits="userSpaceOnUse">
          <path className={styles.eFill} d="M2 0v4" />
        </pattern>
        <pattern id="feMeshPat" width="11" height="11" patternUnits="userSpaceOnUse">
          <path className={styles.eMesh} d="M0 0l11 11M11 0L0 11" />
        </pattern>
      </defs>

      {/* the fence being torn out, when the site toggle is on */}
      {demoOn ? (
        <g>
          <rect
            className={styles.eGhost}
            x={EL_X0 - 18}
            y={EL_GROUND - Math.max(fenceH - EL_PX_FT, 28)}
            width={EL_X1 - EL_X0 + 24}
            height={Math.max(fenceH - EL_PX_FT, 28)}
          />
          <text className={styles.eAnno} x={EL_X0 - 16} y={EL_GROUND - Math.max(fenceH - EL_PX_FT, 28) - 6}>
            EXISTING — REMOVE
          </text>
        </g>
      ) : null}

      {/* panels */}
      {bays.map((i) => {
        const x = EL_X0 + i * bayW + half;
        const w = bayW - EL_POST_W;
        if (i === gateBay) return null;
        return (
          <g key={`bay-${i}`}>
            <rect className={styles.ePanel} x={x} y={topY + 6} width={w} height={EL_GROUND - topY - 10} fill={fillFor()} />
            {railed ? (
              <>
                <line className={styles.eRail} x1={x} y1={topY + 12} x2={x + w} y2={topY + 12} />
                <line className={styles.eRail} x1={x} y1={EL_GROUND - 16} x2={x + w} y2={EL_GROUND - 16} />
              </>
            ) : (
              <line className={styles.eRail} x1={x} y1={topY + 6} x2={x + w} y2={topY + 6} />
            )}
          </g>
        );
      })}

      {/* the gate leaf, drawn with its swing */}
      {gateBay >= 0 ? (
        (() => {
          const x = EL_X0 + gateBay * bayW + half;
          const w = bayW - EL_POST_W;
          return (
            <g>
              <rect className={styles.eGate} x={x + 2} y={topY + 8} width={w - 4} height={EL_GROUND - topY - 14} />
              <line
                className={styles.eBrace}
                x1={x + 2}
                y1={EL_GROUND - 6}
                x2={x + w - 2}
                y2={topY + 8}
              />
              {/* A quarter arc centred on the HINGE jamb: from the free edge at
                  the ground round to vertical, which is the only reading of a
                  swing that is unambiguous in elevation. */}
              <path
                className={styles.eSwing}
                d={`M ${x + w - 2} ${EL_GROUND - 2} A ${w - 4} ${w - 4} 0 0 0 ${x + 2} ${
                  EL_GROUND - 2 - (w - 4)
                }`}
              />
              <text className={styles.eAnno} x={x + w / 2} y={topY - 6} textAnchor="middle">
                {gateType ? gateType.width : 4}&#8242; GATE
              </text>
            </g>
          );
        })()
      ) : null}

      {/* posts */}
      {posts.map((i) => (
        <rect
          key={`post-${i}`}
          className={styles.ePost}
          x={EL_X0 + i * bayW - half}
          y={topY}
          width={EL_POST_W}
          height={EL_GROUND - topY}
        />
      ))}

      {/* ground line + drafting hatch */}
      <line className={styles.eGround} x1="10" y1={EL_GROUND} x2={EL_W - 8} y2={EL_GROUND} />
      {hatch.map((x) => (
        <line key={`h-${x}`} className={styles.eHatch} x1={x} y1={EL_GROUND} x2={x - 7} y2={EL_GROUND + 7} />
      ))}

      {/* height dimension */}
      <line className={styles.eDim} x1="24" y1={topY} x2="24" y2={EL_GROUND} />
      <line className={styles.eDim} x1="19" y1={topY} x2="29" y2={topY} />
      <line className={styles.eDim} x1="19" y1={EL_GROUND} x2="29" y2={EL_GROUND} />
      <text
        className={styles.eDimTxt}
        x="16"
        y={(topY + EL_GROUND) / 2}
        textAnchor="middle"
        transform={`rotate(-90 16 ${(topY + EL_GROUND) / 2})`}
      >
        {heightFt}&#8242;-0&#8243;
      </text>

      {/* bay dimension */}
      <text className={styles.eAnno} x={EL_X0 + bayW / 2} y={EL_GROUND + 20} textAnchor="middle">
        8&#8242; CENTRES
      </text>
    </svg>
  );
}

/* ============================================================ */

export function MobileFenceEstimator() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const ftRef = useRef<HTMLInputElement>(null);
  const siteRef = useRef<HTMLInputElement>(null);
  /* Set only when the spec sheet is opened from the title block's Site row, so
     the address field is focused for that entry point and NOT when the sheet is
     opened to change material or height. */
  const focusSite = useRef(false);
  const seq = useRef({ run: 9, op: 2 });

  /* Cloned per mount, so a run added on one visit does not survive into the
     next — the desktop studio rebuilds its working fixture the same way. */
  const [runs, setRuns] = useState<FenceRun[]>(() => RUNS_SEED.map((r) => ({ ...r })));
  const [openings, setOpenings] = useState<FenceOpening[]>(() => OPENINGS_SEED.map((o) => ({ ...o })));
  const [material, setMaterial] = useState(DEFAULT_MATERIAL);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [demo, setDemo] = useState(false);
  const [site, setSite] = useState(SITE_SEED);

  const [view, setView] = useState<"plan" | "elev">("plan");
  const [sel, setSel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [row, setRow] = useState<RowRef | null>(null);
  const [runDraft, setRunDraft] = useState<{ id: string | null; ft: string }>({ id: null, ft: "20" });
  const [ftErr, setFtErr] = useState(false);
  const [landed, setLanded] = useState<string | null>(null);
  const [converted, setConverted] = useState(false);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather
     than trusting a bare 100vh/100dvh. The drawing stage is sized off it, which
     is what keeps the plan on one screen without an inner scroller. */
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

  /* ---------- Motion: reveal on load + adaptive reveal on scroll -------- */
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
      el.classList.add(styles.rv);
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          // Below the fold: duration follows scroll speed — slow ≈ 900ms, fast
          // never shorter than 550ms.
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
  }, []);

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
    const sel2 = [
      styles.btn, styles.tab, styles.ctrlBtn, styles.footBtn, styles.tRowSel,
      styles.tRowMenu, styles.menuItem, styles.sheetCancel, styles.matItem,
      styles.segBtn, styles.gcatItem, styles.opDel, styles.emptyA, styles.stepBtn,
      styles.tgl,
    ]
      .map((c) => `.${c}`)
      .join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel2);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what THIS page owns --------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) setSheet(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  /* ---------- focus the site field when entered from the title block ----
     Waits out the sheet's own 300ms travel: focusing mid-flight fights the
     transform on iOS and lands the caret in the wrong place. */
  useEffect(() => {
    if (sheet !== "spec" || !focusSite.current) return;
    focusSite.current = false;
    const t = window.setTimeout(
      () => siteRef.current?.focus(),
      prefersReducedMotion() ? 0 : 320,
    );
    return () => window.clearTimeout(t);
  }, [sheet]);

  /* ---------- one blue flash on the run you just changed --------------- */
  useEffect(() => {
    if (!landed) return;
    const t = window.setTimeout(() => setLanded(null), 700);
    return () => clearTimeout(t);
  }, [landed]);

  /* ---------- the donor's confirm-in-place on Convert (1800ms) ---------- */
  useEffect(() => {
    if (!converted) return;
    const t = window.setTimeout(() => setConverted(false), 1800);
    return () => clearTimeout(t);
  }, [converted]);

  /* ---------- derived --------------------------------------------------- */
  const segs = useMemo(() => planSegments(runs), [runs]);
  const price = useMemo(
    () => priceOf(runs, openings, material, height, demo),
    [runs, openings, material, height, demo],
  );
  const lines = useMemo(
    () => estimateLines(runs, openings, material, height, demo),
    [runs, openings, material, height, demo],
  );
  const mat = materialOf(material);
  const ft = totalFt(runs);

  const rowRun = row?.kind === "run" ? runs.find((r) => r.id === row.id) ?? null : null;
  const rowRunIndex = rowRun ? runs.findIndex((r) => r.id === rowRun.id) : -1;
  const rowOpen = row?.kind === "open" ? openings.find((o) => o.id === row.id) ?? null : null;

  /* ---------- mutations ------------------------------------------------- */
  /** A run leaving takes its openings with it, and the ordinals below it shift.
   *  Without this an opening would keep pointing at a segment the plan no longer
   *  draws. */
  const dropRunAt = (index: number) => {
    setRuns((prev) => prev.filter((_, i) => i !== index));
    setOpenings((prev) =>
      prev.map((o) => {
        if (o.run === null) return o;
        if (o.run === index + 1) return { ...o, run: null };
        return o.run > index + 1 ? { ...o, run: o.run - 1 } : o;
      }),
    );
  };

  const closeLoop = () => {
    if (!runs.length) return;
    seq.current.run += 1;
    const rec = { id: `r${seq.current.run}`, ft: Math.round(ft * 0.12) || 12 };
    setRuns((prev) => [...prev, rec]);
    setLanded(rec.id);
  };

  const undo = () => {
    if (runs.length <= 1) return;
    dropRunAt(runs.length - 1);
    setSel(null);
  };

  const clearAll = () => {
    setRuns([]);
    setOpenings([]);
    setSel(null);
  };

  const resetAll = () => {
    setRuns(RESET_RUNS.map((r) => ({ ...r })));
    setOpenings(RESET_OPENINGS.map((o) => ({ ...o })));
    setMaterial(DEFAULT_MATERIAL);
    setHeight(DEFAULT_HEIGHT);
    setDemo(false);
    setSite(SITE_SEED);
    setSel(null);
    seq.current = { run: 9, op: 2 };
  };

  const addOpening = (typeId: string, runOrdinal: number | null) => {
    seq.current.op += 1;
    setOpenings((prev) => [...prev, { id: `o${seq.current.op}`, type: typeId, run: runOrdinal }]);
  };

  const openRunForm = (id: string | null) => {
    const rec = id ? runs.find((r) => r.id === id) : null;
    setRunDraft({ id, ft: rec ? String(rec.ft) : "20" });
    setFtErr(false);
    setSheet("run");
    window.setTimeout(() => ftRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitRun = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(runDraft.ft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setFtErr(true);
      ftRef.current?.focus();
      return;
    }
    if (runDraft.id) {
      setRuns((prev) => prev.map((r) => (r.id === runDraft.id ? { ...r, ft: n } : r)));
      setLanded(runDraft.id);
    } else {
      seq.current.run += 1;
      const rec = { id: `r${seq.current.run}`, ft: n };
      setRuns((prev) => [...prev, rec]);
      setLanded(rec.id);
    }
    setSheet(null);
  };

  const bumpFt = (delta: number) => {
    setFtErr(false);
    setRunDraft((d) => {
      const n = parseInt(d.ft, 10);
      return { ...d, ft: String(Math.max(1, (Number.isFinite(n) ? n : 0) + delta)) };
    });
  };

  const highlight = (id: string) => {
    setSel(id);
    setSheet(null);
    if (!prefersReducedMotion()) {
      planRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  /* ---------- row actions sheet ---------------------------------------- */
  const menuRows = useMemo<MenuRow[]>(() => {
    if (rowRun) {
      const carries = openings.find((o) => o.run === rowRunIndex + 1);
      return [
        { act: "hl", icon: "i-target", tone: styles.miBp, title: "Highlight on plan",
          sub: `Run ${rowRunIndex + 1} — ${rowRun.ft} ft` },
        { act: "edit", icon: "i-fence-estimator-ruler", tone: styles.miSky, title: "Edit length",
          sub: "Type the measured footage" },
        { act: "dupe", icon: "i-copy", tone: styles.miOk, title: "Duplicate run",
          sub: `Adds another ${rowRun.ft} ft leg` },
        { act: "gate", icon: "i-fence-estimator-door-open", tone: styles.miWarn,
          title: "Add a gate here",
          sub: carries
            ? `Run ${rowRunIndex + 1} already carries ${openingOf(carries.type).label.toLowerCase()}`
            : "Single gate · 4 ft · $350",
          disabled: Boolean(carries) },
        { act: "del", icon: "i-trash", tone: styles.miDanger, title: "Delete run",
          sub: "Removes the leg and its openings", danger: true },
      ];
    }
    if (rowOpen) {
      const t = openingOf(rowOpen.type);
      return [
        { act: "hl", icon: "i-target", tone: styles.miBp, title: "Highlight on plan",
          sub: rowOpen.run ? `Drawn on run ${rowOpen.run}` : "Not placed on a run yet",
          disabled: !rowOpen.run },
        { act: "type", icon: "i-fence-estimator-door-open", tone: styles.miSky, title: "Change type",
          sub: `${t.label} · ${t.width} ft · ${money(t.price)}` },
        { act: "move", icon: "i-pin", tone: styles.miOk, title: "Move to run 1",
          sub: runs.length ? `${runs[0].ft} ft leg` : "No run drawn yet",
          disabled: !runs.length },
        { act: "free", icon: "i-x", tone: styles.miWarn, title: "Detach from run",
          sub: rowOpen.run ? "Keeps it priced, unplaced" : "Already free", disabled: !rowOpen.run },
        { act: "del", icon: "i-trash", tone: styles.miDanger, title: "Delete opening",
          sub: "Removes it from the estimate", danger: true },
      ];
    }
    return [];
  }, [rowRun, rowRunIndex, rowOpen, openings, runs]);

  const runMenu = (act: string) => {
    if (rowRun) {
      if (act === "hl") { highlight(rowRun.id); return; }
      if (act === "edit") { openRunForm(rowRun.id); return; }
      if (act === "dupe") {
        seq.current.run += 1;
        const rec = { id: `r${seq.current.run}`, ft: rowRun.ft };
        setRuns((prev) => [...prev, rec]);
        setLanded(rec.id);
      }
      if (act === "gate") addOpening("single", rowRunIndex + 1);
      if (act === "del") dropRunAt(rowRunIndex);
      setSheet(null);
      return;
    }
    if (rowOpen) {
      if (act === "hl" && rowOpen.run) { highlight(runs[rowOpen.run - 1]?.id ?? ""); return; }
      if (act === "type") { setSheet("gates"); return; }
      if (act === "move") setOpenings((p) => p.map((o) => (o.id === rowOpen.id ? { ...o, run: 1 } : o)));
      if (act === "free") setOpenings((p) => p.map((o) => (o.id === rowOpen.id ? { ...o, run: null } : o)));
      if (act === "del") setOpenings((p) => p.filter((o) => o.id !== rowOpen.id));
      setSheet(null);
    }
  };

  const openRowSheet = (ref: RowRef) => {
    setRow(ref);
    setSheet("row");
  };

  const gateGroups = useMemo(
    () => [
      { kind: "gate", label: "Gates", items: OPENINGS.filter((o) => o.kind === "gate") },
      { kind: "door", label: "Doors", items: OPENINGS.filter((o) => o.kind === "door") },
    ],
    [],
  );

  const sheetOpen = sheet !== null;

  // Swipe-down dismissal. One `sheet` state drives four roots, so each gets its
  // own gesture pointed at the single close path Escape and the scrim use.
  const specDrag = useSheetDrag(sheet === "spec", () => setSheet(null));
  const gatesDrag = useSheetDrag(sheet === "gates", () => setSheet(null));
  const rowDrag = useSheetDrag(sheet === "row", () => setSheet(null));
  const runDrag = useSheetDrag(sheet === "run", () => setSheet(null));

  return (
    <div className={styles.app} onClick={onRootClick}>
      {/* Shared handheld nav: topbar + drawer + the 48-symbol sprite. It owns
          its own open state, its own Escape handling and its own indicator. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Automation · Estimating</div>
            <h1 className={styles.pageTitle}>Fence studio</h1>
            <div className={styles.pageActions}>
              {/* Confirms in place, the donor's own wording and 1800ms — the
                  data layer is out of scope, so nothing is actually posted. */}
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                type="button"
                disabled={price.total === 0}
                onClick={() => setConverted(true)}
              >
                <Icon id={converted ? "i-check" : "i-file"} />
                {converted ? "Proposal created" : "Convert to proposal"}
              </button>
              <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={resetAll}>
                <Icon id="i-rotate" />
                Reset studio
              </button>
            </div>
          </div>

          {/* MASTHEAD — one live numeral, a mono kicker, exactly two annotations */}
          <div className={styles.mast}>
            <div className={styles.mastTop}>
              <div className={styles.mastLbl}>
                Estimated total
                <span className={styles.mastRule} />
              </div>
              {price.total > 0 ? (
                <CountUp value={price.total} className={styles.mastVal} />
              ) : (
                // Zero is a number; "nothing estimated" is an absence.
                <div className={`${styles.mastVal} ${styles.zero}`}>—</div>
              )}
            </div>
            <div className={styles.mastCnt}>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Linear feet</div>
                <div className={styles.mastSubV}>{Math.round(price.ft)}</div>
              </div>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Per foot</div>
                <div className={styles.mastSubV}>{price.perAll ? money(price.perAll) : "—"}</div>
              </div>
            </div>
          </div>

          {/* VIEW TABS — the desktop Draw / 3D switch. Two genuine view modes,
              one control per dimension, exact halves so the rule lines up. */}
          <div className={styles.tabs} role="tablist" aria-label="Drawing view">
            <span
              className={styles.tabInd}
              style={{ transform: `translateX(${view === "plan" ? 0 : 100}%)` }}
              aria-hidden="true"
            />
            <button
              className={`${styles.tab} ${view === "plan" ? styles.active : ""}`}
              type="button"
              role="tab"
              aria-selected={view === "plan"}
              aria-label={`Plan view, ${runs.length} runs`}
              onClick={() => setView("plan")}
            >
              <Icon id="i-grid" />
              Plan
              <span className={styles.tabCount}>{runs.length}</span>
            </button>
            <button
              className={`${styles.tab} ${view === "elev" ? styles.active : ""}`}
              type="button"
              role="tab"
              aria-selected={view === "elev"}
              aria-label={`Elevation view, ${openings.length} openings`}
              onClick={() => setView("elev")}
            >
              <Icon id="i-fence" />
              Elevation
              <span className={styles.tabCount}>{openings.length}</span>
            </button>
          </div>

          {/* THE DRAWING */}
          <div className={styles.plan} ref={planRef}>
            <div className={styles.planHead}>
              <div className={styles.planTitle}>{view === "plan" ? "Site plan" : "Typical bay"}</div>
              <div className={styles.planNote}>
                DRAWING № {DRAWING_NO} · {view === "plan" ? "1 : SCALE BAR" : "8′ CENTRES"}
              </div>
            </div>

            <div className={styles.stage} role="tabpanel" aria-label={view === "plan" ? "Site plan" : "Elevation"}>
              {runs.length === 0 ? (
                <div className={styles.stageEmpty}>
                  <Icon id="i-fence" className={styles.stageEmptyIc} />
                  <div className={styles.stageEmptyT}>Nothing drawn</div>
                  <div className={styles.stageEmptyS}>
                    Add the first measured leg and the plan draws itself.
                  </div>
                </div>
              ) : view === "plan" ? (
                <PlanView
                  segs={segs}
                  openings={openings}
                  selected={sel}
                  onSelect={(id) => setSel((prev) => (prev === id ? null : id))}
                />
              ) : (
                <ElevationView materialId={material} heightFt={height} openings={openings} demoOn={demo} />
              )}
            </div>

            {/* TITLE BLOCK — the desktop address bar lands here, where a drawing
                keeps its site data. */}
            <div className={styles.tblock}>
              {/* Tappable, because the address was previously only reachable by
                  guessing it lived in the spec sheet — on the drawing surface it
                  read as display-only, so the studio looked like it had no
                  address field at all. Opening the sheet here focuses the field
                  and its Places search. */}
              <button
                type="button"
                className={styles.tbSite}
                onClick={() => {
                  focusSite.current = true;
                  setSheet("spec");
                }}
                aria-label={`Site address: ${site || "not set"}. Edit`}
              >
                <span className={styles.tbLbl}>Site</span>
                <span className={styles.tbVal}>{site || "Tap to set the site address"}</span>
              </button>
              <div className={styles.tbCells}>
                <div className={styles.tbCell}>
                  <span className={styles.tbLbl}>Material</span>
                  <span className={styles.tbVal}>{mat.label}</span>
                </div>
                <div className={styles.tbCell}>
                  <span className={styles.tbLbl}>Height</span>
                  <span className={styles.tbVal}>{height} ft</span>
                </div>
                <div className={styles.tbCell}>
                  <span className={styles.tbLbl}>Teardown</span>
                  <span className={styles.tbVal}>{demo ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>

            {/* the desktop stage tools, as the card's beige foot */}
            <div className={styles.planFoot}>
              <button className={styles.footBtn} type="button" onClick={closeLoop} disabled={!runs.length}>
                <Icon id="i-fence-estimator-waypoints" />
                Close loop
              </button>
              <button className={styles.footBtn} type="button" onClick={undo} disabled={runs.length <= 1}>
                <Icon id="i-fence-estimator-undo" />
                Undo
              </button>
              <button className={styles.footBtn} type="button" onClick={clearAll} disabled={!runs.length}>
                <Icon id="i-trash" />
                Clear
              </button>
            </div>
          </div>

          {/* CONTROL ROW — every control lives behind one of these three */}
          <div className={styles.ctrls}>
            <button className={styles.ctrlBtn} type="button" onClick={() => setSheet("spec")}>
              <Icon id="i-gear" />
              Spec
              <span className={styles.ctrlCount}>{mat.label}</span>
            </button>
            <button className={styles.ctrlBtn} type="button" onClick={() => openRunForm(null)}>
              <Icon id="i-plus" />
              Add run
            </button>
            <button className={styles.ctrlBtn} type="button" onClick={() => setSheet("gates")}>
              <Icon id="i-fence-estimator-door-open" />
              Gates
              <span className={styles.ctrlCount}>{openings.length}</span>
            </button>
          </div>

          {/* MEASUREMENTS — the runs ledger and the openings ledger, as one
              estimate-style table under the drawing. */}
          <div className={styles.tbl}>
            <div className={styles.tblHead}>
              <div className={styles.tblTitle}>Measurements</div>
              <div className={styles.tblNote}>
                <Icon id="i-fence-estimator-ruler" className={styles.tblNoteIc} />
                FIELD
              </div>
            </div>

            <div className={styles.tblSec}>Runs</div>
            {runs.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyT}>Nothing drawn yet</div>
                <div className={styles.emptyS}>
                  Measure the first leg of the fence line and add it — the plan, the footage and the
                  price all follow from it.
                </div>
                <button className={styles.emptyA} type="button" onClick={() => openRunForm(null)}>
                  <Icon id="i-plus" />
                  Add run
                </button>
              </div>
            ) : (
              runs.map((r, i) => {
                const carries = openings.find((o) => o.run === i + 1);
                return (
                  <div
                    key={r.id}
                    className={`${styles.tRow} ${styles.rowIn} ${landed === r.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <button
                      className={`${styles.tRowSel} ${sel === r.id ? styles.on : ""}`}
                      type="button"
                      aria-pressed={sel === r.id}
                      onClick={() => setSel((prev) => (prev === r.id ? null : r.id))}
                    >
                      <span className={styles.tRowN}>Run {i + 1}</span>
                      <span className={styles.tRowSub}>
                        {carries ? openingOf(carries.type).label : "Continuous"}
                      </span>
                      <span className={styles.tRowV}>{r.ft} ft</span>
                    </button>
                    <button
                      className={styles.tRowMenu}
                      type="button"
                      aria-label={`Actions for run ${i + 1}`}
                      onClick={() => openRowSheet({ kind: "run", id: r.id })}
                    >
                      <Icon id="i-dots" />
                    </button>
                  </div>
                );
              })
            )}

            {/* The openings ledger always renders: deleting every run leaves the
                openings priced but unplaced, and hiding them here would lose the
                only place they can be put back on a leg. */}
            <div className={styles.tblSec}>Gates &amp; doors</div>
            {openings.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyT}>No openings yet</div>
                <div className={styles.emptyS}>
                  Add a gate or a door — the plan draws its swing and the estimate picks up the
                  price.
                </div>
                <button className={styles.emptyA} type="button" onClick={() => setSheet("gates")}>
                  <Icon id="i-plus" />
                  Add a gate
                </button>
              </div>
            ) : (
              openings.map((o, i) => {
                const t = openingOf(o.type);
                return (
                  <div
                    key={o.id}
                    className={`${styles.tRow} ${styles.rowIn}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <button
                      className={styles.tRowSel}
                      type="button"
                      onClick={() => openRowSheet({ kind: "open", id: o.id })}
                    >
                      <span className={styles.tRowIc}>
                        <Icon
                          id={
                            t.kind === "gate"
                              ? "i-fence-estimator-door-open"
                              : "i-fence-estimator-door-closed"
                          }
                        />
                      </span>
                      <span className={styles.tRowN}>{t.label}</span>
                      <span className={styles.tRowSub}>
                        {o.run ? `Run ${o.run}` : "Free"} · {money(t.price)}
                      </span>
                      <span className={styles.tRowV}>{t.width} ft</span>
                    </button>
                    <button
                      className={styles.tRowMenu}
                      type="button"
                      aria-label={`Actions for ${t.label}`}
                      onClick={() => openRowSheet({ kind: "open", id: o.id })}
                    >
                      <Icon id="i-dots" />
                    </button>
                  </div>
                );
              })
            )}

            <div className={styles.tTotal}>
              <span className={styles.tTotalL}>Total run</span>
              <span className={styles.tTotalV}>{Math.round(ft)} ft</span>
            </div>
          </div>

          {/* ESTIMATE — the desktop ticket's line items, ruled. */}
          <div className={styles.tbl}>
            <div className={styles.tblHead}>
              <div className={styles.tblTitle}>Estimate</div>
              <div className={styles.tblNote}>{money(price.perFt)} / LF</div>
            </div>
            {lines.map((l, i) => (
              <div
                key={l.key}
                className={`${styles.eRow} ${styles.rowIn}`}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className={styles.eRowN}>{l.label}</span>
                <span className={styles.eRowV}>{money(l.value)}</span>
              </div>
            ))}
            <div className={`${styles.tTotal} ${styles.tTotalMoney}`}>
              <span className={styles.tTotalL}>Total</span>
              <span className={`${styles.tTotalV} ${price.total ? "" : styles.zero}`}>
                {price.total ? money(price.total) : "—"}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by every sheet) ============ */}
      <div
        className={`${styles.scrim} ${sheetOpen ? styles.on : ""}`}
        onClick={() => setSheet(null)}
        aria-hidden="true"
      />

      {/* ============ SPEC SHEET — material / height / site ============ */}
      <div
        className={`${styles.sheet} ${sheet === "spec" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Fence spec"
        aria-hidden={sheet !== "spec"}
        {...specDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...specDrag.handleProps} />
        <div className={styles.sheetHead} {...specDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {mat.label} · {height} ft · {money(price.perFt)}/lf
          </div>
          <div className={styles.sheetTitle}>Fence spec</div>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.sheetSec}>Material</div>
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              className={`${styles.matItem} ${material === m.id ? styles.on : ""}`}
              type="button"
              aria-pressed={material === m.id}
              onClick={() => setMaterial(m.id)}
            >
              <span className={styles.matSw} style={{ background: m.color }} />
              <span className={styles.matName}>{m.label}</span>
              <span className={styles.matRate}>{money(m.base)}/lf</span>
            </button>
          ))}

          <div className={styles.sheetSec}>Height</div>
          <div className={styles.seg}>
            {HEIGHTS.map((h) => (
              <button
                key={h.ft}
                className={`${styles.segBtn} ${height === h.ft ? styles.on : ""}`}
                type="button"
                aria-pressed={height === h.ft}
                onClick={() => setHeight(h.ft)}
              >
                {h.ft} ft
              </button>
            ))}
          </div>

          <div className={styles.sheetSec}>Site</div>
          <div className={styles.siteRow}>
            <span className={styles.siteTxt}>
              <span className={styles.siteT}>Remove existing fence</span>
              <span className={styles.siteH}>
                Teardown and haul, {money(DEMO_PER_FT)} per linear foot.
              </span>
            </span>
            <button
              className={`${styles.tgl} ${demo ? styles.on : ""}`}
              type="button"
              role="switch"
              aria-checked={demo}
              aria-label="Remove existing fence"
              onClick={() => setDemo((v) => !v)}
            />
          </div>
          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="feSite">
              Site address
            </label>
            {/* Real Google Places search. The site address is the one field on
                this studio a user actually looks up rather than knows, and the
                desktop's own address bar is Places-backed (#addrInput), so a
                plain text box here was the odd one out. A pick writes the full
                formatted string, since the title block prints one line. */}
            <AddressField
              inputRef={siteRef}
              id="feSite"
              placeholder="14208 NE 182nd St, Woodinville, WA"
              value={site}
              onPick={(p) => setSite(p.typed ? p.address : p.formatted || p.address)}
            />
            <span className={styles.fldHint}>Prints in the drawing&apos;s title block.</span>
          </div>
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheet(null)}>
          Done
        </button>
      </div>

      {/* ============ GATES & DOORS SHEET ============ */}
      <div
        className={`${styles.sheet} ${sheet === "gates" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Gates and doors"
        aria-hidden={sheet !== "gates"}
        {...gatesDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...gatesDrag.handleProps} />
        <div className={styles.sheetHead} {...gatesDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {openings.length} on the plan · {money(price.ops)}
          </div>
          <div className={styles.sheetTitle}>Gates &amp; doors</div>
        </div>
        <div className={styles.sheetBody}>
          {/* Fragments, not wrapper divs: every section head has to be a DIRECT
              child of the sheet body, or the first-child rule that drops its top
              rule under the sheet head cannot reach it and the line doubles. */}
          {gateGroups.map((g) => (
            <Fragment key={g.kind}>
              <div className={styles.sheetSec}>{g.label}</div>
              {g.items.map((o) => (
                <button
                  key={o.id}
                  className={styles.gcatItem}
                  type="button"
                  onClick={() => addOpening(o.id, runs.length ? 1 : null)}
                >
                  <span className={`${styles.miIc} ${o.kind === "gate" ? styles.miBp : styles.miSky}`}>
                    <Icon
                      id={
                        o.kind === "gate"
                          ? "i-fence-estimator-door-open"
                          : "i-fence-estimator-door-closed"
                      }
                    />
                  </span>
                  <span className={styles.gcatTxt}>
                    <span className={styles.gcatN}>{o.label}</span>
                    <span className={styles.gcatW}>{o.width} ft wide</span>
                  </span>
                  <span className={styles.gcatP}>{money(o.price)}</span>
                </button>
              ))}
            </Fragment>
          ))}

          <div className={styles.sheetSec}>On this plan</div>
          {openings.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyT}>No openings yet</div>
              <div className={styles.emptyS}>Pick a gate or a door above to place one.</div>
            </div>
          ) : (
            openings.map((o) => {
              const t = openingOf(o.type);
              return (
                <div key={o.id} className={styles.opRow}>
                  <span className={styles.opIc}>
                    <Icon
                      id={
                        t.kind === "gate"
                          ? "i-fence-estimator-door-open"
                          : "i-fence-estimator-door-closed"
                      }
                    />
                  </span>
                  <span className={styles.opTxt}>
                    <span className={styles.opN}>{t.label}</span>
                    <span className={styles.opSub}>
                      {t.width} ft · {o.run ? `Run ${o.run}` : "Free"}
                    </span>
                  </span>
                  <span className={styles.opP}>{money(t.price)}</span>
                  <button
                    className={styles.opDel}
                    type="button"
                    aria-label={`Remove ${t.label}`}
                    onClick={() => setOpenings((p) => p.filter((x) => x.id !== o.id))}
                  >
                    <Icon id="i-x" />
                  </button>
                </div>
              );
            })
          )}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheet(null)}>
          Done
        </button>
      </div>

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div
        className={`${styles.sheet} ${sheet === "row" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Row actions"
        aria-hidden={sheet !== "row"}
        {...rowDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...rowDrag.handleProps} />
        <div className={styles.sheetHead} {...rowDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {rowRun
              ? `Run ${rowRunIndex + 1} · ${rowRun.ft} ft · ${money(rowRun.ft * price.perFt)}`
              : rowOpen
                ? `${openingOf(rowOpen.type).width} ft · ${money(openingOf(rowOpen.type).price)} · ${
                    rowOpen.run ? `run ${rowOpen.run}` : "free"
                  }`
                : "—"}
          </div>
          <div className={styles.sheetTitle}>
            {rowRun ? `Run ${rowRunIndex + 1}` : rowOpen ? openingOf(rowOpen.type).label : "Actions"}
          </div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button
              key={r.act}
              className={`${styles.menuItem} ${r.danger ? styles.menuItemDanger : ""}`}
              type="button"
              disabled={r.disabled}
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
        <button className={styles.sheetCancel} type="button" onClick={() => setSheet(null)}>
          Cancel
        </button>
      </div>

      {/* ============ RUN LENGTH FORM SHEET ============ */}
      <div
        className={`${styles.sheet} ${sheet === "run" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feRunTitle"
        aria-hidden={sheet !== "run"}
        {...runDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...runDrag.handleProps} />
        <div className={styles.sheetHead} {...runDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {runDraft.id ? "Field measurement / edit" : "Field measurement / new leg"}
          </div>
          <div className={styles.sheetTitle} id="feRunTitle">
            {runDraft.id ? "Edit run" : "Add run"}
          </div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="feRunForm" noValidate onSubmit={submitRun}>
          <div className={`${styles.fld} ${ftErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="feFt">
              Measured length<span className={styles.req}>*</span>
            </label>
            <div className={styles.stepRow}>
              <button className={styles.stepBtn} type="button" aria-label="Less" onClick={() => bumpFt(-1)}>
                <Icon id="i-chevl" />
              </button>
              <input
                ref={ftRef}
                className={`${styles.pinput} ${styles.stepInput}`}
                id="feFt"
                name="ft"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                autoComplete="off"
                placeholder="20"
                value={runDraft.ft}
                aria-invalid={ftErr}
                aria-describedby={ftErr ? "feFtErr" : undefined}
                onChange={(e) => {
                  setRunDraft((d) => ({ ...d, ft: e.target.value }));
                  if (e.target.value.trim()) setFtErr(false);
                }}
              />
              <span className={styles.stepUnit}>ft</span>
              <button className={styles.stepBtn} type="button" aria-label="More" onClick={() => bumpFt(1)}>
                <Icon id="i-chevr" />
              </button>
            </div>
            {ftErr ? (
              <span className={styles.fldErr} id="feFtErr">
                Enter a length of at least 1 ft
              </span>
            ) : (
              <span className={styles.fldHint}>
                Whole feet. The plan, the footage and the price redraw on save.
              </span>
            )}
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setSheet(null)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="feRunForm">
            <Icon id="i-check" />
            {runDraft.id ? "Save length" : "Add run"}
          </button>
        </div>
      </div>

      <FenceIcons />
    </div>
  );
}

/* ============================================================
   PAGE-LOCAL SYMBOLS — the five ids the shared 48-symbol sprite
   does not carry. Prefixed i-fence-estimator- so they can never
   collide with the shared set or another page. Original lucide
   paths, 24×24, stroke 2, currentColor. door-open / door-closed
   are the two the desktop donor ships for the same reason.
   ============================================================ */
function FenceIcons() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-fence-estimator-door-open" viewBox="0 0 24 24">
          <path d="M13 4h3a2 2 0 0 1 2 2v14" />
          <path d="M2 20h3" />
          <path d="M13 20h9" />
          <path d="M10 12v.01" />
          <path d="M13 4.8v14.4a.6.6 0 0 1-.7.6l-5-1a.6.6 0 0 1-.3-.5V5.7a.6.6 0 0 1 .5-.6l5-1a.6.6 0 0 1 .5.7Z" />
        </symbol>
        <symbol id="i-fence-estimator-door-closed" viewBox="0 0 24 24">
          <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
          <path d="M2 20h20" />
          <path d="M14 12v.01" />
        </symbol>
        <symbol id="i-fence-estimator-ruler" viewBox="0 0 24 24">
          <path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4Z" />
          <path d="m14.5 12.5 2-2" />
          <path d="m11.5 9.5 2-2" />
          <path d="m8.5 6.5 2-2" />
          <path d="m17.5 15.5 2-2" />
        </symbol>
        <symbol id="i-fence-estimator-undo" viewBox="0 0 24 24">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
        </symbol>
        <symbol id="i-fence-estimator-waypoints" viewBox="0 0 24 24">
          <circle cx="12" cy="4.5" r="2.5" />
          <path d="m10.2 6.3-3.9 3.9" />
          <circle cx="4.5" cy="12" r="2.5" />
          <path d="M7 12h10" />
          <circle cx="19.5" cy="12" r="2.5" />
          <path d="m13.8 17.7 3.9-3.9" />
          <circle cx="12" cy="19.5" r="2.5" />
        </symbol>
      </defs>
    </svg>
  );
}
