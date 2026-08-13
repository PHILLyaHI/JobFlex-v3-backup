"use client";

// JOB DETAIL · HANDHELD — /mobile-job-detail-v1/[id]
//
// The handheld build of the job record, fluid 320px → 768px. It stands BESIDE
// the desktop page (src/components/v3/job-detail-blueprint/*), which is not
// touched and keeps serving /dashboard/jobs/[id] at every width. This is a
// preview URL in the (mobile) route group, per the mobile route strategy.
//
// ── THE FIXTURE IS THE CONTENT ─────────────────────────────────────────────
// Every string, number and amount comes from the desktop port's own fixture,
// ../job-detail-blueprint/job-detail-data.ts, imported as-is: ST,
// INITIAL_STATUS, STATUS_BUTTONS, EVENTS, CREW, CHANGES, PHOTOS, EXPENSES,
// JOB and fmt. Nothing is retyped, re-worded or "improved", so the two pages
// can only ever disagree about layout. The `[id]` segment resolves but selects
// no content — exactly like the desktop route.
//
// ── WHAT WAS RE-CUT, AND WHY ───────────────────────────────────────────────
// · The six-tab bar scrolls horizontally inside its own ink frame instead of
//   sitting in a row (six tabs + counts measure ~640px) — the active tab is
//   scrolled into view on selection so the state is never parked off-screen.
// · Overview's 2fr/1fr grid is one column; the Client contact card follows the
//   Overview card as its own block, so each reveals on its own.
// · `jd-fields` 4-up → 2-up; `jd-photos` 4-up → 2-up (4/3 + hatch kept).
// · The change-order row's `1fr 104px 104px 104px` grid restacks into an
//   identity block over a money-and-decision strip.
// · "View proposal" — the one action the desktop head carries on all six tabs
//   — becomes the thumb-zone bar, as a grid row of the shell.
//
// ── MOTION ─────────────────────────────────────────────────────────────────
// Balanced: a reveal cascade over the content blocks (adaptive duration below
// the fold), the graph-paper parallax, a press stamp delegated from the root,
// and a row arrival that plays ONLY when a view genuinely arrives — it is
// keyed on the tab, never wired to a MutationObserver, which is the most
// expensive trap in this codebase. prefers-reduced-motion switches all of it
// off in both CSS and JS.

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import {
  ST,
  INITIAL_STATUS,
  STATUS_BUTTONS,
  EVENTS,
  CREW,
  CHANGES,
  PHOTOS,
  EXPENSES,
  JOB,
  fmt,
  type StatusKey,
} from "@/components/v3/job-detail-blueprint/job-detail-data";
import "./mobile-job-detail.css";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Same six tabs, same order, same counts as the desktop's `TABS`. */
type TabKey = "overview" | "schedule" | "crew" | "changes" | "photos" | "expenses";
const TABS: Array<[TabKey, string, number | null]> = [
  ["overview", "Overview", null],
  ["schedule", "Schedule", EVENTS.length],
  ["crew", "Crew", CREW.length],
  ["changes", "Changes", CHANGES.length],
  ["photos", "Photos", PHOTOS.length],
  ["expenses", "Expenses", EXPENSES.length],
];

/** The status badge modifier, translated from the fixture's desktop class. */
const ST_MOD: Record<StatusKey, string> = {
  sch: " mjd-st--sch",
  prog: "",
  done: " mjd-st--done",
  can: " mjd-st--can",
};

