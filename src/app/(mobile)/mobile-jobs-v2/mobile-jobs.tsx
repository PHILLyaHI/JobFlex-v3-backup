"use client";

// MOBILE JOBS (mobile-jobs-v2) — Blueprint system, handheld build.
//
// Fourth sibling to /mobile-v2 (Overview), /mobile-proposals-v2 and
// /mobile-clients-v2. Tokens, palette, type scale, status tones and Motion
// System "Balanced" are the reference dashboard's; every shared pattern is the
// one mobile-clients-v2 established, so the four handheld surfaces are one
// product rather than four interpretations. The topbar and hamburger drawer are
// the shared <MobileNav /> — this page ships no nav chrome and no sprite.
//
// Built with the jobflex-page-styler skill (visual system) and the
// mobile-app-ui-design skill (structure: thumb reach, ≥44px targets, bottom
// sheets over modals, search over paging, initials over a repeated glyph,
// empty states that say what to do). Where the two disagree the house system
// wins: hard 3px offset shadows, 2px radii and Inter 900 caps stay, rather than
// the mobile skill's soft-shadow / rounded-3xl / gradient defaults.
//
// EVERY REGION OF THE DESKTOP JOBS SHEET IS COVERED
// (src/components/v3/jobs-blueprint/*):
//  · page head — "Delivery" kicker, H1, the New-job action
//  · the five status tabs (.jtabs/.jtab/.jtab-n/.jtab-dot) with live counts
//  · the 5-column table (Job / Status / Schedule / Crew / open) as row cards
//  · all four status badges (.jst--scheduled / in_progress / completed / canceled)
//  · the schedule cell in both forms: single day, multi-day range, and the
//    .j-unsched "Unscheduled" case
//  · the crew stack (.crew / .crew-av / .crew-more / .crew-none), with overflow
//  · the pager (.pager / .pager-btn / .pager-info)
//  · the empty state (#jobsEmpty) — split into the two states a phone needs
//  · the row popover vocabulary (.pmenu with its 26px tonal boxes, a disabled
//    item and a danger item) as a bottom sheet
//  · the New-job dialog (.mdl + .fld + .fseg + client datalist + required-field
//    validation) as a bottom sheet with a beige submit foot
//
// WHAT CHANGES VERSUS THE DESKTOP SHEET, AND WHY
//  · The five status tabs become the family's ONE filter dropdown. The desktop
//    control is a wrapping pill rail (flex-wrap, gap 7px) — a chip rail, which
//    does not survive 320px; and five tabs cannot keep a label and its count on
//    one line at ~64px each, which is the standing rule. mobile-clients-v2 made
//    exactly this move with its tag rail.
//  · A search box is added. Fourteen records over two pages, and on a jobsite
//    the real task is "find the Maple Ave job", not "page through the board".
//    It filters the same fixture client-side — no new endpoint.
//  · A computed masthead is added: open-job count + on-site-today +
//    unscheduled. The desktop has room to show the whole board at once; a phone
//    needs the "what is on my plate" answer above the fold.
//  · The ⋮ popover becomes a bottom sheet (no hover on touch, and CLAUDE.md
//    prefers sheets over modals), and so does the create dialog.
//  · Page size 20 → 8: a handheld row is three lines tall, and the pager
//    becomes a control that actually appears on this fixture.
//  · Dropped from the row: nothing but noise. No line-item counts, no
//    timestamps. `rel` ("today", "in 2 days") stays because it changes what you
//    do next, unlike an "updated 25m ago".
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-jobs.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  JOBS_SEED,
  OPEN_STATUSES,
  PAGE_SIZE,
  STATUS_FILTERS,
  initials,
  matchesQuery,
  matchesStatus,
  scheduleLabel,
  siteOf,
  statusCount,
  statusLabel,
  type Job,
  type JobStatus,
  type StatusFilter,
} from "./jobs-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const count = (n: number) => Math.round(n).toLocaleString("en-US");

/** The desktop .jst--* tones, one class per state. */
const STATUS_CLASS: Record<JobStatus, string> = {
  SCHEDULED: styles.stScheduled,
  IN_PROGRESS: styles.stInProgress,
  COMPLETED: styles.stCompleted,
  CANCELED: styles.stCanceled,
};

