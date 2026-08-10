"use client";

// VARIANT B — "DROPDOWN". Card 03, the priced work.
//
// THE THESIS
// The closed row is a complete summary and nothing more. Everything a
// contractor does NOT scan for lives behind a per-row dropdown panel. The bet
// is that hiding the right 40% is what makes the other 60% readable.
//
// WHAT SURVIVED ONTO THE CLOSED ROW, AND WHY
//   #            the row's number ON THE PRINTED SHEET (see the unnamed rule)
//   Work         the name — the longest thing in every row, so it takes the 1fr
//   Qty · Unit   read as one atom: "2,400 sq ft"
//   Unit price   the figure a contractor sanity-checks a bid by
//   Line total   the scan column; printed, not a control
//   chevron      the disclosure
//
// WHAT WAS CUT INTO THE PANEL
//   · the description       — optional, and long
//   · the material/labor mix and both per-unit halves
//   · REMOVE. This is the cut with nerve in it. A trash button on every row is
//     36px of permanent chrome plus a permanent mis-click, in exchange for an
//     action taken once per line at most. Behind the panel it costs one extra
//     click and stops being a hazard, and destruction earning a two-step is a
//     feature rather than a tax.
// That is three things hidden, five kept, and — the part that actually buys the
// quiet — ONE header row of column names instead of a label on every field.
//
// THE PANEL DOES NOT SHOVE THE LIST
// Two separate promises, kept two separate ways.
//   1. GEOMETRY IS INSTANT. There is no height animation. The panel mounts at
//      its full height in one frame and only its own ink moves — 160ms of
//      opacity and 3px of travel. A 270px accordion easing open drags a third
//      of the list past the cursor and reads as the page deciding something;
//      a snap plus a fade reads as the click.
//   2. THE CLICKED ROW HOLDS POSITION. `toggle` measures the row's viewport top
//      BEFORE React is told anything, and the layout effect below puts it back
//      by scrolling the scroll parent the same distance. Inserting content
//      below a row usually leaves that row alone, so most of the time the
//      correction is zero — but closing a row near the document's end, or with
//      several rows open at once, moves it, and that is the jump this removes.
//      Deliberately NOT done: scrolling the panel into view when it opens below
//      the fold. That is a scroll the user did not ask for — the exact thing the
//      anchor exists to prevent — so the panel is allowed to open off-screen.
//
// THE RATIO CONTROL IS WHAT THE PANEL IS FOR
// It is laid out on the ROW'S OWN COLUMN GRID: the material and labor figures
// land directly under `Unit price` and `Line total`, so the panel reads as
// those two columns being decomposed in place. Nothing has to be restated and
// no figure is printed loudly twice — the two rows simply add up to the two
// figures above them.
//
// The two per-unit halves are PRINTED, not editable, and the only inputs are
// the unit price (closed row) and the mix (panel). Those two are orthogonal —
// `applyUnitPrice` holds the mix, `applyMaterialShare` holds the price — where
// two editable $ fields are coupled and each one silently moves the price.
// Nothing is lost: the pair still spans the whole 2-degree space.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

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
import { Ic, cx } from "../../manual-blueprint/bp-ui";
import { currentZoom } from "@/components/v3/blueprint-shell/list-motion";
import s from "./lines-drawer.module.css";

/** `useLayoutEffect` warns during SSR; `useEffect` is inert there, so it stands
 *  in. Same swap the shell's content hook makes, for the same reason. */
const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ============================================================
   LOCAL CONTROLS
   Written here rather than borrowed from bp-ui because this
   variant's closed row IS the estimate table, and the house rule
   for an estimate table is MONO, TABULAR, RIGHT-ALIGNED figures.
   bp-ui's fields are Inter and left-aligned — correct for a form,
   wrong for a column of money that has to stack.
   ============================================================ */

