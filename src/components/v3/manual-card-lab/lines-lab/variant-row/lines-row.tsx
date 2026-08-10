"use client";

// LINE ITEMS — VARIANT A, "ONE ROW".
//
// Card 03 of the manual proposal builder, rebuilt on one thesis: a contractor
// scanning twelve priced lines wants twelve identical scan lines, not
// twenty-four. Name, quantity, unit, unit price, the material/labor mix and the
// line total all sit on ONE row. A single header names the columns; no row
// carries a per-field label, and nothing priced is behind a disclosure.
//
// The block this replaces splits every row in two — name above, four figures
// below. That halves nothing: it doubles the vertical travel of the eye AND
// puts the same field at two different x positions depending on which sub-row
// it landed in. The trade it bought was width for the name, and the trade is no
// longer necessary now the card is full-bleed: at a 1250px measure the name
// column here is 612px, which is wider than the whole 656px measure the
// two-sub-row layout was designed against. See the arithmetic block in
// lines-row.module.css — the exemplar "Architectural shingle · 30 yr, Weathered
// Slate" clears the FLOOR of the design range with seven characters to spare.
//
// THREE THINGS THE ONE-ROW BET HAS TO PAY FOR, AND HOW
//
// 1. THE RATIO, WITH NO ROOM FOR A LABELLED SLIDER. It is a divided plate:
//    128px, a figure pinned at each end, a hard 2px ink seam between them and a
//    neutral --paper-deep ground behind material's share. Two labelled ends is
//    a ratio; one labelled end would be a progress bar. Pinning the figures
//    rather than letting the fill carry them is what keeps twelve rows of
//    digits in two straight columns, and what keeps "5%" legible at 95/5. It is
//    a real slider to the accessibility tree and to the hand — drag it, or
//    arrow it in 5% steps. Everything goes through `applyMaterialShare`, never
//    through materialCost/laborCost directly, so a drag cannot drift the price.
//
// 2. THE DESCRIPTION, WITH NOWHERE TO PUT IT. It does not get a column — a
//    column would cost every row width it cannot spare, for a field most rows
//    leave empty. It gets a CONDITIONAL second line inside the name cell,
//    shown when the row has prose or when the note button is engaged. That is
//    not "the layout I am replacing": the second sub-row there was
//    unconditional and carried the ARITHMETIC. Here vertical space is spent
//    only on the rows that actually carry something.
//
// 3. THE UNNAMED WARNING. Same device, same cell, and the same argument: an
//    exception earns a line, a rule does not. An unnamed row is taller and
//    amber, which is exactly where the extra attention belongs.
//
// The contract's `openIds` / `onToggle` drive (2) — the one piece of per-row
// disclosure this variant keeps, and it discloses an EMPTY optional field,
// never a figure. Everything priced is on the face of the row at all times.

import { useId, useState } from "react";
import type { Line, LineItemsProps, Unit } from "../lines-contract";
import { splitLabel } from "../lines-contract";
import {
  UNITS,
  applyMaterialShare,
  applyUnitPrice,
  isNamed,
  materialShare,
  money,
  round2,
  unitCost,
} from "../../manual-focus/manual-focus-math";
import { stateDisplayName } from "../../manual-focus/manual-focus-data";
import s from "./lines-row.module.css";

/** Local class joiner. Deliberately NOT `@/lib/cn`: that runs twMerge, which
 *  has opinions about Tailwind utilities and no business near a hashed
 *  CSS-module name. */
function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** One symbol from the shell's sprite. `.ic` is the shell's global icon class —
 *  24x24 grid, stroke 2, currentColor. Size overrides live in the module,
 *  written with enough classes to beat `.bp :global(svg.ic)` on count. */
