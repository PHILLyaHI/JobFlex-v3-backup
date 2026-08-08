"use client";

// FOCUS CARD — cards 06, 08 and 09 (route: /dashboard/manual-focus).
//   06 What prints    — the four proposal options
//   08 Payment        — the installment schedule and its reconciliation
//   09 Files          — locally staged attachments
//
// WHAT PRINTS. Each toggle carries its spec hint AND a second, live line saying
// what it is doing to the client's copy right now — "Per-line material / labor
// split is PRINTED" flips to "…is HIDDEN" as the switch moves. A toggle whose
// only feedback is somewhere else on the page is a toggle people flip twice to
// find out what it did. All four genuinely change the sheet in card 10; the
// stood-down face of card 10 restates them too, so the effect is legible even
// when the sheet is not the live card.
//
// PAYMENT. The live builder never says whether the installments add up. This
// one does — under, exact or over, in the status palette, against the real
// grand total. A percentage is meaningless until a total exists, so the dollar
// echo on each row only appears once one does.
//
// FILES. Local only. `File` objects are read for their name, size and type and
// then dropped on the floor; nothing is uploaded, because there is no endpoint
// on this page and inventing one would be a data-layer change.
//
// FIXTURE-ONLY. Component-local state throughout; no `@/actions/*`, no Prisma,
// no network.

import { useRef, useState } from "react";
import type { Installment, ProposalOptions, StagedFile } from "./manual-focus-types";
import type { CoverState } from "./manual-focus-math";
import {
  coveredAmount,
  fileSize,
  installmentValue,
  money,
  newId,
  pct,
} from "./manual-focus-math";
import { AddBtn, Empty, Ic, IconBtn, NumIn, SwitchRow, cx } from "./focus-ui";
import styles from "./manual-focus.module.css";

/* ============================================================
   06 · WHAT PRINTS
   ============================================================ */

export function OptionsBlock({
  options,
  onChange,
}: {
  options: ProposalOptions;
  onChange: (patch: Partial<ProposalOptions>) => void;
}) {
  return (
    <div className={styles.togList}>
      {/* THREE-WAY, not two. The labor-only layout drops the per-line split on
          its own (see `lean` in focus-proof.tsx), so with that switch on this
          one changes nothing at all — and a live consequence line that claims
          "every printed line shows its material and labor per unit" while the
          sheet prints no such thing is the exact failure the effect line was
          added to prevent. */}
      <SwitchRow
        label="Hide breakdown costs"
        hint="Show only line totals on the proposal — keep the material / labor split internal."
        checked={options.hideBreakdown}
        onChange={(v) => onChange({ hideBreakdown: v })}
        effect={
          options.laborOnly
            ? "Now: the labor-only layout already suppresses the split — this switch changes nothing."
            : options.hideBreakdown
              ? "Now: the per-unit material / labor line is hidden on the sheet."
              : "Now: every printed line shows its material and labor per unit."
        }
      />
      <SwitchRow
        label="Labor-only proposal"
        hint="Suppress material rows so the proposal reads as a pure labor quote."
        checked={options.laborOnly}
        onChange={(v) => onChange({ laborOnly: v })}
        effect={
          options.laborOnly
            ? "Now: quantity and unit-price columns are gone, and the sheet is stamped LABOR ONLY."
            : "Now: the sheet prints as a full quote, quantities and unit prices included."
        }
      />
      <SwitchRow
        label="Show signature lines"
        hint="Add signature blocks at the foot of the proposal for you and the client."
        checked={options.showSignature}
        onChange={(v) => onChange({ showSignature: v })}
        effect={
          options.showSignature
            ? "Now: two signature blocks close the sheet."
            : "Now: the sheet ends at the payment schedule."
        }
      />
      <SwitchRow
        label="Show scope of work"
        hint="Include the scope text on the PDF. Turn off for ultra-compact proposals."
        checked={options.showScope}
        onChange={(v) => onChange({ showScope: v })}
        effect={
          options.showScope
            ? "Now: the scope of work is printed in full."
            : "Now: the scope stays in your workspace and is not printed."
        }
      />
    </div>
  );
}

/* ============================================================
   08 · PAYMENT SCHEDULE
   ============================================================ */

const COVER_COPY: Record<CoverState, string> = {
  none: "Add an installment to schedule the payments",
  under: "Short of the total",
  exact: "Covers the total exactly",
  over: "Over the total",
};

/**
 * `coverState` returns "none" for two different situations — no installments at
 * all, and installments against a total of $0 (clear the name off every line and
 * you are there in three clicks, which the seeded unnamed row already teaches).
 * The copy is split here rather than in `coverState`: the state machine has four
 * honest states and does not need a fifth, but "Add an installment" is a lie
 * with three of them sitting directly above the meter.
 */
export function coverCopy(state: CoverState, installmentCount: number, total: number): string {
  if (state === "none" && installmentCount > 0) {
    return `Nothing to cover yet — the total is ${money(total)}`;
  }
  return COVER_COPY[state];
}