/**
 * Numeric entry with an in-well affix.
 *
 * `buf` is load-bearing: committing `Number(e.target.value)` straight to state
 * re-renders "0." as "0" and makes it impossible to type "0.62". The buffer
 * lets a controlled input behave like an uncontrolled one for the length of a
 * keystroke run, and is dropped on blur so the formatter wins again.
 */
function NumIn({
  id,
  value,
  onChange,
  prefix,
  suffix,
  ariaLabel,
  max,
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  max?: number;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const shown = buf ?? String(value);

  return (
    <span className={s.well}>
      {prefix ? <span className={s.affix}>{prefix}</span> : null}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={s.numIn}
        value={shown}
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
      {suffix ? <span className={cx(s.affix, s.affixEnd)}>{suffix}</span> : null}
    </span>
  );
}

/** The unit picker. Hand-rolled rather than borrowed: bp-ui's `Select` is sized
 *  by a rule that needs manual-blueprint's own `.page` in the ancestry, which
 *  this lab route does not provide, and the wrapper owns the caret because a
 *  `<select>` cannot carry a pseudo-element. */
function UnitSel({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <span className={s.selWell}>
      <select
        className={s.sel}
        value={value}
        aria-label="Unit"
        onChange={(e) => onChange(e.target.value as Unit)}
      >
        {UNITS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className={s.selCaret} aria-hidden="true">
        <Ic name="chev" />
      </span>
    </span>
  );
}

/* ============================================================
   THE PANEL
   ============================================================ */

function Panel({
  id,
  line,
  named,
  onPatch,
  onRemove,
}: {
  id: string;
  line: Line;
  named: boolean;
  onPatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  // Mount at opacity 0, then add the settled class on the next frame so the
  // transition has two states to run between. Written to the DOM rather than
  // through state: this is a one-way instruction to the browser's compositor,
  // not a fact the component needs to re-render over.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    const raf = requestAnimationFrame(() => el.classList.add(s.panelIn));
    return () => cancelAnimationFrame(raf);
  }, []);

  const pct = Math.round(materialShare(line));
  const mat = round2(line.materialCost);
  const lab = round2(line.laborCost);

  return (
    <div id={id} ref={panelRef} className={s.panel}>
      <div className={cx(s.grid, s.gridTop)}>
        <div className={s.descCell}>
          <label className={s.label} htmlFor={`${id}-desc`}>
            Description
          </label>
          <textarea
            id={`${id}-desc`}
            className={s.area}
            rows={2}
            value={line.description}
            placeholder="Prints under the name"
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </div>
      </div>

      <div className={s.mix}>
        <div className={s.grid}>
          <span className={cx(s.colHead, s.c2)}>Material / labor mix</span>
          <span className={cx(s.colHead, s.colHeadEnd, s.c5)}>Per unit</span>
          <span className={cx(s.colHead, s.colHeadEnd, s.c6)}>Line</span>
        </div>

        <div className={cx(s.grid, s.barRow)}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            className={s.slider}
            // The fill boundary rides a custom property so the gradient stays
            // in the stylesheet and only the number crosses into the markup.
            style={{ "--ld-mix": `${pct}%` } as CSSProperties}
            aria-label="Material share of the unit price"
            aria-valuetext={splitLabel(pct)}
            // applyMaterialShare, never a raw materialCost/laborCost write: a
            // slider writing the halves directly drifts the unit price by a
            // rounding step on every drag frame.
            onChange={(e) => onPatch(applyMaterialShare(line, Number(e.target.value)))}
          />
        </div>

        <div className={cx(s.grid, s.mixRow)}>
          <span className={s.c2}>
            <span className={s.mixName}>Material</span>
            <span className={s.mixPct}>{pct}%</span>
          </span>
          <span className={cx(s.fig, s.c5, !named && s.figOut)}>{money(mat)}</span>
          <span className={cx(s.fig, s.c6, !named && s.figOut)}>
            {money(round2(line.quantity * mat))}
          </span>
        </div>

        <div className={cx(s.grid, s.mixRow)}>
          <span className={s.c2}>
            <span className={s.mixName}>Labor</span>
            <span className={s.mixPct}>{100 - pct}%</span>
          </span>
          <span className={cx(s.fig, s.c5, !named && s.figOut)}>{money(lab)}</span>
          <span className={cx(s.fig, s.c6, !named && s.figOut)}>
            {money(round2(line.quantity * lab))}
          </span>
        </div>
      </div>

      <div className={s.grid}>
        <button type="button" className={cx(s.remove, s.c2)} onClick={onRemove}>
          <Ic name="trash" />
          Remove this line
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   THE ROW
   ============================================================ */

function LineRow({
  line,
  mark,
  open,
  onToggle,
  onPatch,
  onRemove,
  register,
}: {
  line: Line;
  /** The row's number on the printed sheet, or an en dash when it has none. */
  mark: string;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const panelId = useId();
  const chevRef = useRef<HTMLButtonElement>(null);

  const cost = unitCost(line);
  const named = isNamed(line);
  const total = round2(line.quantity * cost);
  const hasNote = line.description.trim().length > 0;

  return (
    <div
      className={cx(s.row, open && s.rowOpen)}
      ref={(el) => {
        register(line.id, el);
      }}
      onKeyDown={(e) => {
        // Escape closes the row from anywhere inside it and hands focus back to
        // the control that opened it — otherwise a keyboard user who has
        // tabbed into the panel has no way out but Shift+Tab past every field.
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          onToggle();
          chevRef.current?.focus();
        }
      }}
    >
      <div className={cx(s.grid, s.rowGrid)}>
        <span className={cx(s.idx, !named && s.idxOut)}>{mark}</span>

        <input
          type="text"
          className={s.nameIn}
          value={line.name}
          placeholder="Describe the work"
          aria-label="Line name"
          onChange={(e) => onPatch({ name: e.target.value })}
        />

        <NumIn
          value={line.quantity}
          onChange={(n) => onPatch({ quantity: n })}
          ariaLabel="Quantity"
        />

        <UnitSel value={line.unit} onChange={(u) => onPatch({ unit: u })} />

        <NumIn
          value={cost}
          prefix="$"
          onChange={(n) => onPatch(applyUnitPrice(line, n))}
          ariaLabel="Unit price"
        />

        <span className={cx(s.total, !named && s.totalOut)}>{money(total)}</span>

        <button
          ref={chevRef}
          type="button"
          className={cx(s.chev, open && s.chevOpen)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            open
              ? "Hide line detail"
              : hasNote
                ? "Show line detail, has a description"
                : "Show line detail"
          }
          onClick={onToggle}
        >
          {/* Hiding 40% of a row means saying that something is hidden. Every
              row has a mix, so only the description — the one piece of free
              text down there — earns a mark. */}
          {hasNote && !open ? <span className={s.noteDot} aria-hidden="true" /> : null}
          <Ic name="chev" />
        </button>
      </div>

      {!named ? (
        <div className={cx(s.grid, s.warnGrid)}>
          <span className={s.warn}>Unnamed — not counted, not printed.</span>
        </div>
      ) : null}

      {open ? (
        <Panel id={panelId} line={line} named={named} onPatch={onPatch} onRemove={onRemove} />
      ) : null}
    </div>
  );
}

/* ============================================================
   SCROLL ANCHORING
   ============================================================ */

/** The nearest ancestor that actually scrolls. The shell scrolls a `.main`
 *  element rather than the document, but walking for the property rather than
 *  the class keeps this correct if the block is ever rendered somewhere else. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const overflow = getComputedStyle(p).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll" || overflow === "overlay") &&
      p.scrollHeight > p.clientHeight
    ) {
      return p;
    }
    p = p.parentElement;
  }
  return null;
}

/**
 * Pair every line with its number ON THE PRINTED SHEET — which is why an
 * unnamed row genuinely has none and takes an en dash instead. The annotation
 * tells the truth about what will print, rather than wearing a badge that says
 * the same thing in words.
 *
 * Module-scope rather than a counter walked inside the render's `.map`: a
 * variable reassigned from inside a render callback is a stale-closure trap,
 * and the lint rule that says so is right.
 */
function sheetRows(lines: Line[]): { line: Line; mark: string }[] {
  let n = 0;
  return lines.map((line) => {
    if (!isNamed(line)) return { line, mark: "–" };
    n += 1;
    return { line, mark: String(n).padStart(2, "0") };
  });
}

/* ============================================================
   THE BLOCK
   ============================================================ */

export function LinesDrawer({
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
}: LineItemsProps) {
  const taxId = useId();

  /** id -> row element. A Map rather than an array: rows are addressed by id
   *  and the map survives an insert, a delete or a future reorder. */
  const rows = useRef(new Map<string, HTMLElement | null>());
  /** The measurement taken just before a toggle, consumed once and cleared. */
  const anchor = useRef<{ id: string; top: number } | null>(null);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const el = rows.current.get(id);
      // Measure BEFORE the state change. Once React has committed, the old
      // position is unrecoverable.
      if (el) anchor.current = { id, top: el.getBoundingClientRect().top };
      onToggle(id);
    },
    [onToggle],
  );

  // `openIds` is a fresh array on most parent renders, so the identity is
  // useless as a dependency; its contents are not.
  const openKey = openIds.join("|");

  useIsoLayout(() => {
    const pending = anchor.current;
    anchor.current = null;
    if (!pending) return;

    const el = rows.current.get(pending.id);
    if (!el) return;

    // getBoundingClientRect() reports ZOOMED pixels — the shell puts a CSS
    // `zoom` on .jf-blueprint — while scrollTop is written in unzoomed ones.
    const delta = (el.getBoundingClientRect().top - pending.top) / currentZoom(el);
    if (Math.abs(delta) < 0.5) return;

    const parent = scrollParent(el);
    if (parent) parent.scrollTop += delta;
    else window.scrollBy(0, delta);
  }, [openKey]);

  return (
    <div className={s.wrap}>
      <div className={s.list}>
        <div className={cx(s.grid, s.head)}>
          <span className={cx(s.colHead, s.colHeadEnd)}>#</span>
          <span className={s.colHead}>Work</span>
          <span className={cx(s.colHead, s.colHeadEnd)}>Qty</span>
          <span className={s.colHead}>Unit</span>
          <span className={cx(s.colHead, s.colHeadEnd)}>Unit price</span>
          <span className={cx(s.colHead, s.colHeadEnd)}>Line total</span>
          <span />
        </div>

        {sheetRows(lines).map(({ line, mark }) => (
          <LineRow
            key={line.id}
            line={line}
            mark={mark}
            open={openIds.includes(line.id)}
            onToggle={() => toggle(line.id)}
            onPatch={(patch) => onPatch(line.id, patch)}
            onRemove={() => onRemove(line.id)}
            register={register}
          />
        ))}

        <div className={cx(s.grid, s.foot)}>
          <span className={s.footNote}>
            {namedCount} counted
            {unnamedCount > 0 ? ` · ${unnamedCount} unnamed, excluded` : ""}
          </span>
          <span className={s.footValue}>{money(baseTotal)}</span>
        </div>
      </div>

      <button type="button" className={s.addRow} onClick={onAdd}>
        <Ic name="plus" />
        Add a line
      </button>

      <div className={s.tax}>
        <label className={s.label} htmlFor={taxId}>
          Tax rate
        </label>
        <NumIn
          id={taxId}
          value={taxPct}
          suffix="%"
          max={100}
          onChange={onTaxPct}
          ariaLabel="Tax rate"
        />
        <span className={s.hint}>
          {taxAuto && taxState ? `Estimated from ${stateDisplayName(taxState)}` : "Set by hand"}
        </span>
      </div>
    </div>
  );
}
