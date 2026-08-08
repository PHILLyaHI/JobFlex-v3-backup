"use client";

// PROOF CARD — page CONTENT. Manual proposal builder, single-column card lab.
// (route: /dashboard/manual-proof)
//
// THE BET
// In a quote, every section should show its own consequence on the price, in
// place, so the grand total is never a surprise at the bottom. So every card on
// this page ends with a PROOF FOOTER: a mono, tabular strip across the card's
// foot, cut off by a 2px ink rule, that states in plain arithmetic what this
// card contributes —
//
//     02  5 rows · 4 priced, 1 unnamed   →  $12,400.20  base cost      RUNNING $12,400.20
//     03  markups + overhead + profit    →  +$1,802.44  margin 12.7%   RUNNING $14,202.64
//     04  Texas 8.25% on $14,202.64      →  +$1,171.72  sales tax      RUNNING $15,374.36
//
// Read only the footers, top to bottom, and you have read the whole estimate as
// a running derivation ending in the proposal total on the last card. Cards
// that cannot move the price (basics, scope, terms, files) still carry a
// footer, stating COVERAGE instead of money — "titled · client on file ·
// address set" — so the grammar never breaks and the column never has a card
// that simply stops.
//
// Any control that moves a figure flashes ONLY the footer it moved (a sky rule
// drawn across the strip, erased half a second later, skipped entirely under
// prefers-reduced-motion). Cause and effect without scrolling to find out.
//
// WHY ONE COLUMN CHANGES THE DESIGN
// - No preview pane, so the client's copy is the LAST card, and its footer is
//   the proposal total in the biggest numerals on the page.
// - No modal layer, so creating a client, editing one and finding an address
//   all happen INLINE, in the card that asked for them.
// - Money never scrolls away: a sticky DERIVATION BAR under the topbar carries
//   the same chain compressed to one line — base → uplift → tax = total — with
//   every link a jump control to the card that owns it.
//
// EVERY BLOCK RETURNED HERE IS A DIRECT CHILD OF `.content`: the reveal cascade
// in ./use-reveal.ts walks `content.children`, and the sticky bar has to be one
// of those children to pin against `.main`.
//
// STATE + DATA
// Component-local, fixture-seeded, and nothing persists. No server action, no
// Prisma, no network, and deliberately NOT the live builder's Zustand store —
// coupling a lab page to the shipped draft store is how a design experiment
// turns into a data-layer change. Save, Save & send and the autosave chip are
// UI state and write nothing, and they say so in the column rather than
// implying a pipeline that is not there.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReveal } from "./use-reveal";
import type {
  CardMeta,
  ClientChoice,
  ClientRecord,
  Installment,
  LineItem,
  Markups,
  ProjectRecord,
  ProofDraft,
  ProposalOptions,
  StagedFile,
} from "./manual-proof-types";
import {
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_ADDRESSES,
  SEED_CLIENTS,
  SEED_PROJECTS,
  STATE_NAMES,
  STATE_TAX,
  TERMS_TEMPLATE,
  makeSeedDraft,
} from "./manual-proof-data";
import {
  computeTotals,
  coverState,
  coveredAmount,
  fileSize,
  installmentValue,
  isMaterialOnly,
  isUnnamed,
  money,
  moneyDelta,
  pct,
  plural,
  reducedMotion,
  words,
} from "./manual-proof-math";
import { CoverFoot, MoneyFoot, ProofCard, TotalFoot, cx } from "./proof-card";
import { Field, Ic } from "./proof-bits";
import { AddressField, ClientPicker, ProjectPicker, clientAddressLine } from "./proof-pickers";
import { LinesBlock } from "./proof-lines";
import { EstimateBlock, MarginBadge } from "./proof-estimate";
import {
  DescriptionField,
  FilesBlock,
  OptionsBlock,
  PaymentBlock,
  ScopeBlock,
  TaxBlock,
  TermsBlock,
  TitleField,
} from "./proof-extras";
import { ProofSheet } from "./proof-preview";
import styles from "./manual-proof.module.css";

/** How long the fake save appears to take. Inside the Motion System's UI band,
 *  long enough to read the state change and not one frame longer. */
const SAVE_MS = 900;

/** How long the destructive Reset stays armed before it disarms itself. */
const RESET_ARMED_MS = 4000;

