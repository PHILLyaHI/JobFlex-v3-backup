"use client";

// WORKLIST — cards 06 (scope & notes), 07 (terms) and 08 (files).
//
// The three cards that close a proposal out. Grouped in one file because each
// is a single field plus its escape hatch, and three one-field modules would be
// three files to open to read nine lines.
//
// CARD 08's DONE-CONDITION IS AN ACKNOWLEDGEMENT, AND THAT IS DELIBERATE
// Attachments are optional. An optional section has no natural finish line, so
// on a page whose entire premise is "what is left", it would sit above the seam
// forever and quietly make the worklist a liar. The finish line is therefore an
// explicit "attachments are final" — which is a real decision a contractor
// makes, and the only one available that is honest about being optional.
//
// Nothing is uploaded. There is no endpoint here and there is not going to be
// one: the drop zone reads name, size and type off the `File` objects and keeps
// them in component state.

import { useRef, useState } from "react";
import type { Draft, StagedFile } from "./worklist-types";
import { TERMS_TEMPLATE } from "./worklist-data";
import { fileSize, newId } from "./worklist-math";
import { Field, Icon, cx } from "./worklist-ui";
import styles from "./manual-worklist.module.css";

/* ============================================================
   CARD 06 — SCOPE & NOTES
   ============================================================ */

export function ScopeBody({
  draft,
  onPatch,
}: {
  draft: Draft;
  onPatch: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className={styles.stack}>
      <Field
        label="Scope of work"
        hint="What you are actually going to do, in the order you are going to do it. This is the paragraph that stops the argument in week three."
      >
        {(id) => (
          <textarea
            id={id}
            className={cx(styles.ta, styles.taTall)}
            value={draft.scopeOfWork}
            placeholder="Remove existing shingles, install underlayment…"
            onChange={(e) => onPatch({ scopeOfWork: e.target.value })}
          />
        )}
      </Field>

      <Field
        label="Notes"
        optional
        hint="Internal by default. Access, parking, the dog, what the homeowner asked for on the phone."
      >
        {(id) => (
          <textarea
            id={id}
            className={styles.ta}
            value={draft.notes}
            placeholder="Warranty, assumptions, exclusions…"
            onChange={(e) => onPatch({ notes: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

/* ============================================================
   CARD 07 — TERMS & CONDITIONS
   ============================================================ */

export function TermsBody({
  draft,
  onPatch,
}: {
  draft: Draft;
  onPatch: (patch: Partial<Draft>) => void;
}) {
  const empty = draft.terms.trim().length === 0;

  return (
    <div className={styles.stack}>
      {empty && (
        <div className={styles.offer}>
          <p>
            Nothing written yet. The starter template covers payment, change
            orders, workmanship and validity — edit it into your own words.
          </p>
          <button
            type="button"
            className={cx(styles.btn, styles.btnPrimary)}
            onClick={() => onPatch({ terms: TERMS_TEMPLATE })}
          >
            <Icon name="file" />
            Insert starter template
          </button>
        </div>
      )}

      <Field
        label="Terms"
        hint="Prints at the foot of the proposal, above the signature blocks."
      >
        {(id) => (
          <textarea
            id={id}
            className={cx(styles.ta, styles.taTall)}
            value={draft.terms}
            placeholder="Payment terms, change-order policy, warranty, dispute resolution…"
            onChange={(e) => onPatch({ terms: e.target.value })}
          />
        )}
      </Field>

      {!empty && (
        <div className={styles.inlineActs}>
          <button
            type="button"
            className={styles.quietBtn}
            onClick={() => onPatch({ terms: TERMS_TEMPLATE })}
          >
            <Icon name="undo" />
            Replace with the starter template
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CARD 08 — FILES & DOCUMENTS
   ============================================================ */

export function FilesBody({
  draft,
  onPatch,
}: {
  draft: Draft;
  onPatch: (patch: Partial<Draft>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function stage(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added: StagedFile[] = Array.from(list).map((f) => ({
      id: newId("fl"),
      name: f.name,
      size: f.size,
      kind: f.type || "file",
    }));
    onPatch({ files: [...draft.files, ...added], filesConfirmed: false });
  }

  return (
    <div className={styles.stack}>
      <div
        className={cx(styles.drop, dragging && styles.isDragging)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          stage(e.dataTransfer.files);
        }}
      >
        <Icon name="imgadd" />
        <p className={styles.dropLead}>
          Drop files here, or{" "}
          <button
            type="button"
            className={styles.linkBtn}
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
          className={styles.srOnly}
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            stage(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {draft.files.length === 0 ? (
        <p className={styles.empty}>No file chosen.</p>
      ) : (
        <ul className={styles.fileList}>
          {draft.files.map((f) => (
            <li key={f.id} className={styles.fileRow}>
              <Icon name="file" />
              <span className={styles.fileName}>{f.name}</span>
              <span className={cx(styles.fileSize, styles.num)}>{fileSize(f.size)}</span>
              <button
                type="button"
                className={cx(styles.iconBtn, styles.iconDanger)}
                onClick={() =>
                  onPatch({
                    files: draft.files.filter((x) => x.id !== f.id),
                    filesConfirmed: false,
                  })
                }
              >
                <span className={styles.srOnly}>Remove {f.name}</span>
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.hint}>
        Nothing is uploaded. This lab page has no data layer, so files stay in
        this browser tab and go no further.
      </p>

      {draft.filesConfirmed ? (
        <div className={styles.confirmRow}>
          <span className={styles.okNote}>
            {draft.files.length === 0
              ? "Nothing to attach — confirmed."
              : `${draft.files.length} attachment${draft.files.length === 1 ? "" : "s"} confirmed.`}
          </span>
          <button
            type="button"
            className={styles.quietBtn}
            onClick={() => onPatch({ filesConfirmed: false })}
          >
            <Icon name="undo" />
            Not final after all
          </button>
        </div>
      ) : (
        <div className={styles.confirmRow}>
          <button
            type="button"
            className={cx(styles.btn, styles.btnPrimary)}
            onClick={() => onPatch({ filesConfirmed: true })}
          >
            <Icon name="check" />
            {draft.files.length === 0 ? "Nothing to attach" : "Attachments are final"}
          </button>
          <span className={styles.hint}>
            Attachments are optional — say so and this card settles.
          </span>
        </div>
      )}
    </div>
  );
}
