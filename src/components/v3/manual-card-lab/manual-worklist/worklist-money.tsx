"use client";

// WORKLIST — card 04 (pricing and tax) and card 05 (payment schedule).
// Together in one file because they are the two halves of the same question:
// what the job costs, and how that number gets paid.
//
// CARD 04's DONE-CONDITION IS A CONFIRMATION, NOT A VALUE
// The tax rate always has a number in it — it is estimated from the job address
// the moment one exists. A condition of "the rate is filled in" would therefore
// be met before the contractor had looked at it, which is worse than useless on
// a figure that is wrong often enough to matter. So the condition is "the rate
// is confirmed for THIS job", and there are exactly two ways to meet it:
//   - press "Use this rate", or
//   - type a rate by hand, which is confirming it by a stronger act.
// Typing also marks the rate MANUAL, and a manual rate is never overwritten by
// a later address change — the live builder's `taxRateAuto` contract. When an
// address change DOES move an estimated rate, the confirmation is withdrawn and
// the card comes back above the seam with an undo offer. The rate moved under
// you; you should look at it again.
//
// CARD 05 RECONCILES, WHICH THE LIVE BUILDER DOES NOT
// The brief calls surfacing this an improvement rather than a scope violation.
// It is also the only honest done-condition available: a payment schedule that
// covers 70% of the job is not a finished payment schedule.

import type { Draft, Installment, Markups, PriceSheet } from "./worklist-types";
import { STATE_NAME } from "./worklist-data";
import {
  coveredAmount,
  installmentValue,
  money,
  newId,
  pct,
  pct1,
} from "./worklist-math";
import {
  Ann,
  Field,
  Icon,
  MarkupControl,
  MoneyFrame,
  NumberInput,
  PctFrame,
  cx,
} from "./worklist-ui";
import styles from "./manual-worklist.module.css";

/* ============================================================
   CARD 04 — PRICING & TAX
   ============================================================ */

