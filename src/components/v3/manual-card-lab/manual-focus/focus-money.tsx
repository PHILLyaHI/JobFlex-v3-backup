"use client";

// FOCUS CARD — card 04, markup and margin (route: /dashboard/manual-focus).
//
// Four draggable controls and one ledger. Each control is a range input AND a
// typed number, because a contractor setting 18% wants the handle and a
// contractor matching a competitor's 17.5% wants the keyboard; a slider alone
// makes the second person fight the widget, and a number alone throws away the
// only control on the page where dragging is genuinely the better verb.
//
// CONSEQUENCE IN PLACE. Every slider prints, right beside itself, what it is
// actually adding in dollars — "+ $402.19 on $2,234.40 of base labor". A
// percentage on its own asks the user to trust it; a dollar figure is the thing
// they are actually deciding. The grand total in the sticky strip flashes at
// the same time, so the consequence lands twice without a scroll.
//
// THE LEDGER reads top to bottom in the same order the money is computed, and
// its Grand total is the SAME number the client's copy prints as its Subtotal —
// they both come out of `computeTotals`, so they cannot disagree. The note
// under it is the one place the workspace says out loud where overhead and
// profit went: into the per-unit prices on the sheet, never onto it as their
// own lines. The client is quoted a price, not shown a margin.
//
// FIXTURE-ONLY. "Save these as company defaults" writes nothing — there is no
// data layer on this page — and answers in the column so the honesty is
// visible rather than implied.

import type { Totals } from "./manual-focus-types";
import { money, pct1 } from "./manual-focus-math";
import { Ic, LinkBtn, NumIn, cx } from "./focus-ui";
import styles from "./manual-focus.module.css";

/* ============================================================
   ONE MARKUP CONTROL
   ============================================================ */

function MarkupControl({
  id,
  label,
  caption,
  value,
  max,
  onChange,
  base,
  added,
}: {
  id: string;
  label: string;
  /** "markup over base" / "of subtotal" / "of cost + overhead". */
  caption: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** What this percentage is applied TO. */
  base: number;
  /** What it adds, in dollars. */
  added: number;
}) {
  return (
    <div className={styles.mk}>
      <div className={styles.mkHead}>
        <label className={styles.mkLab} htmlFor={`${id}-num`}>
          {label}
        </label>
        <span className={styles.mkCap}>{caption}</span>
        <span className={styles.mkNum}>
          <NumIn
            id={`${id}-num`}
            value={value}
            onChange={onChange}
            min={0}
            max={max}
            step="0.5"
            ariaLabel={`${label} percentage`}
          />
          <span aria-hidden="true">%</span>
        </span>
      </div>

      <input
        type="range"
        className={styles.rng}
        min={0}
        max={max}
        step={0.5}
        value={value}
        aria-label={`${label} percentage slider`}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <p className={styles.mkEcho}>
        {added > 0 ? `+ ${money(added)}` : money(0)}
        <span> on {money(base)} of base</span>
      </p>
    </div>
  );
}

/* ============================================================
   THE CARD BODY
   ============================================================ */

