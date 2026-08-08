"use client";

// WORKLIST — page CONTENT. Manual proposal builder, single-column card lab.
//
// THE BET
// The page should tell you what is LEFT, and finishing something should
// visibly remove work from view. One column, eight cards, two bands:
//
//   OPEN     — above a heavy labelled seam, in priority order. Blocking cards
//              first, because a proposal with no client and no named lines
//              cannot be sent no matter what else is finished. Every card
//              prints its own done-condition on a rule line, and the first one
//              in the band — and only that one — carries the sky NEXT tag.
//   SETTLED  — below the seam, collapsed to one-line receipts that print the
//              card's CONTENT ("5 lines · $12,303.94"), each with an ink
//              check-stamp. Any receipt reopens on click, in place.
//
// Meeting a condition MOVES the card across the seam. That move is the whole
// design: it is animated (use-band-flip.ts), it respects reduced motion, it is
// deferred until blur so typing is never yanked out from under the reader, and
// it always raises an undo offer naming the cause. A builder that shrinks as
// you work beats one that stays the same size, because "am I done?" is the
// real question — not "where is the field?".
//
// The header ledger keeps the two numbers that matter one glance apart:
// how much work is left, and how much the job is worth.
//
// WHY A REDUCER AND NOT FIFTEEN useStates
// The seam crossing has to be detected exactly once per transition, with the
// PREVIOUS draft in hand to offer as undo. A reducer sees both states of every
// change in one pure function, so the detection is a comparison rather than an
// effect that watches state and writes more state. Every draft mutation on the
// page funnels through it — which is also what guarantees no card can settle
// without an undo being offered.
//
// EVERY BLOCK RETURNED HERE IS A DIRECT CHILD OF `.content`: the reveal cascade
// in ./use-reveal.ts walks `content.children`, and the sticky ledger has to be
// one of those children to pin against `.main`.
//
// STATE + DATA: component-local, fixture-seeded, nothing persists. No server
// actions, no Prisma, no network, no shared draft store. Save, Save & send and
// the autosave chip are UI state and say so in the column.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useReveal } from "./use-reveal";
import { useBandFlip } from "./use-band-flip";
import type {
  Band,
  CardId,
  CardState,
  ClientRecord,
  Draft,
  Installment,
  Line,
  Markups,
  PriceSheet,
  ProjectRecord,
  ProposalOptions,
  UndoEntry,
} from "./worklist-types";
import {
  ORG_DEFAULT_MARKUPS,
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_CLIENTS,
  SEED_PROJECTS,
  STATE_TAX_PCT,
  makeSeedDraft,
} from "./worklist-data";
import {
  computePriceSheet,
  excerpt,
  isNamed,
  money,
  pct,
  pct1,
  reconciles,
  reducedMotion,
} from "./worklist-math";
import { EmptyNote, Icon, Spinner, Stamp, cx } from "./worklist-ui";
import { AddressField, ClientPicker, ProjectPicker, addressLine } from "./worklist-pickers";
import { LinesBody } from "./worklist-lines";
import { PaymentBody, PricingBody } from "./worklist-money";
import { FilesBody, ScopeBody, TermsBody } from "./worklist-closeout";
import { ClientCopy } from "./worklist-preview";
import { Field } from "./worklist-ui";
import styles from "./manual-worklist.module.css";

/* ============================================================
   THE EIGHT CARDS — static description, one place.
   The bands, the seam counter, the NEXT tag, the receipts and
   the "what is still open" message all render from this plus
   the settled map, so they cannot disagree.
   ============================================================ */

type CardMeta = {
  id: CardId;
  num: string;
  title: string;
  /** The done-condition, printed verbatim on the rule line. */
  rule: string;
  /** One quiet line saying what the card is for. */
  teach: string;
  /** The proposal cannot be sent until this one is settled. */
  blocking: boolean;
  /** Sort weight in the open band. Lower first. */
  priority: number;
};

