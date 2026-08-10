"use client";

// QUIET — cards 04 and 08, the two places money is DERIVED rather than typed.
//
// Card 04 is four inputs and three answers. The four rates are a homogeneous
// set, so they sit in a 2x2 matrix rather than a four-deep list — a matrix is
// scanned once, a list is read four times. The three derived figures sit 32px
// below under one quiet sub-heading, and only ONE of them (grand total) is
// allowed to grow; the other two are the same 17px as every other value on the
// page. The 26px in the sticky bar stays the loudest number anywhere.
//
// Card 08's meter is a comparison, which is the one honest reason to print the
// grand total twice: "scheduled $X of $Y" is meaningless with only one figure.
// It stays at value size, never display size.
//
// Status colour appears here and in the unnamed-line warning and nowhere else
// on the page: under = amber, exact = green, over = red, straight from
// `coverState` so the bar and the sentence can never grade the same schedule
// differently.

import type { Installment } from "../manual-focus/manual-focus-types";
import {
  coverState,
  coveredAmount,
  installmentValue,
  money,
  pct1,
} from "../manual-focus/manual-focus-math";
import styles from "./manual-quiet.module.css";
import { Btn, DRow, Field, IconBtn, NumField, SubHead, cx } from "./quiet-ui";

/* ============================================================
   04 — MARKUP & MARGIN
   ============================================================ */

export function MarkupBlock({
  materialMarkupPct,
  laborMarkupPct,
  overheadPct,
  profitPct,
  onPatch,
  carriedCost,
  margin,
  grandTotal,
}: {
  materialMarkupPct: number;
  laborMarkupPct: number;
  overheadPct: number;
  profitPct: number;
  onPatch: (patch: {
    materialMarkupPct?: number;
    laborMarkupPct?: number;
    overheadPct?: number;
    profitPct?: number;
  }) => void;
  carriedCost: number;
  margin: number;
  grandTotal: number;
}) {
  return (
    <>
      <div className={styles.grid2}>
        <Field label="Materials markup">
          <NumField
            value={materialMarkupPct}
            suffix="%"
            onChange={(n) => onPatch({ materialMarkupPct: n })}
            ariaLabel="Materials markup"
          />
        </Field>
        <Field label="Labor markup">
          <NumField
            value={laborMarkupPct}
            suffix="%"
            onChange={(n) => onPatch({ laborMarkupPct: n })}
            ariaLabel="Labor markup"
          />
        </Field>
        <Field label="Overhead">
          <NumField
            value={overheadPct}
            suffix="%"
            onChange={(n) => onPatch({ overheadPct: n })}
            ariaLabel="Overhead"
          />
        </Field>
        <Field label="Profit">
          <NumField
            value={profitPct}
            suffix="%"
            onChange={(n) => onPatch({ profitPct: n })}
            ariaLabel="Profit"
          />
        </Field>
      </div>

      <div>
        <SubHead>Derived</SubHead>
        <div className={styles.derived}>
          <DRow label="Carried cost" value={money(carriedCost)} />
          <DRow label="Margin" value={pct1(margin)} />
          <DRow label="Grand total" value={money(grandTotal)} lead />
        </div>
      </div>
    </>
  );
}

/* ============================================================
   08 — PAYMENT SCHEDULE
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
            <IconBtn
              label="Remove installment"
              icon="trash"
              onClick={() => onRemove(inst.id)}
            />
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
