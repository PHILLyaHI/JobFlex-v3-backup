"use client";

// LINE ITEMS — "V2", the owner's previous-app layout, rebuilt in the house skin.
//
// Card 03 of the manual proposal builder. This one is not a fresh idea: it
// reproduces a LAYOUT the owner already knows and already trusts, and swaps its
// palette and its arithmetic for ours.
//
// WHAT IS REPRODUCED (structure only)
//   one header row, then a repeating unit of TWO STACKED BANDS per line:
//     band 1 — the entry row, on the header's own column grid:
//              description · qty · unit · $ per · material · labor · total · ×
//     band 2 — the split, full width beneath it: a swatch + "Material" + amount
//              at the far left, the mirror at the far right, a slider spanning
//              between them, and the two percentages beneath its ends.
//
// WHAT WAS REPRODUCED AND THEN DROPPED
//   the reference's RUNNING COLUMN TOTAL under each money head. It was carried
//   for several passes as "the one genuinely good idea in the reference" and it
//   does not survive contact with a seven-column head: three columns grew a
//   second line and four did not, so the head became a two-tier row that reads
//   as one, and the block's grand total ended up printed above the rows it
//   sums in the quietest type on the page. The foot already closes all three
//   money columns properly. See the head in `LinesV2` for the full argument.
//
// WHAT IS NOT REPRODUCED
//   · the palette. The reference is a purple/blue consumer skin. Here the two
//     halves are --blueprint (material) and --sky (labor) against ink and paper,
//     the track is a drawn 2px rule with square ends, and the handle is a square
//     plate. No gradient, no capsule, no purple.
//   · the arithmetic. The reference's own figures do not reconcile (its 22 x 2
//     is not its 550.76). Ours is the codebase's model — see THE ARITHMETIC.
//   · `line.description`. The reference layout has exactly ONE wide text field
//     per line and this build binds it to `name`, because `name` is what decides
//     whether a line counts at all (`isNamed`). The optional print-note has no
//     seat in this silhouette, so it is deliberately not surfaced here — a
//     documented gap in this variant, not an oversight. If this design wins, the
//     note wants the head's spare width, not a third band.
//
// `openIds` / `onToggle` are ignored on purpose: nothing in this design is ever
// hidden, so there is no disclosure to model. The contract allows that.
//
// `baseTotal` is ignored on purpose too, and that one is newer. The foot now
// prints THREE figures — material, labor, and the combined answer — and all
// three come from the same `sums` the head's running column totals are drawn
// from. Taking the big number from a prop and its two components from a local
// reduction would be two arithmetics printing one row, and the day they
// disagreed the block would be lying in the loudest type it owns.
//
// ── THE ARITHMETIC ──────────────────────────────────────────────
// `materialCost` + `laborCost` ARE the unit price; there is no third field.
//   $ / UNIT  = unitCost(line)               editing it -> applyUnitPrice, which
//                                            rescales BOTH halves around the
//                                            current ratio, so the price moves
//                                            and the mix does not.
//   TOTAL     = round2(quantity x unitCost)  computed, never editable.
//   the split = applyMaterialShare only      so the mix moves and the price
//                                            does not. The two controls cannot
//                                            drift each other.
//
// ── PER-UNIT OR LINE-LEVEL? THE DECISION ────────────────────────
// The MATERIAL and LABOR columns show LINE-LEVEL amounts: quantity x the stored
// per-unit cost, the same register as TOTAL. Reasons, in order:
//
//   1. THE ROW CHECKS OUT BY HAND. material + labor = total, on every row, at
//      any quantity. Per-unit cells would sum to `$ / UNIT` instead, and then
//      the three widest money columns on the block would be in two different
//      registers sitting side by side.
//   2. THE COLUMN SUMS RECONCILE WITH EACH OTHER. The reference's one good idea
//      only works if they do: SUM(material) + SUM(labor) = SUM(total), which is
//      exactly what the head prints. Summing per-unit rates down a column that
//      mixes sq ft, hours and lump sums would produce a figure that means
//      nothing and still looks like money.
//   3. It is what the head's third sum has to agree with anyway, because TOTAL
//      is unarguably line-level.
//
// Labelled so it cannot be misread: the rate column is the only one that names
// a unit — "$ / UNIT" — and the three amount columns carry no unit at all, each
// with its own column sum printed beneath it. Band 2's two amounts are the same
// line-level figures as the two cells directly above them, by construction.
//
// The one rounding care: `labor` is displayed as total - material rather than as
// its own rounded product, the same remainder trick `applyUnitPrice` uses, so a
// half-cent can never leave a row adding up to a cent more than its own total.
//
// ── UNITS ───────────────────────────────────────────────────────
// Every unit change routes through `applyUnitChange`, never a bare `{ unit }`
// patch — it is what folds a discarded quantity into the price when a line
// becomes FIXED, so switching to a lump sum does not silently re-price the work.
//   FIXED  quantity is meaningless, so the cell becomes a DISABLED input reading
//          1. A fixed line can never show "x 3".
//   HOUR   time is labor. Seeded once, at the moment a costless hourly line is
//          first priced, and never again: after that the ratio is the user's and
//          `applyUnitPrice` preserves it. A rule that re-seeds on every edit
//          would be a rule that fights whoever moved the slider.

