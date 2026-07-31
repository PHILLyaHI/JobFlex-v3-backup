"use client";

// MOBILE PROJECTS (mobile-projects-v2) — Blueprint system, handheld build.
//
// Fourth surface in the handheld family. Tokens, palette, type scale, status
// tones and Motion System "Balanced" are the reference dashboard's; the shell
// (dark topbar + hamburger drawer) is the shared <MobileNav />, so this page and
// its three siblings are one product.
//
// Every component / region / variant of the desktop projects sheet is covered:
//  · page head — "Delivery" kicker, Projects H1, the New-project action
//  · computed masthead (one numeral + mono kicker + EXACTLY two annotations)
//  · the status chip rail, re-cut as ONE dropdown (a chip rail cannot survive
//    320px), with two further real states added: Unscheduled and Not started
//  · the project CARD (name, scope, status, jobs, budget, window, progress bar,
//    "x of y complete · due z"), re-cut as a row card with a drawn progress rule
//  · all three status badges — active / on hold / completed, in the desktop's
//    own three tones
//  · the 0% and 100% progress colourways, and the no-dates record
//  · pager, and BOTH empty states (nothing yet / no matches)
//  · the create dialog as a bottom sheet: required-field validation, the
//    segmented status picker with its three status dots, the paired date row
//  · a row-actions sheet: 6 tonal boxes, two disabled states driven by real
//    fixture data, one danger row
//
// What changes versus the desktop sheet, and why:
//  · The 2-up card grid becomes one column of row cards separated by a real
//    1.5px ink rule. A card grid at 320px is a column of tall boxes with three
//    stacked stat cells inside them; the row card puts the same six figures on
//    three lines and gets four records on screen instead of one and a half.
//  · The scope paragraph leaves the row and lands in the actions sheet head.
//    Ninety characters of description is three lines at 320px, and it changes no
//    decision while scanning — the same reason "updated" left the proposals and
//    clients rows.
//  · A search box is added: name, scope and status all answer it. It filters the
//    same fixture client-side, no new endpoint.
//  · The centre-screen create dialog becomes a bottom sheet (CLAUDE.md prefers
//    sheets, and there is no hover on touch).
//  · Page size: the desktop grid shows all eight, this pages six.
//
// Content is the desktop demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-projects.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  FILTERS,
  PAGE_SIZE,
  PROJECTS_SEED,
  STATUSES,
  filterCount,
  matchesFilter,
  matchesQuery,
  progress,
  shortDate,
  statusLabel,
  windowLabel,
  type FilterKey,
  type Project,
} from "./projects-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Status → its badge tone class. The desktop's three tones, verbatim. */
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: styles.pjsActive,
  ON_HOLD: styles.pjsOnHold,
  COMPLETED: styles.pjsCompleted,
};

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

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

