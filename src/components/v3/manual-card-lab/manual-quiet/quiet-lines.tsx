"use client";

// QUIET — card 03, the line table.
//
// This is the only table on the page and therefore the only place a rule line
// earns its keep: a numeric column needs alignment more than it needs air.
// Everywhere else whitespace does the grouping.
//
// THE ROW IS TWO SUB-ROWS, and that is the whole design of this card. A single
// row of [name | qty | unit | unit price | total | remove] leaves the name
// ~130px wide inside a 656px measure, and every real line name here
// ("Architectural shingle · 30 yr, Weathered Slate") is longer than that. So
// the name takes the full measure on its own line and the four figures form a
// fixed, right-aligned cluster underneath — with ONE header row above the list
// carrying the column names, instead of a label on every field in every row.
//
// THE ARITHMETIC IS THE COST SHEET, on purpose. `Unit price` edits the
// material+labor pair through `applyUnitPrice`, `Line total` is quantity x that
// same unit price, and the foot is the sum. So every row multiplies out in
// front of the user. Markup is card 04's job and the marked-up figures print in
// card 10 — three cards, three registers, no figure computed two ways.
//
// Unnamed lines keep their price and are excluded from every total; the row
// says so in amber, which is one of only two places status colour appears.

import type { Line, Unit } from "../manual-focus/manual-focus-types";
import {
  UNITS,
  applyUnitPrice,
  isNamed,
  money,
  round2,
  unitCost,
} from "../manual-focus/manual-focus-math";
import { stateDisplayName } from "../manual-focus/manual-focus-data";
import styles from "./manual-quiet.module.css";
import { Btn, Field, Group, Ic, IconBtn, NumField, Select, TextArea, cx } from "./quiet-ui";

function LineRow({
  line,
  open,
  onToggle,
  onPatch,
  onRemove,
}: {
  line: Line;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const cost = unitCost(line);
  const named = isNamed(line);
  const total = round2(line.quantity * cost);

  return (
    <div className={styles.lineRow}>
      <div className={styles.lineTop}>
        <button
          type="button"
          className={cx(styles.caret, open && styles.caretOpen)}
          aria-expanded={open}
          aria-label={open ? "Hide line detail" : "Show line detail"}
          onClick={onToggle}
        >
          <Ic name="chev" />
        </button>
        <input
          type="text"
          className={styles.input}
          value={line.name}
          placeholder="Describe the work"
          aria-label="Line name"
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        <IconBtn label="Remove line" icon="trash" onClick={onRemove} />
      </div>

      <div className={styles.lineFigs}>
        <span />
        <NumField
          value={line.quantity}
          onChange={(n) => onPatch({ quantity: n })}
          ariaLabel="Quantity"
        />
        <Select<Unit>
          value={line.unit}
          options={UNITS}
          onChange={(u) => onPatch({ unit: u })}
          ariaLabel="Unit"
        />
        <NumField
          value={cost}
          prefix="$"
          onChange={(n) => onPatch(applyUnitPrice(line, n))}
          ariaLabel="Unit price"
        />
        <span />
        <span className={cx(styles.lineTotal, !named && styles.lineTotalMuted)}>
          {money(total)}
        </span>
      </div>

      {!named ? (
        <div className={styles.lineWarn}>Unnamed — not counted, not printed.</div>
      ) : null}

      {open ? (
        <div className={styles.detail}>
          <Field label="Description" small>
            <TextArea
              rows={2}
              value={line.description}
              onChange={(v) => onPatch({ description: v })}
              placeholder="Prints under the name"
            />
          </Field>
          <div className={styles.grid2}>
            <Field label="Material, per unit" small>
              <NumField
                value={line.materialCost}
                prefix="$"
                onChange={(n) => onPatch({ materialCost: n })}
                ariaLabel="Material cost per unit"
              />
            </Field>
            <Field label="Labor, per unit" small>
              <NumField
                value={line.laborCost}
                prefix="$"
                onChange={(n) => onPatch({ laborCost: n })}
                ariaLabel="Labor cost per unit"
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LineItems({
  lines,
  openIds,
  onToggle,
  onPatch,
  onAdd,
  onRemove,
  baseTotal,
  namedCount,
  unnamedCount,
  taxPct,
  taxAuto,
  taxState,
  onTaxPct,
}: {
  lines: Line[];
  openIds: string[];
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: Partial<Line>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  baseTotal: number;
  namedCount: number;
  unnamedCount: number;
  taxPct: number;
  taxAuto: boolean;
  taxState: string;
  onTaxPct: (n: number) => void;
}) {
  return (
    <>
      <div className={styles.lines}>
        <div className={styles.lineHead}>
          <span />
          <span className={styles.colHead}>Qty</span>
          <span className={styles.colHead}>Unit</span>
          <span className={styles.colHead}>Unit price</span>
          <span />
          <span className={cx(styles.colHead, styles.colHeadEnd)}>Line total</span>
        </div>

        {lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            open={openIds.includes(l.id)}
            onToggle={() => onToggle(l.id)}
            onPatch={(patch) => onPatch(l.id, patch)}
            onRemove={() => onRemove(l.id)}
          />
        ))}

        <div className={styles.foot}>
          <span className={styles.footNote}>
            {namedCount} counted
            {unnamedCount > 0 ? ` · ${unnamedCount} unnamed, excluded` : ""}
          </span>
          <span className={styles.footValue}>{money(baseTotal)}</span>
        </div>
      </div>

      <Btn tone="add" icon="plus" onClick={onAdd}>
        Add a line
      </Btn>

      <Group>
        <div className={styles.narrow}>
          <Field
            label="Tax rate"
            hint={
              taxAuto && taxState ? `Estimated from ${stateDisplayName(taxState)}` : "Set by hand"
            }
          >
            <NumField value={taxPct} suffix="%" max={100} onChange={onTaxPct} ariaLabel="Tax rate" />
          </Field>
        </div>
      </Group>
    </>
  );
}
