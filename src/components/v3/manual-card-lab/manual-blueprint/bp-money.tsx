"use client";

// MANUAL PROPOSAL / BLUEPRINT — card 08, "Payment & deposits".
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
// ── THE LEDGER IS A RECEIPT, NOT A FORM ──────────────────────
// It was two half-card form cells inside a full-page-width row, and the report
// on it measured the discount's own figure sitting ~540px from the field that
// produces it and ~45px from the tax field it has nothing to do with — twelve
// times closer to the wrong control, so the amount read as a DIVIDER between
// two inputs rather than as "discount = nothing". Two fields holding four
// characters each were stretched across 1350px to achieve that.
//
// It is now one ~440px column, hard right, label and value adjacent:
//
//     Subtotal                    $11,581.36
//     + Add discount
//     Tax  [8.25]% auto             +$955.46
//     ──────────────────────────────────────
//     Grand total                 $12,536.82
//
// THE SUBTOTAL ROW IS BACK. It was removed in a previous pass on the grounds
// that it repeated card 04's last row, and that was the wrong trade: the
// arithmetic here is 11,581.36 → +955.46 → 12,536.82, and with the base
// missing you can see the tax RATE and the tax RESULT but not what the rate was
// applied to, which makes the one line a client queries unverifiable. A figure
// printed twice is a smaller cost than a chain that cannot be checked.
//
// THE DISCOUNT COLLAPSES WHEN IT IS ZERO. A row, a control and a sentence spent
// on a feature the estimate is not using was the bulk of the wasted weight in
// this card. It expands into a real row on click, and the click moves focus
// into the field — an affordance that opens a control and leaves the keyboard
// user on <body> has not opened anything.
//
// ── DISCOUNT COMES OFF BEFORE TAX ────────────────────────────
// Tax is charged on what the client owes, not on a figure nobody pays. The
// arithmetic is in computeTotals; the ledger prints the order so it is checkable
// rather than trusted.
//
// ── THE TAX SENTENCE MOVED INTO A TOOLTIP ────────────────────
// "Charged on the total after discount. Estimated from the job address in Texas
// — editing it stops that." is 111 characters of permanently-visible
// explanation attached to a field that is correct by default and rarely
// touched: the largest block of copy in the card, on its least important
// control. The provenance is now a small `auto` tag beside the rate, the full
// sentence is its `title` and a screen-reader line, and the sentence only
// becomes visible copy when someone has actually overridden the rate — which is
// the one moment "clear it to go back to the address estimate" is the answer to
// a question the user is having.
//
// Status colour appears here on the coverage reading — meter fill, meter note
// and the new percentage readout, which are one reading in three places — and
// on the unnamed-line warning, and nowhere else on the page. The `auto` tag is
// deliberately NOT a status colour: an estimated rate is provenance, not a
// state.

import { useEffect, useId, useState } from "react";
import type { Installment } from "../manual-focus/manual-focus-types";
import {
  coverState,
  installmentValue,
  money,
  pct,
  round2,
} from "../manual-focus/manual-focus-math";
import { stateDisplayName } from "../manual-focus/manual-focus-data";
import styles from "./manual-blueprint.module.css";
import m from "./bp-money.module.css";
import { Btn, Ic, NumField, cx } from "./bp-ui";

/* ============================================================
   THE PRICING LEDGER
   ============================================================ */

/** Money with its operator attached. Zero keeps the house's em dash — a row
 *  contributing nothing should recede, and "−$0.00" is a loud way to say
 *  "nothing happened". */
function signed(n: number, op: "+" | "−"): string {
  return n > 0 ? `${op}${money(n)}` : "—";
}

