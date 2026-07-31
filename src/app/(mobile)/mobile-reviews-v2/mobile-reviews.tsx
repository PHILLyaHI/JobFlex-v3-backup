"use client";

// MOBILE REVIEWS (mobile-reviews-v2) — Blueprint system, handheld build.
//
// Archetype B (FEED): the page's subject is a chronological run of client
// submissions, newest first, grouped under drawn date rules. Tokens, palette,
// type scale and Motion System "Balanced" are the reference dashboard's; the
// shell (topbar / hamburger drawer / sprite) is the shared <MobileNav />, so
// this surface is the same product as its twelve siblings.
//
// Every component of the desktop reviews sheet is covered:
//  · page head (Reputation / Reviews) + the two head actions
//  · the 3-stat grid, folded into ONE masthead: average rating as the numeral,
//    total reviews and response rate as the two annotations — all computed
//  · the All / 5 / 4 / 3 / 2 / 1 chip rail, as one Filter dropdown
//  · the review list, re-cut as feed entry cards under date dividers
//  · the score spread (5 → 1 bars, animated on mount)
//  · "Awaiting response" with its live count, status badges and Send / Resend
//    nudge (SENT + "just now" after 1200ms, exactly the donor's timing)
//  · the review empty state, plus a second one for a filter that excludes
//    everything, plus the awaiting list's own
//
// What changes versus the desktop sheet, and why:
//  · NO STARS. House rule, and there is no star in the shared sprite. A score
//    renders as a NUMERAL beside a drawn five-cell meter — a gauge on a
//    technical drawing. Five small glyphs do not read at arm's length in
//    jobsite glare; a 20px numeral and a filled bar do.
//  · The desktop's right-hand rail (spread + awaiting) becomes two sections
//    stacked under the feed. A 320px viewport has no rail.
//  · The chip rail becomes one dropdown: six chips do not survive 320px.
//  · The "⋮" popover becomes a bottom sheet (no hover on touch, and CLAUDE.md
//    prefers sheets over modals). It doubles as the DETAIL sheet: the entry
//    card clamps its comment to two lines, the sheet carries the full text.
//  · A "Request review" form sheet is added for the head's primary action. The
//    desktop leaves request creation to the job flow; on a phone, standing in
//    a finished driveway, asking for the review is the whole job.
//  · No search box and no pager: eight completed reviews is not a surface where
//    paging to find one is the real work. Score is the only dimension worth a
//    control, and it has one.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "./mobile-reviews.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ALL,
  FILTER_KEYS,
  REVIEWS_SEED,
  REVIEW_LINK,
  SCORE_KEYS,
  filterLabel,
  groupByAge,
  initials,
  isCompleted,
  isOpenRequest,
  matchesScore,
  scoreCount,
  scoreTone,
  type ReviewRequest,
  type Tone,
} from "./reviews-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scores read as one decimal everywhere, so "5" never gets mistaken for a
 *  count and the digit columns line up under each other. */
const score1 = (n: number) => n.toFixed(1);

const TONE_CLASS: Record<Tone, string> = {
  hi: styles.toneHi,
  mid: styles.toneMid,
  low: styles.toneLow,
};

/** Drawn fills run on scaleX(--fill), never on an animated width: forty-five
 *  of them arm at once on mount and a transform costs no layout. */
const fillVar = (ratio: number) => ({ "--fill": ratio }) as CSSProperties;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/**
 * THE RATING METER — five 2px ink-framed cells filled to the score, like a
 * gauge on a technical drawing. The last cell takes the fraction, so 4.13 reads
 * as four filled cells and a sliver, which is what a gauge does and what five
 * glyphs cannot. Decorative for assistive tech: the numeral beside it is the
 * value, and the wrapper carries the label.
 */