const CARDS: CardMeta[] = [
  {
    id: "client",
    num: "01",
    title: "Client",
    rule: "A client is named — from the list, or as plain text.",
    teach: "Who the proposal is for. The name and address here head the client’s copy.",
    blocking: true,
    priority: 0,
  },
  {
    id: "job",
    num: "02",
    title: "The job",
    rule: "The proposal has a title.",
    teach: "What this job is called, which project it belongs to, and the paragraph the client reads first.",
    blocking: true,
    priority: 1,
  },
  {
    id: "lines",
    num: "03",
    title: "Line items",
    rule: "At least one line, and every line is named.",
    teach: "The priced work. An unnamed line never reaches the client, so it counts as unfinished here.",
    blocking: true,
    priority: 2,
  },
  {
    id: "pricing",
    num: "04",
    title: "Pricing & tax",
    rule: "The tax rate is confirmed for this job.",
    teach: "Markup, overhead, profit and tax on top of the priced lines. The client sees one price — never your margin.",
    blocking: false,
    priority: 3,
  },
  {
    id: "payment",
    num: "05",
    title: "Payment schedule",
    rule: "The installments reconcile to 100% of the total.",
    teach: "How the total gets paid. Percentages resolve to dollars as soon as a total exists.",
    blocking: false,
    priority: 4,
  },
  {
    id: "scope",
    num: "06",
    title: "Scope & notes",
    rule: "A scope of work is written.",
    teach: "What you are going to do, and everything you want on the record before anyone starts.",
    blocking: false,
    priority: 5,
  },
  {
    id: "terms",
    num: "07",
    title: "Terms & conditions",
    rule: "Terms are on the document.",
    teach: "Payment terms, change-order policy, warranty. There is a starter template if the field is empty.",
    blocking: false,
    priority: 6,
  },
  {
    id: "files",
    num: "08",
    title: "Files & documents",
    rule: "The attachment list is confirmed — attachments are optional.",
    teach: "Drawings, photos, spec sheets. Nothing is uploaded from this lab page.",
    blocking: false,
    priority: 7,
  },
];

const CARD_COUNT = CARDS.length;

/* ============================================================
   THE DONE-CONDITIONS — pure, and the only definition of them.
   ============================================================ */

/** Whether the proposal actually carries a client. A record id that no longer
 *  exists in the list is not a client, which is why this needs the list. */
function hasClient(draft: Draft, clients: ClientRecord[]): boolean {
  const choice = draft.client;
  if (choice.mode === "record") return clients.some((c) => c.id === choice.id);
  if (choice.mode === "freeText") return choice.name.trim().length > 0;
  return false;
}

function settledMap(draft: Draft, clients: ClientRecord[]): Record<CardId, boolean> {
  const total = computePriceSheet(draft).total;
  return {
    client: hasClient(draft, clients),
    job: draft.title.trim().length > 0,
    lines: draft.lines.length > 0 && draft.lines.every(isNamed),
    pricing: draft.taxConfirmed,
    payment: reconciles(draft.installments, total),
    scope: draft.scopeOfWork.trim().length > 0,
    terms: draft.terms.trim().length > 0,
    files: draft.filesConfirmed,
  };
}

/* ============================================================
   THE REDUCER — every draft mutation on the page goes through
   here, which is what makes "no card settles without an undo"
   a structural guarantee rather than a habit.
   ============================================================ */

type State = {
  draft: Draft;
  clients: ClientRecord[];
  projects: ProjectRecord[];
  undo: UndoEntry | null;
  /** Bumped per transition so the auto-dismiss timer restarts. */
  seq: number;
};

type Action =
  | { type: "patch"; patch: Partial<Draft> }
  | { type: "lines"; fn: (prev: Line[]) => Line[] }
  | { type: "installments"; fn: (prev: Installment[]) => Installment[] }
  | { type: "options"; patch: Partial<ProposalOptions> }
  | { type: "saveClient"; record: ClientRecord }
  | { type: "saveProject"; record: ProjectRecord }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "dismissUndo" };

function initState(): State {
  return {
    draft: makeSeedDraft(),
    clients: SEED_CLIENTS.map((c) => ({ ...c, tags: [...c.tags] })),
    projects: SEED_PROJECTS.map((p) => ({ ...p })),
    undo: null,
    seq: 0,
  };
}

/** The mutation itself. No undo bookkeeping — that is the watcher's job. */
function apply(state: State, action: Action): State {
  switch (action.type) {
    case "patch":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "lines":
      return { ...state, draft: { ...state.draft, lines: action.fn(state.draft.lines) } };
    case "installments":
      return {
        ...state,
        draft: { ...state.draft, installments: action.fn(state.draft.installments) },
      };
    case "options":
      return {
        ...state,
        draft: { ...state.draft, options: { ...state.draft.options, ...action.patch } },
      };
    case "saveClient":
      return {
        ...state,
        clients: state.clients.some((c) => c.id === action.record.id)
          ? state.clients.map((c) => (c.id === action.record.id ? action.record : c))
          : [action.record, ...state.clients],
      };
    case "saveProject":
      return {
        ...state,
        projects: state.projects.some((p) => p.id === action.record.id)
          ? state.projects.map((p) => (p.id === action.record.id ? action.record : p))
          : [action.record, ...state.projects],
      };
    default:
      return state;
  }
}

/** The cause line on the undo offer, in the card's own words. */
function causeFor(id: CardId, settled: boolean): string {
  const card = CARDS.find((c) => c.id === id);
  if (!card) return "";
  return settled ? card.rule : `No longer true: ${card.rule.toLowerCase()}`;
}

