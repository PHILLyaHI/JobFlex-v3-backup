"use client";

// PROOF CARD — card 02, the line items (route: /dashboard/manual-proof).
//
// THIS CARD'S CONSEQUENCE IS "BASE": the raw cost of the work, before a cent of
// markup. So the money column on every row is headed BASE and shows exactly
// that, and the card's proof footer states the sum. What the client is charged
// is card 03's business, and mixing the two on one row is how a contractor
// loses track of which number they are looking at.
//
// THREE ROW GRAMMARS, and never a fourth:
//   · the column head  — a mono annotation on a beige strip
//   · the item row     — paper, hairline-divided, one scan line
//   · the detail panel — a blueprint-edged sub-block under the row it belongs to
//
// The per-row detail carries what the live builder puts behind its chevron: the
// description, the material / labor split per unit, and the ratio readout. The
// split is behind disclosure because it is INTERNAL — the client never sees it,
// so it must never compete with the row for attention.

import { useState } from "react";
import type { LineItem, Unit } from "./manual-proof-types";
import {
  UNITS,
  baseUnit,
  isMaterialOnly,
  lineBase,
  materialShare,
  money,
  newId,
  rescaleUnitPrice,
  withSplit,
} from "./manual-proof-math";
import { cx } from "./proof-card";
import { AddBtn, EmptyNote, Ic, IconBtn, NumIn, SelectIn, TextIn } from "./proof-bits";
import styles from "./manual-proof.module.css";

/** A fresh, empty row. Named nothing on purpose: an unnamed line IS the empty
 *  state of this card, and card 02's footer counts them out loud. */
export function newLine(): LineItem {
  return {
    id: newId("ln"),
    name: "",
    description: "",
    unit: "UNIT",
    quantity: 1,
    unitPrice: 0,
    materialCost: 0,
    laborCost: 0,
  };
}

/**
 * One priced row.
 *
 * MODULE SCOPE, not nested in the block below — a component declared inside a
 * render is a new element type on every keystroke, which unmounts the row and
 * takes the caret with it.
 */
function LineRow({
  line,
  index,
  laborOnly,
  onPatch,
  onRemove,
}: {
  line: LineItem;
  index: number;
  /** When a labor-only quote is on, a pure-material row is struck out here as
   *  well as dropped from the price — the row has to look suppressed where it
   *  lives, not only in a footer three cards away. */
  laborOnly: boolean;
  onPatch: (next: LineItem) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const label = line.name.trim().length > 0 ? line.name : `Line ${index + 1}`;
  const share = materialShare(line);
  const suppressed = laborOnly && isMaterialOnly(line);

  return (
    <div className={cx(styles.lineWrap, suppressed && styles.isSuppressed)}>
      <div className={styles.lineRow}>
        <IconBtn
          icon="chev"
          label={open ? `Hide the cost breakdown for ${label}` : `Show the cost breakdown for ${label}`}
          expanded={open}
          open={open}
          onClick={() => setOpen((v) => !v)}
        />

        <input
          className={cx(styles.rowIn, styles.lineName)}
          value={line.name}
          placeholder="Name this line"
          aria-label={`Line ${index + 1} name`}
          onChange={(e) => onPatch({ ...line, name: e.target.value })}
        />

        <NumIn
          dense
          value={line.quantity}
          ariaLabel={`Quantity for ${label}`}
          onChange={(v) => onPatch({ ...line, quantity: v })}
        />

        <SelectIn
          className={styles.unitSel}
          value={line.unit}
          ariaLabel={`Measurement unit for ${label}`}
          options={UNITS}
          onChange={(v) => onPatch({ ...line, unit: v as Unit })}
        />

        <NumIn
          dense
          affix="$"
          value={line.unitPrice}
          ariaLabel={`Unit price for ${label}`}
          onChange={(v) => onPatch(rescaleUnitPrice(line, v))}
        />

        <span className={styles.lineTotal}>
          {money(lineBase(line))}
          {suppressed && <span className={styles.lineStrike}>dropped</span>}
        </span>

        <IconBtn icon="trash" danger label={`Remove ${label}`} onClick={onRemove} />
      </div>

      {open && (
        <div className={styles.detail}>
          <label className={styles.field}>
            <span className={styles.lab}>Description</span>
            <TextIn
              value={line.description}
              onChange={(v) => onPatch({ ...line, description: v })}
              placeholder="Optional — appears under the name on the proposal"
            />
          </label>

          <div className={styles.splitBlock}>
            <div className={styles.splitHead}>Cost breakdown · per unit</div>

            <div className={styles.splitGrid}>
              <label className={styles.field}>
                <span className={styles.lab}>Material $/unit</span>
                <NumIn
                  affix="$"
                  value={line.materialCost}
                  ariaLabel={`Material cost per unit for ${label}`}
                  onChange={(v) => onPatch(withSplit(line, { materialCost: v }))}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.lab}>Labor $/unit</span>
                <NumIn
                  affix="$"
                  value={line.laborCost}
                  ariaLabel={`Labor cost per unit for ${label}`}
                  onChange={(v) => onPatch(withSplit(line, { laborCost: v }))}
                />
              </label>

              <div className={styles.perUnit}>
                <span className={styles.lab}>Per unit</span>
                <span className={styles.perUnitVal}>{money(baseUnit(line))}</span>
              </div>
            </div>

            {/* The ratio readout. Derived from the two fields above rather than
                a third control — one number cannot have two owners. */}
            <div className={styles.ratio}>
              <span className={styles.ratioLab}>Material / labor ratio</span>
              {share === null ? (
                <span className={styles.ratioNone}>No cost on this line yet</span>
              ) : (
                <>
                  <span className={styles.ratioBar} aria-hidden="true">
                    {/* The only inline style in this file, and unavoidable: a
                        bar's width IS the datum, so it cannot live in a
                        stylesheet. */}
                    <span className={styles.ratioFill} style={{ width: `${share}%` }} />
                  </span>
                  <span className={styles.ratioVal}>
                    {share}% material · {Math.round((100 - share) * 10) / 10}% labor
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Card 02's body. */
export function LinesBlock({
  lines,
  laborOnly,
  onChange,
}: {
  lines: LineItem[];
  laborOnly: boolean;
  onChange: (next: LineItem[]) => void;
}) {
  return (
    <>
      {lines.length === 0 ? (
        <EmptyNote title="No lines yet">
          Nothing is priced, so every figure below this card is $0.00. Add the first run of work.
        </EmptyNote>
      ) : (
        <div className={styles.lineTable}>
          <div className={styles.colHead}>
            <span aria-hidden="true" />
            <span>Line item</span>
            <span className={styles.colRight}>Qty</span>
            <span>Unit</span>
            <span className={styles.colRight}>Unit $</span>
            <span className={styles.colRight}>Base</span>
            <span aria-hidden="true" />
          </div>

          {lines.map((line, i) => (
            <LineRow
              key={line.id}
              line={line}
              index={i}
              laborOnly={laborOnly}
              onPatch={(next) => onChange(lines.map((l) => (l.id === line.id ? next : l)))}
              onRemove={() => onChange(lines.filter((l) => l.id !== line.id))}
            />
          ))}
        </div>
      )}

      <div className={styles.addRow}>
        <AddBtn onClick={() => onChange([...lines, newLine()])}>Add a line</AddBtn>
      </div>

      {laborOnly && (
        <p className={styles.suppressNote}>
          <Ic name="ban" />
          <span>
            A labor-only quote is on (card 07). Rows with no labor cost are struck out above and
            are not priced.
          </span>
        </p>
      )}
    </>
  );
}
