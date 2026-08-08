"use client";

// PRICE FIRST — CARDS 04 to 08. (route: /dashboard/manual-margin)
//
//   04 Scope & notes    — no price effect, and the card says so
//   05 Proposal options — three change what PRINTS, one changes the PRICE,
//                         and each states which in dollars
//   06 Terms            — no price effect
//   07 Payment schedule — splits the number; the only card that has to
//                         reconcile TO it
//   08 Files            — no price effect, nothing leaves the browser
//
// The shared rule on this page is that a card head answers "what does this do
// to the number?". Cards that do nothing to it say "no price effect" rather
// than printing a meaningless 0.0% — a zero that is not a measurement is a
// lie, and a contractor reading eight cards deserves to know which three are
// safe to skim.
//
// Fixture-only: no store, no server action, no network, and the file drop
// reads names and sizes only — nothing is uploaded, because there is no
// endpoint on this route and there is not going to be one.

import { useRef, useState } from "react";
import type { Installment, MarginDraft, ProposalOptions, Totals } from "./manual-margin-types";
import {
  coverageState,
  fileSize,
  installmentValue,
  money,
  newId,
  pct,
} from "./manual-margin-math";
import { TERMS_TEMPLATE } from "./manual-margin-data";
import { Empty, Ic, NumInput, cx } from "./margin-card";
import styles from "./manual-margin.module.css";

/* ============================================================
   04 · SCOPE & NOTES
   ============================================================ */

export function ScopeBody({
  draft,
  onScope,
  onNotes,
}: {
  draft: MarginDraft;
  onScope: (v: string) => void;
  onNotes: (v: string) => void;
}) {
  return (
    <>
      <p className={styles.teach}>
        The words that go around the price. Neither of these moves a dollar — they decide whether
        the client believes the dollars.
      </p>

      <div className={styles.stack}>
        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-scope">
            Scope of work
          </label>
          <textarea
            id="mc-scope"
            className={styles.ta}
            value={draft.scopeOfWork}
            placeholder="Remove existing shingles, install underlayment…"
            onChange={(e) => onScope(e.target.value)}
          />
          <p className={styles.hint}>
            Prints on the proposal only while <b>Show scope of work</b> is on in card 05.
            {draft.options.showScope && draft.scopeOfWork.trim().length === 0 && (
              <> Right now that switch is on and there is nothing written, so nothing prints.</>
            )}
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-notes">
            Notes
          </label>
          <textarea
            id="mc-notes"
            className={styles.ta}
            value={draft.notes}
            placeholder="Warranty, assumptions, exclusions…"
            onChange={(e) => onNotes(e.target.value)}
          />
          <p className={styles.hint}>
            Always prints under the scope. This is where the exclusions live — what is{" "}
            <em>not</em> in the price is as much a part of the price as what is.
          </p>
        </div>
      </div>
    </>
  );
}

export function scopeSummary(draft: MarginDraft): string {
  const s = draft.scopeOfWork.trim();
  const n = draft.notes.trim();
  return [
    s.length === 0 ? "scope empty" : `scope ${s.split(/\s+/).length} words`,
    n.length === 0 ? "notes empty" : `notes ${n.split(/\s+/).length} words`,
  ].join(" · ");
}

/* ============================================================
   05 · PROPOSAL OPTIONS
   ============================================================ */

/** One toggle row. Module scope — see margin-card.tsx for why. */
function OptionRow({
  on,
  title,
  why,
  consequence,
  isMoney,
  onToggle,
}: {
  on: boolean;
  title: string;
  why: string;
  consequence: string;
  isMoney?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={cx(styles.optRow, on && styles.isOn)}
      onClick={onToggle}
    >
      <span className={styles.switch} aria-hidden="true">
        <i />
      </span>
      <span className={styles.optCopy}>
        <span className={styles.optTitle}>{title}</span>
        <span className={styles.optWhy}>{why}</span>
        <span className={cx(styles.optConseq, isMoney && styles.isMoney)}>{consequence}</span>
      </span>
    </button>
  );
}

