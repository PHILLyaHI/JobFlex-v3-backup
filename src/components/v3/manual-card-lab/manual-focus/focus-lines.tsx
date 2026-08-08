"use client";

// FOCUS CARD — card 03, the priced work (route: /dashboard/manual-focus).
//
// THREE ROW GRAMMARS AND NO FOURTH
//   column head — mono caps on a beige strip, the drawing's own annotation
//   item row     — one scan line: name, qty, unit, unit price, line total
//   detail       — the row's own disclosure, framed and inset so it can never
//                  be mistaken for another item
// Everything a line has that is NOT needed to read the sheet at a glance —
// the description and the material/labor split — lives behind that disclosure,
// which is the same progressive-disclosure rule the whole column runs on,
// applied one level down.
//
// UNIT PRICE IS EDITABLE AND IS NOT STORED. It is `material + labor`, and
// typing into it rescales the pair around its current ratio (see
// `applyUnitPrice`). A third stored number would drift the moment either half
// was edited — which is exactly what the live builder spends three call sites
// keeping in sync by hand.
//
// AN UNNAMED LINE IS NOT WORK YET. It is excluded from every total and from the
// client's copy, and the row says so in amber rather than quietly adding $0 to
// a number nobody can then trace. The seeded draft ships with one, so this
// partial state is visible on the first paint instead of being something a
// reviewer has to construct.
//
// TAX lives here, at the foot of the priced work, because that is where the
// live builder puts it and because it is the last thing that happens to a line
// total. It carries the address estimate's provenance, and once the rate has
// been typed by hand it is NEVER silently overwritten by a later address
// change — the field owns itself from that point on, and the way back is an
// explicit link.
//
// FIXTURE-ONLY: every value here is component-local state owned by the content
// component. No `@/actions/*`, no Prisma, no network.

import { useState } from "react";
import type { Line, Unit } from "./manual-focus-types";
import {
  UNITS,
  applyMaterialShare,
  applyUnitPrice,
  isNamed,
  lineSell,
  materialShare,
  money,
  pct,
  sellUnit,
  unitCost,
} from "./manual-focus-math";
import {
  AddBtn,
  Ann,
  Empty,
  Field,
  IconBtn,
  LinkBtn,
  MoneyIn,
  NumIn,
  PctIn,
  SelectIn,
  TextIn,
  cx,
} from "./focus-ui";
import styles from "./manual-focus.module.css";

type Rates = { materialMarkupPct: number; laborMarkupPct: number };