/**
 * Compare the settled map before and after a mutation, and raise an undo offer
 * when a card crossed the seam. Only the FIRST changed card is named — two
 * cards crossing on one keystroke is possible in principle (an undo restoring
 * several), and a banner that lists them all reads as an error report rather
 * than as a receipt.
 */
function watchSettle(prev: State, next: State): State {
  const before = settledMap(prev.draft, prev.clients);
  const after = settledMap(next.draft, next.clients);
  const moved = CARDS.find((c) => before[c.id] !== after[c.id]);
  if (!moved) return next;

  const seq = next.seq + 1;
  return {
    ...next,
    seq,
    undo: {
      seq,
      cardId: moved.id,
      direction: after[moved.id] ? "settled" : "reopened",
      cause: causeFor(moved.id, after[moved.id]),
      before: { draft: prev.draft, clients: prev.clients, projects: prev.projects },
    },
  };
}

function reduce(state: State, action: Action): State {
  if (action.type === "reset") return initState();
  if (action.type === "dismissUndo") return state.undo ? { ...state, undo: null } : state;
  if (action.type === "undo") {
    if (!state.undo) return state;
    return {
      draft: state.undo.before.draft,
      clients: state.undo.before.clients,
      projects: state.undo.before.projects,
      undo: null,
      seq: state.seq + 1,
    };
  }
  return watchSettle(state, apply(state, action));
}

/* ============================================================
   TIMINGS
   ============================================================ */

/** How long the undo offer stands before it retires itself. Long enough to
 *  read the cause and reach the button; short enough not to become chrome. */
const UNDO_MS = 9000;
/** The fake write. Sits in the Motion System's UI band. */
const SAVE_MS = 900;
/** How long the destructive Reset stays armed before disarming itself. */
const RESET_ARMED_MS = 4000;
/** How long "Saved as defaults" acknowledges itself. */
const DEFAULTS_MS = 3500;

/* ============================================================
   THE CARD FRAME — module scope, NOT nested.
   Declared inside the content component this would be a new
   function identity every render, so React would see a new
   element type, unmount the card and mount a fresh one — which
   drops the caret out of whichever input is being typed in, on
   every keystroke. It takes everything it needs as props for
   exactly that reason.
   ============================================================ */