/**
 * The nine cards, in derivation order.
 *
 * Money first and CONTIGUOUS — base, uplift, tax, split — so the four cards
 * that build the price are read one after another with nothing in between, and
 * the coverage cards follow. `kind` also drives the numeral treatment: money
 * cards carry an ink plate, coverage cards a plain numeral, so the spine of the
 * estimate separates from everything else at a squint.
 */
const CARDS: CardMeta[] = [
  {
    num: "01",
    id: "pc-basics",
    title: "Basics",
    teach: "Who the proposal is for, what it is called, and where the work happens.",
    kind: "cover",
  },
  {
    num: "02",
    id: "pc-lines",
    title: "Line items",
    teach: "The work, priced at what it costs you. Markup is card 03's business.",
    kind: "money",
  },
  {
    num: "03",
    id: "pc-estimate",
    title: "Estimate breakdown",
    teach: "What you add on top of cost — and what each rate is worth in dollars.",
    kind: "money",
  },
  {
    num: "04",
    id: "pc-tax",
    title: "Sales tax",
    teach: "The rate for this address, and whether it is an estimate or your own number.",
    kind: "money",
  },
  {
    num: "05",
    id: "pc-payment",
    title: "Payment schedule",
    teach: "How the total gets paid, and whether the installments actually add up to it.",
    kind: "money",
  },
  {
    num: "06",
    id: "pc-scope",
    title: "Scope & notes",
    teach: "What you are telling them about the work itself.",
    kind: "cover",
  },
  {
    num: "07",
    id: "pc-options",
    title: "What prints",
    teach: "Four switches that change the document the client receives.",
    kind: "cover",
  },
  {
    num: "08",
    id: "pc-terms",
    title: "Terms & conditions",
    teach: "The rules that follow the money on the signed document.",
    kind: "cover",
  },
  {
    num: "09",
    id: "pc-files",
    title: "Files & documents",
    teach: "Anything that helps the client see the job. Staged locally, never uploaded.",
    kind: "cover",
  },
];

/**
 * The two-letter state an address resolves to, or "" when it resolves to none
 * this fixture knows about. Deliberately dumb: the real estimate comes from a
 * service this route may not call, and the point of the control is the LINK
 * between an address and a rate, not the geocoding.
 */
function knownState(address: string): string {
  const upper = address.toUpperCase();
  const withZip = upper.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/);
  const trailing = upper.match(/\b([A-Z]{2})\s*$/);
  const code = withZip?.[1] ?? trailing?.[1] ?? "";
  return code in STATE_TAX ? code : "";
}

