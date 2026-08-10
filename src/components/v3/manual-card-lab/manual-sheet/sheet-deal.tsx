"use client";

// CHAPTERS — chapter 4, "The deal": brief sections 08 (payment schedule) and
// 09 (files & documents).
//
// Route: /dashboard/manual-sheet.
//
// The two attachments to the price: how it gets paid, and what travels with it.
// Neither is arithmetic and neither is prose, which is why they are together and
// not with either.
//
// THE COVERAGE METER IS THE ONLY STATUS COLOUR IN THE CHAPTER, and it earns it:
// a schedule that does not add up to the total is a real defect that changes
// what the user does next, which is the brief's whole test for keeping a state
// marker. It is a 6px bar plus one line of text — under / balanced / over — and
// it is deliberately NOT a badge in the card header, because a header badge
// would be read as decoration by the third card that had one.
//
// The meter reads against the grand total WITH tax, which is what the client
// actually pays and therefore what a deposit is a percentage of. That figure is
// computed two chapters up; nothing here recomputes it.
//
// Files stage and nothing uploads. The foot says so in four words rather than
// pretending a progress bar, because a fake success state in a lab build is how
// a reviewer ends up signing off on a feature that does not exist.

import type { Draft, Installment, StagedFile, Totals } from "../manual-focus/manual-focus-types";
import {
  coverState,
  coveredAmount,
  fileSize,
  installmentValue,
  money,
  newId,
} from "../manual-focus/manual-focus-math";
import s from "./manual-sheet.module.css";
import { BlockHead, Btn, Cross, Field, NumIn, Seg, TextIn } from "./sheet-ui";

/** Rotating stand-ins for "Add file". Real names, so the row looks like a row. */
const FILE_POOL: { name: string; size: number; kind: string }[] = [
  { name: "hail-report-2026-07-18.pdf", size: 1_284_096, kind: "application/pdf" },
  { name: "roof-photos-north-slope.zip", size: 8_741_888, kind: "application/zip" },
  { name: "manufacturer-warranty.pdf", size: 312_320, kind: "application/pdf" },
  { name: "permit-application-signed.pdf", size: 204_800, kind: "application/pdf" },
];

/** Three words, one per real state. "Balanced" rather than "Exact" because the
 *  math allows a cent of slack and calling that exact would be a lie. */
const COVER_WORD: Record<string, string> = {
  under: "Under",
  exact: "Balanced",
  over: "Over",
  none: "",
};

export function ChapterDeal({
  draft,
  patch,
  totals,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  totals: Totals;
}) {
  const total = totals.total;
  const covered = coveredAmount(draft.installments, total);
  const state = coverState(draft.installments, total);
  const ratio = total > 0 ? Math.min(1, covered / total) : 0;

  const setInst = (id: string, p: Partial<Installment>) =>
    patch({
      installments: draft.installments.map((i) => (i.id === id ? { ...i, ...p } : i)),
    });

  const addInst = () =>
    patch({
      installments: [
        ...draft.installments,
        { id: newId("in"), label: "", amount: 0, isPercent: true },
      ],
    });

  const removeInst = (id: string) =>
    patch({ installments: draft.installments.filter((i) => i.id !== id) });

  const addFile = () => {
    const pick = FILE_POOL[draft.files.length % FILE_POOL.length];
    const staged: StagedFile = { id: newId("fl"), ...pick };
    patch({ files: [...draft.files, staged] });
  };

  const removeFile = (id: string) => patch({ files: draft.files.filter((f) => f.id !== id) });

  const fillClass =
    state === "under"
      ? s.meterFillUnder
      : state === "exact"
        ? s.meterFillExact
        : state === "over"
          ? s.meterFillOver
          : undefined;

  const stateClass =
    state === "under"
      ? s.stateUnder
      : state === "exact"
        ? s.stateExact
        : state === "over"
          ? s.stateOver
          : undefined;

  return (
    <>
      {/* ---- 08 PAYMENT SCHEDULE ---- */}
      <div className={s.block}>
        <BlockHead num="08" name="Payment schedule" />

        <div>
          {draft.installments.map((inst) => (
            <div key={inst.id} className={s.instRow}>
              <div className={s.instLabel}>
                <Field label="Stage">
                  {(id) => (
                    <TextIn
                      id={id}
                      value={inst.label}
                      onChange={(v) => setInst(inst.id, { label: v })}
                      placeholder="When is it due?"
                    />
                  )}
                </Field>
              </div>

              <div className={s.instAmt}>
                <Field label="Amount">
                  {(id) => (
                    <NumIn
                      id={id}
                      value={inst.amount}
                      onChange={(v) => setInst(inst.id, { amount: v })}
                      prefix={inst.isPercent ? undefined : "$"}
                      suffix={inst.isPercent ? "%" : undefined}
                    />
                  )}
                </Field>
              </div>

              <div className={s.instMode}>
                <Seg
                  ariaLabel="Percent or dollars"
                  value={inst.isPercent ? "pct" : "usd"}
                  options={[
                    { value: "pct", label: "%" },
                    { value: "usd", label: "$" },
                  ]}
                  onChange={(v) => setInst(inst.id, { isPercent: v === "pct" })}
                />
              </div>

              <div className={s.instValue}>{money(installmentValue(inst, total))}</div>

              <button
                type="button"
                className={[s.iconBtn, s.iconBtnDanger].join(" ")}
                aria-label="Remove installment"
                onClick={() => removeInst(inst.id)}
              >
                <Cross />
              </button>
            </div>
          ))}
        </div>

        <div className={s.linesFoot}>
          <span className={s.linesCount}>{draft.installments.length} installments</span>
          <Btn onClick={addInst}>Add installment</Btn>
        </div>

        <div className={s.meter}>
          <div
            className={s.meterTrack}
            role="meter"
            aria-label="Schedule coverage"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={[s.meterFill, fillClass].filter(Boolean).join(" ")}
              style={{ "--ms-cover": `${ratio * 100}%` } as React.CSSProperties}
            />
          </div>
          <div className={s.meterRead}>
            <span>
              {money(covered)} of {money(total)} scheduled
            </span>
            {state === "none" ? null : (
              <span className={[s.meterState, stateClass].filter(Boolean).join(" ")}>
                {COVER_WORD[state]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---- 09 FILES ---- */}
      <div className={s.block}>
        <BlockHead num="09" name="Files" />

        {draft.files.length === 0 ? (
          <p className={s.none}>Nothing attached.</p>
        ) : (
          <div>
            {draft.files.map((f) => (
              <div key={f.id} className={s.fileRow}>
                <span className={s.fileName}>{f.name}</span>
                <span className={s.fileSize}>{fileSize(f.size)}</span>
                <button
                  type="button"
                  className={[s.iconBtn, s.iconBtnDanger].join(" ")}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => removeFile(f.id)}
                >
                  <Cross />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={s.linesFoot}>
          <span className={s.linesCount}>Staged only — nothing uploads.</span>
          <Btn onClick={addFile}>Add file</Btn>
        </div>
      </div>
    </>
  );
}
