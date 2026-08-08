"use client";

// PROOF CARD — cards 04 to 09 (route: /dashboard/manual-proof).
//
// Six small card bodies, each answering exactly one question:
//   04 TAX      — what rate applies here, and where it came from   (money)
//   05 PAYMENT  — how the total gets paid                          (money)
//   06 SCOPE    — what you are telling them about the work         (coverage)
//   07 OPTIONS  — what the printed document shows                  (coverage,
//                 or MONEY the moment a labor-only quote is switched on)
//   08 TERMS    — the rules that follow the money                  (coverage)
//   09 FILES    — what rides along with the proposal               (coverage)
//
// The proof footers themselves are assembled in manual-proof-content.tsx, next
// to the totals — a body that computed its own footer figure would be a second
// place for the arithmetic to live, and the whole page rests on there being
// only one.

import { useRef, useState } from "react";
import type { Installment, ProposalOptions, StagedFile } from "./manual-proof-types";
import { STATE_NAMES } from "./manual-proof-data";
import {
  coverState,
  coveredAmount,
  fileSize,
  installmentValue,
  money,
  newId,
  pct,
} from "./manual-proof-math";
import { cx } from "./proof-card";
import { AddBtn, EmptyNote, Ic, IconBtn, NumIn, TextArea, TextIn, ToggleRow } from "./proof-bits";
import styles from "./manual-proof.module.css";

/* ══════════════════════════════════════════════════════════════
   04 · TAX
   ══════════════════════════════════════════════════════════════ */