/**
 * The tax rate's sentence: what the rate is charged ON, then where it came from.
 *
 * Unchanged copy, new home. Base first, always, and in the same words the
 * discount uses — the order of operations is the thing people get wrong, and it
 * is only legible if both state their base in a form you can lay side by side.
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
  const discountId = useId();
  const taxId = useId();

  // A discount that is already set is never collapsed — the affordance is for
  // the empty case, and hiding a live figure behind a "+ Add" would be a lie.
  const [opened, setOpened] = useState(false);
  const showDiscount = opened || discountPct > 0;

  // Opening the row moves focus into it. `getElementById` rather than a ref
  // because NumField takes an `id` and not a ref, and the id is a useId — safe
  // to look up directly, and never a selector, so its colons do not matter.
  useEffect(() => {
    if (!opened) return;
    document.getElementById(discountId)?.focus();
  }, [opened, discountId]);

  const note = taxNote(taxAuto, taxState);

  return (
    <div className={m.receipt}>
      {/* SUBTOTAL — the base the two rates below are applied to. Without it the
          tax amount is a figure you can read but not check. */}
      <div className={m.row}>
        <span className={m.rowLabel}>Subtotal</span>
        <span className={m.rowAmt}>{money(totals.preTax)}</span>
      </div>

      {showDiscount ? (
        <div className={m.row}>
          <label className={m.rowLabel} htmlFor={discountId}>
            Discount
          </label>
          <span className={m.rowCtl}>
            <span className={m.pctField}>
              <NumField
                id={discountId}
                value={discountPct}
                suffix="%"
                max={100}
                onChange={(n) => onPatch({ discountPct: n })}
              />
            </span>
          </span>
          <span className={cx(m.rowAmt, totals.discountAmount <= 0 && m.rowAmtZero)}>
            {signed(totals.discountAmount, "−")}
          </span>
        </div>
      ) : (
        <div className={m.addRow}>
          <button type="button" className={m.addLink} onClick={() => setOpened(true)}>
            <Ic name="plus" />
            Add discount
          </button>
        </div>
      )}

      <div className={m.row}>
        <label className={m.rowLabel} htmlFor={taxId}>
          Tax
        </label>
        <span className={m.rowCtl}>
          <span className={m.pctField}>
            <NumField id={taxId} value={taxPct} suffix="%" max={100} onChange={onTaxPct} />
          </span>
          {taxAuto ? (
            <>
              <span className={m.autoTag} title={note}>
                auto
              </span>
              {/* `title` is a mouse affordance. The same words, in the tree, for
                  everyone else. */}
              <span className={m.sr}>{note}</span>
            </>
          ) : null}
        </span>
        <span className={cx(m.rowAmt, totals.tax <= 0 && m.rowAmtZero)}>
          {signed(totals.tax, "+")}
        </span>
        {/* Only once the rate has been overridden. Until then this sentence is
            an explanation nobody asked for, attached to a correct default. */}
        {!taxAuto ? <p className={m.rowNote}>{note}</p> : null}
      </div>

      {/* Margin is NOT printed here. It is the badge on the Markup & margin
          card, which is where the levers that move it live. Two printings would
          drift the moment a discount is applied, because the two cards measure
          it against different revenue. */}
      <div className={cx(m.row, m.rowTotal)}>
        <span className={m.rowLabel}>Grand total</span>
        <span className={m.rowAmt}>{money(totals.total)}</span>
      </div>
    </div>
  );
}

/* ============================================================
   THE SCHEDULE
   ============================================================ */

const NOTE: Record<string, string> = {
  none: "Nothing scheduled yet.",
  exact: "Covers the total exactly.",
};

/**
 * The dollar column beside the rows — and the one place on this card where a
 * figure is derived locally rather than taken from `computeTotals`.
 *
 * THE LAST ROW IS A REMAINDER. 30% + 30% + 40% is 100%, but three independently
 * rounded percentages of $12,536.82 are $3,761.05 + $3,761.05 + $5,014.73 =
 * $12,536.83 — one cent MORE than the total the client is being asked to sign,
 * printed directly under it. So every row but the last keeps its own rounded
 * value and the last one absorbs whatever the rounding left over. This is the
 * house technique, used verbatim by `figures()` in lines-v2 (labor is total
 * minus material, never its own rounded product) and by `applyUnitPrice` in the
 * math module for the same reason.
 *
 * It lives here rather than in `installmentValue` because that helper is shared
 * with the /dashboard/manual-focus route, and because a per-row helper cannot
 * see the row's position in the schedule — a remainder is a property of the
 * COLUMN, not of an installment.
 *
 * ONLY WHEN THE SCHEDULE ACTUALLY COVERS THE TOTAL. Under- or over-scheduled,
 * every row keeps its honest independent value: folding a $1,200 shortfall into
 * the last installment would silently balance the schedule and hide the exact
 * thing the coverage meter exists to report. A cent of rounding is arithmetic;
 * a thousand dollars of shortfall is a fact.
 */