export function PaymentBlock({
  installments,
  total,
  state,
  onPatch,
  onAdd,
  onRemove,
}: {
  installments: Installment[];
  /** The grand total WITH tax — what the client actually pays. */
  total: number;
  state: CoverState;
  onPatch: (id: string, patch: Partial<Installment>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const covered = coveredAmount(installments, total);
  // The bar can only draw as far as full; how far PAST full a schedule runs is
  // said in words and in the danger palette, not in a bar that overflows its
  // own frame. So one clamp, at 1, and no second one further down.
  const ratio = total > 0 ? Math.min(covered / total, 1) : 0;

  return (
    <div className={styles.stack}>
      {installments.length > 0 ? (
        <div className={styles.instList}>
          {installments.map((inst, index) => (
            <div className={styles.instRow} key={inst.id}>
              <span className={styles.instPos} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>

              <input
                type="text"
                className={cx(styles.lineIn, styles.instLab)}
                value={inst.label}
                placeholder="Deposit, Start of work, Completion…"
                aria-label={`Label for installment ${index + 1}`}
                onChange={(e) => onPatch(inst.id, { label: e.target.value })}
              />

              <NumIn
                value={inst.amount}
                onChange={(v) => onPatch(inst.id, { amount: v })}
                ariaLabel={`Amount for installment ${index + 1}`}
                className={styles.lineIn}
              />

              {/* Two options never earn a menu. */}
              <span
                className={styles.seg}
                role="group"
                aria-label={`Amount type for installment ${index + 1}`}
              >
                <button
                  type="button"
                  className={cx(styles.segBtn, inst.isPercent && styles.segOn)}
                  aria-pressed={inst.isPercent}
                  onClick={() => onPatch(inst.id, { isPercent: true })}
                >
                  %
                </button>
                <button
                  type="button"
                  className={cx(styles.segBtn, !inst.isPercent && styles.segOn)}
                  aria-pressed={!inst.isPercent}
                  onClick={() => onPatch(inst.id, { isPercent: false })}
                >
                  $
                </button>
              </span>

              {/* A percentage means nothing until a total exists, which is why
                  this figure only appears once one does. */}
              <span className={total > 0 ? styles.instCalc : styles.instCalcOff}>
                {total > 0 ? money(installmentValue(inst, total)) : "no total yet"}
              </span>

              <IconBtn
                icon="trash"
                label={`Remove installment ${index + 1}`}
                onClick={() => onRemove(inst.id)}
                danger
              />
            </div>
          ))}
        </div>
      ) : (
        <Empty kicker="No installments">
          The client pays in full on completion unless you schedule it here.
        </Empty>
      )}

      <AddBtn onClick={onAdd}>Add installment</AddBtn>

      <div className={cx(styles.cover, styles[`cv_${state}` as const])}>
        <span className={styles.coverBar} aria-hidden="true">
          <span className={styles.coverFill} style={{ width: `${ratio * 100}%` }} />
        </span>
        <span className={styles.coverTxt}>
          {money(covered)} of {money(total)} · {coverCopy(state, installments.length, total)}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   09 · FILES
   ============================================================ */

export function FilesBlock({
  files,
  onAdd,
  onRemove,
}: {
  files: StagedFile[];
  onAdd: (staged: StagedFile[]) => void;
  onRemove: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Read name / size / type and discard the File itself. Nothing is uploaded
   *  or held in memory — this page has no endpoint and no data layer. */
  function stage(list: FileList | null) {
    if (!list || list.length === 0) return;
    onAdd(
      Array.from(list).map((f) => ({
        id: newId("fl"),
        name: f.name,
        size: f.size,
        kind: f.type || "application/octet-stream",
      })),
    );
  }

  return (
    <div className={styles.stack}>
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
        <p className={styles.dropTxt}>
          Drop files here, or{" "}
          <button type="button" className={styles.link} onClick={() => inputRef.current?.click()}>
            browse
          </button>
        </p>
        <p className={styles.dropSub}>
          PDFs, images, CAD exports — anything that helps the client see the job.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className={styles.srOnly}
          // Out of the tab order: it is 1px square, so a focus ring on it would
          // be invisible. The visible "browse" button above is the keyboard
          // route in, and it opens this control by clicking it.
          tabIndex={-1}
          aria-label="Choose files to attach"
          onChange={(e) => {
            stage(e.target.files);
            // Clear the control so choosing the same file twice still fires.
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className={styles.fileList}>
          {files.map((f) => (
            <div className={styles.fileRow} key={f.id}>
              <Ic name="file" />
              <span className={styles.fileName}>{f.name}</span>
              <span className={styles.fileSize}>{fileSize(f.size)}</span>
              <IconBtn
                icon="x"
                label={`Remove ${f.name}`}
                onClick={() => onRemove(f.id)}
                danger
              />
            </div>
          ))}
        </div>
      ) : (
        <Empty kicker="No file chosen">
          Nothing is attached yet. Files staged here stay in this browser — this lab page
          uploads nothing.
        </Empty>
      )}
    </div>
  );
}

/** Exported for the summary faces: "30 / 30 / 40" from the seeded schedule. */
export function scheduleShape(installments: Installment[]): string {
  if (installments.length === 0) return "None";
  return installments.map((i) => (i.isPercent ? pct(i.amount) : money(i.amount))).join(" / ");
}
