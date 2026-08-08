"use client";

// WORKLIST — card 03, the priced work.
//
// The blocking card: a proposal with no lines is not a proposal, and a line
// with no name is a row the live builder throws away on save. So the
// done-condition here is stricter than the live builder's — "at least one line,
// and every line is named" — which is what puts the seeded unnamed row in front
// of the reader on load instead of letting it slip through into the document.
//
// ROW GRAMMAR (principle 6 — three weights, never a fourth)
//   1. the NAME row      — the line, at reading weight, with its own controls
//   2. the FIGURE strip  — unit / qty / cost / sell / total, labelled above
//   3. the DISCLOSURE    — description, the cost split, the ratio bar
// Nothing else is a row. A line that is missing its name gets a warning chip on
// row 1, not a fourth row type.
//
// THE PRICE MODEL, AND WHY THE `$` FIELD IS COST AND NOT SELL
// A line's cost per unit is `material + labor` — there is no third stored
// number (see the note on `Line` in worklist-types.ts). The `$ COST / UNIT`
// field is therefore an editor for the PAIR: typing in it scales material and
// labor to hit the figure while holding the ratio the contractor already set.
// Next to it, read-only and tabular, sit the two numbers the edit moved — the
// marked-up SELL / UNIT and the LINE TOTAL — so a change to cost shows its
// consequence without the eye leaving the row.

import { useState } from "react";
import type { Line, PriceSheet, Unit } from "./worklist-types";
import {
  UNITS,
  costPerUnit,
  materialShare,
  money,
  newId,
  scaleToCost,
} from "./worklist-math";
import { Field, Icon, MoneyFrame, NumberInput, cx } from "./worklist-ui";
import styles from "./manual-worklist.module.css";

/** A fresh, empty row. Empty on purpose — the name is the first thing typed. */
function blankLine(): Line {
  return {
    id: newId("ln"),
    name: "",
    description: "",
    unit: "SQFT",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
  };
}

export function LinesBody({
  lines,
  sheet,
  laborOnly,
  onChange,
}: {
  lines: Line[];
  sheet: PriceSheet;
  /** Mirrors the Labor-only option, so a suppressed row can say it is. */
  laborOnly: boolean;
  onChange: (next: (prev: Line[]) => Line[]) => void;
}) {
  const unnamed = lines.filter((l) => l.name.trim().length === 0).length;

  return (
    <div className={styles.stack}>
      {/* Labor-only changes the price, not just the printout, so the card that
          owns the price has to say so. Without this the contractor watches the
          total drop and has no idea which switch did it. */}
      {laborOnly && (
        <p className={styles.suppressBanner}>
          Labor-only is on. Material costs are still recorded on every line, but
          they are not charged and do not print.
        </p>
      )}

      {lines.length === 0 ? (
        <p className={styles.empty}>
          No lines yet. Every proposal needs at least one — start with the biggest
          piece of the job and work down.
        </p>
      ) : (
        <ul className={styles.lineList}>
          {lines.map((line, index) => (
            <LineRow
              key={line.id}
              line={line}
              index={index}
              priced={sheet.perLine.find((p) => p.id === line.id)}
              canRemove={lines.length > 1}
              onPatch={(patch) =>
                onChange((prev) => prev.map((l) => (l.id === line.id ? { ...l, ...patch } : l)))
              }
              onScaleCost={(target) =>
                onChange((prev) =>
                  prev.map((l) => (l.id === line.id ? scaleToCost(l, target) : l)),
                )
              }
              onRemove={() => onChange((prev) => prev.filter((l) => l.id !== line.id))}
            />
          ))}
        </ul>
      )}

      <div className={styles.inlineActs}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onChange((prev) => [...prev, blankLine()])}
        >
          <Icon name="plus" />
          Add line
        </button>
        {unnamed > 0 && (
          <span className={styles.warnNote}>
            {unnamed === 1 ? "One line has no name" : `${unnamed} lines have no name`} — an unnamed
            line never reaches the client.
          </span>
        )}
      </div>
    </div>
  );
}

