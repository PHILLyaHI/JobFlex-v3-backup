"use client";

// FOCUS CARD — page CONTENT. Manual proposal builder, single-column card lab.
// Route: /dashboard/manual-focus.
//
// ── THE THESIS ───────────────────────────────────────────────
// Attention is the scarce resource, not screen space. So nothing on this page
// ever collapses and nothing ever hides — but only ONE card is ever LIVE.
//
// The live card is at full ink strength with every control open. The other nine
// stand down to a quiet, still-legible SUMMARY face at reduced weight — thinner
// border, no shadow, softer ink, condensed rows — that prints their REAL
// content: "4 named · 1 unnamed", "Anjali Patel · Austin, TX", "30% / 30% / 40%",
// "$12,004.35". Clicking a stood-down card, or tabbing into it, promotes it and
// the previous one settles back.
//
// The claim this has to win on: it is faster to answer "what did I put in
// scope?" here than on a page of ten equal cards, WITHOUT clicking anything.
// Nine summaries at a glance beat nine collapsed labels, and beat ten fully
// expanded cards that no longer fit on a screen.
//
// The transition is a change of WEIGHT, not a height animation. Nothing here
// transitions a height, and the promotion is scroll-anchored (see
// ./use-focus-column.ts) so the card under the cursor does not move when the
// column reflows around it. The grand total rides in a slim sticky strip under
// the topbar, so the money is never more than a glance away at any scroll
// position.
//
// ── WHY ONE COLUMN CHANGES THE DESIGN ────────────────────────
// - No preview pane, so "what the client sees" is the LAST card — the last
//   thing you read before you send. It is a peer in the promotion system, and
//   its stood-down face is a condensed version of the same table, so the four
//   options in card 06 visibly change it even while card 06 is the live one.
// - No modal layer, so creating a client, editing one, and answering Save all
//   happen INLINE, in the column, where they were triggered.
// - The card order IS the order of the printed document — who, what, money,
//   words, terms, payment — because people predict where things go when the
//   form matches the artifact.
//
// ── STRUCTURE, NOT A PILE ────────────────────────────────────
// Ten peer cards in a stack lose their sequence. The device here is a single
// one, applied rigorously: a mono station NUMERAL on every card, 01 through 10,
// in the same slot at the same size in both states, blueprint-blue on the live
// card and muted on the rest. No second ordering device competes with it.
//
// ── STATE + DATA ─────────────────────────────────────────────
// Component-local and fixture-seeded. No server actions, no Prisma, no network,
// and deliberately NOT the live builder's shared Zustand store — coupling a lab
// page to `useProposalDraftStore` would make an experiment able to break the
// real builder. Save, Save & send, "Save as company defaults" and the autosave
// chip are UI state and write nothing; they answer in the column so the honesty
// is visible rather than implied.
//
// EVERY BLOCK RETURNED HERE IS A DIRECT CHILD OF `.content`: the reveal cascade
// in ./use-reveal.ts walks `content.children`, and the sticky strip has to be
// one of those children to pin against `.main`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CardSpec,
  ClientChoice,
  ClientRecord,
  Draft,
  Installment,
  Line,
  ProjectRecord,
  ProposalOptions,
  StagedFile,
  SummaryRow,
} from "./manual-focus-types";
import {
  ORG_LINE,
  ORG_NAME,
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_CLIENTS,
  SEED_PROJECTS,
  TERMS_TEMPLATE,
  VALID_DAYS,
  estimateFromAddress,
  makeSeedDraft,
  stateDisplayName,
} from "./manual-focus-data";
import {
  computeTotals,
  coverState,
  coveredAmount,
  fileSize,
  firstLine,
  installmentValue,
  isNamed,
  money,
  moneyShort,
  newId,
  pct,
  pct1,
  qty,
  reducedMotion,
} from "./manual-focus-math";
import { useReveal } from "./use-reveal";
import { useFocusColumn } from "./use-focus-column";
import { FocusCard } from "./focus-card";
import { Area, Field, Ic, LinkBtn, TextIn, cx } from "./focus-ui";
import { ClientPicker, ProjectPicker, cityLine, fullAddress } from "./focus-pickers";
import { LinesBlock } from "./focus-lines";
import { MoneyBlock } from "./focus-money";
import {
  FilesBlock,
  OptionsBlock,
  PaymentBlock,
  coverCopy,
  scheduleShape,
} from "./focus-blocks";
import { ProofSheet } from "./focus-proof";
import styles from "./manual-focus.module.css";

