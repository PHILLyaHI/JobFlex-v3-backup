"use client";

// STEPS — sections 04 (Markup) and 08 (Payments).
//
// 04 · WHY THE LEDGER IS THREE ROWS AND ENDS ON A PERCENTAGE.
// The rejected build printed the subtotal, the tax and the grand total inside
// this card, inside the line-items card, in the sticky strip AND on the
// client's copy. Every figure gets exactly one loud home here. The grand total
// lives in the sticky bar; the pre-tax figure belongs to the priced sheet. So
// what this card owns — and the only figure it prints large — is MARGIN, which
// appears nowhere else on the page and is the one number a contractor is
// actually asking this card for. Cost carried and the amount markup adds are
// the two quiet rows that make the margin checkable.
//
// The four percentages are the page's only grid. Stacked full-width they would
// spend 260px of column on four two-character values with three-quarters of
// each row empty; 2x2 keeps them one glance and one group. It is a numeric
// grid, not a section split into columns.
//
// 08 · A PERCENTAGE IS NOT AN ANSWER.
// "30%" tells a homeowner nothing until it is dollars, so every installment
// prints its own resolved value under its controls. The coverage meter is the
// card's status: a schedule that does not add up to the total is a real defect
// and gets a real colour — under is amber (still being built), over is red
// (someone will be billed twice). Exact is the quiet green, once, and nowhere
// else on the page is green used at all.

import type { Draft, Installment, Totals } from "../manual-focus/manual-focus-types";
import { DEFAULT_MARKUPS } from "../manual-focus/manual-focus-data";
import {
  coverState,
  coveredAmount,
  installmentValue,
  money,
  newId,
  pct1,
} from "../manual-focus/manual-focus-math";
import {
  Block,
  Btn,
  Derived,
  Field,
  Glyph,
  IconBtn,
  NumGrid,
  NumberInput,
  Note,
  PATH,
  Segmented,
  TextInput,
} from "./steps-ui";
import type { Patch } from "./steps-pickers";
import s from "./manual-steps.module.css";

/* ══ 04 · MARKUP ════════════════════════════════════════════════════════ */

export function MarkupCard({ draft, patch, totals }: { draft: Draft; patch: Patch; totals: Totals }) {
  const atDefaults =
    draft.materialMarkupPct === DEFAULT_MARKUPS.materialMarkupPct &&
    draft.laborMarkupPct === DEFAULT_MARKUPS.laborMarkupPct &&
    draft.overheadPct === DEFAULT_MARKUPS.overheadPct &&
    draft.profitPct === DEFAULT_MARKUPS.profitPct;

  return (
    <>
      <Block>
        <NumGrid>
          <Field label="Materials" htmlFor="st-mm">
            <NumberInput
              id="st-mm"
              value={draft.materialMarkupPct}
              onChange={(materialMarkupPct) => patch({ materialMarkupPct })}
              min={0}
              max={300}
              step={0.5}
              suffix="%"
              align="right"
            />
          </Field>
          <Field label="Labor" htmlFor="st-lm">
            <NumberInput
              id="st-lm"
              value={draft.laborMarkupPct}
              onChange={(laborMarkupPct) => patch({ laborMarkupPct })}
              min={0}
              max={300}
              step={0.5}
              suffix="%"
              align="right"
            />
          </Field>
          <Field label="Overhead" htmlFor="st-oh">
            <NumberInput
              id="st-oh"
              value={draft.overheadPct}
              onChange={(overheadPct) => patch({ overheadPct })}
              min={0}
              max={100}
              step={0.5}
              suffix="%"
              align="right"
            />
          </Field>
          <Field label="Profit" htmlFor="st-pr">
            <NumberInput
              id="st-pr"
              value={draft.profitPct}
              onChange={(profitPct) => patch({ profitPct })}
              min={0}
              max={100}
              step={0.5}
              suffix="%"
              align="right"
            />
          </Field>
        </NumGrid>

        {atDefaults ? null : (
          <div className={s.blockActions}>
            <Btn variant="quiet" onClick={() => patch({ ...DEFAULT_MARKUPS })}>
              <Glyph d={PATH.undo} />
              Company defaults
            </Btn>
          </div>
        )}
      </Block>

      <Block title="What that earns">
        <Derived label="Cost carried" value={money(totals.baseTotal)} />
        <Derived label="Added by markup" value={money(totals.preTax - totals.baseTotal)} />
        <Derived label="Margin" value={pct1(totals.margin)} strong />
      </Block>
    </>
  );
}

