"use client";

// VIDEO ESTIMATOR · HANDHELD — the reading's questions, as a BOTTOM SHEET.
//
// The desktop asks these in a centred dialog (../video-estimator-blueprint/
// clarify-dialog.tsx). CLAUDE.md puts bottom sheets ahead of modal dialogs on a
// phone, so the same gate is re-cut as a sheet that rises from the bottom edge:
// the questions are read with the thumb already over the answers, and the two
// settle controls land in the thumb zone instead of at the top of a plate the
// keyboard would push off screen.
//
// THE SEMANTICS ARE THE DESKTOP'S, UNCHANGED — and they are load-bearing,
// because a stray gesture must never spend a model call:
//   answers  → resume pricing with them folded into the brief
//   []       → "Price anyway": resume pricing with none
//   null     → abandon; Escape and a tap on the scrim both mean this
// `onSettle` therefore fires exactly once, guarded by a ref, so a second tap on
// a button still painted during the exit cannot resume pricing twice.
//
// Hand-rolled: no Radix, no portal. The sheet renders inside the page root so
// every rule in mobile-video-estimator.css can keep carrying the literal
// `.jf-mobile-video-estimator` prefix; `position: fixed` still escapes to the
// viewport because nothing above it declares a transform.

import { useCallback, useEffect, useRef, useState } from "react";
import { lockScroll } from "@/lib/scrollLock";
import type { ClarifyQuestion } from "@/lib/estimatorSchema";
import type { ClarifyAnswer } from "@/lib/estimate/console-model";

/** Matches the sheet's exit transition in the stylesheet. */
const SHEET_EXIT_MS = 200;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MobileClarifySheet({
  questions,
  onSettle,
}: {
  questions: ClarifyQuestion[];
  onSettle: (value: ClarifyAnswer[] | null) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [exiting, setExiting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  const settle = useCallback(
    (value: ClarifyAnswer[] | null) => {
      if (settled.current) return;
      settled.current = true;
      if (reducedMotion()) {
        onSettle(value);
        return;
      }
      setExiting(true);
      setTimeout(() => onSettle(value), SHEET_EXIT_MS);
    },
    [onSettle],
  );

  // Scroll lock, focus in, Tab trap, Escape — the reference-counted lock, never
  // a hand-rolled body.style.overflow.
  useEffect(() => {
    const release = lockScroll();
    const restore = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const SELECTOR =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(null);
        return;
      }
      if (e.key !== "Tab") return;
      const node = boxRef.current;
      if (!node) return;
      const list = Array.from(node.querySelectorAll<HTMLElement>(SELECTOR));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      release();
      restore?.focus?.();
    };
  }, [settle]);

  const pairs = (): ClarifyAnswer[] =>
    questions
      .filter((q) => (answers[q.id] ?? "").trim())
      .map((q) => ({ question: q.question, answer: (answers[q.id] ?? "").trim() }));
  const answered = pairs().length;

  return (
    <div
      className="mve-sheet-scrim"
      data-exit={exiting ? "1" : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(null);
      }}
    >
      <div
        ref={boxRef}
        className="mve-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mve-clq-title"
        tabIndex={-1}
      >
        <span className="mve-sheet-grip" aria-hidden="true" />
        <div className="mve-sheet-head">
          <div className="mve-sheet-kick">Video estimator · Intake</div>
          <div className="mve-sheet-h" id="mve-clq-title">
            A few quick questions
          </div>
          <p className="mve-sheet-sub">
            The walkthrough left gaps for this kind of job. Answer what you can and the estimate is
            priced against real numbers instead of assumptions — or price it anyway and tighten it
            afterwards.
          </p>
        </div>

        <div className="mve-sheet-body">
          {questions.map((q, i) => {
            const value = answers[q.id] ?? "";
            const isCustom = Boolean(custom[q.id]);
            const kind =
              q.kind === "select" && q.options && q.options.length > 0
                ? "select"
                : q.kind === "number"
                  ? "number"
                  : "text";
            return (
              <div className="mve-q" key={q.id}>
                <span className="mve-q-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="mve-q-t">
                  <label htmlFor={`mve-clq-in-${q.id}`}>{q.question}</label>

                  {kind === "select" && q.options ? (
                    <div className="mve-opts">
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className="mve-opt"
                          data-on={!isCustom && value === opt ? "1" : undefined}
                          aria-pressed={!isCustom && value === opt}
                          onClick={() => {
                            setCustom((c) => ({ ...c, [q.id]: false }));
                            setAnswers((a) => ({ ...a, [q.id]: opt }));
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="mve-opt mve-opt--other"
                        data-on={isCustom ? "1" : undefined}
                        aria-pressed={isCustom}
                        onClick={() => {
                          setCustom((c) => ({ ...c, [q.id]: true }));
                          setAnswers((a) => ({ ...a, [q.id]: "" }));
                        }}
                      >
                        Something else
                      </button>
                    </div>
                  ) : null}

                  {kind === "number" && !isCustom ? (
                    <div className="mve-numrow">
                      <input
                        id={`mve-clq-in-${q.id}`}
                        type="number"
                        inputMode="decimal"
                        className="mve-q-in mve-q-num"
                        value={value}
                        placeholder={q.placeholder ?? "0"}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                      {q.unit ? <span className="mve-q-unit">{q.unit}</span> : null}
                    </div>
                  ) : null}

                  {kind === "text" || isCustom ? (
                    <textarea
                      id={`mve-clq-in-${q.id}`}
                      className="mve-q-in"
                      rows={2}
                      value={value}
                      placeholder={q.placeholder ?? "Type your answer…"}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* The settle controls, stacked, affirmative first — the thumb zone. */}
        <div className="mve-sheet-foot">
          <span className="mve-sheet-count" role="status" aria-live="polite">
            {answered} of {questions.length} answered
          </span>
          <button
            type="button"
            className="mve-btn mve-btn-primary mve-btn-block"
            disabled={answered === 0}
            onClick={() => settle(pairs())}
          >
            Use answers
          </button>
          <button
            type="button"
            className="mve-btn mve-btn-ghost mve-btn-block"
            onClick={() => settle([])}
          >
            Price anyway
          </button>
        </div>
      </div>
    </div>
  );
}
