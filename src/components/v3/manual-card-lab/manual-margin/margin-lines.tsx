"use client";

// PRICE FIRST — CARD 02, line items. (route: /dashboard/manual-margin)
//
// On this page a line item is not "the work you are quoting", it is "the
// biggest single input to the number" — 80% of the contract total on the
// seeded draft — so the card head prints that share and every ROW prints its
// own. A contractor scanning this card is asking one question: which of these
// is worth arguing about? The per-row percentage answers it without any
// arithmetic.
//
// Three row grammars, and no casual fourth:
//   · column head — a beige mono annotation strip
//   · item row    — paper, hairline-divided, readable in one scan line
//   · run total   — a beige strip with a dashed leader
//
// THE UNIT PRICE IS DERIVED, AND EDITABLE ANYWAY.
// The `$` figure on a row is what one unit sells for once the four markup
// controls have been applied — so there is one grand total and every control
// visibly moves it. Typing over it does not create a second source of truth:
// it BACK-SOLVES the material/labor split until the row sells for what was
// typed, keeping the mix ratio the work actually has. That is the same "solve"
// idea the price card offers, at the scale of one line.
//
// Fixture-only: no store, no server action, no network.

import type { Line, MarginDraft, Totals, Unit } from "./manual-margin-types";
import { UNITS, mixRatio, money, safe, sellUnitPrice } from "./manual-margin-math";
import { Empty, Ic, NumInput, cx } from "./margin-card";
import styles from "./manual-margin.module.css";

