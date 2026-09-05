"use client";

// MOBILE REPORTS (mobile-reports-v2) — Blueprint system, handheld build.
//
// The chart surface of the handheld family. Tokens, palette, type scale, status
// tones and Motion System "Balanced" are the reference dashboard's; the
// masthead / filter-dropdown / row-card / bottom-sheet vocabulary is
// mobile-clients-v2's and the chart vocabulary is mobile-v2's and
// mobile-financials-v2's, so the pages read as one product. The topbar and
// drawer come from the shared <MobileNav /> — this page ships no nav chrome and
// no sprite of its own.
//
// Every region of the desktop sheet (components/v3/reports-blueprint) is
// covered:
//  · Analytics head + the Export action
//  · the 4-range control and its mono range note
//  · the 4-stat summary — Collected, Outstanding, Jobs completed, Win rate and
//    Avg job — redistributed across a computed masthead, the chart readout and
//    the pipeline foot (see below)
//  · Revenue: invoiced against collected, grouped bars per month, the drafting
//    hatch, mono axis, per-month readout
//  · Pipeline: the 4-step funnel with its drawn tracks, share-of-leads figures
//    and drop-off callouts (danger tone past 40%)
//  · Conversion: lead→quote, quote→close, close→delivered with the donor's
//    ok/warn thresholds, plus average time to close
//  · Crew performance: all six table columns, as row cards plus a detail sheet
//  · the export dialog, as a bottom sheet with the three formats and the
//    donor's 1400ms "Preparing…" state
//
// What changes versus the desktop sheet, and why:
//  · The 4-chip range rail becomes ONE dropdown. A chip rail does not survive
//    320px, and the range is this page's only filter dimension.
//  · The 4-card stat grid is redistributed instead of shrunk: Collected is the
//    masthead numeral with Outstanding and Jobs as its two annotations, "% of
//    invoiced" is the third cell of the chart readout (where it retargets per
//    month), and Win rate / Avg job sit in the pipeline foot — which is what
//    the funnel above them actually resolves to.
//  · The chart is read by dragging across the plot rather than hovering: there
//    is no hover on touch. The three-figure strip above it retargets at
//    whichever month is under the finger, so the numbers never sit under it.
//  · The 6-column crew table becomes row cards. Hiding columns is what the
//    desktop's own ≤860px layer does — it drops Hours and $/hr, which is half
//    of what a crew report is for. Here they move into the row sheet.
//  · The star rating glyph is gone (the house system has no star): the rating
//    reads as a drawn mono badge with the Reviews thumb, in a neutral frame
//    rather than a status tone.
//
// DATA: REAL, and the same rollup the desktop sheet shows. The page's server
// loader (app/dashboard/reports/load-reports) runs getReportsRollup(), which
// buckets the org's invoices, payments, leads, proposals and job assignments
// into all four ranges in one pass, and hands it down as a prop through the
// page's viewport switch (app/dashboard/reports/reports-responsive) or the
// /mobile-reports-v2 preview page. Nothing here fetches; nothing here is a
// fixture. Export builds a REAL CSV from the rollup on screen — the desktop's
// own buildCsv(), shared through ./reports-data.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-reports.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import type { ReportsProps } from "@/app/dashboard/reports/load-reports";
import {
  FORMATS,
  avgDaysFor,
  buildReportCsv,
  conversionFor,
  crewFigures,
  crewFor,
  funnelFor,
  initials,
  jobsFor,
  monthsFor,
  rangeOf,
  summaryFor,
  type CrewMember,
  type RangeKey,
} from "./reports-data";

/** Fed by app/dashboard/reports/load-reports. One loader, two editions. */
export type MobileReportsProps = ReportsProps;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Chart axis ticks only — the donor's helper. */
const shortMoney = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);

/* Chart geometry. 1 viewBox unit ≈ 1 CSS px at 360px, so the mono annotations
   land at their real size instead of being scaled down to noise. */
