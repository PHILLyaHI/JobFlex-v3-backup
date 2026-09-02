"use client";

// LINE ITEMS — THE HANDHELD BUILD.
//
// Card 03 of the manual proposal builder, drawn for a thumb. It implements the
// same `LineItemsProps` contract as `LinesV2`, so the builder swaps one for the
// other on a media query and nothing else in the page changes.
//
// WHY A SECOND COMPONENT AND NOT A BREAKPOINT ON THE FIRST.
// `LinesV2` is a seven-column priced table on one grid: description · qty ·
// unit · $/unit · material · labor · total · ×. That grid is ~860px wide and it
// is not a layout that survives being squeezed — at 390px the card handed the
// user a sideways scroller with DESCRIPTION / QTY / UNIT visible and the four
// money columns, the split slider and the remove control all off the right
// edge. A phone cannot pan and type at the same time, so the priced row was
// effectively unreachable on the surface where most of this app is used.
//
// THE HANDHELD ANSWER: no table at all. One line is one framed block, read top
// to bottom —
//
//   · a head carrying the row's index, its total, and the remove control;
//   · the description, on its own full-measure field;
//   · quantity · unit · $/unit, three cells across, which is the widest a row
//     of controls goes at this width and still clears 44px;
//   · the material / labor split, behind the row's own disclosure.
//
// THE SPLIT, AND WHY IT IS NOT A SLIDER HERE. `materialCost` + `laborCost` ARE
// the unit price; the desk build moves the RATIO with a drawn rail because it
// has the width to put one under every row. At 390px a rail is a 300px target
// for a 1% value and the two halves have to be legible beside it anyway — so
// the handheld build edits the two halves DIRECTLY, which is the same control
// with the indirection removed. The $/unit field above still rescales both
// halves around the current ratio (`applyUnitPrice`), so the primary edit
// behaves exactly as it does on the desk.
//
// NOT A FIXTURE: every value here is the caller's draft state. This component
// holds no state of its own beyond the per-field typing buffers.

import { useId, useMemo, useState } from "react";
import type { LineItemsProps } from "../lines-lab/lines-contract";
import type { Line, Unit } from "../manual-focus/manual-focus-types";
import {
  UNITS,
  applyUnitChange,
  applyUnitPrice,
  isFixedUnit,
  isNamed,
  money,
  round2,
  unitCost,
} from "../manual-focus/manual-focus-math";
import s from "./lines-mobile.module.css";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** A half-typed field reads as NaN; treat it as zero rather than poisoning the
 *  card's foot while the user is mid-keystroke. */
function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** The row's own two figures. `total` is quantity x the ROUNDED unit price —
 *  the house rule that makes a printed sheet multiply out in front of a
 *  homeowner — and `material` is its own product, so `labor` can be taken as
 *  the remainder and the two halves always add back to the total exactly. */
function figures(line: Line): { material: number; labor: number; total: number } {
  const q = num(line.quantity);
  const total = round2(q * unitCost(line));
  const material = round2(q * num(line.materialCost));
  return { material, labor: round2(total - material), total };
}

/**
 * A numeric entry with a local string buffer.
 *
 * The buffer is the whole reason this is a component: committing
 * `Number(e.target.value)` straight to state re-renders "0." as "0", which
 * makes it literally impossible to type "0.62". The buffer lets a controlled
 * input behave like an uncontrolled one for the length of a keystroke run and
 * is dropped on blur, so the stored value wins again the moment focus leaves.
 */
function NumIn({
  id,
  value,
  onCommit,
  ariaLabel,
  max,
  money: asMoney,
  disabled,
}: {
  id?: string;
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  max?: number;
  /** Rest at "3120.00" while still accepting "3120." mid-type, and rest EMPTY
   *  at zero so the placeholder dash stands instead of four characters saying
   *  "nothing here". */
  money?: boolean;
  disabled?: boolean;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const rest = asMoney ? (num(value) > 0 ? num(value).toFixed(2) : "") : String(value);
  /* A CEILING ON EVERY FIELD, because the page has to draw whatever is typed.
     A unit price of 2,222,222,222,222,222,222 is past the precision of a
     double — it was stored as …672,000, rounded, and then multiplied out
     across every total on the sheet, a 30-character figure that ran through
     the card wall and the sticky bar with it. A billion per unit and a
     million units are the most any line on a contractor's proposal can mean;
     above that the number is a typo, and the field holds it at the cap. */
  const cap = max ?? (asMoney ? 999_999_999.99 : 999_999);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={asMoney ? "—" : undefined}
      className={s.in}
      value={buf ?? rest}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        setBuf(raw);
        if (raw.trim() === "") {
          onCommit(0);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onCommit(Math.min(n, cap));
      }}
      onBlur={() => setBuf(null)}
    />
  );
}