/** One row plus its disclosure. Module scope — see margin-card.tsx for why. */
function LineRow({
  line,
  draft,
  index,
  sell,
  share,
  open,
  onToggle,
  onPatch,
  onUnitPrice,
  onRemove,
}: {
  line: Line;
  draft: MarginDraft;
  index: number;
  /** The line's contribution to the contract total, in dollars. */
  sell: number;
  /** The same, as a percentage. */
  share: number;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Line>) => void;
  onUnitPrice: (price: number) => void;
  onRemove: () => void;
}) {
  const blank = line.name.trim().length === 0;
  const material = safe(line.materialCost);
  const labor = safe(line.laborCost);
  const mix = material + labor;
  const matPct = mix > 0 ? (material / mix) * 100 : 0;

  return (
    <div className={cx(styles.line, blank && styles.isBlank)}>
      <button
        type="button"
        className={cx(styles.iconBtn, open && styles.isOpen)}
        onClick={onToggle}
        aria-expanded={open}
      >
        <Ic id="i-chev" />
        <span className={styles.srOnly}>
          {open ? "Hide" : "Show"} the cost breakdown for line {index + 1}
        </span>
      </button>

      <input
        type="text"
        className={cx(styles.lineIn, styles.lineName)}
        value={line.name}
        placeholder="Name this line — it prints on the proposal"
        aria-label={`Line ${index + 1} name`}
        onChange={(e) => onPatch({ name: e.target.value })}
      />

      <span className={styles.lineQty}>
        <NumInput
          className={styles.lineIn}
          value={line.quantity}
          min={0}
          step={1}
          ariaLabel={`Line ${index + 1} quantity`}
          onChange={(n) => onPatch({ quantity: n })}
        />
      </span>

      <span className={styles.lineUnit}>
        <select
          className={styles.lineSel}
          value={line.unit}
          aria-label={`Line ${index + 1} measurement unit`}
          onChange={(e) => onPatch({ unit: e.target.value as Unit })}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </span>

      <span className={cx(styles.linePrice, styles.moneyIn)}>
        <span aria-hidden="true">$</span>
        <NumInput
          className={styles.lineIn}
          value={sellUnitPrice(line, draft)}
          min={0}
          step={0.01}
          ariaLabel={`Line ${index + 1} unit price — typing here re-solves the cost split`}
          onChange={onUnitPrice}
        />
      </span>

      <span className={styles.lineTotalCell}>
        <span className={styles.lineTotal}>{money(sell)}</span>
        <span className={styles.lineShare}>{share.toFixed(1)}% of total</span>
      </span>

      <button type="button" className={cx(styles.iconBtn, styles.isDanger)} onClick={onRemove}>
        <Ic id="i-trash" />
        <span className={styles.srOnly}>Remove line {index + 1}</span>
      </button>

      {open && (
        <div className={styles.detail}>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor={`mc-desc-${line.id}`}>
              Description<span className={styles.labOpt}> · optional</span>
            </label>
            <textarea
              id={`mc-desc-${line.id}`}
              className={styles.ta}
              value={line.description}
              placeholder="Appears under the name on the proposal"
              onChange={(e) => onPatch({ description: e.target.value })}
            />
          </div>

          <div>
            <p className={styles.ann}>Cost breakdown · per unit</p>
            <div className={styles.grid3}>
              <div className={styles.field}>
                <label className={styles.lab} htmlFor={`mc-mat-${line.id}`}>
                  Material $ / unit
                </label>
                <span className={styles.moneyIn}>
                  <span aria-hidden="true">$</span>
                  <NumInput
                    className={styles.in}
                    id={`mc-mat-${line.id}`}
                    value={line.materialCost}
                    min={0}
                    step={0.01}
                    onChange={(n) => onPatch({ materialCost: n })}
                  />
                </span>
              </div>
              <div className={styles.field}>
                <label className={styles.lab} htmlFor={`mc-lab-${line.id}`}>
                  Labor $ / unit
                </label>
                <span className={styles.moneyIn}>
                  <span aria-hidden="true">$</span>
                  <NumInput
                    className={styles.in}
                    id={`mc-lab-${line.id}`}
                    value={line.laborCost}
                    min={0}
                    step={0.01}
                    onChange={(n) => onPatch({ laborCost: n })}
                  />
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.lab}>Cost / unit</span>
                <p className={styles.runVal}>{money(mix)}</p>
                <p className={styles.hint}>
                  Sells for <b>{money(sellUnitPrice(line, draft))}</b> after markup. Typing over
                  that price scales these two and keeps their ratio; a row with no split yet
                  borrows the rest of the sheet&rsquo;s mix.
                </p>
              </div>
            </div>

            <div className={styles.mixWrap}>
              <span className={styles.mixBar} aria-hidden="true">
                <span className={styles.mixMat} style={{ width: `${matPct}%` }} />
                <span className={styles.mixLab2} style={{ width: `${100 - matPct}%` }} />
              </span>
              <span className={styles.mixTxt}>{mixRatio(line)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LinesBody({
  draft,
  totals,
  openRows,
  onToggleRow,
  onPatchLine,
  onUnitPrice,
  onRemoveLine,
  onAddLine,
}: {
  draft: MarginDraft;
  totals: Totals;
  openRows: Record<string, boolean>;
  onToggleRow: (id: string) => void;
  onPatchLine: (id: string, patch: Partial<Line>) => void;
  onUnitPrice: (id: string, price: number) => void;
  onRemoveLine: (id: string) => void;
  onAddLine: () => void;
}) {
  const blanks = draft.lines.filter((l) => l.name.trim().length === 0).length;

  return (
    <>
      <p className={styles.teach}>
        Everything the client is charged for starts here. The <b>$ / unit</b> column is what a unit
        sells for once markup is on it — type over it and the material / labor split behind the row
        re-solves to match.
      </p>

      {draft.lines.length === 0 ? (
        <Empty kicker="No lines yet">
          A proposal with no lines is worth $0.00, and the price card above says so. Add the first
          line and the whole page starts moving.
        </Empty>
      ) : (
        <div className={styles.lines}>
          <div className={styles.colHead} aria-hidden="true">
            <span />
            <span>Line item</span>
            <span className={styles.colRight}>Qty</span>
            <span>Unit</span>
            <span className={styles.colRight}>$ / unit</span>
            <span className={styles.colRight}>Line total</span>
            <span />
          </div>

          {draft.lines.map((line, i) => {
            const row = totals.perLine.find((p) => p.id === line.id);
            return (
              <LineRow
                key={line.id}
                line={line}
                draft={draft}
                index={i}
                sell={row?.sell ?? 0}
                share={row?.share ?? 0}
                open={Boolean(openRows[line.id])}
                onToggle={() => onToggleRow(line.id)}
                onPatch={(patch) => onPatchLine(line.id, patch)}
                onUnitPrice={(price) => onUnitPrice(line.id, price)}
                onRemove={() => onRemoveLine(line.id)}
              />
            );
          })}

          <div className={styles.runTotal}>
            <span className={styles.runLab}>
              {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"}
              {blanks > 0 ? ` · ${blanks} unnamed` : ""} · pre-tax
            </span>
            <span className={styles.runLead} aria-hidden="true" />
            <span className={styles.runVal}>{money(totals.grandTotal)}</span>
          </div>

          <div className={styles.linesFoot}>
            {blanks > 0 && (
              <Empty kicker="Unnamed line">
                One row has no name yet. It costs nothing and prints nothing — name it, or remove
                it before this goes out.
              </Empty>
            )}
            <button type="button" className={styles.addBtn} onClick={onAddLine}>
              <Ic id="i-plus" />
              Add line
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The card head's summary line — content, never the card's own name. */
export function linesSummary(draft: MarginDraft, totals: Totals): string {
  const named = draft.lines.filter((l) => l.name.trim().length > 0).length;
  const blanks = draft.lines.length - named;
  const units = new Set(draft.lines.map((l) => l.unit)).size;
  if (draft.lines.length === 0) return "no lines · $0.00";
  return [
    `${named} named line${named === 1 ? "" : "s"}`,
    blanks > 0 ? `${blanks} unnamed` : null,
    `${units} unit type${units === 1 ? "" : "s"}`,
    `${money(totals.grandTotal)} before tax`,
  ]
    .filter(Boolean)
    .join(" · ");
}
