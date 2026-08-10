"use client";

// CHAPTERS — chapter 2, "The money": brief sections 03 (line items) and
// 04 (markup & margin).
//
// Route: /dashboard/manual-sheet.
//
// COST IN, PRICE OUT. The two sub-blocks are not two views of the same numbers;
// they are the two halves of one calculation, which is the whole argument for
// putting them in one card. Block 03 is entirely COST — what the job costs you,
// per unit, per line, and the row's figure is quantity x cost/unit and nothing
// else, so every row multiplies out by hand. Block 04 is the conversion: the
// four markup controls, then the ledger that walks cost up to the grand total.
// The client-facing SELL prices never appear here at all; they are printed once,
// in chapter 5, on the document the client actually receives. That split is what
// stops the same figure being loud in three places.
//
// THE ROW IS TWO TIERS, NOT ONE LINE. Name + line total on top, then quantity /
// unit / cost-per-unit beneath at small size. Five controls on one 676px line is
// the cramp the brief bans, and the name is the only thing anyone scans a
// line-item list for — it gets the full width.
//
// The grand total is the one loud number on the page: 38px, tabular, and the
// only figure at that size anywhere. The sticky rail carries the same figure at
// 17px because it must, and the client's copy prints it at 22px because that is
// a different document — neither competes with this one.

import { useState } from "react";
import type { Draft, Line, Totals, Unit } from "../manual-focus/manual-focus-types";
import {
  applyMaterialShare,
  applyUnitPrice,
  isNamed,
  materialShare,
  money,
  newId,
  pct,
  round2,
  safe,
  UNITS,
  unitCost,
} from "../manual-focus/manual-focus-math";
import { stateDisplayName } from "../manual-focus/manual-focus-data";
import s from "./manual-sheet.module.css";
import { BlockHead, Btn, Caret, Cross, Field, NumIn, Select, TextArea, TextBtn } from "./sheet-ui";

/** What the row prints on the right. Cost, not price — see the file header. */
function lineCost(line: Line): number {
  return round2(safe(line.quantity) * unitCost(line));
}

