"use client";

// STEPS — section 03 (Line items) and the tax rate that rides with it.
//
// THE ROW IS TWO LINES, AND THAT IS THE WHOLE DESIGN DECISION.
// Name / qty / unit / unit price / total on ONE line needs about 900px before
// the name field is usable, and the column is 760px. Squeezing all five in is
// exactly the "cramped rows" failure: a 130px name box holding a 44-character
// shingle spec. So the name gets a full-width line of its own, and the three
// small numeric controls sit on a second line with the money right-aligned
// opposite them. Two lines of air per item, and every value is legible.
//
// THE EDITOR WORKS IN COST; THE SHEET WORKS IN SELL.
// `materialCost + laborCost` IS the unit price — there is no third stored
// field — so the editable figure is a COST per unit and the right-hand figure
// is what the client is actually billed, taken from `totals.printed` so this
// column and the client's copy can never disagree by a cent. The bridge
// between them is stated ONCE, in four words above the list, rather than as a
// caption under all five rows.
//
// UNNAMED LINES SAY SO IN THE MONEY SLOT. A row with a price and no name is
// excluded from every total; putting "Not counted" where its money would be
// makes the exclusion impossible to miss and costs no extra chrome.
//
// The per-row disclosure holds description and the material/labor split — the
// two things that are true of some rows and irrelevant on most. Two plain $
// fields rather than a ratio slider: the slider needs a second explanation of
// what it is preserving, and these are the numbers a contractor already knows.

import { useState } from "react";
import type { Draft, Line, Totals, Unit } from "../manual-focus/manual-focus-types";
import { estimateFromAddress, stateDisplayName } from "../manual-focus/manual-focus-data";
import {
  UNITS,
  applyUnitPrice,
  isNamed,
  money,
  newId,
  qty as fmtQty,
  round2,
} from "../manual-focus/manual-focus-math";
import {
  Block,
  Btn,
  Derived,
  Field,
  Fields,
  Glyph,
  IconBtn,
  NumberInput,
  Note,
  PATH,
  Select,
  TextArea,
  TextInput,
} from "./steps-ui";
import type { Patch } from "./steps-pickers";
import s from "./manual-steps.module.css";

const BLANK: Omit<Line, "id"> = {
  name: "",
  description: "",
  unit: "SQFT",
  quantity: 1,
  materialCost: 0,
  laborCost: 0,
};