function WorkCard({
  card,
  band,
  isNext,
  expanded,
  heldSettled,
  onToggle,
  onFocusIn,
  onFocusOut,
  register,
  children,
}: {
  card: CardState & { num: string; teach: string; blocking: boolean };
  band: Band;
  /** The one card carrying the sky NEXT annotation. */
  isNext: boolean;
  /** Settled cards only: is the receipt opened out? */
  expanded: boolean;
  /** Settled, but still above the seam because focus is inside it. */
  heldSettled: boolean;
  onToggle: () => void;
  onFocusIn: (id: CardId, band: Band) => void;
  onFocusOut: (id: CardId) => void;
  register: (id: CardId, el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  const open = band === "open";
  const showBody = open || expanded;
  /* Settled-band cards can be transiently UNSETTLED: an edit inside an opened
     receipt breaks the condition, and the card is pinned below the seam until
     focus leaves. The receipt must not keep claiming a check-stamp it no longer
     has, so every settled-band affordance reads `card.settled` rather than the
     band it happens to be drawn in. */
  const heldOpen = !open && !card.settled;

  return (
    <section
      data-card={card.id}
      id={`wl-${card.id}`}
      ref={(el) => {
        register(card.id, el);
      }}
      className={cx(
        styles.card,
        open ? styles.isOpenBand : styles.isSettledBand,
        isNext && styles.isNext,
        open && card.blocking && styles.isBlocking,
        expanded && styles.isExpanded,
        heldSettled && styles.isHeld,
      )}
      aria-labelledby={`wl-${card.id}-title`}
      onFocusCapture={() => onFocusIn(card.id, band)}
      onBlurCapture={(e) => {
        // Tabbing between two fields in the same card is not leaving the card.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        onFocusOut(card.id);
      }}
    >
      {open ? (
        <>
          <header className={styles.cardHead}>
            <span className={styles.cardNum} aria-hidden="true">
              {card.num}
            </span>
            <div className={styles.cardCopy}>
              <h2 className={styles.cardTitle} id={`wl-${card.id}-title`}>
                {card.title}
              </h2>
              <p className={styles.cardTeach}>{card.teach}</p>
            </div>
            {card.blocking && <span className={styles.blockChip}>Blocks sending</span>}
            <Stamp done={card.settled} big />
          </header>

          <div className={styles.rule}>
            <span className={styles.ruleLab}>Done when</span>
            <span className={styles.ruleTxt}>
              {card.rule}
              <span className={styles.srOnly}>
                {card.settled ? " This card is settled." : " This card is still open."}
              </span>
            </span>
            {isNext && <span className={styles.nextTag}>Next</span>}
          </div>

          {heldSettled && (
            <p className={styles.heldNote} role="status">
              Done — this drops below the line when you leave the card.
            </p>
          )}
        </>
      ) : (
        <h2 className={styles.srOnly} id={`wl-${card.id}-title`}>
          {card.title}
        </h2>
      )}

      {!open && (
        <button
          type="button"
          className={cx(styles.receipt, heldOpen && styles.isBroken)}
          aria-expanded={expanded}
          aria-controls={`wl-${card.id}-body`}
          onClick={onToggle}
        >
          <Stamp done={card.settled} />
          <span className={styles.receiptNum} aria-hidden="true">
            {card.num}
          </span>
          <span className={styles.receiptTitle}>{card.title}</span>
          <span className={styles.receiptSum}>
            {heldOpen ? "No longer settled — moves back up when you leave" : card.summary}
          </span>
          <span className={styles.srOnly}>
            {heldOpen ? "No longer settled." : "Settled."} {expanded ? "Collapse" : "Open"} to edit.
          </span>
          <span className={cx(styles.chev, expanded && styles.isOpen)} aria-hidden="true">
            <Icon name="chev" />
          </span>
        </button>
      )}

      {showBody && (
        <div className={styles.cardBody} id={`wl-${card.id}-body`}>
          {!open && (
            <div className={cx(styles.rule, styles.ruleInset)}>
              <span className={styles.ruleLab}>
                {heldOpen ? "No longer true" : "Settled because"}
              </span>
              <span className={styles.ruleTxt}>{card.rule}</span>
            </div>
          )}
          {children}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   THE PAGE
   ============================================================ */

export function ManualWorklistContent() {
  useReveal();

  const [state, dispatch] = useReducer(reduce, undefined, initState);
  const { draft, clients, projects } = state;

  /* ── Timers, tracked so an unmount cannot fire into a dead tree ── */
  const timers = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    },
    [],
  );

  /* ── The one price sheet everything reads ─────────────────── */
  const sheet: PriceSheet = useMemo(() => computePriceSheet(draft), [draft]);

  /* ── Derived card state ───────────────────────────────────── */
  const settled = useMemo(() => settledMap(draft, clients), [draft, clients]);

  // Narrowed into a local const FIRST. A discriminated union narrowed through a
  // property access (`draft.client.mode === "record"`) loses that narrowing the
  // moment it is read inside a callback — the compiler cannot prove `draft` was
  // not reassigned before the callback ran. A const can never be, so the
  // narrowing survives into `.find()`.
  const choice = draft.client;
  const pickedClient = useMemo(
    () => (choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined),
    [choice, clients],
  );
  const clientName = choice.mode === "freeText" ? choice.name.trim() : (pickedClient?.name ?? "");
  const pickedProject = projects.find((p) => p.id === draft.projectId);

  const namedLineCount = draft.lines.filter(isNamed).length;

  /** What each settled receipt prints. CONTENT, never just the name. */
  const summaries = useMemo<Record<CardId, string>>(() => {
    const clientAddr = pickedClient ? addressLine(pickedClient) : "";
    return {
      client:
        choice.mode === "freeText"
          ? `${clientName || "Untitled"} · plain text, no record`
          : [clientName, clientAddr].filter(Boolean).join(" · ") || "No client",
      job: [draft.title.trim(), pickedProject?.name].filter(Boolean).join(" · "),
      lines: `${namedLineCount} line${namedLineCount === 1 ? "" : "s"} · ${money(sheet.subtotal)}`,
      pricing: `Materials ${pct1(draft.markups.materialMarkupPct)} · Labor ${pct1(
        draft.markups.laborMarkupPct,
      )} · tax ${pct(draft.taxPct)} · margin ${pct1(sheet.margin)}`,
      payment: `${draft.installments.length} installment${
        draft.installments.length === 1 ? "" : "s"
      } · covers ${money(sheet.total)}`,
      scope: excerpt(draft.scopeOfWork),
      terms: excerpt(draft.terms),
      files: draft.files.length
        ? `${draft.files.length} file${draft.files.length === 1 ? "" : "s"} · ${draft.files
            .map((f) => f.name)
            .join(", ")}`
        : "Nothing attached",
    };
  }, [
    choice.mode,
    clientName,
    draft.files,
    draft.installments.length,
    draft.markups.laborMarkupPct,
    draft.markups.materialMarkupPct,
    draft.scopeOfWork,
    draft.taxPct,
    draft.terms,
    draft.title,
    namedLineCount,
    pickedClient,
    pickedProject,
    sheet.margin,
    sheet.subtotal,
    sheet.total,
  ]);

  const cards: (CardState & { num: string; teach: string; blocking: boolean })[] = useMemo(
    () =>
      CARDS.map((meta) => ({
        ...meta,
        settled: settled[meta.id],
        summary: summaries[meta.id],
      })),
    [settled, summaries],
  );

  /* ── HELD: the "never move the card you are typing in" rule ──
     A card whose done-condition flips WHILE focus is inside it keeps the band
     it had when focus arrived, and only crosses the seam once focus leaves.
     Pure render state — no effect, no reconciliation loop, no chance of the
     rendered band and the real band drifting apart. */
  const [held, setHeld] = useState<{ id: CardId; band: Band } | null>(null);

  const onFocusIn = useCallback((id: CardId, band: Band) => {
    setHeld((prev) => (prev && prev.id === id ? prev : { id, band }));
  }, []);

  const bandOf = useCallback(
    (id: CardId): Band => {
      if (held && held.id === id) return held.band;
      return settled[id] ? "settled" : "open";
    },
    [held, settled],
  );

  const openCards = cards
    .filter((c) => bandOf(c.id) === "open")
    .sort((a, b) => (a.blocking === b.blocking ? a.priority - b.priority : a.blocking ? -1 : 1));
  const settledCards = cards.filter((c) => bandOf(c.id) === "settled");
  const settledCount = cards.filter((c) => c.settled).length;
  const nextId = openCards.length > 0 ? openCards[0].id : null;
  const blockers = openCards.filter((c) => c.blocking);

  /* ── The seam crossing, animated ──────────────────────────── */
  const listRef = useRef<HTMLDivElement>(null);
  const bandKey = cards.map((c) => `${c.id}:${bandOf(c.id)}`).join("|");
  useBandFlip(listRef, bandKey);

  /* ── Jumping to a card ────────────────────────────────────── */
  const cardEls = useRef(new Map<CardId, HTMLElement | null>());
  const register = useCallback((id: CardId, el: HTMLElement | null) => {
    cardEls.current.set(id, el);
  }, []);
  const jumpTo = useCallback((id: CardId) => {
    cardEls.current.get(id)?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /* ── Settled receipts open in place ───────────────────────── */
  const [expanded, setExpanded] = useState<Set<CardId>>(() => new Set());
  const toggleExpanded = useCallback((id: CardId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * Focus leaving a card is the moment a deferred crossing is allowed to
   * happen. A card crossing DOWNWARD lands as a receipt, not as a full card
   * that happens to sit below the line — the collapse IS the reward the page is
   * built around, and a card that was opened out earlier must not keep that
   * memory through a settle.
   *
   * Not memoised on `[]` on purpose: it has to read the live `held` and
   * `settled`, and `WorkCard` re-renders on every commit anyway, so a stable
   * identity would buy nothing.
   */
  const onFocusOut = useCallback(
    (id: CardId) => {
      if (!held || held.id !== id) return;
      if (held.band === "open" && settled[id] && expanded.has(id)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      setHeld(null);
    },
    [expanded, held, settled],
  );

  /* ── Undo retires itself ──────────────────────────────────────
     But NOT while the card it refers to is still held above the seam. The
     condition is met the moment the last character is typed; the card only
     MOVES on blur. Starting the clock at the first of those two would let a
     slow typist watch the card cross with the undo offer already gone — and
     "every crossing is undoable" would quietly stop being true. */
  const undo = state.undo;
  const heldId = held?.id ?? null;
  useEffect(() => {
    if (!undo) return;
    if (heldId === undo.cardId) return;
    // Inside a timeout on purpose: a synchronous dispatch in an effect body is
    // exactly what the set-state-in-effect rule exists to stop, and the delay
    // here is the feature rather than a dodge.
    const t = window.setTimeout(() => dispatch({ type: "dismissUndo" }), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [heldId, undo]);

  /* ── Total-changed flash ──────────────────────────────────────
     Driven straight at the DOM: a one-shot highlight on one element is not a
     fact about the proposal, and toggling a class is exactly the "synchronise
     with something outside React" job an effect is for. The animation is two
     transition durations on two states — 90ms in, 520ms out — because
     Lightning CSS rejects @keyframes inside a CSS module. */
  const totalRef = useRef<HTMLSpanElement>(null);
  const prevTotal = useRef(sheet.total);
  useEffect(() => {
    if (prevTotal.current === sheet.total) return;
    prevTotal.current = sheet.total;
    const el = totalRef.current;
    if (!el || reducedMotion()) return;
    el.classList.add(styles.isFlash);
    const off = window.setTimeout(() => el.classList.remove(styles.isFlash), 120);
    return () => window.clearTimeout(off);
  }, [sheet.total]);

  /* ── Save / send, reset, defaults — all UI state ────────────
     `saving` names WHICH button is busy rather than just that something is:
     two spinners turning when one button was pressed is a lie about what the
     page is doing. */
  const [saving, setSaving] = useState<"save" | "send" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  /** The org's markup defaults. Stored for the session so "Save these as
   *  company defaults" is a real round trip rather than a button that flashes
   *  a message — the pricing card can restore them, which is the only way to
   *  see that saving them did anything. */
  const [companyDefaults, setCompanyDefaults] = useState<Markups>(ORG_DEFAULT_MARKUPS);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  function onSave() {
    setSaving("save");
    setNote(null);
    after(SAVE_MS, () => {
      setSaving(null);
      setNote(
        "Nothing was written. This lab page has no data layer — Save and Save & send are UI state only.",
      );
    });
  }

  function onSaveSend() {
    if (openCards.length > 0) {
      const first = openCards[0];
      setNote(
        `${openCards.length} card${openCards.length === 1 ? "" : "s"} still open. ${
          blockers.length > 0
            ? `${blockers.length} of them block sending — start with ${first.num} ${first.title.toLowerCase()}: ${first.rule.toLowerCase()}`
            : `Next is ${first.num} ${first.title.toLowerCase()}: ${first.rule.toLowerCase()}`
        }`,
      );
      jumpTo(first.id);
      return;
    }
    setSaving("send");
    setNote(null);
    after(SAVE_MS, () => {
      setSaving(null);
      setNote(
        "All eight cards check out. Nothing was sent — this lab page has no data layer, so Send stops here.",
      );
    });
  }

  function onReset() {
    if (!resetArmed) {
      setResetArmed(true);
      after(RESET_ARMED_MS, () => setResetArmed(false));
      return;
    }
    setResetArmed(false);
    setExpanded(new Set());
    setHeld(null);
    setNote(null);
    dispatch({ type: "reset" });
  }

  function onSaveDefaults() {
    setCompanyDefaults(draft.markups);
    setDefaultsSaved(true);
    after(DEFAULTS_MS, () => setDefaultsSaved(false));
  }

  /* ── Handlers handed down to the card bodies ──────────────── */
  const patch = useCallback((p: Partial<Draft>) => dispatch({ type: "patch", patch: p }), []);
  const setLines = useCallback(
    (fn: (prev: Line[]) => Line[]) => dispatch({ type: "lines", fn }),
    [],
  );
  const setInstallments = useCallback(
    (fn: (prev: Installment[]) => Installment[]) => dispatch({ type: "installments", fn }),
    [],
  );
  const setOptions = useCallback(
    (p: Partial<ProposalOptions>) => dispatch({ type: "options", patch: p }),
    [],
  );
  const saveClient = useCallback(
    (record: ClientRecord) => dispatch({ type: "saveClient", record }),
    [],
  );
  const saveProject = useCallback(
    (record: ProjectRecord) => dispatch({ type: "saveProject", record }),
    [],
  );

  /**
   * A new address arrives — from a picked client, from the Find list, or from
   * the field itself. The rate follows the state ONLY while the rate is still
   * an estimate; a hand-typed rate is never overwritten. When the estimate does
   * move, the confirmation is withdrawn: the number changed under the
   * contractor, so the card comes back above the seam and asks again.
   */
  const onAddress = useCallback(
    (line: string, stateCode: string | null) => {
      if (draft.taxManual) {
        patch({ address: line });
        return;
      }
      const rate = stateCode ? STATE_TAX_PCT[stateCode] : undefined;
      if (rate === undefined) {
        patch({ address: line });
        return;
      }
      patch({
        address: line,
        taxPct: rate,
        taxSourceState: stateCode,
        taxConfirmed: rate === draft.taxPct ? draft.taxConfirmed : false,
      });
    },
    [draft.taxConfirmed, draft.taxManual, draft.taxPct, patch],
  );

  /** Bodies, keyed by card. Built once per render and read twice (open band and
   *  settled band) so a card's editor is literally the same tree in both. */
  const bodies: Record<CardId, React.ReactNode> = {
    client: (
      <div className={styles.stack}>
        <ClientPicker
          choice={draft.client}
          clients={clients}
          onChoose={(next) => patch({ client: next })}
          onSaveRecord={saveClient}
          onAddressFill={onAddress}
        />
        <AddressField
          value={draft.address}
          onChange={onAddress}
          taxNote={
            draft.taxManual ? (
              <strong>The rate is set by hand, so it stays put.</strong>
            ) : (
              <strong>Currently {pct(draft.taxPct)}.</strong>
            )
          }
        />
      </div>
    ),
    job: (
      <div className={styles.stack}>
        <Field label="Proposal title">
          {(id) => (
            <input
              id={id}
              className={styles.in}
              value={draft.title}
              placeholder="Patel Residence — Roof Replacement"
              onChange={(e) => patch({ title: e.target.value })}
            />
          )}
        </Field>
        <div className={styles.field}>
          <span className={styles.lab}>Project</span>
          <ProjectPicker
            projectId={draft.projectId}
            projects={projects}
            onChoose={(id) => patch({ projectId: id })}
            onSaveRecord={saveProject}
          />
        </div>
        <Field
          label="Description"
          hint="One-paragraph overview your client will see first."
        >
          {(id) => (
            <textarea
              id={id}
              className={cx(styles.ta, styles.taTall)}
              value={draft.description}
              placeholder="Complete tear-off and installation of a new 30-year architectural roof system…"
              onChange={(e) => patch({ description: e.target.value })}
            />
          )}
        </Field>
      </div>
    ),
    lines: (
      <LinesBody
        lines={draft.lines}
        sheet={sheet}
        laborOnly={draft.options.laborOnly}
        onChange={setLines}
      />
    ),
    pricing: (
      <PricingBody
        draft={draft}
        sheet={sheet}
        onPatch={patch}
        onSaveDefaults={onSaveDefaults}
        defaultsSaved={defaultsSaved}
        companyDefaults={companyDefaults}
        onRestoreDefaults={() => patch({ markups: { ...companyDefaults } })}
      />
    ),
    payment: (
      <PaymentBody
        installments={draft.installments}
        total={sheet.total}
        onChange={setInstallments}
      />
    ),
    scope: <ScopeBody draft={draft} onPatch={patch} />,
    terms: <TermsBody draft={draft} onPatch={patch} />,
    files: <FilesBody draft={draft} onPatch={patch} />,
  };

  const undoCard = undo ? CARDS.find((c) => c.id === undo.cardId) : undefined;

  return (
    <>
      {/* ── MASTHEAD ─────────────────────────────────────────
          `.wlBlock` here too, so the masthead sits on the same measure as the
          column under it. The fleet's `.page-head` sets margin-bottom and
          nothing else this touches, so the two rules compose rather than
          fight. */}
      <div className={cx("page-head", styles.wlBlock)}>
        <div>
          <div className="kicker">Manual builder · Card lab</div>
          <h1 className="page-title">Worklist</h1>
          <div className={styles.headMeta}>
            <span>Draft № {PROPOSAL_NO}</span>
            <i aria-hidden="true" />
            <span>{PROPOSAL_DATE}</span>
            <i aria-hidden="true" />
            <span className={styles.headHonest}>Design preview — nothing is saved</span>
          </div>
        </div>
      </div>

      {/* ── THE LEDGER — progress and money, permanently in view ── */}
      <div className={cx(styles.ledgerBar, styles.wlBlock)}>
        <div className={styles.ledgerTop}>
          <div className={styles.progress}>
            <span className={styles.progLab}>
              <span className={styles.progNum}>{settledCount}</span> of {CARD_COUNT} settled
            </span>
            <div
              className={styles.progTrack}
              role="img"
              aria-label={`${settledCount} of ${CARD_COUNT} cards settled`}
            >
              {cards.map((c) => (
                <span
                  key={c.id}
                  className={cx(
                    styles.progCell,
                    c.settled && styles.isDone,
                    c.id === nextId && styles.isNext,
                  )}
                />
              ))}
            </div>
          </div>

          <div className={styles.totalBlock}>
            <span className={styles.totalLab}>
              Quoted total{draft.options.laborOnly ? " · labor only" : ""}
            </span>
            <span className={styles.totalNum} ref={totalRef}>
              {money(sheet.total)}
            </span>
          </div>

          <div className={styles.ledgerActs}>
            <button
              type="button"
              className={cx(styles.act, resetArmed && styles.actArmed)}
              onClick={onReset}
            >
              <Icon name="undo" />
              {resetArmed ? "Press again to reset" : "Reset"}
            </button>
            <button
              type="button"
              className={styles.act}
              onClick={onSave}
              disabled={saving !== null}
            >
              {saving === "save" && <Spinner />}
              Save
            </button>
            <button
              type="button"
              className={cx(styles.act, styles.actPrimary)}
              onClick={onSaveSend}
              disabled={saving !== null}
            >
              {saving === "send" ? <Spinner /> : <Icon name="send" />}
              Save &amp; send
            </button>
          </div>
        </div>

        {/* What is next, and how to get there. */}
        {nextId ? (
          <button type="button" className={styles.nextBar} onClick={() => jumpTo(nextId)}>
            <span className={styles.nextBadge}>Next</span>
            <span className={styles.nextNum} aria-hidden="true">
              {openCards[0].num}
            </span>
            <span className={styles.nextTitle}>{openCards[0].title}</span>
            <span className={styles.nextRule}>{openCards[0].rule}</span>
            {blockers.length > 0 && (
              <span className={styles.nextBlock}>
                {blockers.length} block{blockers.length === 1 ? "s" : ""} sending
              </span>
            )}
          </button>
        ) : (
          <p className={styles.allDone} role="status">
            Nothing left. All {CARD_COUNT} cards are settled and the client’s copy at
            the foot is ready to go.
          </p>
        )}

        {/* The undo offer. Every seam crossing raises one, and it names the
            cause rather than just saying that something happened. */}
        {undo && undoCard && (
          <div
            key={undo.seq}
            className={cx(styles.undoBar, undo.direction === "reopened" && styles.isReopen)}
            role="status"
          >
            <span className={styles.undoTag}>
              {undo.direction === "settled" ? "Settled" : "Reopened"}
            </span>
            <span className={styles.undoBody}>
              <strong>
                {undoCard.num} {undoCard.title}
              </strong>{" "}
              — {undo.cause}
            </span>
            <button
              type="button"
              className={styles.undoBtn}
              onClick={() => {
                setHeld(null);
                dispatch({ type: "undo" });
              }}
            >
              <Icon name="undo" />
              Undo
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => dispatch({ type: "dismissUndo" })}
            >
              <span className={styles.srOnly}>Dismiss</span>
              <Icon name="x" />
            </button>
          </div>
        )}

        {note && (
          <div className={styles.note} role="status">
            <p>{note}</p>
            <button type="button" className={styles.iconBtn} onClick={() => setNote(null)}>
              <span className={styles.srOnly}>Dismiss</span>
              <Icon name="x" />
            </button>
          </div>
        )}
      </div>

      {/* ── THE WORKLIST — two bands and the seam ──────────── */}
      <div className={cx(styles.worklist, styles.wlBlock)} ref={listRef}>
        <div className={styles.bandHead}>
          <span className={styles.bandLab}>Open</span>
          <span className={styles.bandRule} aria-hidden="true" />
          <span className={styles.bandCount}>
            {openCards.length} left
          </span>
        </div>

        {openCards.length === 0 && (
          <EmptyNote>
            Nothing needs you. Every card has met its condition and sunk below the
            line — reopen any of them to change your mind.
          </EmptyNote>
        )}

        {openCards.map((card) => (
          <WorkCard
            key={card.id}
            card={card}
            band="open"
            isNext={card.id === nextId}
            expanded={false}
            heldSettled={card.settled}
            onToggle={() => toggleExpanded(card.id)}
            onFocusIn={onFocusIn}
            onFocusOut={onFocusOut}
            register={register}
          >
            {bodies[card.id]}
          </WorkCard>
        ))}

        {/* THE SEAM. The page's one heaviest rule — everything under it is
            finished work, and that has to be legible from across a room.

            It counts the cards actually BELOW it, not the cards whose condition
            is met. Those two differ only while a card is held above the line by
            focus, and in exactly that case the held card is carrying the note
            that explains the gap ("this drops below the line when you leave").
            A divider that describes something other than what is under it would
            be a worse lie than a transient off-by-one. */}
        <div className={styles.seam}>
          <span className={styles.seamPlate}>
            Settled · {settledCards.length} of {CARD_COUNT}
          </span>
          <span className={styles.seamRule} aria-hidden="true" />
          <span className={cx(styles.seamSum, styles.num)}>{money(sheet.total)}</span>
        </div>

        {settledCards.length === 0 ? (
          <EmptyNote>
            Nothing settled yet. Cards drop here the moment they meet the condition
            printed on them.
          </EmptyNote>
        ) : (
          settledCards.map((card) => (
            <WorkCard
              key={card.id}
              card={card}
              band="settled"
              isNext={false}
              expanded={expanded.has(card.id)}
              heldSettled={false}
              onToggle={() => toggleExpanded(card.id)}
              onFocusIn={onFocusIn}
              onFocusOut={onFocusOut}
              register={register}
            >
              {bodies[card.id]}
            </WorkCard>
          ))
        )}
      </div>

      {/* ── THE CLIENT'S COPY ──────────────────────────────── */}
      <ClientCopy
        draft={draft}
        sheet={sheet}
        client={pickedClient}
        clientName={clientName}
        onOption={setOptions}
      />
    </>
  );
}
