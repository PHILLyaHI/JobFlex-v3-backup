"use client";

// SPEC SHEET — SH-06, the payment schedule. Route /dashboard/manual-spec.
//
// The second spec table on the page, built on the same grid as the schedule
// of work: index in the label gutter, columns on the value track. Two tables
// that sat on different grids would break the single vertical rule the whole
// variant is built around.
//
// THE RECONCILIATION IS THE ADDITION.
// The live builder lets a schedule quietly add up to 90% of the job and says
// nothing. A spec sheet that does not balance is not a spec sheet, so this one
// prints how much of the total the installments actually account for, in
// dollars and as a bar, and colours it under / exact / over. Under and over
// are genuine STATUSES of the schedule, which is what earns the status tokens.
//
// Fixture-only: every edit goes up to the draft in manual-spec-content.tsx.

import type { Installment } from "./manual-spec-types";
import {
  coveredAmount,
  installmentValue,
  money,
  pct,
  scheduleState,
} from "./manual-spec-math";
import { Note, cx } from "./spec-frame";
import styles from "./manual-spec.module.css";

export function PaymentTable({
  installments,
  total,
  onPatch,
  onRemove,
  onAdd,
}: {
  installments: Installment[];
  total: number;
  onPatch: (id: string, patch: Partial<Installment>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const covered = coveredAmount(installments, total);
  const coveredPct = total > 0 ? (covered / total) * 100 : 0;
  const state = scheduleState(installments, total);
  const stateClass =
    state === "exact" ? styles.isExact : state === "over" ? styles.isOver : styles.isUnder;

  return (
    <>
      <div className={cx(styles.row, styles.isHead)}>
        <div className={styles.tHeadLab}>Draw №</div>
        <div className={cx(styles.rowVal, styles.isFlush)}>
          <div className={cx(styles.tHead, styles.payGrid)}>
            <span>Milestone</span>
            <span>Basis</span>
            <span className={styles.thNum}>Amount</span>
            <span className={styles.thNum}>Resolves to</span>
            <span aria-hidden="true" />
          </div>
        </div>
      </div>

      {installments.length === 0 ? (
        <div className={styles.row}>
          <div className={styles.rowLab}>No draws</div>
          <div className={styles.rowVal}>
            <Note kicker="Nothing scheduled">
              With no installments the whole balance falls due on completion. Most jobs want a
              deposit first.
            </Note>
          </div>
        </div>
      ) : (
        installments.map((inst, i) => {
          const no = String(i + 1).padStart(2, "0");
          return (
            <div className={cx(styles.row, styles.isItem)} key={inst.id}>
              <div className={styles.idxPlain} aria-hidden="true">
                {no}
              </div>
              <div className={cx(styles.rowVal, styles.isFlush)}>
                <div className={cx(styles.cellRow, styles.payGrid)}>
                  <input
                    className={cx(styles.cellIn, styles.isName)}
                    value={inst.label}
                    placeholder="Deposit / Start of work / Completion"
                    aria-label={`Draw ${no} milestone`}
                    onChange={(e) => onPatch(inst.id, { label: e.target.value })}
                  />

                  <span className={styles.seg} role="group" aria-label={`Draw ${no} basis`}>
                    <button
                      type="button"
                      aria-pressed={inst.isPercent}
                      className={cx(styles.segBtn, inst.isPercent && styles.segOn)}
                      onClick={() => onPatch(inst.id, { isPercent: true })}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      aria-pressed={!inst.isPercent}
                      className={cx(styles.segBtn, !inst.isPercent && styles.segOn)}
                      onClick={() => onPatch(inst.id, { isPercent: false })}
                    >
                      $
                    </button>
                  </span>

                  {/* A row-scale unit mark, not the row-level `Affix`: the
                      field's rule is transparent until it is touched, and a
                      permanently ruled mark beside it would read as half an
                      underline. */}
                  <span className={styles.cellAffix}>
                    {!inst.isPercent && (
                      <span className={styles.cellUnit} aria-hidden="true">
                        $
                      </span>
                    )}
                    <input
                      className={cx(styles.cellIn, styles.isNum)}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={inst.amount}
                      aria-label={`Draw ${no} amount, ${inst.isPercent ? "percent" : "dollars"}`}
                      onChange={(e) => onPatch(inst.id, { amount: Number(e.target.value) })}
                    />
                    {inst.isPercent && (
                      <span className={styles.cellUnit} aria-hidden="true">
                        %
                      </span>
                    )}
                  </span>

                  {/* Contextual: a percentage means nothing until a total
                      exists, so the dollar figure only appears once one does. */}
                  {total > 0 ? (
                    <span className={styles.cellAmt}>
                      {money(installmentValue(inst, total))}
                    </span>
                  ) : (
                    <span className={cx(styles.cellAmt, styles.isNil)}>No total yet</span>
                  )}

                  <button
                    type="button"
                    className={cx(styles.iconBtn, styles.isDanger)}
                    aria-label={`Remove draw ${no}`}
                    onClick={() => onRemove(inst.id)}
                  >
                    <svg className="ic">
                      <use href="#i-x" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <div className={styles.row}>
        <div className={styles.rowLab} aria-hidden="true" />
        <div className={styles.rowVal}>
          <button type="button" className={styles.addBtn} onClick={onAdd}>
            <svg className="ic" aria-hidden="true">
              <use href="#i-plus" />
            </svg>
            Add an installment
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLab}>
          <span>Reconciles</span>
          <span className={styles.rowOpt}>· against total</span>
        </div>
        <div className={styles.rowVal}>
          <div className={cx(styles.recon, stateClass)} aria-live="polite">
            <span className={styles.reconTxt}>{pct(Math.round(coveredPct))} covered</span>
            <span className={styles.reconBar} aria-hidden="true">
              {/* The only place a width can be a datum — see the ratio bar in
                  spec-schedule.tsx for the same unavoidable inline style. */}
              <span
                className={styles.reconFill}
                style={{ width: `${Math.min(100, Math.max(0, coveredPct))}%` }}
              />
            </span>
            <span className={styles.reconTxt}>
              {money(covered)} of {money(total)}
            </span>
          </div>
          <p className={styles.rowHint}>
            {state === "exact"
              ? "The draws add up to the total."
              : state === "over"
                ? "The draws collect more than the total. Trim one before this goes out."
                : state === "none"
                  ? "Nothing to reconcile against yet — price the work on SH-02 first."
                  : "The draws do not cover the total yet — the remainder has no milestone against it."}
          </p>
        </div>
      </div>
    </>
  );
}
