"use client";

// MOBILE DASHBOARD (mobile-v2) — Blueprint design system, handheld build.
//
// Ported from the scratchpad donor jobflex-dashboard-mobile-blueprint.html,
// which is itself assembled from the canonical reference dashboard
// (.claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html).
// Tokens, palette, type scale, status tones and the Motion System "Balanced"
// are the reference's; the composition is re-cut for a phone.
//
// What changes versus the desktop sheet, and why:
//  · Sidebar → a burger drawer carrying the full nav, plus a 3-item bottom
//    bar (New Proposal · Settings · Account). The floating FAB it replaced
//    was removed at the owner's call, 2026-07-29: the action now lives in
//    the bar, so nothing hovers over the content.
//  · KPI row of 4 → a masthead hero numeral + a 3-up strip, so one number
//    owns the screen instead of four competing for it.
//  · Schedule and jobs move ABOVE revenue: on a phone the question is
//    "what's next", and the money question is already answered by the hero.
//  · Chart plot box re-cut for a 320px screen; hover → pointer scrub.
//  · Kanban drag & drop → tap a lead, pick a stage in a bottom sheet.
//    HTML5 drag has no touch equivalent, so the interaction is rebuilt
//    rather than desktop-gated.

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-v2.module.css";
import {
  LEAD_STAGES,
  NAV_SECTIONS,
  activeHref,
  PLOT,
  RANGES,
  TODAY,
  WEEK_DAYS,
  WEEK_LABEL,
  Y_ROWS,
  activities,
  chartDatasets,
  jobsData,
  leadsData as seedLeads,
  weekEvents,
  type Lead,
  type RangeKey,
  type StageKey,
} from "./mobile-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The list-height measurement must land before paint or the card renders at
// full height and snaps. Resolved once at module load, so this is not a
// conditional hook call — it just keeps useLayoutEffect off the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const usd = (n: number) => n.toLocaleString("en-US");

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/* ============================================================
   COUNT-UP — 750ms easeOutCubic. tabular-nums keep the digit
   columns from jumping while the number climbs.
   ============================================================ */
function CountUp({
  value,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = prefix + usd(value) + suffix;
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      const e = 1 - Math.pow(1 - pr, 3);
      el.textContent = prefix + usd(Math.round(value * e)) + suffix;
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, prefix, suffix]);

  return (
    <div ref={ref} className={className}>
      {prefix + usd(value) + suffix}
    </div>
  );
}

/* ============================================================
   LIST LIMIT — ≤4 rows plain; 5+ internal scroll sized to the
   real bottom of the 4th row; >10 rows expose the inline
   "Go to …" button as the last element inside the scroll.
   ============================================================ */
function useListLimit(ref: React.RefObject<HTMLDivElement | null>, count: number, visible: number, deps: unknown[]) {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      el.classList.toggle(styles.hasMore, count > 10);
      if (count > visible) {
        el.classList.add(styles.scrollable);
        let h = 0;
        for (let i = 0; i < Math.min(visible, el.children.length); i++) {
          h += (el.children[i] as HTMLElement).offsetHeight;
        }
        if (h) el.style.height = `${Math.round(h + 2)}px`;
      } else {
        el.classList.remove(styles.scrollable);
        el.style.height = "";
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [count, visible, ...deps]);
}

