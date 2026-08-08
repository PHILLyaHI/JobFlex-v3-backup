"use client";

// SPEC SHEET — SH-02, the schedule of work. Route /dashboard/manual-spec.
//
// THE SPEC TABLE
// A repeating structure is still a two-track row: the line INDEX lives in the
// label gutter and the priced columns live on the value track, so the mono
// column heads sit over their figures AND on the same vertical rule as every
// single value on the page. That is the whole point of the variant — one grid,
// no floating controls.
//
// The gutter index doubles as the row's disclosure. Putting the expander there
// keeps a fourth control out of the value track and leaves the row grammar at
// exactly three weights: column head, item, schedule total.
//
// UNIT $ IS EDITABLE, and that is deliberate. On a spec sheet every value on
// the track is typed, never read-only, so typing a unit price back-solves the
// material / labor split it implies (holding the line's current ratio) rather
// than being ignored. The split itself stays behind the row's own number,
// where the client-facing document has no business seeing it.
//
// Fixture-only page: this component owns no data. Every edit goes up through
// `onPatch` to the draft in manual-spec-content.tsx.

import { useState } from "react";
import type { LineFigure, Markups, SpecLine, SpecOptions, Unit } from "./manual-spec-types";
import {
  UNITS,
  money,
  pct,
  round2,
  splitFromUnitSell,
  unitCost,
} from "./manual-spec-math";
import { Note, cx } from "./spec-frame";
import styles from "./manual-spec.module.css";