function Ic({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* ============================================================
   NUMERIC ENTRY
   ============================================================ */

/**
 * The local buffer is load-bearing. Committing `Number(e.target.value)`
 * straight to state re-renders "0." as "0" and makes it literally impossible to
 * type "0.62"; the buffer lets a controlled input behave like an uncontrolled
 * one for the duration of a keystroke run, and is dropped on blur so the
 * formatter wins again.
 */
function NumIn({
  id,
  value,
  onChange,
  prefix,
  suffix,
  ariaLabel,
  max,
  className,
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  ariaLabel: string;
  max?: number;
  className?: string;
}) {
  const [buf, setBuf] = useState<string | null>(null);

  return (
    <span
      className={cx(s.numWrap, prefix && s.hasPre, suffix && s.hasSuf, className)}
    >
      {prefix ? <span className={cx(s.affix, s.affixPre)}>{prefix}</span> : null}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={s.input}
        value={buf ?? String(value)}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setBuf(raw);
          if (raw.trim() === "") {
            onChange(0);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) onChange(max != null ? Math.min(n, max) : n);
        }}
        onBlur={() => setBuf(null)}
      />
      {suffix ? <span className={cx(s.affix, s.affixSuf)}>{suffix}</span> : null}
    </span>
  );
}

/* ============================================================
   THE MATERIAL / LABOR PLATE
   ============================================================ */

/** 5% steps. A contractor does not need 63 against 62, and a snap makes a drag
 *  feel decided rather than approximate. */
function snap5(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)) / 5) * 5;
}

