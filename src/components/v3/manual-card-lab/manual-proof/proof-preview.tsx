"use client";

// PROOF CARD — the client's copy (route: /dashboard/manual-proof).
//
// The last card in the column, and the only one that is not your workspace. The
// boundary is drawn explicitly, twice: an inverse ink bar across the top saying
// whose document this is, and graph paper under the sheet itself. Nobody should
// have to wonder which voice they are reading.
//
// Its proof footer is the PROPOSAL TOTAL — the biggest number on the page, and
// the last line of the derivation the eight footers above it have been building
// one card at a time. If you have read the footers you already know this
// number, which is the entire point: the total at the bottom is a confirmation,
// never a reveal.
//
// Everything the four options in card 07 do lands here and only here:
//   hideBreakdown  → the quantity and unit-price columns and the per-unit
//                    split annotation stop printing
//   laborOnly      → the material-only rows are gone (they are gone from the
//                    PRICE too — see the note on ProposalOptions) and the sheet
//                    carries a LABOR ONLY stamp
//   showSignature  → the two signature blocks at the foot
//   showScope      → the scope section

import type { ClientRecord, ProofDraft, Totals } from "./manual-proof-types";
import { ORG_LINE, ORG_NAME, PROPOSAL_DATE, PROPOSAL_NO, VALID_DAYS } from "./manual-proof-data";
import {
  UNIT_LABEL,
  installmentValue,
  isBlank,
  money,
  pct,
  printedTotals,
  qtyLabel,
  sellSplit,
  sellUnit,
} from "./manual-proof-math";
import { clientAddressLine } from "./proof-pickers";
import { cx } from "./proof-card";
import styles from "./manual-proof.module.css";

/** Who the proposal is addressed to, in the client's own terms. */
function addressee(
  draft: ProofDraft,
  clients: ClientRecord[],
): { name: string; lines: string[] } {
  // Narrowed into a local const FIRST. A discriminated union narrowed through a
  // property access (`draft.client.mode === "record"`) loses that narrowing the
  // moment it is read inside a callback — the compiler cannot prove `draft` was
  // not reassigned before the callback ran. A const can never be, so the
  // narrowing survives into `.find()`.
  const choice = draft.client;
  if (choice.mode === "record") {
    const record = clients.find((c) => c.id === choice.id);
    if (record) {
      const postal = clientAddressLine(record);
      return {
        name: record.name,
        lines: [postal, record.email, record.phone].filter((v): v is string => Boolean(v)),
      };
    }
  }
  if (choice.mode === "freeText" && choice.name.trim().length > 0) {
    return { name: choice.name.trim(), lines: [] };
  }
  return { name: "No client yet", lines: [] };
}

