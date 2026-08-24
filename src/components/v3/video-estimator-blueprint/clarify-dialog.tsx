"use client";

// VIDEO ESTIMATOR — the reading's questions, shown BEFORE anything is priced.
//
// The Smart Proposal's intake dialog (advanced-ai-content.tsx ClarifyDialog),
// carried over with its copy made generic: the same plate, the same
// three-valued settle — answers (some or none) resume pricing, `null` abandons
// it — and the same rule that Escape and the scrim mean abandon, not "price
// anyway", because a stray keystroke must not spend a model call.
//
// Styles come from the page module through `cx`, so this component has no
// stylesheet of its own; the `.clq*` rules in video-estimator.module.css are
// scoped to the shell root, which is where this portals to (the shell's
// `.jf-blueprint`, never `.content` — see `dialogHost`).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { lockScroll } from "@/lib/scrollLock";
import type { ClarifyQuestion } from "@/lib/estimatorSchema";
import type { ClarifyAnswer } from "@/lib/estimate/console-model";

function dialogHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".jf-blueprint") ?? document.body;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ClarifyDialog({
  questions,
  onSettle,
  cx,
  kicker = "Video estimator · Intake",
  heading = "A few quick questions",
  lede = "The walkthrough left gaps for this kind of job. Answer what you can and the estimate is priced against real numbers instead of assumptions — or price it anyway and tighten it afterwards.",
  anywayLabel = "Price anyway",
}: {
  questions: ClarifyQuestion[];
  onSettle: (value: ClarifyAnswer[] | null) => void;
  /** The page module's class mapper. */
  cx: (...names: Array<string | false | null | undefined>) => string;
  kicker?: string;
  heading?: string;
  lede?: string;
  anywayLabel?: string;
}) {
  const [host] = useState<HTMLElement | null>(dialogHost);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [exiting, setExiting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Settles exactly once: Escape during the exit window, or a second press on
  // a button still painted, must not resume pricing twice.
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
      setTimeout(() => onSettle(value), MDL_EXIT_MS);
    },
    [onSettle],
  );

  // Scroll lock, focus in, Tab trap, Escape. The reference-counted lock, never
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

  if (!host) return null;

  const pairs = (): ClarifyAnswer[] =>
    questions
      .filter((q) => (answers[q.id] ?? "").trim())
      .map((q) => ({ question: q.question, answer: (answers[q.id] ?? "").trim() }));
  const answered = pairs().length;

  return createPortal(
    <div
      className={cx("clq")}
      data-exit={exiting ? "1" : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(null);
      }}
    >
      <div
        ref={boxRef}
        className={cx("clq-box")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vclq-title"
        tabIndex={-1}
      >
        <div className={cx("clq-head")}>
          <div className={cx("clq-kicker")}>{kicker}</div>
          <div className={cx("clq-h")} id="vclq-title">
            {heading}
          </div>
          <p className={cx("clq-sub")}>{lede}</p>
        </div>

        <div className={cx("clq-body")}>
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
              <div className={cx("clq-q")} key={q.id}>
                <span className={cx("clq-n")} aria-hidden="true">
                  {i + 1}
                </span>
                <div className={cx("clq-qt")}>
                  <label htmlFor={`vclq-in-${q.id}`}>{q.question}</label>

                  {kind === "select" && q.options ? (
                    <div className={cx("clq-opts")}>
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={cx("clq-opt")}
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
                        className={cx("clq-opt", "clq-opt--other")}
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
                    <div className={cx("clq-numrow")}>
                      <input
                        id={`vclq-in-${q.id}`}
                        type="number"
                        inputMode="decimal"
                        className={cx("clq-in", "clq-num")}
                        value={value}
                        placeholder={q.placeholder ?? "0"}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                      {q.unit ? <span className={cx("clq-unit")}>{q.unit}</span> : null}
                    </div>
                  ) : null}

                  {kind === "text" || isCustom ? (
                    <textarea
                      id={`vclq-in-${q.id}`}
                      className={cx("clq-in")}
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

        <div className={cx("clq-foot")}>
          <span className={cx("clq-count")} role="status" aria-live="polite">
            {answered} of {questions.length} answered
          </span>
          <div className={cx("clq-acts")}>
            <button type="button" className={cx("btn", "btn-ghost")} onClick={() => settle([])}>
              {anywayLabel}
            </button>
            <button
              type="button"
              className={cx("btn", "btn-primary")}
              disabled={answered === 0}
              onClick={() => settle(pairs())}
            >
              Use answers
            </button>
          </div>
        </div>
      </div>
    </div>,
    host,
  );
}