export function OptionsBody({
  draft,
  materialWeight,
  onToggle,
}: {
  draft: MarginDraft;
  /** What the material side of the sheet is worth in the contract total —
   *  i.e. exactly what the labor-only switch takes off or puts back. */
  materialWeight: number;
  onToggle: (patch: Partial<ProposalOptions>) => void;
}) {
  const o = draft.options;

  return (
    <>
      <p className={styles.teach}>
        Three of these change what the document says. One of them changes what the job costs, and
        it is labelled in dollars.
      </p>

      <div className={styles.opts}>
        <OptionRow
          on={o.hideBreakdown}
          title="Hide breakdown costs"
          why="Show only line totals on the proposal — keep the material / labor split internal."
          consequence={
            o.hideBreakdown
              ? "Client sees line totals only"
              : "Client sees the per-unit material / labor split"
          }
          onToggle={() => onToggle({ hideBreakdown: !o.hideBreakdown })}
        />
        <OptionRow
          on={o.laborOnly}
          title="Labor-only proposal"
          why="Suppress material rows so the proposal reads as a pure labor quote."
          isMoney
          consequence={
            o.laborOnly
              ? `On · ${money(materialWeight)} of material is out of the total`
              : `Off · would take ${money(materialWeight)} off the total`
          }
          onToggle={() => onToggle({ laborOnly: !o.laborOnly })}
        />
        <OptionRow
          on={o.showSignature}
          title="Show signature lines"
          why="Add signature blocks at the foot of the proposal for you and the client."
          consequence={o.showSignature ? "Two signature blocks print" : "No signature blocks"}
          onToggle={() => onToggle({ showSignature: !o.showSignature })}
        />
        <OptionRow
          on={o.showScope}
          title="Show scope of work"
          why="Include the scope text on the PDF. Turn off for ultra-compact proposals."
          consequence={
            !o.showScope
              ? "Scope stays off the document"
              : draft.scopeOfWork.trim().length === 0
                ? "On · nothing written yet, so nothing prints"
                : "Scope prints in full"
          }
          onToggle={() => onToggle({ showScope: !o.showScope })}
        />
      </div>

      <p className={cx(styles.hint, styles.gapTop)}>
        Every switch here is live in card 09 — flip one and watch the client&rsquo;s copy change.
      </p>
    </>
  );
}

export function optionsSummary(draft: MarginDraft): string {
  const o = draft.options;
  const on = [
    o.hideBreakdown && "breakdown hidden",
    o.laborOnly && "labor only",
    o.showSignature && "signatures",
    o.showScope && "scope",
  ].filter(Boolean) as string[];
  return on.length === 0 ? "all four off" : `${on.length} of 4 on · ${on.join(", ")}`;
}

/* ============================================================
   06 · TERMS & CONDITIONS
   ============================================================ */

export function TermsBody({
  draft,
  onTerms,
}: {
  draft: MarginDraft;
  onTerms: (v: string) => void;
}) {
  const empty = draft.terms.trim().length === 0;

  return (
    <>
      <p className={styles.teach}>
        What happens if something goes wrong. It costs nothing to write and it is the cheapest
        insurance on the page.
      </p>

      <div className={styles.field}>
        <div className={styles.subHead}>
          <label className={styles.lab} htmlFor="mc-terms">
            Terms
          </label>
          <button type="button" className={styles.link} onClick={() => onTerms(TERMS_TEMPLATE)}>
            <Ic id="i-file" />
            Insert starter template
          </button>
        </div>
        <textarea
          id="mc-terms"
          className={styles.ta}
          value={draft.terms}
          placeholder="Payment terms, change-order policy, warranty, dispute resolution…"
          onChange={(e) => onTerms(e.target.value)}
        />
      </div>

      {empty && (
        <div className={styles.gapTop}>
          <Empty kicker="No terms yet">
            The starter template covers payment, change orders, workmanship warranty and a
            three-day cancellation window. Insert it and edit from there.
          </Empty>
        </div>
      )}
    </>
  );
}

