"use client";

// PRICE FIRST — CARD 09, what the client sees. (route: /dashboard/manual-margin)
//
// PRINCIPLE 9, DRAWN: the client's copy is a different voice, and the reader
// must never wonder which side of the desk they are looking at. So the
// boundary is stated three ways at once — an inverse INK card head that says
// "their copy, not your workspace", a sky-framed boundary tag, and a document
// inset on beige with its own 2px frame and 4px shadow, laid out like a sheet
// of paper rather than a form. There is not a single input inside it.
//
// It sits LAST because on a price-first page the document is the consequence,
// not the control. Everything above it is the instrument; this is the reading.
//
// The four option toggles are all live here and each changes something you can
// point at:
//   hideBreakdown  → the per-unit material / labor sub-line under each row
//   laborOnly      → material is out of the price entirely, the material-only
//                    rows drop off the table, and the document says so
//   showSignature  → the two signature blocks at the foot
//   showScope      → the scope section (and it honestly prints nothing when
//                    the switch is on but nothing has been written)
//
// Fixture-only: renders from props, owns no state, writes nothing.

import type { ClientRecord, MarginDraft, Totals } from "./manual-margin-types";
import {
  UNIT_LABEL,
  installmentValue,
  money,
  pct,
  qty,
  safe,
} from "./manual-margin-math";
import { ORG_NAME, PROPOSAL_DATE, PROPOSAL_NO, VALID_DAYS } from "./manual-margin-data";
import { installmentNote } from "./margin-detail";
import { Ic, cx } from "./margin-card";
import styles from "./manual-margin.module.css";

