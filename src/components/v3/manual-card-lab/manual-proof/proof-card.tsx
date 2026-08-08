"use client";

// PROOF CARD — the repeating unit and its footer (route: /dashboard/manual-proof).
//
// THE PROOF FOOTER IS THE WHOLE DESIGN. Every card on this page ends with one:
// a mono, tabular strip across the card's foot, cut off from the body by a 2px
// ink rule, that states in plain arithmetic what this card contributes to the
// price. Read only the footers, top to bottom, and you have read the estimate
// as a running derivation ending in the grand total on the last card.
//
// TWO SPECIES, NEVER THREE (design principle: a dense column needs a small
// fixed set of row grammars that cannot be confused at a squint):
//   · MONEY  — cards that move the price. Kicker "CONTRIBUTES", the arithmetic
//              in mono, and a right-hand slot carrying the RUNNING figure after
//              this card. Ground: paper-deep. Numerals: Inter 900, tabular.
//   · COVER  — cards that contribute no money (basics, scope, terms, options
//              while they only change what prints, files). Kicker "COVERS", the
//              same layout, but the right slot holds a caps state word instead
//              of a figure and the whole strip sits in the muted register.
// The grammar never breaks: a card with nothing to add still states its
// coverage, so the column never has a card that just stops.
//
// THE FLASH. Any control that moves a figure flashes ONLY the footer(s) it
// moved — a sky rule drawn left-to-right across the strip's foot, then erased
// over half a second. Cause and effect are visible without scrolling to find
// out. It is driven straight at the DOM rather than through state: the
// highlight is a one-shot on an element, not a fact about the proposal, and
// toggling a class is exactly the "synchronise with something outside React"
// job an effect exists for. Under prefers-reduced-motion it does not run at
// all — the footer's TEXT is the information, and it changes either way.

import { useEffect, useRef } from "react";
import type { CardMeta } from "./manual-proof-types";
import { reducedMotion } from "./manual-proof-math";
import styles from "./manual-proof.module.css";

/** Local class joiner. Deliberately NOT lib/cn: that runs twMerge, which has
 *  opinions about Tailwind utilities and no business anywhere near a hashed
 *  CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** How long the sky rule stays drawn after the last change. Long enough to
 *  catch out of the corner of an eye while typing, short enough that a footer
 *  is not still lit when you reach the next card. */
const FLASH_MS = 720;

/**
 * Draw the footer's sky rule whenever `signature` changes.
 *
 * The signature is the footer's own printed content, so the rule fires exactly
 * when the footer says something new — never on an unrelated re-render, and
 * never on a keystroke that did not actually move this card's figure.
 */
function useProofFlash(signature: string) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (prev.current === null) {
      // First commit. The seed arriving is not a change.
      prev.current = signature;
      return;
    }
    if (prev.current === signature) return;
    prev.current = signature;

    const el = ref.current;
    if (!el || reducedMotion()) return;

    el.classList.add(styles.isFlash);
    const off = window.setTimeout(() => el.classList.remove(styles.isFlash), FLASH_MS);
    return () => window.clearTimeout(off);
  }, [signature]);

  return ref;
}

/**
 * The money footer.
 *
 * @param lead    what this card is made of, in words — "4 lines · 1 unnamed"
 * @param delta   the card's own contribution as money — "+$1,802.44"
 * @param note    what that money IS — "base", "markups + overhead + profit"
 * @param slotLab the right slot's caps label — "RUNNING", "COVERED"
 * @param slotVal the right slot's figure
 * @param tone    a genuine STATUS of this card's arithmetic, never decoration
 */
