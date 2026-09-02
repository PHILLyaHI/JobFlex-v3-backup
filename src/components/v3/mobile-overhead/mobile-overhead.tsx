"use client";

// OVERHEAD · HANDHELD — the monthly worksheet for recurring business costs.
//
// Stands beside the desktop build (the `data-panel="overhead"` section of
// financials-content.tsx + overhead-behavior.ts, both untouched) and shares its
// whole data layer verbatim: the shapes and the fold in financials-data.ts, the
// reads in lib/overhead.ts, the one write in actions/overhead.ts. Nothing here
// is a fixture and nothing here is a second endpoint.
//
// WHAT THE PAGE IS. Rent, insurance, the truck and the software never touch a
// job, so per-job math ("job paid $10k, materials $6k, made $4k") says whether
// the WORK paid and can never say whether the COMPANY paid. This sheet carries
// the other half — one record per calendar month, split fixed vs scaling — and
// the coverage bar measures the month's net from jobs against it.
//
// WHY THIS IS REACT AND THE DESKTOP IS IMPERATIVE. The desktop panel is one
// tab inside a 2000-line static page whose behavior module fills `#id` regions;
// this route renders nothing else, so state belongs in state. The MATH is not
// re-implemented — `overheadTotals` is imported, so the two surfaces cannot
// disagree about what "covered" means.
//
// WHY THE WHOLE MONTH STRIP ARRIVES AS PROPS. Twelve months of job money and
// every sheet the org has saved are a few dozen small rows. Handing them over
// at once is what makes stepping months instant; only SAVING crosses the wire.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { saveMonthlyOverhead } from "@/actions/overhead";
import {
  OVERHEAD_FIXED,
  OVERHEAD_SCALING,
  emptyOverheadSheet,
  overheadTotals,
  type OverheadMonth,
  type OverheadSheet,
} from "@/components/v3/financials-blueprint/financials-data";
import "./mobile-overhead.css";

type NoteTone = "" | "warn" | "ok" | "bad";

export type MobileOverheadProps = {
  /** Oldest first — the same twelve months the desktop chart draws. */
  months: OverheadMonth[];
  /** Saved sheets keyed "YYYY-MM". A month with no entry is simply absent. */
  sheets: Record<string, OverheadSheet>;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Server actions reject with a message written for the user. Show that text;
 *  fall back to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Save failed. Check your connection and try again.";
  }
  return msg;
}

