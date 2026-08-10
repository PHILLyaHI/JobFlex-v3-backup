"use client";

// STEPS — section 10 (Their copy). Read-only.
//
// THIS IS THE ONE PLACE ON THE PAGE THAT IS ALLOWED TO LOOK LIKE PAPER.
// Everything else is a lifted surface on a grid ground; the proof is a white
// sheet with a hairline, because it is a picture of a document rather than a
// piece of the tool. That single change of material does more to say "this is
// what they will see" than any label could, which is why there is no label.
//
// EVERY TOGGLE IN SECTION 06 HAS A VISIBLE CONSEQUENCE HERE. A preview that
// ignores a switch is worse than no preview: it teaches the user that the
// switches do not matter. So `laborOnly` really drops the quantity and unit
// price columns, `hideBreakdown` really removes the material/labor annotation,
// `showScope` and `showSignature` really add and remove whole blocks.
//
// The total appears here at 20px against the sticky bar's 28px. It has to be
// on the sheet — it is the document's whole point — but the bar stays the loud
// home, and no third copy exists anywhere on the page.

import type { ClientRecord, Draft, Totals } from "../manual-focus/manual-focus-types";
import { ORG_NAME, PROPOSAL_DATE, PROPOSAL_NO } from "../manual-focus/manual-focus-data";
import { UNIT_LABEL, installmentValue, money, pct, qty } from "../manual-focus/manual-focus-math";
import { fullAddress } from "./steps-pickers";
import s from "./manual-steps.module.css";

export function ProofCard({
  draft,
  totals,
  clients,
}: {
  draft: Draft;
  totals: Totals;
  clients: ClientRecord[];
}) {
  // Local before narrowing — see the note in steps-pickers.tsx.
  const choice = draft.client;
  const record = choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined;
  const name = choice.mode === "freeText" ? choice.name.trim() : (record?.name ?? "");
  const where = draft.address.trim() || (record ? fullAddress(record) : "");
  const summaryStyle = draft.options.laborOnly;

  return (
    <div className={s.sheet}>
      <div className={s.sheetHead}>
        <span className={s.sheetOrg}>{ORG_NAME}</span>
        <span className={s.sheetRef}>
          {PROPOSAL_NO} · {PROPOSAL_DATE}
        </span>
      </div>

      <div className={s.sheetTo}>
        <span className={s.sheetKey}>Prepared for</span>
        <span className={s.sheetName}>{name || "Nobody chosen"}</span>
        {where ? <span className={s.sheetAddr}>{where}</span> : null}
      </div>

      <h4 className={s.sheetTitle}>{draft.title.trim() || "Untitled proposal"}</h4>
      {draft.description.trim() ? <p className={s.sheetProse}>{draft.description}</p> : null}

      {draft.options.showScope && draft.scopeOfWork.trim() ? (
        <div className={s.sheetBlock}>
          <span className={s.sheetKey}>Scope of work</span>
          <p className={s.sheetProse}>{draft.scopeOfWork}</p>
        </div>
      ) : null}

      <div className={s.sheetBlock}>
        {totals.printed.length === 0 ? (
          <p className={s.emptyLine}>Nothing priced yet.</p>
        ) : (
          <ul className={s.sheetLines}>
            {totals.printed.map((p) => (
              <li key={p.id} className={s.sheetLine}>
                <div className={s.sheetLineTop}>
                  <span className={s.sheetLineName}>{p.name}</span>
                  <span className={s.sheetLineAmt}>{money(p.amount)}</span>
                </div>
                {summaryStyle ? null : (
                  <span className={s.sheetLineMeta}>
                    {qty(p.quantity)} {UNIT_LABEL[p.unit]} × {money(p.unitPrice)}
                  </span>
                )}
                {p.description.trim() ? (
                  <span className={s.sheetLineDesc}>{p.description}</span>
                ) : null}
                {draft.options.hideBreakdown ? null : (
                  <span className={s.sheetLineCost}>
                    materials {money(p.materialCost)} · labor {money(p.laborCost)} per unit
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className={s.sheetTotals}>
          <div className={s.sheetTotRow}>
            <span>Subtotal</span>
            <span className={s.tnum}>{money(totals.preTax)}</span>
          </div>
          <div className={s.sheetTotRow}>
            <span>Sales tax {pct(draft.taxPct)}</span>
            <span className={s.tnum}>{money(totals.tax)}</span>
          </div>
          <div className={s.sheetGrand}>
            <span>Total</span>
            <span className={s.tnum}>{money(totals.total)}</span>
          </div>
        </div>
      </div>

      {draft.installments.length ? (
        <div className={s.sheetBlock}>
          <span className={s.sheetKey}>Payment schedule</span>
          <ul className={s.sheetSched}>
            {draft.installments.map((i) => (
              <li key={i.id} className={s.sheetSchedRow}>
                <span>{i.label.trim() || "Untitled"}</span>
                <span className={s.sheetSchedPct}>{i.isPercent ? pct(i.amount) : ""}</span>
                <span className={s.tnum}>{money(installmentValue(i, totals.total))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft.terms.trim() ? (
        <div className={s.sheetBlock}>
          <span className={s.sheetKey}>Terms</span>
          <p className={s.sheetProse}>{draft.terms}</p>
        </div>
      ) : null}

      {draft.options.showSignature ? (
        <div className={s.sheetSign}>
          <div className={s.sheetSignSlot}>
            <span className={s.sheetSignLine} />
            <span className={s.sheetSignLabel}>Client signature · date</span>
          </div>
          <div className={s.sheetSignSlot}>
            <span className={s.sheetSignLine} />
            <span className={s.sheetSignLabel}>{ORG_NAME} · date</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
