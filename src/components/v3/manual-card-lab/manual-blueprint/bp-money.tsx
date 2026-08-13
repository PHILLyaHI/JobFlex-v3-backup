"use client";

// MANUAL PROPOSAL / BLUEPRINT — "Payment & deposits".
//
// ── THE RECEIPT LEFT THIS CARD ───────────────────────────────
// This card used to open with the whole money chain — subtotal, discount, tax,
// grand total — printed above the deposit fields. It does not any more. The
// Markup & margin card now owns every figure between the line items and the
// amount the client pays, INCLUDING discount and tax, and it ends on the grand
// total. Printing that same four-row chain again here was the "one number, four
// places" failure at its worst: the same arithmetic, in two cards, a scroll
// apart, with no way for a reader to know which one was authoritative.
//
// What is left is the only question this card was ever really asking: the total
// is $X — WHEN is it paid? The schedule divides a figure produced elsewhere, and
// the coverage meter reports whether the division adds up.
//
// ── THE TOTAL IS STILL PRINTED ONCE, AND ONLY ONCE ───────────
// In the meter's "scheduled $X of $Y" line, which is the one honest reason to
// repeat it: a coverage reading with a single figure in it means nothing. It
// stays at value size, never display size, so it cannot compete with the grand
// total on the card above or with the persistent bar at the foot of the page.
//
// Status colour appears on the coverage reading — meter fill, meter note and the
// percentage readout, which are one reading in three places — and nowhere else.

import type { Installment } from "../manual-focus/manual-focus-types";
import {
  coverState,
  installmentValue,
  money,
  pct,
  round2,
} from "../manual-focus/manual-focus-math";
import styles from "./manual-blueprint.module.css";
import m from "./bp-money.module.css";
import { Btn, Ic, NumField, cx } from "./bp-ui";

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
              an affix — the treatment the discount and tax fields already use.
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
        {/* "scheduled $X of $Y" — the one place this card repeats the grand
            total, because a coverage reading with one figure in it says
            nothing. The joining word is a real gap, not a space: two tabular
            money figures butted against a two-letter word read as one long
            string of digits, and the eye needs the seam to find the second
            figure. */}
        <div className={m.meterTop}>
          <span className={m.meterLabel}>Scheduled</span>
          <span className={m.meterFig}>
            {money(covered)}
            <span className={m.meterOf}>of</span>
            {money(total)}
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