/** Fake-autosave timings. Both sit in the Motion System's UI band; the debounce
 *  is close enough to the live builder's 1.2s feel to be judged against it. */
const AUTOSAVE_DEBOUNCE_MS = 450;
const AUTOSAVE_WRITE_MS = 1150;

/** How long the destructive Reset stays armed before it disarms itself. */
const RESET_ARMED_MS = 4000;

/** How many printed lines the client's-copy summary face lists before it
 *  starts counting instead. Four keeps the stood-down card roughly the height
 *  of its neighbours, which is what stops the column reading as lopsided. */
const PROOF_SUMMARY_LINES = 4;

/**
 * Re-run the address-driven tax estimate, honouring `taxAuto`.
 *
 * MODULE SCOPE, and pure. It is called from three places — typing an address,
 * choosing a client, and the "use the client's address" link — and those three
 * are one rule, not three: the chosen client fills the job address, the address
 * suggests a rate, and a rate the user has typed is never silently overwritten
 * by either. Split across three handlers this drifts within a week.
 */
function withEstimate(prev: Draft, address: string): Draft {
  const est = estimateFromAddress(address);
  if (prev.taxAuto && est) {
    return { ...prev, address, taxPct: est.pct, taxState: est.code };
  }
  // Still following, but the address no longer names a state we know: keep the
  // last rate and drop the provenance, so the field can say exactly that.
  return { ...prev, address, taxState: prev.taxAuto ? "" : prev.taxState };
}

/**
 * The card the page opens on.
 *
 * Card 03, not card 01. The variant's argument is that the stood-down faces are
 * readable, and opening on the first card puts nine summaries BELOW the fold
 * and none above it. Opening in the middle of the column shows the mechanism in
 * both directions on the first paint.
 */
const INITIAL_LIVE = "mc-lines";