export function PreviewCard({
  draft,
  totals,
  clients,
}: {
  draft: MarginDraft;
  totals: Totals;
  clients: ClientRecord[];
}) {
  // Local const so the discriminated-union narrowing survives into the .find()
  // callback — TypeScript drops it for a parameter's property.
  const choice = draft.client;
  const record = choice.mode === "record" ? clients.find((c) => c.id === choice.id) ?? null : null;
  const clientName = record
    ? record.name
    : choice.mode === "freeText"
      ? choice.name.trim()
      : "";

  const sellOf = (id: string) => totals.perLine.find((p) => p.id === id)?.sell ?? 0;

  /**
   * Which rows print.
   *
   * The rule is chosen so the printed column ALWAYS sums to the subtotal
   * beneath it — anything excluded here sells for exactly $0.00.
   *   · normally    — a row prints if it has a name, or if it carries money
   *                   (an unnamed but priced row prints as "Unnamed line item"
   *                   rather than quietly vanishing from a total it is in);
   *   · labor-only  — only rows that still carry money, because a pure
   *                   material row is worth nothing on a labor quote and
   *                   printing it at $0.00 invites a question with no answer.
   */
  const rows = draft.lines.filter((l) => {
    const sell = sellOf(l.id);
    if (draft.options.laborOnly) return sell > 0;
    return l.name.trim().length > 0 || sell > 0;
  });

  const showScope = draft.options.showScope && draft.scopeOfWork.trim().length > 0;

  return (
    <section id="mc-proof" className={cx(styles.proofCard, styles.col)} aria-labelledby="mc-proof-title">
      <header className={styles.proofHead}>
        <span className={styles.cardNum} aria-hidden="true">
          09
        </span>
        <div className={styles.cardCopy}>
          <h2 className={styles.cardTitle} id="mc-proof-title">
            <span className={styles.srOnly}>Card 09: </span>
            What the client sees
          </h2>
          <p className={styles.cardSum}>
            {rows.length} printed line{rows.length === 1 ? "" : "s"} · {money(totals.contractTotal)}{" "}
            total · {draft.installments.length} payment
            {draft.installments.length === 1 ? "" : "s"}
            {draft.options.laborOnly ? " · labor only" : ""}
          </p>
        </div>
        <span className={styles.proofBoundary}>
          Their copy
          <br />
          not your workspace
        </span>
      </header>

      <article className={styles.sheet}>
        <div className={styles.sheetTop}>
          <p className={styles.orgName}>{ORG_NAME}</p>
          <p className={styles.docMeta}>
            Proposal {PROPOSAL_NO}
            <br />
            {PROPOSAL_DATE} · valid {VALID_DAYS} days
          </p>
        </div>

        <h3 className={cx(styles.docTitle, draft.title.trim().length === 0 && styles.isUntitled)}>
          {draft.title.trim() || "Untitled proposal"}
        </h3>

        <p className={styles.docTo}>
          {clientName ? (
            <>
              Prepared for <b>{clientName}</b>
            </>
          ) : (
            <>Prepared for — no client on this proposal yet</>
          )}
          {draft.address.trim() && (
            <>
              <br />
              {draft.address.trim()}
            </>
          )}
        </p>

        {draft.description.trim() && <p className={styles.docIntro}>{draft.description.trim()}</p>}

        {draft.options.laborOnly && (
          <p className={styles.laborBanner}>
            {/* A box, not a hardhat: DESIGN.md's anti-references rule out
                construction-site iconography, and the subject of this note is
                the materials, not the trade. */}
            <Ic id="i-box" />
            <span>
              <b>Labor only.</b> This price covers installation labor. Materials are supplied by the
              owner and are not included in any figure below.
            </span>
          </p>
        )}

        <div className={styles.proofTable}>
          <div className={styles.ptHead} aria-hidden="true">
            <span>Item</span>
            <span className={styles.colRight}>Qty</span>
            <span>Unit</span>
            <span className={styles.colRight}>Total</span>
          </div>

          {rows.length === 0 ? (
            <p className={styles.ptEmpty}>Add line items above to see them here.</p>
          ) : (
            rows.map((l) => (
              <div className={styles.ptRow} key={l.id}>
                <span>
                  <span className={styles.ptName}>{l.name.trim() || "Unnamed line item"}</span>
                  {l.description.trim() && <span className={styles.ptDesc}>{l.description}</span>}
                  {!draft.options.hideBreakdown && safe(l.materialCost) + safe(l.laborCost) > 0 && (
                    <span className={styles.ptSplit}>
                      {draft.options.laborOnly
                        ? `labor ${money(safe(l.laborCost))} per ${UNIT_LABEL[l.unit]}`
                        : `materials ${money(safe(l.materialCost))} · labor ${money(
                            safe(l.laborCost),
                          )} per ${UNIT_LABEL[l.unit]}`}
                    </span>
                  )}
                </span>
                <span className={styles.ptNum}>{qty(l.quantity)}</span>
                <span className={styles.ptNum}>{UNIT_LABEL[l.unit]}</span>
                <span className={styles.ptTotal}>{money(sellOf(l.id))}</span>
              </div>
            ))
          )}

          <div className={styles.ptFoot}>
            <div className={styles.ptFootRow}>
              <span className={styles.ptFootLab}>Subtotal</span>
              <span className={styles.ptFootLead} aria-hidden="true" />
              <span className={styles.ptFootVal}>{money(totals.grandTotal)}</span>
            </div>
            <div className={styles.ptFootRow}>
              <span className={styles.ptFootLab}>Tax · {pct(draft.taxPct)}</span>
              <span className={styles.ptFootLead} aria-hidden="true" />
              <span className={styles.ptFootVal}>{money(totals.tax)}</span>
            </div>
            <div className={cx(styles.ptFootRow, styles.isGrand)}>
              <span className={styles.ptFootLab}>Total</span>
              <span className={styles.ptFootLead} aria-hidden="true" />
              <span className={styles.ptFootVal}>{money(totals.contractTotal)}</span>
            </div>
          </div>
        </div>

        <section className={styles.sect}>
          <h4 className={styles.sectLab}>Payment schedule</h4>
          {draft.installments.length === 0 ? (
            <p className={styles.sectTxt}>The full amount is due on completion.</p>
          ) : (
            <div>
              {draft.installments.map((inst) => {
                const note = installmentNote(inst);
                return (
                  <div className={styles.schedRow} key={inst.id}>
                    <span className={styles.schedLab}>{inst.label.trim() || "Payment"}</span>
                    {note && <span className={styles.schedNote}>{note}</span>}
                    <span className={styles.schedLead} aria-hidden="true" />
                    <span className={styles.schedVal}>
                      {money(installmentValue(inst, totals.contractTotal))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {showScope && (
          <section className={styles.sect}>
            <h4 className={styles.sectLab}>Scope of work</h4>
            <p className={styles.sectTxt}>{draft.scopeOfWork.trim()}</p>
          </section>
        )}

        {draft.notes.trim() && (
          <section className={styles.sect}>
            <h4 className={styles.sectLab}>Notes</h4>
            <p className={styles.sectTxt}>{draft.notes.trim()}</p>
          </section>
        )}

        {draft.terms.trim() && (
          <section className={styles.sect}>
            <h4 className={styles.sectLab}>Terms &amp; conditions</h4>
            <p className={styles.sectTxt}>{draft.terms.trim()}</p>
          </section>
        )}

        {draft.options.showSignature && (
          <section className={styles.sect}>
            <h4 className={styles.sectLab}>Acceptance</h4>
            <div className={styles.signGrid}>
              <p className={styles.signBox}>Client signature · date</p>
              <p className={styles.signBox}>{ORG_NAME} · date</p>
            </div>
          </section>
        )}
      </article>
    </section>
  );
}
