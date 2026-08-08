"use client";

// PRICE FIRST — CARD 01, the price. (route: /dashboard/manual-margin)
//
// THE BET, CONCENTRATED HERE
// A contractor does not build a scope and discover a price. They are told a
// number — by the homeowner's budget, by the insurance scope, by the job they
// lost last month — and they reconcile the work against it. So this card is
// first, it is the only card drawn as an instrument, and it holds, in order:
//
//   · the TARGET, as the biggest editable numeral on the page;
//   · the live CONTRACT TOTAL, on an inverse ink strip directly beneath it,
//     so "what I want" and "what I have" can never be misread as one figure;
//   · the RECONCILIATION line — target · current · short — plus a gap bar;
//   · the honest SOLVE: the exact profit percentage that would land on the
//     target, computed on every render and applied only on a press;
//   · the four MARKUP CONTROLS, each with a dollar echo of what it adds;
//   · the TAX rate, which the live builder files under line items and which
//     belongs here because it is a price control;
//   · the ESTIMATE LEDGER, the live builder's eight rows in its order, plus
//     tax and the contract total the client's copy prints;
//   · the COMPOSITION BAR — the five mutually exclusive bands the contract
//     total is made of, which is what licenses every other card's
//     contribution percentage.
//
// Every control in here moves the number visibly, in place. Nothing in here
// changes anything without being pressed or dragged.
//
// Fixture-only: no store, no server action, no network.

import { useState } from "react";
import type {
  Composition,
  MarginDraft,
  Markups,
  ProfitSolve,
  Reconciliation,
  Totals,
} from "./manual-margin-types";
import {
  LOAD_MAX,
  MARKUP_MAX,
  money,
  money0,
  pct,
  pct1,
  share,
} from "./manual-margin-math";
import { STATE_NAMES } from "./manual-margin-data";
import { Ic, NumInput, cx } from "./margin-card";
import styles from "./manual-margin.module.css";

/** The four controls, in the live builder's order and wording. `of` is the
 *  base each one is taken from — printed, so nobody has to guess. */
const CONTROLS: {
  key: keyof Markups;
  name: string;
  caption: string;
  max: number;
}[] = [
  { key: "materialMarkupPct", name: "Materials", caption: "markup over base", max: MARKUP_MAX },
  { key: "laborMarkupPct", name: "Labor", caption: "markup over base", max: MARKUP_MAX },
  { key: "overheadPct", name: "Overhead", caption: "of subtotal", max: LOAD_MAX },
  { key: "profitPct", name: "Profit", caption: "of cost + overhead", max: LOAD_MAX },
];

/** One markup control: a slider, the same number typeable, and an echo saying
 *  what the percentage actually ADDS. Module scope — see margin-card.tsx. */
function MarkupControl({
  name,
  caption,
  max,
  value,
  base,
  added,
  onChange,
}: {
  name: string;
  caption: string;
  max: number;
  value: number;
  /** What the percentage is taken from, in dollars. */
  base: number;
  /** What it puts on the sheet, in dollars. */
  added: number;
  onChange: (n: number) => void;
}) {
  const id = `mc-mk-${name.toLowerCase()}`;

  return (
    <div className={styles.mk}>
      <div className={styles.mkTop}>
        <span className={styles.mkName}>{name}</span>
        <span className={styles.mkCap}>{caption}</span>
        <span className={cx(styles.mkVal, styles.pctIn)}>
          <NumInput
            className={styles.in}
            id={id}
            ariaLabel={`${name} — ${caption}, percent`}
            value={value}
            min={0}
            max={max}
            step={0.5}
            onChange={onChange}
          />
          <span aria-hidden="true">%</span>
        </span>
      </div>

      <input
        type="range"
        className={styles.range}
        min={0}
        max={max}
        step={0.5}
        value={Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0))}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        aria-label={`${name} slider — ${caption}`}
        aria-describedby={`${id}-echo`}
      />

      <p className={styles.mkEcho} id={`${id}-echo`}>
        <b>+{money(added)}</b>
        <span>on a base of {money(base)}</span>
      </p>
    </div>
  );
}

/** One ledger row. */
function Led({
  label,
  value,
  zero,
  rule,
}: {
  label: string;
  value: string;
  zero?: boolean;
  rule?: boolean;
}) {
  return (
    <div className={cx(styles.ledRow, zero && styles.isZero, rule && styles.isRule)}>
      <span className={styles.ledLab}>{label}</span>
      <span className={styles.ledLead} aria-hidden="true" />
      <span className={styles.ledVal}>{value}</span>
    </div>
  );
}