function Meter({ score, armed, large }: { score: number; armed: boolean; large?: boolean }) {
  return (
    <span className={`${styles.meter} ${large ? styles.meterLg : ""}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span className={styles.meterCell} key={i}>
          <span
            className={styles.meterFill}
            style={fillVar(armed ? Math.max(0, Math.min(1, score - i)) : 0)}
          />
        </span>
      ))}
    </span>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. The
 *  precision is a number, not a formatter callback: a function prop would be a
 *  new identity every render and would restart the count on every keystroke
 *  elsewhere on the page. */
function CountUp({ value, digits, className }: { value: number; digits: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = value.toFixed(digits);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = (value * (1 - Math.pow(1 - pr, 3))).toFixed(digits);
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, digits]);
  return (
    <div ref={ref} className={className}>
      {value.toFixed(digits)}
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

export function MobileReviews() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<ReviewRequest[]>(() => REVIEWS_SEED.map((r) => ({ ...r })));
  const [filter, setFilter] = useState<string>(ALL);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [nudged, setNudged] = useState<string | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "ok" | "fail">("idle");
  /* The drawn instruments (masthead meter + spread bars) fill in from zero on
     mount — the house "a line gets drawn" character. Flipped one frame after
     mount so the transition has a start value to run from. */
  const [armed, setArmed] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);

  /* ---- request-review form ---- */
  const [form, setForm] = useState({ client: "", job: "", to: "" });
  const [sendNow, setSendNow] = useState(true);
  const [clientErr, setClientErr] = useState(false);
  const clientRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
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
      styles.btn, styles.ddBtn, styles.ddItem, styles.rmenuItem, styles.sheetCancel,
      styles.frowOpen, styles.prowOpen, styles.pbtn, styles.emptyA, styles.fchk,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what the PAGE owns ----------------------------
     The drawer is not listed: MobileNav handles its own Escape, and it only
     binds while open, so the two listeners cannot both claim one key press. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (askOpen) setAskOpen(false);
      else if (sheetId) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, askOpen, sheetId]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- The one blue flash on a record you just changed ---------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- Nudge: the donor's 1200ms confirmation, then the flip ---- */
  useEffect(() => {
    if (!nudged) return;
    const t = window.setTimeout(() => {
      setData((prev) =>
        prev.map((r) => (r.id === nudged ? { ...r, status: "SENT", when: "just now" } : r)),
      );
      setLandedId(nudged);
      setNudged(null);
    }, 1200);
    return () => clearTimeout(t);
  }, [nudged]);

  useEffect(() => {
    if (copy === "idle") return;
    const t = window.setTimeout(() => setCopy("idle"), 1600);
    return () => clearTimeout(t);
  }, [copy]);

  /* ---------- derived -------------------------------------------------- */
  const completed = useMemo(() => data.filter(isCompleted), [data]);
  const waiting = useMemo(() => data.filter(isOpenRequest), [data]);

  const avg = useMemo(
    () => (completed.length ? completed.reduce((a, r) => a + r.rating, 0) / completed.length : 0),
    [completed],
  );
  const rate = useMemo(
    () => (data.length ? Math.round((completed.length / data.length) * 100) : 0),
    [completed.length, data.length],
  );
  /* An empty book has no tone: a red 0.00 would read as a terrible rating
     rather than as "nothing has come back yet". */
  const avgTone = completed.length ? TONE_CLASS[scoreTone(avg)] : styles.toneNone;

  const rows = useMemo(() => completed.filter((r) => matchesScore(r, filter)), [completed, filter]);
  const groups = useMemo(() => groupByAge(rows), [rows]);
  /* One running position across every group, so the row cascade reads as one
     list rather than restarting under each date rule. Precomputed rather than
     counted during render — a counter mutated inside the JSX drifts on a
     re-render that does not start from the top. */
  const rowOrder = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const spread = useMemo(() => {
    const cells = SCORE_KEYS.map((k) => ({
      k,
      n: completed.filter((r) => r.rating === Number(k)).length,
      tone: TONE_CLASS[scoreTone(Number(k))],
    }));
    const max = Math.max(1, ...cells.map((c) => c.n));
    return cells.map((c) => ({ ...c, ratio: c.n / max }));
  }, [completed]);

  const sheetRec = sheetId === null ? null : (data.find((r) => r.id === sheetId) ?? null);
  const sheetDone = sheetRec !== null && isCompleted(sheetRec);

  const resetFilter = () => setFilter(ALL);

  /* ---------- row / entry sheet ---------------------------------------
     One sheet, two row sets. A completed submission and an open request are
     different records with different verbs, but they are the same object in
     the same list, so they share the sheet rather than forking the markup. */
  const menuRows = useMemo<MenuRow[]>(() => {
    const r = sheetRec;
    if (!r) return [];
    if (isCompleted(r)) {
      return [
        { act: "open", icon: "i-thumb", tone: styles.rmiBp, title: "Open review",
          sub: "Full submission and job record" },
        { act: "reply", icon: "i-msg", tone: styles.rmiSky, title: "Reply to review",
          sub: `Answer ${r.client} directly` },
        { act: "copy", icon: "i-copy", title: "Copy the comment",
          sub: r.comment ? "Paste it into a listing or post" : "No comment left with this score",
          disabled: !r.comment },
        { act: "feature", icon: "i-megaphone", tone: styles.rmiOk, title: "Feature on your site",
          sub: "Show it on the public reviews page" },
        { act: "job", icon: "i-jobs", tone: styles.rmiWarn, title: "Open the job", sub: r.job },
        { act: "del", icon: "i-trash", tone: styles.rmiDanger, title: "Delete review",
          sub: "Removes it from your rating", danger: true },
      ];
    }
    const sent = r.status === "SENT";
    return [
      { act: "nudge", icon: "i-send", tone: styles.rmiSky, title: sent ? "Resend request" : "Send request",
        sub: sent ? `Nudge ${r.client} again` : `First send to ${r.client}` },
      { act: "msg", icon: "i-msg", title: "Message client", sub: `Open the thread with ${r.client}` },
      { act: "copy", icon: "i-copy", title: "Copy review link", sub: "Paste it into a text" },
      { act: "job", icon: "i-jobs", tone: styles.rmiWarn, title: "Open the job", sub: r.job },
      { act: "cancel", icon: "i-trash", tone: styles.rmiDanger, title: "Cancel request",
        sub: "Stops the reminders for this job", danger: true },
    ];
  }, [sheetRec]);

  /* ---------- clipboard: the public submission link, or a comment -------
     Not a network call — the data layer stays out of scope. The result is
     reported honestly: a blocked clipboard says so rather than pretending. */
  const copyText = useCallback((text: string) => {
    const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clip?.writeText) {
      setCopy("fail");
      return;
    }
    clip.writeText(text).then(
      () => setCopy("ok"),
      () => setCopy("fail"),
    );
  }, []);
  const copyLink = useCallback(() => copyText(REVIEW_LINK), [copyText]);

  const runMenu = (act: string) => {
    const r = sheetRec;
    setSheetId(null);
    if (!r) return;
    if (act === "del" || act === "cancel") {
      setData((prev) => prev.filter((x) => x.id !== r.id));
    } else if (act === "nudge") {
      setNudged(r.id);
    } else if (act === "copy") {
      copyText(isCompleted(r) && r.comment ? r.comment : REVIEW_LINK);
    }
  };

  /* ---------- request-review form -------------------------------------- */
  const openAsk = () => {
    setForm({ client: "", job: "", to: "" });
    setSendNow(true);
    setClientErr(false);
    setAskOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => clientRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitAsk = (e: React.FormEvent) => {
    e.preventDefault();
    const client = form.client.trim();
    if (!client) {
      setClientErr(true);
      clientRef.current?.focus();
      return;
    }
    const rec: ReviewRequest = {
      id: `r-new-${data.length}-${client.length}`,
      status: sendNow ? "SENT" : "PENDING",
      rating: null,
      client,
      job: form.job.trim() || "No job named",
      when: "just now",
      comment: null,
    };
    setData((prev) => [rec, ...prev]);
    setAskOpen(false);
    setLandedId(rec.id);
  };

  const anyOverlay = Boolean(sheetRec) || askOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const entryDrag = useSheetDrag(Boolean(sheetRec), () => setSheetId(null));
  const askDrag = useSheetDrag(askOpen, () => setAskOpen(false));

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
            <div className={styles.kicker}>Reputation</div>
            <h1 className={styles.pageTitle}>Reviews</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openAsk}>
                <Icon id="i-send" />Request review
              </button>
              <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={copyLink}>
                <Icon id={copy === "ok" ? "i-check" : "i-copy"} />
                {copy === "ok" ? "Link copied" : copy === "fail" ? "Copy failed" : "Copy link"}
              </button>
            </div>
          </div>

          {/* MASTHEAD — the desktop's 3-stat grid, folded into one numeral, a
              mono kicker and EXACTLY two annotations. All three computed, so
              deleting a review moves them. The numeral takes the score's status
              tone and sits beside the drawn meter. */}
          <div className={styles.rmast}>
            <div className={styles.rmastTop}>
              <div className={styles.rmastLbl}>
                Average rating
                <span className={styles.rmastRule} />
              </div>
              <div className={`${styles.rmastRow} ${avgTone}`}>
                {/* No reviews reads as an em dash, never "0.00" — zero is a
                    number, an unrated book is an absence. The desktop stat did
                    the same. */}
                {completed.length ? (
                  <CountUp value={avg} digits={2} className={styles.rmastVal} />
                ) : (
                  <div className={styles.rmastVal}>—</div>
                )}
                <Meter score={avg} armed={armed} large />
              </div>
            </div>
            <div className={styles.rmastCnt}>
              <div className={styles.rmastSub}>
                <div className={styles.rmastSubL}>Reviews</div>
                <div className={styles.rmastSubV}>{completed.length}</div>
              </div>
              <div className={styles.rmastSub}>
                <div className={styles.rmastSubL}>Response</div>
                <div className={styles.rmastSubV}>{rate}%</div>
              </div>
            </div>
          </div>

          {/* SCORE SPREAD — the desktop's side card, unchanged in meaning:
              five bars, share of the book, drawn on 1.5px ink tracks. */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>Score spread</div>
              <div className={styles.cardNote}>{completed.length} rated</div>
            </div>
            <div className={styles.spread}>
              {spread.map((s) => (
                <div className={styles.spRow} key={s.k}>
                  <span className={styles.spK}>{s.k}</span>
                  <span className={styles.spTrack}>
                    <span
                      className={`${styles.spFill} ${s.tone}`}
                      style={fillVar(armed ? s.ratio : 0)}
                    />
                  </span>
                  <span className={styles.spN}>{s.n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FILTER — one dropdown, never a chip rail: six chips do not survive
              320px. The chosen score reads back on the face as plain text. */}
          <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
            <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
              aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
              <Icon id="i-filter" />
              Filter
              <span className={`${styles.ddValue} ${filter === ALL ? styles.isAll : ""}`}>
                {filterLabel(filter)} · {scoreCount(completed, filter)}
              </span>
              <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
            </button>
            <div className={styles.ddMenu} role="listbox">
              {FILTER_KEYS.map((k) => (
                <button key={k} className={`${styles.ddItem} ${filter === k ? styles.active : ""}`}
                  type="button" role="option" aria-selected={filter === k}
                  onClick={() => { setFilter(k); setFilterOpen(false); }}>
                  {filterLabel(k)}
                  <span className={styles.ddCount}>{scoreCount(completed, k)}</span>
                  {filter === k ? <Icon id="i-check" /> : null}
                </button>
              ))}
            </div>
          </div>

          {/* THE FEED — entry cards under drawn date rules, newest first. */}
          {rows.length === 0 ? (
            <div className={styles.empty}>
              {completed.length === 0 ? (
                <>
                  <div className={styles.emptyT}>No reviews yet</div>
                  <div className={styles.emptyS}>
                    Mark a job as completed and the client gets a review link. Their submission
                    appears here.
                  </div>
                  <button className={styles.emptyA} type="button" onClick={openAsk}>
                    <Icon id="i-send" />Request review
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.emptyT}>No matches</div>
                  <div className={styles.emptyS}>
                    Nothing has come back at a score of {filter} yet. Clear the filter to see
                    all {completed.length} reviews.
                  </div>
                  <button className={styles.emptyA} type="button" onClick={resetFilter}>
                    <Icon id="i-x" />Clear filter
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.feed}>
              {groups.map((g) => (
                <section className={styles.fgroup} key={g.key}>
                  {/* A 1.5px ink rule with the date label sitting on it — the
                      section marker off a technical drawing. */}
                  <div className={styles.fdate}>
                    <span className={styles.fdateT}>{g.label}</span>
                    <span className={styles.fdateN}>{g.rows.length}</span>
                  </div>
                  <div className={styles.fcard}>
                    {g.rows.map((r) => {
                      return (
                        <article
                          key={r.id}
                          className={`${styles.frow} ${styles.rowIn} ${landedId === r.id ? styles.landed : ""}`}
                          style={{ animationDelay: `${(rowOrder.get(r.id) ?? 0) * 45}ms` }}
                        >
                          <span className={styles.fav}>{initials(r.client)}</span>
                          <div className={styles.fname}>{r.client}</div>
                          <button className={styles.frowOpen} type="button"
                            aria-label={`Actions for ${r.client}'s review`}
                            onClick={() => setSheetId(r.id)}>
                            <Icon id="i-dots" />
                          </button>
                          <div className={styles.fjob}>{r.job}</div>
                          <div className={styles.ffoot}>
                            <span className={`${styles.frate} ${TONE_CLASS[scoreTone(r.rating)]}`}
                              aria-label={`Rated ${score1(r.rating)} out of 5`}>
                              <span className={styles.frateVal}>{score1(r.rating)}</span>
                              <Meter score={r.rating} armed={armed} />
                            </span>
                            <span className={styles.fwhen}>{r.when}</span>
                          </div>
                          {/* Two lines and an ellipsis. The full text is in the
                              sheet — a feed entry is a summary, not a document. */}
                          {r.comment ? <p className={styles.fquote}>{r.comment}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* AWAITING RESPONSE — the desktop's second side card. Same three
              lines as a row card: identity + actions, mono meta, then the
              status badge with the nudge closing at the far right. */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>Awaiting response</div>
              <div className={`${styles.cardCount} ${waiting.length ? "" : styles.isZero}`}>
                {waiting.length}
              </div>
            </div>
            {waiting.length === 0 ? (
              <div className={`${styles.empty} ${styles.emptyIn}`}>
                <div className={styles.emptyT}>All answered</div>
                <div className={styles.emptyS}>
                  Every request has come back. Send another when the next job closes.
                </div>
                <button className={styles.emptyA} type="button" onClick={openAsk}>
                  <Icon id="i-send" />Request review
                </button>
              </div>
            ) : (
              <div className={styles.plist}>
                {waiting.map((r, i) => (
                  <div
                    key={r.id}
                    className={`${styles.prow} ${styles.rowIn} ${landedId === r.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <div className={styles.pname}>{r.client}</div>
                    <button className={styles.prowOpen} type="button"
                      aria-label={`Actions for ${r.client}'s request`}
                      onClick={() => setSheetId(r.id)}>
                      <Icon id="i-dots" />
                    </button>
                    <div className={styles.pmeta}>{r.job} · {r.when}</div>
                    <div className={styles.pfoot}>
                      <span className={`${styles.pbadge} ${r.status === "SENT" ? styles.stSent : styles.stPending}`}>
                        {r.status === "SENT" ? "Sent" : "Pending"}
                      </span>
                      <button className={styles.pbtn} type="button" disabled={nudged === r.id}
                        onClick={() => setNudged(r.id)}>
                        <Icon id={nudged === r.id ? "i-check" : "i-send"} />
                        {nudged === r.id ? "Sent" : r.status === "SENT" ? "Resend" : "Send"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setAskOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ENTRY / REQUEST SHEET ============ */}
      <div className={`${styles.sheet} ${sheetRec ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Review actions" aria-hidden={!sheetRec} {...entryDrag.sheetProps}>
        <div className={styles.sheetGrab} {...entryDrag.handleProps} />
        <div className={styles.sheetHead} {...entryDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetRec
              ? sheetDone
                ? `Reviewed · ${sheetRec.when}`
                : `${sheetRec.status === "SENT" ? "Sent" : "Pending"} · ${sheetRec.when}`
              : "Review · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetRec?.client ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {sheetRec ? (
            <div className={styles.rdetail}>
              <div className={styles.rdetailTop}>
                {sheetDone && sheetRec.rating !== null ? (
                  <span className={`${styles.frate} ${TONE_CLASS[scoreTone(sheetRec.rating)]}`}
                    aria-label={`Rated ${score1(sheetRec.rating)} out of 5`}>
                    <span className={styles.frateVal}>{score1(sheetRec.rating)}</span>
                    <Meter score={sheetRec.rating} armed={armed} />
                  </span>
                ) : (
                  <span className={`${styles.pbadge} ${sheetRec.status === "SENT" ? styles.stSent : styles.stPending}`}>
                    {sheetRec.status === "SENT" ? "Sent" : "Pending"}
                  </span>
                )}
              </div>
              <div className={styles.rdetailJob}>{sheetRec.job}</div>
              {/* The full comment lives here, not on the card. */}
              {sheetRec.comment ? (
                <p className={styles.rquoteFull}>{sheetRec.comment}</p>
              ) : (
                <p className={styles.rnote}>
                  {sheetDone
                    ? "Scored, but no comment was left."
                    : "No submission yet — the link is still open."}
                </p>
              )}
            </div>
          ) : null}
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.rmenuItem} ${r.danger ? styles.rmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.rmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.rmenuItemT}>{r.title}</span>
                <span className={styles.rmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ REQUEST REVIEW SHEET ============ */}
      <div className={`${styles.sheet} ${askOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mrAskTitle" aria-hidden={!askOpen} {...askDrag.sheetProps}>
        <div className={styles.sheetGrab} {...askDrag.handleProps} />
        <div className={styles.sheetHead} {...askDrag.handleProps}>
          <div className={styles.sheetKicker}>Reputation / new request</div>
          <div className={styles.sheetTitle} id="mrAskTitle">Request review</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mrAskForm" noValidate onSubmit={submitAsk}>
          <div className={`${styles.fld} ${clientErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mrClient">
              Client<span className={styles.req}>*</span>
            </label>
            <input ref={clientRef} className={styles.pinput} id="mrClient" name="client" type="text"
              placeholder="D. Reyes" autoComplete="off" value={form.client}
              aria-invalid={clientErr} aria-describedby={clientErr ? "mrClientErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, client: e.target.value }));
                if (e.target.value.trim()) setClientErr(false);
              }} />
            {clientErr ? <span className={styles.fldErr} id="mrClientErr">Enter a client name</span> : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mrJob">Job</label>
            <input className={styles.pinput} id="mrJob" name="job" type="text"
              placeholder="Cedar fence — 902 Alder Ct" autoComplete="off" value={form.job}
              onChange={(e) => setForm((f) => ({ ...f, job: e.target.value }))} />
            <span className={styles.fldHint}>
              It goes in the request so the client knows which job you mean.
            </span>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mrTo">Send to</label>
            <input className={styles.pinput} id="mrTo" name="to" type="text"
              placeholder="d.reyes@mail.com or (425) 555-0134" autoComplete="off" value={form.to}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Delivery</span>
            <button className={styles.fchk} type="button" aria-pressed={sendNow}
              onClick={() => setSendNow((v) => !v)}>
              <span className={styles.fchkBox}><Icon id="i-check" /></span>
              Send it right away
              <span className={styles.fchkSub}>{sendNow ? "sent" : "pending"}</span>
            </button>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setAskOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mrAskForm">
            <Icon id="i-send" />Send request
          </button>
        </div>
      </div>
    </div>
  );
}
