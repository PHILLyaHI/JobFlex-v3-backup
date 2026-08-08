"use client";

// SPEC SHEET — the frame primitives. Route /dashboard/manual-spec.
//
// THE GRAMMAR LIVES HERE, AND NOWHERE ELSE.
// The whole variant rests on one rule: every value in the document sits on a
// two-track row — a fixed mono LABEL GUTTER on the left and an ink VALUE TRACK
// on the right, separated by a construction line that runs the length of the
// page. `Sheet` and `Row` are the only two components allowed to draw that
// grid. Anything that lays out its own label/value pair would drift the gutter
// by a pixel and break the one thing the page is arguing for.
//
// EVERY COMPONENT IN THIS FILE IS DECLARED AT MODULE SCOPE.
// Declared inside a parent component these would be a NEW function identity on
// every render, so React would see a different element type each time, unmount
// the whole sheet and mount a fresh one — which drops the caret out of whatever
// field was being typed in, on every keystroke.
//
// Fixture-only page: nothing here reads a store, a server action or the
// network. See manual-spec-data.ts.

import type { ReactNode } from "react";
import type { SheetMeta } from "./manual-spec-data";
import styles from "./manual-spec.module.css";

/** Local class joiner. Deliberately NOT lib/cn: that runs twMerge, which has
 *  opinions about Tailwind utilities and no business anywhere near a hashed
 *  CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ─────────────────────────────────────────────────────────────
   THE SHEET
   ───────────────────────────────────────────────────────────── */

export function Sheet({
  meta,
  /** The sheet's CONTENT summary — never its name. This is what a collapsed
   *  sheet has to say instead of its title, so it is printed whether the
   *  sheet is open or shut. */
  summary,
  open,
  onToggle,
  /** Records the section element so the title block's index can scroll to it. */
  register,
  children,
}: {
  meta: SheetMeta;
  summary: string;
  open: boolean;
  onToggle: () => void;
  register: (id: string, el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <section
      id={meta.id}
      ref={(el) => {
        register(meta.id, el);
      }}
      className={styles.sheet}
      aria-labelledby={`${meta.id}-title`}
    >
      <header className={styles.sHead}>
        <span className={styles.sNo} aria-hidden="true">
          {meta.no}
        </span>
        <div className={styles.sHeadVal}>
          <div className={styles.sTitleWrap}>
            <h2 className={styles.sTitle} id={`${meta.id}-title`}>
              <span className={styles.sr}>{`Sheet ${meta.no}: `}</span>
              {meta.title}
            </h2>
            {open && <p className={styles.sTeach}>{meta.teach}</p>}
          </div>

          <span className={styles.sSum}>{summary}</span>

          <button
            type="button"
            className={cx(styles.sTog, !open && styles.isShut)}
            aria-expanded={open}
            aria-controls={`${meta.id}-body`}
            onClick={onToggle}
            title={open ? `Collapse ${meta.title}` : `Expand ${meta.title}`}
          >
            <span className={styles.sr}>
              {open ? `Collapse sheet ${meta.no}` : `Expand sheet ${meta.no}`}
            </span>
            <svg className="ic" aria-hidden="true">
              <use href="#i-chev" />
            </svg>
          </button>
        </div>
      </header>

      {/* Collapsing UNMOUNTS the body rather than hiding it. Every value on
          this page is held in the draft object above, so nothing is lost, and
          a display:none subtree is where stagger/transition bugs breed. */}
      {open && <div id={`${meta.id}-body`}>{children}</div>}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   THE TWO-TRACK ROW
   ───────────────────────────────────────────────────────────── */

export function Row({
  label,
  /** "· optional" and similar, printed under the label in the gutter. */
  sub,
  /** When the value is a SINGLE control, pass its id and the gutter becomes a
   *  real <label>. When it is a table or a group, leave it off — the children
   *  carry their own accessible names instead. */
  htmlFor,
  hint,
  /** A live consequence of this value, printed under it. */
  echo,
  /** Tables draw their own padding, so the value track drops its own. */
  flush,
  children,
}: {
  label: string;
  sub?: string;
  htmlFor?: string;
  hint?: ReactNode;
  echo?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  const gutter = (
    <>
      <span>{label}</span>
      {sub && <span className={styles.rowOpt}>{sub}</span>}
    </>
  );

  return (
    <div className={styles.row}>
      {htmlFor ? (
        <label className={styles.rowLab} htmlFor={htmlFor}>
          {gutter}
        </label>
      ) : (
        <div className={styles.rowLab}>{gutter}</div>
      )}
      <div className={cx(styles.rowVal, flush && styles.isFlush)}>
        {children}
        {hint && <p className={styles.rowHint}>{hint}</p>}
        {echo && <p className={styles.rowEcho}>{echo}</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SMALL SHARED PIECES
   ───────────────────────────────────────────────────────────── */

/** A value with a unit mark sitting on the same rule — `8.25 %`, `$ 1.46`.
 *  The mark is decorative to a screen reader; the control it wraps carries
 *  the unit in its own accessible name. */
export function Affix({
  pre,
  post,
  children,
}: {
  pre?: string;
  post?: string;
  children: ReactNode;
}) {
  return (
    <span className={styles.affix}>
      {pre && (
        <span className={styles.affixMark} aria-hidden="true">
          {pre}
        </span>
      )}
      {children}
      {post && (
        <span className={styles.affixMark} aria-hidden="true">
          {post}
        </span>
      )}
    </span>
  );
}

/** A labelled field inside an inline create/edit form. The mini forms are the
 *  one place the gutter grammar is suspended — a temporary sub-task inside a
 *  row cannot also claim the page's vertical rule. */
export function MiniField({
  label,
  id,
  wide,
  children,
}: {
  label: string;
  id: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.miniField, wide && styles.miniWide)}>
      <label className={styles.miniLab} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** An empty / partial state: a note on a drawing. */
export function Note({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <p className={styles.empty}>
      <b>{kicker}</b>
      {children}
    </p>
  );
}