export function MobileDashboard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [selectedDay, setSelectedDay] = useState<number>(TODAY);
  const [range, setRange] = useState<RangeKey>("7d");
  const [leads, setLeads] = useState<Lead[]>(() => seedLeads.map((l) => ({ ...l })));
  const [navOpen, setNavOpen] = useState(false);
  /* The lit nav item is DERIVED from the URL, not held in state. It used to be
     a label string the drawer set on click, which is why clicking a link only
     moved the highlight and never changed the page. */
  const activeNav = activeHref(usePathname() ?? "");
  const [banner, setBanner] = useState<"open" | "closing" | "hidden">("open");
  const [sheetLead, setSheetLead] = useState<Lead | null>(null);
  const [landedId, setLandedId] = useState<number | null>(null);
  const [railIdx, setRailIdx] = useState(0);

  /* ---------- viewport height ----------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL
     bar changes innerHeight mid-scroll, so the real value is republished
     rather than trusting a bare 100vh/100dvh. */
  useEffect(() => {
    const setH = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    setH();
    window.addEventListener("resize", setH);
    window.visualViewport?.addEventListener("resize", setH);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", setH);
      window.visualViewport?.removeEventListener("resize", setH);
      document.documentElement.style.removeProperty("--app-h");
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll ------ */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    let velLastY = host.scrollTop;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    const onScroll = () => {
      const now = performance.now();
      scrollVel = Math.abs(host.scrollTop - velLastY) / Math.max(1, now - velLastT);
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
    const cells = Array.from(content.querySelectorAll<HTMLElement>(`.${styles.kpi}, .${styles.mastNote}`));
    cells.forEach((el, i) => {
      el.classList.add(styles.rvCell);
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${160 + (i % 8) * 45}ms` : "200ms";
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          if (t.dataset.rvScroll) {
            // Below the fold: duration follows the current scroll speed —
            // slow scroll ≈ 900ms, fast never shorter than 550ms.
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - scrollVel * 160))}ms`;
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
    [...blocks, ...cells].forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax ----------------------------
     The direction-aware FAB collapse that used to share this handler went
     with the FAB — the bottom bar is a fixed grid row and does not react
     to scroll. */
  useEffect(() => {
    const host = scrollRef.current;
    if (!host || prefersReducedMotion()) return;
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

  /* ---------- NAV DRAWER ---------------------------------------------
     The sliding active-item indicator is measured, not guessed: it needs the
     link's real offsetTop/Height, which only exist once the drawer is laid
     out. `ready` is added a frame later so the first open snaps into place
     instead of sliding down from zero. */
  const navScrollRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ind = indicatorRef.current;
    if (!ind) return;
    if (!navOpen) {
      ind.classList.remove(styles.ready);
      return;
    }
    const nav = navScrollRef.current;
    if (!nav) return;
    const raf = requestAnimationFrame(() => {
      const link = nav.querySelector<HTMLElement>(`.${styles.sbLink}.${styles.active}`);
      if (!link) return;
      ind.style.top = `${link.offsetTop}px`;
      ind.style.height = `${link.offsetHeight}px`;
      requestAnimationFrame(() => ind.classList.add(styles.ready));
    });
    return () => cancelAnimationFrame(raf);
  }, [navOpen, activeNav]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  /* ---------- Motion: press stamp (delegated, so it also covers rows
     rendered later, e.g. the sheet options) --------------------------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const target = e.target as HTMLElement;
    const pressSel = `.${styles.segBtn}, .${styles.tbarBtn}, .${styles.cardFootBtn}, .${styles.sheetOpt}, .${styles.sheetCancel}, .${styles.emptyAct}, .${styles.sbFootIc}, .${styles.sbFootAcc}, .${styles.bnavBtn}`;
    const el = target.closest<HTMLElement>(pressSel);
    const cls = el ? styles.pressed : styles.dayPressed;
    const node = el ?? target.closest<HTMLElement>(`.${styles.day}`);
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    node.addEventListener("animationend", () => node.classList.remove(cls), { once: true });
  }, []);

  /* ---------- Lead Center banner: smooth collapse of height + gap ----- */
  const bannerRef = useRef<HTMLDivElement>(null);
  const dismissBanner = () => {
    const b = bannerRef.current;
    if (!b || banner !== "open") return;
    if (prefersReducedMotion()) return setBanner("hidden");
    b.style.height = `${b.offsetHeight}px`;
    b.style.transitionDelay = "0ms";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setBanner("closing");
        b.style.height = "0px";
      }),
    );
    const done = (e: TransitionEvent) => {
      if (e.propertyName !== "height") return;
      setBanner("hidden");
      b.removeEventListener("transitionend", done);
    };
    b.addEventListener("transitionend", done);
  };

  /* ---------- THIS WEEK ---------------------------------------------- */
  const dayEvents = useMemo(
    () => (weekEvents[selectedDay] ?? []).slice().sort((a, b) => a.m - b.m),
    [selectedDay],
  );
  const weekListRef = useRef<HTMLDivElement>(null);
  useListLimit(weekListRef, dayEvents.length, 4, [selectedDay]);

  /* ---------- UPCOMING JOBS ------------------------------------------ */
  const sortedJobs = useMemo(() => jobsData.slice().sort((a, b) => a.k - b.k), []);
  const jobsListRef = useRef<HTMLDivElement>(null);
  useListLimit(jobsListRef, sortedJobs.length, 4, []);

  /* ---------- RECENT ACTIVITY (limit 10, even though 12 exist) -------- */
  const shownActivity = useMemo(() => activities.slice(0, 10), []);
  const actListRef = useRef<HTMLDivElement>(null);
  useListLimit(actListRef, shownActivity.length, 5, []);

  /* ---------- CHART --------------------------------------------------- */
  const ds = chartDatasets[range];
  const pts = useMemo(() => {
    const n = ds.values.length;
    const span = PLOT.x1 - PLOT.x0;
    const hgt = PLOT.y1 - PLOT.y0;
    return ds.values.map((v, i) => ({
      x: PLOT.x0 + i * (span / (n - 1)),
      y: PLOT.y1 - (v / ds.yMax) * hgt,
      v,
      d: ds.labels[i],
    }));
  }, [ds]);

  // A 320px screen cannot carry 10–13 x-labels legibly: thin to ~5.
  const labelStep = Math.max(1, Math.ceil(pts.length / 5));
  const peak = useMemo(() => pts.reduce((m, p) => (p.v > m.v ? p : m), pts[0]), [pts]);
  const peakLabel = useMemo(() => {
    let k = (Math.round(peak.v / 100) / 10).toString();
    if (k.slice(-2) === ".0") k = k.slice(0, -2);
    return `$${k}K`;
  }, [peak]);

  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const activeDot = scrubIdx ?? pts.length - 1;

  const lineRef = useRef<SVGPolylineElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const noteRef = useRef<SVGTextElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipTextRef = useRef<SVGTextElement>(null);
  const tipBoxRef = useRef<SVGRectElement>(null);
  const [tipW, setTipW] = useState(90);

  // Drawing (Balanced): the line draws itself, points appear along the way,
  // the fill and the peak annotation land after. Replays on range change.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const line = lineRef.current;
    const area = areaRef.current;
    const note = noteRef.current;
    const dots = dotsRef.current ? (Array.from(dotsRef.current.children) as SVGRectElement[]) : [];
    if (!line || !area || !note) return;
    const len = line.getTotalLength();
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
    line.style.transition = "none";
    area.style.opacity = "0";
    note.style.opacity = "0";
    dots.forEach((d) => (d.style.opacity = "0"));
    const timers: number[] = [];
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        line.style.transition = "stroke-dashoffset 850ms cubic-bezier(0.4, 0, 0.2, 1)";
        line.style.strokeDashoffset = "0";
        dots.forEach((d, i) => {
          timers.push(
            window.setTimeout(
              () => {
                d.style.transition = "opacity 180ms ease";
                d.style.opacity = "1";
              },
              Math.round(850 * (i / Math.max(1, dots.length - 1))),
            ),
          );
        });
        timers.push(
          window.setTimeout(() => {
            area.style.opacity = "1";
            note.style.opacity = "1";
          }, 950),
        );
      }),
    );
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [range]);

  // Tooltip box follows the text width (mono, so it changes with the value)
  useEffect(() => {
    if (scrubIdx === null || !tipTextRef.current) return;
    setTipW(tipTextRef.current.getBBox().width + 18);
  }, [scrubIdx, range]);

  const hideTimer = useRef<number | null>(null);
  const pickPoint = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || !pts.length) return;
      const r = svg.getBoundingClientRect();
      const sx = ((clientX - r.left) / r.width) * 340;
      let best = 0;
      let bd = Infinity;
      pts.forEach((p, i) => {
        const dd = Math.abs(p.x - sx);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      setScrubIdx(best);
    },
    [pts],
  );

  // Pointer events cover mouse, pen and touch on one path. touch-action is
  // pan-y, so a vertical swipe still scrolls the page past the chart.
  const onScrubDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    pickPoint(e.clientX);
  };
  const onScrubMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) pickPoint(e.clientX);
  };
  const onScrubRelease = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (e.pointerType === "mouse") return;
    // Touch: leave the readout up long enough to actually be read.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setScrubIdx(null), 2200);
  };

  const tipX = scrubIdx !== null ? Math.min(Math.max(pts[scrubIdx].x - tipW / 2, PLOT.x0 + 2), PLOT.x1 - tipW) : 0;
  const tipY =
    scrubIdx !== null ? (pts[scrubIdx].y - 40 < 14 ? pts[scrubIdx].y + 16 : pts[scrubIdx].y - 40) : 0;

  /* ---------- LEAD FLOW ----------------------------------------------- */
  const railRef = useRef<HTMLDivElement>(null);
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const col = rail.firstElementChild as HTMLElement | null;
    const w = col?.offsetWidth || 1;
    setRailIdx(Math.max(0, Math.min(LEAD_STAGES.length - 1, Math.round(rail.scrollLeft / w))));
  };

  const moveLead = (to: StageKey) => {
    const lead = sheetLead;
    setSheetLead(null);
    if (!lead || lead.stage === to) return;
    setLeads((prev) => {
      const next = prev.filter((l) => l.id !== lead.id);
      // Lands at the END of the target column — exactly where the desktop
      // drop-slot preview sits.
      next.push({ ...lead, stage: to });
      return next;
    });
    setLandedId(lead.id);
    window.setTimeout(() => setLandedId(null), 500);
    const rail = railRef.current;
    const idx = LEAD_STAGES.findIndex((s) => s.key === to);
    if (rail && idx >= 0) {
      const col = rail.children[idx] as HTMLElement | undefined;
      if (col) rail.scrollTo({ left: col.offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  // Esc closes the sheet
  useEffect(() => {
    if (!sheetLead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetLead(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetLead]);

  const rowDelay = (i: number) => ({ animationDelay: `${i * 45}ms` });

  return (
    <div className={styles.app} ref={rootRef} onClick={onRootClick}>
      <Sprite />

      {/* ============ TOPBAR ============ */}
      <header className={styles.tbar}>
        <button
          className={styles.tbarBtn}
          type="button"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <Icon id="i-menu" />
        </button>
        <span className={styles.tbarMarkBox}>
          <Image
            className={styles.tbarMarkImg}
            src="/jobflex-mark.png"
            alt=""
            width={66}
            height={66}
            priority
          />
        </span>
        <span className={styles.tbarTxt}>
          <span className={styles.tbarName}>JOBFLEX</span>
          <span className={styles.tbarSub}>Contractor OS</span>
        </span>
        <div className={styles.tbarRight}>
          <button className={styles.tbarBtn} type="button" aria-label="Search">
            <Icon id="i-search" />
          </button>
          <button className={styles.tbarBtn} type="button" aria-label="Notifications">
            <Icon id="i-bell" />
            <span className={styles.bellDot} />
          </button>
        </div>
      </header>

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* LEAD CENTER BANNER */}
          <div
            ref={bannerRef}
            className={[
              styles.banner,
              banner === "closing" ? styles.bannerClosing : "",
              banner === "hidden" ? styles.bannerHidden : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Icon id="i-pin" className={`${styles.ic} ${styles.bannerPin}`} />
            <div className={styles.bannerBody}>
              <div className={styles.bannerKicker}>Lead Center</div>
              <div className={styles.bannerTxt}>
                Homeowner leads near you aren&apos;t reaching your shop yet — add your business address and
                the trades you take.{" "}
                <a className={styles.bannerLink} href="#">
                  Complete your profile
                </a>
              </div>
            </div>
            <button className={styles.bannerClose} type="button" aria-label="Dismiss" onClick={dismissBanner}>
              <Icon id="i-x" />
            </button>
          </div>

          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Good Evening · Jul 22</div>
            <h1 className={styles.pageTitle}>Overview</h1>
          </div>

          {/* MASTHEAD — the one number that owns the screen */}
          <div className={styles.masthead}>
            <div className={styles.mastMain}>
              <div className={styles.mastKicker}>Revenue</div>
              <CountUp value={48250} prefix="$" className={styles.mastVal} />
            </div>
            <div className={styles.mastNotes}>
              <div className={styles.mastNote}>
                <div className={styles.mastNoteLbl}>Collected</div>
                <div className={`${styles.mastNoteVal} ${styles.ok}`}>$31,900</div>
              </div>
              <div className={styles.mastNote}>
                <div className={styles.mastNoteLbl}>Outstanding</div>
                <div className={styles.mastNoteVal}>$16,350</div>
              </div>
            </div>
          </div>

          {/* KPI STRIP */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpi}>
              <div className={styles.kpiLbl}>Pipeline</div>
              <CountUp value={132} prefix="$" suffix="K" className={styles.kpiVal} />
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLbl}>Open Prop.</div>
              <CountUp value={7} className={`${styles.kpiVal} ${styles.accent}`} />
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLbl}>Leads · 7D</div>
              <CountUp value={12} className={styles.kpiVal} />
            </div>
          </div>

          {/* RECENT ACTIVITY */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Recent Activity</div>
              </div>
            </div>
            <hr className={styles.cardRule} />
            <div className={styles.list} ref={actListRef}>
              {shownActivity.map((a, i) => (
                <div key={`${a.t}-${i}`} className={`${styles.actRow} ${styles.rowIn}`} style={rowDelay(i)}>
                  <div className={styles.actIc}>
                    <Icon id={a.i} />
                  </div>
                  <div className={styles.actBody}>
                    <div className={styles.actTitle}>{a.t}</div>
                    <div className={styles.actMeta}>{a.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* THIS WEEK */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>This Week</div>
                <div className={styles.cardSub}>
                  {WEEK_LABEL.range} · <b>{WEEK_LABEL.count} scheduled</b>
                </div>
              </div>
            </div>
            <div className={styles.weekStrip}>
              {WEEK_DAYS.map((d) => (
                <div
                  key={d.day}
                  className={[
                    styles.day,
                    d.day === TODAY ? styles.today : "",
                    d.day === selectedDay ? styles.selected : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-day={d.day}
                  role="button"
                  tabIndex={0}
                  aria-pressed={d.day === selectedDay}
                  onClick={() => setSelectedDay(d.day)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedDay(d.day);
                    }
                  }}
                >
                  <div className={styles.dayLbl}>{d.lbl}</div>
                  <div className={styles.dayNum}>{d.day}</div>
                  <div className={`${styles.dayDot} ${d.dot ? "" : styles.off}`} />
                </div>
              ))}
            </div>
            <div className={`${styles.list} ${styles.weekList}`} ref={weekListRef}>
                {dayEvents.length ? (
                  dayEvents.map((e, i) => (
                    <div
                      key={`${selectedDay}-${e.t}-${e.title}`}
                      className={`${styles.schedRow} ${styles.rowIn}`}
                      style={rowDelay(i)}
                    >
                      <span className={styles.tag}>{e.t}</span>
                      <span className={styles.schedTitle}>{e.title}</span>
                    </div>
                  ))
                ) : (
                  <div key={`empty-${selectedDay}`} className={`${styles.empty} ${styles.rowIn}`}>
                    <div className={styles.emptyTxt}>Nothing scheduled for this day.</div>
                    <a className={styles.emptyAct} href="#">
                      <Icon id="i-plus" />
                      Schedule a job
                    </a>
                  </div>
                )}
                <a className={styles.cardFootBtn} href="#">
                  Go to Calendar
                  <Icon id="i-arrow" />
                </a>
            </div>
          </div>

          {/* UPCOMING JOBS */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Upcoming Jobs</div>
              </div>
            </div>
            <hr className={styles.cardRule} />
            <div className={styles.list} ref={jobsListRef}>
              {sortedJobs.map((j, i) => (
                <div key={j.k} className={`${styles.jobRow} ${styles.rowIn}`} style={rowDelay(i)}>
                  <span className={`${styles.jobDate} ${j.k === 700 + TODAY ? styles.today : ""}`}>
                    {j.mo}
                    <b>{j.dd}</b>
                  </span>
                  <div className={styles.jobInfo}>
                    <div className={styles.jobTitle}>{j.title}</div>
                    <div className={styles.jobFoot}>
                      <span className={styles.jobSub}>{j.sub}</span>
                      <span className={`${styles.chip} ${j.st === "ok" ? styles.ok : styles.wait}`}>
                        {j.st === "ok" ? "Confirmed" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <a className={styles.cardFootBtn} href="#">
                Go to Jobs
                <Icon id="i-arrow" />
              </a>
            </div>
          </div>

          {/* REVENUE TREND */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <div className={styles.cardTitle}>Revenue Trend</div>
              </div>
            </div>
            <div className={styles.seg} role="tablist" aria-label="Chart range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`${styles.segBtn} ${range === r.key ? styles.active : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={range === r.key}
                  onClick={() => {
                    setScrubIdx(null);
                    setRange(r.key);
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className={styles.chartWrap}>
              <svg ref={svgRef} viewBox="0 0 340 212" role="img" aria-label="Revenue trend">
                <defs>
                  <pattern id="mvMinor" x={PLOT.x0} y={PLOT.y0} width="20.71" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20.71 0 L 0 0 0 20" className={styles.chMinor} fill="none" />
                  </pattern>
                </defs>
                <rect x={PLOT.x0} y={PLOT.y0} width={PLOT.x1 - PLOT.x0} height={PLOT.y1 - PLOT.y0} fill="url(#mvMinor)" />
                {/* Horizontal majors only — verticals read as noise */}
                {Y_ROWS.slice(0, 4).map((y) => (
                  <line key={y} x1={PLOT.x0} y1={y} x2={PLOT.x1} y2={y} className={styles.chMajor} />
                ))}
                <line x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x0} y2={PLOT.y1} className={styles.chAxis} />
                <line x1={PLOT.x0} y1={PLOT.y1} x2={PLOT.x1} y2={PLOT.y1} className={styles.chAxis} />
                {Y_ROWS.map((y, i) => (
                  <text key={y} x={32} y={y + 4} textAnchor="end" className={styles.chLbl}>
                    {ds.ticks[i]}
                  </text>
                ))}
                {pts.map((p, i) =>
                  i % labelStep === 0 || i === pts.length - 1 ? (
                    <text key={p.d} x={p.x} y={192} textAnchor="middle" className={styles.chLbl}>
                      {p.d}
                    </text>
                  ) : null,
                )}
                <path
                  ref={areaRef}
                  className={styles.chArea}
                  d={`M${PLOT.x0},${PLOT.y1} ${pts.map((p) => `L${p.x},${p.y}`).join(" ")} L${PLOT.x1},${PLOT.y1} Z`}
                />
                <polyline ref={lineRef} className={styles.chLine} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
                {/* Data points are SQUARES, never circles */}
                <g ref={dotsRef}>
                  {pts.map((p, i) => (
                    <rect
                      key={p.d}
                      x={p.x - 4.5}
                      y={p.y - 4.5}
                      width={9}
                      height={9}
                      className={`${styles.chDot} ${i === activeDot ? styles.on : ""}`}
                    />
                  ))}
                </g>
                {/* Peak is COMPUTED from the dataset max, and hides while scrubbing */}
                <text
                  ref={noteRef}
                  x={Math.min(Math.max(peak.x, 60), 306)}
                  y={Math.max(peak.y - 14, 22)}
                  textAnchor="middle"
                  className={styles.chNote}
                  style={{ opacity: scrubIdx === null ? 1 : 0 }}
                >
                  {peakLabel}
                </text>
                <line
                  x1={0}
                  y1={PLOT.y0}
                  x2={0}
                  y2={PLOT.y1}
                  className={styles.chGuide}
                  style={{
                    opacity: scrubIdx === null ? 0 : 0.55,
                    transform: scrubIdx === null ? undefined : `translateX(${pts[scrubIdx].x}px)`,
                  }}
                />
                <g
                  className={styles.chTipg}
                  style={{
                    opacity: scrubIdx === null ? 0 : 1,
                    transform: scrubIdx === null ? undefined : `translate(${tipX}px, ${tipY}px)`,
                  }}
                >
                  <rect ref={tipBoxRef} rx={2} height={26} x={0} y={0} width={tipW} className={styles.chTipBox} />
                  <text ref={tipTextRef} x={9} y={18} className={styles.chTipText}>
                    {scrubIdx === null ? "" : `${pts[scrubIdx].d} · $${usd(pts[scrubIdx].v)}`}
                  </text>
                </g>
                <rect
                  x={PLOT.x0}
                  y={4}
                  width={PLOT.x1 - PLOT.x0}
                  height={PLOT.y1 + 4}
                  fill="transparent"
                  className={styles.chOverlay}
                  onPointerDown={onScrubDown}
                  onPointerMove={onScrubMove}
                  onPointerUp={onScrubRelease}
                  onPointerCancel={onScrubRelease}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") setScrubIdx(null);
                  }}
                />
              </svg>
            </div>
          </div>

          {/* LEAD FLOW */}
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Lead Flow</h2>
            <a className={styles.cardLink} href="#">
              <span>Open leads</span>
              <Icon id="i-arrow" />
            </a>
          </div>

          <div className={styles.railWrap}>
            <div className={styles.stageRail} ref={railRef} onScroll={onRailScroll}>
              {LEAD_STAGES.map((s) => {
                const items = leads.filter((l) => l.stage === s.key);
                return (
                  <div key={s.key} className={styles.stageCol} data-stage={s.key}>
                    <div className={styles.stageColHead}>
                      <span className={styles.stageDot} />
                      <span className={styles.stageLbl}>{s.label}</span>
                      <span className={styles.stageCount}>{items.length}</span>
                    </div>
                    <div className={styles.stageCards}>
                      {items.length ? (
                        items.map((l) => (
                          <button
                            key={l.id}
                            className={`${styles.leadCard} ${landedId === l.id ? styles.landed : ""}`}
                            type="button"
                            onClick={() => setSheetLead(l)}
                            aria-label={`Move ${l.name} to another stage`}
                          >
                            <span className={styles.leadName}>{l.name}</span>
                            <span className={styles.leadJob}>
                              {l.job} · {l.city}
                            </span>
                            <span className={styles.leadMeta}>
                              <span className={styles.leadVal}>${usd(l.val)}</span>
                              <span className={styles.leadAge}>{l.age} ago</span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className={styles.leadEmpty}>No leads</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.railMeta}>
              <span className={styles.railTicks}>
                {LEAD_STAGES.map((s, i) => (
                  <i key={s.key} className={`${styles.railTick} ${i === railIdx ? styles.on : ""}`} />
                ))}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ============ BOTTOM NAV ============
          A grid row of .app, so it never overlaps the scroller. Three cells:
          the primary action, then the two account-level destinations. */}
      <nav className={styles.bottomNav} aria-label="Primary actions">
        <button className={`${styles.bnavBtn} ${styles.primary}`} type="button">
          <span className={styles.bnavPlate}>
            <Icon id="i-fileplus" />
          </span>
          <span className={styles.bnavLbl}>New Proposal</span>
        </button>
        <button className={styles.bnavBtn} type="button">
          <span className={styles.bnavPlate}>
            <Icon id="i-gear" />
          </span>
          <span className={styles.bnavLbl}>Settings</span>
        </button>
        <button className={styles.bnavBtn} type="button">
          <span className={styles.bnavPlate}>
            <Icon id="i-user" />
          </span>
          <span className={styles.bnavLbl}>Account</span>
        </button>
      </nav>

      {/* ============ NAV DRAWER (the reference sidebar) ============ */}
      <div
        className={`${styles.sbOverlay} ${navOpen ? styles.on : ""}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <aside className={`${styles.sb} ${navOpen ? styles.open : ""}`} aria-label="Main navigation" aria-hidden={!navOpen}>
        <div className={styles.sbHead}>
          <span className={styles.sbMarkBox}>
            <Image className={styles.sbMarkImg} src="/jobflex-mark.png" alt="" width={68} height={68} />
          </span>
          <div className={styles.sbHeadTxt}>
            <div className={styles.sbHeadName}>JOBFLEX</div>
            <div className={styles.sbHeadSub}>Contractor OS</div>
          </div>
          <button
            className={styles.sbClose}
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <Icon id="i-x" />
          </button>
        </div>

        <nav className={styles.sbScroll} ref={navScrollRef}>
          <div className={styles.sbIndicator} ref={indicatorRef} />
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.label}>
              <div className={styles.sbSecLabel}>{sec.label}</div>
              {sec.items.map((item) => {
                const isActive = item.href === activeNav;
                const cls = `${styles.sbLink} ${isActive ? styles.active : ""}`;
                // Surfaces with no page yet stay dead, but they must not jump
                // the scroller to the top of the document on the way — the
                // drawer just closes.
                return item.href === "#" ? (
                  <a
                    key={item.label}
                    className={cls}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setNavOpen(false);
                    }}
                  >
                    <Icon id={item.icon} />
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.label}
                    className={cls}
                    href={item.href as Route}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setNavOpen(false)}
                  >
                    <Icon id={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sbFoot}>
          <button className={styles.sbFootAcc} type="button" title="Account">
            <span className={styles.sbFootAv}>I</span>
            <span className={styles.sbFootTxt}>
              <span className={styles.sbFootName}>Ivan</span>
              <span className={styles.sbFootRole}>Owner</span>
            </span>
          </button>
          <button className={styles.sbFootIc} type="button" aria-label="Settings">
            <Icon id="i-gear" />
          </button>
        </div>
      </aside>

      {/* ============ BOTTOM SHEET — move a lead ============ */}
      <div
        className={`${styles.scrim} ${sheetLead ? styles.on : ""}`}
        onClick={() => setSheetLead(null)}
        aria-hidden="true"
      />
      <div
        className={`${styles.sheet} ${sheetLead ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Move lead to stage"
        aria-hidden={!sheetLead}
      >
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>
            {sheetLead ? `${sheetLead.name} · $${usd(sheetLead.val)}` : "Lead · —"}
          </div>
          <div className={styles.sheetTitle}>Move to stage</div>
        </div>
        <div className={styles.sheetBody}>
          {LEAD_STAGES.map((s, i) => {
            const current = sheetLead?.stage === s.key;
            return (
              <button
                key={s.key}
                className={`${styles.sheetOpt} ${current ? styles.current : ""}`}
                type="button"
                disabled={current || !sheetLead}
                onClick={() => moveLead(s.key)}
              >
                <span className={styles.sheetOptN}>{String(i + 1).padStart(2, "0")}</span>
                {s.label}
                {current ? <Icon id="i-check" /> : null}
              </button>
            );
          })}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetLead(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   SVG SPRITE — line icons 24×24, stroke 2, currentColor.
   Only original lucide paths; i-bulb is the reference's
   hand-drawn "switched-on" bulb (Smart Proposal).
   ============================================================ */
function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {/* i-logo (the drawn "J" sketch) is gone — both mastheads now render the
            real product mark from /jobflex-mark.png. */}
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </symbol>
        <symbol id="i-grid" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </symbol>
        <symbol id="i-file" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </symbol>
        <symbol id="i-users" viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </symbol>
        <symbol id="i-target" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </symbol>
        <symbol id="i-cal" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="1" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </symbol>
        <symbol id="i-jobs" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="1" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <path d="M2 13h20" />
        </symbol>
        <symbol id="i-bank" viewBox="0 0 24 24">
          <path d="M3 22h18" />
          <path d="M6 18v-7" />
          <path d="M10 18v-7" />
          <path d="M14 18v-7" />
          <path d="M18 18v-7" />
          <path d="m12 2 9 5H3z" />
        </symbol>
        <symbol id="i-phone" viewBox="0 0 24 24">
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9z" />
        </symbol>
        <symbol id="i-msg" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </symbol>
        <symbol id="i-thumb" viewBox="0 0 24 24">
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </symbol>
        <symbol id="i-bulb" viewBox="0 0 24 24">
          <path d="M9 15c-.2-1-.7-1.7-1.4-2.4A4.9 4.9 0 0 1 7.1 9.4a4.9 4.9 0 0 1 9.8 0c0 1.2-.5 2.3-1.5 3.2-.7.7-1.2 1.4-1.4 2.4" />
          <path d="M9.5 18h5" />
          <path d="M10.5 21h3" />
          <path d="M12 1.5V3" />
          <path d="m5.4 4.2 1.1 1.1" />
          <path d="m18.6 4.2-1.1 1.1" />
          <path d="M3 9.5h1.5" />
          <path d="M19.5 9.5H21" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </symbol>
        {/* lucide file-plus — "new proposal" reads better as a document being
            created than as a bare "+", which is what the FAB had to settle for */}
        <symbol id="i-fileplus" viewBox="0 0 24 24">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v6h6" />
          <path d="M12 18v-6" />
          <path d="M9 15h6" />
        </symbol>
        <symbol id="i-user" viewBox="0 0 24 24">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </symbol>
        <symbol id="i-bell" viewBox="0 0 24 24">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </symbol>
        <symbol id="i-pin" viewBox="0 0 24 24">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M7 7h10v10" />
          <path d="M7 17 17 7" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="M20 6 9 17l-5-5" />
        </symbol>
        <symbol id="i-menu" viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </symbol>
        <symbol id="i-folder" viewBox="0 0 24 24">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </symbol>
        <symbol id="i-crm" viewBox="0 0 24 24">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4" />
          <path d="m15.4 6.5-6.8 4" />
        </symbol>
        <symbol id="i-hardhat" viewBox="0 0 24 24">
          <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" />
          <path d="M10 10V5a2 2 0 1 1 4 0v5" />
          <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
        </symbol>
        <symbol id="i-userplus" viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </symbol>
        <symbol id="i-building" viewBox="0 0 24 24">
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
          <path d="M10 6h4" />
          <path d="M10 10h4" />
          <path d="M10 14h4" />
          <path d="M10 18h4" />
        </symbol>
        <symbol id="i-roof" viewBox="0 0 24 24">
          <path d="m2 11 10-8 10 8" />
          <path d="M5 9v12h14V9" />
        </symbol>
        <symbol id="i-fence" viewBox="0 0 24 24">
          <path d="M4 21V8l2-3 2 3v13" />
          <path d="M10 21V8l2-3 2 3v13" />
          <path d="M16 21V8l2-3 2 3v13" />
          <path d="M2 12h20" />
          <path d="M2 17h20" />
        </symbol>
        <symbol id="i-megaphone" viewBox="0 0 24 24">
          <path d="m3 11 18-5v12L3 13z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </symbol>
        <symbol id="i-board" viewBox="0 0 24 24">
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M12 11h4" />
          <path d="M12 16h4" />
          <path d="M8 11h.01" />
          <path d="M8 16h.01" />
        </symbol>
        <symbol id="i-gift" viewBox="0 0 24 24">
          <rect x="3" y="8" width="18" height="4" />
          <path d="M12 8v13" />
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
        </symbol>
        <symbol id="i-chart" viewBox="0 0 24 24">
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </symbol>
      </defs>
    </svg>
  );
}