export function MoneyFoot({
  lead,
  delta,
  note,
  slotLab,
  slotVal,
  tone,
}: {
  lead: string;
  delta: string;
  note: string;
  slotLab: string;
  slotVal: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const ref = useProofFlash(`${lead}|${delta}|${note}|${slotVal}`);

  return (
    /* The strip's words are left in the accessibility tree exactly as written.
       An aria-label on a role-less <div> is not reliably exposed, and the text
       reads perfectly well in DOM order — "Contributes / 5 rows · 4 priced, 1
       unnamed / $12,400.20 / base cost / Running / $12,400.20". Only the arrow
       glyph is hidden, because "rightwards arrow" is noise. */
    <div ref={ref} className={cx(styles.foot, styles.footMoney, tone && styles[tone])}>
      <span className={styles.footKick}>Contributes</span>

      <span className={styles.footStatement}>
        <span className={styles.footLead}>{lead}</span>
        <span className={styles.footArrow} aria-hidden="true">
          →
        </span>
        <span className={styles.footDelta}>{delta}</span>
        <span className={styles.footNote}>{note}</span>
      </span>

      <span className={styles.footSlot}>
        <span className={styles.footSlotLab}>{slotLab}</span>
        <span className={styles.footSlotVal}>{slotVal}</span>
      </span>
    </div>
  );
}

/**
 * The coverage footer — same strip, same rule, no money.
 *
 * Cards that cannot move the price still have to say what they cover, or the
 * column's grammar breaks on every second card and the footers stop being a
 * spine you can read straight down.
 */
export function CoverFoot({
  lead,
  state,
  tone,
}: {
  lead: string;
  state: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const ref = useProofFlash(`${lead}|${state}`);

  return (
    <div ref={ref} className={cx(styles.foot, styles.footCover, tone && styles[tone])}>
      <span className={styles.footKick}>Covers</span>
      <span className={styles.footStatement}>
        <span className={styles.footLead}>{lead}</span>
      </span>
      <span className={styles.footSlot}>
        <span className={styles.footState}>{state}</span>
      </span>
    </div>
  );
}

/**
 * The LAST footer on the page — the same strip, at the scale the number
 * deserves.
 *
 * It closes the client's copy, and it is the biggest numeral anywhere on the
 * route on purpose: the derivation bar's running figure is a reference you
 * glance at while working, this is the number a homeowner signs for. Its
 * statement restates the whole chain in one line, so the last thing read before
 * Send is the argument for the price rather than just the price.
 */
export function TotalFoot({
  chain,
  total,
}: {
  /** "base + uplift + tax", already formatted. */
  chain: string;
  total: string;
}) {
  const ref = useProofFlash(`${chain}|${total}`);

  return (
    <div ref={ref} className={cx(styles.foot, styles.footTotal)}>
      <span className={styles.footKick}>Proposal total</span>
      <span className={styles.footStatement}>
        <span className={styles.footLead}>{chain}</span>
      </span>
      <span className={styles.totalVal}>
        {total}
      </span>
    </div>
  );
}

/**
 * The card frame: numeral plate → title → teach line → optional aside → body →
 * proof footer.
 *
 * MODULE SCOPE, NOT NESTED IN THE PAGE. Declared inside the content component
 * this would be a NEW function identity on every render, so React would see a
 * different element type each time, unmount the whole card and mount a fresh
 * one — which drops the caret out of whichever input you were typing in, on
 * every keystroke. `register` is a prop for exactly that reason: closing over
 * it would put the declaration back inside the component.
 */
export function ProofCard({
  meta,
  register,
  aside,
  foot,
  children,
}: {
  meta: CardMeta;
  /** Records the section element so the derivation bar can scroll to it. */
  register: (id: string, el: HTMLElement | null) => void;
  /** Optional head-right content — card 03's margin badge lives here. */
  aside?: React.ReactNode;
  /** The proof footer. Always present; the grammar has no exceptions. */
  foot: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={meta.id}
      ref={(el) => {
        register(meta.id, el);
      }}
      className={cx(styles.card, meta.kind === "money" && styles.isMoney)}
      aria-labelledby={`${meta.id}-title`}
    >
      <header className={styles.cardHead}>
        {/* Money cards carry an INK numeral plate, coverage cards a plain
            numeral. At a squint the spine of the estimate — the four cards that
            actually move the price — separates from everything else. */}
        <span className={styles.cardNum} aria-hidden="true">
          {meta.num}
        </span>

        <div className={styles.cardCopy}>
          <h2 className={styles.cardTitle} id={`${meta.id}-title`}>
            <span className={styles.srOnly}>Card {meta.num}: </span>
            {meta.title}
          </h2>
          <p className={styles.cardTeach}>{meta.teach}</p>
        </div>

        {aside}
      </header>

      <div className={styles.cardBody}>{children}</div>

      {foot}
    </section>
  );
}