function Icon({ id }: { id: string }) {
  return (
    <svg className="moh-ic" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function MobileOverhead({ months, sheets: saved }: MobileOverheadProps) {
  // ---- The book of sheets, local and mutable ---------------------------
  // Edits live here the moment they are typed, so stepping to last month and
  // back never loses what was half-entered; a successful save replaces the
  // month's copy with the server's own row.
  const [book, setBook] = useState<Record<string, OverheadSheet>>(() => {
    const out: Record<string, OverheadSheet> = {};
    for (const m of months) {
      out[m.key] = saved[m.key] ? { ...saved[m.key] } : emptyOverheadSheet(m.year, m.month);
    }
    return out;
  });
  /** Months edited since their last save. Drives the "Unsaved" note. */
  const [dirty, setDirty] = useState<ReadonlySet<string>>(() => new Set<string>());
  // Opens on the newest month — the one being lived in, not the oldest on file.
  const [idx, setIdx] = useState(Math.max(0, months.length - 1));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: NoteTone }>({ text: "", tone: "" });

  /** What is being TYPED right now, per field, as raw text.
   *
   *  Without it a `type="number"` bound to a parsed number cannot hold a
   *  half-typed value: "0" round-trips to 0 and renders as the empty
   *  placeholder, and "10." parses to 10 so the decimal point is eaten as it is
   *  pressed. The draft is authoritative only while the field has focus and is
   *  dropped on blur and on every month step. */
  const [draft, setDraft] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const month = months[idx];
  const sheet = month ? book[month.key] : undefined;
  const isDirty = month ? dirty.has(month.key) : false;

  const totals = useMemo(
    () =>
      sheet && month
        ? overheadTotals(sheet, month)
        : { fixed: 0, variable: 0, total: 0, net: 0, left: 0, pct: 100, covered: true, empty: true },
    [sheet, month],
  );

  // Nothing entered is not "0% covered" — that reads as a failing month when it
  // is really an unfilled one — and not "covered" either. The shared fold flags
  // it as `empty`, and both surfaces draw the same neutral state from that one
  // flag rather than each deciding for itself.
  const untouched = totals.empty;

  /* ---------- Editing ---------------------------------------------------- */

  const patch = useCallback(
    (fn: (s: OverheadSheet) => OverheadSheet) => {
      if (!month) return;
      const key = month.key;
      setBook((prev) => ({ ...prev, [key]: fn(prev[key]) }));
      setDirty((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      // A figure changed, so the last save's verdict no longer describes what
      // is on screen. Clearing it is honest; an error stays until it is fixed.
      setNote((n) => (n.tone === "ok" ? { text: "", tone: "" } : n));
    },
    [month],
  );

  const onAmount = useCallback(
    (key: string, raw: string) => {
      setDraft((d) => ({ ...d, [key]: raw }));
      const parsed = Number(raw);
      const v = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      patch((s) => ({ ...s, [key]: v }));
    },
    [patch],
  );

  const onUnit = useCallback(
    (key: string, pctKey: string, wantPct: boolean) => {
      if (!sheet) return;
      if (Boolean(sheet[pctKey as keyof OverheadSheet]) === wantPct) return;
      // 40000 dollars is not 40000 percent. Switching units clears the figure
      // rather than reading it as an absurdity in the other unit.
      setDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      patch((s) => ({ ...s, [pctKey]: wantPct, [key]: 0 }));
    },
    [sheet, patch],
  );

  const step = useCallback(
    (delta: number) => {
      setIdx((i) => Math.max(0, Math.min(months.length - 1, i + delta)));
      // The drafts belong to the month that is leaving.
      setDraft({});
      setNote({ text: "", tone: "" });
    },
    [months.length],
  );

  /* ---------- The one write ---------------------------------------------- */

  const save = useCallback(async () => {
    if (saving || !month || !sheet) return;
    setSaving(true);
    setNote({ text: "Saving…", tone: "" });
    try {
      const row = await saveMonthlyOverhead({ ...sheet, year: month.year, month: month.month });
      const key = month.key;
      setBook((prev) => ({ ...prev, [key]: { ...row } }));
      setDirty((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setDraft({});
      setNote({ text: "Saved", tone: "ok" });
    } catch (err) {
      setNote({ text: actionError(err), tone: "bad" });
    } finally {
      setSaving(false);
    }
  }, [saving, month, sheet]);

  /* ---------- Motion: reveal on load ------------------------------------- */
  // Applied ONCE, at mount, to the blocks that exist then. Never through a
  // MutationObserver: this page re-renders on every keystroke, and an observer
  // would replay the whole entrance each time a digit is typed.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const content = contentRef.current;
    if (!content) return;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("moh-rv");
      el.style.transitionDelay = `${i * 60}ms`;
    });
    const raf = requestAnimationFrame(() => {
      blocks.forEach((el) => el.classList.add("moh-rv-in"));
    });
    const done = window.setTimeout(() => {
      blocks.forEach((el) => {
        el.style.transitionDelay = "";
      });
    }, 60 * blocks.length + 460);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax -------------------------------- */
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

  /* ---------- Motion: press stamp, delegated from the root ---------------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      ".moh-btn, .moh-tog-b, .moh-step",
    );
    if (!el) return;
    el.classList.remove("moh-pressed");
    void el.offsetWidth;
    el.classList.add("moh-pressed");
  }, []);
  const onRootAnimEnd = useCallback((e: React.AnimationEvent) => {
    const el = e.target as HTMLElement;
    if (el.classList?.contains("moh-pressed")) el.classList.remove("moh-pressed");
  }, []);

  /* ---------- Field ------------------------------------------------------- */

  const field = (key: string, label: string, pctKey?: string) => {
    const s = sheet;
    const isPct = Boolean(pctKey && s && s[pctKey as keyof OverheadSheet]);
    const num = s ? Number(s[key as keyof OverheadSheet] ?? 0) : 0;
    // An untouched field stays EMPTY rather than printing a 0 the user has to
    // clear before typing. The placeholder already reads "0".
    const value = draft[key] ?? (num ? String(num) : "");
    return (
      <div className={`moh-row${pctKey ? " is-scale" : ""}${isPct ? " is-pct" : ""}`} key={key}>
        <label className="moh-name" htmlFor={`moh-f-${key}`}>
          {label}
        </label>
        <span className="moh-in">
          <i className="moh-unit" aria-hidden="true">
            {isPct ? "%" : "$"}
          </i>
          <input
            id={`moh-f-${key}`}
            className="moh-input"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            placeholder="0"
            value={value}
            aria-label={isPct ? `${label}, percent of revenue` : `${label}, dollars`}
            onChange={(e) => onAmount(key, e.target.value)}
            onBlur={() =>
              setDraft((d) => {
                const next = { ...d };
                delete next[key];
                return next;
              })
            }
          />
        </span>
        {pctKey && (
          <span className="moh-tog" role="group" aria-label={`${label} unit`}>
            <button
              type="button"
              className={`moh-tog-b${isPct ? "" : " is-on"}`}
              aria-pressed={!isPct}
              onClick={() => onUnit(key, pctKey, false)}
            >
              $
            </button>
            <button
              type="button"
              className={`moh-tog-b${isPct ? " is-on" : ""}`}
              aria-pressed={isPct}
              onClick={() => onUnit(key, pctKey, true)}
            >
              %
            </button>
          </span>
        )}
      </div>
    );
  };

  /* ---------- Verdict copy ------------------------------------------------ */
  // Blunt and concrete, the desktop's own wording. Three states, one line each.
  const verdict = untouched
    ? { cls: " is-empty", head: "Nothing entered", sub: "Fill the sheet below" }
    : totals.covered
      ? {
          cls: " is-ok",
          head: "Overhead covered",
          sub: totals.left > 0 ? `${money(totals.left)} is true profit` : "Broke even",
        }
      : {
          cls: "",
          head: `${Math.round(totals.pct)}% covered`,
          sub: `${money(-totals.left)} short`,
        };

  return (
    <div className="jf-mobile-overhead" onClick={onRootClick} onAnimationEnd={onRootAnimEnd}>
      {/* Shared handheld chrome: dark topbar + slide-out drawer + icon sprite.
          It owns its own state and reads its token contract off this root. */}
      <MobileNav />

      <main className="moh-scroll" ref={scrollRef}>
        <div className="moh-content" ref={contentRef}>
          <div className="moh-head">
            <div className="moh-kick">Financials</div>
            <h1 className="moh-title">Overhead</h1>
          </div>

          {!month || !sheet ? (
            /* No months on file at all — nothing has been booked and nothing
               can be measured against it yet. */
            <div className="moh-empty">
              <b>No months yet</b>
              <span>Book a job to start the sheet</span>
            </div>
          ) : (
            <>
              {/* ============ COVERAGE ============ */}
              <section className="moh-card moh-cover" aria-label="Coverage">
                <div className="moh-cursor">
                  <button
                    type="button"
                    className="moh-step"
                    disabled={idx <= 0}
                    aria-label="Previous month"
                    onClick={() => step(-1)}
                  >
                    <Icon id="i-chevl" />
                  </button>
                  <span className="moh-cursor-lbl">{month.label}</span>
                  <button
                    type="button"
                    className="moh-step"
                    disabled={idx >= months.length - 1}
                    aria-label="Next month"
                    onClick={() => step(1)}
                  >
                    <Icon id="i-chevr" />
                  </button>
                </div>

                <div className="moh-scope">
                  {month.revenue > 0
                    ? `${money(month.revenue)} in, ${money(month.expenses)} job costs`
                    : "No revenue booked this month"}
                </div>

                <div className={`moh-bar${untouched ? " is-empty" : ""}`}>
                  {!untouched && (
                    <div
                      className={`moh-bar-fill${totals.covered ? " is-ok" : ""}`}
                      style={{ width: `${totals.pct.toFixed(1)}%` }}
                    />
                  )}
                </div>

                <div className={`moh-verdict${verdict.cls}`} role="status">
                  <b>{verdict.head}</b>
                  <span>{verdict.sub}</span>
                </div>

                <div className="moh-figs">
                  <div className="moh-fig">
                    <span className="moh-lbl">Net from jobs</span>
                    <b>{money(totals.net)}</b>
                  </div>
                  <div className="moh-fig">
                    <span className="moh-lbl">Overhead</span>
                    <b>{money(totals.total)}</b>
                  </div>
                  <div className="moh-fig">
                    <span className="moh-lbl">{totals.left >= 0 ? "True profit" : "Shortfall"}</span>
                    <b className={totals.left >= 0 ? "tone-ok" : "tone-bad"}>
                      {money(Math.abs(totals.left))}
                    </b>
                  </div>
                </div>
              </section>

              {/* ============ FIXED ============ */}
              <section className="moh-card" aria-label="Fixed costs">
                <div className="moh-h">
                  <div>
                    <div className="moh-lbl">Fixed</div>
                    <div className="moh-sub">Same every month.</div>
                  </div>
                  <span className="moh-sum">{money(totals.fixed)}</span>
                </div>
                <div className="moh-grid">
                  {OVERHEAD_FIXED.map((f) => field(f.key, f.label))}
                </div>
              </section>

              {/* ============ SCALING ============ */}
              <section className="moh-card" aria-label="Costs that scale with revenue">
                <div className="moh-h">
                  <div>
                    <div className="moh-lbl">Scales with revenue</div>
                    <div className="moh-sub">Dollars or percent.</div>
                  </div>
                  <span className="moh-sum">{money(totals.variable)}</span>
                </div>
                <div className="moh-grid">
                  {OVERHEAD_SCALING.map((f) => field(f.key, f.label, f.pctKey))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {/* ============ THUMB-ZONE SAVE FOOT ============ */}
      {month && sheet && (
        <div className="moh-foot">
          <div
            className={`moh-note${note.text ? (note.tone ? ` is-${note.tone}` : "") : isDirty ? " is-warn" : ""}`}
            role="status"
            aria-live="polite"
            hidden={!note.text && !isDirty}
          >
            {note.text || (isDirty ? "Unsaved" : "")}
          </div>
          <div className="moh-foot-row">
            <div className="moh-foot-l">
              <span className="moh-lbl">Total overhead</span>
              <b className="moh-foot-val">{money(totals.total)}</b>
            </div>
            <button
              type="button"
              className="moh-btn moh-btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              <Icon id="i-check" />
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
