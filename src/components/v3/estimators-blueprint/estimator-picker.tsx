"use client";

// Estimator picker — the "New Estimate" dialog.
//
// VERBATIM PORT of `jobflex-estimator-picker-blueprint (10).html`. The mockup's
// own sidebar, topbar, `.content` wrapper and the whole Overview page under the
// dialog were DROPPED, not forked: this component mounts inside blueprint-shell
// (and inside MobileNav on handheld), both of which already render that chrome.
// See estimators-global.css for the full drop list and the shell-vs-source
// token check. Only the `.estp*` block, and the four document-level rules that
// reach into it, were carried across.
//
// Mounted ONCE in each shell, beside the command palette, for the same
// reason: it is reachable from the topbar on every page, so it belongs to the
// chrome rather than to any one route. It opens on the `jf:estimator-picker`
// document event, which is the pattern the ⌘K palette already established —
// the topbar button stays a dumb dispatcher and does not have to own state or
// reach across the tree for it.
//
// It replaced a /dashboard/estimators PAGE and its sidebar item. Choosing an
// engine is a decision you make on the way to somewhere, not a destination you
// navigate to and look at, so it costs a click from wherever you already are
// instead of a page load and a trip back.
//
// Styling lives in estimators-global.css, NOT in estimators.module.css: this
// renders outside `.content`, and the module's `.bp` class is only applied
// while an /dashboard/estimators* route is on screen. A dialog reachable from
// every page cannot depend on one page's stylesheet being active.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ENGINES, ACTIVE_COUNT, QUEUED_COUNT, type EngineDiagram } from "./estimators-data";

// Split once at module scope — the roster is a constant, so there is nothing
// for the component to recompute on a render or memoise.
const active = ENGINES.filter((e) => e.status === "active");
const queued = ENGINES.filter((e) => e.status === "queued");

/** The drawing this engine makes, on the card's blueprint-blue graph paper.
    Straight from the source's DIA map — same viewBox, same path data, same
    `ln` / `bp` / `dim` line weights, same annotation text. */
