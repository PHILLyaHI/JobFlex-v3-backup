"use client";

// SPEC SHEET — SH-07 attachments and SH-08 issue options.
// Route /dashboard/manual-spec.
//
// WHY THESE TWO SIT LAST, JUST ABOVE THE ISSUED SHEET
// They are the only sheets that describe the DOCUMENT rather than the job, so
// they belong beside the document. It also puts every switch one glance from
// the thing it changes — and because SH-09 is still a scroll away, each switch
// prints, on its own value track, exactly what it is doing to SH-09 right now.
// A toggle whose consequence you have to go and look for is a toggle nobody
// trusts.
//
// FILES ARE LOCAL ONLY. The drop zone reads names and sizes off the
// DataTransfer and stages them in React state. Nothing is uploaded, nothing is
// read, and the file input itself is visually hidden because an OS file widget
// is the one control on a blueprint page that cannot be drawn.

import { useRef, useState } from "react";
import type { SpecFile, SpecOptions } from "./manual-spec-types";
import { fileSize, money, newId } from "./manual-spec-math";
import { Note, Row, cx } from "./spec-frame";
import styles from "./manual-spec.module.css";

/* ═════════════════════════════════════════════════════════════
   SH-08 — ISSUE OPTIONS
   ═════════════════════════════════════════════════════════════ */

type OptionKey = keyof SpecOptions;

/** The four toggles, with the live builder's own explanatory lines. */
const OPTIONS: { key: OptionKey; label: string; hint: string }[] = [
  {
    key: "hideBreakdownCosts",
    label: "Hide breakdown costs",
    hint: "Show only line totals on the proposal — keep the material / labor split internal.",
  },
  {
    key: "laborOnly",
    label: "Labor-only proposal",
    hint: "Suppress material rows so the proposal reads as a pure labor quote.",
  },
  {
    key: "showSignatureLines",
    label: "Show signature lines",
    hint: "Add signature blocks at the foot of the proposal for you and the client.",
  },
  {
    key: "showScopeOfWork",
    label: "Show scope of work",
    hint: "Include the scope text on the PDF. Turn off for ultra-compact proposals.",
  },
];

export function OptionRows({
  options,
  /** Live facts about SH-09, so each switch can state its own consequence. */
  issuedLines,
  issuedSubtotal,
  scopeWords,
  onToggle,
}: {
  options: SpecOptions;
  issuedLines: number;
  issuedSubtotal: number;
  scopeWords: number;
  onToggle: (key: OptionKey) => void;
}) {
  function effect(key: OptionKey): string {
    switch (key) {
      case "hideBreakdownCosts":
        return options.hideBreakdownCosts
          ? "SH-09 · qty and unit columns removed — amounts only"
          : "SH-09 · qty, unit price and amount all printed";
      case "laborOnly":
        return options.laborOnly
          ? `SH-09 · material excluded · ${issuedLines} line${issuedLines === 1 ? "" : "s"} · subtotal ${money(issuedSubtotal)}`
          : `SH-09 · material and labor both priced · subtotal ${money(issuedSubtotal)}`;
      case "showSignatureLines":
        return options.showSignatureLines
          ? "SH-09 · two signature blocks at the foot"
          : "SH-09 · no signature blocks";
      case "showScopeOfWork":
        return options.showScopeOfWork
          ? scopeWords > 0
            ? `SH-09 · scope of work printed · ${scopeWords} words`
            : "SH-09 · scope section printed, but nothing is written yet"
          : "SH-09 · scope of work omitted";
      default:
        return "";
    }
  }

  return (
    <>
      {OPTIONS.map((opt) => {
        const on = options[opt.key];
        const hintId = `spec-opt-${opt.key}-hint`;
        return (
          <Row key={opt.key} label={opt.label}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              // The switch's NAME is the option; its explanatory line and its
              // live effect on SH-09 are its description, so a screen reader
              // hears "Labor-only proposal, switch, on" and then why.
              aria-label={opt.label}
              aria-describedby={hintId}
              className={styles.swRow}
              onClick={() => onToggle(opt.key)}
            >
              <span className={cx(styles.sw, on && styles.swOn)} aria-hidden="true" />
              <span className={styles.swCopy} id={hintId}>
                <span className={styles.swHint}>{opt.hint}</span>
                <span className={cx(styles.swEffect, !on && styles.isOff)}>{effect(opt.key)}</span>
              </span>
            </button>
          </Row>
        );
      })}
    </>
  );
}

/* ═════════════════════════════════════════════════════════════
   SH-07 — ATTACHMENTS
   ═════════════════════════════════════════════════════════════ */

export function FileRows({
  files,
  onAdd,
  onRemove,
}: {
  files: SpecFile[];
  onAdd: (next: SpecFile[]) => void;
  onRemove: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Name and size only. The bytes are never read and never leave the page. */
  function stage(list: FileList | null) {
    if (!list || list.length === 0) return;
    onAdd(
      Array.from(list).map((f) => ({ id: newId("fl"), name: f.name, size: f.size })),
    );
  }

  return (
    <>
      <Row
        label="Drop zone"
        hint="Staged in the browser only. This lab page has no data layer, so nothing is uploaded."
      >
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
          <svg className="ic" aria-hidden="true">
            <use href="#i-file" />
          </svg>
          <p className={styles.dropTxt}>
            Drop files here, or{" "}
            <button
              type="button"
              className={styles.link}
              onClick={() => inputRef.current?.click()}
            >
              browse
            </button>
          </p>
          <p className={styles.dropSub}>
            PDFs, images, CAD exports — anything that helps the client see the job.
          </p>
          <input
            ref={inputRef}
            className={styles.fileIn}
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
      </Row>

      <Row label="Attached" sub={`· ${files.length}`}>
        {files.length === 0 ? (
          <Note kicker="No file chosen">
            Nothing rides along with this proposal yet.
          </Note>
        ) : (
          <div>
            {files.map((f) => (
              <div className={styles.fileRow} key={f.id}>
                <svg className="ic" aria-hidden="true">
                  <use href="#i-file" />
                </svg>
                <span className={styles.fileName}>{f.name}</span>
                <span className={styles.fileSize}>{fileSize(f.size)}</span>
                <button
                  type="button"
                  className={cx(styles.iconBtn, styles.isDanger)}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onRemove(f.id)}
                >
                  <svg className="ic">
                    <use href="#i-x" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Row>
    </>
  );
}