function LineRow({
  line,
  onPatch,
  onRemove,
  canRemove,
}: {
  line: Line;
  onPatch: (p: Partial<Line>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const named = isNamed(line);
  const share = materialShare(line);

  return (
    <div className={s.line}>
      <div className={s.lineTop}>
        <button
          type="button"
          className={s.iconBtn}
          aria-expanded={open}
          aria-label={open ? "Hide line detail" : "Show line detail"}
          onClick={() => setOpen((v) => !v)}
        >
          <Caret open={open} />
        </button>

        <div className={s.lineName}>
          <input
            type="text"
            className={s.in}
            value={line.name}
            placeholder="Name this line"
            aria-label="Line name"
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </div>

        <div className={[s.lineSum, named ? null : s.lineSumOff].filter(Boolean).join(" ")}>
          {money(lineCost(line))}
        </div>

        <button
          type="button"
          className={[s.iconBtn, s.iconBtnDanger].join(" ")}
          aria-label="Remove line"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Cross />
        </button>
      </div>

      {named ? null : <p className={s.needsName}>Needs a name · not counted</p>}

      <div className={s.lineMeasure}>
        <div className={[s.measure, s.mQty].join(" ")}>
          <span className={s.measureLab}>Qty</span>
          <NumIn
            value={line.quantity}
            onChange={(v) => onPatch({ quantity: v })}
            ariaLabel="Quantity"
          />
        </div>
        <div className={[s.measure, s.mUnit].join(" ")}>
          <span className={s.measureLab}>Unit</span>
          <Select<Unit>
            value={line.unit}
            options={UNITS}
            onChange={(v) => onPatch({ unit: v })}
            ariaLabel="Unit"
          />
        </div>
        <div className={[s.measure, s.mPrice].join(" ")}>
          <span className={s.measureLab}>Cost / unit</span>
          <NumIn
            value={unitCost(line)}
            onChange={(v) => onPatch(applyUnitPrice(line, v))}
            prefix="$"
            ariaLabel="Cost per unit"
          />
        </div>
        <div className={s.measureSpacer} />
      </div>

      {open ? (
        <div className={s.lineDetail}>
          <Field label="Description">
            {(id) => (
              <TextArea
                id={id}
                value={line.description}
                onChange={(v) => onPatch({ description: v })}
                placeholder="Prints under the name on the client's copy."
              />
            )}
          </Field>

          <div className={s.row2}>
            <Field label="Material / unit">
              {(id) => (
                <NumIn
                  id={id}
                  value={line.materialCost}
                  onChange={(v) => onPatch({ materialCost: v })}
                  prefix="$"
                />
              )}
            </Field>
            <Field label="Labor / unit">
              {(id) => (
                <NumIn
                  id={id}
                  value={line.laborCost}
                  onChange={(v) => onPatch({ laborCost: v })}
                  prefix="$"
                />
              )}
            </Field>
          </div>

          <div className={s.splitBar}>
            <input
              type="range"
              className={s.range}
              min={0}
              max={100}
              step={1}
              value={Math.round(share)}
              aria-label="Material share of unit cost"
              onChange={(e) => onPatch(applyMaterialShare(line, Number(e.target.value)))}
            />
            <span className={s.splitRead}>
              {Math.round(share)}% material · {100 - Math.round(share)}% labor
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChapterMoney({
  draft,
  patch,
  totals,
  taxEstimate,
  onUseEstimate,
  onTaxChange,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  totals: Totals;
  /** The address-derived rate, or null when the address names no state we know. */
  taxEstimate: { code: string; pct: number } | null;
  onUseEstimate: () => void;
  onTaxChange: (v: number) => void;
}) {
  const setLine = (id: string, p: Partial<Line>) =>
    patch({ lines: draft.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const removeLine = (id: string) =>
    patch({ lines: draft.lines.filter((l) => l.id !== id) });

  const addLine = () =>
    patch({
      lines: [
        ...draft.lines,
        {
          id: newId("ln"),
          name: "",
          description: "",
          unit: "UNIT" as Unit,
          quantity: 1,
          materialCost: 0,
          laborCost: 0,
        },
      ],
    });

  const namedCount = draft.lines.filter(isNamed).length;

  return (
    <>
      {/* ---- 03 LINE ITEMS ---- */}
      <div className={s.block}>
        <BlockHead num="03" name="Line items" />

        <div className={s.lines}>
          {draft.lines.map((l) => (
            <LineRow
              key={l.id}
              line={l}
              onPatch={(p) => setLine(l.id, p)}
              onRemove={() => removeLine(l.id)}
              canRemove={draft.lines.length > 1}
            />
          ))}
        </div>

        <div className={s.linesFoot}>
          <span className={s.linesCount}>
            {namedCount} counted
            {totals.unnamedCount > 0 ? ` · ${totals.unnamedCount} unnamed` : ""}
          </span>
          <Btn onClick={addLine}>Add line</Btn>
        </div>

        <div className={[s.fields, s.stackTop].join(" ")}>
          <Field
            label="Tax rate"
            hint={
              draft.taxAuto && draft.taxState ? (
                `Estimated from ${stateDisplayName(draft.taxState)}.`
              ) : taxEstimate ? (
                <TextBtn onClick={onUseEstimate}>
                  Use {pct(taxEstimate.pct)} for {stateDisplayName(taxEstimate.code)}
                </TextBtn>
              ) : undefined
            }
          >
            {(id) => (
              <NumIn id={id} value={draft.taxPct} onChange={onTaxChange} suffix="%" max={30} />
            )}
          </Field>
        </div>
      </div>

      {/* ---- 04 MARKUP & MARGIN ---- */}
      <div className={s.block}>
        <BlockHead num="04" name="Markup & margin" />

        <div className={s.row2}>
          <Field label="Materials markup">
            {(id) => (
              <NumIn
                id={id}
                value={draft.materialMarkupPct}
                onChange={(v) => patch({ materialMarkupPct: v })}
                suffix="%"
                max={300}
              />
            )}
          </Field>
          <Field label="Labor markup">
            {(id) => (
              <NumIn
                id={id}
                value={draft.laborMarkupPct}
                onChange={(v) => patch({ laborMarkupPct: v })}
                suffix="%"
                max={300}
              />
            )}
          </Field>
          <Field label="Overhead">
            {(id) => (
              <NumIn
                id={id}
                value={draft.overheadPct}
                onChange={(v) => patch({ overheadPct: v })}
                suffix="%"
                max={100}
              />
            )}
          </Field>
          <Field label="Profit">
            {(id) => (
              <NumIn
                id={id}
                value={draft.profitPct}
                onChange={(v) => patch({ profitPct: v })}
                suffix="%"
                max={100}
              />
            )}
          </Field>
        </div>

        <div className={s.ledger}>
          <div className={s.ledRow}>
            <span className={s.ledLab}>Carried cost</span>
            <span className={s.ledVal}>{money(totals.baseTotal)}</span>
          </div>
          <div className={s.ledRow}>
            <span className={s.ledLab}>Materials markup {pct(draft.materialMarkupPct)}</span>
            <span className={s.ledVal}>{money(totals.materialsMarkup)}</span>
          </div>
          <div className={s.ledRow}>
            <span className={s.ledLab}>Labor markup {pct(draft.laborMarkupPct)}</span>
            <span className={s.ledVal}>{money(totals.laborMarkup)}</span>
          </div>

          <div className={s.ledRule} />

          <div className={s.ledRow}>
            <span className={s.ledLab}>Subtotal</span>
            <span className={s.ledVal}>{money(totals.subtotalCosts)}</span>
          </div>
          <div className={s.ledRow}>
            <span className={s.ledLab}>Overhead {pct(draft.overheadPct)}</span>
            <span className={s.ledVal}>{money(totals.overheadAmount)}</span>
          </div>
          <div className={s.ledRow}>
            <span className={s.ledLab}>Profit {pct(draft.profitPct)}</span>
            <span className={s.ledVal}>{money(totals.profitAmount)}</span>
          </div>

          <div className={s.ledRule} />

          <div className={s.ledRow}>
            <span className={s.ledLab}>Price before tax</span>
            <span className={s.ledVal}>{money(totals.preTax)}</span>
          </div>
          <div className={s.ledRow}>
            <span className={s.ledLab}>Tax {pct(draft.taxPct)}</span>
            <span className={s.ledVal}>{money(totals.tax)}</span>
          </div>

          <div className={s.grand}>
            <span className={s.grandLab}>Grand total</span>
            <span className={s.grandVal}>{money(totals.total)}</span>
          </div>

          <p className={s.marginRead}>Margin {pct(round2(totals.margin))} on carried cost.</p>
        </div>
      </div>
    </>
  );
}
