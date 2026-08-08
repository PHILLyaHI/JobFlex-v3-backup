"use client";

// SPEC SHEET — SH-09, the issued sheet. Route /dashboard/manual-spec.
//
// THE CLIENT'S COPY IS A DIFFERENT VOICE, so it is drawn in a different
// grammar on purpose. Everything above it is a two-track worksheet: mono label
// gutter, values typed onto rules, one vertical construction line. This sheet
// has none of that. No gutter, no rules, no field names — graph paper, an
// inverse ink bar across the top that names it, and a printed document
// underneath. A reader can never be in doubt about which of the two documents
// they are looking at, which is the whole reason the boundary is drawn this
// hard.
//
// It lives at the FOOT of the column rather than in a pane, because this
// variant has exactly one column and because "what the client sees" is the
// last thing you read before you send. Every one of SH-08's four switches
// changes what is printed here, and each of them says so on its own row.
//
// Fixture-only: this renders the draft held in manual-spec-content.tsx.

import type { SpecDraft, Totals } from "./manual-spec-types";
import {
  ISSUE_DATE,
  DRAWING_NO,
  ORG_LINE,
  ORG_NAME,
  REVISION,
  VALID_DAYS,
} from "./manual-spec-data";
import { UNIT_LABEL, installmentValue, money, pct, qtyText } from "./manual-spec-math";
import { cx } from "./spec-frame";
import styles from "./manual-spec.module.css";

