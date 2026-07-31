"use client";

// MOBILE PHONE (mobile-phone-v2) — Blueprint system, handheld build.
//
// The desktop /dashboard/phone sheet, re-cut for a phone. Tokens, palette,
// type scale and Motion System "Balanced" are the reference dashboard's; the
// shell (topbar / hamburger drawer / bottom sheets) is the shared MobileNav, so
// this surface is one product with its twelve siblings.
//
// Every region of the desktop sheet is covered:
//  · page head (kicker "Automation · Voice" + title)
//  · the Twilio configuration banner, with the webhook URL and its Copy control
//  · the three stat cards, folded into ONE masthead numeral + two annotations
//  · the four filter chips, as one dropdown (plus Missed, which the desktop
//    leaves you to spot by eye)
//  · the 6-column call table, re-cut as FEED entry cards under date dividers
//  · every call state the fixture holds: inbound, outbound, missed, live,
//    lead / no lead, recorded / not, transcript / none
//  · the transcript panel: badges, recording player, summary, transcript,
//    and the Create-lead / Call-back action pair
//  · both empty states
//
// What changes versus the desktop sheet, and why:
//  · ARCHETYPE. A call log is a feed, not a ledger: entries are chronological
//    and grouped by day, and each card carries a 2-line excerpt of the summary
//    with the full text in the detail sheet.
//  · DIRECTION IS THE STATUS. The desktop shows direction and status in two
//    columns; on a phone they are one derived state — inbound / outbound /
//    missed / live — carried by a tonal plate and a badge. Missed is danger.
//  · A DIAL PAD. The one thing a handheld can do that a desktop table cannot.
//    It is secondary to the log: it opens from the page head as a sheet and
//    never competes with the feed for the page.
//  · The right-hand popover becomes a bottom sheet, and the row "⋮" gets its
//    own actions sheet (no hover on touch; CLAUDE.md prefers sheets).
//  · A search box is added — it reaches the numbers, the summary, the lead id
//    AND what was actually said, which is how you find a call again. It filters
//    the same fixture client-side, no new endpoint.
//  · No pager: ten entries under five dividers is one honest scroll, and the
//    desktop table pages nothing either.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off. No Prisma, no server actions, no network.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-phone.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ALL,
  CALLS_SEED,
  FILTERS,
  HOOK_URL,
  KEYS,
  KIND_LABEL,
  SHOP_NUMBER,
  counterparty,
  dayGroup,
  filterCount,
  fmtDial,
  fmtDur,
  kindOf,
  matchesFilter,
  matchesQuery,
  type Call,
  type Kind,
} from "./phone-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/* The four icons the shared 48-symbol sprite has no equivalent for, plus the
   two transport controls. Ids are prefixed i-phone- so they can never collide
   with the shared set or with another page in this batch. Original lucide
   paths, 24×24, stroke 2, currentColor — arrow-down-left, phone-missed, play,
   pause, delete. Outbound reuses the shared i-arrow, and a live call reuses the
   shared i-phone. */
function PhoneSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-phone-in" viewBox="0 0 24 24"><path d="M17 7 7 17" /><path d="M17 17H7V7" /></symbol>
        <symbol id="i-phone-missed" viewBox="0 0 24 24"><path d="m22 2-6 6" /><path d="m16 2 6 6" /><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></symbol>
        <symbol id="i-phone-play" viewBox="0 0 24 24"><path d="M6 3 20 12 6 21Z" /></symbol>
        <symbol id="i-phone-pause" viewBox="0 0 24 24"><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></symbol>
        <symbol id="i-phone-del" viewBox="0 0 24 24"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" /><path d="m12 9 6 6" /><path d="m18 9-6 6" /></symbol>
      </defs>
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
      el.textContent = String(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = String(Math.round(value * (1 - Math.pow(1 - pr, 3))));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {value}
    </div>
  );
}