function LineRow({
  line,
  index,
  priced,
  canRemove,
  onPatch,
  onScaleCost,
  onRemove,
}: {
  line: Line;
  index: number;
  priced: PriceSheet["perLine"][number] | undefined;
  canRemove: boolean;
  onPatch: (patch: Partial<Line>) => void;
  onScaleCost: (target: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const named = line.name.trim().length > 0;
  const share = materialShare(line);
  const suppressed = priced?.suppressed ?? false;

  return (
    <li className={cx(styles.lineRow, !named && styles.isUnnamed)}>
      {/* Row 1 — the line itself. */}
      <div className={styles.lineTop}>
        <span className={styles.lineNo} aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>

        <label className={styles.srOnly} htmlFor={`${line.id}-name`}>
          Line {index + 1} name
        </label>
        <input
          id={`${line.id}-name`}
          className={cx(styles.in, styles.lineName)}
          value={line.name}
          placeholder="Name this line — e.g. Architectural shingle · 30 yr"
          onChange={(e) => onPatch({ name: e.target.value })}
        />

        {!named && <span className={styles.needChip}>Needs a name</span>}

        <button
          type="button"
          className={styles.iconBtn}
          aria-expanded={open}
          aria-controls={`${line.id}-more`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.srOnly}>
            {open ? "Hide cost breakdown" : "Show cost breakdown"}
          </span>
          <span className={cx(styles.chev, open && styles.isOpen)} aria-hidden="true">
            <Icon name="chev" />
          </span>
        </button>

        <button
          type="button"
          className={cx(styles.iconBtn, styles.iconDanger)}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <span className={styles.srOnly}>Remove line {index + 1}</span>
          <Icon name="trash" />
        </button>
      </div>

      {/* Row 2 — the figures. Labelled above each control, so the strip never
          has to be read left-to-right to be understood. */}
      <div className={styles.figStrip}>
        <div className={styles.figCell}>
          <label className={styles.figLab} htmlFor={`${line.id}-unit`}>
            Unit
          </label>
          <span className="bp-sel">
            <select
              id={`${line.id}-unit`}
              className="bp-sel-in"
              value={line.unit}
              onChange={(e) => onPatch({ unit: e.target.value as Unit })}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div className={styles.figCell}>
          <label className={styles.figLab} htmlFor={`${line.id}-qty`}>
            Quantity
          </label>
          <NumberInput
            id={`${line.id}-qty`}
            value={line.quantity}
            min={0}
            step={1}
            onChange={(next) => onPatch({ quantity: next })}
          />
        </div>

        <div className={styles.figCell}>
          <label className={styles.figLab} htmlFor={`${line.id}-cost`}>
            Cost / unit
          </label>
          <MoneyFrame>
            <NumberInput
              id={`${line.id}-cost`}
              value={costPerUnit(line)}
              min={0}
              step={0.01}
              onChange={onScaleCost}
            />
          </MoneyFrame>
        </div>

        <div className={cx(styles.figCell, styles.figRead)}>
          <span className={styles.figLab}>Sell / unit</span>
          <span className={styles.figVal}>{money(priced?.sellUnit ?? 0)}</span>
        </div>

        <div className={cx(styles.figCell, styles.figRead, styles.figTotal)}>
          <span className={styles.figLab}>Line total</span>
          <span className={styles.figVal}>{money(priced?.total ?? 0)}</span>
        </div>
      </div>

      {suppressed && (
        <p className={styles.suppressedNote}>
          Labor-only is on and this line is all material, so it does not print and
          is not charged.
        </p>
      )}

      {/* Row 3 — the disclosure. */}
      {open && (
        <div className={styles.lineMore} id={`${line.id}-more`}>
          <Field label="Description" optional hint="Appears under the name on the proposal.">
            {(id) => (
              <textarea
                id={id}
                className={cx(styles.ta, styles.taShort)}
                value={line.description}
                placeholder="Two courses at the eaves per the 2026 code amendment."
                onChange={(e) => onPatch({ description: e.target.value })}
              />
            )}
          </Field>

          <div className={styles.breakdown}>
            <span className={styles.ann}>Cost breakdown · per unit</span>
            <div className={styles.grid2}>
              <Field label="Material $ / unit">
                {(id) => (
                  <MoneyFrame>
                    <NumberInput
                      id={id}
                      value={line.materialCost}
                      min={0}
                      step={0.01}
                      onChange={(next) => onPatch({ materialCost: next })}
                    />
                  </MoneyFrame>
                )}
              </Field>
              <Field label="Labor $ / unit">
                {(id) => (
                  <MoneyFrame>
                    <NumberInput
                      id={id}
                      value={line.laborCost}
                      min={0}
                      step={0.01}
                      onChange={(next) => onPatch({ laborCost: next })}
                    />
                  </MoneyFrame>
                )}
              </Field>
            </div>

            <div className={styles.ratio}>
              <span className={styles.ann}>Material / labor ratio</span>
              <div
                className={styles.ratioBar}
                role="img"
                aria-label={`Material ${share.toFixed(0)} percent, labor ${(100 - share).toFixed(0)} percent`}
              >
                <span className={styles.ratioMat} style={{ width: `${share}%` }} />
              </div>
              <div className={styles.ratioLegend}>
                <span>Material {share.toFixed(0)}%</span>
                <span className={styles.num}>Labor {(100 - share).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
