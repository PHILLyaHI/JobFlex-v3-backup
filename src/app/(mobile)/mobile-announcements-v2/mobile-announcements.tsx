"use client";

// MOBILE ANNOUNCEMENTS (mobile-announcements-v2) — Blueprint system, handheld
// build.
//
// Archetype B: a FEED plus a composer. The desktop page is two stacked cards of
// banners and a centre-screen dialog; on a phone it is one chronological board,
// newest first, cut into dated groups, with the dialog rebuilt as a form sheet.
// Tokens, palette, type scale and Motion System "Balanced" are the reference
// dashboard's; the shell (topbar / hamburger drawer / sprite) is the shared
// MobileNav, so this surface and its twelve siblings are one product.
//
// Every component / region / variant of the desktop sheet is covered:
//  · page head (Communication kicker + New announcement) — the one primary
//  · the Active card's live count, promoted to a computed masthead
//  · Active / Archive — the desktop's two cards, as the two view modes
//  · every banner field: title, body, priority tag, posted date, expiry
//  · all three priorities, and the no-expiry variant
//  · the retire action (Move to archive), plus its inverse
//  · the Archive card's "N past announcements" list, including the
//    "expired <date>" annotation
//  · both empty states — the desktop's "No active announcements." and the
//    filter-excludes-everything case it has no answer for
//  · the compose dialog: title, body, priority, optional expiry, and its LIVE
//    PREVIEW — the dialog's signature, kept verbatim in behaviour
//
// What changes versus the desktop sheet, and why:
//  · The banner list is ordered by DATE, not by priority. On a board you scan
//    with a thumb, "what came in" beats "what is loudest"; priority is still
//    on every row as a badge and is the one thing the filter segments by.
//  · Posted dates leave the rows and become date dividers — one drawn rule per
//    day instead of the same annotation repeated on every card.
//  · The banner's whole body was inline; here it is a two-line excerpt, with
//    the full notice in the detail sheet. A feed row cannot be four lines tall.
//  · The "×" retire button becomes a row in the actions sheet beside its
//    inverse, so an archived notice can come back — the desktop retire is
//    one-way.
//  · No search and no pager: five records is a scroll, not a lookup.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off. Nothing here touches Prisma, a server action
// or the network.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-announcements.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ANN_SEED,
  ANN_SEQ_START,
  PRIORITY,
  PRIORITY_FILTERS,
  TABS,
  TODAY_LABEL,
  type Announcement,
  type DayGroup,
  type PriorityKey,
  type TabKey,
  dayLabel,
  daysLeft,
  formatDay,
  groupByDay,
  matchesPriority,
  priorityCount,
  shortDay,
} from "./announcements-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** High takes danger, Warn takes warning, Normal takes blueprint — the fixture's
 *  priority IS this page's status, and severity should read in that order. */
