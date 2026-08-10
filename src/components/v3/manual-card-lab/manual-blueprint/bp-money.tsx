"use client";

// MANUAL PROPOSAL / BLUEPRINT — card 08, "Payment & pricing".
//
// ── WHY THIS IS ONE CARD AND NOT TWO ─────────────────────────
// Markup, margin, overhead, profit, discount and tax used to live in card 04
// and the schedule in card 08. They are now a single card, in the order the
// money actually travels:
//
//     line-item subtotal → markups → overhead → profit
//       → pre-tax → discount → taxable → tax → GRAND TOTAL → schedule
//
// The old split forced the reader to hold a figure from card 04 in their head
// while looking at card 08's coverage meter, and printed the grand total in
// both — the "same number in three places" failure. One card owns every figure
// between the line items and the amount the client pays, so each appears once,
// in the row where it is produced.
//
// ── THE LEDGER IS A CHAIN, NOT A LIST ────────────────────────
// Every row is the previous row plus or minus one thing, and the rows that ADD
// are indented under the subtotal they modify. That is why the controls sit in
// the same row as the figure they drive: "Materials markup 18% → +$1,076.40"
// is one fact, and splitting the rate from its effect into a matrix above a
// summary below (the old card 04) made it two.
//
// ── DISCOUNT COMES OFF BEFORE TAX ────────────────────────────
// Tax is charged on what the client owes, not on a figure nobody pays. The
// arithmetic is in computeTotals; the ledger prints the order so it is checkable
// rather than trusted.
//
// ── WHY THE TAX RATE EXPLAINS ITSELF ─────────────────────────
// An 8.25% that appears in a field with no provenance is a number the user has
// to either trust or re-derive. The note under it names the state it came from
// and says plainly that editing stops it following the address — which is the
// one behaviour of this field that is not obvious and that people get bitten by.
//
// Status colour appears here (the coverage meter) and on the unnamed-line
// warning, and nowhere else on the page.

import type { Installment } from "../manual-focus/manual-focus-types";
import {
  coverState,
  coveredAmount,
  installmentValue,
  money,
} from "../manual-focus/manual-focus-math";
import { stateDisplayName } from "../manual-focus/manual-focus-data";
import styles from "./manual-blueprint.module.css";
import { Btn, DRow, IconBtn, NumField, SubHead, cx } from "./bp-ui";

/* ============================================================
   THE PRICING LEDGER
   ============================================================ */

/**
 * One ADJUSTMENT: a percentage the user sets, what it is worth in money, and
 * one sentence saying what it is applied to.
 *
 * ── WHY THIS REPLACED THE BARE RATE ROW ──────────────────────
 * The row used to be three cells — a label, a % field, a mono figure — and the
 * report on it was that you could not tell what the two controls were for. Four
 * things were wrong and all four are structural, not decorative:
 *
 *   1  NO OPERATOR. "$971.30" beside a tax rate does not say whether it is
 *      being added, and "—" beside a discount does not say it would be taken
 *      off. The amount now carries an explicit + or − and that single glyph is
 *      most of the answer to "what does this do".
 *   2  NO BASE. A percentage is meaningless without the number it is a
 *      percentage OF, and the one thing people actually get wrong here is
 *      whether tax is charged before or after the discount. Each row now says.
 *   3  WRONG WEIGHT. The two adjustments printed in 12.5px mono between two
 *      15px and 18px Inter figures, so the eye read "big number, small grey
 *      stuff, big number" — three unrelated things rather than one sum. They
 *      are now the same size and family as the figures they sit between, so
 *      the four amounts read as one vertical column of arithmetic.
 *   4  ORPHANED NOTE. The tax provenance sentence sat between the tax row and
 *      the grand total, touching neither, and read as a footnote about the
 *      total. It belongs to its own row and is now inside it.
 */
