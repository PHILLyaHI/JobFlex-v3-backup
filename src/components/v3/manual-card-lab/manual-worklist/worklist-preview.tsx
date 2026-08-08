"use client";

// WORKLIST — the client's copy, and the four switches that govern it.
//
// WHERE THE PREVIEW LIVES, AND WHY
// At the foot of the column, permanently, on a white sheet inside a ruled
// plate. This page is one column by constraint; a side-by-side preview is not
// available and, on a worklist, would not be wanted — the document is the
// ARTEFACT the worklist produces, and an artefact belongs at the end of the run,
// where you read it before you send it.
//
// PRINCIPLE 9 — "the client's copy is a different voice" — is drawn here as
// hard as the system allows: an inverse ink plate, a stated boundary in words,
// a different paper, no controls of any kind inside the sheet. Above the plate
// everything is a workspace; below it, nothing is.
//
// THE FOUR OPTIONS SIT ON TOP OF THE SHEET, NOT IN A CARD OF THEIR OWN
// They are not work to finish — nothing about them can be "done" — so they are
// not worklist cards and they never appear above the seam. They govern what
// prints, so they sit on the lid of the thing they govern, which makes every
// one of them demonstrably consequential: flick a switch and the document
// directly beneath it changes while you are still looking at the switch.
//
//   Hide breakdown costs — the Qty and Unit columns and the per-unit cost line
//                          disappear; the sheet collapses to item + total.
//   Labor-only           — material-priced lines drop out of the table and the
//                          quoted total drops with them. Priced, not just
//                          hidden: see the header note in worklist-math.ts.
//   Show signature lines — two signature blocks at the foot.
//   Show scope of work   — the scope section prints, or does not.

import type { Draft, PriceSheet, ProposalOptions } from "./worklist-types";
import type { ClientRecord } from "./worklist-types";
import { ORG_LINE, ORG_NAME, PROPOSAL_DATE, PROPOSAL_NO, VALID_DAYS } from "./worklist-data";
import { UNIT_LABEL, installmentValue, isNamed, money, pct } from "./worklist-math";
import { Toggle, cx } from "./worklist-ui";
import { addressLine } from "./worklist-pickers";
import styles from "./manual-worklist.module.css";

const OPTION_COPY: {
  key: keyof ProposalOptions;
  label: string;
  help: string;
}[] = [
  {
    key: "hideBreakdown",
    label: "Hide breakdown costs",
    help: "Show only line totals on the proposal — keep the material / labor split internal.",
  },
  {
    key: "laborOnly",
    label: "Labor-only proposal",
    help: "Suppress material rows so the proposal reads as a pure labor quote. The quoted total drops to the labor figure.",
  },
  {
    key: "showSignature",
    label: "Show signature lines",
    help: "Add signature blocks at the foot of the proposal for you and the client.",
  },
  {
    key: "showScope",
    label: "Show scope of work",
    help: "Include the scope text on the PDF. Turn off for ultra-compact proposals.",
  },
];

