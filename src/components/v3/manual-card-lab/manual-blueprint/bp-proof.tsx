"use client";

// QUIET — card 10, "Their copy".
//
// Read-only, and it looks read-only: this is the one card that is WHITE rather
// than the off-white every form card wears, with a deeper shadow. Two reasons.
// It ends the column with a different note — the answer to "ten equal slabs" —
// and it tells the truth about itself, because a document is paper and a form
// is not. There is not a single control inside it.
//
// Every figure here comes from `computeTotals`, never from a local sum. The
// printed column is what the math module anchors its pre-tax figure to, so
// quantity x unit price equals the amount on every row and the column adds up
// to the subtotal beneath it — the client checks this sheet by hand, so this
// sheet is what the arithmetic is built around.
//
// The line of print settings sits ABOVE the sheet, not inside it. It is a note
// to the contractor about what the client will receive; printing it on the
// client's own copy would be addressing the wrong reader.

import type { ProposalOptions, Totals } from "../manual-focus/manual-focus-types";
import { UNIT_LABEL, money, pct, qty } from "../manual-focus/manual-focus-math";
// The three fixtures this file used to print in its own head — ORG_NAME,
// PROPOSAL_NO, PROPOSAL_DATE — are gone; the sheet is headed by the REAL org
// and the REAL record's reference now. See manual-blueprint-bridge.ts.
import type { SheetIdentity } from "./manual-blueprint-bridge";
import styles from "./manual-blueprint.module.css";
import { cx } from "./bp-ui";

export function TheirCopy({
  identity,
  title,
  clientName,
  address,
  scopeOfWork,
  terms,
  taxPct,
  discountPct,
  options,
  totals,
}: {
  identity: SheetIdentity;
  title: string;
  clientName: string;
  address: string;
  scopeOfWork: string;
  terms: string;
  taxPct: number;
  /** The rate as typed, for the discount row's own label. The AMOUNT comes
   *  from `totals`, like every other figure on this sheet. */
  discountPct: number;
  options: ProposalOptions;
  totals: Totals;
}) {
  const settings = [
    options.laborOnly ? "Summary quote" : "Full quote",
    options.hideBreakdown ? "costs not broken down" : "costs broken down",
    options.showScope ? "scope printed" : "scope withheld",
    options.showSignature ? "signature lines" : "no signature lines",
  ].join(" · ");

  return (
    <>
      <div className={styles.printCaption}>{settings}</div>

      <div>
        <div className={styles.sheetHead}>
          <div>
            <div className={styles.sheetOrg}>{identity.orgName}</div>
            <div className={styles.sheetFor}>
              {clientName || "No client yet"}
              {address ? (
                <>
                  <br />
                  {address}
                </>
              ) : null}
            </div>
          </div>
          <div className={styles.sheetRef}>
            {identity.ref}
            <br />
            {identity.date}
          </div>
        </div>

        <div className={styles.sheetTitle}>{title || "Untitled proposal"}</div>
      </div>

      <div>
        {options.laborOnly ? (
          <div className={cx(styles.printRow, styles.printFirst)}>
            <span className={styles.printName}>Complete scope of work as described</span>
            <span className={styles.printAmt}>{money(totals.preTax)}</span>
          </div>
        ) : totals.printed.length === 0 ? (
          <div className={styles.empty}>No named lines yet — nothing prints.</div>
        ) : (
          totals.printed.map((row, i) => (
            <div key={row.id} className={cx(styles.printRow, i === 0 && styles.printFirst)}>
              <span>
                <span className={styles.printName}>{row.name}</span>
                {row.description ? (
                  <span className={styles.printSub}>{row.description}</span>
                ) : null}
                {!options.hideBreakdown ? (
                  <span className={styles.printSub}>
                    {qty(row.quantity)} {UNIT_LABEL[row.unit]} · {money(row.unitPrice)} each
                  </span>
                ) : null}
              </span>
              <span className={styles.printAmt}>{money(row.amount)}</span>
            </div>
          ))
        )}
      </div>

      <div>
        <div className={styles.sumRow}>
          <span className={styles.sumLabel}>Subtotal</span>
          <span className={styles.sumValue}>{money(totals.preTax)}</span>
        </div>
        {/* The discount was missing from this column, and with it the sheet no
            longer added up: subtotal + tax did not reach the total the client
            was asked to pay. It prints between the two figures it sits between
            in the arithmetic, and only when there is one. */}
        {totals.discountAmount > 0 ? (
          <div className={styles.sumRow}>
            <span className={styles.sumLabel}>
              Discount{discountPct > 0 ? ` · ${pct(discountPct)}` : ""}
            </span>
            <span className={styles.sumValue}>−{money(totals.discountAmount)}</span>
          </div>
        ) : null}
        <div className={styles.sumRow}>
          <span className={styles.sumLabel}>Tax · {pct(taxPct)}</span>
          <span className={styles.sumValue}>{money(totals.tax)}</span>
        </div>
        <div className={cx(styles.sumRow, styles.sumTotal)}>
          <span className={styles.sumTotalLabel}>Total</span>
          <span className={styles.sumTotalValue}>{money(totals.total)}</span>
        </div>
      </div>

      {options.showScope && scopeOfWork.trim() ? (
        <div>
          <div className={styles.subHead}>Scope of work</div>
          <div className={styles.sheetProse}>{scopeOfWork}</div>
        </div>
      ) : null}

      {terms.trim() ? (
        <div>
          <div className={styles.subHead}>Terms</div>
          <div className={styles.sheetProse}>{terms}</div>
        </div>
      ) : null}

      {options.showSignature ? (
        <div className={styles.signRow}>
          <div className={styles.signLine}>Client signature</div>
          <div className={styles.signLine}>Date</div>
        </div>
      ) : null}
    </>
  );
}
