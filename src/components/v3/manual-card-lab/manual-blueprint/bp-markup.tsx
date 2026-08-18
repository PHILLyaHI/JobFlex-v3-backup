"use client";

// MANUAL PROPOSAL / BLUEPRINT — the "Markup & margin" card body.
//
// A reference layout the owner supplied, translated into the house system
// rather than copied. Two columns: four rate CONTROLS on the left, one read-only
// ESTIMATE plate on the right, and a margin reading above both.
//
// ── WHAT THE TRANSLATION CHANGED ────────────────────────────────────────────
// The reference is a soft consumer style — pastel dots, pill badges, fully round
// handles, rounded panels, a blurred lift. None of that survives:
//   · every corner is 2px (var(--radius)); nothing is a capsule;
//   · the slider handle is a square PLATE with a 2px ink edge and a hard
//     3px-offset shadow — the house's only elevation device;
//   · the summary panel is a drawn plate: 2px solid ink, radius 2;
//   · the margin badge is the 3-tone status badge, not a pastel pill.
//
// ── THE MARKS: TWO HUES, NOT FOUR ───────────────────────────────────────────
// The reference gives each rate its own pastel dot. Four distinct hues cannot be
// justified here. The house has exactly two non-status inks — --blueprint and
// --sky — and the three status tones are reserved for real status (a rate is not
// a status; nothing about "Labor 18%" is good, warning or bad).
//
// So the mark carries the one distinction that is actually TRUE of the math:
//
//   blueprint  Materials / Labor   line-level. They multiply the BASE COST of
//                                  every line, before anything else runs.
//   sky        Overhead / Profit   sheet-level. They compound on the running
//                                  subtotal, after the lines are already priced.
//
// Two marks, two groups — and the same two hues fill the two pairs of slider
// tracks, so the grouping is stated twice by the same device rather than once by
// four decorations. The mark identifies a GROUP, not a row; the row's own label
// ("+ Materials markup") does the identifying, which is why one hue can serve
// two rows without ambiguity. The four marks reappear beside exactly the four
// panel rows a slider can move — the base rows, Subtotal and Grand total carry
// no mark, so the marked rows read as "these are the ones you control".
//
// ── WHAT WAS DROPPED FROM THE REFERENCE, AND WHY ────────────────────────────
//   · Per-rate boxes/rules. The four controls are separated by air alone —
//     24px between them against 8px inside one. Proximity already groups them;
//     four more frames inside a framed card is the wall this build avoids.
//   · The rule under the ESTIMATE heading. The panel border is the frame and
//     12px of air is the separation. A third horizontal line earned nothing.
//   · A "Margin" row in the panel. The badge already prints it; the same figure
//     twelve rows apart is the "one number, two places" failure.
//   · Em dashes in the LEDGER. A ledger that prints dashes does not add up, so
//     the panel always prints real money. The em dash survives only in the
//     slider footers, which are annotations of a control, not accounts.
//
// ── NOTHING IS COMPUTED HERE ────────────────────────────────────────────────
// Every figure arrives as a prop off `Totals` and is only FORMATTED. There is
// exactly one place these numbers are derived (`computeTotals`) and this file is
// deliberately not a second one. `money` and `pct1` are imported from the same
// module for the same reason.

import { useId, useRef, useState } from "react";
import { money, pct, pct1, round2 } from "../manual-focus/manual-focus-math";
import { stateDisplayName } from "../manual-focus/manual-focus-data";
import type { Totals } from "../manual-focus/manual-focus-types";
import { NumField, cx } from "./bp-ui";
import s from "./bp-markup.module.css";

/* ============================================================
   PROPS
   ============================================================ */

/**
 * The derived figures the card prints, taken straight off `Totals` so the names
 * and the meanings cannot drift from `computeTotals`.
 *
 * `preTax` is the ledger's GRAND TOTAL — see the note on the field in
 * manual-focus-types.ts, where it is documented as exactly that (and as the
 * client copy's "Subtotal", one figure printed in two registers).
 *
 * `margin` is measured against DISCOUNTED revenue, so with a discount live it is
 * deliberately lower than (preTax − base) / preTax. That is the honest reading
 * and it is why this card takes the figure rather than deriving its own.
 *
 * A whole `Totals` satisfies this type, so the caller can pass `totals` as-is.
 */
export type MarkupFigures = Pick<
  Totals,
  | "baseMaterials"
  | "baseLabor"
  | "materialsMarkup"
  | "laborMarkup"
  | "subtotalCosts"
  | "overheadAmount"
  | "profitAmount"
  | "preTax"
  | "discountAmount"
  | "tax"
  | "total"
  | "margin"