export function ProofSheet({
  draft,
  totals,
  clients,
  register,
  foot,
}: {
  draft: ProofDraft;
  totals: Totals;
  clients: ClientRecord[];
  register: (id: string, el: HTMLElement | null) => void;
  /** The final proof footer, supplied by the content component so every money
   *  figure on the page comes out of one computation. */
  foot: React.ReactNode;
}) {
  const to = addressee(draft, clients);
  const lean = draft.options.hideBreakdown;

  // Fully blank rows never print. A NAMED row at $0 does — "included, no
  // charge" is a real thing a contractor writes — and an unnamed row that
  // carries money prints under a fallback name rather than vanishing with the
  // money still in the subtotal.
  const printed = totals.pricedLines.filter((l) => !isBlank(l));

  // The printed amounts, allocated so the column sums to the Subtotal beneath
  // it exactly. See printedTotals().
  const amounts = printedTotals(printed, draft.markups, totals.sellSubtotal);

  const jobAddress = draft.address.trim();

  return (
    <section
      id="proof-client"
      ref={(el) => {
        register("proof-client", el);
      }}
      className={styles.proof}
      aria-labelledby="proof-client-title"
    >
      <header className={styles.proofBar}>
        <span className={styles.proofBarLab} id="proof-client-title">
          What the client sees
        </span>
        <span className={styles.proofBarSub}>Their copy · nothing here is editable</span>
      </header>

      <div className={styles.proofSheet}>
        <div className={styles.proofHead}>
          <div className={styles.proofTo}>
            <div className={styles.proofKick}>Proposal {PROPOSAL_NO}</div>
            <h3 className={styles.proofTitle}>
              {draft.title.trim().length > 0 ? draft.title : "Untitled proposal"}
            </h3>
            <div className={styles.proofFor}>
              <span className={styles.proofForLab}>Prepared for</span>
              <span className={styles.proofForName}>{to.name}</span>
              {to.lines.map((l) => (
                <span key={l}>{l}</span>
              ))}
              {jobAddress.length > 0 && (
                <span className={styles.proofJob}>Job site · {jobAddress}</span>
              )}
            </div>
          </div>

          <div className={styles.proofFrom}>
            <div className={styles.proofKick}>From</div>
            <div className={styles.proofOrg}>{ORG_NAME}</div>
            <div className={styles.proofOrgLine}>{ORG_LINE}</div>
            <div className={styles.proofDates}>
              <span>{PROPOSAL_DATE}</span>
              <span>Valid {VALID_DAYS} days</span>
            </div>
            {draft.options.laborOnly && <div className={styles.proofStamp}>Labor only</div>}
          </div>
        </div>

        {draft.description.trim().length > 0 && (
          <p className={styles.proofDesc}>{draft.description}</p>
        )}

        <div className={styles.proofTable}>
          <div className={cx(styles.proofColHead, lean && styles.isLean)}>
            <span aria-hidden="true" />
            <span>Item</span>
            {!lean && <span className={styles.colRight}>Qty</span>}
            {!lean && <span className={styles.colRight}>Unit</span>}
            <span className={styles.colRight}>Total</span>
          </div>

          {printed.length === 0 ? (
            <p className={styles.proofEmpty}>Add line items above to see them here.</p>
          ) : (
            printed.map((line, i) => {
              // The SELL-side split, never the raw cost — see sellSplit(). The
              // two halves add up to the Unit column beside them.
              const split = sellSplit(line, draft.markups);
              return (
              <div className={cx(styles.proofLine, lean && styles.isLean)} key={line.id}>
                <span className={styles.proofNo}>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className={styles.proofName}>
                    {line.name.trim().length > 0 ? line.name : "Untitled line"}
                  </span>
                  {line.description.trim().length > 0 && (
                    <span className={styles.proofSub}>{line.description}</span>
                  )}
                  {!lean && split.material + split.labor > 0 && (
                    <span className={styles.proofSplit}>
                      {money(split.material)} material · {money(split.labor)} labor per{" "}
                      {UNIT_LABEL[line.unit]}
                    </span>
                  )}
                </span>
                {!lean && <span className={styles.proofQty}>{qtyLabel(line)}</span>}
                {!lean && (
                  <span className={styles.proofRate}>{money(sellUnit(line, draft.markups))}</span>
                )}
                <span className={styles.proofAmt}>{money(amounts.get(line.id) ?? 0)}</span>
              </div>
              );
            })
          )}
        </div>

        <div className={styles.proofTotals}>
          <div className={styles.ptRow}>
            <span className={styles.ptLab}>Subtotal</span>
            <span className={styles.ptVal}>{money(totals.sellSubtotal)}</span>
          </div>
          {/* The tax line always prints. At 0% it reads "Tax · 0%" and $0.00,
              which is information — a missing line is not. */}
          <div className={styles.ptRow}>
            <span className={styles.ptLab}>Tax · {pct(draft.taxPct)}</span>
            <span className={styles.ptVal}>{money(totals.tax)}</span>
          </div>
          <div className={cx(styles.ptRow, styles.ptGrand)}>
            <span className={styles.ptLab}>Total</span>
            <span className={styles.ptVal}>{money(totals.total)}</span>
          </div>
        </div>

        <div className={styles.proofSec}>
          <div className={styles.proofSecLab}>Payment schedule</div>
          {draft.installments.length === 0 ? (
            <p className={styles.proofMissing}>Balance due in full on completion.</p>
          ) : (
            <div className={styles.proofPay}>
              {draft.installments.map((inst, i) => (
                <div className={styles.proofPayRow} key={inst.id}>
                  <span className={styles.proofNo}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.proofPayLab}>
                    {inst.label.trim().length > 0 ? inst.label : "Installment"}
                  </span>
                  <span className={styles.proofPayShare}>
                    {inst.isPercent ? pct(inst.amount) : "fixed"}
                  </span>
                  <span className={styles.proofPayAmt}>
                    {money(installmentValue(inst, totals.total))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {draft.options.showScope && (
          <div className={styles.proofSec}>
            <div className={styles.proofSecLab}>Scope of work</div>
            {draft.scopeOfWork.trim().length > 0 ? (
              <p className={styles.proofBody}>{draft.scopeOfWork}</p>
            ) : (
              <p className={styles.proofMissing}>No scope of work written yet.</p>
            )}
          </div>
        )}

        {draft.notes.trim().length > 0 && (
          <div className={styles.proofSec}>
            <div className={styles.proofSecLab}>Notes</div>
            <p className={styles.proofBody}>{draft.notes}</p>
          </div>
        )}

        {draft.terms.trim().length > 0 && (
          <div className={styles.proofSec}>
            <div className={styles.proofSecLab}>Terms &amp; conditions</div>
            <p className={styles.proofBody}>{draft.terms}</p>
          </div>
        )}

        {draft.options.showSignature && (
          <div className={styles.sigRow}>
            <div className={styles.sigBox}>
              <span className={styles.sigLine} aria-hidden="true" />
              <span className={styles.sigLab}>{to.name} · date</span>
            </div>
            <div className={styles.sigBox}>
              <span className={styles.sigLine} aria-hidden="true" />
              <span className={styles.sigLab}>{ORG_NAME} · date</span>
            </div>
          </div>
        )}
      </div>

      {foot}
    </section>
  );
}