function scheduleValues(installments: Installment[], total: number, exact: boolean): number[] {
  const raw = installments.map((inst) => installmentValue(inst, total));
  if (!exact || raw.length === 0) return raw;
  const head = raw.slice(0, -1);
  const consumed = round2(head.reduce((sum, v) => sum + v, 0));
  return [...head, round2(total - consumed)];
}

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
  // ONE reading of under / exact / over, taken from the shared helper, and
  // everything else on this block is a presentation of it: the header
  // percentage, the meter fill and the note under it.
  const state = coverState(installments, total);
  const exact = state === "exact";

  const values = scheduleValues(installments, total, exact);

  // The covered figure is the sum of the column the user can SEE, not a second
  // pass over the installments — so the meter can never disagree with the rows
  // above it. For every state but "exact" this is `coveredAmount` by
  // construction; for "exact" it is the total, which is the whole point of the
  // remainder.
  const covered = round2(values.reduce((sum, v) => sum + v, 0));
  const ratio = total > 0 ? Math.min(covered / total, 1) : 0;
  const coverPct = exact ? 100 : total > 0 ? (covered / total) * 100 : 0;

  const note =
    state === "under"
      ? `${money(total - covered)} still unscheduled.`
      : state === "over"
        ? `${money(covered - total)} more than the total.`
        : (NOTE[state] ?? "");

  return (
    <div className={m.payment}>
      <div className={m.schedHead}>
        <h3 className={m.schedTitle}>Payment schedule</h3>
        {/* THE MISSING GUARDRAIL. Nothing used to say the percentages have to
            sum to 100 — type 30/30/30 and the schedule was silently a third
            short. Stated in the unit the rows are typed in, at the head of the
            rows that are typed. */}
        {state !== "none" ? (
          <span
            className={cx(
              m.cover,
              exact && m.coverExact,
              state === "under" && m.coverUnder,
              state === "over" && m.coverOver,
            )}
            title={
              exact
                ? "The stages add up to the grand total."
                : "The stages must add up to 100% of the grand total."
            }
          >
            {exact ? "100%" : pct(coverPct)}
            {exact ? <Ic name="check" /> : null}
            <span className={m.sr}> of the grand total scheduled</span>
          </span>
        ) : null}
      </div>

      {installments.map((inst, i) => (
        <div key={inst.id} className={cx(m.instRow, i === 0 && m.instFirst)}>
          <input
            type="text"
            className={styles.input}
            value={inst.label}
            placeholder="When is this due?"
            aria-label="Payment stage"
            onChange={(e) => onPatch(inst.id, { label: e.target.value })}
          />
          {/* ONE CONTROL, TWO UNITS, and the unit now lives INSIDE the field as
              an affix — the treatment the discount and tax rows already use.
              It was a ~100px bordered box holding a single static character,
              which reads as a field somebody forgot to fill in. */}
          <span className={m.amtField}>
            <NumField
              value={inst.amount}
              onChange={(n) => onPatch(inst.id, { amount: n })}
              ariaLabel={inst.isPercent ? "Stage percentage" : "Stage amount"}
            />
            <button
              type="button"
              className={m.unitBtn}
              aria-label={inst.isPercent ? "Switch to dollars" : "Switch to percent"}
              onClick={() => onPatch(inst.id, { isPercent: !inst.isPercent })}
            >
              {inst.isPercent ? "%" : "$"}
            </button>
          </span>
          {/* Left of the figure, not right of it. The money column is the last
              thing in the row so it lands on the same axis as the ledger's. */}
          <button
            type="button"
            className={m.del}
            aria-label={inst.label.trim() ? `Remove ${inst.label.trim()}` : "Remove payment stage"}
            onClick={() => onRemove(inst.id)}
          >
            <Ic name="trash" />
          </button>
          <span className={m.instValue}>{money(values[i] ?? 0)}</span>
        </div>
      ))}

      {installments.length === 0 ? (
        <div className={styles.empty}>No stages — the balance is due on completion.</div>
      ) : null}

      {/* DIRECTLY UNDER THE ROWS IT ADDS TO. Parked below the coverage meter it
          read as a footer on the block, and the review concluded a fourth
          payment stage was not possible at all. */}
      <div className={m.addWrap}>
        <Btn tone="add" icon="plus" onClick={onAdd}>
          Add a payment stage
        </Btn>
      </div>

      <div className={m.meter}>
        {/* The one honest reason to print the grand total twice inside this
            card: "scheduled $X of $Y" is meaningless with a single figure. It
            stays at value size, never display size, so it cannot compete with
            the ledger's total above it. */}
        <div className={m.meterTop}>
          <span className={m.meterLabel}>Scheduled</span>
          <span className={m.meterFig}>
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
            m.meterNote,
            state === "under" && m.noteUnder,
            state === "exact" && m.noteExact,
            state === "over" && m.noteOver,
          )}
        >
          {note}
        </div>
      </div>
    </div>
  );
}