export function termsSummary(draft: MarginDraft): string {
  const t = draft.terms.trim();
  if (t.length === 0) return "empty · nothing prints";
  return `${t.split("\n").filter((l) => l.trim().length > 0).length} clauses · ${t.length} characters`;
}

/* ============================================================
   07 · PAYMENT SCHEDULE
   ============================================================ */

export function PaymentsBody({
  draft,
  totals,
  onPatch,
  onAdd,
  onRemove,
  onBalance,
}: {
  draft: MarginDraft;
  totals: Totals;
  onPatch: (id: string, patch: Partial<Installment>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onBalance: () => void;
}) {
  const { covered, gap, state } = coverageState(draft.installments, totals.contractTotal);
  const exact = state === "exact";
  const under = state === "under";
  const fill =
    totals.contractTotal > 0
      ? Math.min(100, Math.max(0, (covered / totals.contractTotal) * 100))
      : 0;

  return (
    <>
      <p className={styles.teach}>
        How the contract total gets paid. A percentage means nothing until a total exists, so the
        dollar figure appears as soon as one does — and the meter below says whether the
        installments actually add up to the number.
      </p>

      {draft.installments.length === 0 ? (
        <Empty kicker="No installments">
          Without a schedule the whole contract total is due on completion. Most contractors want a
          deposit before that.
        </Empty>
      ) : (
        <div className={styles.instList}>
          {draft.installments.map((inst, i) => (
            <div className={styles.instRow} key={inst.id}>
              <span className={styles.instPos}>{String(i + 1).padStart(2, "0")}</span>
              <input
                type="text"
                className={styles.lineIn}
                value={inst.label}
                placeholder="Deposit, Start of work, Completion…"
                aria-label={`Installment ${i + 1} label`}
                onChange={(e) => onPatch(inst.id, { label: e.target.value })}
              />
              <span className={cx(styles.instAmt, inst.isPercent ? styles.pctIn : styles.moneyIn)}>
                <span aria-hidden="true">{inst.isPercent ? "%" : "$"}</span>
                <NumInput
                  className={styles.lineIn}
                  value={inst.amount}
                  min={0}
                  step={inst.isPercent ? 1 : 10}
                  ariaLabel={`Installment ${i + 1} amount`}
                  onChange={(n) => onPatch(inst.id, { amount: n })}
                />
              </span>
              <span className={cx(styles.instSeg, styles.seg)}>
                <button
                  type="button"
                  className={cx(styles.segBtn, inst.isPercent && styles.segOn)}
                  aria-pressed={inst.isPercent}
                  onClick={() => onPatch(inst.id, { isPercent: true })}
                >
                  %<span className={styles.srOnly}> percent of the total</span>
                </button>
                <button
                  type="button"
                  className={cx(styles.segBtn, !inst.isPercent && styles.segOn)}
                  aria-pressed={!inst.isPercent}
                  onClick={() => onPatch(inst.id, { isPercent: false })}
                >
                  $<span className={styles.srOnly}> a fixed amount</span>
                </button>
              </span>
              <span className={styles.instOut}>
                {totals.contractTotal > 0 || !inst.isPercent ? (
                  <span className={styles.instCalc}>
                    {money(installmentValue(inst, totals.contractTotal))}
                  </span>
                ) : (
                  <span className={styles.instCalcOff}>no total yet</span>
                )}
              </span>
              <button
                type="button"
                className={cx(styles.iconBtn, styles.isDanger)}
                onClick={() => onRemove(inst.id)}
              >
                <Ic id="i-trash" />
                <span className={styles.srOnly}>Remove installment {i + 1}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={styles.addBtn} onClick={onAdd}>
        <Ic id="i-plus" />
        Add installment
      </button>

      <div className={styles.gapTop}>
        <div
          className={cx(
            styles.cover,
            exact ? styles.isExact : under ? styles.isUnder : styles.isOver,
          )}
        >
          <span className={styles.coverTxt}>
            {money(covered)} of {money(totals.contractTotal)}
          </span>
          <span className={styles.coverBar} aria-hidden="true">
            <span className={styles.coverFill} style={{ width: `${fill}%` }} />
          </span>
          <span className={styles.coverTxt}>
            {exact
              ? "Covers the total"
              : under
                ? `${money(gap)} unscheduled`
                : `${money(Math.abs(gap))} over`}
          </span>
          {!exact && draft.installments.length > 0 && (
            <button type="button" className={cx(styles.act, styles.actSm)} onClick={onBalance}>
              <Ic id="i-target" />
              Balance the last one
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function paymentsSummary(draft: MarginDraft, totals: Totals): string {
  const { covered, gap, state } = coverageState(draft.installments, totals.contractTotal);
  const n = draft.installments.length;
  const words =
    state === "exact"
      ? "covers the total"
      : state === "under"
        ? `${money(gap)} unscheduled`
        : `${money(Math.abs(gap))} over`;
  return `${n} installment${n === 1 ? "" : "s"} · ${money(covered)} · ${words}`;
}

/* ============================================================
   08 · FILES & DOCUMENTS
   ============================================================ */

export function FilesBody({
  draft,
  onAdd,
  onRemove,
}: {
  draft: MarginDraft;
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <p className={styles.teach}>
        Anything that helps the client picture the job. Nothing here is uploaded — this page has no
        data layer, so the browser reads the name and the size and stops.
      </p>

      <button
        type="button"
        className={cx(styles.drop, over && styles.isOver2)}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onAdd(e.dataTransfer?.files ?? null);
        }}
      >
        <Ic id="i-imgadd" />
        <span className={styles.dropTitle}>
          Drop files here, or <b>browse</b>
        </span>
        <span className={styles.dropSub}>
          PDFs, images, CAD exports — anything that helps the client see the job.
        </span>
      </button>

      <input
        ref={input}
        type="file"
        multiple
        className={styles.srOnly}
        aria-label="Choose files to attach"
        onChange={(e) => {
          onAdd(e.target.files);
          // Clearing lets the same file be chosen twice in a row, which is
          // otherwise silently ignored by the browser.
          if (input.current) input.current.value = "";
        }}
      />

      {draft.files.length === 0 ? (
        <div className={styles.gapTop}>
          <Empty kicker="No file chosen">
            Nothing is attached yet. A photo of the existing roof and the manufacturer&rsquo;s
            warranty sheet are the two that close jobs.
          </Empty>
        </div>
      ) : (
        <div className={styles.fileList}>
          {draft.files.map((f) => (
            <div className={styles.fileRow} key={f.id}>
              <Ic id="i-file" />
              <span className={styles.fileBody}>
                <span className={styles.fileName}>{f.name}</span>
                <span className={styles.fileMeta}>
                  {fileSize(f.size)} · {f.kind || "unknown type"} · stays in this browser
                </span>
              </span>
              <button
                type="button"
                className={cx(styles.iconBtn, styles.isDanger)}
                onClick={() => onRemove(f.id)}
              >
                <Ic id="i-x" />
                <span className={styles.srOnly}>Remove {f.name}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function filesSummary(draft: MarginDraft): string {
  if (draft.files.length === 0) return "no file chosen";
  const bytes = draft.files.reduce((sum, f) => sum + f.size, 0);
  return `${draft.files.length} file${draft.files.length === 1 ? "" : "s"} · ${fileSize(bytes)} · nothing uploaded`;
}

/* ============================================================
   Shared helpers the content component uses when it builds new
   rows, kept here so the row shape lives beside the row UI.
   ============================================================ */

export function blankInstallment(): Installment {
  return { id: newId("in"), label: "", amount: 0, isPercent: true };
}

/** Human percentage for the client's copy — "30% of the total". */
export function installmentNote(inst: Installment): string | null {
  return inst.isPercent ? `${pct(inst.amount)} of the total` : null;
}