export function LinesBlock({
  lines,
  rates,
  taxPct,
  taxAuto,
  taxState,
  estimate,
  stateName,
  onPatchLine,
  onAddLine,
  onRemoveLine,
  onTaxChange,
  onUseEstimate,
}: {
  lines: Line[];
  rates: Rates;
  taxPct: number;
  taxAuto: boolean;
  taxState: string;
  /** What the current job address suggests, or null when it says nothing. */
  estimate: { code: string; pct: number } | null;
  /** Human name for `estimate.code` — "Texas". */
  stateName: string;
  onPatchLine: (id: string, patch: Partial<Line>) => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;
  onTaxChange: (next: number) => void;
  onUseEstimate: () => void;
}) {
  /** Which rows have their cost breakdown open. Ids, not indices — a delete
   *  must not slide the disclosure onto the next row. */
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());

  const toggleRow = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The estimate is only worth offering when it differs from what is in the
  // box, or when the box has stopped following it.
  const offerEstimate =
    estimate !== null && (!taxAuto || taxState !== estimate.code || taxPct !== estimate.pct);

  return (
    <div className={styles.stack}>
      <div className={styles.lineTable}>
        <div className={styles.colHead} aria-hidden="true">
          <span />
          <span>Line item</span>
          <span className={styles.tr}>Qty</span>
          <span>Unit</span>
          <span className={styles.tr}>Unit price</span>
          <span className={styles.tr}>Line total</span>
          <span />
        </div>

        {lines.map((line, index) => {
          const named = isNamed(line);
          const open = openRows.has(line.id);
          const cost = unitCost(line);
          const sell = sellUnit(line, rates);
          const share = materialShare(line);

          return (
            <div className={cx(styles.lineWrap, !named && styles.isUnnamed)} key={line.id}>
              <div className={styles.line}>
                <IconBtn
                  icon="chev"
                  label={open ? `Hide the cost breakdown for line ${index + 1}` : `Show the cost breakdown for line ${index + 1}`}
                  onClick={() => toggleRow(line.id)}
                  open={open}
                  expanded={open}
                />

                <div className={styles.lineNameCell}>
                  <input
                    type="text"
                    className={cx(styles.lineIn, styles.lineName)}
                    value={line.name}
                    placeholder="Line item name"
                    aria-label={`Name of line ${index + 1}`}
                    onChange={(e) => onPatchLine(line.id, { name: e.target.value })}
                  />
                  {!named && <span className={styles.needsName}>Needs a name · not counted</span>}

                  {/* THE PAGE'S OWN LAW, ONE LEVEL DOWN. The column stands its
                      cards down to a readable summary rather than collapsing
                      them, so a closed ROW may not simply swallow its detail
                      either: the split and the description stay printed here,
                      in the annotation register, and the disclosure below opens
                      the CONTROLS. Closed only — once the fields are open this
                      line would be saying the same thing twice. */}
                  {!open && (cost > 0 || line.description) && (
                    <span className={styles.lineSummary}>
                      {cost > 0 &&
                        `Mat ${money(line.materialCost)} · Lab ${money(line.laborCost)} per unit`}
                      {cost > 0 && line.description ? " — " : ""}
                      {line.description}
                    </span>
                  )}
                </div>

                <NumIn
                  value={line.quantity}
                  onChange={(v) => onPatchLine(line.id, { quantity: v })}
                  ariaLabel={`Quantity for line ${index + 1}`}
                  className={styles.lineIn}
                />

                <SelectIn<Unit>
                  value={line.unit}
                  onChange={(v) => onPatchLine(line.id, { unit: v })}
                  options={UNITS}
                  ariaLabel={`Measurement unit for line ${index + 1}`}
                  className={styles.lineSel}
                />

                <span className={styles.lineMoneyIn}>
                  <span aria-hidden="true">$</span>
                  <NumIn
                    value={cost}
                    onChange={(v) => onPatchLine(line.id, applyUnitPrice(line, v))}
                    ariaLabel={`Unit price for line ${index + 1}`}
                    className={styles.lineIn}
                  />
                </span>

                <span className={styles.lineTotal}>
                  {named ? money(lineSell(line, rates)) : "—"}
                  {named && sell !== cost && (
                    <span className={styles.lineUnit}>{money(sell)} / ea sell</span>
                  )}
                </span>

                <IconBtn
                  icon="trash"
                  label={`Remove line ${index + 1}`}
                  onClick={() => onRemoveLine(line.id)}
                  danger
                />
              </div>

              {open && (
                <div className={styles.detail}>
                  {/* Ids are derived from the LINE ID, not from the row index:
                      deleting a row above would otherwise re-point every label
                      below it at a different control. */}
                  <Field
                    label="Description"
                    optional
                    htmlFor={`mc-ld-${line.id}`}
                    hint="Appears under the name on the proposal."
                  >
                    <TextIn
                      id={`mc-ld-${line.id}`}
                      value={line.description}
                      onChange={(v) => onPatchLine(line.id, { description: v })}
                      placeholder="Optional — appears under the name on the proposal"
                      ariaLabel={`Description for line ${index + 1}`}
                    />
                  </Field>

                  <div>
                    <div className={styles.detailLab}>Cost breakdown · per unit</div>
                    <div className={styles.detailGrid}>
                      <Field label="Material $/unit" htmlFor={`mc-lm-${line.id}`}>
                        <MoneyIn
                          id={`mc-lm-${line.id}`}
                          value={line.materialCost}
                          onChange={(v) => onPatchLine(line.id, { materialCost: v })}
                          ariaLabel={`Material cost per unit for line ${index + 1}`}
                        />
                      </Field>
                      <Field label="Labor $/unit" htmlFor={`mc-ll-${line.id}`}>
                        <MoneyIn
                          id={`mc-ll-${line.id}`}
                          value={line.laborCost}
                          onChange={(v) => onPatchLine(line.id, { laborCost: v })}
                          ariaLabel={`Labor cost per unit for line ${index + 1}`}
                        />
                      </Field>
                      <div className={styles.perUnit}>
                        <span className={styles.perUnitLab}>Per unit</span>
                        <span className={styles.perUnitVal}>{money(cost)}</span>
                      </div>
                    </div>

                    {/* The ratio moves the split WITHOUT moving the per-unit
                        cost — but the two halves carry different markups, so
                        the sell price and the running total do move. That is
                        the point: the consequence is visible in the strip
                        while the handle is still under the finger. */}
                    <div className={styles.ratio}>
                      <label className={styles.ratioLab} htmlFor={`mc-ratio-${line.id}`}>
                        Material / labor ratio
                      </label>
                      <input
                        id={`mc-ratio-${line.id}`}
                        type="range"
                        className={styles.rng}
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(share)}
                        disabled={cost <= 0}
                        onChange={(e) =>
                          onPatchLine(line.id, applyMaterialShare(line, Number(e.target.value)))
                        }
                      />
                      <span className={styles.ratioRead}>
                        {cost > 0
                          ? `Material ${Math.round(share)}% · Labor ${100 - Math.round(share)}%`
                          : "No cost on this line yet"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {lines.length === 0 && (
          <div className={styles.linePad}>
            <Empty kicker="No lines yet">
              Add the first line of work. A line needs a name before it counts
              toward the total or reaches the client&rsquo;s copy.
            </Empty>
          </div>
        )}
      </div>

      <AddBtn onClick={onAddLine}>Add line</AddBtn>

      {/* ── TAX ─────────────────────────────────────────────── */}
      <div className={styles.taxRow}>
        <Field
          label="Tax rate"
          htmlFor="mc-tax"
          hint="Type 7.5 for 7.5%."
        >
          <PctIn id="mc-tax" value={taxPct} onChange={onTaxChange} max={25} step="0.01" />
        </Field>

        <div className={styles.taxNote}>
          {/* Three states, not two. "Following the address" and "typed by hand"
              are the obvious pair; the third — still following, but the address
              no longer names a state we know — has to say so, or the rate looks
              authoritative when nothing is backing it. */}
          {!taxAuto ? (
            <Ann>Entered by hand · a change of address will not overwrite it.</Ann>
          ) : taxState ? (
            <Ann>{`Estimated from ${stateName} · edit it any time and it stops following the address.`}</Ann>
          ) : (
            <Ann>No state recognised in the job address · this is the last rate estimated.</Ann>
          )}
          {offerEstimate && estimate && (
            <LinkBtn icon="pin" onClick={onUseEstimate}>
              {`Use the ${stateName} estimate · ${pct(estimate.pct)}`}
            </LinkBtn>
          )}
        </div>
      </div>
    </div>
  );
}