>;

export type MarkupBlockProps = {
  /** The four rates, as percentages — 18.5 means 18.5%. */
  materialMarkupPct: number;
  laborMarkupPct: number;
  overheadPct: number;
  profitPct: number;

  /** One handler per rate. Each receives the new percentage, already clamped to
   *  0–100 and quantised to the slider's step. */
  onMaterialMarkupPct: (next: number) => void;
  onLaborMarkupPct: (next: number) => void;
  onOverheadPct: (next: number) => void;
  onProfitPct: (next: number) => void;

  /** The two ADJUSTMENTS, which used to be a card of their own. See the note on
   *  `Adjustments` below for why they now sit under the four rates. Each mode of
   *  the discount keeps its own stored figure, so flipping $ / % never
   *  reinterprets a number already typed. */
  discountPct: number;
  discountFlat: number;
  discountIsPercent: boolean;
  taxPct: number;
  taxAuto: boolean;
  taxState: string;
  onPatch: (patch: {
    discountPct?: number;
    discountFlat?: number;
    discountIsPercent?: boolean;
  }) => void;
  onTaxPct: (next: number) => void;

  totals: MarkupFigures;
};

/* ============================================================
   SLIDER MECHANICS
   ============================================================ */

const MAX = 100;
/** 0.5 because the whole card prints one decimal place (`pct1`). A finer step
 *  would produce values the page cannot show, and 18.4% vs 18.3% is not a
 *  distinction anyone quoting a job is making. */
const STEP = 0.5;
/** PageUp / PageDown. Ten arrow presses is a long way to 20%. */
const BIG_STEP = 5;

function quantise(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.min(MAX, Math.max(0, raw));
  // toFixed(2) kills the float dust that `Math.round(x / 0.5) * 0.5` leaves
  // behind, which would otherwise reach state as 18.500000000000004.
  return Number((Math.round(clamped / STEP) * STEP).toFixed(2));
}

/** Which of the two groups a rate belongs to. See the marks note at the top. */
type RateGroup = "cost" | "sheet";

function Rate({
  name,
  qualifier,
  group,
  value,
  amount,
  onChange,
}: {
  name: string;
  /** The short grey clause beside the name — what the percentage is OF. */
  qualifier: string;
  group: RateGroup;
  value: number;
  /** What this rate is currently worth, in dollars. Formatted, never derived. */
  amount: number;
  onChange: (next: number) => void;
}) {
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const ratio = Math.min(1, Math.max(0, value / MAX));

  function valueFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return value;
    return quantise(((clientX - r.left) / r.width) * MAX);
  }

  function commit(next: number) {
    if (next !== value) onChange(next);
  }

  return (
    <div className={s.rate}>
      <div className={s.rateTop}>
        <span className={s.rateId}>
          <span
            className={cx(s.mark, group === "cost" ? s.markCost : s.markSheet)}
            aria-hidden="true"
          />
          <span className={s.rateName} id={labelId}>
            {name}
          </span>
          <span className={s.rateQual}>{qualifier}</span>
        </span>
        <span className={s.ratePct}>{pct1(value)}</span>
      </div>

      {/* A div, not a button: the module's rules are (0,2,0) and beat the shell's
          `.bp button` reset, but a native button would still carry submit
          semantics and a role override, which is two lies for no gain. */}
      <div
        className={cx(s.slider, dragging && s.sliderOn)}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-valuetext={`${pct1(value)}, worth ${money(amount)}`}
        onPointerDown={(e) => {
          // Stops the drag from selecting the label text. It also suppresses the
          // implicit focus, so focus is taken by hand on the next line.
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          commit(valueFromClientX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          commit(valueFromClientX(e.clientX));
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          let next: number | null = null;
          switch (e.key) {
            case "ArrowLeft":
            case "ArrowDown":
              next = value - STEP;
              break;
            case "ArrowRight":
            case "ArrowUp":
              next = value + STEP;
              break;
            case "PageDown":
              next = value - BIG_STEP;
              break;
            case "PageUp":
              next = value + BIG_STEP;
              break;
            case "Home":
              next = 0;
              break;
            case "End":
              next = MAX;
              break;
            default:
              return;
          }
          e.preventDefault();
          commit(quantise(next));
        }}
      >
        <div className={s.track} ref={trackRef}>
          <span
            className={cx(s.fill, group === "cost" ? s.fillCost : s.fillSheet)}
            style={{ width: `${ratio * 100}%` }}
          />
          {/* Inset by half the plate so the handle never hangs off either end —
              the same trick a native range thumb uses. */}
          <span
            className={s.handle}
            style={{ left: `calc(${ratio} * (100% - 18px) + 9px)` }}
          />
        </div>
      </div>

      {/* An annotation of the control, not an account — so this is the one place
          an em dash stands in for zero. */}
      <span className={s.rateAmt}>{amount > 0 ? money(amount) : "—"}</span>
    </div>
  );
}