export function MobileProjects() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* A per-mount COPY of the fixture: the sheet and the create form mutate this
     array, and the seed is a module-level constant — mutating it directly would
     leak every change into the next visit to the page. */
  const [data, setData] = useState<Project[]>(() => PROJECTS_SEED.map((p) => ({ ...p })));
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---- new-project form ---- */
  const [form, setForm] = useState({ name: "", scope: "", starts: "", ends: "", budget: "" });
  const [draftStatus, setDraftStatus] = useState<string>(STATUSES[0]);
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const created = useRef(0);

  const filterRef = useRef<HTMLDivElement>(null);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather than
     trusting a bare 100vh/100dvh. This is the React form of the donor's FLUID
     SCALE module — no root zoom, since the composition here is already the
     handheld one. */
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
    const sel = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.pmenuItem,
      styles.sheetCancel, styles.pjOpen, styles.pjemptyA, styles.srchX, styles.fsegBtn,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever the PAGE owns, topmost first ----------
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

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the list -----------------
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

  /* ---------- derived ------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((p) => matchesFilter(p, filter) && matchesQuery(p, query)),
    [data, filter, query],
  );

  /* Masthead: one numeral, a short mono kicker, EXACTLY two annotations — all
     three computed, so completing or deleting a project moves them. */
  const activeBudget = useMemo(
    () => data.reduce((a, p) => (p.status === "ACTIVE" ? a + p.budget : a), 0),
    [data],
  );
  const jobs = useMemo(
    () =>
      data.reduce(
        (a, p) => ({ done: a.done + p.completedJobs, total: a.total + p.jobCount }),
        { done: 0, total: 0 },
      ),
    [data],
  );

  const activeOption = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetProject = sheetId === null ? null : (data.find((p) => p.id === sheetId) ?? null);

  const resetFilters = () => {
    setFilter("ALL");
    setQuery("");
    setPage(1);
  };

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const p = sheetProject;
    if (!p) return [];
    const done = p.status === "COMPLETED";
    const held = p.status === "ON_HOLD";
    const scheduled = Boolean(p.startsAt && p.endsAt);
    return [
      { act: "open", icon: "i-folder", tone: styles.pmiBp, title: "Open project",
        sub: "Jobs, budget and files" },
      { act: "jobs", icon: "i-jobs", tone: styles.pmiSky, title: "View jobs",
        sub: p.jobCount ? `${p.jobCount} jobs · ${p.completedJobs} complete` : "No jobs attached yet",
        disabled: p.jobCount === 0 },
      { act: "sched", icon: "i-cal", tone: styles.pmiWarn, title: "Open schedule",
        sub: scheduled ? `${p.startsAt} → ${p.endsAt}` : "No dates set on project",
        disabled: !scheduled },
      { act: "done", icon: "i-check", tone: styles.pmiOk,
        title: done ? "Already filed" : "Mark completed",
        sub: done ? `Closed out ${p.endsAt ?? "—"}` : `Closes out all ${p.jobCount} jobs`,
        disabled: done },
      { act: "hold", icon: "i-rotate",
        title: held ? "Resume project" : "Put on hold",
        sub: held ? "Back to active work" : "Pauses scheduling and reminders" },
      { act: "del", icon: "i-trash", tone: styles.pmiDanger, title: "Delete project",
        sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetProject]);

  const runMenu = (act: string) => {
    const p = sheetProject;
    setSheetId(null);
    if (!p) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== p.id));
      setPage(1);
    } else if (act === "done") {
      setData((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, status: "COMPLETED", completedJobs: x.jobCount } : x,
        ),
      );
      setLandedId(p.id);
    } else if (act === "hold") {
      setData((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, status: x.status === "ON_HOLD" ? "ACTIVE" : "ON_HOLD" } : x,
        ),
      );
      setLandedId(p.id);
    }
  };

  /* ---------- new-project form ----------------------------------------- */
  const openNew = () => {
    setForm({ name: "", scope: "", starts: "", ends: "", budget: "" });
    setDraftStatus(STATUSES[0]);
    setNameErr(false);
    setNewOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the keyboard
    // fight the animation.
    window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    created.current += 1;
    const rec: Project = {
      id: `pn${created.current}`,
      name,
      description: form.scope.trim() || null,
      status: draftStatus,
      startsAt: shortDate(form.starts),
      endsAt: shortDate(form.ends),
      budget: Math.round(Number(form.budget.replace(/[^\d.]/g, "")) || 0),
      jobCount: 0,
      completedJobs: 0,
    };
    setData((prev) => [rec, ...prev]);
    // Drop back to All, so a project created while a filter was active is
    // actually visible — it lands first in the list.
    resetFilters();
    setNewOpen(false);
    setLandedId(rec.id);
  };

  const anyOverlay = Boolean(sheetProject) || newOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const actionsDrag = useSheetDrag(Boolean(sheetProject), () => setSheetId(null));
  const newDrag = useSheetDrag(newOpen, () => setNewOpen(false));

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
            <div className={styles.kicker}>Delivery</div>
            <h1 className={styles.pageTitle}>Projects</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New project
              </button>
            </div>
          </div>

          {/* MASTHEAD */}
          <div className={styles.pmast}>
            <div className={styles.pmastTop}>
              <div className={styles.pmastLbl}>
                Active budget
                <span className={styles.pmastRule} />
              </div>
              <CountUp value={activeBudget} className={styles.pmastVal} />
            </div>
            <div className={styles.pmastCnt}>
              <div className={styles.pmastSub}>
                <div className={styles.pmastSubL}>Projects</div>
                <div className={styles.pmastSubV}>{data.length}</div>
              </div>
              <div className={styles.pmastSub}>
                <div className={styles.pmastSubL}>Jobs done</div>
                <div className={styles.pmastSubV}>{jobs.done} / {jobs.total}</div>
              </div>
            </div>
          </div>

          {/* FIND BAR — search + status filter */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search name, scope or status…"
                autoComplete="off"
                aria-label="Search projects"
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
                <span className={styles.ddValue} data-f={filter}>
                  {activeOption.label} · {filterCount(data, filter)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {FILTERS.map((f) => (
                  <button key={f.key} className={`${styles.ddItem} ${filter === f.key ? styles.active : ""}`}
                    type="button" role="option" aria-selected={filter === f.key}
                    onClick={() => { setFilter(f.key); setPage(1); setFilterOpen(false); }}>
                    {f.label}
                    <span className={styles.ddCount}>{filterCount(data, f.key)}</span>
                    {filter === f.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PROJECT LIST */}
          {visible.length === 0 ? (
            <div className={styles.pjempty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.pjemptyT}>No projects yet</div>
                  <div className={styles.pjemptyS}>
                    Bundle related jobs together to track multi-phase builds and shared budgets.
                  </div>
                  <button className={styles.pjemptyA} type="button" onClick={openNew}>
                    <Icon id="i-plus" />New project
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.pjemptyT}>No matches</div>
                  <div className={styles.pjemptyS}>No project matches that search and filter.</div>
                  <button className={styles.pjemptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.book}>
              {slice.map((p, i) => {
                const pct = progress(p);
                const done = pct >= 100;
                /* --pw / --pd drive the progress rule: the fill is drawn from
                   zero after the row has landed. Custom properties inherit, so
                   declaring them on the row reaches the fill inside it. */
                const rowStyle = {
                  animationDelay: `${i * 45}ms`,
                  "--pw": `${pct}%`,
                  "--pd": `${i * 45 + 140}ms`,
                } as React.CSSProperties;
                return (
                  <div
                    key={p.id}
                    className={`${styles.pjrow} ${styles.rowIn} ${landedId === p.id ? styles.landed : ""}`}
                    style={rowStyle}
                  >
                    {/* Row 1 — the drawing annotation (delivery window + job
                        tally) as a KICKER over the name. DOM order follows the
                        visual order so a screen reader hears the dateline
                        before the project it belongs to, same as the eye. */}
                    <div className={styles.pjMeta}>{windowLabel(p)}</div>
                    {/* Row 2 — identity, actions hard right */}
                    <div className={styles.pjName}>{p.name}</div>
                    <button className={styles.pjOpen} type="button"
                      aria-label={`Actions for ${p.name}`} onClick={() => setSheetId(p.id)}>
                      <Icon id="i-dots" />
                    </button>
                    {/* Row 3 — badge leads, the figures close at the far right */}
                    <div className={styles.pjFoot}>
                      <span className={`${styles.pjstatus} ${STATUS_CLASS[p.status] ?? ""}`}>
                        {statusLabel(p.status)}
                      </span>
                      <span className={styles.pjFigs}>
                        <span className={`${styles.pjPct} ${done ? styles.isDone : ""}`}>{pct}%</span>
                        <span className={`${styles.pjMoney} ${p.budget ? "" : styles.isZero}`}>
                          {p.budget ? money(p.budget) : "—"}
                        </span>
                      </span>
                    </div>
                    {/* Row 4 — the progress rule. A drawn line, not a fourth
                        text line: it belongs to the figures above it. */}
                    <div className={styles.pjTrack}>
                      <span className={`${styles.pjFill} ${done ? styles.isDone : ""}`} />
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

      {/* No floating action button: the primary action lives in the page head,
          so nothing needs to hover over the content. */}

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setNewOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetProject ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Project actions" aria-hidden={!sheetProject} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetProject
              ? `${statusLabel(sheetProject.status)} · ${sheetProject.jobCount} jobs · ${sheetProject.budget ? money(sheetProject.budget) : "no budget set"}`
              : "Project · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetProject?.name ?? "Actions"}</div>
          {/* The desktop card's scope paragraph lives here rather than on the
              row. One record has none, so the absence has its own line. */}
          <div className={styles.sheetSub}>
            {sheetProject?.description ?? "No scope noted on this project."}
          </div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.pmenuItem} ${r.danger ? styles.pmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.pmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.pmenuItemT}>{r.title}</span>
                <span className={styles.pmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ NEW PROJECT SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mpNewTitle" aria-hidden={!newOpen} {...newDrag.sheetProps}>
        <div className={styles.sheetGrab} {...newDrag.handleProps} />
        <div className={styles.sheetHead} {...newDrag.handleProps}>
          <div className={styles.sheetKicker}>Delivery / new record</div>
          <div className={styles.sheetTitle} id="mpNewTitle">New project</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mpNewForm" noValidate onSubmit={submitNew}>
          <div className={`${styles.fld} ${nameErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mpName">
              Project name<span className={styles.req}>*</span>
            </label>
            <input ref={nameRef} className={styles.pinput} id="mpName" name="name" type="text"
              placeholder="Willow Park fencing" autoComplete="off" value={form.name}
              aria-invalid={nameErr} aria-describedby={nameErr ? "mpNameErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (e.target.value.trim()) setNameErr(false);
              }} />
            {nameErr ? <span className={styles.fldErr} id="mpNameErr">Enter a project name</span> : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mpScope">Scope</label>
            <textarea className={`${styles.pinput} ${styles.ptextarea}`} id="mpScope" name="scope"
              placeholder="Cedar privacy fencing for eight lots, shared materials drop."
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} />
            <span className={styles.fldHint}>
              Shown when you open the project&apos;s actions, not on the list row.
            </span>
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Status</span>
            <div className={styles.fseg} role="group" aria-label="Project status">
              {STATUSES.map((s) => (
                <button key={s} className={`${styles.fsegBtn} ${draftStatus === s ? styles.on : ""}`}
                  type="button" data-v={s} aria-pressed={draftStatus === s}
                  onClick={() => setDraftStatus(s)}>
                  <span className={styles.fsegDot} />
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.mdlRow}>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mpStart">Starts</label>
              <input className={styles.pinput} id="mpStart" name="startsAt" type="date"
                value={form.starts}
                onChange={(e) => setForm((f) => ({ ...f, starts: e.target.value }))} />
            </div>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mpEnd">Ends</label>
              <input className={styles.pinput} id="mpEnd" name="endsAt" type="date"
                value={form.ends}
                onChange={(e) => setForm((f) => ({ ...f, ends: e.target.value }))} />
            </div>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mpBudget">Budget</label>
            <input className={styles.pinput} id="mpBudget" name="budget" type="text"
              inputMode="numeric" placeholder="74,300" autoComplete="off" value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
            <span className={styles.fldHint}>Leave it blank and the figure reads as a dash.</span>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mpNewForm">
            <Icon id="i-check" />Create project
          </button>
        </div>
      </div>
    </div>
  );
}

/* The SVG sprite is the shared one — <MobileNav /> renders it, and this page
   references only ids that already exist there: i-plus, i-search, i-x, i-filter,
   i-chev, i-check, i-dots, i-chevl, i-chevr, i-folder, i-jobs, i-cal, i-rotate,
   i-trash. No page-local symbols were needed. */