export function LineTable({
  lines,
  perLine,
  markups,
  options,
  /** grandTotal / estimateSubtotal — how much overhead and profit add on top
   *  of a line's marked-up price. Needed to back-solve a typed UNIT $. */
  uplift,
  onPatch,
  onRemove,
  onAdd,
  scheduleTotal,
}: {
  lines: SpecLine[];
  perLine: LineFigure[];
  markups: Markups;
  options: SpecOptions;
  uplift: number;
  onPatch: (id: string, patch: Partial<SpecLine>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  scheduleTotal: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      {/* Column heads */}
      <div className={cx(styles.row, styles.isHead)}>
        <div className={styles.tHeadLab}>Item №</div>
        <div className={cx(styles.rowVal, styles.isFlush)}>
          <div className={cx(styles.tHead, styles.lnGrid)}>
            <span>Description</span>
            <span className={styles.thNum}>Qty</span>
            <span>Unit</span>
            <span className={styles.thNum}>Unit $</span>
            <span className={styles.thNum}>Amount</span>
            <span aria-hidden="true" />
          </div>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className={styles.row}>
          <div className={styles.rowLab}>No lines</div>
          <div className={styles.rowVal}>
            <Note kicker="Empty schedule">
              A proposal with no priced lines has nothing to total. Add the first one below.
            </Note>
          </div>
        </div>
      ) : (
        lines.map((line, i) => {
          const no = String(i + 1).padStart(2, "0");
          const fig = perLine[i];
          const open = openId === line.id;
          const blank = line.name.trim().length === 0;
          const detailId = `${line.id}-detail`;

          return (
            <div className={cx(styles.row, styles.isItem)} key={line.id}>
              <button
                type="button"
                className={cx(
                  styles.rowIdx,
                  open && styles.isOpen,
                  blank && styles.isBlank,
                )}
                aria-expanded={open}
                aria-controls={detailId}
                onClick={() => setOpenId(open ? null : line.id)}
              >
                <span className={styles.sr}>
                  {open
                    ? `Hide the cost breakdown for line ${no}`
                    : `Show the cost breakdown for line ${no}`}
                </span>
                <span aria-hidden="true">{no}</span>
                <svg className="ic" aria-hidden="true">
                  <use href="#i-chev" />
                </svg>
              </button>

              <div className={cx(styles.rowVal, styles.isFlush)}>
                <div className={cx(styles.cellRow, styles.lnGrid)}>
                  <input
                    className={cx(styles.cellIn, styles.isName)}
                    value={line.name}
                    placeholder="Line item name"
                    aria-label={`Line ${no} name`}
                    onChange={(e) => onPatch(line.id, { name: e.target.value })}
                  />

                  <input
                    className={cx(styles.cellIn, styles.isNum)}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={line.quantity}
                    aria-label={`Line ${no} quantity`}
                    onChange={(e) => onPatch(line.id, { quantity: Number(e.target.value) })}
                  />

                  <select
                    className={styles.cellSel}
                    value={line.unit}
                    aria-label={`Line ${no} measurement unit`}
                    onChange={(e) => onPatch(line.id, { unit: e.target.value as Unit })}
                  >
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>

                  <input
                    className={cx(styles.cellIn, styles.isNum)}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={round2(fig.unitSell)}
                    aria-label={`Line ${no} unit price in dollars`}
                    onChange={(e) =>
                      onPatch(
                        line.id,
                        splitFromUnitSell(
                          line,
                          markups,
                          options,
                          uplift,
                          Number(e.target.value),
                        ),
                      )
                    }
                  />

                  <span className={cx(styles.cellAmt, fig.amount <= 0 && styles.isNil)}>
                    {money(fig.amount)}
                    {blank && (
                      <span className={styles.cellNote}>Unnamed · not issued</span>
                    )}
                  </span>

                  <button
                    type="button"
                    className={cx(styles.iconBtn, styles.isDanger)}
                    aria-label={`Remove line ${no}`}
                    onClick={() => onRemove(line.id)}
                  >
                    <svg className="ic">
                      <use href="#i-x" />
                    </svg>
                  </button>
                </div>

                {open && (
                  <LineDetail
                    id={detailId}
                    no={no}
                    line={line}
                    fig={fig}
                    options={options}
                    onPatch={onPatch}
                  />
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Add line */}
      <div className={styles.row}>
        <div className={styles.rowLab} aria-hidden="true" />
        <div className={styles.rowVal}>
          <button type="button" className={styles.addBtn} onClick={onAdd}>
            <svg className="ic" aria-hidden="true">
              <use href="#i-plus" />
            </svg>
            Add a line
          </button>
        </div>
      </div>

      {/* The schedule summary — the same figure the issued sheet prints as its
          subtotal, because the amount column was reconciled against it. */}
      <div className={cx(styles.row, styles.isFoot)}>
        <div className={styles.tHeadLab}>Total</div>
        <div className={cx(styles.rowVal, styles.isFlush)}>
          <div className={styles.tFoot}>
            <span className={styles.tFootLab}>Schedule of work</span>
            <span className={styles.tFootLead} aria-hidden="true" />
            <span className={styles.tFootVal}>{money(scheduleTotal)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   The per-row disclosure: the internal cost split.
   MODULE SCOPE, not nested — a component declared inside its
   parent is a new element type on every render, which unmounts
   the panel and drops the caret out of whichever field is being
   typed in.
   ───────────────────────────────────────────────────────────── */

function LineDetail({
  id,
  no,
  line,
  fig,
  options,
  onPatch,
}: {
  id: string;
  no: string;
  line: SpecLine;
  fig: LineFigure;
  options: SpecOptions;
  onPatch: (id: string, patch: Partial<SpecLine>) => void;
}) {
  const cost = unitCost(line, options);
  const share = fig.materialSharePct;

  return (
    <div className={styles.detail} id={id}>
      <span className={styles.detLab}>Cost breakdown · per unit</span>

      <div className={styles.detGrid}>
        <div className={styles.detField}>
          <label className={styles.detLab} htmlFor={`${id}-desc`}>
            Description
          </label>
          <input
            id={`${id}-desc`}
            className={styles.in}
            value={line.description}
            placeholder="Optional — appears under the name on the proposal"
            onChange={(e) => onPatch(line.id, { description: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.detGrid}>
        <div className={styles.detField}>
          <label className={styles.detLab} htmlFor={`${id}-mat`}>
            Material $/unit
          </label>
          <input
            id={`${id}-mat`}
            className={cx(styles.in, styles.isNum)}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={round2(line.materialCost)}
            onChange={(e) => onPatch(line.id, { materialCost: Number(e.target.value) })}
          />
        </div>
        <div className={styles.detField}>
          <label className={styles.detLab} htmlFor={`${id}-lab`}>
            Labor $/unit
          </label>
          <input
            id={`${id}-lab`}
            className={cx(styles.in, styles.isNum)}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={round2(line.laborCost)}
            onChange={(e) => onPatch(line.id, { laborCost: Number(e.target.value) })}
          />
        </div>
        <div className={styles.detField}>
          <span className={styles.detLab}>Cost per unit</span>
          <span className={styles.calc}>{money(cost)}</span>
          <span className={styles.calcSub}>
            sells at {money(fig.unitSell)} after markup
          </span>
        </div>
      </div>

      <span className={styles.detLab}>Material / labor ratio</span>
      <div
        className={styles.ratio}
        role="img"
        aria-label={`Line ${no} is ${Math.round(share)} percent material and ${
          100 - Math.round(share)
        } percent labor, by cost.`}
      >
        {/* The only inline style in the folder, and unavoidable: a bar's WIDTH
            is the datum itself, so it cannot live in a stylesheet. */}
        <span
          className={styles.ratioMat}
          style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
        />
      </div>
      <div className={styles.ratioLab} aria-hidden="true">
        <span>Material {pct(round2(share))}</span>
        <span>Labor {pct(round2(100 - share))}</span>
      </div>
    </div>
  );
}
