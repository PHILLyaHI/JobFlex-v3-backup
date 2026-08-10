"use client";

// CHAPTERS — chapter 3, "The words": brief sections 05 (scope & notes) and
// 07 (terms).
//
// Route: /dashboard/manual-sheet.
//
// Every free-typed paragraph on the proposal, in one place. The three textareas
// were three separate cards in the ten-card build, which meant three headers and
// three borders wrapped around what is really one activity — writing. Grouped,
// the chapter is the shortest of the five to read and the tallest to fill, and
// it has almost no chrome at all: three labels, three boxes, one button.
//
// The one button matters. Terms open EMPTY in the fixture, and an empty legal
// block with no way out is the single most common reason a contractor abandons a
// proposal builder — so the starter template is offered exactly while the field
// is empty and disappears the moment there is anything to overwrite. Offering it
// permanently would put a "destroy what you just wrote" control next to the
// writing.
//
// "Internal notes" carries the only helper text in the chapter — two words,
// "Not printed" — because it is the one field on the page whose destination is
// not obvious and getting it wrong is embarrassing in front of a homeowner.

import type { Draft } from "../manual-focus/manual-focus-types";
import { TERMS_TEMPLATE } from "../manual-focus/manual-focus-data";
import s from "./manual-sheet.module.css";
import { BlockHead, Btn, Field, TextArea } from "./sheet-ui";

export function ChapterWords({
  draft,
  patch,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
}) {
  const termsEmpty = draft.terms.trim().length === 0;

  return (
    <>
      {/* ---- 05 SCOPE & NOTES ---- */}
      <div className={s.block}>
        <BlockHead num="05" name="Scope & notes" />
        <div className={s.fields}>
          <Field label="Scope of work">
            {(id) => (
              <TextArea
                id={id}
                tall
                value={draft.scopeOfWork}
                onChange={(v) => patch({ scopeOfWork: v })}
                placeholder="What you will do, in the order you will do it."
              />
            )}
          </Field>

          <Field label="Internal notes" hint="Not printed.">
            {(id) => (
              <TextArea
                id={id}
                value={draft.notes}
                onChange={(v) => patch({ notes: v })}
                placeholder="For your crew."
              />
            )}
          </Field>
        </div>
      </div>

      {/* ---- 07 TERMS ---- */}
      <div className={s.block}>
        <BlockHead num="07" name="Terms" />
        <div className={s.fields}>
          <Field label="Terms & conditions">
            {(id) => (
              <TextArea
                id={id}
                tall
                value={draft.terms}
                onChange={(v) => patch({ terms: v })}
                placeholder="Payment, change orders, warranty, validity."
              />
            )}
          </Field>
        </div>

        {termsEmpty ? (
          <div className={s.stackTop}>
            <Btn onClick={() => patch({ terms: TERMS_TEMPLATE })}>Insert starter template</Btn>
          </div>
        ) : null}
      </div>
    </>
  );
}