const CH = { w: 340, h: 206, x0: 44, x1: 332, y0: 12, y1: 168, lblY: 190 };
const CH_IW = CH.x1 - CH.x0;
const CH_IH = CH.y1 - CH.y0;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic, written straight to the node so a count-up does not
 *  re-render the chart 45 times. tabular-nums keep the digits from jumping. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = money(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = money(value * (1 - Math.pow(1 - pr, 3)));
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

/** The funnel's four fills step down in weight; the delivered step turns good. */
const FILL_CLS = ["", styles.s2, styles.s3, styles.s4];

/* The dropdown FACE gets a compact echo of the range; the menu cells keep the
   rollup's own labels. "Last 12 months · 136" overruns the face's ~149px of
   value room at 320px, and an ellipsed range reads as a bug. */
const FACE: Record<RangeKey, string> = {
  mtd: "This month",
  q: "Quarter",
  ytd: "Year",
  "12m": "12 months",
};

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

export function MobileReports({ rollup }: MobileReportsProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState<RangeKey>("q");
  const [filterOpen, setFilterOpen] = useState(false);
  /* Which crew members the reader has taken OUT of the report, by name. A view
     preference over the server's rollup, not an edit to it: nothing is written
     back, and it resets when the page is opened again. */
  const [excluded, setExcluded] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState("csv");
  const [busy, setBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const [scrub, setScrub] = useState<number | null>(null);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather
     than trusting a bare 100vh/100dvh. This is the React form of the donor's
     FLUID SCALE module — no root zoom, since the composition here is already
     the handheld one. */
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
    const sel = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.menuItem, styles.sheetCancel,
      styles.crowOpen, styles.expOpt, styles.emptyA, styles.noteBtn,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever this page owns ------------------------
     The drawer is MobileNav's business and handles its own key. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (exportOpen) setExportOpen(false);
      else if (sheetName) setSheetName(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, exportOpen, sheetName]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- derived --------------------------------------------------- */
  const cur = rangeOf(rollup, range);
  const months = useMemo(() => monthsFor(rollup, range), [rollup, range]);
  const sum = useMemo(() => summaryFor(rollup, range), [rollup, range]);
  const funnel = useMemo(() => funnelFor(rollup, range), [rollup, range]);
  const conv = useMemo(() => conversionFor(rollup, range), [rollup, range]);
  const avgDays = avgDaysFor(rollup, range);

  /* The rollup already scopes each crew member's figures to the range, so the
     range switch re-reads the server's numbers rather than scaling one set. */
  const rangeCrew = useMemo<CrewMember[]>(() => crewFor(rollup, range), [rollup, range]);
  const rows = useMemo(
    () =>
      rangeCrew
        .filter((c) => !excluded.includes(c.name))
        .map((c) => ({ c, f: crewFigures(c) })),
    [rangeCrew, excluded],
  );
  const crewTotal = useMemo(
    () => rows.reduce((a, r) => ({ jobs: a.jobs + r.f.jobs, revenue: a.revenue + r.f.revenue }),
      { jobs: 0, revenue: 0 }),
    [rows],
  );
  const hiddenCount = rangeCrew.length - rows.length;

  /* ---------- chart ----------------------------------------------------- */
  const chart = useMemo(() => {
    const max = Math.max(...months.map((m) => m.invoiced), 1);
    const step = Math.ceil(max / 4 / 10000) * 10000 || 10000;
    const top = step * 4;
    const gw = CH_IW / months.length;
    // Capped so one or four months do not render as slabs, floored so twelve
    // months do not render as hairlines.
    const bw = Math.min(26, Math.max(5, (gw - 8) / 2));
    const bars = months.map((m, i) => {
      const x = CH.x0 + gw * i;
      const cx = x + gw / 2;
      const ih = (m.invoiced / top) * CH_IH;
      const ch = (m.collected / top) * CH_IH;
      return { m, x, cx, ih, ch, invY: CH.y1 - ih, colY: CH.y1 - ch };
    });
    return { step, top, gw, bw, bars, ticks: [0, 1, 2, 3, 4].map((i) => step * i) };
  }, [months]);

  // A 320px plot cannot carry twelve month labels legibly: thin to ~5.
  const labelStep = Math.max(1, Math.ceil(months.length / 5));
  const read = scrub === null ? null : months[scrub] ?? null;
  const readInv = read ? read.invoiced : sum.invoiced;
  const readCol = read ? read.collected : sum.collected;
  const readRate = readInv ? Math.round((readCol / readInv) * 100) : 0;

  const svgRef = useRef<SVGSVGElement>(null);
  const hideTimer = useRef<number | null>(null);
  const pick = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const sx = ((clientX - r.left) / r.width) * CH.w;
      const idx = Math.floor((sx - CH.x0) / chart.gw);
      setScrub(Math.max(0, Math.min(months.length - 1, idx)));
    },
    [chart.gw, months.length],
  );
  const onScrubDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(e.clientX);
  };
  const onScrubMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
  };
  const onScrubUp = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (e.pointerType === "mouse") return;
    // Touch: leave the readout up long enough to actually be read.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setScrub(null), 2200);
  };
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  /* ---------- crew row sheet -------------------------------------------- */
  const sheetCrew = sheetName === null ? null : rows.find((r) => r.c.name === sheetName) ?? null;

  /* Only what has an effect. "Exclude from report" is a view filter over the
     rollup; the four navigation rows the fixture build offered (crew profile,
     jobs in range, reviews, compare) had no destination and are gone. */
  const menuRows = useMemo<MenuRow[]>(() => {
    if (!sheetCrew) return [];
    const { c, f } = sheetCrew;
    return [
      { act: "jobs", icon: "i-jobs", tone: styles.miSky, title: "Jobs in this range",
        sub: `${f.jobs} delivered · ${cur.note}` },
      { act: "exclude", icon: "i-x", tone: styles.miDanger, title: "Exclude from report",
        sub: `Drops ${c.name.split(" ")[0]} from the table, the total and the export`, danger: true },
    ];
  }, [sheetCrew, cur.note]);

  const runMenu = (act: string) => {
    const target = sheetCrew?.c.name ?? null;
    setSheetName(null);
    if (act === "exclude" && target) {
      setExcluded((prev) => (prev.includes(target) ? prev : [...prev, target]));
    }
  };

  const restoreCrew = () => setExcluded([]);

  /* ---------- export sheet ----------------------------------------------
     A REAL file. The CSV is built from the rollup on screen (the desktop's own
     buildCsv, shared through ./reports-data) and handed to the browser; the
     two formats the app cannot produce are disabled rather than pretending. */
  const busyTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (busyTimer.current) clearTimeout(busyTimer.current);
  }, []);

  const openExport = () => {
    setBusy(false);
    setExportErr("");
    setExportOpen(true);
  };
  const submitExport = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const picked = FORMATS.find((f) => f.id === format);
    if (!picked?.available) return;
    setBusy(true);
    setExportErr("");
    let url: string | null = null;
    try {
      const csv = buildReportCsv(rollup, range, excluded);
      url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobflex-report-${range}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setExportErr("Couldn't build the file. Try again.");
      setBusy(false);
      return;
    }
    // Revoked on a later tick: revoking synchronously can cancel the download
    // in some browsers, which have only just been handed the URL.
    busyTimer.current = window.setTimeout(() => {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
      setExportOpen(false);
    }, 600);
  };

  const anyOverlay = Boolean(sheetCrew) || exportOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const crewDrag = useSheetDrag(Boolean(sheetCrew), () => setSheetName(null));
  const exportDrag = useSheetDrag(exportOpen, () => setExportOpen(false));

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>

          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Analytics</div>
            <h1 className={styles.pageTitle}>Reports</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openExport}>
                <Icon id="i-download" />Export
              </button>
            </div>
          </div>

          {/* MASTHEAD — one numeral + mono kicker + EXACTLY two annotations.
              All three move with the range. */}
          <div className={styles.mast}>
            <div className={styles.mastTop}>
              <div className={styles.mastLbl}>
                Collected
                <span className={styles.mastRule} />
              </div>
              <CountUp value={sum.collected} className={styles.mastVal} />
            </div>
            <div className={styles.mastCnt}>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Outstanding</div>
                <div className={`${styles.mastSubV} ${sum.outstanding ? "" : styles.isZero}`}>
                  {sum.outstanding ? money(sum.outstanding) : "—"}
                </div>
              </div>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Jobs done</div>
                <div className={styles.mastSubV}>{sum.jobs}</div>
              </div>
            </div>
          </div>

          {/* RANGE — the desktop's four chips as ONE dropdown, plus the note */}
          <div className={styles.find}>
            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button
                className={styles.ddBtn}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((v) => !v)}
              >
                <Icon id="i-filter" />
                Filter
                <span className={styles.ddValue}>
                  {FACE[range]} · {jobsFor(rollup, range)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox" aria-label="Report range">
                {rollup.ranges.map((r) => (
                  <button
                    key={r.key}
                    className={`${styles.ddItem} ${range === r.key ? styles.active : ""}`}
                    type="button"
                    role="option"
                    aria-selected={range === r.key}
                    onClick={() => {
                      setRange(r.key);
                      setScrub(null);
                      setFilterOpen(false);
                    }}
                  >
                    {r.label}
                    <span className={styles.ddCount}>{jobsFor(rollup, r.key)}</span>
                    {range === r.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.rnote}>
              {cur.note}
              <span className={styles.rnoteRule} />
            </div>
          </div>

          {/* ============ REVENUE ============ */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Revenue</div>
                {/* Doubles as the chart's readout: drag across the plot and it
                    names the month the strip below is reporting. */}
                <div className={styles.cardSub}>
                  {read
                    ? `${read.m} · one month`
                    : `${months.length} ${months.length === 1 ? "month" : "months"} · USD`}
                </div>
              </div>
            </div>

            <div className={styles.legend}>
              <span className={styles.lgd}><i className={styles.swInv} />Invoiced</span>
              <span className={styles.lgd}><i className={styles.swCol} />Collected</span>
            </div>

            <div className={`${styles.hstrip} ${read ? styles.isMonth : ""}`}>
              <div className={styles.hs}>
                <div className={styles.hsL}>Invoiced</div>
                <div className={`${styles.hsV} ${styles.hsSwap}`} key={`i${scrub ?? "all"}`}>
                  {money(readInv)}
                </div>
              </div>
              <div className={styles.hs}>
                <div className={styles.hsL}>Collected</div>
                <div className={`${styles.hsV} ${styles.hsSwap}`} key={`c${scrub ?? "all"}`}>
                  {money(readCol)}
                </div>
              </div>
              <div className={styles.hs}>
                <div className={styles.hsL}>Of invoiced</div>
                <div className={`${styles.hsV} ${styles.hsSwap}`} key={`r${scrub ?? "all"}`}>
                  {readRate}%
                </div>
              </div>
            </div>

            <div className={`${styles.chart} ${read ? styles.isHot : ""}`}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${CH.w} ${CH.h}`}
                role="img"
                aria-label={`Collected against invoiced by month, in US dollars. ${cur.note}: invoiced ${money(sum.invoiced)}, collected ${money(sum.collected)}, ${sum.rate} percent of invoiced.`}
              >
                <defs>
                  {/* A drafting hatch for the invoiced bars — the drawing
                      language's "second material", not a status colour. */}
                  <pattern
                    id="mrHatch"
                    width="5"
                    height="5"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="5" height="5" className={styles.hatchBg} />
                    <line x1="0" y1="0" x2="0" y2="5" className={styles.hatchLine} />
                  </pattern>
                </defs>

                {/* Horizontal majors only — verticals read as noise */}
                {chart.ticks.map((t, i) => {
                  const y = CH.y1 - (CH_IH * i) / 4;
                  return (
                    <g key={t}>
                      <line className={styles.gridLine} x1={CH.x0} y1={y} x2={CH.x1} y2={y} />
                      <text className={styles.axisTxt} x={CH.x0 - 8} y={y + 4} textAnchor="end">
                        {shortMoney(t)}
                      </text>
                    </g>
                  );
                })}

                {chart.bars.map((b, i) => (
                  <g key={`${range}-${b.m.m}`} className={`${styles.moGroup} ${scrub === i ? styles.on : ""}`}>
                    <rect className={styles.moHit} x={b.x} y={CH.y0} width={chart.gw} height={CH_IH} />
                    <rect
                      className={`${styles.barInv} ${styles.barDraw}`}
                      style={{ animationDelay: `${i * 40}ms` }}
                      x={b.cx - chart.bw - 1}
                      y={b.invY}
                      width={chart.bw}
                      height={b.ih}
                    />
                    <rect
                      className={`${styles.barCol} ${styles.barDraw}`}
                      style={{ animationDelay: `${i * 40 + 20}ms` }}
                      x={b.cx + 1}
                      y={b.colY}
                      width={chart.bw}
                      height={b.ch}
                    />
                    {i % labelStep === 0 || i === chart.bars.length - 1 ? (
                      <text
                        className={`${styles.axisTxt} ${styles.moLbl}`}
                        x={b.cx}
                        y={CH.lblY}
                        textAnchor="middle"
                      >
                        {b.m.m}
                      </text>
                    ) : null}
                    <title>
                      {`${b.m.m} · invoiced ${money(b.m.invoiced)} · collected ${money(b.m.collected)}`}
                    </title>
                  </g>
                ))}

                <line className={styles.axisLine} x1={CH.x0} y1={CH.y1} x2={CH.x1} y2={CH.y1} />

                <rect
                  className={styles.chOverlay}
                  x={CH.x0}
                  y={CH.y0}
                  width={CH_IW}
                  height={CH_IH}
                  onPointerDown={onScrubDown}
                  onPointerMove={onScrubMove}
                  onPointerUp={onScrubUp}
                  onPointerCancel={onScrubUp}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") setScrub(null);
                  }}
                />
              </svg>
            </div>
          </div>

          {/* ============ PIPELINE ============ */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Pipeline</div>
                <div className={styles.cardSub}>Where the work falls out</div>
              </div>
            </div>

            <div className={styles.funnel}>
              {funnel.map((r, i) => (
                <div className={styles.fnRow} key={`${range}-${r.label}`}>
                  <div className={styles.fnTop}>
                    <span className={styles.fnL}>{r.label}</span>
                    <span className={styles.fnV}>{r.count} · {r.pct.toFixed(0)}%</span>
                  </div>
                  <div className={styles.fnTrack}>
                    <span
                      className={`${styles.fnFill} ${FILL_CLS[i] ?? ""}`}
                      style={{ "--fw": `${r.pct.toFixed(1)}%` } as React.CSSProperties}
                    />
                  </div>
                  {r.drop !== null ? (
                    <div className={`${styles.fnDrop} ${r.bad ? styles.bad : ""}`}>
                      Drop-off <b className={styles.fnDropV}>{r.drop.toFixed(0)}%</b> from {r.from}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* What the funnel resolves to — the desktop's fourth stat card. */}
            <div className={styles.fnFoot}>
              <div className={styles.fnFootCell}>
                <div className={styles.fnFootL}>Win rate</div>
                <div className={styles.fnFootV}>{sum.win.toFixed(0)}%</div>
              </div>
              <div className={styles.fnFootCell}>
                <div className={styles.fnFootL}>Avg job</div>
                <div className={styles.fnFootV}>{money(sum.avg)}</div>
              </div>
            </div>
          </div>

          {/* ============ CONVERSION ============ */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Conversion</div>
                <div className={styles.cardSub}>Quote to close · time to sign</div>
              </div>
            </div>
            <div className={styles.conv}>
              {conv.map((r) => (
                <div className={styles.convRow} key={r.l}>
                  <div className={styles.convTxt}>
                    <div className={styles.convL}>{r.l}</div>
                    <div className={styles.convS}>{r.s}</div>
                  </div>
                  <div className={`${styles.convV} ${r.tone === "ok" ? styles.toneOk : styles.toneWarn}`}>
                    {r.v.toFixed(0)}%
                  </div>
                </div>
              ))}
              <div className={styles.convRow}>
                <div className={styles.convTxt}>
                  <div className={styles.convL}>Average time to close</div>
                  <div className={styles.convS}>Proposal sent to signature</div>
                </div>
                {/* Null when nothing closed in the range — an em dash, never a
                    number the book cannot support. */}
                <div className={styles.convV}>
                  {avgDays ?? "—"}
                  {avgDays ? <span className={styles.convUnit}>days</span> : null}
                </div>
              </div>
            </div>
          </div>

          {/* ============ CREW ============ */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Crew performance</div>
                <div className={styles.cardSub}>Jobs delivered per person</div>
              </div>
            </div>

            {/* The way back sits where the loss shows. When the last crew member
                goes, the empty state carries it instead — one restore, not two. */}
            {hiddenCount > 0 && rows.length > 0 ? (
              <div className={styles.note}>
                {hiddenCount} of {rangeCrew.length} crew excluded
                <button className={styles.noteBtn} type="button" onClick={restoreCrew}>
                  <Icon id="i-rotate" />Show all
                </button>
              </div>
            ) : null}

            {rows.length === 0 ? (
              <div className={styles.empty}>
                {rangeCrew.length === 0 ? (
                  <>
                    <div className={styles.emptyT}>No crew work in this range</div>
                    <div className={styles.emptyS}>
                      Assign a worker to a job and their delivery shows up here.
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.emptyT}>No crew in this report</div>
                    <div className={styles.emptyS}>
                      Every crew member is excluded, so delivery per person has nothing to draw.
                    </div>
                    <button className={styles.emptyA} type="button" onClick={restoreCrew}>
                      <Icon id="i-rotate" />Show all crew
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.book}>
                {rows.map(({ c, f }, i) => (
                  <div
                    key={c.name}
                    className={`${styles.crow} ${styles.rowIn}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <span className={styles.cav}>{initials(c.name)}</span>
                    <div className={styles.cname}>{c.name}</div>
                    <button
                      className={styles.crowOpen}
                      type="button"
                      aria-label={`Actions for ${c.name}`}
                      onClick={() => setSheetName(c.name)}
                    >
                      <Icon id="i-dots" />
                    </button>
                    <div className={styles.crole}>{c.role}</div>
                    <div className={styles.crowFoot}>
                      {/* Null when no client has rated their jobs yet — the
                          badge says so rather than printing a 0.0. */}
                      <span className={styles.rate}>
                        <Icon id="i-thumb" />{c.rating == null ? "—" : c.rating.toFixed(1)}
                      </span>
                      <span className={styles.crowFigs}>
                        <span className={styles.cjobs}>{f.jobs} jobs</span>
                        <span className={`${styles.crev} ${f.revenue ? "" : styles.isZero}`}>
                          {f.revenue ? money(f.revenue) : "—"}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}

                {/* Ruled total, like the last line of an estimate */}
                <div className={styles.total}>
                  <span className={styles.totalL}>Total · {rows.length} crew</span>
                  <span className={styles.totalJ}>{crewTotal.jobs} jobs</span>
                  <span className={styles.totalV}>{money(crewTotal.revenue)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetName(null); setExportOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ CREW SHEET — the table columns a row cannot hold ============ */}
      <div
        className={`${styles.sheet} ${sheetCrew ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Crew actions"
        aria-hidden={!sheetCrew}
        {...crewDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...crewDrag.handleProps} />
        <div className={styles.sheetHead} {...crewDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetCrew
              ? `${sheetCrew.c.role}${sheetCrew.c.rating == null ? "" : ` · rated ${sheetCrew.c.rating.toFixed(1)}`}`
              : "Crew · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetCrew?.c.name ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {/* Hours and $/hr are the two columns the row card cannot carry; the
              desktop's own narrow layer just hides them. */}
          <div className={styles.sstrip}>
            <div className={styles.sst}>
              <div className={styles.sstL}>Jobs</div>
              <div className={styles.sstV}>{sheetCrew?.f.jobs ?? 0}</div>
            </div>
            <div className={styles.sst}>
              <div className={styles.sstL}>Hours</div>
              <div className={styles.sstV}>{sheetCrew?.f.hours ?? 0}</div>
            </div>
            <div className={styles.sst}>
              <div className={styles.sstL}>Per hour</div>
              <div className={styles.sstV}>{money(sheetCrew?.f.perHour ?? 0)}</div>
            </div>
          </div>
          {menuRows.map((r) => (
            <button
              key={r.act}
              type="button"
              disabled={r.disabled}
              className={`${styles.menuItem} ${r.danger ? styles.menuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}
            >
              <span className={`${styles.miIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.menuItemT}>{r.title}</span>
                <span className={styles.menuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetName(null)}>
          Cancel
        </button>
      </div>

      {/* ============ EXPORT SHEET — the desktop modal, rebuilt ============ */}
      <div
        className={`${styles.sheet} ${exportOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mrExpTitle"
        aria-hidden={!exportOpen}
        {...exportDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...exportDrag.handleProps} />
        <div className={styles.sheetHead} {...exportDrag.handleProps}>
          <div className={styles.sheetKicker}>Analytics / export</div>
          <div className={styles.sheetTitle} id="mrExpTitle">Export report</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mrExpForm" onSubmit={submitExport}>
          <div className={styles.expNote}>
            {cur.label} · {cur.note}
          </div>
          <div className={styles.expList} role="radiogroup" aria-label="Export format">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className={`${styles.expOpt} ${format === f.id ? styles.on : ""}`}
                type="button"
                role="radio"
                aria-checked={format === f.id}
                disabled={!f.available}
                onClick={() => setFormat(f.id)}
              >
                <span className={styles.expMark} />
                <span>
                  <span className={styles.expT}>{f.t}</span>
                  <span className={styles.expH}>{f.h}</span>
                </span>
              </button>
            ))}
          </div>
          {exportErr ? (
            <div className={styles.actErr} role="alert">{exportErr}</div>
          ) : null}
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setExportOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mrExpForm" disabled={busy}>
            <Icon id="i-download" />{busy ? "Preparing…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
