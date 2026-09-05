"use client";

// QUIET — cards 06, 07 and 09: the three short cards.
//
// They are short on purpose. Variant A's stated risk is ten equal grey slabs,
// and the answer is not decoration — it is letting a card that contains four
// switches be four switches tall. Rhythm comes from honest height.
//
// The "what prints" toggles read POSITIVE even where the stored flag is
// negative (`hideBreakdown`), because a switch labelled "Hide costs" in the ON
// position is a double negative the user has to decode every time they look at
// it. Quote style is the odd one out and gets a two-word segmented control
// rather than a switch, since "full" and "summary" are two named things and
// neither is the absence of the other.
//
// ── WHY THE THREE SWITCHES ARE A ROW AND NOT A LADDER ────────
// They were four stacked full-width rows, which made a card of four unrelated
// sentences you had to read top to bottom to find the one you wanted. The three
// switches are not a sequence — they are three independent yes/no facts about
// the same sheet — so they are now three cells of one row, divided by rules,
// scannable in a single horizontal sweep.
//
// Quote style stays on its own row above them, because it is the only control
// here that is not a yes/no: it picks between two named documents, and folding
// it into the grid would claim a symmetry that does not exist.
//
// 2026-09-05 (owner): quote style (labor-only) and scope of work moved to
// card 04, beside the cost sliders they belong with. Two switches remain.
//
// The labels lost their verbs with the layout. "Print the scope of work" in a
// third of the measure wraps to three lines and repeats a word the card title
// ("What prints") has already said; "Scope of work" says the same thing in one
// line, and the switch supplies the verb.
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
    <div className={styles.toggles}>
      <div className={styles.switchRow}>
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