/* ══ 08 · PAYMENTS ══════════════════════════════════════════════════════ */

export function PaymentsCard({ draft, patch, totals }: { draft: Draft; patch: Patch; totals: Totals }) {
  const covered = coveredAmount(draft.installments, totals.total);
  const state = coverState(draft.installments, totals.total);
  const fill = totals.total > 0 ? Math.min(1, covered / totals.total) : 0;

  function editInst(id: string, next: Partial<Installment>) {
    patch({ installments: draft.installments.map((i) => (i.id === id ? { ...i, ...next } : i)) });
  }

  return (
    <>
      <Block>
        <div className={s.lines}>
          {draft.installments.map((inst) => (
            <div key={inst.id} className={s.line}>
              <div className={s.lineTop}>
                <TextInput
                  value={inst.label}
                  onChange={(label) => editInst(inst.id, { label })}
                  placeholder="When this one is due"
                  ariaLabel="Installment label"
                />
                <IconBtn
                  label={`Remove ${inst.label.trim() || "this installment"}`}
                  onClick={() =>
                    patch({ installments: draft.installments.filter((i) => i.id !== inst.id) })
                  }
                />
              </div>

              <div className={s.lineNums}>
                <div className={s.lineCtl}>
                  <span className={s.microLabel}>Amount</span>
                  <NumberInput
                    value={inst.amount}
                    onChange={(amount) => editInst(inst.id, { amount })}
                    min={0}
                    step={inst.isPercent ? 1 : 0.01}
                    prefix={inst.isPercent ? undefined : "$"}
                    suffix={inst.isPercent ? "%" : undefined}
                    ariaLabel="Installment amount"
                    align="right"
                  />
                </div>

                <div className={s.lineCtl} data-wide="1">
                  <span className={s.microLabel}>Measured in</span>
                  <Segmented
                    compact
                    ariaLabel="Percentage or dollars"
                    value={inst.isPercent ? "pct" : "usd"}
                    options={[
                      { value: "pct", label: "%" },
                      { value: "usd", label: "$" },
                    ]}
                    onChange={(next) => editInst(inst.id, { isPercent: next === "pct" })}
                  />
                </div>

                <div className={s.lineMoney}>
                  <span className={s.lineTotal}>{money(installmentValue(inst, totals.total))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={s.blockActions}>
          <Btn
            variant="quiet"
            onClick={() =>
              patch({
                installments: [
                  ...draft.installments,
                  { id: newId("in"), label: "", amount: 0, isPercent: true },
                ],
              })
            }
          >
            <Glyph d={PATH.plus} />
            Add installment
          </Btn>
        </div>
      </Block>

      <Block title="Coverage">
        <div className={s.meter} data-state={state}>
          <div className={s.meterTrack}>
            <div className={s.meterFill} style={{ width: `${Math.round(fill * 1000) / 10}%` }} />
          </div>
          <div className={s.meterRow}>
            <span className={s.meterNote}>
              {state === "exact"
                ? "Balanced"
                : state === "over"
                  ? `Over by ${money(covered - totals.total)}`
                  : state === "under"
                    ? `Short ${money(totals.total - covered)}`
                    : "Nothing scheduled"}
            </span>
            <span className={s.meterFig}>
              {money(covered)} <span className={s.meterOf}>of {money(totals.total)}</span>
            </span>
          </div>
        </div>
        {state === "over" ? <Note tone="warn">The schedule bills more than the job.</Note> : null}
      </Block>
    </>
  );
}
