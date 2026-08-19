"use client";

// MOBILE REFERRALS (mobile-referrals-v2) — Blueprint system, handheld build.
//
// The desktop referrals sheet (components/v3/referrals-blueprint) rebuilt for
// 320–768px. Tokens, palette, type scale, status tones and Motion System
// "Balanced" are the reference dashboard's; the shell (topbar / drawer /
// sprite) is the shared MobileNav, so this page is a sibling of /mobile-v2,
// /mobile-proposals-v2 and /mobile-clients-v2 rather than a fresh reading.
//
// Every region of the desktop page is covered:
//  · page head (kicker "Growth" + H1) plus the share action the desktop keeps
//    down in the hero
//  · the hero code card → the PROGRAM HEADER: mono code plate with a copy
//    button and a real confirmation state, over a beige strip carrying the
//    50%-per-paid-referral terms
//  · the hero's two link chips (signup / homeowner) → the share sheet
//  · the 3-cell stat grid → the computed masthead: credit earned, plus exactly
//    two annotations (credit on the way, code uses)
//  · the 4-chip status rail → ONE filter dropdown, as a 3-column menu
//  · the conversion list → row cards with initials avatars and all three status
//    tones (credited / converted / pending)
//  · the empty state, plus a second one for a search that matches nothing
//  · the desktop's (unpopulated) row popover → a bottom sheet with tonal boxes,
//    a disabled row and a danger row
//
// What changes versus the desktop sheet, and why:
//  · The hero's prose note is dropped. The beige strip already states the whole
//    programme — 50%, one month, per paid referral — so the paragraph repeated
//    what was visible.
//  · A search box is added: these records are identified by email, and typing
//    three letters beats scanning eight long strings on a phone. It filters the
//    same fixture client-side, no new endpoint.
//  · The ledger pages at 6. A handheld row is three lines tall.
//  · The two URL chips cannot hold one line at 320px, so they became sheet rows
//    where the full address has room and the copy target is 60px tall.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off — nothing here calls Prisma, a server action
// or the network.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-referrals.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ALL,
  CONVERSIONS_SEED,
  FILTERS,
  HOMEOWNER_LINK,
  PAGE_SIZE,
  REFERRAL_CODE,
  REWARD_PCT,
  SIGNUP_LINK,
  creditedCents,
  domainOf,
  initials,
  matchesQuery,
  matchesStatus,
  money,
  pendingCents,
  statusCount,
  statusLabel,
  type Conversion,
  type FilterKey,
} from "./referrals-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fire-and-forget. The clipboard is unavailable in insecure contexts and in
 *  some in-app browsers; the confirmation state is driven by the tap either
 *  way, exactly as the desktop donor's flash is. No network, no permissions
 *  prompt beyond the platform's own. */