import { useId, useMemo, useRef, useState } from "react";
import type { Line, LineItemsProps, Unit } from "../lines-lab/lines-contract";
import { splitLabel } from "../lines-lab/lines-contract";
import {
  UNITS,
  UNIT_LABEL,
  applyMaterialShare,
  applyUnitChange,
  applyUnitPrice,
  isFixedUnit,
  isNamed,
  isTimeUnit,
  materialShare,
  money,
  qty,
  round2,
  unitCost,
} from "../manual-focus/manual-focus-math";
import { stateDisplayName } from "../manual-focus/manual-focus-data";
import s from "./lines-v2.module.css";

/** Local class joiner. Deliberately NOT `@/lib/cn` — twMerge has Tailwind
 *  opinions and no business near a hashed CSS-module name. */
function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** A half-typed field reads as NaN; treat it as zero rather than poisoning the
 *  three column sums above it while the user is mid-keystroke. */
function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/* ============================================================
   THE ROW'S THREE MONEY FIGURES — computed in one place
   ============================================================ */

type Figures = { material: number; labor: number; total: number };

/**
 * The line-level amounts the MATERIAL / LABOR / TOTAL columns print.
 *
 * `total` is quantity x the ROUNDED unit price, which is the house rule that
 * makes a printed sheet multiply out in front of a homeowner. `labor` is then
 * the remainder rather than its own rounded product, so material + labor = total
 * exactly — and therefore the three column sums reconcile exactly too.
 */
function figures(line: Line): Figures {
  const q = num(line.quantity);
  const total = round2(q * unitCost(line));
  const material = round2(q * num(line.materialCost));
  return { material, labor: round2(total - material), total };
}

/* ============================================================
   FIELDS
   ============================================================ */

/**
 * A numeric entry with a local string buffer.
 *
 * The buffer is the whole reason this is a component: committing
 * `Number(e.target.value)` straight to state re-renders "0." as "0" and makes it
 * literally impossible to type "0.62". The buffer lets a controlled input behave
 * like an uncontrolled one for the length of a keystroke run, and is dropped on
 * blur so the stored value wins again the moment focus leaves.
 *
 * `format` is what a money cell uses to rest at "3120.00" while still accepting
 * "3120." mid-type. Digits only — the currency mark is declared once, in the
 * column head, rather than floating on every field.
 */