const TONE: Record<number, string> = {
  0: styles.toneNormal,
  1: styles.toneWarn,
  2: styles.toneHigh,
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

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

/**
 * One entry card, used by the feed AND by the compose sheet's preview — the
 * preview is the real component with the actions button withheld, so what the
 * sheet shows is literally what the board will draw.
 */
function Entry({
  a,
  delay,
  landed,
  onOpen,
}: {
  a: Announcement;
  delay?: number;
  landed?: boolean;
  onOpen?: () => void;
}) {
  const left = a.expired ? null : daysLeft(a.expires);
  return (
    <article
      className={[
        styles.erow,
        TONE[a.priority] ?? styles.toneNormal,
        a.expired ? styles.isPast : "",
        onOpen ? styles.rowIn : "",
        landed ? styles.landed : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={onOpen ? { animationDelay: `${delay ?? 0}ms` } : undefined}
    >
      <div className={styles.etitle}>{a.title || "Your announcement title"}</div>
      {onOpen ? (
        <button
          className={styles.erowOpen}
          type="button"
          aria-label={`Actions for ${a.title}`}
          onClick={onOpen}
        >
          <Icon id="i-dots" />
        </button>
      ) : null}
      <p className={styles.ebody}>{a.body || "Body text shows here beside the title."}</p>
      <div className={styles.efoot}>
        <span className={styles.pri}>{PRIORITY[a.priority]}</span>
        <span className={styles.eanchor}>
          {a.expired ? (
            <span className={styles.emono}>Expired {shortDay(a.expires)}</span>
          ) : left === null ? (
            /* No expiry is an absence, not a zero — it reads faint, like a dash. */
            <span className={`${styles.emono} ${styles.isNone}`}>No expiry</span>
          ) : left <= 0 ? (
            <span className={`${styles.emono} ${styles.isSoon}`}>Expires today</span>
          ) : (
            <>
              <span className={`${styles.efig} ${left <= 2 ? styles.isSoon : ""}`}>{left}</span>
              <span className={styles.eunit}>{left === 1 ? "day left" : "days left"}</span>
            </>
          )}
        </span>
      </div>
    </article>
  );
}

export function MobileAnnouncements() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* A per-mount COPY of the fixture: the seed is a module constant, and
     archiving or publishing into it directly would leak every edit into the
     next visit — and into any other importer. */
  const [data, setData] = useState<Announcement[]>(() => ANN_SEED.map((a) => ({ ...a })));
  const seqRef = useRef(ANN_SEQ_START);

  const [tab, setTab] = useState<TabKey>("active");
  const [filter, setFilter] = useState<PriorityKey>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);

  /* ---- compose form ---- */
  const [form, setForm] = useState({ title: "", body: "", expires: "" });
  const [priorityDraft, setPriorityDraft] = useState(0);
  const [titleErr, setTitleErr] = useState(false);
  const [bodyErr, setBodyErr] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
      styles.btn, styles.tab, styles.ddBtn, styles.ddItem, styles.menuItem,
      styles.sheetCancel, styles.erowOpen, styles.segBtn, styles.emptyA,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes whatever THIS page owns -----------------------
     The drawer is not in that list: MobileNav handles its own Escape. */
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

  /* ---------- Switching board returns you to the top of the feed -------
     In an effect, not the click handler: the ref must not be read during
     render, and the scroll belongs to the tab CHANGE. First run skipped so
     mounting doesn't scroll. */
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [tab]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived ------------------------------------------------- */
  const activeList = useMemo(() => data.filter((a) => !a.expired), [data]);
  const archiveList = useMemo(() => data.filter((a) => a.expired), [data]);
  const counts: Record<TabKey, number> = {
    active: activeList.length,
    archive: archiveList.length,
  };

  const board = tab === "archive" ? archiveList : activeList;
  const visible = useMemo(() => board.filter((a) => matchesPriority(a, filter)), [board, filter]);
  /* Each group carries the running row count before it, so the entrance cascade
     staggers across the WHOLE feed instead of restarting under every divider.
     A shared counter mutated inside the render callbacks would do the same job
     and is exactly what the immutability rule exists to stop. */
  const groups = useMemo(() => {
    const out: (DayGroup & { start: number })[] = [];
    groupByDay(visible).forEach((g) => {
      const prev = out[out.length - 1];
      out.push({ ...g, start: prev ? prev.start + prev.items.length : 0 });
    });
    return out;
  }, [visible]);

  /* Masthead: one numeral and EXACTLY two annotations, all computed, so
     archiving, restoring, deleting and publishing all move them. */
  const highNow = activeList.filter((a) => a.priority === 2).length;

  const activeFilter = PRIORITY_FILTERS.find((f) => f.key === filter) ?? PRIORITY_FILTERS[0];
  const filterTone =
    activeFilter.priority === undefined ? "" : (TONE[activeFilter.priority] ?? "");

  const sheetAnn = sheetId === null ? null : (data.find((a) => a.id === sheetId) ?? null);

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const a = sheetAnn;
    if (!a) return [];
    return [
      { act: "edit", icon: "i-file", tone: styles.miBp, title: "Edit announcement",
        sub: "Change the title, body or priority" },
      { act: "copy", icon: "i-copy", tone: styles.miSky, title: "Copy text",
        sub: "Title and body, ready to paste" },
      { act: "send", icon: "i-send", tone: styles.miOk, title: "Send as message",
        sub: "Push it to the crew's phones" },
      // Driven by real fixture state: "New material supplier" carries no expiry,
      // so this row is genuinely reachable in its disabled form.
      { act: "expiry", icon: "i-cal", tone: styles.miWarn, title: "Change expiry",
        sub: a.expires ? `Currently ${a.expires}` : "No expiry set", disabled: !a.expires },
      { act: "archive", icon: "i-folder",
        title: a.expired ? "Restore to live" : "Move to archive",
        sub: a.expired ? "Shows on every dashboard again" : "Stops showing on the dashboard" },
      { act: "del", icon: "i-trash", tone: styles.miDanger, title: "Delete announcement",
        sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetAnn]);

  const runMenu = (act: string) => {
    const a = sheetAnn;
    setSheetId(null);
    if (!a) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== a.id));
    } else if (act === "archive") {
      setData((prev) =>
        prev.map((x) =>
          x.id === a.id
            ? {
                ...x,
                expired: !x.expired,
                // The donor stamps a retire date when the banner had none, so an
                // archived record always says when it came down.
                expires: x.expired ? x.expires : x.expires || TODAY_LABEL,
              }
            : x,
        ),
      );
      setTab(a.expired ? "active" : "archive");
      setFilter("ALL");
      setLandedId(a.id);
    }
  };

  /* ---------- compose --------------------------------------------------- */
  const openNew = () => {
    setForm({ title: "", body: "", expires: "" });
    setPriorityDraft(0);
    setTitleErr(false);
    setBodyErr(false);
    setNewOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the keyboard
    // fight the animation.
    window.setTimeout(() => titleRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const draft: Announcement = {
    id: "draft",
    title: form.title.trim(),
    body: form.body.trim(),
    priority: priorityDraft,
    created: TODAY_LABEL,
    expires: form.expires ? formatDay(form.expires) : null,
    expired: false,
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    const body = form.body.trim();
    // Both are required on the desktop dialog too — it refuses to publish and
    // focuses whichever is missing.
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
    seqRef.current += 1;
    const rec: Announcement = {
      id: `a${seqRef.current}`,
      title,
      body,
      priority: priorityDraft,
      created: TODAY_LABEL,
      expires: form.expires ? formatDay(form.expires) : null,
      expired: false,
    };
    setData((prev) => [rec, ...prev]);
    setTab("active");
    setFilter("ALL");
    setNewOpen(false);
    setLandedId(rec.id);
  };

  const anyOverlay = Boolean(sheetAnn) || newOpen;

  // Swipe-down dismissal, one gesture per sheet, wired to the close paths the
  // scrim and Cancel already use.
  const detailDrag = useSheetDrag(Boolean(sheetAnn), () => setSheetId(null));
  const composeDrag = useSheetDrag(newOpen, () => setNewOpen(false));
  const tabIndex = Math.max(0, TABS.findIndex((t) => t.key === tab));

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
            <div className={styles.kicker}>Communication</div>
            <h1 className={styles.pageTitle}>Announcements</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New announcement
              </button>
            </div>
          </div>

          {/* MASTHEAD */}
          <div className={styles.mast}>
            <div className={styles.mastTop}>
              <div className={styles.mastLbl}>
                Live right now
                <span className={styles.mastRule} />
              </div>
              <CountUp value={counts.active} className={styles.mastVal} />
            </div>
            <div className={styles.mastCnt}>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>High</div>
                <div className={styles.mastSubV}>{highNow}</div>
              </div>
              <div className={styles.mastSub}>
                <div className={styles.mastSubL}>Archived</div>
                <div className={styles.mastSubV}>{counts.archive}</div>
              </div>
            </div>
          </div>

          {/* TABS — the desktop's Active and Archive cards */}
          <div className={styles.tabs}>
            <span className={styles.tabInd} style={{ transform: `translateX(${tabIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`${styles.tab} ${tab === t.key ? styles.active : ""}`}
                type="button"
                aria-current={tab === t.key ? "page" : undefined}
                onClick={() => {
                  setTab(t.key);
                  setFilter("ALL");
                }}
              >
                {t.label}
                <span className={styles.tabCount}>{counts[t.key]}</span>
              </button>
            ))}
          </div>

          {/* FILTER — priority, as ONE dropdown */}
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
              <span className={`${styles.ddValue} ${filterTone}`}>
                {activeFilter.label} · {priorityCount(board, filter)}
              </span>
              <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
            </button>
            <div className={styles.ddMenu} role="listbox">
              {PRIORITY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`${styles.ddItem} ${filter === f.key ? styles.active : ""}`}
                  type="button"
                  role="option"
                  aria-selected={filter === f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setFilterOpen(false);
                  }}
                >
                  {f.label}
                  <span className={styles.ddCount}>{priorityCount(board, f.key)}</span>
                  {filter === f.key ? <Icon id="i-check" /> : null}
                </button>
              ))}
            </div>
          </div>

          {/* FEED */}
          {visible.length === 0 ? (
            <div className={styles.empty}>
              {board.length === 0 ? (
                tab === "archive" ? (
                  <>
                    <div className={styles.emptyT}>Nothing archived</div>
                    <div className={styles.emptyS}>
                      Announcements you take down land here, with the date they came off.
                    </div>
                    <button className={styles.emptyA} type="button" onClick={() => setTab("active")}>
                      <Icon id="i-arrow" />See the live board
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.emptyT}>Nothing posted</div>
                    <div className={styles.emptyS}>
                      The crew sees announcements on every dashboard page. Post the first one.
                    </div>
                    <button className={styles.emptyA} type="button" onClick={openNew}>
                      <Icon id="i-plus" />New announcement
                    </button>
                  </>
                )
              ) : (
                <>
                  <div className={styles.emptyT}>No matches</div>
                  <div className={styles.emptyS}>
                    Nothing on this board is marked {activeFilter.label.toLowerCase()}.
                  </div>
                  <button className={styles.emptyA} type="button" onClick={() => setFilter("ALL")}>
                    <Icon id="i-x" />Clear filter
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Divider and card are SIBLINGS inside the feed, not nested in a
               per-group wrapper: the label-on-a-rule reads as an annotation
               over the block below it, and `.dsep:not(:first-child)` is what
               opens the extra air between one day and the next. */
            <div className={styles.feed}>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <div className={styles.dsep}>
                    <span className={styles.dsepL}>{g.label}</span>
                  </div>
                  <div className={styles.grp}>
                    {g.items.map((a, i) => (
                      <Entry
                        key={a.id}
                        a={a}
                        delay={(g.start + i) * 45}
                        landed={landedId === a.id}
                        onOpen={() => setSheetId(a.id)}
                      />
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setNewOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ DETAIL + ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetAnn ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Announcement actions" aria-hidden={!sheetAnn} {...detailDrag.sheetProps}>
        <div className={styles.sheetGrab} {...detailDrag.handleProps} />
        <div className={styles.sheetHead} {...detailDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetAnn
              ? `${PRIORITY[sheetAnn.priority]} · posted ${dayLabel(sheetAnn.created)}`
              : "Announcement · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetAnn?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {/* The full notice — the row only ever showed two lines of it. */}
          <p className={styles.dtext}>{sheetAnn?.body ?? ""}</p>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.menuItem} ${r.danger ? styles.menuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.miIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.menuItemT}>{r.title}</span>
                <span className={styles.menuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ COMPOSE SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="maNewTitle" aria-hidden={!newOpen} {...composeDrag.sheetProps}>
        <div className={styles.sheetGrab} {...composeDrag.handleProps} />
        <div className={styles.sheetHead} {...composeDrag.handleProps}>
          <div className={styles.sheetKicker}>Shows on every dashboard</div>
          <div className={styles.sheetTitle} id="maNewTitle">New announcement</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="maNewForm" noValidate onSubmit={submitNew}>
          <div className={`${styles.fld} ${titleErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="maTitle">
              Title<span className={styles.req}>*</span>
            </label>
            <input ref={titleRef} className={styles.pinput} id="maTitle" name="title" type="text"
              placeholder="Shop closed Friday" autoComplete="off" value={form.title}
              aria-invalid={titleErr} aria-describedby={titleErr ? "maTitleErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, title: e.target.value }));
                if (e.target.value.trim()) setTitleErr(false);
              }} />
            {titleErr ? <span className={styles.fldErr} id="maTitleErr">Enter a title</span> : null}
          </div>

          <div className={`${styles.fld} ${bodyErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="maBody">
              Body<span className={styles.req}>*</span>
            </label>
            <textarea ref={bodyRef} className={styles.parea} id="maBody" name="body"
              placeholder="One or two lines — the board shows the first two."
              value={form.body}
              aria-invalid={bodyErr} aria-describedby={bodyErr ? "maBodyErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, body: e.target.value }));
                if (e.target.value.trim()) setBodyErr(false);
              }} />
            {bodyErr ? <span className={styles.fldErr} id="maBodyErr">Enter the notice text</span> : null}
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Priority</span>
            {/* Three drawn segments rather than a native select — and each one
                wears the tone the banner will take. */}
            <div className={styles.seg} role="group" aria-label="Priority">
              {[0, 1, 2].map((p) => (
                <button
                  key={p}
                  className={`${styles.segBtn} ${TONE[p]} ${priorityDraft === p ? styles.segOn : ""}`}
                  type="button"
                  aria-pressed={priorityDraft === p}
                  onClick={() => setPriorityDraft(p)}
                >
                  <span className={styles.segDot} />
                  {PRIORITY[p]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="maExpires">Expires</label>
            <input className={styles.pinput} id="maExpires" name="expires" type="date"
              value={form.expires}
              onChange={(e) => setForm((f) => ({ ...f, expires: e.target.value }))} />
            <span className={styles.fldHint}>
              Optional. Leave it blank and the notice stays up until you archive it.
            </span>
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Preview</span>
            <div className={styles.pv}>
              <div className={styles.dsep}>
                <span className={styles.dsepL}>{dayLabel(TODAY_LABEL)}</span>
              </div>
              <div className={styles.grp}>
                <Entry a={draft} />
              </div>
            </div>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="maNewForm">
            <Icon id="i-check" />Publish
          </button>
        </div>
      </div>
    </div>
  );
}