function copyText(text: string) {
  if (typeof navigator === "undefined") return;
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. */
function CountUp({ cents, className }: { cents: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = money(cents);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = money(cents * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cents]);
  return (
    <div ref={ref} className={className}>
      {money(cents)}
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

type ShareRow = { key: string; icon: string; tone: string; title: string; value: string };

/** The desktop hero's two link chips, plus the code itself. */
const SHARE_ROWS: ShareRow[] = [
  { key: "signup", icon: "i-userplus", tone: styles.rmiBp, title: "Contractor signup link", value: SIGNUP_LINK },
  { key: "homeowners", icon: "i-users", tone: styles.rmiSky, title: "Homeowner link", value: HOMEOWNER_LINK },
  { key: "code", icon: "i-copy", tone: styles.rmiWarn, title: "Referral code", value: REFERRAL_CODE },
];

export function MobileReferrals() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  /* Cloned per mount: the row sheet removes records, and a mutation must not
     leak into the next mount of the page. */
  const [data, setData] = useState<Conversion[]>(() => CONVERSIONS_SEED.map((c) => ({ ...c })));
  const [filter, setFilter] = useState<FilterKey>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sharedKey, setSharedKey] = useState<string | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);

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
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.rmenuItem,
      styles.sheetCancel, styles.rowOpen, styles.progCopy, styles.progVal,
      styles.remptyA, styles.srchX,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever this page owns, topmost first ---------
     The drawer is MobileNav's business and handles its own key. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (shareOpen) setShareOpen(false);
      else if (sheetId) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, shareOpen, sheetId]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the ledger --------------
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

  /* ---------- transient confirmations ---------------------------------- */
  useEffect(() => {
    if (!codeCopied) return;
    const t = window.setTimeout(() => setCodeCopied(false), 1600);
    return () => clearTimeout(t);
  }, [codeCopied]);

  useEffect(() => {
    if (!sharedKey) return;
    const t = window.setTimeout(() => setSharedKey(null), 1600);
    return () => clearTimeout(t);
  }, [sharedKey]);

  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived --------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((c) => matchesStatus(c, filter) && matchesQuery(c, query)),
    [data, filter, query],
  );
  const credited = useMemo(() => creditedCents(data), [data]);
  const onTheWay = useMemo(() => pendingCents(data), [data]);

  const activeOption = FILTERS.find((o) => o.k === filter) ?? FILTERS[0];
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetRec = sheetId === null ? null : (data.find((c) => c.id === sheetId) ?? null);

  const resetFilters = () => {
    setFilter(ALL);
    setQuery("");
    setPage(1);
  };

  const copyCode = () => {
    copyText(REFERRAL_CODE);
    setCodeCopied(true);
  };

  const openShare = () => {
    setSharedKey(null);
    setShareOpen(true);
  };

  /* ---------- row sheet -------------------------------------------------
     Every record shows exactly one disabled row, and which one is decided by
     the fixture: a PENDING referral has no credit to apply, a converted one has
     nothing left to nudge. */
  const menuRows = useMemo<MenuRow[]>(() => {
    const c = sheetRec;
    if (!c) return [];
    const upgraded = c.status !== "PENDING";
    return [
      { act: "mail", icon: "i-mail", tone: styles.rmiSky, title: "Send a message", sub: c.email },
      {
        act: "nudge", icon: "i-send", tone: styles.rmiBp, title: "Nudge to upgrade",
        sub: upgraded ? "Already on a paid plan" : `Signed up ${c.when}, hasn't upgraded yet`,
        disabled: upgraded,
      },
      {
        act: "credit", icon: "i-card", tone: styles.rmiOk, title: "Apply credit",
        sub: c.reward > 0
          ? `${money(c.reward)} off your next invoice`
          : "No credit earned yet",
        disabled: c.reward === 0,
      },
      { act: "copy", icon: "i-copy", title: "Copy email", sub: domainOf(c.email) },
      {
        act: "del", icon: "i-trash", tone: styles.rmiDanger, title: "Remove referral",
        sub: "Stops tracking this signup", danger: true,
      },
    ];
  }, [sheetRec]);

  const runMenu = (act: string) => {
    const c = sheetRec;
    setSheetId(null);
    if (!c) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== c.id));
    } else if (act === "copy") {
      copyText(c.email);
      setLandedId(c.id);
    } else if (act === "nudge" || act === "mail" || act === "credit") {
      setLandedId(c.id);
    }
  };

  const anyOverlay = Boolean(sheetRec) || shareOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const actionsDrag = useSheetDrag(Boolean(sheetRec), () => setSheetId(null));
  const shareDrag = useSheetDrag(shareOpen, () => setShareOpen(false));

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
            <div className={styles.kicker}>Growth</div>
            <h1 className={styles.pageTitle}>Referrals</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openShare}>
                <Icon id="i-send" />Share code
              </button>
            </div>
          </div>

          {/* PROGRAM HEADER — the code plate and the reward terms */}
          <div className={styles.prog}>
            <div className={styles.progTop}>
              <div className={styles.progLbl}>
                Your code
                <span className={styles.progRule} />
                <span
                  className={`${styles.progFlag} ${codeCopied ? styles.isOn : ""}`}
                  role="status"
                >
                  {codeCopied ? "Copied" : ""}
                </span>
              </div>
              <div className={styles.progCode}>
                <button
                  className={styles.progVal}
                  type="button"
                  aria-label={`Copy referral code ${REFERRAL_CODE}`}
                  onClick={copyCode}
                >
                  {REFERRAL_CODE}
                </button>
                <button
                  className={`${styles.progCopy} ${codeCopied ? styles.isDone : ""}`}
                  type="button"
                  aria-label="Copy referral code"
                  onClick={copyCode}
                >
                  <Icon id={codeCopied ? "i-check" : "i-copy"} />
                </button>
              </div>
            </div>
            <div className={styles.progFoot}>
              <span className={styles.progRwV}>{REWARD_PCT}%</span>
              <span className={styles.progRwL}>off one month, per paid referral</span>
            </div>
          </div>

          {/* MASTHEAD — computed, so removing a referral moves all three */}
          <div className={styles.mast}>
            <div className={styles.mastTop}>
              <div className={styles.mastLbl}>
                Credit earned
                <span className={styles.mastRule} />
              </div>
              <CountUp cents={credited} className={styles.mastVal} />
            </div>
            <div className={styles.mastCnt}>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>On the way</div>
                <div className={styles.mastSubV}>{money(onTheWay)}</div>
              </div>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Code uses</div>
                <div className={styles.mastSubV}>{data.length}</div>
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
                placeholder="Search email or company…"
                autoComplete="off"
                aria-label="Search referrals"
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
                <span className={`${styles.ddValue} ${filter === ALL ? styles.isAll : ""}`}>
                  {activeOption.l} · {statusCount(data, filter)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {FILTERS.map((o) => (
                  <button key={o.k} className={`${styles.ddItem} ${filter === o.k ? styles.active : ""}`}
                    type="button" role="option" aria-selected={filter === o.k}
                    onClick={() => { setFilter(o.k); setPage(1); setFilterOpen(false); }}>
                    {o.l}
                    <span className={styles.ddCount}>{statusCount(data, o.k)}</span>
                    {filter === o.k ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* REFERRAL LEDGER */}
          {visible.length === 0 ? (
            <div className={styles.rempty}>
              <Icon id="i-gift" className={styles.remptyIc} />
              {data.length === 0 ? (
                <>
                  <div className={styles.remptyT}>No referrals yet</div>
                  <div className={styles.remptyS}>
                    Share your code — a contractor shows up here as soon as they sign up with it.
                  </div>
                  <button className={styles.remptyA} type="button" onClick={openShare}>
                    <Icon id="i-send" />Share code
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.remptyT}>No matches</div>
                  <div className={styles.remptyS}>No referral matches that search and filter.</div>
                  <button className={styles.remptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.book}>
              {slice.map((c, i) => (
                <div
                  key={c.id}
                  className={`${styles.rrow} ${styles.rowIn} ${landedId === c.id ? styles.landed : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className={styles.rav}>{initials(c.email)}</span>
                  <div className={styles.remail}>{c.email}</div>
                  <button className={styles.rowOpen} type="button"
                    aria-label={`Actions for ${c.email}`} onClick={() => setSheetId(c.id)}>
                    <Icon id="i-dots" />
                  </button>
                  <div className={styles.rwhen}>Signed up {c.when}</div>
                  <div className={styles.rowFoot}>
                    <span
                      className={`${styles.badge} ${
                        c.status === "PAID"
                          ? styles.csPaid
                          : c.status === "CONVERTED"
                            ? styles.csConverted
                            : styles.csPending
                      }`}
                    >
                      {statusLabel(c.status)}
                    </span>
                    <span className={`${styles.rfig} ${c.reward ? "" : styles.isZero}`}>
                      {c.reward ? money(c.reward) : "—"}
                    </span>
                  </div>
                </div>
              ))}
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
        onClick={() => { setSheetId(null); setShareOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetRec ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Referral actions" aria-hidden={!sheetRec} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetRec
              ? `${statusLabel(sheetRec.status)} · ${sheetRec.when} · ${sheetRec.reward ? money(sheetRec.reward) : "no credit"}`
              : "Referral · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetRec?.email ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.rmenuItem} ${r.danger ? styles.rmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.rmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span className={styles.rmiTxt}>
                <span className={styles.rmenuItemT}>{r.title}</span>
                <span className={styles.rmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ SHARE SHEET — the desktop hero's link chips ============ */}
      <div className={`${styles.sheet} ${shareOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mrShareTitle" aria-hidden={!shareOpen} {...shareDrag.sheetProps}>
        <div className={styles.sheetGrab} {...shareDrag.handleProps} />
        <div className={styles.sheetHead} {...shareDrag.handleProps}>
          <div className={styles.sheetKicker}>Growth / invite</div>
          <div className={styles.sheetTitle} id="mrShareTitle">Share your code</div>
        </div>
        <div className={styles.sheetBody}>
          {SHARE_ROWS.map((r) => {
            const done = sharedKey === r.key;
            return (
              <button
                key={r.key}
                className={styles.rmenuItem}
                type="button"
                onClick={() => { copyText(r.value); setSharedKey(r.key); }}
              >
                <span className={`${styles.rmiIc} ${done ? styles.rmiOk : r.tone}`}>
                  <Icon id={done ? "i-check" : r.icon} />
                </span>
                <span className={styles.rmiTxt}>
                  <span className={styles.rmenuItemT}>{r.title}</span>
                  <span className={styles.rmenuItemS}>{r.value}</span>
                </span>
                <span className={styles.rmiFlag} role="status">{done ? "Copied" : ""}</span>
              </button>
            );
          })}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setShareOpen(false)}>Done</button>
      </div>
    </div>
  );
}