function Diagram({ kind }: { kind: EngineDiagram }) {
  return (
    <svg className="estp-dia" viewBox="0 0 164 72" aria-hidden="true">
      {/* ROOF PLAN — вид сверху: контур, ridge, хипы 45°, стрелки уклона 4:12, размер, north arrow */}
      {kind === "roof" && (
        <>
          <rect className="ln" x="34" y="14" width="96" height="44" />
          <path className="ln" d="M62 36 H102" />
          <path className="ln" d="M34 14 L62 36 M34 58 L62 36 M130 14 L102 36 M130 58 L102 36" />
          <path className="bp" d="M82 32 V20 M79 23 L82 20 L85 23" />
          <path className="bp" d="M82 40 V52 M79 49 L82 52 L85 49" />
          <text x="88" y="26">4:12</text>
          <path className="dim" d="M34 66 H130 M34 63 V69 M130 63 V69" />
          <text x="82" y="64" textAnchor="middle">{'38\'-0"'}</text>
          <circle className="bp" cx="148" cy="21" r="7" />
          <path className="bp" d="M148 26 V16 M145 19 L148 16 L151 19" />
          <text x="148" y="38" textAnchor="middle">N</text>
        </>
      )}
      {/* FENCE ELEVATION — столбы с кэпами, рейки, пикеты (прорисованы и осями), грунт со штриховкой, размеры */}
      {kind === "fence" && (
        <>
          <path className="ln" d="M10 56 H154" />
          <path
            className="dim"
            d="M18 56 l-5 6 M32 56 l-5 6 M46 56 l-5 6 M60 56 l-5 6 M74 56 l-5 6 M88 56 l-5 6 M102 56 l-5 6 M116 56 l-5 6 M130 56 l-5 6 M144 56 l-5 6"
          />
          <rect className="ln" x="22" y="20" width="4" height="36" />
          <rect className="ln" x="74" y="20" width="4" height="36" />
          <rect className="ln" x="126" y="20" width="4" height="36" />
          <path
            className="ln"
            d="M20 20 L30 20 L28 15 L22 15 Z M72 20 L82 20 L80 15 L74 15 Z M124 20 L134 20 L132 15 L126 15 Z"
          />
          <path className="ln" d="M26 27 H74 M26 49 H74 M78 27 H126 M78 49 H126" />
          <path className="ln" d="M32 52 V23 M40 52 V23 M48 52 V23 M56 52 V23 M64 52 V23" />
          <path className="bp" d="M88 52 V23 M102 52 V23 M116 52 V23" strokeDasharray="3 3" />
          <path className="dim" d="M140 20 V56 M137 20 H143 M137 56 H143" />
          <text x="146" y="40">{'6\'-0"'}</text>
          <path className="dim" d="M24 10 H76 M24 7 V13 M76 7 V13" />
          <text x="50" y="8" textAnchor="middle">{'8\'-0" O.C.'}</text>
        </>
      )}
      {/* DETAIL — секция стена/фундамент, штриховка бетона, выноски-кружки 1·2·3 (= line items) */}
      {kind === "sheet" && (
        <>
          <rect className="ln" x="28" y="40" width="50" height="20" />
          <path className="dim" d="M31 58 L47 42 M41 58 L57 42 M51 58 L67 42 M61 58 L76 43" />
          <path className="ln" d="M42 40 V12 M52 40 V12" />
          <path className="bp" d="M39 12 L55 8" />
          <circle className="bp" cx="100" cy="16" r="8" />
          <text x="100" y="19" textAnchor="middle">1</text>
          <path className="dim" d="M92 18 L54 22" />
          <circle className="bp" cx="116" cy="38" r="8" />
          <text x="116" y="41" textAnchor="middle">2</text>
          <path className="dim" d="M108 40 L78 46" />
          <circle className="bp" cx="100" cy="60" r="8" />
          <text x="100" y="63" textAnchor="middle">3</text>
          <path className="dim" d="M92 60 L66 56" />
          <text x="132" y="62">DETAIL 3</text>
        </>
      )}
      {/* HOUSE ELEVATION — фасад: фронтон, труба, дверь, окна с переплётами, грунт со штриховкой */}
      {kind === "prose" && (
        <>
          <path className="ln" d="M14 60 H150" />
          <path
            className="dim"
            d="M22 60 l-5 6 M38 60 l-5 6 M54 60 l-5 6 M70 60 l-5 6 M86 60 l-5 6 M102 60 l-5 6 M118 60 l-5 6 M134 60 l-5 6 M148 60 l-5 6"
          />
          <rect className="ln" x="40" y="30" width="84" height="30" />
          <path className="ln" d="M34 30 L82 8 L130 30 Z" />
          <path className="ln" d="M100 14 V6 H108 V10" />
          <rect className="ln" x="74" y="40" width="16" height="20" />
          <circle className="bp" cx="87" cy="51" r="1.4" />
          <rect className="ln" x="48" y="38" width="14" height="12" />
          <path className="bp" d="M55 38 V50 M48 44 H62" />
          <rect className="ln" x="102" y="38" width="14" height="12" />
          <path className="bp" d="M109 38 V50 M102 44 H116" />
          <path className="bp" d="M40 34 H124" strokeDasharray="4 3" />
          <text x="140" y="12" textAnchor="end">A-201</text>
        </>
      )}
    </svg>
  );
}