export function MoneyBlock({
  materialMarkupPct,
  laborMarkupPct,
  overheadPct,
  profitPct,
  totals,
  onMarkup,
  onSaveDefaults,
}: {
  materialMarkupPct: number;
  laborMarkupPct: number;
  overheadPct: number;
  profitPct: number;
  totals: Totals;
  onMarkup: (patch: {
    materialMarkupPct?: number;
    laborMarkupPct?: number;
    overheadPct?: number;
    profitPct?: number;
  }) => void;
  onSaveDefaults: () => void;
}) {
  // Margin is a genuine STATUS of the job — the one thing on this card that
  // earns a status colour. Thresholds match the live builder's badge.
  const marginTone =
    totals.margin >= 25 ? "isOk" : totals.margin >= 15 ? "isMid" : "isLow";

  return (
    <div className={styles.stack}>
      <div className={styles.marginRow}>
        <span className={cx(styles.marginTag, styles[marginTone])}>
          Margin · {pct1(totals.margin)}
        </span>
        <span className={styles.marginEcho}>
          {money(totals.baseTotal)} of cost carried at {money(totals.preTax)} before tax
        </span>
      </div>

      <div className={styles.mkGrid}>
        <MarkupControl
          id="mc-mk-mat"
          label="Materials"
          caption="markup over base"
          value={materialMarkupPct}
          max={100}
          onChange={(v) => onMarkup({ materialMarkupPct: v })}
          base={totals.baseMaterials}
          added={totals.materialsMarkup}
        />
        <MarkupControl
          id="mc-mk-lab"
          label="Labor"
          caption="markup over base"
          value={laborMarkupPct}
          max={100}
          onChange={(v) => onMarkup({ laborMarkupPct: v })}
          base={totals.baseLabor}
          added={totals.laborMarkup}
        />
        <MarkupControl
          id="mc-mk-oh"
          label="Overhead"
          caption="of subtotal"
          value={overheadPct}
          max={50}
          onChange={(v) => onMarkup({ overheadPct: v })}
          base={totals.subtotalCosts}
          added={totals.overheadAmount}
        />
        <MarkupControl
          id="mc-mk-pr"
          label="Profit"
          caption="of cost + overhead"
          value={profitPct}
          max={50}
          onChange={(v) => onMarkup({ profitPct: v })}
          base={totals.subtotalWithOverhead}
          added={totals.profitAmount}
        />
      </div>

      {/* ── THE ESTIMATE LEDGER ─────────────────────────────── */}
      <div className={styles.ledger}>
        <div className={styles.ledHead}>Estimate</div>

        <LedRow label="Base · materials" value={money(totals.baseMaterials)} muted />
        <LedRow label="Base · labor" value={money(totals.baseLabor)} muted />
        <LedRow
          label={`+ Materials markup (${pct1(materialMarkupPct)})`}
          value={money(totals.materialsMarkup)}
        />
        <LedRow
          label={`+ Labor markup (${pct1(laborMarkupPct)})`}
          value={money(totals.laborMarkup)}
        />
        <LedRow label="Subtotal" value={money(totals.subtotalCosts)} strong />
        <LedRow label={`+ Overhead (${pct1(overheadPct)})`} value={money(totals.overheadAmount)} />
        <LedRow label={`+ Profit (${pct1(profitPct)})`} value={money(totals.profitAmount)} />
        <LedRow label="Grand total" value={money(totals.preTax)} grand />
      </div>

      {/* The note carries the one thing the rows cannot say for themselves: the
          Grand total is the sum of the PRINTED lines, not of the three rows
          above it. Overhead and profit are quantised into per-unit prices to get
          there, so at a non-zero rate this row can sit a few dollars off the
          rows it follows — the alternative was a printed line on the client's
          copy where unit price x quantity did not equal the line total, and
          that document is the one that gets checked by hand. */}
      <p className={styles.ledNote}>
        Overhead and profit ride inside the per-unit prices on the client&rsquo;s copy — the
        client is quoted a price, never shown a margin. Because those prices are quoted in
        whole cents, the grand total is the sum of the printed lines and can sit a few
        dollars off the three rows above it. Tax is added on top of this figure in the
        strip at the top of the page.
      </p>

      <div className={styles.saveDefaults}>
        <LinkBtn icon="pin" onClick={onSaveDefaults}>
          Save these as company defaults
        </LinkBtn>
        <span className={styles.saveDefaultsNote}>
          <Ic name="ban" />
          Lab page — nothing is written.
        </span>
      </div>
    </div>
  );
}

/** One ledger row. Module scope, like everything else that renders inside a
 *  list: a nested declaration is a new element type on every keystroke. */
function LedRow({
  label,
  value,
  muted,
  strong,
  grand,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  grand?: boolean;
}) {
  return (
    <div className={cx(styles.ledRow, grand && styles.isGrand)}>
      <span className={cx(styles.ledLab, muted && styles.isMuted)}>{label}</span>
      <i className={styles.ledLead} aria-hidden="true" />
      <span className={cx(styles.ledVal, strong && styles.isStrong)}>{value}</span>
    </div>
  );
}