export function LinesCard({
  draft,
  patch,
  totals,
}: {
  draft: Draft;
  patch: Patch;
  totals: Totals;
}) {
  const [open, setOpen] = useState<string[]>([]);

  function editLine(id: string, next: Partial<Line>) {
    patch({ lines: draft.lines.map((l) => (l.id === id ? { ...l, ...next } : l)) });
  }

  const marked = draft.materialMarkupPct > 0 || draft.laborMarkupPct > 0;
  const estimate = estimateFromAddress(draft.address);
  const stale = !draft.taxAuto && estimate !== null && round2(estimate.pct) !== round2(draft.taxPct);

  return (
    <>
      <Block>
        {marked ? <Note>Line totals include markup.</Note> : null}

        <div className={s.lines}>
          {draft.lines.map((line) => {
            const printed = totals.printed.find((p) => p.id === line.id);
            const named = isNamed(line);
            const unitCostNow = round2(line.materialCost + line.laborCost);
            const shown = open.includes(line.id);

            return (
              <div key={line.id} className={s.line}>
                <div className={s.lineTop}>
                  <TextInput
                    value={line.name}
                    onChange={(name) => editLine(line.id, { name })}
                    placeholder="What this line is"
                    ariaLabel="Line name"
                  />
                  <IconBtn
                    label={`Remove ${line.name.trim() || "this line"}`}
                    onClick={() => {
                      patch({ lines: draft.lines.filter((l) => l.id !== line.id) });
                      setOpen((ids) => ids.filter((i) => i !== line.id));
                    }}
                  />
                </div>

                <div className={s.lineNums}>
                  <div className={s.lineCtl}>
                    <span className={s.microLabel}>Qty</span>
                    <NumberInput
                      value={line.quantity}
                      onChange={(quantity) => editLine(line.id, { quantity })}
                      min={0}
                      step={1}
                      ariaLabel="Quantity"
                      align="right"
                    />
                  </div>

                  <div className={s.lineCtl} data-wide="1">
                    <span className={s.microLabel}>Unit</span>
                    <Select
                      value={line.unit}
                      onChange={(unit) => editLine(line.id, { unit: unit as Unit })}
                      ariaLabel="Unit of measure"
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className={s.lineCtl}>
                    <span className={s.microLabel}>Cost / unit</span>
                    <NumberInput
                      value={unitCostNow}
                      onChange={(next) => editLine(line.id, applyUnitPrice(line, next))}
                      min={0}
                      step={0.01}
                      prefix="$"
                      ariaLabel="Cost per unit"
                      align="right"
                    />
                  </div>

                  <div className={s.lineMoney}>
                    {named ? (
                      <span className={s.lineTotal}>{money(printed?.amount ?? 0)}</span>
                    ) : (
                      <span className={s.lineExcluded}>Not counted</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className={s.discl}
                  aria-expanded={shown}
                  onClick={() =>
                    setOpen((ids) => (ids.includes(line.id) ? ids.filter((i) => i !== line.id) : [...ids, line.id]))
                  }
                >
                  <Glyph d={shown ? PATH.chevronDown : PATH.chevronRight} />
                  <span>{shown ? "Hide detail" : "Detail"}</span>
                </button>

                {shown ? (
                  <div className={s.lineDetail}>
                    <Fields>
                      <Field label="Description">
                        <TextArea
                          value={line.description}
                          onChange={(description) => editLine(line.id, { description })}
                          rows={3}
                          placeholder="Prints under the name on their copy."
                        />
                      </Field>
                    </Fields>

                    <div className={s.splitRow}>
                      <div className={s.lineCtl}>
                        <span className={s.microLabel}>Material / unit</span>
                        <NumberInput
                          value={line.materialCost}
                          onChange={(materialCost) => editLine(line.id, { materialCost })}
                          min={0}
                          step={0.01}
                          prefix="$"
                          ariaLabel="Material cost per unit"
                          align="right"
                        />
                      </div>
                      <div className={s.lineCtl}>
                        <span className={s.microLabel}>Labor / unit</span>
                        <NumberInput
                          value={line.laborCost}
                          onChange={(laborCost) => editLine(line.id, { laborCost })}
                          min={0}
                          step={0.01}
                          prefix="$"
                          ariaLabel="Labor cost per unit"
                          align="right"
                        />
                      </div>
                    </div>

                    {printed ? (
                      <Derived
                        label="Printed unit price"
                        value={`${money(printed.unitPrice)} × ${fmtQty(printed.quantity)}`}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className={s.blockActions}>
          <Btn
            variant="quiet"
            onClick={() => patch({ lines: [...draft.lines, { ...BLANK, id: newId("ln") }] })}
          >
            <Glyph d={PATH.plus} />
            Add line
          </Btn>
          {totals.unnamedCount > 0 ? (
            <Note tone="warn">
              {totals.unnamedCount === 1 ? "1 unnamed line" : `${totals.unnamedCount} unnamed lines`} not counted.
            </Note>
          ) : null}
        </div>
      </Block>

      <Block title="Sales tax">
        <Fields>
          <Field
            label="Rate"
            htmlFor="st-tax"
            hint={
              draft.taxAuto && draft.taxState
                ? `Estimated from ${stateDisplayName(draft.taxState)}.`
                : "Set by hand."
            }
          >
            <NumberInput
              id="st-tax"
              value={draft.taxPct}
              onChange={(taxPct) => patch({ taxPct, taxAuto: false })}
              min={0}
              max={25}
              step={0.01}
              suffix="%"
              align="right"
            />
          </Field>
        </Fields>

        {stale && estimate ? (
          <div className={s.blockActions}>
            <Btn
              variant="quiet"
              onClick={() =>
                patch({ taxPct: estimate.pct, taxAuto: true, taxState: estimate.code })
              }
            >
              <Glyph d={PATH.undo} />
              {`Use ${stateDisplayName(estimate.code)} ${estimate.pct}%`}
            </Btn>
          </div>
        ) : null}
      </Block>
    </>
  );
}
