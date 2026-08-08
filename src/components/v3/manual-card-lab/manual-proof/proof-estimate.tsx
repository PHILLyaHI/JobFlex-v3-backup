"use client";

// PROOF CARD — card 03, the estimate breakdown (route: /dashboard/manual-proof).
//
// THIS CARD'S CONSEQUENCE IS THE UPLIFT: everything the four controls add on
// top of base cost, in one figure, stated in the card's proof footer.
//
// Each control also carries its OWN consequence on its own line — "+$943.24 on
// $5,240.20 of material" — because a percentage is not a price and a contractor
// dragging a slider is trying to hit a number, not a rate. That is the same
// argument the footers make, one level down.
//
// The ledger underneath prints the derivation in the live builder's order and
// wording (EstimateBreakdown.tsx), so a design judged here still matches the
// product a contractor already knows.

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Markups, Totals } from "./manual-proof-types";
import { money, moneyDelta, pct1 } from "./manual-proof-math";
import { cx } from "./proof-card";
import { Ic } from "./proof-bits";
import styles from "./manual-proof.module.css";

/**
 * One markup control: a draggable rail whose filled portion is the value, the
 * same number typeable beside it, and the dollars it adds underneath.
 *
 * The rail's fill is painted from a CSS custom property carrying the live
 * percentage. A native range input cannot fill its own track, and the fill IS
 * the datum — the one thing a stylesheet legitimately cannot hold.
 */
function MarkupControl({
  label,
  caption,
  value,
  max,
  onChange,
  baseLabel,
  addsLabel,
}: {
  label: string;
  caption: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** What the percentage is taken OF, in dollars. */
  baseLabel: string;
  /** What it adds, in dollars. */
  addsLabel: string;
}) {
  const clamped = Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
  const fill = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div className={styles.mk}>
      <div className={styles.mkHead}>
        <span className={styles.mkLab}>{label}</span>
        <span className={styles.mkCap}>{caption}</span>
        <span className={styles.mkNum}>
          <input
            className={cx(styles.rowIn, styles.numIn)}
            type="number"
            inputMode="decimal"
            min={0}
            max={max}
            step="any"
            value={value}
            aria-label={`${label} percentage`}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span aria-hidden="true">%</span>
        </span>
      </div>

      <input
        className={styles.range}
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={clamped}
        aria-label={`${label} percentage, drag to set`}
        // The one inline style in this file, and unavoidable: the rail's fill
        // IS the datum, and a native range cannot fill its own track.
        style={{ "--fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <div className={styles.mkEcho}>
        <span className={styles.mkAdds}>{addsLabel}</span>
        <span className={styles.mkOf}>on {baseLabel}</span>
      </div>
    </div>
  );
}

/** One row of the estimate ledger. */
function Row({
  label,
  value,
  strong,
  grand,
}: {
  label: string;
  value: string;
  strong?: boolean;
  grand?: boolean;
}) {
  return (
    <div className={cx(styles.ledRow, strong && styles.isStrong, grand && styles.isGrand)}>
      <span className={styles.ledLab}>{label}</span>
      <span className={styles.ledLead} aria-hidden="true" />
      <span className={styles.ledVal}>{value}</span>
    </div>
  );
}

export function EstimateBlock({
  markups,
  totals,
  onChange,
}: {
  markups: Markups;
  totals: Totals;
  onChange: (patch: Partial<Markups>) => void;
}) {
  /** Saving defaults writes nothing on a lab page, so it answers in the card
   *  rather than implying a pipeline that is not there. */
  const [saved, setSaved] = useState(false);

  const overheadBase = totals.subtotalCosts;
  const profitBase = totals.subtotalCosts + totals.overhead;

  return (
    <>
      <div className={styles.mkGrid}>
        <MarkupControl
          label="Materials"
          caption="markup over base"
          value={markups.materialMarkupPct}
          max={100}
          onChange={(v) => onChange({ materialMarkupPct: v })}
          baseLabel={`${money(totals.baseMaterials)} of material`}
          addsLabel={moneyDelta(totals.materialsMarkup)}
        />
        <MarkupControl
          label="Labor"
          caption="markup over base"
          value={markups.laborMarkupPct}
          max={100}
          onChange={(v) => onChange({ laborMarkupPct: v })}
          baseLabel={`${money(totals.baseLabor)} of labor`}
          addsLabel={moneyDelta(totals.laborMarkup)}
        />
        <MarkupControl
          label="Overhead"
          caption="of subtotal"
          value={markups.overheadPct}
          max={50}
          onChange={(v) => onChange({ overheadPct: v })}
          baseLabel={money(overheadBase)}
          addsLabel={moneyDelta(totals.overhead)}
        />
        <MarkupControl
          label="Profit"
          caption="of cost + overhead"
          value={markups.profitPct}
          max={50}
          onChange={(v) => onChange({ profitPct: v })}
          baseLabel={money(profitBase)}
          addsLabel={moneyDelta(totals.profit)}
        />
      </div>

      <div className={styles.ledger}>
        <div className={styles.ledHead}>Estimate</div>
        <Row label="Base · materials" value={money(totals.baseMaterials)} />
        <Row label="Base · labor" value={money(totals.baseLabor)} />
        <Row
          label={`+ Materials markup (${pct1(markups.materialMarkupPct)})`}
          value={money(totals.materialsMarkup)}
        />
        <Row
          label={`+ Labor markup (${pct1(markups.laborMarkupPct)})`}
          value={money(totals.laborMarkup)}
        />
        <Row label="Subtotal" value={money(totals.subtotalCosts)} strong />
        <Row label={`+ Overhead (${pct1(markups.overheadPct)})`} value={money(totals.overhead)} />
        <Row label={`+ Profit (${pct1(markups.profitPct)})`} value={money(totals.profit)} />
        <Row label="Grand total" value={money(totals.sellSubtotal)} grand />
      </div>

      <div className={styles.defaultsRow}>
        <button
          type="button"
          className={styles.link}
          onClick={() => setSaved(true)}
        >
          <Ic name="pin" />
          Save these as company defaults
        </button>
        {saved && (
          <span className={styles.defaultsNote} role="status">
            Nothing was written — this lab page has no data layer. On the real builder these four
            rates would start every new proposal.
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The margin readout that rides in card 03's head. Margin health is a genuine
 * STATUS of the estimate, which is what earns the status colour tokens.
 *
 * `priced` guards the one case where a status would be a lie: with nothing
 * priced the margin is arithmetically 0%, and painting an empty page amber
 * would report a problem the contractor does not have yet. An unpriced estimate
 * has no margin, so it says so.
 */
export function MarginBadge({ margin, priced }: { margin: number; priced: boolean }) {
  if (!priced) {
    return (
      <span className={styles.margin}>
        <span className={styles.marginLab}>Margin</span>
        <span className={styles.marginVal}>—</span>
      </span>
    );
  }
  const tone = margin >= 25 ? "ok" : margin >= 15 ? "mid" : "warn";
  return (
    <span className={cx(styles.margin, styles[tone])}>
      <span className={styles.marginLab}>Margin</span>
      <span className={styles.marginVal}>{margin.toFixed(1)}%</span>
    </span>
  );
}
