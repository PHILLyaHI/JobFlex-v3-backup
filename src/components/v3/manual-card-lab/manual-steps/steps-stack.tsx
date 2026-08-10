"use client";

// STEPS — the collapsed row and the open card. THE CENTREPIECE OF THE VARIANT.
//
// THE ROW IS A TABLE ROW, NOT A HEADER WITH A SUBTITLE.
// Stacking title over summary is the usual accordion shape and it is the wrong
// one here: ten two-line headers give a ragged left edge, two competing type
// sizes per row and no vertical column the eye can run down. Instead the four
// parts sit on ONE baseline in a fixed grid —
//
//   28px numeral │ 108px title │ summary (flexes, ellipsis) │ figure (right)
//
// — so all ten numerals align, all ten titles align, all ten summaries start at
// the same x, and every figure hangs off the same right edge. Shut, the stack
// reads as the contents page of the document it is building. That alignment is
// the entire reason the title column is a fixed 108px and the titles are the
// short nouns: one long title would push nine summaries out of column.
//
// 72px of height, not 48. The row has to hold a 15px title and a 14px summary
// with real air, and it is the primary click target for the whole page.
//
// THE HEAD DOES NOT MOVE WHEN A CARD OPENS. Row padding and card padding are
// both 32px and the numeral column is 28px in both, so the numeral and the
// title keep their exact x. Only the type SIZE and the surface change. A head
// that shifts 8px sideways on open reads as a glitch, and this variant already
// spends its whole animation budget on not moving things.
//
// NEXT, AT THE FOOT, IS THE FORWARD PATH. The row a user wants after finishing
// section 03 is section 04, and hunting for it in the deck below is the one
// piece of friction one-open-at-a-time introduces. Next also passes align
// "top", because holding position would open the following card at the very
// bottom of the viewport — see use-steps-column.ts.
//
// KEYBOARD. Focusing a shut row opens it, but only when focus is genuinely
// keyboard-driven (`:focus-visible`), so a mouse press does not race the click.
// Tab therefore walks the form forwards, step by step. Nothing here touches
// Escape: there is no state to unwind, and swallowing it would strand the
// shell's own palette.

import type { ReactNode } from "react";
import type { StepFace, StepId } from "./steps-summaries";
import type { OpenAlign } from "./use-steps-column";
import { Glyph, PATH } from "./steps-ui";
import s from "./manual-steps.module.css";

export type Step = { id: StepId; num: string; title: string };

export function StepRow({
  step,
  face,
  onOpen,
}: {
  step: Step;
  face: StepFace;
  onOpen: (id: StepId, align?: OpenAlign) => void;
}) {
  return (
    <button
      type="button"
      className={s.row}
      data-step-id={step.id}
      aria-expanded={false}
      onClick={() => onOpen(step.id)}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) onOpen(step.id);
      }}
    >
      <span className={s.rowNum}>{step.num}</span>
      <span className={s.rowTitle}>{step.title}</span>
      <span className={s.rowSum}>{face.summary}</span>
      <span className={s.rowRight}>
        {face.mark ? (
          <span className={s.rowMark} data-tone={face.mark.tone}>
            {face.mark.text}
          </span>
        ) : null}
        {face.figure ? <span className={s.rowFig}>{face.figure}</span> : null}
      </span>
    </button>
  );
}

export function StepCard({
  step,
  next,
  onOpen,
  children,
}: {
  step: Step;
  next: Step | null;
  onOpen: (id: StepId, align?: OpenAlign) => void;
  children: ReactNode;
}) {
  return (
    <section
      className={s.card}
      data-step-id={step.id}
      aria-current="step"
      aria-labelledby={`st-h-${step.id}`}
    >
      <header className={s.cardHead}>
        <span className={s.cardNum}>{step.num}</span>
        {/* tabIndex -1 + data-step-focus: the landing pad the hook moves focus
            to when the button that used to be here unmounts. */}
        <h2 className={s.cardTitle} id={`st-h-${step.id}`} tabIndex={-1} data-step-focus="">
          {step.title}
        </h2>
      </header>

      <div className={s.cardBody}>{children}</div>

      {next ? (
        <div className={s.cardFoot}>
          <button type="button" className={s.next} onClick={() => onOpen(next.id, "top")}>
            <span className={s.nextLabel}>Next</span>
            <span className={s.nextNum}>{next.num}</span>
            <span className={s.nextTitle}>{next.title}</span>
            <Glyph d={PATH.chevronRight} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