export function ManualFocusContent() {
  useReveal();

  /* ── Draft + session records ───────────────────────────────
     One draft object rather than twenty useStates: nine summary faces, the
     running total and the save chip all read the WHOLE draft on every
     keystroke. Clients and projects live beside it because an inline "create"
     appends to a list the draft only points into. */
  const [draft, setDraft] = useState<Draft>(makeSeedDraft);
  const [clients, setClients] = useState<ClientRecord[]>(() =>
    SEED_CLIENTS.map((c) => ({ ...c, tags: [...c.tags] })),
  );
  const [projects, setProjects] = useState<ProjectRecord[]>(() =>
    SEED_PROJECTS.map((p) => ({ ...p })),
  );

  const { liveId, promote, register } = useFocusColumn(INITIAL_LIVE);

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const totals = useMemo(() => computeTotals(draft), [draft]);

  /* ── Address, client and the tax estimate ──────────────────
     All three go through `withEstimate` above; see the note there. */

  const writeAddress = useCallback((next: string) => {
    // Typed by hand, so the address stops following the client record.
    setDraft((prev) => ({ ...withEstimate(prev, next), addressAuto: false }));
  }, []);

  const chooseClient = useCallback((next: ClientChoice, record: ClientRecord | null) => {
    setDraft((prev) => {
      const auto = record ? fullAddress(record) : "";
      const address = prev.addressAuto && auto ? auto : prev.address;
      return { ...withEstimate(prev, address), client: next };
    });
  }, []);

  const setClientChoice = useCallback(
    (next: ClientChoice) => {
      const record =
        next.mode === "record" ? (clients.find((c) => c.id === next.id) ?? null) : null;
      chooseClient(next, record);
    },
    [clients, chooseClient],
  );

  /** Create-or-replace by id, then select — see the note on the picker's prop. */
  const saveClient = useCallback(
    (record: ClientRecord) => {
      setClients((prev) =>
        prev.some((c) => c.id === record.id)
          ? prev.map((c) => (c.id === record.id ? record : c))
          : [record, ...prev],
      );
      chooseClient({ mode: "record", id: record.id }, record);
    },
    [chooseClient],
  );

  const saveProject = useCallback((record: ProjectRecord) => {
    setProjects((prev) =>
      prev.some((p) => p.id === record.id)
        ? prev.map((p) => (p.id === record.id ? record : p))
        : [record, ...prev],
    );
  }, []);

  const addressEstimate = useMemo(() => estimateFromAddress(draft.address), [draft.address]);

  /* ── Line items ────────────────────────────────────────────*/
  const patchLine = useCallback((id: string, p: Partial<Line>) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === id ? { ...l, ...p } : l)),
    }));
  }, []);

  const addLine = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: newId("ln"),
          name: "",
          description: "",
          unit: "SQFT",
          quantity: 1,
          materialCost: 0,
          laborCost: 0,
        },
      ],
    }));
  }, []);

  const removeLine = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== id) }));
  }, []);

  /* ── Payment schedule ──────────────────────────────────────*/
  const patchInstallment = useCallback((id: string, p: Partial<Installment>) => {
    setDraft((prev) => ({
      ...prev,
      installments: prev.installments.map((i) => (i.id === id ? { ...i, ...p } : i)),
    }));
  }, []);

  const addInstallment = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      installments: [
        ...prev.installments,
        { id: newId("in"), label: "", amount: 0, isPercent: true },
      ],
    }));
  }, []);

  const removeInstallment = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      installments: prev.installments.filter((i) => i.id !== id),
    }));
  }, []);

  /* ── Files ─────────────────────────────────────────────────*/
  const addFiles = useCallback((staged: StagedFile[]) => {
    setDraft((prev) => ({ ...prev, files: [...prev.files, ...staged] }));
  }, []);

  const removeFile = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== id) }));
  }, []);

  const setOptions = useCallback((p: Partial<ProposalOptions>) => {
    setDraft((prev) => ({ ...prev, options: { ...prev.options, ...p } }));
  }, []);

  /* ── Persistence chrome (UI state only) ────────────────────
     The chip runs on a signature of the whole draft so it fires on real edits
     and not on every re-render. Both transitions live inside timeouts: a
     synchronous setState in an effect body is the thing that rule exists to
     stop, and the delay here is a genuine debounce rather than a dodge. */
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved">("idle");
  const signature = useMemo(() => JSON.stringify(draft), [draft]);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (lastSig.current === null) {
      // First commit — the seed is not an edit, so there is nothing to "save".
      lastSig.current = signature;
      return;
    }
    if (lastSig.current === signature) return;
    lastSig.current = signature;
    const start = window.setTimeout(() => setAutoState("saving"), AUTOSAVE_DEBOUNCE_MS);
    const land = window.setTimeout(() => setAutoState("saved"), AUTOSAVE_WRITE_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(land);
    };
  }, [signature]);

  /* ── Total-changed flash ───────────────────────────────────
     Driven straight at the DOM: the highlight is a one-shot on an element, not
     a fact about the proposal, and toggling a class is exactly the
     "synchronise with something outside React" job an effect is for. The
     animation is two transition durations on the two states — fast in, slow
     out — because Lightning CSS rejects @keyframes inside a CSS module and this
     variant may not add to the shell's global stylesheet. */
  const totalRef = useRef<HTMLSpanElement>(null);
  const prevTotal = useRef(totals.total);
  useEffect(() => {
    if (prevTotal.current === totals.total) return;
    prevTotal.current = totals.total;
    const el = totalRef.current;
    if (!el || reducedMotion()) return;
    el.classList.add(styles.isFlash);
    const off = window.setTimeout(() => el.classList.remove(styles.isFlash), 120);
    return () => window.clearTimeout(off);
  }, [totals.total]);

  /* ── The column's one message channel ──────────────────────
     Save, Send and "save as defaults" answer in the strip, under its own row.
     This page has no dialog layer by design, and an inline answer needs no
     dismissal ceremony to be readable.

     THE CHANNEL IS TONED, because it carries more than one kind of answer.
     "The sheet checks out" and "Saved as company defaults" are not warnings,
     and printing them in the amber frame is the status palette marking
     something that is not that status — the one thing the distribution rule
     forbids. Only the missing-fields answer is a warning; the rest are
     information, and they get the blueprint frame. */
  const [note, setNote] = useState<{ tone: "info" | "warn"; text: string } | null>(null);

  const [resetArmed, setResetArmed] = useState(false);
  const disarm = useRef<number | null>(null);
  useEffect(() => {
    // Cleanup only — a pending disarm must not fire into an unmounted strip.
    return () => {
      if (disarm.current !== null) window.clearTimeout(disarm.current);
    };
  }, []);

  function onReset() {
    if (disarm.current !== null) window.clearTimeout(disarm.current);
    if (!resetArmed) {
      setResetArmed(true);
      disarm.current = window.setTimeout(() => setResetArmed(false), RESET_ARMED_MS);
      return;
    }
    setResetArmed(false);
    setDraft(makeSeedDraft());
    setClients(SEED_CLIENTS.map((c) => ({ ...c, tags: [...c.tags] })));
    setProjects(SEED_PROJECTS.map((p) => ({ ...p })));
    setAutoState("idle");
    setNote(null);
  }

  /* ── Derived text used by the summaries and the sheet ──────
     `choice` is narrowed into a local const FIRST. A discriminated union
     narrowed through a property access (`draft.client.mode === "record"`) loses
     that narrowing the moment it is read inside a callback — the compiler
     cannot prove `draft` was not reassigned before the callback ran. A const
     can never be, so the narrowing survives into `.find()`. */
  const choice = draft.client;

  const chosenClient =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;

  const clientLabel =
    choice.mode === "record"
      ? (chosenClient?.name ?? "Client record missing")
      : choice.mode === "freeText" && choice.name.trim()
        ? choice.name.trim()
        : "No client yet";

  const clientChosen =
    choice.mode === "record"
      ? chosenClient !== null
      : choice.mode === "freeText" && choice.name.trim().length > 0;

  const project = projects.find((p) => p.id === draft.projectId) ?? null;
  const namedLines = draft.lines.filter(isNamed);
  const stateName = draft.taxState ? stateDisplayName(draft.taxState) : "";
  const covered = coveredAmount(draft.installments, totals.total);
  const cover = coverState(draft.installments, totals.total);
  /** A schedule exists but there is no total to divide — "none" for a second
   *  reason, and the one where "Add an installment" would be a lie. The live
   *  card's meter says the same thing; see `coverCopy`. */
  const coverEmpty = cover === "none" && draft.installments.length > 0;
  const filesSize = draft.files.reduce((sum, f) => sum + f.size, 0);
  const optionsOn = Object.values(draft.options).filter(Boolean).length;

  /** The single biggest line, for card 03's summary — "where is the money?" is
   *  the question a subtotal alone does not answer. */
  const biggest = totals.printed.reduce<{ name: string; amount: number } | null>(
    (best, l) => (best === null || l.amount > best.amount ? { name: l.name, amount: l.amount } : best),
    null,
  );

  /** What the four options add up to, in the client's-copy summary voice. */
  const printsList = [
    draft.options.hideBreakdown ? "line totals only" : "cost breakdown",
    draft.options.laborOnly ? "labor-only layout" : "full quote",
    draft.options.showScope ? "scope" : null,
    draft.options.showSignature ? "signatures" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* ── THE TEN CARDS ─────────────────────────────────────────
     Built inline rather than memoised: the summaries are derived from the whole
     draft, so their dependency list would be the draft itself and the memo
     would never hit. Ten small object literals per keystroke is cheaper than
     the bookkeeping. */
  const proofSummary: SummaryRow[] = [
    ...totals.printed.slice(0, PROOF_SUMMARY_LINES).map((l) => ({
      label: firstLine(l.name, 34) || "Untitled line",
      value: money(l.amount),
      numeric: true,
    })),
    ...(totals.printed.length > PROOF_SUMMARY_LINES
      ? [
          {
            label: "…and more",
            value: `${totals.printed.length - PROOF_SUMMARY_LINES} further lines`,
          },
        ]
      : []),
    { label: "Subtotal", value: money(totals.preTax), numeric: true },
    { label: `Tax · ${pct(draft.taxPct)}`, value: money(totals.tax), numeric: true },
    { label: "Total", value: money(totals.total), numeric: true },
    { label: "Prints", value: printsList },
  ];

  const cards: CardSpec[] = [
    {
      num: "01",
      id: "mc-job",
      title: "The job",
      teach:
        "What this quote is for and which project it belongs to. The title heads the client's copy.",
      chip: draft.title.trim() ? "Titled" : "No title",
      summary: [
        {
          label: "Title",
          value: draft.title.trim() || "Untitled proposal",
          tone: draft.title.trim() ? undefined : "warn",
        },
        { label: "Project", value: project?.name ?? "None chosen" },
        {
          label: "Overview",
          value: firstLine(draft.description, 72) || "Not written yet",
          tone: draft.description.trim() ? undefined : "warn",
        },
      ],
    },
    {
      num: "02",
      id: "mc-client",
      title: "The client",
      teach:
        "Who receives it and where the work happens. The job address auto-fills from the client and sets the tax estimate in card 03 — and stays freely editable.",
      chip:
        draft.client.mode === "record"
          ? "On file"
          : draft.client.mode === "freeText"
            ? "One-off"
            : "No client",
      summary: [
        {
          label: "Client",
          value: chosenClient
            ? [chosenClient.name, cityLine(chosenClient)].filter(Boolean).join(" · ")
            : clientLabel,
          tone: clientChosen ? undefined : "warn",
        },
        {
          label: "Contact",
          value: chosenClient
            ? [chosenClient.email, chosenClient.phone].filter(Boolean).join("  ·  ") ||
              "No contact details on file."
            : "Not a client record",
        },
        {
          label: "Job address",
          value: draft.address.trim() || "Not set",
          tone: draft.address.trim() ? undefined : "warn",
        },
      ],
    },
    {
      num: "03",
      id: "mc-lines",
      title: "Line items",
      teach:
        "The priced work. Name, quantity, unit and unit price stay on one line; the description and the material / labor split sit behind each row's arrow.",
      chip: moneyShort(totals.subtotalCosts),
      summary: [
        {
          label: "Lines",
          value:
            totals.unnamedCount > 0
              ? `${namedLines.length} named · ${totals.unnamedCount} unnamed, not counted`
              : `${namedLines.length} named`,
          tone: totals.unnamedCount > 0 ? "warn" : undefined,
        },
        // moneyShort, matching this card's OWN chip two lines above it. Both
        // registers are visible at once on a stood-down face, and "$11,089"
        // beside "$11,089.20" reads as two different figures.
        { label: "Subtotal", value: moneyShort(totals.subtotalCosts), numeric: true },
        {
          label: "Largest line",
          value: biggest ? `${firstLine(biggest.name, 30)} · ${money(biggest.amount)}` : "None yet",
        },
        {
          label: "Tax rate",
          value: draft.taxAuto
            ? `${pct(draft.taxPct)} · ${stateName ? `estimated from ${stateName}` : "no state recognised"}`
            : `${pct(draft.taxPct)} · entered by hand`,
        },
      ],
    },
    {
      num: "04",
      id: "mc-money",
      title: "Markup & margin",
      teach:
        "What you make on the job. Drag or type; the dollar figure beside each control is what that percentage is actually adding.",
      chip: `Margin ${pct1(totals.margin)}`,
      summary: [
        {
          label: "Markups",
          value: `Materials ${pct(draft.materialMarkupPct)} · Labor ${pct(draft.laborMarkupPct)}`,
        },
        {
          label: "Overhead / profit",
          value: `${pct(draft.overheadPct)} · ${pct(draft.profitPct)}`,
        },
        {
          label: "Carried over cost",
          value: `${money(totals.preTax - totals.baseTotal)} on ${money(totals.baseTotal)}`,
          numeric: true,
        },
        { label: "Grand total", value: money(totals.preTax), numeric: true },
      ],
    },
    {
      num: "05",
      id: "mc-scope",
      title: "Scope & notes",
      teach:
        "The words that go with the price. Scope is what you are promising; notes are for you and whoever runs the crew.",
      chip: draft.scopeOfWork.trim() ? "Scope written" : "No scope",
      summary: [
        {
          label: "Scope of work",
          value: firstLine(draft.scopeOfWork, 72) || "Not written yet",
          tone: draft.scopeOfWork.trim() ? undefined : "warn",
        },
        { label: "Notes", value: firstLine(draft.notes, 72) || "None" },
      ],
    },
    {
      num: "06",
      id: "mc-prints",
      title: "What prints",
      teach:
        "Four switches that change the client's copy in card 10 and nothing else. None of them moves the price.",
      chip: `${optionsOn} of 4 on`,
      summary: [
        {
          // Three-way, like the switch's own effect line: the labor-only layout
          // drops the split whatever this toggle says.
          label: "Breakdown costs",
          value: draft.options.laborOnly
            ? "Not printed — labor-only layout"
            : draft.options.hideBreakdown
              ? "Hidden — line totals only"
              : "Printed per line",
        },
        { label: "Quote style", value: draft.options.laborOnly ? "Labor only" : "Full quote" },
        {
          label: "Signature lines",
          value: draft.options.showSignature ? "On the sheet" : "Not printed",
        },
        {
          label: "Scope of work",
          value: draft.options.showScope ? "Printed" : "Not printed",
        },
      ],
    },
    {
      num: "07",
      id: "mc-terms",
      title: "Terms & conditions",
      teach:
        "Payment terms, change-order policy, warranty, dispute resolution. A starter template is one click away.",
      chip: draft.terms.trim() ? "Set" : "Empty",
      summary: [
        {
          label: "Terms",
          value:
            firstLine(draft.terms, 72) ||
            "Nothing written — the starter template covers payment, change orders and warranty",
          tone: draft.terms.trim() ? undefined : "warn",
        },
        {
          // Through the page's own formatter, like every other figure in the
          // tabular register — a raw JS number prints "1234" beside a column of
          // "1,234"s.
          label: "Length",
          value: `${qty(draft.terms.trim().length)} characters`,
          numeric: true,
        },
      ],
    },
    {
      num: "08",
      id: "mc-pay",
      title: "Payment schedule",
      teach:
        "How the total gets paid. A percentage means nothing until a total exists, so the dollar figure appears as soon as one does.",
      chip:
        cover === "exact"
          ? "Balanced"
          : cover === "over"
            ? "Over"
            : cover === "under"
              ? "Short"
              : "None",
      summary: [
        { label: "Schedule", value: scheduleShape(draft.installments) },
        {
          // The same three grades the meter inside the card uses, so the two
          // faces of one card can never colour the same fact differently: an
          // OVER schedule is danger red in both, not red here and amber there.
          label: "Covers",
          value: coverEmpty
            ? coverCopy(cover, draft.installments.length, totals.total)
            : `${money(covered)} of ${money(totals.total)}`,
          numeric: !coverEmpty,
          tone: cover === "exact" ? "ok" : cover === "over" ? "err" : "warn",
        },
        {
          label: "First payment",
          value:
            draft.installments.length > 0
              ? `${draft.installments[0].label.trim() || "Installment 1"} · ${money(
                  installmentValue(draft.installments[0], totals.total),
                )}`
              : "None scheduled",
        },
      ],
    },
    {
      num: "09",
      id: "mc-files",
      title: "Files & documents",
      teach:
        "Anything that helps the client see the job. Files staged here stay in this browser — nothing is uploaded.",
      chip:
        draft.files.length === 0
          ? "No file"
          : `${draft.files.length} file${draft.files.length === 1 ? "" : "s"}`,
      summary: [
        {
          label: "Attached",
          value:
            draft.files.length > 0
              ? draft.files.map((f) => f.name).join("  ·  ")
              : "No file chosen",
        },
        {
          label: "Total size",
          value: draft.files.length > 0 ? fileSize(filesSize) : "—",
          numeric: true,
        },
      ],
    },
    {
      num: "10",
      id: "mc-proof",
      title: "The client's copy",
      teach:
        "The same document, printed. This is what leaves your hands — the four switches in card 06 change it and nothing above it.",
      chip: money(totals.total),
      summary: proofSummary,
    },
  ];

  /* ── Terminal actions ──────────────────────────────────────*/
  function onSaveDraft() {
    setAutoState("saved");
    setNote({
      tone: "info",
      text: "Nothing was written. This is a design lab page with no data layer — Save, Save & send and the autosave chip are UI state only.",
    });
  }

  function onSaveSend() {
    const missing: string[] = [];
    if (!clientChosen) missing.push("a client");
    if (!draft.title.trim()) missing.push("a title");
    if (namedLines.length === 0) missing.push("at least one named line");
    if (cover !== "exact" && draft.installments.length > 0) {
      missing.push("a payment schedule that covers the total");
    }

    // The one genuine warning this channel carries: the sheet is not ready.
    if (missing.length > 0) {
      setNote({ tone: "warn", text: `Still open before this could go out: ${missing.join(", ")}.` });
      return;
    }
    setAutoState("saved");
    setNote({
      tone: "info",
      text: "The sheet checks out. Nothing was sent — this lab page has no data layer, so Save & send stops here.",
    });
  }

  function onSaveDefaults() {
    setNote({
      tone: "info",
      text: `Saved as company defaults, in the demo sense: materials ${pct(
        draft.materialMarkupPct,
      )}, labor ${pct(draft.laborMarkupPct)}, overhead ${pct(
        draft.overheadPct,
      )}, profit ${pct(draft.profitPct)}. Nothing was written.`,
    });
  }

  const chipText =
    autoState === "saving" ? "Saving…" : autoState === "saved" ? "Draft saved" : "No changes yet";
  const chipClass =
    autoState === "saving"
      ? cx(styles.saveChip, styles.chipSaving)
      : autoState === "saved"
        ? cx(styles.saveChip, styles.chipSaved)
        : styles.saveChip;

  /** One renderer per card id, so the ten `FocusCard`s below stay a list rather
   *  than a wall of conditionals. */
  function bodyFor(id: string) {
    switch (id) {
      case "mc-job":
        return (
          <div className={styles.stack}>
            <Field label="Proposal title" htmlFor="mc-title">
              <TextIn
                id="mc-title"
                value={draft.title}
                onChange={(v) => patch({ title: v })}
                placeholder="Patel Residence — Roof Replacement"
              />
            </Field>

            <Field label="Project" optional>
              <ProjectPicker
                projects={projects}
                projectId={draft.projectId}
                onPick={(pid) => patch({ projectId: pid })}
                onCreate={saveProject}
              />
            </Field>

            <Field label="Description" htmlFor="mc-desc">
              <Area
                id="mc-desc"
                value={draft.description}
                onChange={(v) => patch({ description: v })}
                placeholder="One-paragraph overview your client will see first."
                rows={4}
              />
            </Field>
          </div>
        );

      case "mc-client":
        return (
          <div className={styles.stack}>
            <Field label="Client">
              <ClientPicker
                clients={clients}
                choice={draft.client}
                onChange={setClientChoice}
                onSaveClient={saveClient}
              />
            </Field>

            <Field
              label="Job address"
              optional
              htmlFor="mc-address"
              hint={
                draft.addressAuto
                  ? "Auto-filled from the client and used for the tax estimate in card 03. Edit it and it stops following the client."
                  : "Entered by hand. Choosing a different client will not overwrite it."
              }
            >
              <div className={styles.addressRow}>
                <TextIn
                  id="mc-address"
                  value={draft.address}
                  onChange={writeAddress}
                  placeholder="3411 Wild Cherry Dr, Austin, TX 78704"
                />
                {/* The Find affordance. It is a real control when there is a
                    record to pull from, and a line of teaching when there is
                    not — a disabled button that never says why is worse than
                    either. THREE states, because "no record" and "a record with
                    no address" are different problems with different fixes, and
                    the seeded list ships a client of the second kind (Ruiz &
                    Sons): telling someone to pick a client when they already
                    have is the same dead-end as a button that does nothing. */}
                {chosenClient && fullAddress(chosenClient) ? (
                  <LinkBtn
                    icon="pin"
                    onClick={() => {
                      setDraft((prev) => ({
                        ...withEstimate(prev, fullAddress(chosenClient)),
                        addressAuto: true,
                      }));
                    }}
                  >
                    Find · use the client&rsquo;s address
                  </LinkBtn>
                ) : chosenClient ? (
                  <p className={styles.ann}>
                    {`${chosenClient.name} has no address on file — type it here, or add it with Edit.`}
                  </p>
                ) : (
                  <p className={styles.ann}>
                    Pick a client above and Find will fill this from their record.
                  </p>
                )}
              </div>
            </Field>
          </div>
        );

      case "mc-lines":
        return (
          <LinesBlock
            lines={draft.lines}
            rates={{
              materialMarkupPct: draft.materialMarkupPct,
              laborMarkupPct: draft.laborMarkupPct,
            }}
            taxPct={draft.taxPct}
            taxAuto={draft.taxAuto}
            taxState={draft.taxState}
            estimate={addressEstimate}
            stateName={addressEstimate ? stateDisplayName(addressEstimate.code) : stateName}
            onPatchLine={patchLine}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            onTaxChange={(v) => patch({ taxPct: v, taxAuto: false })}
            onUseEstimate={() => {
              if (!addressEstimate) return;
              patch({
                taxPct: addressEstimate.pct,
                taxAuto: true,
                taxState: addressEstimate.code,
              });
            }}
          />
        );

      case "mc-money":
        return (
          <MoneyBlock
            materialMarkupPct={draft.materialMarkupPct}
            laborMarkupPct={draft.laborMarkupPct}
            overheadPct={draft.overheadPct}
            profitPct={draft.profitPct}
            totals={totals}
            onMarkup={patch}
            onSaveDefaults={onSaveDefaults}
          />
        );

      case "mc-scope":
        return (
          <div className={styles.stack}>
            <Field label="Scope of work" htmlFor="mc-scope-ta">
              <Area
                id="mc-scope-ta"
                value={draft.scopeOfWork}
                onChange={(v) => patch({ scopeOfWork: v })}
                placeholder="Remove existing shingles, install underlayment…"
                rows={6}
              />
            </Field>
            <Field label="Notes" optional htmlFor="mc-notes">
              <Area
                id="mc-notes"
                value={draft.notes}
                onChange={(v) => patch({ notes: v })}
                placeholder="Warranty, assumptions, exclusions…"
                rows={4}
              />
            </Field>
          </div>
        );

      case "mc-prints":
        return <OptionsBlock options={draft.options} onChange={setOptions} />;

      case "mc-terms":
        return (
          <div className={styles.stack}>
            <div className={styles.termsHead}>
              <LinkBtn
                icon="file"
                onClick={() =>
                  patch({
                    terms: draft.terms.trim() ? `${draft.terms.trim()}\n${TERMS_TEMPLATE}` : TERMS_TEMPLATE,
                  })
                }
              >
                {draft.terms.trim() ? "Append the starter template" : "Insert starter template"}
              </LinkBtn>
              {draft.terms.trim() && (
                <LinkBtn icon="undo" onClick={() => patch({ terms: "" })}>
                  Clear
                </LinkBtn>
              )}
            </div>
            <Field label="Terms" htmlFor="mc-terms-ta">
              <Area
                id="mc-terms-ta"
                value={draft.terms}
                onChange={(v) => patch({ terms: v })}
                placeholder="Payment terms, change-order policy, warranty, dispute resolution…"
                rows={7}
              />
            </Field>
          </div>
        );

      case "mc-pay":
        return (
          <PaymentBlock
            installments={draft.installments}
            total={totals.total}
            state={cover}
            onPatch={patchInstallment}
            onAdd={addInstallment}
            onRemove={removeInstallment}
          />
        );

      case "mc-files":
        return <FilesBlock files={draft.files} onAdd={addFiles} onRemove={removeFile} />;

      case "mc-proof":
        return (
          <ProofSheet
            draft={draft}
            totals={totals}
            client={chosenClient}
            clientName={clientLabel}
            orgName={ORG_NAME}
            orgLine={ORG_LINE}
            proposalNo={PROPOSAL_NO}
            proposalDate={PROPOSAL_DATE}
            validDays={VALID_DAYS}
          />
        );

      default:
        return null;
    }
  }

  return (
    <>
      {/* ── MASTHEAD ─────────────────────────────────────────── */}
      <div className={cx("page-head", styles.col)}>
        <div>
          <div className="kicker">Manual builder · Card lab</div>
          <h1 className="page-title">Focus Card</h1>
          <div className={styles.headMeta}>
            <span>Draft № {PROPOSAL_NO}</span>
            <i aria-hidden="true" />
            <span>{PROPOSAL_DATE}</span>
            <i aria-hidden="true" />
            <span>Design preview — nothing is saved</span>
          </div>
        </div>
      </div>

      {/* ── THE SLIM MONEY STRIP ─────────────────────────────
          Sticky under the shell's 62px topbar. Opaque on purpose: a sticky bar
          that lets content show through is unreadable the moment you scroll. */}
      <div className={cx(styles.strip, styles.col)}>
        <div className={styles.stripRow}>
          <span className={styles.totalLab}>Total · with tax</span>
          <span className={styles.totalNum} ref={totalRef}>
            {money(totals.total)}
          </span>
          <span className={styles.totalSub}>
            {namedLines.length} line{namedLines.length === 1 ? "" : "s"} · subtotal{" "}
            {money(totals.preTax)} · tax {pct(draft.taxPct)} {money(totals.tax)}
          </span>

          <div className={styles.stripActs}>
            <span className={chipClass} aria-live="polite">
              {chipText}
            </span>
            <button
              type="button"
              className={cx(styles.act, resetArmed && styles.actArmed)}
              onClick={onReset}
            >
              <Ic name="undo" />
              {resetArmed ? "Press again" : "Reset"}
            </button>
            <button type="button" className={styles.act} onClick={onSaveDraft}>
              Save
            </button>
            <button
              type="button"
              className={cx(styles.act, styles.actPrimary)}
              onClick={onSaveSend}
            >
              <Ic name="send" />
              Save &amp; send
            </button>
          </div>
        </div>

        {note && (
          <div
            className={cx(styles.stripNote, note.tone === "info" && styles.isInfo)}
            role="status"
          >
            <Ic name="pin" />
            <p>{note.text}</p>
            <button
              type="button"
              className={styles.noteX}
              aria-label="Dismiss this message"
              onClick={() => setNote(null)}
            >
              <Ic name="x" />
            </button>
          </div>
        )}
      </div>

      {/* ── THE COLUMN ───────────────────────────────────────
          Each card is its own direct child of `.content` so the reveal cascade
          draws the column in top to bottom. */}
      {cards.map((spec) => (
        <FocusCard
          key={spec.id}
          spec={spec}
          live={spec.id === liveId}
          promote={promote}
          register={register}
        >
          {bodyFor(spec.id)}
        </FocusCard>
      ))}
    </>
  );
}
