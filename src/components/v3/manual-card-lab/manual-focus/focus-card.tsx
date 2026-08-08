"use client";

// FOCUS CARD — the repeating unit of the column (route: /dashboard/manual-focus).
//
// THE TWO FACES
// A card is either LIVE (one card, ever) or STOOD DOWN (the other nine). The
// difference is deliberately a change of WEIGHT, not of presence:
//
//   live       2px ink frame · 3px solid-ink offset shadow · blueprint numeral
//              · 19px/900 title in full ink · teach line · every control open
//   stood down 1.5px hairline frame · no shadow · muted numeral · 15px/900
//              title in soft ink · a condensed SUMMARY of the card's real
//              content · one "Open" control
//
// THE HEAD IS IDENTICAL IN BOTH STATES — same padding, same min-height, same
// numeral box, same value chip. Only what sits BELOW it swaps. That is not a
// detail: it is the reason promoting a card does not shove the column around,
// and together with the scroll anchoring in ./use-focus-column.ts it is the
// whole physical promise of the variant. Nothing in this file transitions a
// height, a max-height or a grid-template-rows.
//
// WHY THE SUMMARY IS NOT A COLLAPSED LABEL
// The research this page is built on says a collapsed section must summarise
// its CONTENT, not its name — "4 lines · 1 unnamed · $11,089", never "Line
// items". Every stood-down face here prints real values pulled from the live
// draft, so the answer to "what did I put in scope?" is on screen without a
// single click. That is the claim this variant has to win on.
//
// KEYBOARD
// The "Open" button is a real control, so the card is reachable and promotable
// by Tab alone; focusing it promotes, which is what makes tabbing DOWN the
// column walk through the cards in order. Clicking anywhere on a stood-down
// card also promotes — that handler is a mouse convenience layered on top of a
// keyboard-complete control, never a replacement for one.
//
// FIXTURE-ONLY page. This component holds no state; `live` and `promote` are
// owned by the column hook.

import { FOCUS_ANCHOR_ATTR } from "./use-focus-column";
import type { CardSpec } from "./manual-focus-types";
import { Ic, cx } from "./focus-ui";
import styles from "./manual-focus.module.css";

export function FocusCard({
  spec,
  live,
  promote,
  register,
  children,
}: {
  spec: CardSpec;
  live: boolean;
  promote: (id: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  // The section's own click handler is the mouse affordance for the whole
  // stood-down face. It is only wired while the card is stood down, so a click
  // inside a live card's body can never be mistaken for a promotion.
  const onSurfaceClick = live ? undefined : () => promote(spec.id);

  return (
    <section
      id={spec.id}
      ref={(el) => {
        register(spec.id, el);
      }}
      className={cx(styles.card, live ? styles.isLive : styles.isDown)}
      aria-labelledby={`${spec.id}-title`}
      onClick={onSurfaceClick}
    >
      {/* ── HEAD — geometry identical in both states ─────────── */}
      <header className={styles.head}>
        <span className={styles.num} aria-hidden="true">
          {spec.num}
        </span>

        <h2 className={styles.title} id={`${spec.id}-title`}>
          <span className={styles.srOnly}>{`Card ${spec.num}. `}</span>
          {/* The focus anchor. `tabIndex={-1}` keeps it out of the tab order —
              it is a programmatic landing spot for the promotion, not a stop. */}
          <span className={styles.titleTx} tabIndex={-1} {...{ [FOCUS_ANCHOR_ATTR]: "" }}>
            {spec.title}
          </span>
        </h2>

        {/* The card's headline figure, present in BOTH states. Half of
            "money never scrolls away" is that the money is never only in one
            place — the strip has the grand total, every card restates its own. */}
        <span className={styles.chip}>{spec.chip}</span>
      </header>

      {live ? (
        <>
          <p className={styles.teach}>{spec.teach}</p>
          <div className={styles.body}>{children}</div>
        </>
      ) : (
        <div className={styles.face}>
          <dl className={styles.sum}>
            {spec.summary.map((row, i) => (
              // Keyed by position: card 10's summary is a condensed line-item
              // table, and two lines are allowed to carry the same name.
              <div className={styles.sumRow} key={`${spec.id}-${i}`}>
                <dt className={styles.sumLab}>{row.label}</dt>
                <dd
                  className={cx(
                    styles.sumVal,
                    row.numeric && styles.isNum,
                    row.tone === "warn" && styles.isWarn,
                    row.tone === "ok" && styles.isOk,
                    // The third grade exists so a summary face never softens a
                    // status the live face marks as an error.
                    row.tone === "err" && styles.isErr,
                  )}
                >
                  <i className={styles.sumLead} aria-hidden="true" />
                  <span>{row.value}</span>
                </dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className={styles.openBtn}
            onClick={() => promote(spec.id)}
            // Focusing IS promoting: tabbing down the column walks the cards
            // open in order, which is the keyboard equivalent of the click.
            onFocus={() => promote(spec.id)}
          >
            Open
            <span className={styles.srOnly}>{` the ${spec.title} card`}</span>
            <Ic name="chev" />
          </button>
        </div>
      )}
    </section>
  );
}
