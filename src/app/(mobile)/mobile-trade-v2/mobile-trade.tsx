"use client";

// MOBILE TRADE BOARD (mobile-trade-v2) — Blueprint system, handheld build.
//
// Thirteenth sibling of /mobile-v2. Tokens, palette, type scale and Motion
// System "Balanced" are the reference dashboard's; the topbar and hamburger
// drawer come from the shared <MobileNav />, so this surface is the same
// product as the twelve pages already shipping.
//
// This is the JOBS board and nothing else. The influencer half of the desktop
// donor — statements, payouts, the earnings masthead — is deliberately absent:
// that audience signs in through /influencer, which is gated by
// requireInfluencer() and runs real scoped queries. A contractor browsing for
// a gutter crew should never have to step past a creator payout table.
//
// The posting side of the desktop trade board (components/v3/trade-blueprint)
// is covered in full:
//  · page head (Community / Trade board) + the New-post action
//  · the five-chip category rail, as ONE dropdown with per-category counts
//  · the 330px post-card grid, re-cut as row cards with initials avatars
//  · OPEN / CLOSED state, the reply count, and the author + age line
//  · the empty state, plus a second one for a search that matches nothing
//  · the "New trade post" modal as a bottom sheet, with per-field validation
//    and the native <select> redrawn as four tappable choices
//  · a row-actions sheet — the desktop board has no row menu at all, and on a
//    phone a card cannot carry six affordances inline
//  · a posting DETAIL sheet — tapping the card body opens the whole posting:
//    trade, budget, location, poster, timing, replies, status, description
//
// What changes versus the desktop sheet, and why:
//  · The card splits into two targets. The body opens the posting (read), the
//    dots button opens the actions menu (act). The desktop card is a read-only
//    tile with the excerpt printed on it; a handheld row has no room for the
//    excerpt, so the read gets its own sheet rather than being folded into the
//    action menu where nobody browsing would look for it.
//  · `budget` and `place` are lifted out of the body prose into spec rows —
//    what it pays and where it is are the two facts that decide whether the
//    rest of the posting is worth reading. Both are fixture-only keys.
//  · A search box is added. The board's whole job is finding the one posting
//    that fits, and on a phone that is faster than paging. It filters the same
//    fixture client-side — no new endpoint.
//  · The 3-line body excerpt leaves the card. A ledger row is three lines; the
//    full body reads in the actions sheet instead.
//  · A closed thread is marked with its badge and a muted title rather than
//    the desktop's 0.72 opacity — dimmed type does not survive direct sun.
//  · Page size 7-at-once → 6: a handheld row is three lines tall.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-trade.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ALL,
  CATEGORIES,
  ME,
  PAGE_SIZE,
  POSTS_SEED,
  POST_SEQ_START,
  catCount,
  catLabel,
  initials,
  matchesCat,
  matchesQuery,
  type TradePost,
} from "./trade-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** The donor's category tones, as classes: border + soft fill + base text. */
const CAT_CLASS: Record<string, string> = {
  equipment: styles.catEquipment,
  subcontractor: styles.catSubcontractor,
  "job-share": styles.catJobShare,
  question: styles.catQuestion,
};

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/* 750ms easeOutCubic. tabular-nums keep the digit columns from jumping.
   Counts only — the board has no currency left on it now that earnings moved
   to /influencer. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fmt = useCallback((n: number) => num(n), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = fmt(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = fmt(value * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, fmt]);
  return (
    <div ref={ref} className={className}>
      {fmt(value)}
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

export function MobileTrade() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* A per-mount COPY of the fixture. The sheet closes, reopens and removes
     posts and the form publishes into it — mutating the module-level seed
     would leak every change into the next mount. */
  const [data, setData] = useState<TradePost[]>(() => POSTS_SEED.map((p) => ({ ...p })));
  const [seq, setSeq] = useState(POST_SEQ_START);
  const [cat, setCat] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  /* The read sheet. Kept separate from `sheetId` (the act sheet) rather than
     one "which sheet" enum: they open from different targets on the same row
     and each has its own aria-label, and a null-plus-mode pair is two states
     that can disagree. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---- new-post form ---- */
  const [form, setForm] = useState({ title: "", body: "", cat: "question" });
  const [titleErr, setTitleErr] = useState(false);
  const [bodyErr, setBodyErr] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn,
      styles.cmenuItem, styles.sheetCancel, styles.trowOpen, styles.fsegBtn,
      styles.temptyA, styles.srchX,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever THIS page owns ------------------------
     The nav drawer handles its own Escape; this one never sees it. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (newOpen) setNewOpen(false);
      else if (sheetId) setSheetId(null);
      else if (detailId) setDetailId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, newOpen, sheetId, detailId]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
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

  /* ---------- derived ---------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((p) => matchesCat(p, cat) && matchesQuery(p, query)),
    [data, cat, query],
  );
  const openCount = useMemo(() => data.filter((p) => p.status !== "CLOSED").length, [data]);
  const closedCount = data.length - openCount;
  const replyTotal = useMemo(() => data.reduce((a, p) => a + p.replies, 0), [data]);

  const activeCat = CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[0];

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetPost = sheetId === null ? null : (data.find((p) => p.id === sheetId) ?? null);
  /* Looked up by id, not held as an object, so a post the sheet is showing
     while it gets closed / reopened repaints instead of going stale. */
  const detailPost = detailId === null ? null : (data.find((p) => p.id === detailId) ?? null);

  /* One masthead, one subject: how much of the board is still live. All three
     figures come off the fixture, so publishing, closing or removing a post
     moves them. */
  const mast = {
    kicker: "Open threads",
    value: openCount,
    a1: { l: "Replies", v: num(replyTotal) },
    a2: { l: "Closed", v: num(closedCount) },
  };

  const resetFilters = () => {
    setCat(ALL);
    setQuery("");
    setPage(1);
  };

  /* ---------- row sheet -------------------------------------------------
     The desktop board has no row menu; six affordances cannot sit inline on a
     phone card, so they become a sheet. Two rows are disabled from REAL
     fixture state: replying to a CLOSED thread (p5, p7), and closing a thread
     you did not write (everything except p3 and anything you publish). */
  const menuRows = useMemo<MenuRow[]>(() => {
    const p = sheetPost;
    if (!p) return [];
    const closed = p.status === "CLOSED";
    const mine = p.author === ME;
    return [
      { act: "open", icon: "i-msg", tone: styles.cmiBp, title: "Open thread",
        sub: p.replies ? `Read all ${p.replies} replies` : "No replies yet" },
      { act: "reply", icon: "i-send", tone: styles.cmiSky, title: "Reply",
        sub: closed ? "This thread is closed" : "Add to the thread", disabled: closed },
      { act: "dm", icon: "i-mail", tone: styles.cmiOk, title: "Message author",
        sub: `Direct message ${p.author}` },
      { act: "copy", icon: "i-copy", title: "Copy link", sub: "Share this posting" },
      { act: "state", icon: closed ? "i-rotate" : "i-check", tone: styles.cmiWarn,
        title: closed ? "Reopen thread" : "Close thread",
        sub: mine
          ? closed ? "Puts it back on the board" : "Marks it settled, replies stop"
          : `Only ${p.author} can do that`,
        disabled: !mine },
      { act: "del", icon: "i-trash", tone: styles.cmiDanger, title: "Remove post",
        sub: "Takes it off your board", danger: true },
    ];
  }, [sheetPost]);

  /* ---------- detail sheet spec rows -----------------------------------
     The drawing's dimension block: six labelled facts, in the order a
     contractor triages them — what trade, what it pays, where it is, how
     old, how much talk, and whether it is still live. Budget and place are
     optional on the fixture (a question thread has no price, and a post you
     just published has neither), so an absent value is stated as absent
     rather than dropping the row and shortening the block unpredictably. */
  const specRows = useMemo(() => {
    const p = detailPost;
    if (!p) return [];
    const c = CATEGORIES.find((x) => x.key === p.cat);
    return [
      { k: "Trade", v: c ? c.label : catLabel(p.cat), missing: false },
      { k: "Budget", v: p.budget ?? "Not stated", missing: !p.budget },
      { k: "Location", v: p.place ?? "Not stated", missing: !p.place },
      { k: "Posted", v: p.when, missing: false },
      { k: "Replies", v: p.replies ? num(p.replies) : "None yet", missing: !p.replies },
      { k: "Status", v: p.status === "CLOSED" ? "Closed" : "Open", missing: false },
    ];
  }, [detailPost]);

  const runMenu = (act: string) => {
    const p = sheetPost;
    setSheetId(null);
    if (!p) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== p.id));
    } else if (act === "state") {
      setData((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, status: x.status === "CLOSED" ? "OPEN" : "CLOSED" } : x)),
      );
      setLandedId(p.id);
    }
  };

  /* ---------- new-post form -------------------------------------------- */
  const openNew = () => {
    setForm({ title: "", body: "", cat: "question" });
    setTitleErr(false);
    setBodyErr(false);
    setNewOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => titleRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    if (!body) {
      setBodyErr(true);
      bodyRef.current?.focus();
      return;
    }
    const id = `p${seq + 1}`;
    setSeq((s) => s + 1);
    setData((prev) => [
      { id, cat: form.cat, status: "OPEN", title, body, author: ME, when: "just now", replies: 0 },
      ...prev,
    ]);
    resetFilters();
    setNewOpen(false);
    setLandedId(id);
  };

  const anyOverlay = Boolean(sheetPost) || Boolean(detailPost) || newOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const detailDrag = useSheetDrag(Boolean(detailPost), () => setDetailId(null));
  const actionsDrag = useSheetDrag(Boolean(sheetPost), () => setSheetId(null));
  const newDrag = useSheetDrag(newOpen, () => setNewOpen(false));

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state and its own Escape, so the page holds neither. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD — the board's one action, never a FAB. With a single
              view under it the action is unconditional; the desktop only
              scoped it because it had a second panel to hide it from. */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Community</div>
            <h1 className={styles.pageTitle}>Trade board</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New post
              </button>
            </div>
          </div>

          {/* MASTHEAD */}
          <div className={`${styles.tmast} ${styles.slide}`}>
            <div className={styles.tmastTop}>
              <div className={styles.tmastLbl}>
                {mast.kicker}
                <span className={styles.tmastRule} />
              </div>
              <CountUp value={mast.value} className={styles.tmastVal} />
            </div>
            <div className={styles.tmastCnt}>
              {[mast.a1, mast.a2].map((a) => (
                <div className={styles.tmastSub} key={a.l}>
                  <div className={styles.tmastSubL}>{a.l}</div>
                  <div className={styles.tmastSubV}>{a.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* FIND BAR */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search the board…"
                autoComplete="off"
                aria-label="Search postings"
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
                <span className={`${styles.ddValue} ${cat === ALL ? styles.isAll : ""}`}>
                  {activeCat.label} · {catCount(data, cat)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {CATEGORIES.map((c) => (
                  <button key={c.key} className={`${styles.ddItem} ${cat === c.key ? styles.active : ""}`}
                    type="button" role="option" aria-selected={cat === c.key}
                    onClick={() => { setCat(c.key); setPage(1); setFilterOpen(false); }}>
                    {c.tone ? <span className={styles.ddDot} style={{ background: c.tone }} /> : null}
                    {c.label}
                    <span className={styles.ddCount}>{catCount(data, c.key)}</span>
                    {cat === c.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className={styles.tempty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.temptyT}>Nothing on the board</div>
                  <div className={styles.temptyS}>
                    No postings from your area yet. Start the first thread and the
                    other shops will see it.
                  </div>
                  <button className={styles.temptyA} type="button" onClick={openNew}>
                    <Icon id="i-plus" />New post
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.temptyT}>No matches</div>
                  <div className={styles.temptyS}>No posting matches that search and category.</div>
                  <button className={styles.temptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.board}>
              {slice.map((p, i) => (
                <div
                  key={p.id}
                  className={`${styles.trow} ${styles.rowIn} ${p.status === "CLOSED" ? styles.isClosed : ""} ${landedId === p.id ? styles.landed : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  {/* The read target: one stretched button over the whole
                      card, so the whole three-line block is tappable rather
                      than only the title. It sits UNDER the dots button in
                      the stack (z 1 vs 2), which is what keeps the two
                      affordances from fighting over the same pixels. */}
                  <button className={styles.trowTap} type="button"
                    aria-label={`Open posting: ${p.title}`} onClick={() => setDetailId(p.id)} />
                  <span className={`${styles.tav} ${p.author === ME ? styles.isMine : ""}`}>
                    {initials(p.author)}
                  </span>
                  <div className={styles.ttitle}>{p.title}</div>
                  <button className={styles.trowOpen} type="button"
                    aria-label={`Actions for ${p.title}`} onClick={() => setSheetId(p.id)}>
                    <Icon id="i-dots" />
                  </button>
                  <div className={styles.twho}>{p.author} · {p.when}</div>
                  <div className={styles.trowFoot}>
                    <span className={styles.trowLead}>
                      <span className={`${styles.badge} ${CAT_CLASS[p.cat] ?? ""}`}>{catLabel(p.cat)}</span>
                      {p.status === "CLOSED" ? (
                        <span className={`${styles.badge} ${styles.catClosed}`}>closed</span>
                      ) : null}
                    </span>
                    <span className={styles.trowFigs}>
                      <span className={styles.figLbl}>Replies</span>
                      <span className={`${styles.figVal} ${p.replies ? "" : styles.isZero}`}>
                        {p.replies ? p.replies : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

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

      {/* ============ SHEET SCRIM (shared by all three sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setDetailId(null); setNewOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ POST DETAIL SHEET ============
          The read half of the card. Everything the fixture carries about the
          posting, in one slide-up: the badges, who wrote it, the six spec
          rows, and the body in full. The act half is one tap away in the
          foot, so the two sheets never both need to be open. */}
      <div className={`${styles.sheet} ${detailPost ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mtDetailTitle" aria-hidden={!detailPost} {...detailDrag.sheetProps}>
        <div className={styles.sheetGrab} {...detailDrag.handleProps} />
        <div className={styles.sheetHead} {...detailDrag.handleProps}>
          <div className={styles.sheetKicker}>Trade board / posting</div>
          <div className={styles.sheetTitle} id="mtDetailTitle">{detailPost?.title ?? "Posting"}</div>
        </div>
        <div className={styles.sheetBody}>
          {detailPost ? (
            <>
              <div className={styles.dtTop}>
                <span className={styles.dtBadges}>
                  <span className={`${styles.badge} ${CAT_CLASS[detailPost.cat] ?? ""}`}>
                    {catLabel(detailPost.cat)}
                  </span>
                  {detailPost.status === "CLOSED" ? (
                    <span className={`${styles.badge} ${styles.catClosed}`}>closed</span>
                  ) : null}
                </span>
                <span className={styles.dtWho}>
                  <span className={`${styles.tav} ${detailPost.author === ME ? styles.isMine : ""}`}>
                    {initials(detailPost.author)}
                  </span>
                  <span className={styles.dtWhoText}>
                    <span className={styles.dtWhoName}>{detailPost.author}</span>
                    {/* A thread of your own is worth calling out here: it is
                        what makes Close thread reachable in the act sheet. */}
                    <span className={styles.dtWhoMeta}>
                      {detailPost.author === ME ? "Posted by you" : "Posted by"} · {detailPost.when}
                    </span>
                  </span>
                </span>
              </div>

              <dl className={styles.dtSpec}>
                {specRows.map((r) => (
                  <div className={styles.dtSpecRow} key={r.k}>
                    <dt className={styles.dtSpecK}>{r.k}</dt>
                    <dd className={`${styles.dtSpecV} ${r.missing ? styles.isMissing : ""}`}>{r.v}</dd>
                  </div>
                ))}
              </dl>

              <div className={styles.dtBodyBlock}>
                <div className={styles.dtBodyLbl}>Description</div>
                <p className={styles.dtBodyText}>{detailPost.body}</p>
              </div>
            </>
          ) : null}
        </div>
        {/* Same beige foot as the form sheet: the way out and the way on stay
            reachable without scrolling a long posting to its end. */}
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setDetailId(null)}>
            Close
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button"
            onClick={() => { const id = detailId; setDetailId(null); setSheetId(id); }}>
            <Icon id="i-dots" />Actions
          </button>
        </div>
      </div>

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetPost ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Posting actions" aria-hidden={!sheetPost} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetPost
              ? `${catLabel(sheetPost.cat)} · ${sheetPost.author} · ${sheetPost.when}`
              : "Posting · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetPost?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {/* The body the row card refuses to carry, in full. */}
          {sheetPost ? <div className={styles.sheetQuote}>{sheetPost.body}</div> : null}
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.cmenuItem} ${r.danger ? styles.cmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.cmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.cmenuItemT}>{r.title}</span>
                <span className={styles.cmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ NEW POST SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mtNewTitle" aria-hidden={!newOpen} {...newDrag.sheetProps}>
        <div className={styles.sheetGrab} {...newDrag.handleProps} />
        <div className={styles.sheetHead} {...newDrag.handleProps}>
          <div className={styles.sheetKicker}>Trade board / new posting</div>
          <div className={styles.sheetTitle} id="mtNewTitle">New trade post</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mtNewForm" noValidate onSubmit={submitNew}>
          <div className={`${styles.fld} ${titleErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mtTitle">
              Title<span className={styles.req}>*</span>
            </label>
            <input ref={titleRef} className={styles.pinput} id="mtTitle" name="title" type="text"
              placeholder="Selling a 2019 dump trailer" autoComplete="off" value={form.title}
              aria-invalid={titleErr} aria-describedby={titleErr ? "mtTitleErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, title: e.target.value }));
                if (e.target.value.trim()) setTitleErr(false);
              }} />
            {titleErr ? <span className={styles.fldErr} id="mtTitleErr">Give the posting a one-line title</span> : null}
          </div>

          <div className={`${styles.fld} ${bodyErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mtBody">
              Body<span className={styles.req}>*</span>
            </label>
            <textarea ref={bodyRef} className={styles.parea} id="mtBody" name="body"
              placeholder="Condition, price, location, who to call…" value={form.body}
              aria-invalid={bodyErr} aria-describedby={bodyErr ? "mtBodyErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, body: e.target.value }));
                if (e.target.value.trim()) setBodyErr(false);
              }} />
            {bodyErr ? <span className={styles.fldErr} id="mtBodyErr">Add the details before posting</span> : null}
            <span className={styles.fldHint}>Be specific — title in one line, everything else here.</span>
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Category</span>
            <div className={styles.fseg}>
              {CATEGORIES.filter((c) => c.key !== ALL).map((c) => (
                <button key={c.key} className={styles.fsegBtn} type="button"
                  aria-pressed={form.cat === c.key}
                  onClick={() => setForm((f) => ({ ...f, cat: c.key }))}>
                  <span className={styles.fsegDot} style={{ background: c.tone }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mtNewForm">
            <Icon id="i-check" />Post
          </button>
        </div>
      </div>
    </div>
  );
}