/* ============================================================
   THE TWO ADJUSTMENTS
   Discount and tax were card 08 of their own. They are here now
   because the ESTIMATE plate beside them prints the grand total,
   and a total that includes two figures set on a different card is
   the "hold a number in your head while you scroll" failure this
   column was reorganised to remove. Every lever that moves the
   plate is now within one eye-travel of it.

   They are the FIFTH and SIXTH controls in the left rail, under a
   ruled break — not two more sliders. A slider is right for a rate
   you sweep to feel the effect; a discount and a tax rate are typed
   exact figures (8.25%, $500 off), and a 0.5%-stepped track cannot
   even express the first one.
   ============================================================ */

/**
 * The tax rate's sentence: what the rate is charged ON, then where it came from.
 *
 * Base first, always, and in the same words the discount uses — the order of
 * operations is the thing people get wrong, and it is only legible if both state
 * their base in a form you can lay side by side.
 *
 * Provenance second, and deliberately saying what will happen NEXT rather than
 * only what happened: the field silently stops tracking the address once it is
 * typed in, and that is the behaviour people are surprised by, not the estimate.
 */
function taxNote(taxAuto: boolean, taxState: string): string {
  const base = "Charged on the total after discount.";
  if (!taxAuto) {
    return `${base} Set by hand — clear it to go back to the address estimate.`;
  }
  if (!taxState) {
    return `${base} No rate could be estimated from the job address.`;
  }
  return `${base} Estimated from the job address in ${stateDisplayName(taxState)} — editing it stops that.`;
}