/* ============================================================
   ONE LINE
   ============================================================ */

function LineBlock({
  line,
  index,
  open,
  onToggle,
  onPatch,
  onRemove,
}: {
  line: Line;
  index: number;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const fig = figures(line);
  const named = isNamed(line);
  const fixed = isFixedUnit(line.unit);
  const price = unitCost(line);
  const detailId = useId();

  return (
    <div className={cx(s.line, !named && s.lineOff)}>
      <div className={s.lineHead}>
        <span className={s.idx}>{String(index + 1).padStart(2, "0")}</span>
        {/* The row's answer, printed rather than typed — which is why it wears
            no field rule. Muted until the line has a name, because an unnamed
            line is priced but excluded from every total and never printed. */}
        <span className={cx(s.lineTotal, !named && s.lineTotalOff)}>{money(fig.total)}</span>
        <button
          type="button"
          className={s.kill}
          aria-label={`Remove line ${index + 1}`}
          onClick={onRemove}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <input
        type="text"
        className={cx(s.in, s.name)}
        value={line.name}
        placeholder="Describe the work"
        aria-label={`Line ${index + 1} description`}
        onChange={(e) => onPatch({ name: e.target.value })}
      />

      <div className={s.trio}>
        <label className={s.cell}>
          <span className={s.cellLbl}>Qty</span>
          {/* FIXED is a lump sum: "how many?" has no answer, so the field is
              pinned at 1 and visibly inert rather than silently ignored. */}
          <NumIn
            value={line.quantity}
            onCommit={(n) => onPatch({ quantity: n })}
            ariaLabel={`Line ${index + 1} quantity`}
            disabled={fixed}
          />
        </label>
        <label className={s.cell}>
          <span className={s.cellLbl}>Unit</span>
          {/* Wrapped so the caret can be DRAWN — two strokes meeting at a
              point, at the ink line weight — rather than left to the platform
              glyph, which is the one piece of OS chrome this system cannot
              re-skin. Same device as the shell's `.bp-sel`. */}
          <span className={s.selWrap}>
            <select
              className={cx(s.in, s.sel)}
              value={line.unit}
              aria-label={`Line ${index + 1} unit`}
              // Picking a unit is not only a label change — FIXED pins the
              // quantity and HOUR seeds a labor-weighted split. One helper, so
              // every line-item design answers it identically.
              onChange={(e) => onPatch(applyUnitChange(line, e.target.value as Unit))}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className={s.cell}>
          <span className={s.cellLbl}>$ / unit</span>
          {/* Rescales BOTH halves around the current ratio, so changing the
              price never changes the mix. */}
          <NumIn
            value={price}
            onCommit={(n) => onPatch(applyUnitPrice(line, n))}
            ariaLabel={`Line ${index + 1} unit price`}
            money
          />
        </label>
      </div>

      <button
        type="button"
        className={s.disc}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className={s.discName}>Material / labor</span>
        <span className={s.discVal}>
          {money(fig.material)} <span className={s.discSep}>·</span> {money(fig.labor)}
        </span>
        <span className={cx(s.chev, open && s.chevOn)} aria-hidden="true" />
      </button>

      {/* ALWAYS MOUNTED, so it can SLIDE. Mounting the two fields on open
          snapped them in under a chevron that was still mid-turn, which read
          as the row lagging behind the tap. A grid row animating 0fr → 1fr
          is the one height transition CSS can run without knowing the
          height; `inert` keeps the closed fields out of the tab order and
          off the accessibility tree while they are folded away. */}
      <div
        className={cx(s.splitWrap, open && s.splitOpen)}
        id={detailId}
        inert={!open}
      >
        <div className={s.splitInner}>
          <div className={s.split}>
            <label className={s.cell}>
              <span className={s.cellLbl}>$ material / unit</span>
              <NumIn
                value={line.materialCost}
                onCommit={(n) => onPatch({ materialCost: n })}
                ariaLabel={`Line ${index + 1} material cost per unit`}
                money
              />
            </label>
            <label className={s.cell}>
              <span className={s.cellLbl}>$ labor / unit</span>
              <NumIn
                value={line.laborCost}
                onCommit={(n) => onPatch({ laborCost: n })}
                ariaLabel={`Line ${index + 1} labor cost per unit`}
                money
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   THE BLOCK
   ============================================================ */

/** The same one optional prop `LinesV2` carries: in the BUILDER the tax rate
 *  lives in card 04, in the chain between the subtotal and the grand total, so
 *  printing it here as well would be the same control in two cards. */
type Props = LineItemsProps & { hideTax?: boolean };

export function LinesMobile({
  lines,
  openIds,
  onToggle,
  onPatch,
  onAdd,
  onRemove,
  namedCount,
  unnamedCount,
  taxPct,
  taxAuto,
  taxState,
  onTaxPct,
  hideTax = false,
}: Props) {
  const taxId = useId();

  /** The three sums, over NAMED lines only — an untitled row is not work yet
   *  and contributes to nothing. Because every row's labor figure is a
   *  remainder, material + labor = total in the foot exactly as in each row. */
  const sums = useMemo(() => {
    let material = 0;
    let labor = 0;
    let total = 0;
    for (const l of lines) {
      if (!isNamed(l)) continue;
      const f = figures(l);
      material += f.material;
      labor += f.labor;
      total += f.total;
    }
    return { material: round2(material), labor: round2(labor), total: round2(total) };
  }, [lines]);

  return (
    <div className={s.block}>
      {lines.map((l, i) => (
        <LineBlock
          key={l.id}
          line={l}
          index={i}
          open={openIds.includes(l.id)}
          onToggle={() => onToggle(l.id)}
          onPatch={(patch) => onPatch(l.id, patch)}
          onRemove={() => onRemove(l.id)}
        />
      ))}

      <button type="button" className={s.add} onClick={onAdd}>
        <span className={s.addMark} aria-hidden="true">
          +
        </span>
        Add a line
      </button>

      {/* The foot. Two quiet halves on one row, then the answer on its own —
          the same figures the desk build closes its three money columns with,
          stacked because there are no columns here to close. */}
      <div className={s.foot}>
        <div className={s.footSplit}>
          <span className={s.footPart}>
            <span className={s.footPartName}>Material</span>
            <span className={s.footPartAmt}>{money(sums.material)}</span>
          </span>
          <span className={s.footPart}>
            <span className={s.footPartName}>Labor</span>
            <span className={s.footPartAmt}>{money(sums.labor)}</span>
          </span>
        </div>
        <div className={s.footTotal}>
          <span className={s.footTotalName}>Subtotal</span>
          {/* Steps down a size once the figure passes the width a phone has
              for it — "$1,234,567.89" is 13 characters and the last that fits
              at 22px beside the label; past that the size drops rather than
              the digits leaving the card. */}
          <span className={cx(s.footTotalAmt, money(sums.total).length > 13 && s.footTotalLong)}>
            {money(sums.total)}
          </span>
        </div>
        <span className={s.footNote}>
          {namedCount} counted
          {unnamedCount > 0 ? ` · ${unnamedCount} unnamed, excluded` : ""}
        </span>
      </div>

      {hideTax ? null : (
        <div className={s.tax}>
          <label className={s.taxLabel} htmlFor={taxId}>
            Tax rate
          </label>
          <span className={s.taxWrap}>
            <NumIn
              id={taxId}
              value={taxPct}
              onCommit={onTaxPct}
              max={100}
              ariaLabel="Tax rate, percent"
            />
            <span className={s.taxSuffix} aria-hidden="true">
              %
            </span>
          </span>
          <span className={s.taxHint}>
            {taxAuto && taxState ? `Estimated from ${taxState}` : "Set by hand"}
          </span>
        </div>
      )}
    </div>
  );
}