function NumField({
  id,
  className,
  value,
  onCommit,
  ariaLabel,
  max,
  format,
  placeholder,
}: {
  id?: string;
  className: string;
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  max?: number;
  format?: (n: number) => string;
  /** What an empty field shows. The money cells pass an em dash — see
   *  `cents`. */
  placeholder?: string;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const rest = format ? format(value) : String(value);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      value={buf ?? rest}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        setBuf(raw);
        if (raw.trim() === "") {
          onCommit(0);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onCommit(max != null ? Math.min(n, max) : n);
      }}
      onBlur={() => setBuf(null)}
    />
  );
}

/**
 * Money fields rest with cents so a row's three amounts read as one column —
 * EXCEPT at zero, where they rest empty and let the placeholder em dash stand.
 *
 * "0.00" in the MATERIAL cell of a labor-only line is noise: it is four
 * characters and a decimal point saying "nothing here", set in the same weight
 * and column as the figures that do say something, so the eye has to read it
 * before it can discard it. A dash is discarded at a glance. It is the
 * PLACEHOLDER rather than the value because these are inputs — a field
 * containing a literal "—" would have to be cleared before it could be typed
 * into, which trades a reading cost for an editing one.
 */
function cents(n: number): string {
  const v = num(n);
  return v > 0 ? v.toFixed(2) : "";
}

/* ============================================================
   BAND 2 — THE SPLIT
   ============================================================ */

/**
 * The material / labor split, always visible, never behind a disclosure.
 *
 * It drives `applyMaterialShare` and NOTHING else, so moving the mix cannot move
 * the unit price by so much as a cent. It is hand-rolled rather than an
 * `<input type="range">` because the house handle is a square ink plate on a
 * drawn 2px rule with square ends, and a native range cannot be taken there
 * without vendor pseudo-elements that Lightning CSS and the module scope both
 * make miserable.
 *
 * Accessibility: `role="slider"` with a real `aria-valuetext` sentence, arrows
 * (Shift or PageUp/PageDown for 10), Home / End for the extremes. A line with no
 * price has no ratio to move, so the control goes inert AND visibly muted rather
 * than silently ignoring input.
 */
