"use client";

// SPEC SHEET — SH-03, the estimate basis. Route /dashboard/manual-spec.
//
// Four rates and one ledger. Each rate is a two-track row like everything
// else: the rate NAME in the label gutter, and on the value track the number
// typed onto its rule, the slider that drags it, and — printed right beside
// the control — exactly what that percentage adds in dollars. A contractor is
// building to a price, so a control that moves the total has to show that it
// moved it without anyone scrolling to find out.
//
// The ledger prints the eight rows the live estimate breakdown prints, in the
// same order and with the same wording, so the number a contractor already
// recognises is the number they see here. Its GRAND TOTAL is the same figure
// the issued sheet prints as its subtotal — overhead and profit are
// distributed across the lines rather than appended as rows a homeowner would
// never be shown. See the header of manual-spec-math.ts.
//
// Fixture-only: "Save these as company defaults" answers in the column and
// writes nothing.

import type { ReactNode } from "react";
import type { Markups, Totals } from "./manual-spec-types";
import { money, pct1 } from "./manual-spec-math";
import { Affix, Row, cx } from "./spec-frame";
import styles from "./manual-spec.module.css";

/** The four rates, in the live builder's order, with its captions and ceilings. */
const RATES: {
  key: keyof Markups;
  label: string;
  caption: string;
  max: number;
}[] = [
  { key: "materialMarkupPct", label: "Materials", caption: "markup over base", max: 100 },
  { key: "laborMarkupPct", label: "Labor", caption: "markup over base", max: 100 },
  { key: "overheadPct", label: "Overhead", caption: "of subtotal", max: 50 },
  { key: "profitPct", label: "Profit", caption: "of cost + overhead", max: 50 },
];

export function EstimateRates({
  markups,
  totals,
  onChange,
}: {
  markups: Markups;
  totals: Totals;
  onChange: (patch: Partial<Markups>) => void;
}) {
  // What each rate is taken OVER, and what it adds — the two figures that
  // make a percentage mean something.
  const over: Record<keyof Markups, number> = {
    materialMarkupPct: totals.baseMaterials,
    laborMarkupPct: totals.baseLabor,
    overheadPct: totals.estimateSubtotal,
    profitPct: totals.estimateSubtotal + totals.overhead,
  };
  const adds: Record<keyof Markups, number> = {
    materialMarkupPct: totals.materialsMarkup,
    laborMarkupPct: totals.laborMarkup,
    overheadPct: totals.overhead,
    profitPct: totals.profitAllowance,
  };

  return (
    <>
      {RATES.map((rate) => {
        const id = `spec-rate-${rate.key}`;
        const value = markups[rate.key];
        return (
          <Row key={rate.key} label={rate.label} sub={`· ${rate.caption}`} htmlFor={id}>
            <div className={styles.mk}>
              <div className={styles.mkTop}>
                <span className={styles.mkNum}>
                  <Affix post="%">
                    <input
                      id={id}
                      className={cx(styles.in, styles.isNum)}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={rate.max}
                      step="0.5"
                      value={value}
                      onChange={(e) => onChange({ [rate.key]: Number(e.target.value) })}
                    />
                  </Affix>
                </span>
                <span className={styles.mkEcho}>
                  {money(over[rate.key])} base &nbsp;·&nbsp; adds <b>{money(adds[rate.key])}</b>
                </span>
              </div>
              <input
                className={styles.mkRange}
                type="range"
                min={0}
                max={rate.max}
                step={0.5}
                value={value}
                aria-label={`${rate.label} ${rate.caption}, percent`}
                onChange={(e) => onChange({ [rate.key]: Number(e.target.value) })}
              />
            </div>
          </Row>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   THE LEDGER
   ───────────────────────────────────────────────────────────── */

export function EstimateLedger({
  markups,
  totals,
  laborOnly,
  onSaveDefaults,
}: {
  markups: Markups;
  totals: Totals;
  laborOnly: boolean;
  onSaveDefaults: () => void;
}) {
  return (
    <Row label="Estimate">
      <div className={styles.ledger}>
        <LedRow label="Base · materials" value={money(totals.baseMaterials)} base>
          {laborOnly && (
            <span className={cx(styles.tag, styles.isWarn)}>Suppressed · labor-only issue</span>
          )}
        </LedRow>
        <LedRow label="Base · labor" value={money(totals.baseLabor)} base />
        <LedRow
          label={`+ Materials markup (${pct1(markups.materialMarkupPct)})`}
          value={money(totals.materialsMarkup)}
        />
        <LedRow
          label={`+ Labor markup (${pct1(markups.laborMarkupPct)})`}
          value={money(totals.laborMarkup)}
        />
        <LedRow label="Subtotal" value={money(totals.estimateSubtotal)} rule />
        <LedRow
          label={`+ Overhead (${pct1(markups.overheadPct)})`}
          value={money(totals.overhead)}
        />
        <LedRow
          label={`+ Profit (${pct1(markups.profitPct)})`}
          value={money(totals.profitAllowance)}
        />
        <LedRow label="Grand total" value={money(totals.grandTotal)} grand />

        <div className={styles.ledFoot}>
          <span className={styles.ledFootNote}>
            Grand total is the subtotal printed on SH-09. Tax is added there, on top.
          </span>
          <span
            className={cx(
              styles.tag,
              totals.margin >= 25 ? styles.isOk : totals.margin >= 15 ? styles.isBp : styles.isWarn,
            )}
          >
            Margin · {pct1(totals.margin)}
          </span>
          <button type="button" className={styles.link} onClick={onSaveDefaults}>
            <svg className="ic" aria-hidden="true">
              <use href="#i-pin" />
            </svg>
            Save these as company defaults
          </button>
        </div>
      </div>
    </Row>
  );
}

/** One ledger line. Three weights only — base, running, grand — so the ledger
 *  can be read at a squint. */
function LedRow({
  label,
  value,
  base,
  rule,
  grand,
  children,
}: {
  label: string;
  value: string;
  base?: boolean;
  rule?: boolean;
  grand?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        styles.ledRow,
        base && styles.isBase,
        rule && styles.isRule,
        grand && styles.isGrand,
      )}
    >
      <span className={styles.ledLab}>{label}</span>
      {children}
      <span className={styles.ledLead} aria-hidden="true" />
      <span className={styles.ledVal}>{value}</span>
    </div>
  );
}