export function PricingBody({
  draft,
  sheet,
  onPatch,
  onSaveDefaults,
  defaultsSaved,
  companyDefaults,
  onRestoreDefaults,
}: {
  draft: Draft;
  sheet: PriceSheet;
  onPatch: (patch: Partial<Draft>) => void;
  onSaveDefaults: () => void;
  /** Flipped by the parent for a few seconds after the defaults are stored. */
  defaultsSaved: boolean;
  /** The org's stored markups. Session-only — there is no data layer here. */
  companyDefaults: Markups;
  onRestoreDefaults: () => void;
}) {
  const { markups } = draft;
  const stateName = draft.taxSourceState
    ? (STATE_NAME[draft.taxSourceState] ?? draft.taxSourceState)
    : null;

  /** Whether this proposal is currently priced at the company defaults. Drives
   *  the Restore affordance: an action that would visibly do nothing should not
   *  be offered. */
  const atDefaults =
    markups.materialMarkupPct === companyDefaults.materialMarkupPct &&
    markups.laborMarkupPct === companyDefaults.laborMarkupPct &&
    markups.overheadPct === companyDefaults.overheadPct &&
    markups.profitPct === companyDefaults.profitPct;

  return (
    <div className={styles.stack}>
      {/* ── The four controls ─────────────────────────────── */}
      <div className={styles.sub}>
        <div className={styles.subHead}>
          <span className={styles.subLab}>Markup</span>
          <span className={cx(styles.marginBadge, sheet.margin < 15 && styles.isThin)}>
            Margin · {pct1(sheet.margin)}
          </span>
        </div>
        <p className={styles.subTeach}>
          Drag or type. Base costs come from the lines above, and every move here
          lands in the ledger underneath before you look away.
        </p>

        <div className={styles.mkStack}>
          <MarkupControl
            label="Materials"
            caption="markup over base"
            value={markups.materialMarkupPct}
            max={100}
            onChange={(v) => onPatch({ markups: { ...markups, materialMarkupPct: v } })}
            baseLabel={`Base ${money(sheet.baseMaterials)}`}
            addedLabel={`+ ${money(sheet.materialMarkup)}`}
          />
          <MarkupControl
            label="Labor"
            caption="markup over base"
            value={markups.laborMarkupPct}
            max={100}
            onChange={(v) => onPatch({ markups: { ...markups, laborMarkupPct: v } })}
            baseLabel={`Base ${money(sheet.baseLabor)}`}
            addedLabel={`+ ${money(sheet.laborMarkup)}`}
          />
          <MarkupControl
            label="Overhead"
            caption="of subtotal"
            value={markups.overheadPct}
            max={50}
            onChange={(v) => onPatch({ markups: { ...markups, overheadPct: v } })}
            baseLabel={`Of ${money(sheet.subtotal)}`}
            addedLabel={`+ ${money(sheet.overhead)}`}
          />
          <MarkupControl
            label="Profit"
            caption="of cost + overhead"
            value={markups.profitPct}
            max={50}
            onChange={(v) => onPatch({ markups: { ...markups, profitPct: v } })}
            baseLabel={`Of ${money(sheet.subtotal + sheet.overhead)}`}
            addedLabel={`+ ${money(sheet.profit)}`}
          />
        </div>

        <div className={styles.inlineActs}>
          <button type="button" className={styles.btn} onClick={onSaveDefaults}>
            <Icon name="pin" />
            Save these as company defaults
          </button>
          {!atDefaults && (
            <button type="button" className={styles.quietBtn} onClick={onRestoreDefaults}>
              <Icon name="undo" />
              Back to {pct1(companyDefaults.materialMarkupPct)} /{" "}
              {pct1(companyDefaults.laborMarkupPct)}
            </button>
          )}
          {defaultsSaved && (
            <span className={styles.okNote} role="status">
              Stored for this session — a new proposal would start at{" "}
              {pct1(companyDefaults.materialMarkupPct)} materials /{" "}
              {pct1(companyDefaults.laborMarkupPct)} labor.
            </span>
          )}
        </div>
      </div>

      {/* ── The ledger ────────────────────────────────────── */}
      <div className={styles.sub}>
        <div className={styles.subHead}>
          <span className={styles.subLab}>Estimate</span>
        </div>
        {/* With Labor-only on, "Base · materials" is legitimately $0.00 — the
            materials are not being charged. Said out loud, because a zero on a
            cost sheet otherwise reads as a mistake. */}
        {draft.options.laborOnly && (
          <p className={styles.subTeach}>
            Labor-only is on, so materials carry no base and no markup on this
            estimate. The costs are still on the lines.
          </p>
        )}
        <dl className={styles.ledger}>
          <LedgerRow label="Base · materials" value={money(sheet.baseMaterials)} muted />
          <LedgerRow label="Base · labor" value={money(sheet.baseLabor)} muted />
          <LedgerRow
            label={`+ Materials markup (${pct1(markups.materialMarkupPct)})`}
            value={money(sheet.materialMarkup)}
          />
          <LedgerRow
            label={`+ Labor markup (${pct1(markups.laborMarkupPct)})`}
            value={money(sheet.laborMarkup)}
          />
          <LedgerRow label="Subtotal" value={money(sheet.subtotal)} rule />
          <LedgerRow
            label={`+ Overhead (${pct1(markups.overheadPct)})`}
            value={money(sheet.overhead)}
          />
          <LedgerRow label={`+ Profit (${pct1(markups.profitPct)})`} value={money(sheet.profit)} />
          <LedgerRow label="Grand total" value={money(sheet.grandTotal)} strong />
          {/* The two rows the live ledger stops short of. Without them the
              contractor has to work out for themselves why the sticky total is
              bigger than the grand total — which is the "which number is the
              number?" doubt this page exists to remove. */}
          <LedgerRow label={`+ Tax · ${pct(draft.taxPct)}`} value={money(sheet.tax)} bridge />
          <LedgerRow label="Quoted to the client" value={money(sheet.total)} strong bridge />
        </dl>
      </div>

      {/* ── Tax ───────────────────────────────────────────── */}
      <div className={styles.sub}>
        <div className={styles.subHead}>
          <span className={styles.subLab}>Sales tax</span>
        </div>

        <div className={styles.taxRow}>
          <Field
            label="Tax rate"
            hint="Type 7.5 for 7.5%. A rate you type by hand is never overwritten by a later address change."
          >
            {(id) => (
              <PctFrame>
                <NumberInput
                  id={id}
                  value={draft.taxPct}
                  min={0}
                  max={25}
                  step={0.01}
                  onChange={(next) =>
                    onPatch({
                      taxPct: next,
                      taxManual: true,
                      taxSourceState: null,
                      // Typing a rate IS confirming it — a stronger act than
                      // pressing the button, so it settles the card outright.
                      taxConfirmed: true,
                    })
                  }
                />
              </PctFrame>
            )}
          </Field>

          <div className={styles.taxState}>
            {draft.taxManual ? (
              <Ann>Set by hand</Ann>
            ) : stateName ? (
              <Ann>Estimated from {stateName} ·</Ann>
            ) : (
              <Ann>No state read from the address</Ann>
            )}
            <span className={styles.taxFig}>{pct(draft.taxPct)}</span>
          </div>
        </div>

        {draft.taxConfirmed ? (
          <div className={styles.confirmRow}>
            <span className={styles.okNote}>
              Confirmed for this job. Tax on {money(sheet.grandTotal)} is{" "}
              {money(sheet.tax)}.
            </span>
            <button
              type="button"
              className={styles.quietBtn}
              onClick={() => onPatch({ taxConfirmed: false })}
            >
              <Icon name="undo" />
              Look again
            </button>
          </div>
        ) : (
          <div className={styles.confirmRow}>
            <button
              type="button"
              className={cx(styles.btn, styles.btnPrimary)}
              onClick={() => onPatch({ taxConfirmed: true })}
            >
              <Icon name="check" />
              Use this rate
            </button>
            <span className={styles.hint}>
              {pct(draft.taxPct)} on {money(sheet.grandTotal)} adds {money(sheet.tax)}.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  muted,
  strong,
  rule,
  bridge,
}: {
  label: string;
  value: string;
  /** Base cost rows — present, but not the point. */
  muted?: boolean;
  /** Subtotal / grand total. */
  strong?: boolean;
  /** Draws the heavier rule above this row. */
  rule?: boolean;
  /** The two rows that carry the ledger over to the client's copy. */
  bridge?: boolean;
}) {
  return (
    <div
      className={cx(
        styles.ledRow,
        muted && styles.isMuted,
        strong && styles.isStrong,
        rule && styles.hasRule,
        bridge && styles.isBridge,
      )}
    >
      <dt>{label}</dt>
      <dd className={styles.num}>{value}</dd>
    </div>
  );
}

/* ============================================================
   CARD 05 — PAYMENT SCHEDULE
   ============================================================ */

export function PaymentBody({
  installments,
  total,
  onChange,
}: {
  installments: Installment[];
  /** The quoted total, tax included — what the client actually pays. */
  total: number;
  onChange: (next: (prev: Installment[]) => Installment[]) => void;
}) {
  const covered = coveredAmount(installments, total);
  const gap = Math.round((total - covered) * 100) / 100;
  const state =
    installments.length === 0
      ? "under"
      : Math.abs(gap) < 0.01
        ? "exact"
        : gap > 0
          ? "under"
          : "over";
  const coveragePct = total > 0 ? Math.min(150, (covered / total) * 100) : 0;

  return (
    <div className={styles.stack}>
      {installments.length === 0 ? (
        <p className={styles.empty}>
          No installments. Add at least one — a proposal with no payment terms is
          a conversation you will have later, on the phone.
        </p>
      ) : (
        <ul className={styles.instList}>
          {installments.map((inst, index) => (
            <li key={inst.id} className={styles.instRow}>
              <span className={styles.lineNo} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>

              <label className={styles.srOnly} htmlFor={`${inst.id}-label`}>
                Installment {index + 1} label
              </label>
              <input
                id={`${inst.id}-label`}
                className={cx(styles.in, styles.instLab)}
                value={inst.label}
                placeholder="Deposit — on signing"
                onChange={(e) =>
                  onChange((prev) =>
                    prev.map((i) => (i.id === inst.id ? { ...i, label: e.target.value } : i)),
                  )
                }
              />

              <div className={styles.instAmt}>
                {inst.isPercent ? (
                  <PctFrame>
                    <NumberInput
                      value={inst.amount}
                      min={0}
                      max={100}
                      step={1}
                      ariaLabel={`Installment ${index + 1} percent`}
                      onChange={(next) =>
                        onChange((prev) =>
                          prev.map((i) => (i.id === inst.id ? { ...i, amount: next } : i)),
                        )
                      }
                    />
                  </PctFrame>
                ) : (
                  <MoneyFrame>
                    <NumberInput
                      value={inst.amount}
                      min={0}
                      step={0.01}
                      ariaLabel={`Installment ${index + 1} amount`}
                      onChange={(next) =>
                        onChange((prev) =>
                          prev.map((i) => (i.id === inst.id ? { ...i, amount: next } : i)),
                        )
                      }
                    />
                  </MoneyFrame>
                )}
              </div>

              {/* Percent or fixed. Two buttons rather than a select: it is a
                  two-state choice and both states have to be legible at a
                  squint, which a collapsed dropdown never is. */}
              <div className={styles.seg} role="group" aria-label={`Installment ${index + 1} type`}>
                <button
                  type="button"
                  className={cx(styles.segBtn, inst.isPercent && styles.isActive)}
                  aria-pressed={inst.isPercent}
                  onClick={() =>
                    onChange((prev) =>
                      prev.map((i) => (i.id === inst.id ? { ...i, isPercent: true } : i)),
                    )
                  }
                >
                  %
                </button>
                <button
                  type="button"
                  className={cx(styles.segBtn, !inst.isPercent && styles.isActive)}
                  aria-pressed={!inst.isPercent}
                  onClick={() =>
                    onChange((prev) =>
                      prev.map((i) => (i.id === inst.id ? { ...i, isPercent: false } : i)),
                    )
                  }
                >
                  $
                </button>
              </div>

              <span className={cx(styles.instValue, styles.num)}>
                {money(installmentValue(inst, total))}
              </span>

              <button
                type="button"
                className={cx(styles.iconBtn, styles.iconDanger)}
                onClick={() => onChange((prev) => prev.filter((i) => i.id !== inst.id))}
              >
                <span className={styles.srOnly}>Remove installment {index + 1}</span>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.inlineActs}>
        <button
          type="button"
          className={styles.btn}
          onClick={() =>
            onChange((prev) => [
              ...prev,
              { id: newId("in"), label: "", amount: 0, isPercent: true },
            ])
          }
        >
          <Icon name="plus" />
          Add installment
        </button>
      </div>

      {/* The reconciliation meter. The done-condition made visible — the whole
          reason this card can settle at all. */}
      <div
        className={cx(
          styles.cover,
          state === "exact" && styles.isExact,
          state === "over" && styles.isOver,
          state === "under" && styles.isUnder,
        )}
      >
        <div className={styles.coverHead}>
          <Ann>Covered</Ann>
          <span className={cx(styles.coverFig, styles.num)}>
            {money(covered)} of {money(total)}
          </span>
        </div>
        <div className={styles.coverTrack} aria-hidden="true">
          <span className={styles.coverFill} style={{ width: `${coveragePct}%` }} />
        </div>
        <p className={styles.coverNote}>
          {state === "exact"
            ? "The schedule lands exactly on the total."
            : state === "over"
              ? `Over by ${money(Math.abs(gap))} — the installments ask for more than the job.`
              : total <= 0
                ? "No total yet. Percentages will resolve to dollars as soon as the lines are priced."
                : `Short by ${money(gap)} — that much of the job has no payment against it.`}
        </p>
      </div>
    </div>
  );
}