export function ClientCopy({
  draft,
  sheet,
  client,
  clientName,
  onOption,
}: {
  draft: Draft;
  sheet: PriceSheet;
  /** The picked record, when there is one — for the Bill-to block. */
  client: ClientRecord | undefined;
  /** Whatever name the proposal actually carries, record or plain text. */
  clientName: string;
  onOption: (patch: Partial<ProposalOptions>) => void;
}) {
  const { options } = draft;

  // Only named lines reach a client, and a line suppressed by Labor-only is not
  // on the document at all. Both filters live here rather than in the math, so
  // the workspace ledger above still shows the contractor everything.
  const printed = draft.lines
    .map((line) => ({ line, priced: sheet.perLine.find((p) => p.id === line.id) }))
    .filter(({ line, priced }) => isNamed(line) && !(priced?.suppressed ?? false));

  const compact = options.hideBreakdown;

  return (
    <section className={cx(styles.proof, styles.wlBlock)} aria-labelledby="wl-proof-title">
      <header className={styles.proofHead}>
        <div>
          <span className={styles.proofKicker}>What the client sees</span>
          <h2 className={styles.proofTitle} id="wl-proof-title">
            Client’s copy
          </h2>
        </div>
        <p className={styles.proofNote}>
          Everything below this plate is the document they receive. Nothing above
          it is.
        </p>
      </header>

      {/* ── WHAT PRINTS ───────────────────────────────────── */}
      <div className={styles.prints}>
        <span className={styles.ann}>What prints</span>
        <div className={styles.printGrid}>
          {OPTION_COPY.map((opt) => (
            <Toggle
              key={opt.key}
              checked={options[opt.key]}
              onChange={(next) => onOption({ [opt.key]: next } as Partial<ProposalOptions>)}
              label={opt.label}
              help={opt.help}
            />
          ))}
        </div>
      </div>

      {/* ── THE DOCUMENT ──────────────────────────────────── */}
      <article className={styles.sheet}>
        <div className={styles.sheetTop}>
          <div>
            <p className={styles.sheetOrg}>{ORG_NAME}</p>
            <p className={styles.sheetOrgLine}>{ORG_LINE}</p>
          </div>
          <dl className={styles.sheetMeta}>
            <div>
              <dt>Proposal</dt>
              <dd>{PROPOSAL_NO}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{PROPOSAL_DATE}</dd>
            </div>
            <div>
              <dt>Valid</dt>
              <dd>{VALID_DAYS} days</dd>
            </div>
          </dl>
        </div>

        <h3 className={styles.sheetTitle}>{draft.title.trim() || "Untitled proposal"}</h3>

        <div className={styles.sheetParties}>
          <div>
            <span className={styles.ann}>Prepared for</span>
            <p className={styles.sheetName}>{clientName || "No client yet"}</p>
            {client && addressLine(client) && (
              <p className={styles.sheetLine}>{addressLine(client)}</p>
            )}
            {client?.email && <p className={styles.sheetLine}>{client.email}</p>}
            {client?.phone && <p className={styles.sheetLine}>{client.phone}</p>}
          </div>
          <div>
            <span className={styles.ann}>Job address</span>
            <p className={styles.sheetLine}>{draft.address.trim() || "Not set"}</p>
          </div>
        </div>

        {draft.description.trim() && (
          <p className={styles.sheetIntro}>{draft.description}</p>
        )}

        {options.laborOnly && (
          <p className={styles.sheetFlag}>
            Labor only — materials are supplied by the owner and are not part of
            this quote.
          </p>
        )}

        {/* The estimate table. */}
        {printed.length === 0 ? (
          <p className={styles.sheetEmpty}>Add line items above to see them here.</p>
        ) : (
          <table className={cx(styles.sheetTable, compact && styles.isCompact)}>
            <thead>
              <tr>
                <th scope="col">Item</th>
                {!compact && <th scope="col">Qty</th>}
                {!compact && <th scope="col">Unit</th>}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {printed.map(({ line, priced }) => (
                <tr key={line.id}>
                  <td>
                    <span className={styles.sheetItem}>{line.name}</span>
                    {line.description.trim() && (
                      <span className={styles.sheetItemSub}>{line.description}</span>
                    )}
                    {!compact && (line.materialCost > 0 || line.laborCost > 0) && (
                      <span className={styles.sheetItemCost}>
                        {options.laborOnly
                          ? `Labor ${money(line.laborCost)} per ${UNIT_LABEL[line.unit]}`
                          : `Material ${money(line.materialCost)} · Labor ${money(line.laborCost)} per ${UNIT_LABEL[line.unit]}`}
                      </span>
                    )}
                  </td>
                  {!compact && (
                    <td className={styles.num}>
                      {line.quantity.toLocaleString("en-US")} {UNIT_LABEL[line.unit]}
                    </td>
                  )}
                  {!compact && <td className={styles.num}>{money(priced?.sellUnit ?? 0)}</td>}
                  <td className={styles.num}>{money(priced?.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className={styles.sheetTotals}>
          <div>
            <dt>Subtotal</dt>
            <dd className={styles.num}>{money(sheet.grandTotal)}</dd>
          </div>
          <div>
            <dt>Tax · {pct(draft.taxPct)}</dt>
            <dd className={styles.num}>{money(sheet.tax)}</dd>
          </div>
          <div className={styles.isTotal}>
            <dt>Total</dt>
            <dd className={styles.num}>{money(sheet.total)}</dd>
          </div>
        </dl>

        {/* Payment schedule. */}
        <section className={styles.sheetSection}>
          <h4 className={styles.sheetH}>Payment schedule</h4>
          {draft.installments.length === 0 ? (
            <p className={styles.sheetEmpty}>No payment schedule set.</p>
          ) : (
            <ul className={styles.sheetSched}>
              {draft.installments.map((inst, i) => (
                <li key={inst.id}>
                  <span className={styles.sheetSchedLab}>
                    {inst.label.trim() || `Installment ${i + 1}`}
                    {inst.isPercent && (
                      <span className={styles.sheetSchedPct}> · {pct(inst.amount)} of total</span>
                    )}
                  </span>
                  <span className={cx(styles.sheetSchedAmt, styles.num)}>
                    {money(installmentValue(inst, sheet.total))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {options.showScope && (
          <section className={styles.sheetSection}>
            <h4 className={styles.sheetH}>Scope of work</h4>
            {draft.scopeOfWork.trim() ? (
              <p className={styles.sheetBody}>{draft.scopeOfWork}</p>
            ) : (
              <p className={styles.sheetEmpty}>
                No scope written yet — this section prints empty.
              </p>
            )}
          </section>
        )}

        {draft.terms.trim() && (
          <section className={styles.sheetSection}>
            <h4 className={styles.sheetH}>Terms &amp; conditions</h4>
            <p className={styles.sheetBody}>{draft.terms}</p>
          </section>
        )}

        {options.showSignature && (
          <div className={styles.sheetSign}>
            <div>
              <span className={styles.signRule} aria-hidden="true" />
              <span className={styles.ann}>{ORG_NAME}</span>
            </div>
            <div>
              <span className={styles.signRule} aria-hidden="true" />
              <span className={styles.ann}>{clientName || "Client"}</span>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
