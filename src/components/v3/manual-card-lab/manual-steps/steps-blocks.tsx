"use client";

// STEPS — sections 05 (Scope), 06 (What prints), 07 (Terms), 09 (Files).
//
// THE FOUR SIMPLE CARDS, AND WHY THEY STAY SIMPLE.
// Every one of these was a card with a paragraph of explanation in the build
// that got rejected. A textarea does not need a sentence telling you it is a
// textarea. What survives is: a two-word label, the control, and — only where
// the control has a consequence the user cannot see — one clause of six words
// or fewer. "Nothing uploads." is the entire help text on Files, and it is the
// only thing about that card a user could not work out by looking.
//
// 06 · THE TOGGLE LABELS ARE WRITTEN IN THE POSITIVE.
// `hideBreakdown` is stored as a negative because that is the live builder's
// field, and a switch labelled "Hide cost breakdown" that is OFF when costs are
// shown is a double negative the user has to unpick at a glance. The switch
// reads "Cost breakdown per line" and inverts on the way into the model.
//
// 07 · THE TEMPLATE BUTTON APPEARS ONLY WHEN THERE IS NOTHING TO OVERWRITE.
// An always-present "insert template" is one mis-click away from wiping terms
// somebody wrote by hand. Empty box: offer the template. Full box: offer Clear,
// which is undoable by re-inserting.

import type { Draft, StagedFile } from "../manual-focus/manual-focus-types";
import { TERMS_TEMPLATE } from "../manual-focus/manual-focus-data";
import { fileSize, newId } from "../manual-focus/manual-focus-math";
import { Block, Btn, Field, Fields, Glyph, IconBtn, Note, PATH, TextArea, Toggle } from "./steps-ui";
import type { Patch } from "./steps-pickers";
import s from "./manual-steps.module.css";

/* ══ 05 · SCOPE ═════════════════════════════════════════════════════════ */

export function ScopeCard({ draft, patch }: { draft: Draft; patch: Patch }) {
  return (
    <>
      <Block>
        <Fields>
          <Field label="Scope of work" htmlFor="st-scope">
            <TextArea
              id="st-scope"
              value={draft.scopeOfWork}
              onChange={(scopeOfWork) => patch({ scopeOfWork })}
              rows={8}
              placeholder="Everything the crew will actually do."
            />
          </Field>
        </Fields>
      </Block>

      <Block title="Internal notes">
        <Fields>
          <Field label="Only your crew sees this" htmlFor="st-notes">
            <TextArea
              id="st-notes"
              value={draft.notes}
              onChange={(notes) => patch({ notes })}
              rows={4}
              placeholder="Access, parking, what to leave alone."
            />
          </Field>
        </Fields>
      </Block>
    </>
  );
}

/* ══ 06 · WHAT PRINTS ═══════════════════════════════════════════════════ */

export function PrintsCard({ draft, patch }: { draft: Draft; patch: Patch }) {
  const o = draft.options;
  return (
    <Block>
      <div className={s.toggles}>
        <Toggle
          label="Cost breakdown per line"
          on={!o.hideBreakdown}
          onChange={(on) => patch({ options: { ...o, hideBreakdown: !on } })}
        />
        <Toggle
          label="Summary quote"
          note="Drops quantities and unit prices."
          on={o.laborOnly}
          onChange={(laborOnly) => patch({ options: { ...o, laborOnly } })}
        />
        <Toggle
          label="Signature lines"
          on={o.showSignature}
          onChange={(showSignature) => patch({ options: { ...o, showSignature } })}
        />
        <Toggle
          label="Print scope of work"
          on={o.showScope}
          onChange={(showScope) => patch({ options: { ...o, showScope } })}
        />
      </div>
    </Block>
  );
}

/* ══ 07 · TERMS ═════════════════════════════════════════════════════════ */

export function TermsCard({ draft, patch }: { draft: Draft; patch: Patch }) {
  const empty = draft.terms.trim().length === 0;
  return (
    <Block>
      <Fields>
        <Field label="Terms & conditions" htmlFor="st-terms">
          <TextArea
            id="st-terms"
            value={draft.terms}
            onChange={(terms) => patch({ terms })}
            rows={9}
            placeholder="Nothing entered yet."
          />
        </Field>
      </Fields>

      <div className={s.blockActions}>
        {empty ? (
          <Btn variant="quiet" onClick={() => patch({ terms: TERMS_TEMPLATE })}>
            <Glyph d={PATH.plus} />
            Insert starter template
          </Btn>
        ) : (
          <Btn variant="quiet" onClick={() => patch({ terms: "" })}>
            Clear
          </Btn>
        )}
      </div>
    </Block>
  );
}

/* ══ 09 · FILES ═════════════════════════════════════════════════════════ */

/** Staged, never uploaded — there is no endpoint and pretending otherwise is
 *  the one dishonesty this lab page refuses. */
const SAMPLES: Omit<StagedFile, "id">[] = [
  { name: "hail-report-2026-07-18.pdf", size: 1_284_096, kind: "application/pdf" },
  { name: "roof-north-elevation.jpg", size: 2_104_320, kind: "image/jpeg" },
  { name: "shingle-warranty-30yr.pdf", size: 318_464, kind: "application/pdf" },
  { name: "permit-city-of-austin.pdf", size: 92_160, kind: "application/pdf" },
];

export function FilesCard({ draft, patch }: { draft: Draft; patch: Patch }) {
  function add() {
    const taken = new Set(draft.files.map((f) => f.name));
    const next = SAMPLES.find((f) => !taken.has(f.name)) ?? SAMPLES[0];
    if (!next) return;
    const name = taken.has(next.name) ? `copy-of-${next.name}` : next.name;
    patch({ files: [...draft.files, { ...next, name, id: newId("fl") }] });
  }

  return (
    <Block>
      {draft.files.length === 0 ? (
        <p className={s.emptyLine}>Nothing attached.</p>
      ) : (
        <ul className={s.fileList}>
          {draft.files.map((f) => (
            <li key={f.id} className={s.fileRow}>
              <span className={s.fileName}>{f.name}</span>
              <span className={s.fileSize}>{fileSize(f.size)}</span>
              <IconBtn
                label={`Remove ${f.name}`}
                onClick={() => patch({ files: draft.files.filter((x) => x.id !== f.id) })}
              />
            </li>
          ))}
        </ul>
      )}

      <div className={s.blockActions}>
        <Btn variant="quiet" onClick={add}>
          <Glyph d={PATH.plus} />
          Add a file
        </Btn>
        <Note>Nothing uploads.</Note>
      </div>
    </Block>
  );
}