export function IssuedSheet({
  draft,
  totals,
  /** Resolved from the client record, the free-text name, or nothing. */
  clientName,
  clientLines,
}: {
  draft: SpecDraft;
  totals: Totals;
  clientName: string;
  clientLines: string[];
}) {
  const lean = draft.options.hideBreakdownCosts;

  /* A blank row has no business on a document a homeowner signs, so a line is
     printed only once it has a name or a price. That is also what keeps the
     seeded unnamed line visible as a partial state on SH-02 and absent here,
     rather than printing an empty row on the client's copy. */
  const printed = draft.lines
    .map((line, i) => ({ line, fig: totals.perLine[i] }))
    .filter(({ line, fig }) => line.name.trim().length > 0 || fig.amount > 0);

  return (
    <>
      <div className={styles.isBar}>
        <svg className="ic" aria-hidden="true">
          <use href="#i-ext" />
        </svg>
        <span className={styles.isBarLab}>What the client sees</span>
        <span className={styles.isBarSub}>
          Rev {REVISION} · {DRAWING_NO} · issued {ISSUE_DATE}
        </span>
      </div>

      <div className={styles.isSheet}>
        {/* ── Head ─────────────────────────────────────────── */}
        <div className={styles.isTop}>
          <div>
            <div className={styles.isKick}>Proposal</div>
            <h3 className={cx(styles.isTitle, !draft.title.trim() && styles.isNil)}>
              {draft.title.trim() || "Untitled proposal"}
            </h3>
            <p className={styles.isFor}>
              Prepared for {clientName || "—"}
              {clientLines.map((line, i) => (
                <span key={`${i}-${line}`}>
                  <br />
                  {line}
                </span>
              ))}
              <br />
              Valid for {VALID_DAYS} days from {ISSUE_DATE}
            </p>
          </div>

          <div className={styles.isFrom}>
            <div className={styles.isKick}>From</div>
            <div className={styles.isOrg}>{ORG_NAME}</div>
            <p className={styles.isFor}>{ORG_LINE}</p>
            {draft.options.laborOnly && <span className={styles.isStamp}>Labor only</span>}
          </div>
        </div>

        {draft.description.trim() && <p className={styles.isDesc}>{draft.description}</p>}

        {/* ── The priced table ─────────────────────────────── */}
        <div className={styles.isTable}>
          <div className={cx(styles.isColHead, lean && styles.isLean)}>
            <span aria-hidden="true" />
            <span>Item</span>
            {!lean && <span className={styles.thNum}>Qty</span>}
            {!lean && <span className={styles.thNum}>Unit</span>}
            <span className={styles.thNum}>Total</span>
          </div>

          {printed.length === 0 ? (
            <p className={styles.empty}>
              <b>No lines</b>
              Add line items above to see them here.
            </p>
          ) : (
            printed.map(({ line, fig }, i) => (
              <div className={cx(styles.isLine, lean && styles.isLean)} key={line.id}>
                <span className={styles.isNo}>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className={cx(styles.isItemName, !line.name.trim() && styles.isNil)}>
                    {line.name.trim() || "Untitled line"}
                  </span>
                  {line.description.trim() && (
                    <span className={styles.isSub}>{line.description}</span>
                  )}
                </span>
                {!lean && (
                  <span className={styles.isQty}>
                    {qtyText(line.quantity)} {UNIT_LABEL[line.unit]}
                  </span>
                )}
                {!lean && <span className={styles.isRate}>{money(fig.unitSell)}</span>}
                <span className={styles.isAmt}>{money(fig.amount)}</span>
              </div>
            ))
          )}
        </div>

        {/* ── Totals ───────────────────────────────────────── */}
        <div className={styles.isTotals}>
          <div className={styles.isTotRow}>
            <span className={styles.isTotLab}>Subtotal</span>
            <span className={styles.isTotVal}>{money(totals.grandTotal)}</span>
          </div>
          <div className={styles.isTotRow}>
            <span className={styles.isTotLab}>Tax · {pct(draft.taxPct)}</span>
            <span className={styles.isTotVal}>{money(totals.tax)}</span>
          </div>
          <div className={cx(styles.isTotRow, styles.isGrandRow)}>
            <span className={styles.isTotLab}>Total</span>
            <span className={styles.isTotVal}>{money(totals.total)}</span>
          </div>
        </div>

        {/* ── Payment schedule ─────────────────────────────── */}
        <div className={styles.isSec}>
          <div className={styles.isSecLab}>Payment schedule</div>
          {draft.installments.length === 0 ? (
            <p className={styles.isMissing}>Balance due in full on completion.</p>
          ) : (
            draft.installments.map((inst, i) => (
              <div className={styles.isPayRow} key={inst.id}>
                <span className={styles.isNo}>{String(i + 1).padStart(2, "0")}</span>
                <span className={cx(styles.isPayLab, !inst.label.trim() && styles.isNil)}>
                  {inst.label.trim() || "Unnamed draw"}
                </span>
                <span className={styles.isPayShare}>
                  {inst.isPercent ? `${pct(inst.amount)} of total` : "fixed"}
                </span>
                <span className={styles.isPayAmt}>
                  {money(installmentValue(inst, totals.total))}
                </span>
              </div>
            ))
          )}
        </div>

        {/* ── Scope of work — SH-08 decides whether this prints ── */}
        {draft.options.showScopeOfWork && (
          <div className={styles.isSec}>
            <div className={styles.isSecLab}>Scope of work</div>
            {draft.scopeOfWork.trim() ? (
              <p className={styles.isBody}>{draft.scopeOfWork}</p>
            ) : (
              <p className={styles.isMissing}>
                Nothing written yet — SH-04 is where this comes from.
              </p>
            )}
          </div>
        )}

        {draft.notes.trim() && (
          <div className={styles.isSec}>
            <div className={styles.isSecLab}>Notes</div>
            <p className={styles.isBody}>{draft.notes}</p>
          </div>
        )}

        {draft.terms.trim() && (
          <div className={styles.isSec}>
            <div className={styles.isSecLab}>Terms &amp; conditions</div>
            <p className={styles.isBody}>{draft.terms}</p>
          </div>
        )}

        {/* ── Signature blocks — SH-08 again ───────────────── */}
        {draft.options.showSignatureLines && (
          <div className={styles.sigRow}>
            <div className={styles.sigBox}>
              <span className={styles.sigLine} aria-hidden="true" />
              <span className={styles.sigLab}>Client signature · date</span>
            </div>
            <div className={styles.sigBox}>
              <span className={styles.sigLine} aria-hidden="true" />
              <span className={styles.sigLab}>{ORG_NAME} · date</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