/** Exit duration — the source's `reduce ? 0 : 190`. */
const EXIT_MS = 190;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function EstimatorPicker() {
  const router = useRouter();
  // Two flags because the source has two classes. `open` drives the `hidden`
  // attribute (`.estp[hidden] { display: none }`); `on` is added a frame later
  // so the enter transition has a start state to leave from — the source's
  // double-requestAnimationFrame, kept.
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set when the dialog is opened FROM a client's record, cleared otherwise.
  // The topbar's New Estimate button opens the picker with no client, and a
  // client id left over from a previous open would silently attach the wrong
  // homeowner to the next estimate anybody started from anywhere in the app.
  const [clientId, setClientId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Whatever had focus when the dialog opened — almost always the topbar's
  // New Estimate button. Focus goes back there on close, so dismissing does not
  // dump the user at the top of the document.
  const returnRef = useRef<HTMLElement | null>(null);
  const exitTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    setLeaving(true);
    setOn(false);
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(
      () => {
        setOpen(false);
        setLeaving(false);
        returnRef.current?.focus();
        returnRef.current = null;
      },
      prefersReducedMotion() ? 0 : EXIT_MS,
    );
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      returnRef.current = document.activeElement as HTMLElement | null;
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
      // `detail.clientId` is optional and read defensively: the topbar
      // dispatches a plain Event, the client record dispatches a CustomEvent.
      const detail = (e as CustomEvent<{ clientId?: string } | undefined>).detail;
      setClientId(detail?.clientId ?? null);
      setLeaving(false);
      setOpen(true);
    }
    document.addEventListener("jf:estimator-picker", onOpen);
    return () => document.removeEventListener("jf:estimator-picker", onOpen);
  }, []);

  // The source's rAF(rAF(add .on; focus first card)).
  useEffect(() => {
    if (!open || leaving) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setOn(true);
        boxRef.current?.querySelector<HTMLButtonElement>(".estp-card")?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [open, leaving]);

  useEffect(() => {
    if (!open || leaving) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Not in the source, which has no competing handler. Kept because the
        // handheld shell binds its own Escape for the nav drawer, and one key
        // press should not dismiss two things.
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, leaving, close]);

  useEffect(
    () => () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  function choose(href: string) {
    // The client rides through to whichever engine was picked. Which engine it
    // is does not matter and is not this dialog's business — the user chose an
    // ENGINE, they had already chosen the CLIENT by starting from their record,
    // and an estimate that forgot the second decision while honouring the first
    // is how a finished proposal ends up saved against nobody. Every engine
    // reads the same `?client=` param, so there is one spelling to keep.
    const to = clientId ? `${href}?client=${encodeURIComponent(clientId)}` : href;
    // Navigate first, then play the exit: the dialog is leaving either way, and
    // waiting 190ms before routing makes the click feel sticky.
    router.push(to as Route);
    close();
  }

  return (
    <div
      className={["estp", on ? "on" : "", leaving ? "leaving" : ""].filter(Boolean).join(" ")}
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-labelledby="estpTitle"
    >
      <div className="estp-bg" onClick={close} />

      <div className="estp-box" ref={boxRef}>
        <div className="estp-head">
          <div className="estp-title" id="estpTitle">
            New estimate
          </div>
          <span className="estp-kick">
            {ACTIVE_COUNT} active &middot; {QUEUED_COUNT} queued
          </span>
          <button className="estp-x" type="button" aria-label="Close" onClick={close}>
            <svg className="ic">
              <use href="#i-x" />
            </svg>
          </button>
        </div>

        {/* Two blocks, not one: the four live engines sit in a 2×2 catalogue at
            full card weight, and the queued trades run underneath as a thin
            strip of dashed stubs. A single grid would have stretched the stubs
            to card height and given three unbuildable trades the same visual
            footprint as the four you can actually start. */}
        <div className="estp-grid">
          {active.map((engine) => (
            <button
              key={engine.id}
              type="button"
              className="estp-card"
              onClick={() => choose(engine.href)}
            >
              <span className="estp-dia-cell">
                <Diagram kind={engine.diagram} />
              </span>
              <span className="estp-nameline">
                <span className="estp-nm">
                  <span className="estp-name">{engine.title}</span>
                  <span className="estp-method">{engine.method}</span>
                </span>
                <span className="estp-time">{engine.spec.time}</span>
              </span>
            </button>
          ))}
        </div>

        {queued.length > 0 && (
          <div className="estp-queue">
            <span className="estp-queue-label">In the queue</span>
            {queued.map((engine) => (
              <span key={engine.id} className="estp-stub">
                <i>{engine.no}</i>
                {engine.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