/** Direction plate + badge share one tone. Missed is danger — a missed call is
 *  lost work, and that is the whole point of scanning this page. */
const KIND_TONE: Record<Kind, string> = {
  in: styles.kIn,
  out: styles.kOut,
  missed: styles.kMissed,
  live: styles.kLive,
};
const KIND_ICON: Record<Kind, string> = {
  in: "i-phone-in",
  out: "i-arrow",
  missed: "i-phone-missed",
  live: "i-phone",
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

/** Clipboard only — a browser API, not a network call. */
function copyText(text: string) {
  try {
    navigator.clipboard?.writeText(text).catch(() => {});
  } catch {
    // No clipboard on this origin; the button's own flash is the feedback.
  }
}

export function MobilePhone() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  /** Deterministic lead ids — a design surface should not roll dice. */
  const leadSeq = useRef(0);

  const [data, setData] = useState<Call[]>(() =>
    CALLS_SEED.map((c) => ({ ...c, script: [...c.script] })),
  );
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [actId, setActId] = useState<string | null>(null);
  const [dialOpen, setDialOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* ---- dial pad ---- */
  const [dial, setDial] = useState("");

  /* ---- recording scrub ----
     One object carrying the call it belongs to, so opening a different call
     resets the transport BY DERIVATION rather than by an effect that writes
     state back on every change. */
  const [play, setPlay] = useState<{ id: string | null; t: number; on: boolean }>({
    id: null,
    t: 0,
    on: false,
  });

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
      styles.copen, styles.crow, styles.emptyA, styles.srchX, styles.hookCopy,
      styles.playBtn, styles.padKey, styles.dialDel,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever is topmost ---------------------------
     Only what THIS page owns. The drawer's own Escape lives in MobileNav. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dialOpen) setDialOpen(false);
      else if (actId) setActId(null);
      else if (openId) setOpenId(null);
      else if (filterOpen) setFilterOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialOpen, actId, openId, filterOpen]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  /* ---------- derived ------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((c) => matchesFilter(c, filter) && matchesQuery(c, query)),
    [data, filter, query],
  );
  const todayCount = useMemo(
    () => data.filter((c) => dayGroup(c.when) === "Today").length,
    [data],
  );
  const leadCount = useMemo(() => data.filter((c) => c.lead).length, [data]);

  /** Runs of the same day become one framed block under one drawn divider. */
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; rows: Call[] }> = [];
    visible.forEach((c) => {
      const label = dayGroup(c.when);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(c);
      else out.push({ key: `${label}-${c.id}`, label, rows: [c] });
    });
    return out;
  }, [visible]);

  /** Flat position drives the row stagger, so it stays continuous across the
   *  dividers instead of restarting at every day. */
  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    visible.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [visible]);

  const activeFilter = FILTERS.find((f) => f.k === filter) ?? FILTERS[0];
  const detail = openId === null ? null : (data.find((c) => c.id === openId) ?? null);
  const actCall = actId === null ? null : (data.find((c) => c.id === actId) ?? null);
  const anyOverlay = Boolean(detail) || Boolean(actCall) || dialOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const detailDrag = useSheetDrag(Boolean(detail), () => setOpenId(null));
  const actDrag = useSheetDrag(Boolean(actCall), () => setActId(null));
  const dialDrag = useSheetDrag(dialOpen, () => setDialOpen(false));

  const resetFilters = () => {
    setFilter(ALL);
    setQuery("");
  };

  /* ---------- recording scrub ------------------------------------------
     A transport over the fixture's duration at the donor's 40ms tick. There is
     no audio element because there is no recording to fetch. The stop-at-the-
     end lives INSIDE the tick, so the effect only ever subscribes — it never
     writes state back synchronously. */
  const playDur = detail?.dur ?? 0;
  const playing = play.on && play.id === openId;
  const playT = play.id === openId ? play.t : 0;

  useEffect(() => {
    if (!playing || !playDur) return;
    const id = window.setInterval(() => {
      setPlay((p) => {
        const t = Math.min(playDur, p.t + 1);
        return { id: p.id, t, on: t < playDur };
      });
    }, 40);
    return () => window.clearInterval(id);
  }, [playing, playDur]);

  const togglePlay = (c: Call) => {
    setPlay((p) => {
      const dur = c.dur ?? 0;
      if (p.id === c.id && p.on) return { id: c.id, t: p.t, on: false };
      return { id: c.id, t: p.id === c.id && p.t < dur ? p.t : 0, on: true };
    });
  };

  /* ---------- actions -------------------------------------------------- */
  const openDial = (prefill: string) => {
    setDial(prefill.replace(/\D/g, ""));
    setActId(null);
    setOpenId(null);
    setDialOpen(true);
  };

  const makeLead = (id: string) => {
    leadSeq.current += 1;
    const tag = `L-${6100 + leadSeq.current}`;
    setData((prev) => prev.map((x) => (x.id === id ? { ...x, lead: tag } : x)));
    setLandedId(id);
  };

  const menuRows = useMemo<MenuRow[]>(() => {
    const c = actCall;
    if (!c) return [];
    const other = counterparty(c);
    return [
      { act: "call", icon: "i-phone", tone: styles.miBp, title: "Call back", sub: other },
      { act: "text", icon: "i-msg", tone: styles.miSky, title: "Send a text", sub: `SMS to ${other}` },
      {
        act: "script", icon: "i-file", tone: styles.miOk, title: "Read transcript",
        sub: c.script.length ? `${c.script.length} lines on file` : "No transcript yet",
        disabled: c.script.length === 0,
      },
      c.lead
        ? { act: "lead", icon: "i-arrow", tone: styles.miWarn, title: "Open lead", sub: `Lead ${c.lead}` }
        : { act: "lead", icon: "i-target", tone: styles.miWarn, title: "Create lead", sub: "Start one from this call" },
      { act: "copy", icon: "i-copy", title: "Copy number", sub: other },
      {
        act: "del", icon: "i-trash", tone: styles.miDanger, title: "Delete from log",
        sub: "Removes the call and its transcript", danger: true,
      },
    ];
  }, [actCall]);

  const runMenu = (act: string) => {
    const c = actCall;
    if (!c) return;
    if (act === "call") {
      openDial(counterparty(c));
      return;
    }
    if (act === "script") {
      setActId(null);
      setOpenId(c.id);
      return;
    }
    setActId(null);
    if (act === "copy") {
      copyText(counterparty(c));
    } else if (act === "lead" && !c.lead) {
      makeLead(c.id);
    } else if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== c.id));
    }
  };

  /** Placing a call writes a live OUTBOUND entry at the top of today — the
   *  same state c6 already holds, reachable a second way. */
  const placeCall = () => {
    const raw = dial.trim();
    if (!raw) return;
    const rec: Call = {
      id: `c-new-${data.length}-${raw.length}`,
      from: SHOP_NUMBER,
      to: fmtDial(raw),
      dir: "OUTBOUND",
      status: "IN_PROGRESS",
      dur: null,
      rec: false,
      lead: null,
      when: "now",
      summary: null,
      script: [],
    };
    setData((prev) => [rec, ...prev]);
    resetFilters();
    setDial("");
    setDialOpen(false);
    setLandedId(rec.id);
  };

  return (
    <div className={styles.app} onClick={onRootClick}>
      {/* Shared handheld nav: topbar + drawer + the 48-symbol sprite. Owns its
          own open state, so the page holds none. */}
      <MobileNav />
      <PhoneSprite />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Automation · Voice</div>
            <h1 className={styles.pageTitle}>Phone</h1>
            <div className={styles.pageActions}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                type="button"
                onClick={() => openDial("")}
              >
                <Icon id="i-phone" />Dial
              </button>
            </div>
          </div>

          {/* CONFIGURATION BANNER — the desktop cfg-banner */}
          <div className={styles.cfg}>
            <span className={styles.cfgIc}>
              <Icon id="i-gear" />
            </span>
            <div className={styles.cfgT}>Twilio isn&apos;t configured</div>
            <div className={styles.cfgH}>
              Add <span className={styles.cfgCode}>TWILIO_ACCOUNT_SID</span>,{" "}
              <span className={styles.cfgCode}>TWILIO_AUTH_TOKEN</span> and{" "}
              <span className={styles.cfgCode}>TWILIO_PHONE_NUMBER</span>, then point the
              number&apos;s <span className={styles.cfgCode}>A call comes in</span> webhook here.
            </div>
            <div className={styles.cfgHook}>
              <span className={styles.hookUrl}>{HOOK_URL}</span>
              <button
                className={`${styles.hookCopy} ${copied ? styles.done : ""}`}
                type="button"
                onClick={() => {
                  copyText(HOOK_URL);
                  setCopied(true);
                }}
              >
                <Icon id={copied ? "i-check" : "i-copy"} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* MASTHEAD — the desktop's three stat cards as one numeral + two
              annotations. All three are computed, so placing or deleting a
              call moves them. */}
          <div className={styles.mast}>
            <div className={styles.mastTop}>
              <div className={styles.mastLbl}>
                Calls · 7 days
                <span className={styles.mastRule} />
              </div>
              <CountUp value={data.length} className={styles.mastVal} />
            </div>
            <div className={styles.mastCnt}>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Today</div>
                <div className={styles.mastSubV}>{todayCount}</div>
              </div>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Auto-leads</div>
                <div className={styles.mastSubV}>{leadCount}</div>
              </div>
            </div>
          </div>

          {/* FIND BAR — search + the chip rail as one dropdown */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search number, summary or transcript…"
                autoComplete="off"
                aria-label="Search calls"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  className={styles.srchX}
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>

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
                <span className={`${styles.ddValue} ${filter === ALL ? styles.isAll : ""}`}>
                  {activeFilter.l} · {filterCount(data, filter)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {FILTERS.map((f) => (
                  <button
                    key={f.k}
                    className={`${styles.ddItem} ${filter === f.k ? styles.active : ""}`}
                    type="button"
                    role="option"
                    aria-selected={filter === f.k}
                    onClick={() => {
                      setFilter(f.k);
                      setFilterOpen(false);
                    }}
                  >
                    {f.l}
                    <span className={styles.ddCount}>{filterCount(data, f.k)}</span>
                    {filter === f.k ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* THE FEED */}
          {visible.length === 0 ? (
            <div className={styles.empty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.emptyT}>No calls yet</div>
                  <div className={styles.emptyS}>
                    Point your number&apos;s webhook at JobFlex and inbound calls land here on
                    their own — with a transcript and a lead.
                  </div>
                  <button className={styles.emptyA} type="button" onClick={() => openDial("")}>
                    <Icon id="i-phone" />Dial a number
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.emptyT}>No matches</div>
                  <div className={styles.emptyS}>No call matches that search and filter.</div>
                  <button className={styles.emptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.feed}>
              {groups.map((g) => (
                <div className={styles.fgroup} key={g.key}>
                  {/* A drawn rule with the day sitting on it — a section note */}
                  <div className={styles.dayDiv}>
                    <span className={styles.dayDivL}>{g.label}</span>
                    <span className={styles.dayDivN}>
                      {g.rows.length} {g.rows.length === 1 ? "call" : "calls"}
                    </span>
                  </div>
                  <div className={styles.glog}>
                    {g.rows.map((c) => {
                      const kind = kindOf(c);
                      const other = counterparty(c);
                      const i = orderIndex.get(c.id) ?? 0;
                      return (
                        <div
                          key={c.id}
                          className={`${styles.crow} ${styles.rowIn} ${landedId === c.id ? styles.landed : ""}`}
                          style={{ animationDelay: `${i * 45}ms` }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${KIND_LABEL[kind]} call, ${other} — open detail`}
                          onClick={() => setOpenId(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenId(c.id);
                            }
                          }}
                        >
                          <span
                            className={`${styles.dplate} ${KIND_TONE[kind]} ${kind === "live" ? styles.livePulse : ""}`}
                          >
                            <Icon id={KIND_ICON[kind]} />
                          </span>
                          <div className={styles.cnum}>{other}</div>
                          <button
                            className={styles.copen}
                            type="button"
                            aria-label={`Actions for the call with ${other}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActId(c.id);
                            }}
                          >
                            <Icon id="i-dots" />
                          </button>
                          <div className={styles.cto}>
                            {c.dir === "OUTBOUND" ? `from ${c.from}` : `to ${c.to}`}
                          </div>
                          <div className={styles.cfoot}>
                            <span className={styles.cbadges}>
                              <span className={`${styles.badge} ${KIND_TONE[kind]}`}>
                                {KIND_LABEL[kind]}
                              </span>
                              {c.lead ? (
                                <span className={`${styles.badge} ${styles.isLead}`}>{c.lead}</span>
                              ) : (
                                <span className={`${styles.badge} ${styles.isNoLead}`}>No lead</span>
                              )}
                            </span>
                          </div>
                          {/* Last line of the card: the summary owns the text
                              column, the duration anchors the bottom-right
                              corner. They are two grid cells, not a float and a
                              wrap — so a long summary can never slide under the
                              figure at 320px. The relative time ("2 days ago")
                              is not repeated here; the day divider above the
                              group already states it. */}
                          <div className={styles.cbottom}>
                            <div className={`${styles.cexcerpt} ${c.summary ? "" : styles.none}`}>
                              {c.summary ?? "No transcript yet — it is written once the recording finishes processing."}
                            </div>
                            <span className={`${styles.cdur} ${c.dur == null ? styles.isZero : ""}`}>
                              {fmtDur(c.dur)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by all three sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => {
          setOpenId(null);
          setActId(null);
          setDialOpen(false);
        }}
        aria-hidden="true"
      />

      {/* ============ CALL DETAIL SHEET ============ */}
      <div
        className={`${styles.sheet} ${detail ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Call detail"
        aria-hidden={!detail}
        {...detailDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...detailDrag.handleProps} />
        <div className={styles.sheetHead} {...detailDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {detail
              ? `${KIND_LABEL[kindOf(detail)]} · ${detail.status.toLowerCase().replace("_", " ")} · ${detail.when}`
              : "Call · —"}
          </div>
          <div className={styles.sheetTitle}>{detail ? counterparty(detail) : "Call"}</div>
        </div>
        <div className={styles.sheetBody}>
          {detail ? (
            <>
              <div className={styles.dBadges}>
                <span className={`${styles.badge} ${KIND_TONE[kindOf(detail)]}`}>
                  {KIND_LABEL[kindOf(detail)]}
                </span>
                <span className={styles.badge}>{fmtDur(detail.dur)}</span>
                {detail.lead ? (
                  <span className={`${styles.badge} ${styles.isLead}`}>Lead {detail.lead}</span>
                ) : (
                  <span className={`${styles.badge} ${styles.isNoLead}`}>No lead</span>
                )}
              </div>

              {detail.rec ? (
                <div className={styles.dSec}>
                  <div className={styles.dSecLbl}>Recording</div>
                  <div className={styles.player}>
                    <button
                      className={styles.playBtn}
                      type="button"
                      aria-label={playing ? "Pause recording" : "Play recording"}
                      onClick={() => togglePlay(detail)}
                    >
                      <Icon id={playing ? "i-phone-pause" : "i-phone-play"} />
                    </button>
                    <span className={styles.playTrack}>
                      <span
                        className={styles.playFill}
                        style={{ transform: `scaleX(${playDur ? playT / playDur : 0})` }}
                      />
                    </span>
                    <span className={styles.playTime}>
                      {fmtDur(playT)} / {fmtDur(detail.dur)}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className={styles.dSec}>
                <div className={styles.dSecLbl}>Call summary</div>
                {detail.summary ? (
                  <div className={styles.dSummary}>{detail.summary}</div>
                ) : (
                  <div className={styles.dNone}>
                    No summary yet — it is written once the recording finishes processing.
                  </div>
                )}
              </div>

              <div className={styles.dSec}>
                <div className={styles.dSecLbl}>Transcript</div>
                {detail.script.length ? (
                  <div className={styles.script}>
                    {detail.script.map((l, i) => (
                      <div
                        key={`${detail.id}-${i}`}
                        className={`${styles.scriptLine} ${l[0] === "agent" ? styles.scriptAgent : ""}`}
                      >
                        <span className={styles.scriptWho}>{l[0] === "agent" ? "Shop" : "Caller"}</span>
                        <span className={styles.scriptTxt}>{l[1]}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.dNone}>
                    No transcript yet — it is posted once the recording completes.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
        <div className={styles.formFoot}>
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            type="button"
            onClick={() => detail && openDial(counterparty(detail))}
          >
            <Icon id="i-phone" />Call back
          </button>
          {detail?.lead ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => setOpenId(null)}>
              <Icon id="i-arrow" />Open lead
            </button>
          ) : (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              type="button"
              onClick={() => {
                if (detail) makeLead(detail.id);
              }}
            >
              <Icon id="i-target" />Create lead
            </button>
          )}
        </div>
      </div>

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div
        className={`${styles.sheet} ${actCall ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Call actions"
        aria-hidden={!actCall}
        {...actDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...actDrag.handleProps} />
        <div className={styles.sheetHead} {...actDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {actCall
              ? `${actCall.when} · ${fmtDur(actCall.dur)} · ${actCall.rec ? "recorded" : "no recording"}`
              : "Call · —"}
          </div>
          <div className={styles.sheetTitle}>{actCall ? counterparty(actCall) : "Actions"}</div>
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
        <button className={styles.sheetCancel} type="button" onClick={() => setActId(null)}>
          Cancel
        </button>
      </div>

      {/* ============ DIAL PAD SHEET ============ */}
      <div
        className={`${styles.sheet} ${dialOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Dial pad"
        aria-hidden={!dialOpen}
        {...dialDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...dialDrag.handleProps} />
        <div className={styles.sheetHead} {...dialDrag.handleProps}>
          <div className={styles.sheetKicker}>Outbound · from {SHOP_NUMBER}</div>
          <div className={styles.sheetTitle}>Dial</div>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.dialWrap}>
            <div className={styles.dialDisp}>
              {dial ? (
                <span className={styles.dialNum}>{fmtDial(dial)}</span>
              ) : (
                <span className={styles.dialPh}>Enter a number</span>
              )}
              <button
                className={styles.dialDel}
                type="button"
                disabled={!dial}
                aria-label="Delete last digit"
                onClick={() => setDial((v) => v.slice(0, -1))}
              >
                <Icon id="i-phone-del" />
              </button>
            </div>
            <div className={styles.pad}>
              {KEYS.map((k) => (
                <button
                  key={k.d}
                  className={styles.padKey}
                  type="button"
                  aria-label={`Key ${k.d}`}
                  onClick={() => setDial((v) => (v.length >= 15 ? v : v + k.d))}
                >
                  <span className={styles.padD}>{k.d}</span>
                  <span className={styles.padS}>{k.s}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.formFoot}>
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            type="button"
            onClick={() => setDialOpen(false)}
          >
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            type="button"
            disabled={!dial}
            onClick={placeCall}
          >
            <Icon id="i-phone" />Call
          </button>
        </div>
      </div>
    </div>
  );
}
