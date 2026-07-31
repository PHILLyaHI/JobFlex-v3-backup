"use client";

// Estimator picker — the "New Estimate" dialog.
//
// Mounted ONCE in the blueprint shell, beside the command palette, for the same
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

/** Line art on the card's graph-paper ground — the drawing this engine makes. */
function Diagram({ kind }: { kind: EngineDiagram }) {
  return (
    <svg className="estp-dia" viewBox="0 0 120 56" aria-hidden="true">
      {kind === "roof" && (
        <>
          <path d="M10 44 L40 16 L70 44 Z" />
          <path d="M70 44 L92 24 L110 44 Z" />
          <path d="M40 16 L92 24" strokeDasharray="3 3" />
        </>
      )}
      {kind === "fence" && (
        <>
          <path d="M12 40 L108 40" />
          <path d="M20 40 V22 M44 40 V22 M68 40 V22 M92 40 V22" />
          <path d="M12 30 L108 30" strokeDasharray="3 3" />
        </>
      )}
      {kind === "sheet" && (
        <>
          <rect x="20" y="10" width="80" height="38" rx="1" />
          <path d="M20 22 L100 22 M20 30 L100 30 M20 38 L100 38" strokeDasharray="3 3" />
          <path d="M72 10 V48" />
        </>
      )}
      {kind === "prose" && (
        <>
          <path d="M14 16 L54 16 M14 24 L48 24 M14 32 L54 32 M14 40 L40 40" />
          <path d="M62 28 L76 28" strokeDasharray="3 3" />
          <rect x="82" y="14" width="26" height="28" rx="1" />
          <path d="M82 24 L108 24 M82 32 L108 32" strokeDasharray="2 3" />
        </>
      )}
    </svg>
  );
}

/** Exit duration — matches the shell's dialog band (enter 280ms, exit 190ms). */
const EXIT_MS = 190;

export function EstimatorPicker() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Whatever had focus when the dialog opened — almost always the topbar's
  // New Estimate button. Focus goes back there on close, so dismissing does not
  // dump the user at the top of the document.
  const returnRef = useRef<HTMLElement | null>(null);
  const exitTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      returnRef.current?.focus();
      returnRef.current = null;
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    function onOpen() {
      returnRef.current = document.activeElement as HTMLElement | null;
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
      setClosing(false);
      setOpen(true);
    }
    document.addEventListener("jf:estimator-picker", onOpen);
    return () => document.removeEventListener("jf:estimator-picker", onOpen);
  }, []);

  useEffect(() => {
    if (!open || closing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closing, close]);

  // Move focus into the dialog so the keyboard lands somewhere useful and the
  // first Tab does not walk the page behind it.
  useEffect(() => {
    if (!open || closing) return;
    boxRef.current?.querySelector<HTMLButtonElement>(".estp-card")?.focus();
  }, [open, closing]);

  useEffect(
    () => () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  function choose(href: string) {
    // Navigate first, then play the exit: the dialog is leaving either way, and
    // waiting 190ms before routing makes the click feel sticky.
    router.push(href as Route);
    close();
  }

  if (!open) return null;

  return (
    <div
      className={closing ? "estp estp--closing" : "estp"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="estpTitle"
    >
      <div className="estp-bg" onClick={close} />

      <div className="estp-box" ref={boxRef}>
        <div className="estp-head">
          <div>
            <span className="estp-kick">
              {ACTIVE_COUNT} active · {QUEUED_COUNT} queued
            </span>
            <div className="estp-title" id="estpTitle">
              New estimate
            </div>
            <p className="estp-lede">Pick the engine that matches the job.</p>
          </div>
          <button className="estp-x" type="button" aria-label="Close" onClick={close}>
            <svg className="ic">
              <use href="#i-x" />
            </svg>
          </button>
        </div>

        {/* Two grids, not one: the four live engines sit in a 2×2 block at full
            card weight, and the queued trades run underneath as a thin strip.
            A single grid would have stretched the stubs to card height and
            given three unbuildable trades the same visual footprint as the
            four you can actually start. */}
        <div className="estp-grid">
          {active.map((engine) => (
            <button
              key={engine.id}
              type="button"
              className="estp-card"
              onClick={() => choose(engine.href)}
            >
              <span className="estp-dia-wrap">
                <Diagram kind={engine.diagram} />
              </span>
              <span className="estp-name">{engine.title}</span>
              <span className="estp-method">{engine.method}</span>
              <dl className="estp-spec">
                <div>
                  <dt>Input</dt>
                  <dd>{engine.spec.input}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>{engine.spec.output}</dd>
                </div>
                <div>
                  <dt>Typ. time</dt>
                  <dd>{engine.spec.time}</dd>
                </div>
              </dl>
              <span className="estp-start">
                Start
                <svg className="ic">
                  <use href="#i-arrow" />
                </svg>
              </span>
            </button>
          ))}
        </div>

        {queued.length > 0 && (
          <div className="estp-queue">
            <span className="estp-queue-label">In the queue</span>
            <div className="estp-queue-row">
              {queued.map((engine) => (
                <div key={engine.id} className="estp-stub" aria-disabled="true">
                  {engine.title}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
