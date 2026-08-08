"use client";

// FOCUS CARD — card 10, the client's copy (route: /dashboard/manual-focus).
//
// WHERE THE PREVIEW LIVES, AND WHY
// One column means no side-by-side pane, so "what the client sees" is the LAST
// card — the last thing you read before you send, which is where a finished
// artifact belongs. It is a peer in the promotion system like every other card:
// promote it and the full sheet opens; stand it down and its summary face
// prints a condensed version of the same table (built in the content component,
// row for row, out of the same figures), so the sheet is readable even when it
// is not the live card. That matters more here than anywhere else on the page —
// the four options in card 06 have to visibly change this sheet, and they have
// to do it while card 06 is the live one.
//
// THE BOUNDARY IS DRAWN, NOT IMPLIED (principle 9)
// An inverse ink bar, a hard rule, a graph-paper ground and a different type
// voice — the sheet does not look like the workspace above it, and it says in
// words that everything below the bar is the client's copy. The reader is never
// left wondering which document they are looking at.
//
// WHAT THE FOUR OPTIONS DO HERE
//   hideBreakdown  removes the per-line "material / labor per unit" annotation
//   laborOnly      drops the quantity and unit-price columns and stamps the
//                  sheet LABOR ONLY. It changes what is PRINTED and never the
//                  price: a presentation toggle that silently re-quoted the job
//                  would put a second, different total on the page, and the one
//                  thing this variant cannot afford is two numbers that
//                  disagree.
//   showSignature  adds the two signature blocks at the foot
//   showScope      prints the scope of work
//
// UNNAMED LINES ARE NOT HERE. They are not counted and not printed — see the
// header of ./manual-focus-math.ts. The row in card 03 says so in amber, so
// nothing has silently vanished.
//
// FIXTURE-ONLY. Every value is passed in from component state.

import type { ClientRecord, Draft, Totals } from "./manual-focus-types";
import { UNIT_LABEL, installmentValue, money, pct, qty } from "./manual-focus-math";
import { fullAddress } from "./focus-pickers";
import { cx } from "./focus-ui";
import styles from "./manual-focus.module.css";