export function ManualProofContent() {
  useReveal();

  /* ── Draft + session records ───────────────────────────────
     One draft object rather than twenty useStates: every proof footer, the
     derivation bar and the client's copy want to read the whole thing at once.
     Clients and projects live beside it because an inline "create" appends to a
     list the draft only points into. */
  const [draft, setDraft] = useState<ProofDraft>(makeSeedDraft);
  const [clients, setClients] = useState<ClientRecord[]>(() =>
    SEED_CLIENTS.map((c) => ({ ...c, tags: [...c.tags] })),
  );
  const [projects, setProjects] = useState<ProjectRecord[]>(() =>
    SEED_PROJECTS.map((p) => ({ ...p })),
  );

  const patch = useCallback((p: Partial<ProofDraft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const totals = useMemo(() => computeTotals(draft), [draft]);

  /* ── Jumping between cards ─────────────────────────────────
     `.main` is the scroll container, so scrollIntoView drives it directly.
     Each card carries scroll-margin-top so it lands below the topbar and the
     derivation bar rather than under them. */
  const cardEls = useRef(new Map<string, HTMLElement | null>());
  const register = useCallback((id: string, el: HTMLElement | null) => {
    cardEls.current.set(id, el);
  }, []);
  const jumpTo = useCallback((id: string) => {
    cardEls.current.get(id)?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /* ── Persistence chrome (UI-state only) ────────────────────*/
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [note, setNote] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    // Cleanup only — a pending "saved" must not fire into an unmounted bar.
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const runSave = useCallback((message: string) => {
    setSaveState("saving");
    setNote(null);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveState("saved");
      setNote(message);
    }, SAVE_MS);
  }, []);

  /* ── Reset: armed, then confirmed ──────────────────────────
     Destructive, so it needs a second press that looks different from the
     first. The arm disarms itself after four seconds so a stray click cannot
     leave a live trigger sitting in the bar. */
  const [resetArmed, setResetArmed] = useState(false);
  const disarm = useRef<number | null>(null);

  useEffect(() => {
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
    setSaveState("idle");
    setNote(null);
  }

  /* ── Record writes from the inline pickers ─────────────────
     Create-or-replace by id, so one handler serves both the create form and
     the edit form. */
  const saveClient = useCallback((record: ClientRecord) => {
    setClients((prev) =>
      prev.some((c) => c.id === record.id)
        ? prev.map((c) => (c.id === record.id ? record : c))
        : [record, ...prev],
    );
  }, []);

  const saveProject = useCallback((record: ProjectRecord) => {
    setProjects((prev) =>
      prev.some((p) => p.id === record.id)
        ? prev.map((p) => (p.id === record.id ? record : p))
        : [record, ...prev],
    );
  }, []);

  /* ── The address → tax link ────────────────────────────────
     The address auto-fills from the chosen client and sets the tax ESTIMATE,
     but stays freely editable — and the rate follows the address ONLY while it
     is still an estimate. Once a rate is typed by hand it is never silently
     overwritten by a later address change; the way back is a control the user
     presses (see TaxBlock). */
  const chooseClient = useCallback(
    (next: ClientChoice) => {
      setDraft((prev) => {
        const p: Partial<ProofDraft> = { client: next };
        if (next.mode === "record") {
          const record = clients.find((c) => c.id === next.id);
          const line = record ? clientAddressLine(record) : null;
          // Only OVERWRITE when the new client actually has an address. The
          // field is the JOB SITE, not the client's mailing address — blanking
          // it because the new record is thin would throw away something the
          // contractor may have typed by hand for this job.
          if (line) p.address = line;
          if (prev.taxAuto) {
            const st = knownState(line ?? "");
            p.taxState = st;
            if (st) p.taxPct = STATE_TAX[st];
          }
        }
        return { ...prev, ...p };
      });
    },
    [clients],
  );

  const setAddress = useCallback((next: string) => {
    setDraft((prev) => {
      if (!prev.taxAuto) return { ...prev, address: next };
      const st = knownState(next);
      return {
        ...prev,
        address: next,
        taxState: st,
        taxPct: st ? STATE_TAX[st] : prev.taxPct,
      };
    });
  }, []);

  /** What the current address WOULD estimate, for the snap-back control. */
  const addressEstimate = useMemo(() => {
    const st = knownState(draft.address);
    return st ? STATE_TAX[st] : null;
  }, [draft.address]);

  /* ── Card-body handlers ────────────────────────────────────*/
  const setLines = useCallback((lines: LineItem[]) => patch({ lines }), [patch]);
  const setInstallments = useCallback(
    (installments: Installment[]) => patch({ installments }),
    [patch],
  );
  const setFiles = useCallback((files: StagedFile[]) => patch({ files }), [patch]);
  const setMarkups = useCallback(
    (p: Partial<Markups>) => setDraft((prev) => ({ ...prev, markups: { ...prev.markups, ...p } })),
    [],
  );
  const setOptions = useCallback(
    (p: Partial<ProposalOptions>) =>
      setDraft((prev) => ({ ...prev, options: { ...prev.options, ...p } })),
    [],
  );

  /* ══════════════════════════════════════════════════════════
     THE FOOTER SENTENCES
     Every one of them is assembled here, from `totals`, so there is exactly
     one place on the page where a money figure is decided.
     ══════════════════════════════════════════════════════════ */

  /* 01 · BASICS — coverage.
     Narrowed into a local const FIRST. A discriminated union narrowed through a
     property access (`draft.client.mode === "record"`) loses that narrowing the
     moment it is read inside a callback — the compiler cannot prove `draft` was
     not reassigned before the callback ran. A const can never be, so the
     narrowing survives into `.find()`. */
  const choice = draft.client;
  const clientRecord =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;
  const clientNamed =
    clientRecord !== null || (choice.mode === "freeText" && choice.name.trim().length > 0);

  const basicsParts = [
    draft.title.trim().length > 0 ? "titled" : "no title",
    clientRecord
      ? "client on file"
      : choice.mode === "freeText" && choice.name.trim().length > 0
        ? "one-off name"
        : "no client",
    draft.address.trim().length > 0 ? "address set" : "no address",
    draft.description.trim().length > 0 ? "described" : "no description",
  ];
  const basicsSet = [
    draft.title.trim().length > 0,
    clientNamed,
    draft.address.trim().length > 0,
    draft.description.trim().length > 0,
  ].filter(Boolean).length;

  /* 02 · LINE ITEMS — money. */
  const unnamedCount = draft.lines.filter(isUnnamed).length;
  const materialOnlyCount = draft.lines.filter(isMaterialOnly).length;
  const pricedCount = totals.pricedLines.length - totals.pricedLines.filter(isUnnamed).length;
  const linesLead = [
    plural(draft.lines.length, "row"),
    `${pricedCount} priced`,
    unnamedCount > 0 ? `${unnamedCount} unnamed` : null,
    draft.options.laborOnly && totals.suppressedLines.length > 0
      ? `${totals.suppressedLines.length} dropped`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* 03 · ESTIMATE — money. */
  const estimateLead = "markups + overhead + profit";

  /* 04 · TAX — money. */
  const taxStateName = draft.taxState ? (STATE_NAMES[draft.taxState] ?? draft.taxState) : null;
  const taxLead = `${taxStateName ?? "Rate"} ${pct(draft.taxPct)} on ${money(totals.sellSubtotal)}`;

  /* 05 · PAYMENT — money, but a SPLIT of the total rather than an addition. */
  const covered = coveredAmount(draft.installments, totals.total);
  const cover = coverState(draft.installments, totals.total);
  const first = draft.installments[0] ?? null;
  const payLead =
    draft.installments.length === 0
      ? "no installments"
      : draft.installments
          .map((i) => (i.isPercent ? `${i.amount}%` : money(i.amount)))
          .join(" / ");
  // With nothing priced there is no total to reconcile against, and "Short by
  // $0.00" would be a complaint about a problem that does not exist yet.
  const paySlot =
    totals.total <= 0
      ? { lab: "No total yet", val: "—" }
      : cover === "exact"
        ? { lab: "Reconciles", val: money(covered) }
        : cover === "over"
          ? { lab: "Over by", val: money(covered - totals.total) }
          : { lab: "Short by", val: money(totals.total - covered) };

  /* 06 · SCOPE — coverage. */
  const scopeWords = words(draft.scopeOfWork);
  const noteWords = words(draft.notes);

  /* 07 · WHAT PRINTS — coverage, or money the moment labor-only is on.
     `potentialSuppressedBase` is what a labor-only quote WOULD drop, computed
     whether or not the toggle is on: the switch's own effect line has to be
     able to say what pressing it would cost before it is pressed. */
  const potentialSuppressedBase = useMemo(
    () =>
      draft.lines
        .filter(isMaterialOnly)
        .reduce((sum, l) => sum + l.quantity * (l.materialCost + l.laborCost), 0),
    [draft.lines],
  );
  const optionParts = [
    draft.options.hideBreakdown ? "hides material split" : "shows material split",
    `suppresses ${plural(draft.options.laborOnly ? totals.suppressedLines.length : 0, "row")}`,
    draft.options.showSignature ? "signature lines on" : "no signature lines",
    draft.options.showScope ? "scope prints" : "scope withheld",
  ];
  const optionsOn = [
    draft.options.hideBreakdown,
    draft.options.laborOnly,
    draft.options.showSignature,
    draft.options.showScope,
  ].filter(Boolean).length;

  /* 08 · TERMS — coverage. */
  const termWords = words(draft.terms);

  /* 09 · FILES — coverage. */
  const fileBytes = draft.files.reduce((sum, f) => sum + f.size, 0);

  /* ── Save / Save & send ────────────────────────────────────
     Send reports the gaps the footers already show, in the footers' own words,
     rather than inventing a second validation vocabulary. */
  function onSaveDraft() {
    runSave(
      "Nothing was written. This lab page has no data layer — Save, Save & send and the state chip are UI only.",
    );
  }

  function onSaveSend() {
    const gaps = [
      draft.title.trim().length === 0 ? "card 01 has no title" : null,
      !clientNamed ? "card 01 has no client" : null,
      totals.base === 0 ? "card 02 prices nothing" : null,
      unnamedCount > 0 ? `card 02 has ${plural(unnamedCount, "unnamed line")}` : null,
      cover !== "exact" ? "card 05 does not reconcile to the total" : null,
      termWords === 0 ? "card 08 has no terms" : null,
    ].filter((g): g is string => g !== null);

    if (gaps.length > 0) {
      setSaveState("idle");
      setNote(`Not sent — ${gaps.join("; ")}.`);
      return;
    }
    runSave(
      `Nothing was sent. The derivation is complete: ${money(totals.base)} base, ${moneyDelta(totals.uplift)} uplift, ${moneyDelta(totals.tax)} tax — ${money(totals.total)} total.`,
    );
  }

  /* ── The derivation bar's chain ────────────────────────────
     The same sentence the footers spell out, compressed to one line and kept
     permanently in frame. Every link jumps to the card that owns it, so the
     chain is the page's navigation as well as its argument. */
  const chain: { id: string; num: string; lab: string; val: string }[] = [
    { id: "pc-lines", num: "02", lab: "Base", val: money(totals.base) },
    { id: "pc-estimate", num: "03", lab: "Uplift", val: moneyDelta(totals.uplift) },
    { id: "pc-tax", num: "04", lab: "Tax", val: moneyDelta(totals.tax) },
  ];
  if (draft.options.laborOnly && totals.suppressedBase > 0) {
    // A labor-only quote takes money OUT at the top of the spine. It gets its
    // own link rather than hiding inside "Base", because a deduction the reader
    // cannot see is exactly the surprise this page exists to prevent.
    chain.unshift({
      id: "pc-options",
      num: "07",
      lab: "Dropped",
      val: moneyDelta(-totals.suppressedBase),
    });
  }

  const chipText =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft saved" : "Nothing saved";
  const chipClass =
    saveState === "saving"
      ? cx(styles.chip, styles.chipSaving)
      : saveState === "saved"
        ? cx(styles.chip, styles.chipSaved)
        : styles.chip;

  return (
    <>
      {/* ── MASTHEAD ─────────────────────────────────────────── */}
      <div className={cx("page-head", styles.head)}>
        <div>
          <div className="kicker">Manual builder · Lab</div>
          <h1 className="page-title">Proof Card</h1>
          <div className={styles.headMeta}>
            <span>Draft № {PROPOSAL_NO}</span>
            <i aria-hidden="true" />
            <span>{PROPOSAL_DATE}</span>
            <i aria-hidden="true" />
            <span className={styles.headHonest}>Design preview — nothing is saved</span>
          </div>
        </div>
      </div>

      {/* ── DERIVATION BAR ───────────────────────────────────── */}
      <div className={styles.deriv}>
        <div className={styles.derivTop}>
          <div className={styles.derivTotal}>
            <span className={styles.derivTotalLab}>Proposal total</span>
            <span className={styles.derivTotalVal}>{money(totals.total)}</span>
          </div>

          <div className={styles.derivActs}>
            <span className={chipClass} aria-live="polite">
              {chipText}
            </span>
            <button
              type="button"
              className={cx(styles.act, resetArmed && styles.actArmed)}
              onClick={onReset}
            >
              <Ic name="undo" />
              {resetArmed ? "Press again to reset" : "Reset"}
            </button>
            <button
              type="button"
              className={styles.act}
              disabled={saveState === "saving"}
              onClick={onSaveDraft}
            >
              Save
            </button>
            <button
              type="button"
              className={cx(styles.act, styles.actPrimary)}
              disabled={saveState === "saving"}
              onClick={onSaveSend}
            >
              <Ic name="send" />
              Save &amp; send
            </button>
          </div>
        </div>

        <div className={styles.derivChain}>
          <span className={styles.derivKick}>Derivation</span>
          {chain.map((link, i) => (
            <span className={styles.derivStep} key={link.id + link.lab}>
              {i > 0 && (
                <span className={styles.derivOp} aria-hidden="true">
                  +
                </span>
              )}
              <button
                type="button"
                className={styles.derivLink}
                onClick={() => jumpTo(link.id)}
                aria-label={`${link.lab} ${link.val}. Jump to card ${link.num}.`}
              >
                <span className={styles.derivNum} aria-hidden="true">
                  {link.num}
                </span>
                <span className={styles.derivLab} aria-hidden="true">
                  {link.lab}
                </span>
                <span className={styles.derivVal} aria-hidden="true">
                  {link.val}
                </span>
              </button>
            </span>
          ))}
          <span className={styles.derivOp} aria-hidden="true">
            =
          </span>
          <button
            type="button"
            className={cx(styles.derivLink, styles.derivResult)}
            onClick={() => jumpTo("proof-client")}
            aria-label={`Total ${money(totals.total)}. Jump to the client's copy.`}
          >
            <span className={styles.derivLab} aria-hidden="true">
              Total
            </span>
            <span className={styles.derivVal} aria-hidden="true">
              {money(totals.total)}
            </span>
          </button>
        </div>

        {note && (
          <div className={styles.derivNote} role="status">
            <Ic name="pin" />
            <p>{note}</p>
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

      {/* ── 01 · BASICS ──────────────────────────────────────── */}
      <ProofCard
        meta={CARDS[0]}
        register={register}
        foot={
          <CoverFoot
            lead={basicsParts.join(" · ")}
            state={`${basicsSet} of 4 set`}
            tone={draft.title.trim().length > 0 && clientNamed ? undefined : "warn"}
          />
        }
      >
        <div className={styles.stack}>
          <div className={styles.grid2}>
            <TitleField value={draft.title} onChange={(v) => patch({ title: v })} />
            <Field
              label="Project"
              optional
              as="div"
              hint="Files this proposal under a job you are already running."
            >
              <ProjectPicker
                projects={projects}
                value={draft.projectId}
                onChange={(id) => patch({ projectId: id })}
                onSaveProject={saveProject}
              />
            </Field>
          </div>

          <Field
            label="Client"
            as="div"
            hint="Pick someone on file, add a new record, or type a one-off name for a quote that is not going in the book."
          >
            <ClientPicker
              clients={clients}
              choice={draft.client}
              onChoose={chooseClient}
              onSaveClient={saveClient}
            />
          </Field>

          <Field
            label="Job address"
            optional
            as="div"
            hint={
              draft.taxAuto
                ? "Auto-filled from the client and used to estimate the tax rate in card 04. Edit it freely — the estimate follows."
                : "Auto-filled from the client. The tax rate in card 04 is set by hand, so changing this address will not move it."
            }
          >
            <AddressField
              value={draft.address}
              onChange={setAddress}
              suggestions={SEED_ADDRESSES}
            />
          </Field>

          <DescriptionField
            value={draft.description}
            onChange={(v) => patch({ description: v })}
          />
        </div>
      </ProofCard>

      {/* ── 02 · LINE ITEMS ──────────────────────────────────── */}
      <ProofCard
        meta={CARDS[1]}
        register={register}
        foot={
          <MoneyFoot
            lead={linesLead}
            delta={money(totals.base)}
            note="base cost"
            slotLab="Running"
            slotVal={money(totals.base)}
          />
        }
      >
        <LinesBlock
          lines={draft.lines}
          laborOnly={draft.options.laborOnly}
          onChange={setLines}
        />
      </ProofCard>

      {/* ── 03 · ESTIMATE BREAKDOWN ──────────────────────────── */}
      <ProofCard
        meta={CARDS[2]}
        register={register}
        aside={<MarginBadge margin={totals.margin} priced={totals.base > 0} />}
        foot={
          <MoneyFoot
            lead={estimateLead}
            delta={moneyDelta(totals.uplift)}
            note={`margin ${totals.margin.toFixed(1)}%`}
            slotLab="Running"
            slotVal={money(totals.sellSubtotal)}
          />
        }
      >
        <EstimateBlock markups={draft.markups} totals={totals} onChange={setMarkups} />
      </ProofCard>

      {/* ── 04 · SALES TAX ───────────────────────────────────── */}
      <ProofCard
        meta={CARDS[3]}
        register={register}
        foot={
          <MoneyFoot
            lead={taxLead}
            delta={moneyDelta(totals.tax)}
            note={draft.taxAuto ? "estimated rate" : "rate set by hand"}
            slotLab="Running"
            slotVal={money(totals.total)}
          />
        }
      >
        <TaxBlock
          taxPct={draft.taxPct}
          taxAuto={draft.taxAuto}
          taxState={draft.taxState}
          estimate={addressEstimate}
          onType={(v) => patch({ taxPct: v, taxAuto: false })}
          onReEstimate={() =>
            patch({
              taxAuto: true,
              taxState: knownState(draft.address),
              taxPct: addressEstimate ?? draft.taxPct,
            })
          }
        />
      </ProofCard>

      {/* ── 05 · PAYMENT SCHEDULE ────────────────────────────── */}
      <ProofCard
        meta={CARDS[4]}
        register={register}
        foot={
          <MoneyFoot
            lead={payLead}
            delta={first ? money(installmentValue(first, totals.total)) : money(0)}
            note={first ? "first installment" : "due on completion"}
            slotLab={paySlot.lab}
            slotVal={paySlot.val}
            tone={
              totals.total <= 0 ? undefined : cover === "exact" ? "ok" : cover === "over" ? "bad" : "warn"
            }
          />
        }
      >
        <PaymentBlock
          installments={draft.installments}
          total={totals.total}
          onChange={setInstallments}
        />
      </ProofCard>

      {/* ── 06 · SCOPE & NOTES ───────────────────────────────── */}
      <ProofCard
        meta={CARDS[5]}
        register={register}
        foot={
          <CoverFoot
            lead={`scope ${plural(scopeWords, "word")} · notes ${plural(noteWords, "word")}`}
            state={
              scopeWords === 0
                ? "No scope written"
                : draft.options.showScope
                  ? "Prints"
                  : "Withheld by card 07"
            }
            tone={scopeWords === 0 ? "warn" : undefined}
          />
        }
      >
        <ScopeBlock
          scopeOfWork={draft.scopeOfWork}
          notes={draft.notes}
          showScope={draft.options.showScope}
          onScope={(v) => patch({ scopeOfWork: v })}
          onNotes={(v) => patch({ notes: v })}
        />
      </ProofCard>

      {/* ── 07 · WHAT PRINTS ─────────────────────────────────── */}
      <ProofCard
        meta={CARDS[6]}
        register={register}
        foot={
          draft.options.laborOnly && totals.suppressedBase > 0 ? (
            // A labor-only quote is the one option that moves money, so its
            // card switches to the money grammar and says how much.
            <MoneyFoot
              lead={`${plural(totals.suppressedLines.length, "material-only row")} dropped`}
              delta={moneyDelta(-totals.suppressedBase)}
              note="off the base in card 02"
              slotLab="Total now"
              slotVal={money(totals.total)}
              tone="warn"
            />
          ) : (
            <CoverFoot lead={optionParts.join(" · ")} state={`${optionsOn} of 4 on`} />
          )
        }
      >
        <OptionsBlock
          options={draft.options}
          suppressedCount={materialOnlyCount}
          suppressedBase={potentialSuppressedBase}
          onChange={setOptions}
        />
      </ProofCard>

      {/* ── 08 · TERMS & CONDITIONS ──────────────────────────── */}
      <ProofCard
        meta={CARDS[7]}
        register={register}
        foot={
          <CoverFoot
            lead={
              termWords === 0
                ? "no terms — nothing prints"
                : `${plural(termWords, "word")} · prints under the schedule`
            }
            state={termWords === 0 ? "Empty" : "Set"}
            tone={termWords === 0 ? "warn" : undefined}
          />
        }
      >
        <TermsBlock
          terms={draft.terms}
          template={TERMS_TEMPLATE}
          onChange={(v) => patch({ terms: v })}
        />
      </ProofCard>

      {/* ── 09 · FILES & DOCUMENTS ───────────────────────────── */}
      <ProofCard
        meta={CARDS[8]}
        register={register}
        foot={
          <CoverFoot
            lead={
              draft.files.length === 0
                ? "nothing attached"
                : `${plural(draft.files.length, "attachment")} · ${fileSize(fileBytes)}`
            }
            state={draft.files.length === 0 ? "None" : "Staged locally"}
          />
        }
      >
        <FilesBlock files={draft.files} onChange={setFiles} />
      </ProofCard>

      {/* ── THE CLIENT'S COPY ────────────────────────────────── */}
      <ProofSheet
        draft={draft}
        totals={totals}
        clients={clients}
        register={register}
        foot={
          <TotalFoot
            chain={`${money(totals.base)} base · ${moneyDelta(totals.uplift)} uplift · ${moneyDelta(totals.tax)} tax`}
            total={money(totals.total)}
          />
        }
      />
    </>
  );
}