/** Crew pips shown before the stack overflows into "+N". */
const CREW_SHOWN = 2;

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
      el.textContent = count(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = count(value * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {count(value)}
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

/** "2026-07-30" → "Jul 30, 2026", parsed field by field on purpose:
 *  `new Date("2026-07-30")` is read as UTC midnight and renders as the previous
 *  day in every negative-offset timezone. The desktop helper, verbatim. */
function parseDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function longDate(v: string): string | null {
  const d = parseDay(v);
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    : null;
}
/** The fixture's own relative vocabulary: today / in 1 day / in 2 days /
 *  in 1 week / 2d ago / 2w ago. The desktop helper, verbatim. */
function relLabel(v: string): string | null {
  const d = parseDay(v);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days > 0) {
    if (days === 1) return "in 1 day";
    if (days < 7) return `in ${days} days`;
    if (days < 14) return "in 1 week";
    return `in ${Math.round(days / 7)} weeks`;
  }
  const ago = -days;
  if (ago < 7) return `${ago}d ago`;
  if (ago < 14) return "1w ago";
  return `${Math.round(ago / 7)}w ago`;
}

export function MobileJobs() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Cloned per mount, so runtime mutations (mark completed / delete / create)
     never leak into the next mount. */
  const [data, setData] = useState<Job[]>(() =>
    JOBS_SEED.map((j) => ({ ...j, crew: [...j.crew] })),
  );
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---- new-job form ---- */
  const [form, setForm] = useState({ title: "", client: "", start: "", end: "", crew: "" });
  const [draftStatus, setDraftStatus] = useState<JobStatus>("SCHEDULED");
  const [titleErr, setTitleErr] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const createdRef = useRef(0);

  const filterRef = useRef<HTMLDivElement>(null);

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
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.jmenuItem,
      styles.sheetCancel, styles.jopen, styles.fsegBtn,
      styles.jemptyA, styles.srchX,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what THIS PAGE owns ---------------------------
     The drawer is not listed: MobileNav handles its own Escape, and it only
     binds while open, so the two listeners cannot both claim one key press. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (newOpen) setNewOpen(false);
      else if (sheetId) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, newOpen, sheetId]);

  /* ---------- Filter dropdown: close on outside pointerdown ------------ */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the board ----------------
     In an effect, not the click handler: the ref must not be read during
     render, and the scroll belongs to the page CHANGE. First run skipped so
     mounting doesn't scroll. */
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [page]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived -------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((j) => matchesStatus(j, status) && matchesQuery(j, query)),
    [data, status, query],
  );

  /* Masthead: one numeral + EXACTLY two annotations, all three computed, so
     completing / deleting / creating a job moves them. */
  const openCount = useMemo(
    () => data.filter((j) => OPEN_STATUSES.includes(j.status)).length,
    [data],
  );
  const todayCount = useMemo(() => data.filter((j) => j.rel === "today").length, [data]);
  const unschedCount = useMemo(
    () => data.filter((j) => !j.start && OPEN_STATUSES.includes(j.status)).length,
    [data],
  );

  const activeFilter = STATUS_FILTERS.find((f) => f.key === status) ?? STATUS_FILTERS[0];

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetJob = sheetId === null ? null : (data.find((j) => j.id === sheetId) ?? null);

  /* The clients already on the board, offered as suggestions on the Client
     field — this fixture is the only client list the page has. */
  const clientNames = useMemo(() => {
    const seen: string[] = [];
    data.forEach((j) => {
      if (j.client && !seen.includes(j.client)) seen.push(j.client);
    });
    return seen.sort();
  }, [data]);

  const resetFilters = () => {
    setStatus("ALL");
    setQuery("");
    setPage(1);
  };

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const j = sheetJob;
    if (!j) return [];
    const filed = j.status === "COMPLETED" || j.status === "CANCELED";
    return [
      { act: "open", icon: "i-jobs", tone: styles.jmiBp, title: "Open job", sub: "Full record, crew and photos" },
      {
        act: "msg", icon: "i-msg", tone: styles.jmiSky, title: "Message client",
        sub: j.client ?? "No client on this job", disabled: !j.client,
      },
      { act: "dir", icon: "i-pin", tone: styles.jmiWarn, title: "Get directions", sub: `${siteOf(j.title)} — open in maps` },
      {
        act: "done", icon: "i-check", tone: styles.jmiOk,
        title: filed ? "Already filed" : "Mark completed",
        sub: filed ? `Job is ${statusLabel(j.status).toLowerCase()}` : "Files it and frees the crew",
        disabled: filed,
      },
      {
        act: "crew", icon: "i-userplus", title: "Assign crew",
        sub: j.crew.length ? j.crew.join(", ") : "Nobody dispatched yet",
      },
      { act: "del", icon: "i-trash", tone: styles.jmiDanger, title: "Delete job", sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetJob]);

  const runMenu = (act: string) => {
    const j = sheetJob;
    setSheetId(null);
    if (!j) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== j.id));
      setPage(1);
    } else if (act === "done") {
      setData((prev) =>
        prev.map((x) => (x.id === j.id ? { ...x, status: "COMPLETED", rel: x.start ? "today" : null } : x)),
      );
      setLandedId(j.id);
    }
  };

  /* ---------- new-job form --------------------------------------------- */
  const openNew = () => {
    setForm({ title: "", client: "", start: "", end: "", crew: "" });
    setDraftStatus("SCHEDULED");
    setTitleErr(false);
    setNewOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => titleRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    createdRef.current += 1;
    const rec: Job = {
      id: `jn${createdRef.current}`,
      title,
      client: form.client.trim() || null,
      status: draftStatus,
      start: longDate(form.start),
      end: longDate(form.end),
      rel: relLabel(form.start),
      crew: form.crew.split(",").map((n) => n.trim()).filter(Boolean),
    };
    setData((prev) => [rec, ...prev]);
    // Drop back to the whole board, so a job created while a status filter was
    // active is actually visible — it lands in the first row.
    resetFilters();
    setNewOpen(false);
    setLandedId(rec.id);
  };

  const anyOverlay = Boolean(sheetJob) || newOpen;

  // Swipe-down dismissal, one gesture per sheet, wired to the close paths the
  // scrim and Cancel already use.
  const actionsDrag = useSheetDrag(Boolean(sheetJob), () => setSheetId(null));
  const newDrag = useSheetDrag(newOpen, () => setNewOpen(false));
  const sheetSchedule = sheetJob ? scheduleLabel(sheetJob) : null;

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD — the only primary action the desktop sheet has, and no
              floating action button: primary actions live in the head. */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Delivery</div>
            <h1 className={styles.pageTitle}>Jobs</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New job
              </button>
            </div>
          </div>

          {/* MASTHEAD */}
          <div className={styles.jmast}>
            <div className={styles.jmastTop}>
              <div className={styles.jmastLbl}>
                Open jobs
                <span className={styles.jmastRule} />
              </div>
              <CountUp value={openCount} className={styles.jmastVal} />
            </div>
            <div className={styles.jmastCnt}>
              <div className={styles.jmastSub}>
                <div className={styles.jmastSubL}>On site today</div>
                <div className={styles.jmastSubV}>{todayCount}</div>
              </div>
              <div className={styles.jmastSub}>
                <div className={styles.jmastSubL}>Unscheduled</div>
                <div className={styles.jmastSubV}>{unschedCount}</div>
              </div>
            </div>
          </div>

          {/* FIND BAR — search + the status filter as one dropdown */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search job, client, site or crew…"
                autoComplete="off"
                aria-label="Search jobs"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              {query ? (
                <button className={styles.srchX} type="button" aria-label="Clear search"
                  onClick={() => { setQuery(""); setPage(1); }}>
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>

            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
                aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                <Icon id="i-filter" />
                Filter
                <span className={styles.ddValue} data-s={status}>
                  {activeFilter.label} · {statusCount(data, status)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key} className={`${styles.ddItem} ${status === f.key ? styles.active : ""}`}
                    type="button" role="option" aria-selected={status === f.key}
                    onClick={() => { setStatus(f.key); setPage(1); setFilterOpen(false); }}>
                    {f.label}
                    <span className={styles.ddCount}>{statusCount(data, f.key)}</span>
                    {status === f.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* BOARD */}
          {visible.length === 0 ? (
            <div className={styles.jempty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.jemptyT}>No jobs yet</div>
                  <div className={styles.jemptyS}>
                    Accept a proposal in the client portal and a job appears here automatically.
                  </div>
                  <button className={styles.jemptyA} type="button" onClick={openNew}>
                    <Icon id="i-plus" />New job
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.jemptyT}>No matches</div>
                  <div className={styles.jemptyS}>No job matches that search and status filter.</div>
                  <button className={styles.jemptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.board}>
              {slice.map((j, i) => {
                const sched = scheduleLabel(j);
                const shown = j.crew.slice(0, CREW_SHOWN);
                const extra = j.crew.length - shown.length;
                return (
                  <div
                    key={j.id}
                    className={`${styles.jrow} ${styles.rowIn} ${landedId === j.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    {/* line 1 — identity, and the actions button at the FAR RIGHT */}
                    <span
                      className={`${styles.jav} ${j.client ? "" : styles.isNone}`}
                      aria-hidden="true"
                    >
                      {j.client ? initials(j.client) : "—"}
                    </span>
                    <div className={styles.jtitle}>{j.title}</div>
                    <button className={styles.jopen} type="button"
                      aria-label={`Actions for ${j.title}`} onClick={() => setSheetId(j.id)}>
                      <Icon id="i-dots" />
                    </button>

                    {/* line 2 — who and when, in mono */}
                    <div className={styles.jmeta}>
                      {j.client ? j.client : <span className={styles.jmetaDim}>No client</span>}
                      {" · "}
                      {sched ? sched : <span className={styles.jmetaDim}>Unscheduled</span>}
                    </div>

                    {/* line 3 — status badge FIRST, crew at the far right */}
                    <div className={styles.jfoot}>
                      <span className={`${styles.jstatus} ${STATUS_CLASS[j.status]}`}>
                        {statusLabel(j.status)}
                      </span>
                      {j.rel ? (
                        <span className={`${styles.jrel} ${j.rel === "today" ? styles.jrelNow : ""}`}>
                          {j.rel}
                        </span>
                      ) : null}
                      <span
                        className={styles.jcrew}
                        aria-label={j.crew.length ? `Crew: ${j.crew.join(", ")}` : "No crew assigned"}
                      >
                        {j.crew.length ? (
                          <>
                            {shown.map((n) => (
                              <span className={styles.jpip} key={n} title={n}>{initials(n)}</span>
                            ))}
                            {extra > 0 ? <span className={styles.jpipMore}>+{extra}</span> : null}
                          </>
                        ) : (
                          <span className={styles.jcrewNone} aria-hidden="true">—</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PAGER */}
          {visible.length > PAGE_SIZE ? (
            <div className={styles.pager}>
              <button className={styles.pagerBtn} type="button" disabled={safePage <= 1}
                onClick={() => setPage(Math.max(1, safePage - 1))}>
                <Icon id="i-chevl" />Prev
              </button>
              <button className={styles.pagerBtn} type="button" disabled={safePage >= pages}
                onClick={() => setPage(Math.min(pages, safePage + 1))}>
                Next<Icon id="i-chevr" />
              </button>
              <span className={styles.pagerInfo}>{safePage} / {pages}</span>
            </div>
          ) : null}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setNewOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetJob ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Job actions" aria-hidden={!sheetJob} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetJob
              ? `${statusLabel(sheetJob.status)} · ${sheetSchedule ?? "unscheduled"} · ${
                  sheetJob.crew.length ? `${sheetJob.crew.length} crew` : "no crew"
                }`
              : "Job · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetJob?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.jmenuItem} ${r.danger ? styles.jmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.jmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.jmenuItemT}>{r.title}</span>
                <span className={styles.jmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ NEW JOB SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mjNewTitle" aria-hidden={!newOpen} {...newDrag.sheetProps}>
        <div className={styles.sheetGrab} {...newDrag.handleProps} />
        <div className={styles.sheetHead} {...newDrag.handleProps}>
          <div className={styles.sheetKicker}>Delivery / new record</div>
          <div className={styles.sheetTitle} id="mjNewTitle">New job</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mjNewForm" noValidate onSubmit={submitNew}>
          <div className={`${styles.fld} ${titleErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mjTitle">
              Job<span className={styles.req}>*</span>
            </label>
            <input ref={titleRef} className={styles.pinput} id="mjTitle" name="title" type="text"
              placeholder="Cedar fence — 902 Alder Ct" autoComplete="off" value={form.title}
              aria-invalid={titleErr} aria-describedby={titleErr ? "mjTitleErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, title: e.target.value }));
                if (e.target.value.trim()) setTitleErr(false);
              }} />
            {titleErr ? <span className={styles.fldErr} id="mjTitleErr">Enter what the job is</span> : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mjClient">Client</label>
            <input className={styles.pinput} id="mjClient" name="client" type="text"
              placeholder="D. Reyes" autoComplete="off" list="mjClientList" value={form.client}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} />
            {/* The clients already on the board, offered as suggestions */}
            <datalist id="mjClientList">
              {clientNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Status</span>
            {/* The page's own status vocabulary, so the state a job starts in is
                picked from the same tones it is filtered by. */}
            <div className={styles.fseg} role="group" aria-label="Job status">
              {STATUS_FILTERS.filter((f) => f.key !== "ALL").map((f) => {
                const on = draftStatus === f.key;
                return (
                  <button key={f.key} className={`${styles.fsegBtn} ${on ? styles.fsegOn : ""}`}
                    type="button" data-v={f.key} aria-pressed={on}
                    onClick={() => setDraftStatus(f.key as JobStatus)}>
                    <span className={styles.fsegDot} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mjStart">Starts</label>
              <input className={styles.pinput} id="mjStart" name="start" type="date" value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
            </div>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mjEnd">Ends</label>
              <input className={styles.pinput} id="mjEnd" name="end" type="date" value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
            </div>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mjCrew">Crew</label>
            <input className={styles.pinput} id="mjCrew" name="crew" type="text"
              placeholder="Marcus B., Dan K." autoComplete="off" value={form.crew}
              onChange={(e) => setForm((f) => ({ ...f, crew: e.target.value }))} />
            <span className={styles.fldHint}>
              Comma-separated — leave empty to dispatch later.
            </span>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mjNewForm">
            <Icon id="i-check" />Create job
          </button>
        </div>
      </div>
    </div>
  );
}