export function ProofSheet({
  draft,
  totals,
  client,
  clientName,
  orgName,
  orgLine,
  proposalNo,
  proposalDate,
  validDays,
}: {
  draft: Draft;
  totals: Totals;
  /** The chosen record, when one was chosen. Null for a free-text name. */
  client: ClientRecord | null;
  /** What to print in the "Prepared for" slot, already resolved. */
  clientName: string;
  orgName: string;
  orgLine: string;
  proposalNo: string;
  proposalDate: string;
  validDays: number;
}) {
  const { options } = draft;
  const lean = options.laborOnly;
  const address = client ? fullAddress(client) : draft.address;

  return (
    <div className={styles.proof}>
      {/* ── THE BOUNDARY ─────────────────────────────────────── */}
      <div className={styles.proofBar}>
        <span className={styles.proofBarLab}>What the client sees</span>
        <span className={styles.proofBarSub}>
          Everything below this rule is their copy — not your workspace
        </span>
      </div>

      {/* ── THE SHEET ────────────────────────────────────────── */}
      <div className={styles.proofSheet}>
        <div className={styles.proofHead}>
          <div className={styles.proofHeadL}>
            <div className={styles.proofKick}>
              Proposal № {proposalNo} · {proposalDate} · valid {validDays} days
            </div>
            <h3 className={styles.proofTitle}>{draft.title.trim() || "Untitled proposal"}</h3>
            <div className={styles.proofFor}>
              <span>Prepared for</span>
              <b>{clientName}</b>
              {address && <span>{address}</span>}
              {!address && <span className={styles.proofMissing}>No job address on file</span>}
            </div>
          </div>

          <div className={styles.proofFrom}>
            <div className={styles.proofKick}>From</div>
            <div className={styles.proofOrg}>{orgName}</div>
            <div className={styles.proofOrgLine}>{orgLine}</div>
            {lean && <span className={styles.proofStamp}>Labor only</span>}
          </div>
        </div>

        {draft.description.trim() && <p className={styles.proofDesc}>{draft.description}</p>}

        {/* ── ITEMS ──────────────────────────────────────────── */}
        <div className={styles.proofTable}>
          <div className={cx(styles.proofColHead, lean && styles.isLean)} aria-hidden="true">
            <span>№</span>
            <span>Item</span>
            {!lean && <span className={styles.tr}>Qty</span>}
            {/* "Unit price", not "Unit": this column prints a dollar rate, and
                the Qty column beside it already carries the unit of measure
                ("2,400 sq ft"). A money column headed "Unit" on the one document
                a homeowner actually reads is a column heading that lies. */}
            {!lean && <span className={styles.tr}>Unit price</span>}
            <span className={styles.tr}>Total</span>
          </div>

          {totals.printed.map((l, i) => (
            <div className={cx(styles.proofLine, lean && styles.isLean)} key={l.id}>
              <span className={styles.proofNo}>{String(i + 1).padStart(2, "0")}</span>
              <span>
                <b className={styles.proofName}>{l.name}</b>
                {l.description && <span className={styles.proofSub}>{l.description}</span>}
                {!options.hideBreakdown && !lean && (
                  <span className={styles.proofSplit}>
                    Material {money(l.materialCost)} · Labor {money(l.laborCost)} per{" "}
                    {UNIT_LABEL[l.unit]}
                  </span>
                )}
              </span>
              {!lean && (
                <span className={styles.proofQty}>
                  {qty(l.quantity)} {UNIT_LABEL[l.unit]}
                </span>
              )}
              {!lean && <span className={styles.proofRate}>{money(l.unitPrice)}</span>}
              <span className={styles.proofAmt}>{money(l.amount)}</span>
            </div>
          ))}

          {totals.printed.length === 0 && (
            <p className={styles.proofEmpty}>Add line items above to see them here.</p>
          )}
        </div>

        {/* ── TOTALS ─────────────────────────────────────────── */}
        <div className={styles.proofTotals}>
          <div className={styles.ptRow}>
            <span className={styles.ptLab}>Subtotal</span>
            <span className={styles.ptVal}>{money(totals.preTax)}</span>
          </div>
          {/* Always printed, even at 0% — the client always sees the
              with-tax / without-tax split rather than having to ask. */}
          <div className={styles.ptRow}>
            <span className={styles.ptLab}>Tax · {pct(draft.taxPct)}</span>
            <span className={styles.ptVal}>{money(totals.tax)}</span>
          </div>
          <div className={cx(styles.ptRow, styles.ptGrand)}>
            <span className={styles.ptLab}>Total</span>
            <span className={styles.ptVal}>{money(totals.total)}</span>
          </div>
        </div>

        {/* ── SCOPE ──────────────────────────────────────────── */}
        {options.showScope && (
          <div className={styles.proofSec}>
            <div className={styles.proofSecLab}>Scope of work</div>
            {draft.scopeOfWork.trim() ? (
              <p className={styles.proofBody}>{draft.scopeOfWork}</p>
            ) : (
              <p className={styles.proofMissing}>
                Scope of work is switched on, but nothing has been written yet.
              </p>
            )}
          </div>
        )}

        {/* ── PAYMENT SCHEDULE ───────────────────────────────── */}
        <div className={styles.proofSec}>
          <div className={styles.proofSecLab}>Payment schedule</div>
          {draft.installments.length > 0 ? (
            <div className={styles.proofPay}>
              {draft.installments.map((inst, i) => (
                <div className={styles.proofPayRow} key={inst.id}>
                  <span className={styles.proofNo}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.proofPayLab}>{inst.label.trim() || "Installment"}</span>
                  <span className={styles.proofPayShare}>
                    {inst.isPercent ? pct(inst.amount) : "fixed"}
                  </span>
                  <span className={styles.proofPayAmt}>
                    {money(installmentValue(inst, totals.total))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.proofMissing}>Payable in full on completion.</p>
          )}
        </div>

        {/* ── TERMS ──────────────────────────────────────────── */}
        {draft.terms.trim() && (
          <div className={styles.proofSec}>
            <div className={styles.proofSecLab}>Terms &amp; conditions</div>
            <p className={styles.proofBody}>{draft.terms}</p>
          </div>
        )}

        {/* ── SIGNATURES ─────────────────────────────────────── */}
        {options.showSignature && (
          <div className={styles.sigRow}>
            <div className={styles.sigBox}>
              <span className={styles.sigLine} aria-hidden="true" />
              <span className={styles.sigLab}>Client signature · date</span>
            </div>
            <div className={styles.sigBox}>
              <span className={styles.sigLine} aria-hidden="true" />
              <span className={styles.sigLab}>{orgName} · date</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