function RatioPlate({
  line,
  onPatch,
}: {
  line: Line;
  onPatch: (patch: Partial<Line>) => void;
}) {
  // A line with no price has no ratio to move: `applyMaterialShare` would split
  // zero into two zeros and the seam would spring straight back. Say so quietly
  // instead of lying with a control that moves and undoes itself.
  const inert = unitCost(line) <= 0;

  // ONE rounded integer drives the fill, the seam and both figures, so the two
  // printed halves always sum to 100 — two independently rounded halves show
  // "70% / 31%" often enough to be noticed.
  const mat = Math.round(materialShare(line));

  const set = (pct: number) => {
    if (inert) return;
    onPatch(applyMaterialShare(line, snap5(pct)));
  };

  const fromX = (el: HTMLElement, clientX: number): number => {
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return mat;
    return ((clientX - box.left) / box.width) * 100;
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Material share of the unit price"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={mat}
      aria-valuetext={splitLabel(mat)}
      aria-disabled={inert || undefined}
      title={splitLabel(mat)}
      className={cx(s.ratio, inert && s.ratioInert)}
      onPointerDown={(e) => {
        if (inert) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(fromX(e.currentTarget, e.clientX));
      }}
      onPointerMove={(e) => {
        if (inert || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        set(fromX(e.currentTarget, e.clientX));
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onKeyDown={(e) => {
        let next: number | null = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = snap5(mat) - 5;
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = snap5(mat) + 5;
        else if (e.key === "PageDown") next = snap5(mat) - 25;
        else if (e.key === "PageUp") next = snap5(mat) + 25;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = 100;
        if (next === null) return;
        e.preventDefault();
        set(next);
      }}
    >
      <span className={s.ratioFill} style={{ width: `${mat}%` }} aria-hidden="true" />
      <span className={s.ratioSeam} style={{ left: `${mat}%` }} aria-hidden="true" />
      <span className={s.ratioNum}>{mat}%</span>
      <span className={s.ratioNum}>{100 - mat}%</span>
    </div>
  );
}

/* ============================================================
   THE ROW
   ============================================================ */

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

  const hasNote = line.description.trim().length > 0;
  const showNote = open || hasNote;

  return (
    <div className={s.row}>
      <div className={s.nameCell}>
        <input
          type="text"
          className={s.input}
          value={line.name}
          placeholder="Describe the work"
          aria-label="Line name"
          onChange={(e) => onPatch({ name: e.target.value })}
        />

        {/* The 28px track is reserved either way, so the name input never
            changes width under the caret. Once prose exists the button is
            withdrawn rather than left as a control that would either hide
            content or do nothing at all. */}
        {hasNote ? (
          <span aria-hidden="true" />
        ) : (
          <button
            type="button"
            className={cx(s.noteBtn, showNote && s.noteBtnOn)}
            aria-pressed={showNote}
            aria-label={showNote ? "Hide the note" : "Add a note"}
            onClick={onToggle}
          >
            <Ic name="pen" />
          </button>
        )}

        {!named ? (
          <span className={cx(s.nameSub, s.warn)}>
            Unnamed — not counted, not printed.
          </span>
        ) : null}

        {showNote ? (
          <input
            type="text"
            className={cx(s.nameSub, s.note)}
            value={line.description}
            placeholder="Prints under the name on the client copy"
            aria-label="Line description"
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        ) : null}
      </div>

      <NumIn
        value={line.quantity}
        onChange={(n) => onPatch({ quantity: n })}
        ariaLabel="Quantity"
      />

      {/* The shared `.bp-sel` / `.bp-sel-in` control from blueprint-global.css.
          There is exactly one styled select in this codebase and the wrapper
          owns the caret, because a <select> cannot carry a pseudo-element. */}
      <span className={cx("bp-sel", s.sel)}>
        <select
          className="bp-sel-in"
          value={line.unit}
          aria-label="Unit"
          onChange={(e) => onPatch({ unit: e.target.value as Unit })}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </span>

      <NumIn
        value={cost}
        prefix="$"
        onChange={(n) => onPatch(applyUnitPrice(line, n))}
        ariaLabel="Unit price"
      />

      <RatioPlate line={line} onPatch={onPatch} />

      <span className={cx(s.total, !named && s.totalMuted)}>{money(total)}</span>

      <button type="button" className={s.del} aria-label="Remove line" onClick={onRemove}>
        <Ic name="trash" />
      </button>
    </div>
  );
}

/* ============================================================
   THE BLOCK
   ============================================================ */

export function LinesRow(props: LineItemsProps) {
  const {
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
  } = props;

  // Three variants render side by side from one piece of state on the
  // comparison page, so a hand-written id would collide with a sibling's.
  const taxId = useId();

  return (
    <div className={s.block}>
      <div className={s.table}>
        {/* Short nouns, once, instead of a label on every field in every row.
            MAT and LABOR sit at the two ends of the ratio column, exactly over
            the two figures beneath them — which is what lets the plate carry no
            label of its own. */}
        <div className={s.head}>
          <span className={s.colHead}>Work</span>
          <span className={cx(s.colHead, s.colHeadEnd)}>Qty</span>
          <span className={s.colHead}>Unit</span>
          <span className={cx(s.colHead, s.colHeadEnd)}>Unit price</span>
          <span className={cx(s.colHead, s.colHeadSplit)}>
            <span>Mat</span>
            <span>Labor</span>
          </span>
          <span className={cx(s.colHead, s.colHeadEnd)}>Line total</span>
          <span />
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

        {/* Same tracks as the rows, so the sum sits IN the column it sums
            rather than merely at the right-hand end of the block. */}
        <div className={s.foot}>
          <span className={s.footNote}>
            {namedCount} counted
            {unnamedCount > 0 ? ` · ${unnamedCount} unnamed, excluded` : ""}
          </span>
          <span className={s.footValue}>{money(baseTotal)}</span>
          <span />
        </div>
      </div>

      <div className={s.tail}>
        <button type="button" className={s.add} onClick={onAdd}>
          <Ic name="plus" />
          Add a line
        </button>

        <span className={s.tax}>
          <label className={s.taxLabel} htmlFor={taxId}>
            Tax rate
          </label>
          <NumIn
            id={taxId}
            value={taxPct}
            suffix="%"
            max={100}
            onChange={onTaxPct}
            ariaLabel="Tax rate"
            className={s.taxField}
          />
          <span className={s.taxHint}>
            {taxAuto && taxState ? `Estimated from ${stateDisplayName(taxState)}` : "Set by hand"}
          </span>
        </span>
      </div>
    </div>
  );
}
