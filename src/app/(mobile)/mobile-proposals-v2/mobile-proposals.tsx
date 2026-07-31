"use client";

// MOBILE PROPOSALS (mobile-proposals-v2) — Blueprint system, handheld build.
//
// Ported from the scratchpad donor jobflex-proposals-mobile-blueprint.html.
// Tokens, palette, type scale, status tones and Motion System "Balanced" are
// the reference dashboard's; the proposals vocabulary (masthead, dossier
// cards, tear-sheets, tonal menu boxes, stamp buttons) follows
// design-system.md → "Proposals page patterns".
//
// Every component / tab / view / variant of the desktop page is covered:
//  · 3 tabs (All / Accepted / Completed) with live counts + sliding rule
//  · masthead: one numeral per tab, mono kicker, EXACTLY two annotations
//  · 6 filter chips, each inheriting its status badge tones when active
//  · all 7 status badges (Draft/Sent/Viewed/Accepted/Declined/Expired/Paid)
//  · ledger rows, contract dossiers, completion tear-sheets
//  · BOTH payment variants: ≤5 instalments → columns, 6+ → row table
//  · row actions sheet: 5 tonal icon boxes + a disabled and a danger item
//  · pagers, empty states, and the mutating actions behind them
//
// What changes versus the desktop sheet, and why:
//  · The 7-column table cannot survive 320px, so each record becomes a row
//    card — not a table with columns hidden.
//  · The "⋮" popover becomes a bottom sheet (no hover, and CLAUDE.md prefers
//    sheets over modals on mobile).
//  · Page sizes drop (6/2/1 vs 8/3/2): phone rows are taller, and density
//    falls along the funnel.
//
// Content is the donor demo fixture by design: the data layer is out of
// scope until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-proposals.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  FILTERS,
  OPEN_STATUSES,
  PAGE_ACC,
  PAGE_ALL,
  PAGE_DONE,
  PROPOSALS_SEED,
  PSTATUS,
  TABS,
  instDollars,
  sumOf,
  type FilterKey,
  type Proposal,
  type TabKey,
} from "./proposals-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

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

