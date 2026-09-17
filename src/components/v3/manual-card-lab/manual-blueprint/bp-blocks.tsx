"use client";

// MANUAL PROPOSAL — document options and attachments.
// Card 06 is "Show to client" (owner, 2026-09-17): ONE choice about the price
// — every line as one total, or each line with its labor and material shown —
// and two switches for the scope and the signature lines. The old "Labor-only
// proposal" switch is gone from this builder: it quoted labor alone (the
// client buys the materials) and was read as "show one total per line", so a
// $6,000 job went out at $3,456. What the client sees is a presentation
// choice here; it never changes the price. The options patch the same stored
// proposal options used by the totals, client copy and PDF. The labels read
// positively even for the negative `hideBreakdown` flag.
//
// Files are staged from a real <input type="file">: the name and size are read
// off the File object and nothing is uploaded, because there is no endpoint.
// That is honest in a way a fake progress bar is not.

import type { ProposalOptions, StagedFile } from "../manual-focus/manual-focus-types";
import { fileSize, newId } from "../manual-focus/manual-focus-math";
import styles from "./manual-blueprint.module.css";
import { Btn, Ic, IconBtn, Segmented, ToggleCell, cx } from "./bp-ui";
import { useRef } from "react";

/* ============================================================
   06 — SHOW TO CLIENT
   ============================================================ */

export type PriceView = "totals" | "split";

export function PrintOptions({
  options,
  onPatch,
}: {
  options: ProposalOptions;
  onPatch: (patch: Partial<ProposalOptions>) => void;
}) {
  const view: PriceView = options.hideBreakdown ? "totals" : "split";
  return (
    <div className={cx(styles.toggles, styles.printOptions)}>
      {/* The one real choice: how each line's price reads. Both print the
          same total — this never changes what the client pays. */}
      <Segmented<PriceView>
        label="Price per line"
        value={view}
        options={[
          { value: "totals", label: "Totals only" },
          { value: "split", label: "Labor + material breakdown" },
        ]}
        onChange={(v) => onPatch({ hideBreakdown: v === "totals", laborOnly: false })}
      />
      <div className={styles.switchRow}>
        <ToggleCell
          label="Scope of work"
          on={options.showScope}
          onChange={(on) => onPatch({ showScope: on })}
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
