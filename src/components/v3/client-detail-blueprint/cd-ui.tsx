"use client";

// CLIENT DETAIL / BLUEPRINT — the primitive layer.
//
// Built the way the manual-proposal sibling is built: small shapes that make
// the house treatment the DEFAULT and the wrong treatment hard to express.
//
// Three decisions worth stating:
//
// 1. `Panel` takes a title and an optional annotation and NOTHING else — no
//    description slot and no subtitle slot. A card subtitle that restates its
//    heading is the "cognitive noise" this system deletes on sight, so the
//    component simply cannot carry one. `note` is for a fact the title cannot
//    give ("6 on file"), and `tools` is for controls.
//
// 2. `Badge` maps a STATUS to a tone and takes no free-form colour. Status
//    colour is for status only; a tone prop that any caller could set to
//    "success" for a decorative reason is how that rule leaks. Sent is the sky
//    palette and Viewed is deep blueprint — the documented pair.
//
// 3. `Ic` renders from the shell's sprite by id. Every id used on this page was
//    checked against blueprint-shell's sprite before it was written; the sprite
//    has no mail, doc, receipt, card, star or tag symbol, so those readings are
//    carried by `send`, `file`, `bank` and plain text instead of by an icon
//    that does not exist.

import styles from "./client-detail.module.css";
import type { PaymentStatus, ProposalStatus } from "./client-detail-data";

/** Local class joiner. Deliberately NOT `@/lib/cn`: that runs twMerge, which
 *  has opinions about Tailwind utilities and no business near a hashed
 *  CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** One symbol from the shell's sprite (mounted once by blueprint-shell).
 *  `.ic` is the shell's global icon class — 24x24 grid, stroke 2,
 *  currentColor. Size overrides live in the module, written with enough
 *  classes to beat `.bp :global(svg.ic)`. */
export function Ic({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* ============================================================
   PANEL
   ============================================================ */

export function Panel({
  title,
  note,
  tools,
  bodyClass,
  children,
}: {
  title: string;
  /** A drawing annotation beside the title — a count, never a restatement. */
  note?: string;
  tools?: React.ReactNode;
  bodyClass?: string;
  children: React.ReactNode;
}) {
  const id = `cd-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section
      // The reveal cascade collects `[data-rv]` rather than walking
      // `.content.children`: this page renders ONE wrapper element, so a
      // children-walk would animate the whole page as a single block and there
      // would be no cascade at all. See ./use-reveal.ts.
      data-rv=""
      className={styles.card}
      aria-labelledby={id}
    >
      <header className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>
          {title}
        </h2>
        {note ? <span className={styles.cardNote}>{note}</span> : null}
        {tools ? <div className={styles.cardTools}>{tools}</div> : null}
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/* ============================================================
   BUTTONS
   ============================================================ */

export function Btn({
  children,
  onClick,
  tone = "plain",
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "plain" | "primary" | "quiet";
  icon?: string;
}) {
  return (
    <button
      type="button"
      className={cx(
        styles.btn,
        tone === "primary" && styles.btnPrimary,
        tone === "quiet" && styles.btnQuiet,
      )}
      onClick={onClick}
    >
      {icon ? <Ic name={icon} /> : null}
      {children}
    </button>
  );
}

/* ============================================================
   STATUS BADGES
   ============================================================ */

const PROPOSAL_TONE: Record<ProposalStatus, string> = {
  DRAFT: "",
  SENT: styles.bgSent,
  VIEWED: styles.bgViewed,
  ACCEPTED: styles.bgOk,
  DECLINED: styles.bgBad,
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  PAID: styles.bgOk,
  PENDING: styles.bgWarn,
  FAILED: styles.bgBad,
};

export function ProposalBadge({ status }: { status: ProposalStatus }) {
  return <span className={cx(styles.badge, PROPOSAL_TONE[status])}>{status}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={cx(styles.badge, PAYMENT_TONE[status])}>{status}</span>;
}

/* ============================================================
   FACTS AND TAGS
   ============================================================ */

/** Label above, value below. The label is sentence case and muted on purpose —
 *  caps belongs to headings, and a caps-mono label on every fact is the single
 *  loudest thing a blueprint page can do wrong. */
export function Fact({
  label,
  icon,
  value,
  wide,
}: {
  label: string;
  icon?: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cx(styles.fact, wide && styles.factWide)}>
      <span className={styles.label}>{label}</span>
      <span className={styles.factVal}>
        {icon ? <Ic name={icon} /> : null}
        {/* `title` because these are the cells that hold pasted values — a
            200-character email exists in every imported client book. The text
            breaks anywhere rather than truncating, so nothing is hidden, but
            the tooltip gives the whole value in one piece for copying. */}
        <span className={styles.factText} title={value}>
          {value}
        </span>
      </span>
    </div>
  );
}

/** A client's name printed INSIDE a sentence — the empty states and the dialog
 *  titles. One line, ellipsised at a readable measure, full value on hover.
 *
 *  Not the same treatment as a fact cell: a fact is the value's own slot and can
 *  wrap for as many lines as it needs, whereas a name in a sentence that wraps
 *  to nine lines destroys the sentence around it. */
export function ClampedName({ children }: { children: string }) {
  return (
    <span className={styles.inlineName} title={children}>
      {children}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}

/* ============================================================
   EMPTY STATE
   "A note on a drawing" — a 1.5px dashed box, no illustration and
   no call to action competing with the page's real primary.
   ============================================================ */

export function EmptyNote({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyKicker}>{kicker}</div>
      <p className={styles.emptyText}>{children}</p>
    </div>
  );
}