function Adjustments({
  discountPct,
  discountFlat,
  discountIsPercent,
  taxPct,
  taxAuto,
  taxState,
  onPatch,
  onTaxPct,
  totals,
}: Pick<
  MarkupBlockProps,
  | "discountPct"
  | "discountFlat"
  | "discountIsPercent"
  | "taxPct"
  | "taxAuto"
  | "taxState"
  | "onPatch"
  | "onTaxPct"
> & { totals: Pick<MarkupFigures, "preTax" | "discountAmount" | "tax"> }) {
  const discountId = useId();
  const taxId = useId();
  const note = taxNote(taxAuto, taxState);

  // A flat discount larger than the job is capped by computeTotals rather than
  // producing a negative taxable base. Saying so is the difference between a
  // control that looks broken and one that has a rule.
  const capped =
    !discountIsPercent && discountFlat > 0 && round2(discountFlat) > totals.preTax;

  return (
    // TWO PEERS, TWO COLUMNS. Discount and tax are the same KIND of thing —
    // a typed figure that moves the plate beside them — and stacking them made
    // the rail read as six sequential steps when it is four rates and two
    // adjustments. Side by side they are one row of two, which is what they are.
    <div className={s.adjust}>
      <div className={s.adj}>
        <div className={s.adjTop}>
          <label className={s.adjName} htmlFor={discountId}>
            Discount
          </label>
        </div>
        {/* label · amount · unit. The $ / % switch used to be an 88px
            segmented control parked up on the label line, a whole row away
            from the digits it reinterprets. It is now a single character
            INSIDE the field's right edge — the same interactive affix the
            payment schedule uses (see `.unitBtn` in bp-money.module.css) — so
            the unit sits where a unit belongs: against the number. */}
        <div className={s.adjBody}>
          <span className={s.adjField}>
            {discountIsPercent ? (
              <NumField
                id={discountId}
                value={discountPct}
                max={100}
                onChange={(n) => onPatch({ discountPct: n })}
                ariaLabel="Discount, percent"
              />
            ) : (
              <NumField
                id={discountId}
                value={discountFlat}
                onChange={(n) => onPatch({ discountFlat: n })}
                ariaLabel="Discount, dollars"
              />
            )}
            <button
              type="button"
              className={s.unitBtn}
              aria-label={discountIsPercent ? "Switch to dollars" : "Switch to percent"}
              onClick={() => onPatch({ discountIsPercent: !discountIsPercent })}
            >
              {discountIsPercent ? "%" : "$"}
            </button>
          </span>
          {/* Same register as `.rateAmt` under a slider: an annotation of the
              control, so the em dash stands in for zero here too. */}
          <span className={cx(s.adjAmt, capped && s.adjAmtCap)}>
            {capped
              ? `Capped at ${money(totals.preTax)}`
              : totals.discountAmount > 0
                ? `−${money(totals.discountAmount)}`
                : "—"}
          </span>
        </div>
      </div>

      <div className={s.adj}>
        <div className={s.adjTop}>
          <label className={s.adjName} htmlFor={taxId}>
            Tax
          </label>
          {taxAuto ? (
            <>
              <span className={s.autoTag} title={note}>
                auto
              </span>
              {/* `title` is a mouse affordance. The same words, in the tree,
                  for everyone else. */}
              <span className={s.sr}>{note}</span>
            </>
          ) : null}
        </div>
        <div className={s.adjBody}>
          <span className={s.adjField}>
            <NumField
              id={taxId}
              value={taxPct}
              max={100}
              onChange={onTaxPct}
              ariaLabel="Tax rate, percent"
            />
            {/* A tax rate has exactly one unit, so this slot holds a GLYPH
                rather than a switch — same position, same metrics, no false
                affordance. Dropping it instead would leave the two columns
                mismatched by 26px on the one axis they are compared across. */}
            <span className={s.unitStatic} aria-hidden="true">
              %
            </span>
          </span>
          <span className={s.adjAmt}>
            {totals.tax > 0 ? `+${money(totals.tax)}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MARGIN BADGE
   The one legitimate STATUS reading on the card: a margin is good,
   thin or dangerous in a way a markup percentage never is.
   ============================================================ */

type Tone = "idle" | "ok" | "warn" | "risk";

/**
 * Thresholds are a LAB HEURISTIC, not company policy — a 1–10 person shop
 * typically runs ~10% overhead + ~10% profit, which lands near 20%, and 30%+ is
 * a healthy job. Wire these to a company setting before this ships anywhere.
 *
 * `idle` exists because an empty sheet has a 0% margin and a red badge on a
 * blank draft is a false alarm, not a warning. With nothing priced there is
 * nothing to grade, and the badge says so by staying neutral.
 */
function marginTone(margin: number, priced: boolean): Tone {
  if (!priced) return "idle";
  if (margin >= 30) return "ok";
  if (margin >= 15) return "warn";
  return "risk";
}

const TONE_CLASS: Record<Tone, string | false> = {
  idle: false,
  ok: s.badgeOk,
  warn: s.badgeWarn,
  risk: s.badgeRisk,
};

/* ============================================================
   THE BLOCK
   ============================================================ */

export function MarkupBlock({
  materialMarkupPct,
  laborMarkupPct,
  overheadPct,
  profitPct,
  onMaterialMarkupPct,
  onLaborMarkupPct,
  onOverheadPct,
  onProfitPct,
  discountPct,
  discountFlat,
  discountIsPercent,
  taxPct,
  taxAuto,
  taxState,
  onPatch,
  onTaxPct,
  totals,
}: MarkupBlockProps) {
  const headId = useId();

  const tone = marginTone(totals.margin, totals.preTax > 0);

  return (
    <div className={s.wrap}>
      <div className={s.badgeRow}>
        <span className={cx(s.badge, TONE_CLASS[tone])}>Margin · {pct1(totals.margin)}</span>
      </div>

      <div className={s.cols}>
        <div className={s.rates}>
          <Rate
            name="Materials"
            qualifier="markup over base"
            group="cost"
            value={materialMarkupPct}
            amount={totals.materialsMarkup}
            onChange={onMaterialMarkupPct}
          />
          <Rate
            name="Labor"
            qualifier="markup over base"
            group="cost"
            value={laborMarkupPct}
            amount={totals.laborMarkup}
            onChange={onLaborMarkupPct}
          />
          <Rate
            name="Overhead"
            qualifier="of subtotal"
            group="sheet"
            value={overheadPct}
            amount={totals.overheadAmount}
            onChange={onOverheadPct}
          />
          <Rate
            name="Profit"
            qualifier="of cost + overhead"
            group="sheet"
            value={profitPct}
            amount={totals.profitAmount}
            onChange={onProfitPct}
          />

          <Adjustments
            discountPct={discountPct}
            discountFlat={discountFlat}
            discountIsPercent={discountIsPercent}
            taxPct={taxPct}
            taxAuto={taxAuto}
            taxState={taxState}
            onPatch={onPatch}
            onTaxPct={onTaxPct}
            totals={totals}
          />
        </div>

        <section className={s.panel} aria-labelledby={headId}>
          <h3 className={s.panelHead} id={headId}>
            Estimate
          </h3>

          {/* THE OPERATORS ARE GONE FROM THE LABELS. Every row but the two
              bases and the three totals was prefixed "+", which is the one
              thing a ledger column does not need told: a figure in an
              accumulating column is added unless it says otherwise, and the two
              rows that DON'T add (discount, and the total) are the two that
              carry a sign. Six "+" characters spent saying "normal" left the
              one "−" that matters with no contrast to land against.

              "Base ·" went for the same reason — the first two rows of an
              estimate are the base by position, and the qualifier was doing
              nothing that the row order was not already doing. */}
          <div className={s.ledger}>
            <div className={s.lRow}>
              <span className={s.lLabel}>Materials</span>
              <span className={s.lValue}>{money(totals.baseMaterials)}</span>
            </div>
            <div className={s.lRow}>
              <span className={s.lLabel}>Labor</span>
              <span className={s.lValue}>{money(totals.baseLabor)}</span>
            </div>
            <div className={s.lRow}>
              <span className={s.lLabel}>
                <span className={cx(s.markSm, s.markCost)} aria-hidden="true" />
                Materials markup ({pct1(materialMarkupPct)})
              </span>
              <span className={s.lValue}>{money(totals.materialsMarkup)}</span>
            </div>
            <div className={s.lRow}>
              <span className={s.lLabel}>
                <span className={cx(s.markSm, s.markCost)} aria-hidden="true" />
                Labor markup ({pct1(laborMarkupPct)})
              </span>
              <span className={s.lValue}>{money(totals.laborMarkup)}</span>
            </div>

            <div className={cx(s.lRow, s.rowSub)}>
              <span className={cx(s.lLabel, s.labelSub)}>Subtotal</span>
              <span className={cx(s.lValue, s.valueSub)}>{money(totals.subtotalCosts)}</span>
            </div>

            <div className={s.lRow}>
              <span className={s.lLabel}>
                <span className={cx(s.markSm, s.markSheet)} aria-hidden="true" />
                Overhead ({pct1(overheadPct)})
              </span>
              <span className={s.lValue}>{money(totals.overheadAmount)}</span>
            </div>
            <div className={s.lRow}>
              <span className={s.lLabel}>
                <span className={cx(s.markSm, s.markSheet)} aria-hidden="true" />
                Profit ({pct1(profitPct)})
              </span>
              <span className={s.lValue}>{money(totals.profitAmount)}</span>
            </div>

            {/* THE PRE-TAX LINE STAYS, as a subtotal rather than as the answer.
                The chain below it is preTax → −discount → +tax → total, and with
                the base missing you can see the tax RATE and the tax RESULT but
                not what the rate was applied to — which makes the one line a
                client actually queries unverifiable. */}
            <div className={cx(s.lRow, s.rowSub)}>
              <span className={cx(s.lLabel, s.labelSub)}>Pre-tax</span>
              <span className={cx(s.lValue, s.valueSub)}>{money(totals.preTax)}</span>
            </div>

            {/* Both adjustments print every time, unlike the client's copy,
                which hides a zero discount. This is the CONTRACTOR's plate: a
                row that reads "—" tells them the lever exists and is currently
                doing nothing, which is exactly the question the card answers. */}
            <div className={s.lRow}>
              <span className={s.lLabel}>
                Discount
                {discountIsPercent && discountPct > 0 ? (
                  <span className={s.lRate}>{pct(discountPct)}</span>
                ) : null}
              </span>
              <span className={cx(s.lValue, totals.discountAmount <= 0 && s.lValueZero)}>
                {totals.discountAmount > 0 ? `−${money(totals.discountAmount)}` : "—"}
              </span>
            </div>
            <div className={s.lRow}>
              <span className={s.lLabel}>
                Tax
                <span className={s.lRate}>{pct(taxPct)}</span>
              </span>
              <span className={cx(s.lValue, totals.tax <= 0 && s.lValueZero)}>
                {totals.tax > 0 ? `+${money(totals.tax)}` : "—"}
              </span>
            </div>

            {/* The terminal beat: a 2px ink rule against the subtotals'
                hairlines, and the only Inter 900 figure on the card. Mono is
                banned on large amounts.

                This is now the REAL grand total — the figure the client is
                asked to sign — because every lever that produces it is on this
                card. It agrees with the persistent bar at the foot of the page
                by construction: both print `totals.total`. */}
            <div className={cx(s.lRow, s.rowTotal)}>
              <span className={s.labelTotal}>Grand total</span>
              <span className={s.valueTotal}>{money(totals.total)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