function SplitBand({
  line,
  named,
  onPatch,
}: {
  line: Line;
  named: boolean;
  onPatch: (patch: Partial<Line>) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const priced = unitCost(line) > 0;

  /**
   * ── WHY THE DRAG HOLDS ITS OWN POSITION ──────────────────────
   * The previous pass fixed the notchiness (drawing from the rounded share).
   * What was left is coarser and is not a granularity problem at all: this
   * component does not own the value it draws. `commit` calls `onPatch`, which
   * lands in the page's single `draft` object, which re-renders all ten cards,
   * the totals and the whole client-copy document — and only THEN does the new
   * share arrive back down as a prop for the fill and the plate to be drawn
   * from. Every frame of a drag was paying for a full-page render before the
   * rail could move, and pointermove fires faster than frames on a 120Hz
   * trackpad, so several of those could queue up inside one frame.
   *
   * So the drag keeps its own position. `dragPos` is set synchronously from the
   * pointer and re-renders THIS component only, so the rail tracks the finger
   * at the pointer's own rate no matter what the page costs; the expensive
   * commit is coalesced to one per animation frame behind it. On release the
   * final position is flushed and `dragPos` is dropped, so the prop is the
   * source of truth again the instant the drag ends — the local value is a
   * drag-length lease, never a second copy of the state.
   */
  const [dragPos, setDragPos] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  /**
   * ── WHY THE SHARE IS READ TWICE ──────────────────────────────
   * `pos` is the CONTINUOUS share and is the only thing the fill and the plate
   * are ever drawn from. The old build drew them from the ROUNDED share, and
   * that single `Math.round` was the whole reason the drag felt notchy: at the
   * ~1150px this rail gets, one percent is ~11.5px, which is wider than the
   * 14px plate, so the plate left the pointer and jumped a plate-width at a
   * time. Nothing about the value changed — only what was drawn from it.
   *
   * `pct` is the rounded share and is what every WORD says: the two printed
   * percentages, `aria-valuenow`, and the valuetext sentence. A mix is spoken
   * and read in whole percent; "63.4% material" is not a sentence a contractor
   * says out loud.
   */
  const stored = materialShare(line);
  const pos = dragPos ?? stored;
  const pct = Math.round(pos);

  /**
   * The one writer. It calls `applyMaterialShare` and NOTHING else, so moving
   * the mix cannot move the unit price by so much as a cent.
   *
   * Fractional shares are passed straight through rather than pre-rounded:
   * `applyMaterialShare` rounds the two COSTS to cents, and cents are a finer
   * quantiser than 1% on any line worth more than a dollar — so the stored
   * value, and therefore `pos`, tracks the pointer. The guard compares the
   * resulting costs instead of a percentage, which is exact: a drag that has
   * not yet moved a cent is a no-op rather than a re-render.
   */
  function commit(next: number) {
    const clamped = Math.min(100, Math.max(0, next));
    const patch = applyMaterialShare(line, clamped);
    if (patch.materialCost === line.materialCost && patch.laborCost === line.laborCost) return;
    onPatch(patch);
  }

  /**
   * The share under the pointer, or null if the rail has no width to measure
   * against (not mounted, or hidden).
   *
   * ── WHY THIS MEASURES THE INNER BOX, NOT THE RECT ────────────
   * The plate used to drift off the fill, worst near the ends and worst of all
   * at the left. TWO separate errors stacked, and both are geometry rather than
   * anything to do with dragging:
   *
   *   1  THE BORDER. `.rail` carries a 1.5px ink outline under
   *      `box-sizing: border-box`, so `getBoundingClientRect()` returns a box
   *      3px wider than the one `.railMat`'s `width: N%` is a percentage of,
   *      starting 1.5px further left. Every reading was therefore shifted by
   *      1.5px and scaled by 3/W against the fill it was supposed to produce.
   *   2  THE HALF-PLATE INSET. The plate was positioned with the native
   *      range-thumb trick — `pos * (100% - 14px) + 7px` — which keeps a thumb
   *      inside its track but deliberately makes the thumb's CENTRE lag its
   *      value by `7 - pos*0.14` px. On a range input nothing marks the value
   *      but the thumb, so the lag is invisible. Here the fill's edge marks it
   *      too, so the trick put the plate up to 7px away from the boundary it
   *      exists to point at — +7px at 0%, 0 at 50%, -7px at 100%. That is
   *      exactly the reported "worse the closer it is to the left".
   *
   * Error 2 is fixed in the CSS (the plate is centred on its value again, and
   * `--v2-rail-inset` is what now keeps it inside the line). This is error 1:
   * `clientLeft` is the left border width and `clientWidth` is the padding box,
   * so together they name precisely the box the fill fills.
   *
   * `scale` carries that layout measurement into viewport space. `clientLeft`
   * and `clientWidth` are unscaled layout pixels while `clientX` and the rect
   * are visual, so under any CSS transform on an ancestor — this page's
   * entrance cascade animates one — mixing the two would reintroduce a scaling
   * error of exactly the kind being removed.
   */
  function shareAt(clientX: number): number | null {
    const el = railRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || el.offsetWidth <= 0) return null;

    const scale = rect.width / el.offsetWidth;
    const innerWidth = el.clientWidth * scale;
    if (innerWidth <= 0) return null;

    const originX = rect.left + el.clientLeft * scale;
    return Math.min(100, Math.max(0, ((clientX - originX) / innerWidth) * 100));
  }

  /** Draw now, commit on the next frame. Repeated calls inside one frame
   *  overwrite the pending value rather than queueing another render, so a
   *  240Hz pointer still costs exactly one commit per frame. */
  function trackTo(clientX: number) {
    const next = shareAt(clientX);
    if (next === null) return;
    setDragPos(next);
    pendingRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const value = pendingRef.current;
      pendingRef.current = null;
      if (value !== null) commit(value);
    });
  }

  /** Drop a scheduled commit — used when the drag ends and the final value is
   *  being written synchronously instead. Without this the queued frame could
   *  land AFTER the release and re-apply a stale position. */
  function cancelFrame() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
  }

  /** Keyboard steps off the ROUNDED share, so an arrow from 63.4% lands on 64%
   *  and not on 64.4% — the printed percentage has to move by exactly what the
   *  key promised. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 1;
    let next: number;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = pct - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = pct + step;
        break;
      case "PageDown":
        next = pct - 10;
        break;
      case "PageUp":
        next = pct + 10;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      default:
        return;
    }
    e.preventDefault();
    commit(next);
  }

  /** Released, cancelled, or the pointer was taken away — all three end the
   *  drag, and all three have to, because `.dragging` is what suppresses the
   *  fill/plate transition. Leaving it stuck on would silently disable the
   *  easing that keyboard steps depend on. */
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Flush the last position synchronously, then hand the drawing back to the
    // prop. Order matters: dropping the lease before the value is committed
    // would snap the plate to the last COMMITTED share for one frame.
    const last = pendingRef.current;
    cancelFrame();
    if (last !== null) commit(last);
    setDragPos(null);
    setDragging(false);
  }

  return (
    <div className={cx(s.split, !priced && s.splitOff)}>
      {/* ── LEGEND — ONE ENCODING, NOT THREE ───────────────────────────
          The same pair of numbers used to be stated three times per line:
          as dollars in the MATERIAL and LABOR fields, again as dollars in
          this legend, and again as percentages in a row of their own under
          the rail. Row one read "$0.00 / $1,488.00 / 0% / 100%" — four
          labels for one fact.

          Two of the three are gone. The legend's DOLLARS went, because
          they were a verbatim reprint of the two fields sitting directly
          above them in the same columns — the shortest possible distance
          for a duplicate to travel. The separate percentage row went too,
          and its figures moved in here beside the words they belong to.

          That also fixes what those percentages actually said. Alone under
          the ends of a track, "0%" and "100%" read as the SLIDER'S RANGE,
          not its value — you only learned otherwise on a row that happened
          to sit at 44/56. Attached to the word, "Material 0%" and
          "100% Labor" cannot be misread.

          So: fields carry the money, the legend and rail carry the mix,
          and neither says the other's half.

          The middle stays empty by design — it is where an excluded row
          says so, directly under the entry it disqualifies. */}
      <div className={s.legend}>
        <span className={s.legendSide}>
          <span className={cx(s.swatch, s.swatchMat)} aria-hidden="true" />
          <span className={s.legendWord}>Material</span>
          <span className={s.legendPct}>{pct}%</span>
        </span>

        <span className={s.legendMid}>
          {!named ? <span className={s.flag}>Needs a name · excluded</span> : null}
        </span>

        <span className={cx(s.legendSide, s.legendSideEnd)}>
          <span className={s.legendPct}>{100 - pct}%</span>
          <span className={s.legendWord}>Labor</span>
          <span className={cx(s.swatch, s.swatchLab)} aria-hidden="true" />
        </span>
      </div>

      {/* `.eased` is on except during a drag. Easing a directly manipulated
          value puts the plate behind the pointer and reads as lag; easing a 1%
          or 10% KEY step is the only thing that makes an 11px jump look like a
          move rather than a redraw. Both are true, so the class decides which
          one is in force.

          The flag is spelled positively — `.eased` present rather than
          `:not(.dragging)` — on purpose. A hashed class inside `:not()` is one
          more thing that has to survive the CSS-modules transform, and if it
          ever did not, the selector would match during a drag and quietly
          reintroduce exactly the lag this is avoiding. Spelled this way the
          worst failure is no transition at all, which is where this control
          started. */}
      <div
        className={cx(s.slider, !dragging && s.eased)}
        role="slider"
        tabIndex={priced ? 0 : -1}
        aria-label="Material and labor split"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={splitLabel(pct)}
        aria-disabled={!priced}
        onKeyDown={priced ? onKeyDown : undefined}
        onPointerDown={
          priced
            ? (e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(true);
                trackTo(e.clientX);
              }
            : undefined
        }
        onPointerMove={
          priced
            ? (e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                trackTo(e.clientX);
              }
            : undefined
        }
        onPointerUp={priced ? endDrag : undefined}
        onPointerCancel={priced ? endDrag : undefined}
      >
        {/* The plate lives INSIDE the rail now that the rail is inset from the
            slider's own box (see `--v2-rail-inset`). Its `left` is a percentage
            of its offset parent, so with the rail no longer full-bleed a plate
            parented to the SLIDER would drift off the fill by the width of the
            inset — worst at the ends, where the value is least forgiving.

            CENTRED ON ITS VALUE — `left: pos%` against the same containing
            block `.railMat` is a percentage of, so the plate's centre IS the
            fill's edge at every position, exactly, with no arithmetic between
            them that could disagree. The previous pass inset it by half a plate
            (the native range-thumb trick) to stop it hanging off the ends; that
            bought the containment at the price of up to 7px of drift from the
            boundary it marks. Containment is now bought with geometry instead —
            `--v2-rail-inset` is half a plate wide, so the rail starts far
            enough into the line that a plate centred on 0% still lands inside
            it. See `shareAt` for the other half of this fix. */}
        <span className={s.rail} ref={railRef} aria-hidden="true">
          <span className={s.railMat} style={{ width: `${pos.toFixed(3)}%` }} />
          <span className={s.handle} style={{ left: `${pos.toFixed(3)}%` }} />
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   THE LINE — two bands
   ============================================================ */

function LineBlock({
  line,
  first,
  onPatch,
  onRemove,
}: {
  line: Line;
  first: boolean;
  onPatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const named = isNamed(line);
  const fixed = isFixedUnit(line.unit);
  const cost = unitCost(line);
  const fig = figures(line);
  const q = num(line.quantity);

  /**
   * The unit price, with the HOUR seed.
   *
   * `applyUnitPrice` splits a first price 50/50 because a costless line has no
   * ratio to preserve. On an hourly line that is wrong more often than it is
   * right, so the FIRST price on a costless HOUR line goes entirely to labor.
   * Once a ratio exists this branch is dead and `applyUnitPrice` runs, which is
   * what keeps the rule from fighting anyone who has since moved the slider.
   */
  function commitUnitPrice(n: number) {
    if (cost <= 0 && isTimeUnit(line.unit)) {
      onPatch({ materialCost: 0, laborCost: round2(n) });
      return;
    }
    onPatch(applyUnitPrice(line, n));
  }

  /**
   * MATERIAL and LABOR are typed as LINE amounts and stored per unit, so they
   * divide on the way in. With no quantity yet there is nothing to divide by;
   * the typed figure is taken as the per-unit cost, which is the only reading
   * that does not throw the number away.
   */
  function commitExtended(field: "materialCost" | "laborCost", v: number) {
    onPatch({ [field]: q > 0 ? round2(v / q) : round2(v) } as Partial<Line>);
  }

  return (
    <div
      className={cx(s.line, first && s.lineFirst)}
      role="group"
      aria-label={
        named
          ? `${line.name} — ${qty(line.quantity)} ${UNIT_LABEL[line.unit]}`
          : "Unnamed line"
      }
    >
      {/* BAND 1 — the entry row, on the header's own grid. */}
      <input
        type="text"
        className={cx(s.f, s.fText, s.cName)}
        value={line.name}
        placeholder="Describe the work"
        aria-label="Description"
        onChange={(e) => onPatch({ name: e.target.value })}
      />

      {fixed ? (
        <input
          type="text"
          className={cx(s.f, s.fNum, s.cQty)}
          value="1"
          disabled
          title="A fixed line is a lump sum, so its quantity stays at 1."
          aria-label="Quantity — pinned to 1 because this is a fixed, lump-sum line"
          readOnly
        />
      ) : (
        <NumField
          className={cx(s.f, s.fNum, s.cQty)}
          value={line.quantity}
          onCommit={(n) => onPatch({ quantity: n })}
          ariaLabel="Quantity"
        />
      )}

      {/* The unit picker is the SHARED blueprint select published once in
          blueprint-global.css — `.bp-sel` on the wrapper, `.bp-sel-in` on the
          control. The wrapper draws the caret because a <select> cannot carry
          a pseudo-element. decisions.md is explicit that this codebase has
          exactly one styled select and that a page re-deriving
          `appearance: none` plus a caret of its own is drift; this block used
          to be one of those pages. Only the FIT to a 36px row is set locally. */}
      <span className={cx("bp-sel", s.sel, s.cUnit)}>
        <select
          className="bp-sel-in"
          value={line.unit}
          aria-label="Unit of measure"
          onChange={(e) => onPatch(applyUnitChange(line, e.target.value as Unit))}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </span>

      <NumField
        className={cx(s.f, s.fNum, s.cPer)}
        value={cost}
        onCommit={commitUnitPrice}
        format={cents}
        placeholder="—"
        ariaLabel={`Price per ${UNIT_LABEL[line.unit]}`}
      />

      <NumField
        className={cx(s.f, s.fNum, s.cMat)}
        value={fig.material}
        onCommit={(n) => commitExtended("materialCost", n)}
        format={cents}
        placeholder="—"
        ariaLabel="Material amount for this line"
      />

      <NumField
        className={cx(s.f, s.fNum, s.cLab)}
        value={fig.labor}
        onCommit={(n) => commitExtended("laborCost", n)}
        format={cents}
        placeholder="—"
        ariaLabel="Labor amount for this line"
      />

      {/* Computed, and it wears no field rule — the absence of the box is the
          signal that this figure is the row's answer, not one of its inputs. */}
      <span className={cx(s.total, s.cTotal, !named && s.totalOff)}>{money(fig.total)}</span>

      <button
        type="button"
        className={cx(s.kill, s.cKill)}
        aria-label="Remove line"
        onClick={onRemove}
      >
        <span aria-hidden="true">×</span>
      </button>

      {/* BAND 2 — the split, full width beneath the entry row. */}
      <div className={s.cSplit}>
        <SplitBand line={line} named={named} onPatch={onPatch} />
      </div>
    </div>
  );
}

/* ============================================================
   THE BLOCK
   ============================================================ */

/**
 * One optional prop beyond the shared contract.
 *
 * The contract makes the tax rate part of this block, and on the comparison
 * page that is right — each design has to answer where tax goes. In the BUILDER
 * it is wrong: tax moved into the "Payment & pricing" card, where it sits in
 * the chain between the subtotal and the grand total and carries the note
 * explaining where the rate came from. Rendering it here as well would print
 * the same control in two cards, which is the exact failure this whole redesign
 * was started over.
 *
 * Optional and defaulting to false, so the lab page still gets the contract's
 * behaviour without knowing this exists.
 */
type LinesV2Props = LineItemsProps & { hideTax?: boolean };

export function LinesV2(props: LinesV2Props) {
  // `openIds` / `onToggle` / `baseTotal` are deliberately not destructured —
  // see the header. The foot's three figures all come from `sums` below.
  const {
    lines,
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
  } = props;
  const taxId = useId();

  /**
   * The three running column totals, over NAMED lines only — an untitled row is
   * not work yet and contributes to nothing (see the math module's header).
   * Because every row's own labor figure is a remainder, these three reconcile
   * exactly: material + labor = total, in the head as well as in every row.
   */
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
      {/* ── THE HEAD IS LABELS ONLY ────────────────────────────────────
          The running column totals are GONE from here, and this is the
          single change that fixed the most in one move.

          They were the reference's one genuinely good idea and they cost
          more than they paid. Three of the seven columns carried a second
          line and four did not, so the head was a two-tier row pretending
          to be one: bottom-aligned, its baseline read
          "DESCRIPTION QTY UNIT $/UNIT $3,852.00 $6,432.20 $10,284.20" —
          four labels and three values on one visual line. Top-aligned, the
          four bare labels floated half a row above the rule they head.
          There was no alignment that made a mixed row of labels and values
          read as one thing, because it is not one thing.

          Worse, it put the document's most important figure — the grand
          total — at the TOP of the table in 10.5px muted mono, above the
          rows it sums. A total belongs after its parts. The foot already
          prints all three sums, in the columns they belong to, at the
          weight they deserve; the head was a quieter second printing of
          the foot, which is the one-number-one-home rule broken inside the
          block that documents it.

          The currency mark now sits in every money head — `$ / UNIT`,
          `$ MATERIAL`, `$ LABOR`, `$ TOTAL`. That is the stated rule the
          column set was missing: a head declares its unit once, the fields
          under it are bare digits because they are typed into, and the two
          figures that are READ rather than typed (the row's total and the
          foot's sums) carry the mark. */}
      <div className={s.head}>
        <span className={s.colHead}>
          <span className={s.colName}>Description</span>
        </span>
        <span className={cx(s.colHead, s.colHeadEnd)}>
          <span className={s.colName}>Qty</span>
        </span>
        <span className={s.colHead}>
          <span className={s.colName}>Unit</span>
        </span>
        <span className={cx(s.colHead, s.colHeadEnd)}>
          <span className={s.colName}>$ / unit</span>
        </span>
        <span className={cx(s.colHead, s.colHeadEnd)}>
          <span className={s.colName}>$ Material</span>
        </span>
        <span className={cx(s.colHead, s.colHeadEnd)}>
          <span className={s.colName}>$ Labor</span>
        </span>
        <span className={cx(s.colHead, s.colHeadEnd)}>
          <span className={s.colName}>$ Total</span>
        </span>
        <span />
      </div>

      {lines.map((l, i) => (
        <LineBlock
          key={l.id}
          line={l}
          first={i === 0}
          onPatch={(patch) => onPatch(l.id, patch)}
          onRemove={() => onRemove(l.id)}
        />
      ))}

      {/* The next ruled line, not a button parked under the table. */}
      <button type="button" className={s.add} onClick={onAdd}>
        <span className={s.addMark} aria-hidden="true">
          +
        </span>
        Add a line
      </button>

      {/* The foot closes each of the three money columns in the column it
          sums, on the same grid the head opened them on — so material and
          labor land under MATERIAL and LABOR, and the answer lands under
          TOTAL. All three read `sums`, the identical reduction the head prints,
          which is why they cannot drift apart. */}
      <div className={s.foot}>
        <span className={s.footNote}>
          {namedCount} counted
          {unnamedCount > 0 ? ` · ${unnamedCount} unnamed, excluded` : ""}
        </span>

        <span className={cx(s.footPart, s.footMat)}>
          <span className={s.footPartName}>Material</span>
          <span className={s.footPartAmt}>{money(sums.material)}</span>
        </span>

        <span className={cx(s.footPart, s.footLab)}>
          <span className={s.footPartName}>Labor</span>
          <span className={s.footPartAmt}>{money(sums.labor)}</span>
        </span>

        {/* No label. It is the only figure in the block that needs none — it
            sits under the word TOTAL and it is the largest thing here. */}
        <span className={s.footAmt}>{money(sums.total)}</span>
      </div>

      {hideTax ? null : (
        <div className={s.taxLine}>
          <label className={s.taxLabel} htmlFor={taxId}>
            Tax rate
          </label>
          <span className={s.taxWrap}>
            <NumField
              id={taxId}
              className={cx(s.f, s.fNum)}
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
            {taxAuto && taxState ? `Estimated from ${stateDisplayName(taxState)}` : "Set by hand"}
          </span>
        </div>
      )}
    </div>
  );
}