export function PriceCard({
  draft,
  totals,
  comp,
  recon,
  solve,
  onTarget,
  onMarkup,
  onTax,
  onRestoreTaxEstimate,
  onApplySolve,
  onSaveDefaults,
}: {
  draft: MarginDraft;
  totals: Totals;
  comp: Composition;
  recon: Reconciliation;
  solve: ProfitSolve;
  onTarget: (n: number | null) => void;
  onMarkup: (patch: Partial<Markups>) => void;
  onTax: (n: number) => void;
  onRestoreTaxEstimate: () => void;
  onApplySolve: (profitPct: number) => void;
  onSaveDefaults: () => void;
}) {
  // The target field buffers its own text while focused, like every other
  // number field on the page — but its EMPTY state means "no target", not
  // zero, so it cannot share NumInput.
  const [targetBuf, setTargetBuf] = useState<string | null>(null);
  const targetText =
    targetBuf ?? (draft.targetTotal === null ? "" : String(draft.targetTotal));

  const marginTone =
    totals.grandTotal <= 0 ? "flat" : totals.margin >= 25 ? "ok" : totals.margin >= 15 ? "flat" : "warn";

  // The gap bar reads "how far along the way to the target am I" and is capped
  // at 100 so an over-target sheet does not silently overflow its own frame.
  // With no target there is no way along anything, so the bar does not draw at
  // all — a full bar would read as "done", which is a claim nobody made.
  const progress =
    recon.kind === "none" || recon.target <= 0
      ? null
      : Math.min(100, Math.max(0, (totals.contractTotal / recon.target) * 100));

  const bands: { key: string; label: string; amount: number; seg: string }[] = [
    { key: "cost", label: "Cost", amount: comp.cost, seg: styles.segCost },
    { key: "markup", label: "Markup", amount: comp.markup, seg: styles.segMarkup },
    { key: "overhead", label: "Overhead", amount: comp.overhead, seg: styles.segOverhead },
    { key: "profit", label: "Profit", amount: comp.profit, seg: styles.segProfit },
    { key: "tax", label: "Tax", amount: comp.tax, seg: styles.segTax },
  ];

  const estimatedFrom = draft.taxState ? STATE_NAMES[draft.taxState] ?? draft.taxState : null;

  return (
    <section
      id="mc-price"
      className={cx(styles.priceCard, styles.col)}
      aria-labelledby="mc-price-title"
    >
      <header className={cx(styles.cardHead, styles.priceHead)}>
        <span className={styles.cardNum} aria-hidden="true">
          01
        </span>
        <div className={styles.cardCopy}>
          <h2 className={styles.cardTitle} id="mc-price-title">
            <span className={styles.srOnly}>Card 01: </span>
            The price
          </h2>
          <p className={styles.cardSum}>
            {money(totals.contractTotal)} contract · {money(totals.grandTotal)} before tax ·{" "}
            {money(totals.baseCost)} cost
          </p>
        </div>
        <span
          className={cx(
            styles.effect,
            marginTone === "ok" && styles.effectOk,
            marginTone === "warn" && styles.effectWarn,
          )}
        >
          <b>{totals.margin.toFixed(1)}%</b>
          margin
        </span>
      </header>

      <div className={styles.priceBody}>
        {/* ── The target and the live figure ───────────────────────── */}
        <div className={cx(styles.targetBox, draft.targetTotal !== null && styles.hasTarget)}>
          <div className={styles.targetTop}>
            <span className={styles.targetLabWrap}>
              <span className={styles.targetLab}>Target</span>
              <span className={styles.targetSub}>contract · tax in</span>
            </span>
            <span className={styles.targetFieldWrap}>
              <span aria-hidden="true">$</span>
              <input
                type="number"
                inputMode="decimal"
                id="mc-target"
                className={styles.targetIn}
                placeholder="—"
                min={0}
                step={100}
                aria-label="Target contract total, tax included"
                aria-describedby="mc-recon"
                value={targetText}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTargetBuf(raw);
                  if (raw.trim() === "") {
                    onTarget(null);
                    return;
                  }
                  const n = Number.parseFloat(raw);
                  onTarget(Number.isFinite(n) ? n : null);
                }}
                onBlur={() => setTargetBuf(null)}
              />
            </span>
            {draft.targetTotal !== null && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => {
                  setTargetBuf(null);
                  onTarget(null);
                }}
              >
                <Ic id="i-x" />
                <span className={styles.srOnly}>Clear the target</span>
              </button>
            )}
          </div>

          <div className={styles.liveStrip}>
            <span className={styles.liveLab}>Contract total</span>
            <span className={styles.liveLead} aria-hidden="true" />
            <span className={styles.liveNum}>{money(totals.contractTotal)}</span>
          </div>
        </div>

        {/* The reconciliation. aria-live so a screen reader hears the number
            move when a slider is dragged, rather than having to hunt for it. */}
        <p
          id="mc-recon"
          className={cx(
            styles.recon,
            recon.kind === "short" && styles.isShort,
            recon.kind === "over" && styles.isOver,
            recon.kind === "onTarget" && styles.isOn,
          )}
          aria-live="polite"
        >
          {recon.kind === "none" ? (
            <>
              <span className={styles.reconLab}>no target set</span>
              <span className={styles.reconTick} aria-hidden="true" />
              <span>
                current {money(totals.contractTotal)} · margin {totals.margin.toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className={styles.reconLab}>target</span>
              <span>{money(recon.target)}</span>
              <span className={styles.reconTick} aria-hidden="true" />
              <span className={styles.reconLab}>current</span>
              <span>{money(totals.contractTotal)}</span>
              <span className={styles.reconTick} aria-hidden="true" />
              <span className={styles.reconLab}>
                {recon.kind === "short" ? "short" : recon.kind === "over" ? "over by" : "status"}
              </span>
              <span className={styles.reconGap}>
                {recon.kind === "onTarget" ? "on target" : money(recon.gap)}
              </span>
            </>
          )}
        </p>

        {progress !== null && (
          <div
            className={cx(
              styles.gapBar,
              recon.kind === "over" && styles.isOver,
              recon.kind === "onTarget" && styles.isOn,
            )}
            aria-hidden="true"
          >
            <span className={styles.gapFill} style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* ── The honest solve ─────────────────────────────────────── */}
        <div className={cx(styles.solve, solve.kind !== "ready" && styles.isMute)}>
          <div className={styles.solveCopy}>
            <span className={styles.solveLab}>Reach it by profit</span>
            {solve.kind === "ready" && (
              <p className={styles.solveTxt}>
                Profit at <b>{pct1(solve.profitPct)}</b> lands this job on{" "}
                <b>{money(recon.kind === "none" ? totals.contractTotal : recon.target)}</b>. Nothing
                else moves.
              </p>
            )}
            {solve.kind === "outOfRange" && (
              <p className={styles.solveTxt}>
                It would take <b>{pct1(solve.profitPct)}</b> profit to get there — past this
                control&rsquo;s {solve.max}% range. Cut cost, raise the markups, or move the target.
              </p>
            )}
            {solve.kind === "unavailable" && <p className={styles.solveTxt}>{solve.reason}</p>}
            <p className={styles.solveNote}>
              Suggestion · computed live · nothing changes until you apply it
            </p>
          </div>
          <button
            type="button"
            className={cx(styles.act, styles.actPrimary)}
            disabled={solve.kind !== "ready"}
            onClick={() => {
              if (solve.kind === "ready") onApplySolve(solve.profitPct);
            }}
          >
            <Ic id="i-target" />
            Apply
          </button>
        </div>

        {/* ── The four controls ────────────────────────────────────── */}
        <div className={styles.mkWrap}>
          <div className={styles.mkHead}>
            <span>Markup · drag or type</span>
            <span>what it adds</span>
          </div>

          {CONTROLS.map((c) => {
            const value = draft.markups[c.key];
            const base =
              c.key === "materialMarkupPct"
                ? totals.baseMaterials
                : c.key === "laborMarkupPct"
                  ? totals.baseLabor
                  : c.key === "overheadPct"
                    ? totals.subtotalCosts
                    : totals.subtotalWithOverhead;
            const added =
              c.key === "materialMarkupPct"
                ? totals.materialMarkupAdded
                : c.key === "laborMarkupPct"
                  ? totals.laborMarkupAdded
                  : c.key === "overheadPct"
                    ? totals.overheadAmount
                    : totals.profitAmount;

            return (
              <MarkupControl
                key={c.key}
                name={c.name}
                caption={c.caption}
                max={c.max}
                value={value}
                base={base}
                added={added}
                onChange={(n) => onMarkup({ [c.key]: n } as Partial<Markups>)}
              />
            );
          })}

          <div className={styles.mkFoot}>
            <span className={styles.ann}>These four are the whole margin</span>
            <button type="button" className={styles.link} onClick={onSaveDefaults}>
              <Ic id="i-check" />
              Save these as company defaults
            </button>
          </div>
        </div>

        {/* ── Tax ──────────────────────────────────────────────────── */}
        <div className={styles.taxRow}>
          <div className={cx(styles.field, styles.taxField)}>
            <label className={styles.lab} htmlFor="mc-tax">
              Tax rate
            </label>
            <span className={styles.pctIn}>
              <NumInput
                className={styles.in}
                id="mc-tax"
                value={draft.taxPct}
                min={0}
                max={25}
                step={0.01}
                onChange={onTax}
              />
              <span aria-hidden="true">%</span>
            </span>
          </div>
          <div className={styles.taxSide}>
            <span className={cx(styles.prov, draft.taxAuto && styles.isAuto)}>
              {draft.taxAuto && estimatedFrom
                ? `Estimated from ${estimatedFrom} · ${pct(draft.taxPct)}`
                : `Set by hand · ${pct(draft.taxPct)}`}
            </span>
            <p className={cx(styles.hint, styles.gapTop)}>
              Type 7.5 for 7.5%. The estimate comes from the job address; once you type a rate
              yourself, changing the address never overwrites it.
              {!draft.taxAuto && estimatedFrom && (
                <>
                  {" "}
                  <button type="button" className={styles.link} onClick={onRestoreTaxEstimate}>
                    <Ic id="i-undo" />
                    Use the {estimatedFrom} estimate
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── The ledger ───────────────────────────────────────────── */}
        <div className={styles.ledger}>
          <Led label="Base · materials" value={money(totals.baseMaterials)} zero={totals.baseMaterials === 0} />
          <Led label="Base · labor" value={money(totals.baseLabor)} zero={totals.baseLabor === 0} />
          <Led
            label={`+ Materials markup (${pct1(draft.markups.materialMarkupPct)})`}
            value={money(totals.materialMarkupAdded)}
            zero={totals.materialMarkupAdded === 0}
          />
          <Led
            label={`+ Labor markup (${pct1(draft.markups.laborMarkupPct)})`}
            value={money(totals.laborMarkupAdded)}
            zero={totals.laborMarkupAdded === 0}
          />
          <Led label="Subtotal" value={money(totals.subtotalCosts)} rule />
          <Led
            label={`+ Overhead (${pct1(draft.markups.overheadPct)})`}
            value={money(totals.overheadAmount)}
            zero={totals.overheadAmount === 0}
          />
          <Led
            label={`+ Profit (${pct1(draft.markups.profitPct)})`}
            value={money(totals.profitAmount)}
            zero={totals.profitAmount === 0}
          />
          <Led label="Grand total · before tax" value={money(totals.grandTotal)} rule />
          <Led label={`+ Tax (${pct(draft.taxPct)})`} value={money(totals.tax)} zero={totals.tax === 0} />
          <div className={cx(styles.ledRow, styles.ledGrand)}>
            <span className={styles.ledLab}>Contract total</span>
            <span className={styles.ledLead} aria-hidden="true" />
            <span className={styles.ledVal}>{money(totals.contractTotal)}</span>
          </div>
        </div>

        {/* ── Where the number comes from ──────────────────────────── */}
        <div className={styles.comp}>
          {totals.contractTotal > 0 ? (
            <>
              <div className={styles.compBar} aria-hidden="true">
                {bands.map((b) => (
                  <span
                    key={b.key}
                    className={cx(styles.compSeg, b.seg)}
                    style={{ width: `${share(b.amount, totals.contractTotal)}%` }}
                  />
                ))}
              </div>
              <p className={styles.compKeys}>
                {bands.map((b) => (
                  <span className={styles.compKey} key={b.key}>
                    <i className={b.seg} aria-hidden="true" />
                    {b.label} <b>{share(b.amount, totals.contractTotal).toFixed(1)}%</b>
                    <span>· {money0(b.amount)}</span>
                  </span>
                ))}
              </p>
            </>
          ) : (
            <p className={styles.empty}>
              <b>Composition</b>
              Price a line item and this bar shows exactly what the contract total is made of —
              cost, markup, overhead, profit and tax, in that order.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