function Icon({ id }: { id: string }) {
  return (
    <svg className="mjd-ic" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** Stagger index as a custom property — read by `.mjd-rowin`'s animation-delay. */
const rowVar = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function MobileJobDetail() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabWrapRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<TabKey>("overview");
  const [status, setStatus] = useState<StatusKey>(INITIAL_STATUS);
  const [approved, setApproved] = useState<number[]>([]);
  // The row arrival plays on a REAL view change only, never on the first paint
  // (where the block reveal already carries the entrance) and never on a
  // repaint such as approving a change order.
  const [switched, setSwitched] = useState(false);

  const changes = CHANGES.map((c, i) => (approved.includes(i) ? { ...c, st: "ok" as const } : c));
  const expTotal = EXPENSES.reduce((a, e) => a + e.amt, 0);

  const selectTab = useCallback((k: TabKey) => {
    setTab(k);
    setSwitched(true);
  }, []);

  /* ---------- Keep the active tab on screen ------------------------------
     Measured against the rail's own box rather than offsetLeft: the tab's
     offsetParent is the fixed page root, so offsetLeft would carry the page's
     own offset into the sum. */
  useEffect(() => {
    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const el = wrap.querySelector<HTMLElement>(".mjd-tab.mjd-on");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const delta = r.left - w.left - (w.width - r.width) / 2;
    wrap.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [tab]);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll ---------- */
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
    // The blocks that exist at mount only. A view mounted later by a tab tap
    // is NOT decorated — it arrives with its own row stagger instead, and an
    // undecorated element renders at full opacity, so nothing can be stranded
    // invisible by an observer that stopped watching.
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("mjd-rv");
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
          t.classList.add("mjd-rv-in");
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

  /* ---------- Motion: graph-paper parallax ------------------------------- */
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

  /* ---------- Motion: press stamp, delegated from the root ---------------
     Bound to the root rather than to the controls that exist at mount: the
     tab views replace their controls wholesale, and a listener attached at
     mount would lose every one of them on the first tab tap. */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      ".mjd-btn, .mjd-tab, .mjd-sbtn",
    );
    if (!el) return;
    el.classList.remove("mjd-pressed");
    void el.offsetWidth;
    el.classList.add("mjd-pressed");
  }, []);
  const onRootAnimEnd = useCallback((e: React.AnimationEvent) => {
    const el = e.target as HTMLElement;
    if (el.classList?.contains("mjd-pressed")) el.classList.remove("mjd-pressed");
  }, []);

  return (
    <div
      className="jf-mobile-job-detail"
      onClick={onRootClick}
      onAnimationEnd={onRootAnimEnd}
    >
      {/* Shared handheld chrome: dark topbar + slide-out drawer + icon sprite.
          It owns its own state and reads its token contract off this root. */}
      <MobileNav />

      <main className="mjd-scroll" ref={scrollRef}>
        <div className="mjd-content" ref={contentRef}>
          {/* ============ PAGE HEAD ============ */}
          <div className="mjd-head">
            <div className="mjd-kick">
              Job status ·{" "}
              <span className={`mjd-st${ST_MOD[status]}`}>{ST[status].l}</span>
            </div>
            <h1 className="mjd-title">{JOB.title}</h1>
            <div className="mjd-dates">{JOB.dates}</div>
          </div>

          {/* ============ TAB RAIL ============ */}
          <div className="mjd-tabwrap" ref={tabWrapRef}>
            <div className="mjd-tabs" role="tablist" aria-label="Job sections">
              {TABS.map(([key, label, count]) => (
                <button
                  key={key}
                  className={`mjd-tab${tab === key ? " mjd-on" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => selectTab(key)}
                >
                  {label}
                  {count !== null && <i>{count}</i>}
                </button>
              ))}
            </div>
          </div>

          {/* ============ VIEW ============
              Keyed on the tab: React remounts the subtree on a real view
              change, which is exactly when the row arrival should play. */}
          <div className="mjd-view" key={tab}>
            {tab === "overview" && (
              <>
                <section className="mjd-card">
                  <div className="mjd-h">
                    <h2 className="mjd-t">Overview</h2>
                  </div>

                  <div className="mjd-status">
                    <div className="mjd-sec-l">Set up the status</div>
                    <div className="mjd-status-row">
                      {STATUS_BUTTONS.map(([key, label]) => (
                        <button
                          key={key}
                          className={`mjd-sbtn mjd-sbtn--${key}${status === key ? " mjd-on" : ""}`}
                          type="button"
                          aria-pressed={status === key}
                          onClick={() => setStatus(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mjd-fields">
                    <div className="mjd-f">
                      <span>Client</span>
                      <b>{JOB.client}</b>
                    </div>
                    <div className="mjd-f">
                      <span>Crew</span>
                      <b>{CREW.length} assigned</b>
                    </div>
                    <div className="mjd-f">
                      <span>Expenses</span>
                      <b>
                        {fmt(expTotal)} · {EXPENSES.length}
                      </b>
                    </div>
                    <div className="mjd-f">
                      <span>Dates</span>
                      <b>{JOB.fieldDates}</b>
                    </div>
                  </div>

                  <div className="mjd-sec">
                    <div className="mjd-sec-l">Scope of work</div>
                    <p>{JOB.scopeOfWork}</p>
                  </div>
                  <div className="mjd-sec">
                    <div className="mjd-sec-l">Notes</div>
                    <p>{JOB.notes}</p>
                  </div>
                </section>

                {/* The desktop's right-hand column, now the block that follows
                    Overview. On a phone the contact rows are the page's most
                    tapped content, so they keep their own card and frame. */}
                <section className="mjd-card">
                  <div className="mjd-h">
                    <h2 className="mjd-t">Client contact</h2>
                  </div>
                  <div className="mjd-c-row">
                    <Icon id="i-users" />
                    {JOB.contact.name}
                  </div>
                  {/* The whole row is the anchor — see the note on
                      `a.mjd-c-row` in the stylesheet: an inline link around
                      13px mono type is a 20px tap target. */}
                  <a className="mjd-c-row mjd-mono" href={JOB.contact.phoneHref}>
                    <Icon id="i-phone" />
                    <span className="mjd-c-link">{JOB.contact.phone}</span>
                  </a>
                  <a className="mjd-c-row mjd-mono" href={`mailto:${JOB.contact.email}`}>
                    <Icon id="i-msg" />
                    <span className="mjd-c-link">{JOB.contact.email}</span>
                  </a>
                  <div className="mjd-c-row">
                    <Icon id="i-pin" />
                    {JOB.contact.address}
                  </div>
                </section>
              </>
            )}

            {tab === "schedule" && (
              <section className="mjd-card">
                <div className="mjd-h">
                  <h2 className="mjd-t">Schedule</h2>
                  <span className="mjd-s">{EVENTS.length} on the calendar</span>
                </div>
                {EVENTS.map((e, i) => (
                  <div
                    className={`mjd-row${switched ? " mjd-rowin" : ""}`}
                    style={rowVar(i)}
                    key={e.t}
                  >
                    <div>
                      <div className="mjd-row-n">{e.t}</div>
                      <div className="mjd-row-m">
                        {e.d} · {e.m}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mjd-total mjd-foot">
                  <button className="mjd-btn mjd-btn-ghost mjd-btn-block" type="button">
                    <Icon id="i-cal" />
                    Add to schedule
                  </button>
                </div>
              </section>
            )}

            {tab === "crew" && (
              <section className="mjd-card">
                <div className="mjd-h">
                  <h2 className="mjd-t">Crew</h2>
                  <span className="mjd-s">confirm via portal link</span>
                </div>
                {CREW.map((w, i) => (
                  <div
                    className={`mjd-row${switched ? " mjd-rowin" : ""}`}
                    style={rowVar(i)}
                    key={w.n}
                  >
                    <div>
                      <div className="mjd-row-n">{w.n}</div>
                      <div className="mjd-row-m">
                        {w.r} · {w.ph}
                      </div>
                    </div>
                    <span className={`mjd-b ${w.st === "ok" ? "mjd-b--ok" : "mjd-b--wait"}`}>
                      {w.st === "ok" ? "Confirmed" : "Pending"}
                    </span>
                  </div>
                ))}
                <div className="mjd-total mjd-foot">
                  <button className="mjd-btn mjd-btn-ghost mjd-btn-block" type="button">
                    <Icon id="i-userplus" />
                    Assign worker
                  </button>
                </div>
              </section>
            )}

            {tab === "changes" && (
              <section className="mjd-card">
                <div className="mjd-h">
                  <h2 className="mjd-t">Change orders</h2>
                  <span className="mjd-s">client-signed extras</span>
                </div>
                {changes.map((c, i) => (
                  <div
                    className={`mjd-co${switched ? " mjd-rowin" : ""}`}
                    style={rowVar(i)}
                    key={c.id}
                  >
                    <div className="mjd-row-n">
                      {c.id} · {c.t}
                    </div>
                    <div className="mjd-row-m">{c.m}</div>
                    <div className="mjd-co-foot">
                      <span className="mjd-amt">{fmt(c.amt)}</span>
                      {c.st === "ok" ? (
                        <span className="mjd-b mjd-b--ok">Approved</span>
                      ) : (
                        <>
                          <span className="mjd-b mjd-b--warn">Pending</span>
                          <button
                            className="mjd-btn mjd-btn-primary"
                            type="button"
                            onClick={() => setApproved((a) => (a.includes(i) ? a : [...a, i]))}
                          >
                            Approve
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {tab === "photos" && (
              <section className="mjd-card">
                <div className="mjd-h">
                  <h2 className="mjd-t">Photos</h2>
                  <span className="mjd-s">Before · Progress · After</span>
                </div>
                <div className="mjd-photos">
                  {PHOTOS.map((p, i) => (
                    <div
                      className={`mjd-ph${switched ? " mjd-rowin" : ""}`}
                      style={rowVar(i)}
                      key={p.c}
                    >
                      <div className="mjd-ph-img">
                        <span className="mjd-ph-k">{p.k}</span>
                      </div>
                      <div className="mjd-ph-c">{p.c}</div>
                    </div>
                  ))}
                </div>
                <div className="mjd-total mjd-foot14">
                  <button className="mjd-btn mjd-btn-ghost mjd-btn-block" type="button">
                    <Icon id="i-plus" />
                    Upload
                  </button>
                </div>
              </section>
            )}

            {tab === "expenses" && (
              <section className="mjd-card">
                <div className="mjd-h">
                  <h2 className="mjd-t">Expenses</h2>
                  <span className="mjd-s">logged on this job</span>
                </div>
                {EXPENSES.map((e, i) => (
                  <div
                    className={`mjd-row${switched ? " mjd-rowin" : ""}`}
                    style={rowVar(i)}
                    key={e.v}
                  >
                    <div>
                      <div className="mjd-row-n">{e.v}</div>
                      <div className="mjd-row-m">{e.m}</div>
                    </div>
                    <span className="mjd-amt">{fmt(e.amt)}</span>
                  </div>
                ))}
                <div className="mjd-total">
                  <span>Total</span>
                  <b>{fmt(expTotal)}</b>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* ============ THUMB-ZONE ACTION BAR ============ */}
      <div className="mjd-bar">
        <button className="mjd-btn mjd-btn-primary mjd-btn-block" type="button">
          <Icon id="i-file" />
          View proposal
        </button>
      </div>
    </div>
  );
}