function AdjRow({
  label,
  note,
  value,
  onChange,
  amount,
  zero,
  ariaLabel,
}: {
  label: string;
  /** What this percentage is applied to. One sentence, always present. */
  note: string;
  value: number;
  onChange: (n: number) => void;
  /** Formatted and already signed by the caller — this row never does
   *  arithmetic and never decides an operator. */
  amount: string;
  /** Contributing nothing: the figure recedes rather than shouting a dash. */
  zero: boolean;
  ariaLabel: string;
}) {
  return (
    <div className={styles.adjCell}>
      <span className={styles.adjLabel}>{label}</span>
      {/* Rate and effect on ONE line inside the cell. That pairing is the whole
          reason this component exists — "18% → −$2,119.20" is one fact — and it
          survives the move from a full-width row to a half-width column
          unchanged, because the two are adjacent rather than at opposite ends
          of the measure. */}
      <div className={styles.adjLine}>
        <div className={styles.adjCtl}>
          <NumField value={value} suffix="%" max={100} onChange={onChange} ariaLabel={ariaLabel} />
        </div>
        <span className={cx(styles.adjAmt, zero && styles.adjAmtZero)}>{amount}</span>
      </div>
      <p className={styles.adjNote}>{note}</p>
    </div>
  );
}

/** Money with its operator attached. Zero keeps the house's em dash — a row
 *  contributing nothing should recede, and "−$0.00" is a loud way to say
 *  "nothing happened". */
function signed(n: number, op: "+" | "−"): string {
  return n > 0 ? `${op}${money(n)}` : "—";
}

/**
 * The tax row's sentence: what the rate is charged ON, then where it came from.
 *
 * Base first, always, and in the same words the discount row uses — the order
 * of operations is the thing people get wrong, and it is only legible if both
 * rows state their base in a form you can lay side by side.
 *
 * Provenance second, and deliberately saying what will happen NEXT rather than
 * only what happened: the field silently stops tracking the address once it is
 * typed in, and that is the behaviour people are surprised by, not the estimate.
 */
function taxNote(taxAuto: boolean, taxState: string): string {
  const base = "Charged on the total after discount.";
  if (!taxAuto) {
    return `${base} Set by hand — clear it to go back to the address estimate.`;
  }
  if (!taxState) {
    return `${base} No rate could be estimated from the job address.`;
  }
  return `${base} Estimated from the job address in ${stateDisplayName(taxState)} — editing it stops that.`;
}

export function PricingBlock({
  discountPct,
  taxPct,
  taxAuto,
  taxState,
  onPatch,
  onTaxPct,
  totals,
}: {
  discountPct: number;
  taxPct: number;
  taxAuto: boolean;
  taxState: string;
  onPatch: (patch: { discountPct?: number }) => void;
  onTaxPct: (n: number) => void;
  totals: {
    baseTotal: number;
    materialsMarkup: number;
    laborMarkup: number;
    subtotalCosts: number;
    overheadAmount: number;
    profitAmount: number;
    preTax: number;
    discountAmount: number;
    taxable: number;
    tax: number;
    total: number;
    margin: number;
  };
}) {
  return (
    <>
      <div>
        {/* ── THE PRE-TAX HANDOVER ROW IS GONE, by request ──────────
            It repeated card 04's last row ("Pre-tax total") so this card's
            chain would start from something named. That was the argument for
            it, and the cost was a figure printed twice on one page — the
            failure the whole redesign is organised against — for a chain that
            is only two links long. The two adjustments now stand as what they
            are: the two things that happen between the estimate and the amount
            owed. The subhead went with it; two labelled controls and a total do
            not need a heading over them to say they are money. */}

        {/* TWO COLUMNS, ONE ROW. Discount and tax are PEERS, not a sequence —
            neither is applied to the other's output, they are both applied to
            the pre-tax figure and the order between them is arithmetic, not
            reading order. Stacked, they invited exactly the wrong reading;
            side by side, the layout says "two adjustments" and the grand total
            beneath says what they add up to. */}
        <div className={styles.adjust}>
          <AdjRow
            label="Discount"
            note="Comes off the pre-tax total, before tax is charged."
            value={discountPct}
            onChange={(n) => onPatch({ discountPct: n })}
            amount={signed(totals.discountAmount, "−")}
            zero={totals.discountAmount <= 0}
            ariaLabel="Discount"
          />
          <AdjRow
            label="Tax"
            note={taxNote(taxAuto, taxState)}
            value={taxPct}
            onChange={onTaxPct}
            amount={signed(totals.tax, "+")}
            zero={totals.tax <= 0}
            ariaLabel="Tax rate"
          />
        </div>

        <div className={styles.derived}>
          {/* Margin is NOT printed here. It is the badge on the Markup &
              margin card, which is where the levers that move it live. Two
              printings would drift the moment a discount is applied, because
              the two cards measure it against different revenue. */}
          <DRow label="Grand total" value={money(totals.total)} lead />
        </div>
      </div>
    </>
  );
}

