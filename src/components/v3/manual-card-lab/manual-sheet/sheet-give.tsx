"use client";

// CHAPTERS — chapter 5, "What they get": brief sections 06 (what prints) and
// 10 (their copy).
//
// Route: /dashboard/manual-sheet.
//
// THIS PAIRING IS THE ARGUMENT FOR THE WHOLE VARIANT. In the ten-card build the
// four print switches sat in card 06 and the preview they alter sat in card 10,
// four cards and about two thousand pixels apart — so the only way to find out
// what "Hide cost breakdown" does was to flip it, scroll, look, scroll back.
// Putting cause and effect in one card removes the scroll entirely: the switches
// are the first thing in the chapter and the document redraws under them.
//
// THE PREVIEW IS A DIFFERENT OBJECT AND IS DRAWN AS ONE. It sits on the paper
// well rather than the card surface, which is the same surface-change trick the
// cards use against the page ground — a document lying on the card. That is why
// it needs no second border and no "Preview" badge.
//
// Its figures come from `totals.printed`, which is the math module's own printed
// column: every row multiplies out (quantity x unit price = amount) and the
// column sums to the subtotal, because that is the arithmetic a homeowner checks
// by hand. Nothing here computes a number.

import type { ClientRecord, Draft, Totals } from "../manual-focus/manual-focus-types";
import {
  ORG_LINE,
  ORG_NAME,
  PROPOSAL_DATE,
  PROPOSAL_NO,
} from "../manual-focus/manual-focus-data";
import { money, qty, UNIT_LABEL } from "../manual-focus/manual-focus-math";
import s from "./manual-sheet.module.css";
import { BlockHead, Seg, SwitchRow } from "./sheet-ui";

export function ChapterGive({
  draft,
  patch,
  totals,
  clientName,
  clients,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  totals: Totals;
  clientName: string;
  clients: ClientRecord[];
}) {
  const o = draft.options;
  const setOpt = (p: Partial<Draft["options"]>) => patch({ options: { ...o, ...p } });

  // Hoisted before the discriminant is read — see sheet-job for the reason.
  const choice = draft.client;
  const record = choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined;

  /** Summary style drops the measurement columns and prints name + amount. */
  const summary = o.laborOnly;

  return (
    <>
      {/* ---- 06 WHAT PRINTS ---- */}
      <div className={s.block}>
        <BlockHead num="06" name="What prints" />

        <div className={s.fields}>
          <div className={s.identity}>
            <span className={s.switchLab}>Quote style</span>
            <Seg
              ariaLabel="Quote style"
              value={summary ? "summary" : "full"}
              options={[
                { value: "full", label: "Full" },
                { value: "summary", label: "Summary" },
              ]}
              onChange={(v) => setOpt({ laborOnly: v === "summary" })}
            />
          </div>

          <SwitchRow
            label="Cost breakdown per line"
            checked={!o.hideBreakdown}
            onChange={(v) => setOpt({ hideBreakdown: !v })}
          />
          <SwitchRow
            label="Scope of work"
            checked={o.showScope}
            onChange={(v) => setOpt({ showScope: v })}
          />
          <SwitchRow
            label="Signature lines"
            checked={o.showSignature}
            onChange={(v) => setOpt({ showSignature: v })}
          />
        </div>
      </div>

      {/* ---- 10 THEIR COPY ---- */}
      <div className={s.block}>
        <BlockHead num="10" name="Their copy" />

        <div className={s.proof}>
          <div className={s.proofHead}>
            <div>
              <div className={s.proofOrg}>{ORG_NAME}</div>
              <div className={s.proofOrgLine}>{ORG_LINE}</div>
            </div>
            <div className={s.proofRef}>
              {PROPOSAL_NO}
              <br />
              {PROPOSAL_DATE}
            </div>
          </div>

          <h4 className={s.proofTitle}>{draft.title || "Untitled proposal"}</h4>
          <p className={s.proofTo}>
            {clientName || "No client yet"}
            {draft.address ? ` · ${draft.address}` : ""}
          </p>

          <div className={s.proofSection}>
            <div className={s.proofSecHead}>Work and price</div>

            {totals.printed.length === 0 ? (
              <p className={s.none}>No named lines yet.</p>
            ) : (
              totals.printed.map((r) => (
                <div key={r.id} className={s.proofLine}>
                  <div className={s.proofLineMain}>
                    <div className={s.proofLineName}>{r.name}</div>
                    {r.description ? (
                      <div className={s.proofLineDesc}>{r.description}</div>
                    ) : null}
                    {summary ? null : (
                      <div className={s.proofLineCalc}>
                        {qty(r.quantity)} {UNIT_LABEL[r.unit]} × {money(r.unitPrice)}
                        {o.hideBreakdown
                          ? ""
                          : `  ·  material ${money(r.materialCost)} / labor ${money(r.laborCost)} per unit`}
                      </div>
                    )}
                  </div>
                  <div className={s.proofLineAmt}>{money(r.amount)}</div>
                </div>
              ))
            )}

            <div className={s.proofSums}>
              <div className={s.proofSumRow}>
                <span>Subtotal</span>
                <span className={s.proofSumVal}>{money(totals.preTax)}</span>
              </div>
              <div className={s.proofSumRow}>
                <span>Sales tax</span>
                <span className={s.proofSumVal}>{money(totals.tax)}</span>
              </div>
            </div>

            <div className={s.proofTotalRow}>
              <span className={s.proofTotalLab}>Total due</span>
              <span className={s.proofTotalVal}>{money(totals.total)}</span>
            </div>
          </div>

          {o.showScope && draft.scopeOfWork.trim() ? (
            <div className={s.proofSection}>
              <div className={s.proofSecHead}>Scope of work</div>
              <p className={s.proofProse}>{draft.scopeOfWork}</p>
            </div>
          ) : null}

          {draft.terms.trim() ? (
            <div className={s.proofSection}>
              <div className={s.proofSecHead}>Terms</div>
              <p className={s.proofProse}>{draft.terms}</p>
            </div>
          ) : null}

          {o.showSignature ? (
            <div className={s.proofSection}>
              <div className={s.proofSecHead}>Acceptance</div>
              <div className={s.signGrid}>
                <div>
                  <div className={s.signSlot} />
                  <div className={s.signCap}>{record?.name ?? clientName ?? "Client"}</div>
                </div>
                <div>
                  <div className={s.signSlot} />
                  <div className={s.signCap}>Date</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