export function TaxBlock({
  taxPct,
  taxAuto,
  taxState,
  estimate,
  onType,
  onReEstimate,
}: {
  taxPct: number;
  /** True while the figure is still the address estimate. */
  taxAuto: boolean;
  /** Two-letter state the estimate came from, or "". */
  taxState: string;
  /** What the address WOULD estimate right now, or null when it cannot. */
  estimate: number | null;
  onType: (next: number) => void;
  onReEstimate: () => void;
}) {
  const stateName = STATE_NAMES[taxState] ?? taxState;

  return (
    <div className={styles.taxRow}>
      <label className={styles.field}>
        <span className={styles.lab}>Tax rate</span>
        <NumIn
          affix="%"
          value={taxPct}
          ariaLabel="Sales tax rate, percent"
          onChange={onType}
        />
        <span className={styles.hint}>Type 7.5 for 7.5%.</span>
      </label>

      <div className={styles.taxProv}>
        {taxAuto && taxState ? (
          <span className={cx(styles.prov, styles.isAuto)}>
            <Ic name="pin" />
            Estimated from {stateName} · {pct(taxPct)}
          </span>
        ) : (
          <span className={styles.prov}>
            <Ic name="pen" />
            Set by hand · {pct(taxPct)}
          </span>
        )}

        {/* Once a rate is typed it is NEVER silently overwritten by a later
            address change — the way back to the estimate is a control the user
            presses, and it only appears when there is something to go back to. */}
        {!taxAuto && estimate !== null && Math.abs(estimate - taxPct) > 0.001 && (
          <button type="button" className={styles.link} onClick={onReEstimate}>
            <Ic name="undo" />
            Re-estimate from the address ({pct(estimate)})
          </button>
        )}

        {taxAuto && !taxState && (
          <span className={styles.provNote}>
            No address on the job yet, so nothing has been estimated. This rate is the org default.
          </span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   05 · PAYMENT SCHEDULE
   ══════════════════════════════════════════════════════════════ */

export function PaymentBlock({
  installments,
  total,
  onChange,
}: {
  installments: Installment[];
  total: number;
  onChange: (next: Installment[]) => void;
}) {
  const covered = coveredAmount(installments, total);
  const state = coverState(installments, total);
  const share = total > 0 ? Math.min(140, (covered / total) * 100) : 0;

  function patch(id: string, p: Partial<Installment>) {
    onChange(installments.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  return (
    <>
      {installments.length === 0 ? (
        <EmptyNote title="No installments">
          With nothing here the whole balance falls due on completion. Most jobs want a deposit
          first.
        </EmptyNote>
      ) : (
        <div className={styles.instList}>
          {installments.map((inst, i) => (
            <div className={styles.instRow} key={inst.id}>
              <span className={styles.instPos} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>

              <input
                className={styles.rowIn}
                value={inst.label}
                placeholder="Deposit / Start of work / Completion"
                aria-label={`Installment ${i + 1} label`}
                onChange={(e) => patch(inst.id, { label: e.target.value })}
              />

              <NumIn
                dense
                affix={inst.isPercent ? "%" : "$"}
                value={inst.amount}
                ariaLabel={`Installment ${i + 1} amount`}
                onChange={(v) => patch(inst.id, { amount: v })}
              />

              {/* Two options never earn a menu. */}
              <span className={styles.seg} role="group" aria-label={`Installment ${i + 1} type`}>
                <button
                  type="button"
                  aria-pressed={inst.isPercent}
                  className={cx(styles.segBtn, inst.isPercent && styles.segOn)}
                  onClick={() => patch(inst.id, { isPercent: true })}
                >
                  %
                </button>
                <button
                  type="button"
                  aria-pressed={!inst.isPercent}
                  className={cx(styles.segBtn, !inst.isPercent && styles.segOn)}
                  onClick={() => patch(inst.id, { isPercent: false })}
                >
                  $
                </button>
              </span>

              {/* A percentage means nothing until a total exists, so the dollar
                  figure only appears once one does. */}
              {total > 0 ? (
                <span className={styles.instCalc}>{money(installmentValue(inst, total))}</span>
              ) : (
                <span className={styles.instCalcOff}>No total yet</span>
              )}

              <IconBtn
                icon="trash"
                danger
                label={`Remove installment ${i + 1}`}
                onClick={() => onChange(installments.filter((x) => x.id !== inst.id))}
              />
            </div>
          ))}
        </div>
      )}

      <div className={styles.addRow}>
        <AddBtn
          onClick={() =>
            onChange([
              ...installments,
              { id: newId("in"), label: "", amount: 0, isPercent: true },
            ])
          }
        >
          Add an installment
        </AddBtn>
      </div>

      {/* The reconciliation the live builder does not surface. A schedule that
          does not land on the total is a real error, and it belongs beside the
          rows that caused it. */}
      <div className={cx(styles.cover, styles[state])}>
        <span className={styles.coverTxt}>
          {state === "exact"
            ? "Reconciles to the total"
            : state === "over"
              ? "Over the total"
              : "Short of the total"}
        </span>
        <span className={styles.coverBar} aria-hidden="true">
          <span className={styles.coverFill} style={{ width: `${Math.min(100, share)}%` }} />
        </span>
        <span className={styles.coverTxt}>
          {money(covered)} of {money(total)}
        </span>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   06 · SCOPE & NOTES
   ══════════════════════════════════════════════════════════════ */

export function ScopeBlock({
  scopeOfWork,
  notes,
  showScope,
  onScope,
  onNotes,
}: {
  scopeOfWork: string;
  notes: string;
  /** Card 07 decides whether this text reaches the client at all, and this card
   *  says so rather than letting the writer find out in the preview. */
  showScope: boolean;
  onScope: (next: string) => void;
  onNotes: (next: string) => void;
}) {
  return (
    <div className={styles.stack}>
      <label className={styles.field}>
        <span className={styles.lab}>Scope of work</span>
        <TextArea
          value={scopeOfWork}
          onChange={onScope}
          rows={5}
          placeholder="Remove existing shingles, install underlayment…"
        />
        <span className={cx(styles.hint, !showScope && styles.isWarn)}>
          {showScope
            ? "Prints on the client's copy."
            : "Card 07 has “Show scope of work” switched off, so none of this prints."}
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.lab}>Notes</span>
        <TextArea
          value={notes}
          onChange={onNotes}
          rows={3}
          placeholder="Warranty, assumptions, exclusions…"
        />
        <span className={styles.hint}>Prints under the scope on the client&apos;s copy.</span>
      </label>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   07 · PROPOSAL OPTIONS
   ══════════════════════════════════════════════════════════════ */

export function OptionsBlock({
  options,
  suppressedCount,
  suppressedBase,
  onChange,
}: {
  options: ProposalOptions;
  /** How many rows a labor-only quote is dropping right now. */
  suppressedCount: number;
  /** What those rows would have added at base. */
  suppressedBase: number;
  onChange: (patch: Partial<ProposalOptions>) => void;
}) {
  return (
    <div className={styles.togList}>
      <ToggleRow
        label="Hide breakdown costs"
        hint="Show only line totals on the proposal — keep the material / labor split internal."
        on={options.hideBreakdown}
        onChange={(v) => onChange({ hideBreakdown: v })}
        effect={
          options.hideBreakdown
            ? "Now printing: names and line totals only."
            : "Now printing: quantity, unit price and the per-unit split."
        }
      />
      <ToggleRow
        label="Labor-only proposal"
        hint="Suppress material rows so the proposal reads as a pure labor quote."
        on={options.laborOnly}
        onChange={(v) => onChange({ laborOnly: v })}
        effect={
          options.laborOnly
            ? suppressedCount === 0
              ? "No material-only rows to suppress — the price is unchanged."
              : `Suppressing ${suppressedCount} row${suppressedCount === 1 ? "" : "s"} · ${money(suppressedBase)} out of the quote.`
            : suppressedCount === 0
              ? "Would suppress 0 rows — every line carries labor."
              : `Would suppress ${suppressedCount} row${suppressedCount === 1 ? "" : "s"}.`
        }
      />
      <ToggleRow
        label="Show signature lines"
        hint="Add signature blocks at the foot of the proposal for you and the client."
        on={options.showSignature}
        onChange={(v) => onChange({ showSignature: v })}
        effect={
          options.showSignature
            ? "Two signature blocks print at the foot."
            : "No signature blocks print."
        }
      />
      <ToggleRow
        label="Show scope of work"
        hint="Include the scope text on the PDF. Turn off for ultra-compact proposals."
        on={options.showScope}
        onChange={(v) => onChange({ showScope: v })}
        effect={
          options.showScope ? "The scope section prints." : "The scope section does not print."
        }
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   08 · TERMS & CONDITIONS
   ══════════════════════════════════════════════════════════════ */

export function TermsBlock({
  terms,
  template,
  onChange,
}: {
  terms: string;
  template: string;
  onChange: (next: string) => void;
}) {
  const empty = terms.trim().length === 0;

  return (
    <div className={styles.stack}>
      {/* The template control stays available even once the field has content.
          Hiding it after first use would make "start over from the house
          wording" a thing you can only do by deleting every character first. */}
      <div className={styles.templateRow}>
        <span className={styles.templateCopy}>
          {empty
            ? "Nothing here yet, so no terms print. Start from the house template and edit it."
            : "The house template is still available — inserting it replaces what is written below."}
        </span>
        <button type="button" className={styles.act} onClick={() => onChange(template)}>
          <Ic name="file" />
          {empty ? "Insert starter template" : "Replace with template"}
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.lab}>Terms</span>
        <TextArea
          value={terms}
          onChange={onChange}
          rows={6}
          placeholder="Payment terms, change-order policy, warranty, dispute resolution…"
        />
      </label>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   09 · FILES & DOCUMENTS
   ══════════════════════════════════════════════════════════════ */

export function FilesBlock({
  files,
  onChange,
}: {
  files: StagedFile[];
  onChange: (next: StagedFile[]) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Local only — the browser hands us name and size, and that is all this page
   *  ever reads. Nothing is uploaded; there is no endpoint. */
  function stage(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next = Array.from(list).map((f) => ({
      id: newId("fl"),
      name: f.name,
      size: f.size,
    }));
    onChange([...files, ...next]);
  }

  return (
    <>
      <div
        className={cx(styles.drop, over && styles.isOver)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          stage(e.dataTransfer.files);
        }}
      >
        <Ic name="imgadd" />
        <div className={styles.dropTxt}>
          Drop files here, or{" "}
          <button type="button" className={styles.link} onClick={() => inputRef.current?.click()}>
            browse
          </button>
        </div>
        <div className={styles.dropSub}>
          PDFs, images, CAD exports — anything that helps the client see the job.
        </div>
        <input
          ref={inputRef}
          className={styles.srOnly}
          type="file"
          multiple
          aria-label="Choose files to attach"
          onChange={(e) => {
            stage(e.target.files);
            // Clearing lets the same file be chosen twice in a row, which
            // otherwise fires no change event at all.
            e.target.value = "";
          }}
        />
      </div>

      {files.length === 0 ? (
        <p className={styles.noFile}>No file chosen</p>
      ) : (
        <div className={styles.fileList}>
          {files.map((f) => (
            <div className={styles.fileRow} key={f.id}>
              <Ic name="file" />
              <span className={styles.fileName}>{f.name}</span>
              <span className={styles.fileSize}>{fileSize(f.size)}</span>
              <IconBtn
                icon="x"
                danger
                label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((x) => x.id !== f.id))}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   01 · BASICS — the title and description fields
   ══════════════════════════════════════════════════════════════ */

export function TitleField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.lab}>Proposal title</span>
      <TextIn
        value={value}
        onChange={onChange}
        placeholder="Patel Residence — Roof Replacement"
      />
      <span className={styles.hint}>Heads the client&apos;s copy and names it in your list.</span>
    </label>
  );
}

export function DescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.lab}>Description</span>
      <TextArea
        value={value}
        onChange={onChange}
        rows={3}
        placeholder="One-paragraph overview your client will see first."
      />
    </label>
  );
}