/* ============================================================
   THE SCHEDULE
   ============================================================ */

const NOTE: Record<string, string> = {
  none: "Nothing scheduled yet.",
  exact: "Covers the total exactly.",
};

export function PaymentBlock({
  installments,
  total,
  onPatch,
  onAdd,
  onRemove,
}: {
  installments: Installment[];
  total: number;
  onPatch: (id: string, patch: Partial<Installment>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const covered = coveredAmount(installments, total);
  const state = coverState(installments, total);
  const ratio = total > 0 ? Math.min(covered / total, 1) : 0;

  const note =
    state === "under"
      ? `${money(total - covered)} still unscheduled.`
      : state === "over"
        ? `${money(covered - total)} more than the total.`
        : (NOTE[state] ?? "");

  return (
    <>
      <div>
        <SubHead>When it is paid</SubHead>
        {installments.map((inst, i) => (
          <div key={inst.id} className={cx(styles.instRow, i === 0 && styles.instFirst)}>
            <input
              type="text"
              className={styles.input}
              value={inst.label}
              placeholder="When is this due?"
              aria-label="Installment label"
              onChange={(e) => onPatch(inst.id, { label: e.target.value })}
            />
            <NumField
              value={inst.amount}
              onChange={(n) => onPatch(inst.id, { amount: n })}
              ariaLabel="Installment amount"
            />
            {/* One control, two units. A separate radio pair for $ / % would be
                two more targets in a row that already has five. */}
            <button
              type="button"
              className={styles.unitToggle}
              aria-label={inst.isPercent ? "Switch to dollars" : "Switch to percent"}
              onClick={() => onPatch(inst.id, { isPercent: !inst.isPercent })}
            >
              {inst.isPercent ? "%" : "$"}
            </button>
            <span className={styles.instValue}>{money(installmentValue(inst, total))}</span>
            <IconBtn label="Remove installment" icon="trash" onClick={() => onRemove(inst.id)} />
          </div>
        ))}
        {installments.length === 0 ? (
          <div className={styles.empty}>No installments — the balance is due on completion.</div>
        ) : null}
      </div>

      <Btn tone="add" icon="plus" onClick={onAdd}>
        Add an installment
      </Btn>

      <div>
        {/* The one honest reason to print the grand total twice: "scheduled $X
            of $Y" is meaningless with a single figure. It stays at value size,
            never display size, so it cannot compete with the ledger's total
            three rows above it. */}
        <div className={styles.meterTop}>
          <span className={styles.dLabel}>Scheduled</span>
          <span className={styles.meterFig}>
            {money(covered)} of {money(total)}
          </span>
        </div>
        <div
          className={styles.meterTrack}
          role="meter"
          aria-label="Payment coverage"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={covered}
        >
          <div
            className={cx(
              styles.meterFill,
              state === "under" && styles.fillUnder,
              state === "exact" && styles.fillExact,
              state === "over" && styles.fillOver,
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <div
          className={cx(
            styles.meterNote,
            state === "under" && styles.noteUnder,
            state === "exact" && styles.noteExact,
            state === "over" && styles.noteOver,
          )}
        >
          {note}
        </div>
      </div>
    </>
  );
}
