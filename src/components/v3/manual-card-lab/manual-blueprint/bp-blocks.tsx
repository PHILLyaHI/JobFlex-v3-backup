"use client";

// MANUAL PROPOSAL — document options and attachments.
// All four document options live together in "What prints". They patch the
// same stored proposal options used by the totals, client copy and PDF.
// The labels read positively even for the negative `hideBreakdown` flag.
// Desktop uses a ruled row; handheld stacks the same switches.
//
// Files are staged from a real <input type="file">: the name and size are read
// off the File object and nothing is uploaded, because there is no endpoint.
// That is honest in a way a fake progress bar is not.

import type { ProposalOptions, StagedFile } from "../manual-focus/manual-focus-types";
import { fileSize, newId } from "../manual-focus/manual-focus-math";
import styles from "./manual-blueprint.module.css";
import { Btn, Ic, IconBtn, ToggleCell, cx } from "./bp-ui";
import { useRef } from "react";

/* ============================================================
   06 — WHAT PRINTS
   ============================================================ */

export function PrintOptions({
  options,
  onPatch,
}: {
  options: ProposalOptions;
  onPatch: (patch: Partial<ProposalOptions>) => void;
}) {
  return (
    <div className={cx(styles.toggles, styles.printOptions)}>
      <div className={styles.switchRow}>
        <ToggleCell
          label="Labor-only proposal"
          on={options.laborOnly}
          onChange={(on) => onPatch({ laborOnly: on })}
        />
        <ToggleCell
          label="Scope of work"
          on={options.showScope}
          onChange={(on) => onPatch({ showScope: on })}
        />
        <ToggleCell
          label="Cost breakdown per line"
          on={!options.hideBreakdown}
          onChange={(on) => onPatch({ hideBreakdown: !on })}
        />
        <ToggleCell
          label="Signature lines"
          on={options.showSignature}
          onChange={(on) => onPatch({ showSignature: on })}
        />
      </div>
    </div>
  );
}

/* ============================================================
   09 — FILES
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <div>
        {files.map((f, i) => (
          <div key={f.id} className={cx(styles.fileRow, i === 0 && styles.fileFirst)}>
            <Ic name="file" />
            <span className={styles.fileName}>{f.name}</span>
            <span className={styles.fileSize}>{fileSize(f.size)}</span>
            <IconBtn label={`Remove ${f.name}`} icon="x" onClick={() => onRemove(f.id)} />
          </div>
        ))}
        {files.length === 0 ? <div className={styles.empty}>Nothing attached.</div> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).map((f) => ({
            id: newId("fl"),
            name: f.name,
            size: f.size,
            kind: f.type,
          }));
          if (picked.length > 0) onAdd(picked);
          // Reset, or picking the same file twice in a row fires nothing.
          e.target.value = "";
        }}
      />
      <Btn tone="add" icon="plus" onClick={() => inputRef.current?.click()}>
        Attach a file
      </Btn>
    </>
  );
}