function Pager({
  page,
  total,
  per,
  onGo,
}: {
  page: number;
  total: number;
  per: number;
  onGo: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (total <= per) return null;
  return (
    <div className={styles.pager}>
      <button
        className={styles.pagerBtn}
        type="button"
        disabled={page <= 1}
        onClick={() => onGo(Math.max(1, page - 1))}
      >
        <Icon id="i-chevl" />
        Prev
      </button>
      <button
        className={styles.pagerBtn}
        type="button"
        disabled={page >= pages}
        onClick={() => onGo(Math.min(pages, page + 1))}
      >
        Next
        <Icon id="i-chevr" />
      </button>
      <span className={styles.pagerInfo}>
        {page} / {pages}
      </span>
    </div>
  );
}

export function MobileProposals() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<Proposal[]>(() =>
    PROPOSALS_SEED.map((p) => ({ ...p, inst: p.inst ? p.inst.map((i) => ({ ...i })) : undefined })),
  );
  const [tab, setTab] = useState<TabKey>("all");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [pageAll, setPageAll] = useState(1);
  const [pageAcc, setPageAcc] = useState(1);
  const [pageDone, setPageDone] = useState(1);
  const [sheetId, setSheetId] = useState<number | null>(null);
  /* Derived from the URL, not held in state — the old label string only moved
     the highlight, which is why the drawer could never change pages. */
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  /* ---------- filter dropdown: close on outside tap / Esc ------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  /* ---------- viewport height + effective-width classes --------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL
     bar changes innerHeight mid-scroll, so the real value is republished
     rather than trusting a bare 100vh/100dvh. This is the React form of
     the donor's FLUID SCALE module — no root zoom, since the composition
     here is already the handheld one. */
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

  /* ---------- Motion: reveal on load + adaptive reveal on scroll ------ */
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

  /* ---------- Motion: graph-paper parallax --------------------------- */
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

  /* ---------- Motion: press stamp (delegated, covers late rows) ------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel = [
      styles.btn, styles.ptab, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.btnStamp,
      styles.pjobAct, styles.pmenuItem, styles.sheetCancel,
      styles.prowOpen, styles.pschedRem,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);


  /* ---------- Esc closes what the PAGE owns -----------------------------
     The drawer is no longer listed here: MobileNav handles its own Escape, and
     it only binds while open, so the two listeners cannot both claim one key
     press. The filter dropdown has its own handler for the same reason. */
  useEffect(() => {
    if (sheetId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetId]);

  /* ---------- derived lists ------------------------------------------ */
  const listAll = useMemo(
    () => (filter === "ALL" ? data : data.filter((p) => p.status === filter)),
    [data, filter],
  );
  const listAcc = useMemo(() => data.filter((p) => p.status === "ACCEPTED"), [data]);
  const listDone = useMemo(() => data.filter((p) => p.status === "PAID"), [data]);

  const counts = useMemo(
    () => ({ all: data.length, accepted: listAcc.length, completed: listDone.length }),
    [data.length, listAcc.length, listDone.length],
  );
  const chipCounts = useMemo(() => {
    const out: Record<string, number> = { ALL: data.length };
    FILTERS.forEach((f) => {
      if (f.key !== "ALL") out[f.key] = data.filter((p) => p.status === f.key).length;
    });
    return out;
  }, [data]);
  const activeFilterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "All";

  /* ---------- masthead: one numeral, mono kicker, TWO annotations ----- */
  const mast = useMemo(() => {
    if (tab === "all") {
      const open = data.filter((p) => OPEN_STATUSES.includes(p.status));
      const t = sumOf(open);
      return {
        kicker: "Pipeline value · open",
        value: t,
        good: false,
        a1: { l: "Proposals", v: String(open.length) },
        a2: { l: "Avg deal", v: money(open.length ? t / open.length : 0) },
      };
    }
    if (tab === "accepted") {
      const t = sumOf(listAcc);
      return {
        kicker: "Contracted · signed",
        value: t,
        good: false,
        a1: { l: "Contracts", v: String(listAcc.length) },
        a2: { l: "Avg value", v: money(listAcc.length ? t / listAcc.length : 0) },
      };
    }
    const t = sumOf(listDone);
    return {
      kicker: "Collected · paid",
      value: t,
      good: true,
      a1: { l: "Jobs filed", v: String(listDone.length) },
      a2: { l: "Avg value", v: money(listDone.length ? t / listDone.length : 0) },
    };
  }, [tab, data, listAcc, listDone]);

  /* ---------- paging returns you to the top of the list ---------------
     Done in an effect rather than in the click handler: the ref must not
     be read during render, and the scroll belongs to the page CHANGE, not
     to the button. The first run is skipped so mounting doesn't scroll. */
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pageAll, pageAcc, pageDone]);

  /* ---------- mutating actions --------------------------------------- */
  const resetPages = () => {
    setPageAll(1);
    setPageAcc(1);
    setPageDone(1);
  };
  const patch = (id: number, fn: (p: Proposal) => Proposal) => {
    setData((prev) => prev.map((p) => (p.id === id ? fn({ ...p }) : p)));
    resetPages();
  };
  const flash = (el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    el.classList.remove(styles.flashOk);
    void el.offsetWidth;
    el.classList.add(styles.flashOk);
    el.addEventListener("animationend", () => el.classList.remove(styles.flashOk), { once: true });
  };

  const sheetProposal = sheetId === null ? null : (data.find((p) => p.id === sheetId) ?? null);

  // Swipe-down dismissal, on the same close path as Escape and the scrim.
  const sheetDrag = useSheetDrag(sheetProposal !== null, () => setSheetId(null));

  const menuRows = useMemo<MenuRow[]>(() => {
    const p = sheetProposal;
    if (!p) return [];
    const isDraft = p.status === "DRAFT";
    const isAcc = p.status === "ACCEPTED";
    return [
      { act: "open", icon: "i-file", tone: styles.pmiBp, title: "Open proposal", sub: "View the full document" },
      { act: "dup", icon: "i-copy", title: "Duplicate", sub: "Copy into a new draft" },
      { act: "remind", icon: "i-send", tone: styles.pmiSky, title: "Send reminder",
        sub: isDraft ? "Draft — nothing sent yet" : "Nudge the client by email", disabled: isDraft },
      { act: "accept", icon: "i-check", tone: styles.pmiOk,
        title: isAcc ? "Already accepted" : "Mark accepted",
        sub: isAcc ? `Signed ${p.accepted ?? ""}` : "Move it into contracts", disabled: isAcc },
      { act: "dir", icon: "i-pin", tone: styles.pmiWarn, title: "Get directions",
        sub: p.addr ? `${p.city} — open in maps` : "No address on client", disabled: !p.addr },
      { act: "del", icon: "i-trash", tone: styles.pmiDanger, title: "Delete", sub: "Remove permanently", danger: true },
    ];
  }, [sheetProposal]);

  const runMenu = (act: string) => {
    const p = sheetProposal;
    setSheetId(null);
    if (!p) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== p.id));
      resetPages();
    } else if (act === "dup") {
      setData((prev) => [
        { ...p, id: p.id + 1000, status: "DRAFT", views: 0, updated: "now", accepted: undefined, paid: undefined, inst: undefined },
        ...prev,
      ]);
      resetPages();
    } else if (act === "accept") {
      patch(p.id, (x) => ({
        ...x,
        status: "ACCEPTED",
        accepted: "TODAY",
        inst: x.inst ?? [
          { label: "Deposit", due: null, amount: 50, pct: true },
          { label: "Final on completion", due: null, amount: 50, pct: true },
        ],
      }));
    }
  };

  const sliceAll = listAll.slice((pageAll - 1) * PAGE_ALL, pageAll * PAGE_ALL);
  const sliceAcc = listAcc.slice((pageAcc - 1) * PAGE_ACC, pageAcc * PAGE_ACC);
  const sliceDone = listDone.slice((pageDone - 1) * PAGE_DONE, pageDone * PAGE_DONE);
  const tabIndex = TABS.findIndex((t) => t.key === tab);

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
            <div className={styles.kicker}>Sales · Documents</div>
            <h1 className={styles.pageTitle}>Proposals</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button">
                <Icon id="i-bulb" />Smart Proposal
              </button>
              <button className={`${styles.btn} ${styles.btnGhost}`} type="button">
                <Icon id="i-file" />Manual proposal
              </button>
            </div>
          </div>

          {/* MASTHEAD — key on tab so the 320ms slide-in replays */}
          <div className={`${styles.pmast} ${styles.slide}`} key={tab}>
            <div className={styles.pmastTop}>
              <div className={styles.pmastLbl}>
                {mast.kicker}
                <span className={styles.pmastRule} />
              </div>
              <CountUp value={mast.value} className={`${styles.pmastVal} ${mast.good ? styles.isGood : ""}`} />
            </div>
            <div className={styles.pmastCnt}>
              {[mast.a1, mast.a2].map((a) => (
                <div className={styles.pmastSub} key={a.l}>
                  <div className={styles.pmastSubL}>{a.l}</div>
                  <div className={styles.pmastSubV}>{a.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* TABS */}
          <div className={styles.ptabs}>
            <span className={styles.ptabInd} style={{ transform: `translateX(${tabIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button key={t.key} className={`${styles.ptab} ${tab === t.key ? styles.active : ""}`}
                type="button" aria-current={tab === t.key ? "page" : undefined} onClick={() => setTab(t.key)}>
                {t.label}
                <span className={styles.ptabCount}>{counts[t.key]}</span>
              </button>
            ))}
          </div>

          {/* ============ TAB: ALL ============ */}
          {tab === "all" && (
            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
                aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                <Icon id="i-filter" />
                Filter
                <span className={styles.ddValue} data-f={filter}>
                  {activeFilterLabel} · {chipCounts[filter] ?? 0}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {FILTERS.map((f) => (
                  <button key={f.key} className={`${styles.ddItem} ${filter === f.key ? styles.active : ""}`}
                    type="button" role="option" aria-selected={filter === f.key}
                    onClick={() => { setFilter(f.key); setPageAll(1); setFilterOpen(false); }}>
                    {f.label}
                    <span className={styles.ddCount}>{chipCounts[f.key] ?? 0}</span>
                    {filter === f.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "all" && (
            listAll.length === 0 ? (
              <div className={styles.pempty}>No proposals match this filter.</div>
            ) : (
              <div className={styles.pledger}>
                {sliceAll.map((p, i) => {
                  const st = PSTATUS[p.status];
                  return (
                    <div key={p.id} className={`${styles.prow} ${styles.rowIn}`} style={{ animationDelay: `${i * 45}ms` }}>
                      <div>
                        <div className={styles.prowId}>#{p.id} · {p.owner}</div>
                        <div className={styles.prowTitle}>{p.title}</div>
                      </div>
                      <button className={styles.prowOpen} type="button"
                        aria-label={`Actions for proposal ${p.id}`} onClick={() => setSheetId(p.id)}>
                        <Icon id="i-dots" />
                      </button>
                      {/* Row 2 — who and where, hard left */}
                      <div className={styles.prowWho}>
                        {p.client} · {p.city}
                      </div>
                      {/* Row 3 — badge leads, price closes at the far right.
                          "Updated" and the line-item count were dropped: they
                          added noise without changing any decision here. */}
                      <div className={styles.prowFoot}>
                        <span className={`${styles.pstatus} ${st.cls ? styles[st.cls] : ""}`}>{st.label}</span>
                        <span className={styles.prowMono}>{p.views} views</span>
                        <span className={styles.prowMoney}>{money(p.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
          {tab === "all" && (
            <Pager page={pageAll} total={listAll.length} per={PAGE_ALL} onGo={setPageAll} />
          )}

          {/* ============ TAB: ACCEPTED — contract dossiers ============ */}
          {tab === "accepted" && (
            listAcc.length === 0 ? (
              <div className={styles.pempty}>No accepted contracts yet — send a proposal to get one signed.</div>
            ) : (
              <div className={styles.pstack}>
                {sliceAcc.map((p, i) => {
                  const inst = p.inst ?? [];
                  return (
                    <div key={p.id} className={`${styles.pjob} ${styles.rowIn}`} style={{ animationDelay: `${i * 60}ms` }}>
                      <div className={styles.pjobHead}>
                        <div className={styles.pjobTitle}>{p.title}</div>
                        <div className={styles.pjobSub}>
                          <span>{p.client}</span><span>{p.city}</span><span>signed {p.accepted ?? "—"}</span>
                        </div>
                        <div className={styles.pjobTotal}>
                          <div className={styles.pjobTotalL}>Contract value</div>
                          <div className={styles.pjobTotalV}>{money(p.total)}</div>
                        </div>
                      </div>

                      {/* ≤5 instalments → columns; 6+ → row table with Remind */}
                      {inst.length <= 5 ? (
                        <div className={styles.pcols}>
                          {inst.map((it) => {
                            const sub = it.pct ? `${it.amount}% of total` : it.due ? `due ${it.due}` : "";
                            return (
                              <div className={styles.pcol} key={it.label}>
                                <div className={styles.pcolLbl}>{it.label}</div>
                                <div className={styles.pcolVal}>{money(instDollars(p, it))}</div>
                                {sub ? <div className={styles.pcolSub}>{sub}</div> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.psched}>
                          {inst.map((it) => (
                            <div className={styles.pschedRow} key={it.label}>
                              <div className={styles.pschedLbl}>{it.label}</div>
                              <div className={styles.pschedAmt}>{money(instDollars(p, it))}</div>
                              <div className={styles.pschedDue}>{it.due ? `due ${it.due}` : "on completion"}</div>
                              <button className={styles.pschedRem} type="button"
                                onClick={(e) => flash(e.currentTarget)}>Remind</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className={styles.pjobFoot}>
                        <button className={`${styles.pjobAct} ${styles.pjobActOk}`} type="button"
                          onClick={() => patch(p.id, (x) => ({ ...x, status: "PAID", paid: "TODAY" }))}>
                          <Icon id="i-check" />Mark completed
                        </button>
                        <button className={`${styles.pjobAct} ${styles.pjobActAccent}`} type="button"
                          onClick={(e) => flash(e.currentTarget)}>
                          <Icon id="i-card" />Request payment
                        </button>
                        <button className={styles.pjobAct} type="button" onClick={() => setSheetId(p.id)}>
                          <Icon id="i-dots" />More
                        </button>
                        <button className={styles.pjobAct} type="button"
                          onClick={() => patch(p.id, (x) => ({ ...x, status: "SENT", accepted: undefined, inst: undefined }))}>
                          <Icon id="i-rotate" />Un-accept
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
          {tab === "accepted" && (
            <Pager page={pageAcc} total={listAcc.length} per={PAGE_ACC} onGo={setPageAcc} />
          )}

          {/* ============ TAB: COMPLETED — tear-sheets ============ */}
          {tab === "completed" && (
            listDone.length === 0 ? (
              <div className={styles.pempty}>Nothing filed yet — completed jobs land here.</div>
            ) : (
              <div className={styles.psheets}>
                {sliceDone.map((p, i) => (
                  <div key={p.id} className={`${styles.psheet} ${styles.rowIn}`} style={{ animationDelay: `${i * 60}ms` }}>
                    <div className={styles.psheetHead}>
                      <div className={styles.psheetStamp}><Icon id="i-check" />Paid in full</div>
                      <div className={styles.pjobTitle}>{p.title}</div>
                      <div className={styles.pjobSub}>
                        <span>{p.client}</span><span>{p.city}</span><span>#{p.id}</span>
                      </div>
                    </div>

                    {/* Same .pcols/.pcol classes as Accepted — no parallel set */}
                    <div className={`${styles.pcols} ${styles.pcolsSheet}`}>
                      <div className={styles.pcol}>
                        <div className={styles.pcolLbl}>Contract</div>
                        <div className={styles.pcolVal}>{money(p.total)}</div>
                        <div className={styles.pcolSub}>{p.mat} line items</div>
                      </div>
                      <div className={styles.pcol}>
                        <div className={styles.pcolLbl}>Signed</div>
                        <div className={styles.pcolVal}>{p.accepted ?? "—"}</div>
                        <div className={styles.pcolSub}>{p.views} views</div>
                      </div>
                      <div className={styles.pcol}>
                        <div className={styles.pcolLbl}>Paid</div>
                        <div className={styles.pcolVal}>{p.paid ?? "—"}</div>
                        <div className={styles.pcolSub}>by {p.owner}</div>
                      </div>
                    </div>

                    <div className={styles.psheetBody}>
                      <div className={styles.psheetSecl}>Payment record</div>
                      {(p.inst ?? []).map((it) => (
                        <div className={styles.pchk} key={it.label}>
                          <span className={styles.pchkIc}><Icon id="i-check" /></span>
                          <span className={styles.pchkLbl}>{it.label}</span>
                          <span className={styles.pchkLead} />
                          <span className={styles.pchkAmt}>{money(instDollars(p, it))}</span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.psheetBody}>
                      <div className={styles.psheetSecl}>Completion photos</div>
                      <div className={styles.psheetPhotos}>
                        <div className={styles.photoBox}><Icon id="i-imgplus" />Before</div>
                        <div className={styles.photoBox}><Icon id="i-imgplus" />After</div>
                      </div>
                    </div>

                    <div className={styles.psheetFoot}>
                      <div className={styles.psheetBanklbl}>Send paid receipt to</div>
                      <div className={styles.psheetSend}>
                        <input className={styles.pinput} type="email" aria-label="Receipt email"
                          defaultValue={`${p.client.toLowerCase().replace(/[^a-z]/g, "")}@example.com`} />
                        <button className={`${styles.btnStamp} ${styles.btnStampAccent}`} type="button"
                          onClick={(e) => flash(e.currentTarget)}>
                          <Icon id="i-send" />Send receipt
                        </button>
                        <button className={styles.btnStamp} type="button" onClick={(e) => flash(e.currentTarget)}>
                          <Icon id="i-download" />PDF
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {tab === "completed" && (
            <Pager page={pageDone} total={listDone.length} per={PAGE_DONE} onGo={setPageDone} />
          )}
        </div>
      </main>

      {/* No floating action button: removed at the owner's call 2026-07-29.
          The two primary actions already live in the page head, so nothing
          needs to hover over the content. */}


      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.scrim} ${sheetProposal ? styles.on : ""}`} onClick={() => setSheetId(null)} aria-hidden="true" />
      <div className={`${styles.sheet} ${sheetProposal ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Proposal actions" aria-hidden={!sheetProposal} {...sheetDrag.sheetProps}>
        <div className={styles.sheetGrab} {...sheetDrag.handleProps} />
        <div className={styles.sheetHead} {...sheetDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetProposal ? `#${sheetProposal.id} · ${money(sheetProposal.total)}` : "Proposal · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetProposal?.title ?? "Actions"}</div>
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
    </div>
  );
}

/* ============================================================
   SVG SPRITE — line icons 24×24, stroke 2, currentColor. Only
   original lucide paths; i-bulb is the reference's hand-drawn
   "switched-on" bulb (Smart Proposal).
   ============================================================ */