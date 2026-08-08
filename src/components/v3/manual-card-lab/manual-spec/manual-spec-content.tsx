"use client";

// SPEC SHEET — page CONTENT. Manual proposal builder, single-column card lab.
// Route /dashboard/manual-spec.
//
// ═══ THE THESIS ═══════════════════════════════════════════════
// A proposal IS a technical specification, so this variant builds it like one.
// The whole column is one continuous filled-in spec sheet and each card is a
// sheet-section, numbered SH-01 to SH-09 like a drawing set. Inside every card
// there are no floating form controls: there is a strict two-track grammar of
// a fixed-width mono LABEL GUTTER and an ink VALUE TRACK, and every value in
// the document — a title, a quantity, a percent, a switch, a paragraph — sits
// on that track and is typed directly onto a rule. Repeating structures are
// spec TABLES whose index lives in the same gutter and whose mono column heads
// sit on the same grid, so ONE vertical construction line runs the length of
// the page, broken only by the card frames.
//
// The bet: dense, aligned label/value beats spaced-out form controls for
// somebody who fills this in every day. More of the estimate on screen at
// once, nothing to hunt for, and a page that reads as a completed drawing
// schedule whether or not anything has focus.
//
// ═══ WHAT THE STRUCTURE COSTS AND PAYS ════════════════════════
// - ONE COLUMN, so there is no preview pane: "what the client sees" is SH-09,
//   the last sheet, drawn in a deliberately DIFFERENT grammar (no gutter, no
//   rules, graph paper, an inverse ink bar) so the boundary between your
//   workspace and their copy is never in doubt.
// - NO MODAL LAYER, so creating a client, editing one and creating a project
//   all happen inline, in the value track where they were triggered.
// - The sheets are ORDERED like the document: who and where, the priced work,
//   the basis of the price, the words, the money, the attachments, what gets
//   issued, then the issue itself.
// - The title block is STICKY, so the total, the revision, the sheet you are
//   on and both terminal actions never leave the frame.
//
// ═══ STATE + DATA ═════════════════════════════════════════════
// Component-local, fixture-seeded, and nothing persists. No server actions, no
// Prisma, no network, and deliberately NOT the live builder's shared Zustand
// draft store. Save and Save & send are UI state and say so in the column
// rather than implying a pipeline that is not there.
//
// EVERY BLOCK RETURNED HERE IS A DIRECT CHILD OF `.content`: the reveal
// cascade in ./use-reveal.ts walks `content.children`, and the sticky title
// block has to be one of those children to pin against `.main`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReveal } from "./use-reveal";
import type {
  ClientChoice,
  ClientRecord,
  Installment,
  Markups,
  ProjectRecord,
  SaveState,
  SpecDraft,
  SpecFile,
  SpecLine,
  SpecOptions,
} from "./manual-spec-types";
import {
  DRAWING_NO,
  ISSUE_DATE,
  ORG_DEFAULT_TAX_PCT,
  REVISION,
  SEED_CLIENTS,
  SEED_PROJECTS,
  SHEETS,
  TERMS_TEMPLATE,
  clientAddressLine,
  estimateTaxFromAddress,
  makeSeedDraft,
} from "./manual-spec-data";
import {
  computeTotals,
  coveredAmount,
  money,
  moneyRound,
  newId,
  pct,
  pct1,
  reducedMotion,
  scheduleState,
} from "./manual-spec-math";
import { Affix, Row, Sheet, cx } from "./spec-frame";
import { ClientPicker, ProjectPicker } from "./spec-pickers";
import { LineTable } from "./spec-schedule";
import { EstimateLedger, EstimateRates } from "./spec-estimate";
import { PaymentTable } from "./spec-payment";
import { FileRows, OptionRows } from "./spec-issue";
import { IssuedSheet } from "./spec-issued";
import styles from "./manual-spec.module.css";

/** How long the fake save appears to take, and how long Reset stays armed. */
const SAVE_MS = 900;
const RESET_ARMED_MS = 4000;

/** Where the scroll spy considers a sheet to have "arrived" — just under the
 *  topbar plus the pinned title block. */
const PIN_OFFSET = 200;

/** Words in a block of prose, for the sheet summaries. */
function words(text: string): number {
  const t = text.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export function ManualSpecContent() {
  useReveal();

  /* ── Draft + session records ───────────────────────────────
     One draft object rather than twenty useStates: the totals, the sheet
     summaries and the issued sheet all want to read the whole thing at once.
     Clients and projects live beside it because an inline "create" appends to
     a list the draft only points into. */
  const [draft, setDraft] = useState<SpecDraft>(makeSeedDraft);
  const [clients, setClients] = useState<ClientRecord[]>(() =>
    SEED_CLIENTS.map((c) => ({ ...c, tags: [...c.tags] })),
  );
  const [projects, setProjects] = useState<ProjectRecord[]>(() =>
    SEED_PROJECTS.map((p) => ({ ...p })),
  );

  const patch = useCallback((p: Partial<SpecDraft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const totals = useMemo(() => computeTotals(draft), [draft]);
  /* How much overhead and profit add on top of a line's marked-up price.
     SH-02 needs it to back-solve a typed UNIT $ into a cost split. */
  const uplift =
    totals.estimateSubtotal > 0 ? totals.grandTotal / totals.estimateSubtotal : 1;

  /* ── Who the proposal is for ───────────────────────────────
     Narrowed into a local const FIRST. A discriminated union narrowed through
     a property access (`draft.client.mode === "record"`) loses that narrowing
     the moment it is read inside a callback — the compiler cannot prove
     `draft` was not reassigned before the callback ran. A const can never be. */
  const choice = draft.client;
  const clientRecord =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;
  const clientName =
    clientRecord?.name ?? (choice.mode === "freeText" ? choice.name.trim() : "");
  const clientLines = useMemo(() => {
    if (!clientRecord) return [];
    const contact = [clientRecord.email, clientRecord.phone]
      .filter((p) => p.trim().length > 0)
      .join(" · ");
    const addr = clientAddressLine(clientRecord);
    return [contact, addr].filter((p) => p.length > 0);
  }, [clientRecord]);

  /* ── Address + the tax estimate ────────────────────────────
     The address sets the rate ONLY while the rate is still the estimate.
     Once a rate has been typed by hand, `taxAuto` is false and no later
     address change may overwrite it — that is the contract the hint on SH-02
     states out loud. */
  const applyAddress = useCallback((address: string) => {
    setDraft((prev) => {
      if (!prev.taxAuto) return { ...prev, address };
      const hit = estimateTaxFromAddress(address);
      if (!hit) return { ...prev, address };
      return { ...prev, address, taxPct: hit.pct, taxState: hit.name };
    });
  }, []);

  /** The estimate the CURRENT address implies, whether or not it is in use. */
  const addressEstimate = useMemo(
    () => estimateTaxFromAddress(draft.address),
    [draft.address],
  );

  const chooseClient = useCallback(
    (next: ClientChoice) => {
      setDraft((prev) => {
        const record =
          next.mode === "record" ? (clients.find((c) => c.id === next.id) ?? null) : null;
        const line = record ? clientAddressLine(record) : "";
        if (!line) return { ...prev, client: next };

        // Auto-fill from the chosen client, and re-run the estimate under the
        // same rule as applyAddress.
        if (!prev.taxAuto) return { ...prev, client: next, address: line };
        const hit = estimateTaxFromAddress(line);
        return hit
          ? { ...prev, client: next, address: line, taxPct: hit.pct, taxState: hit.name }
          : { ...prev, client: next, address: line };
      });
    },
    [clients],
  );

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

  /* ── SH-02 line edits ──────────────────────────────────────*/
  const patchLine = useCallback((id: string, p: Partial<SpecLine>) => {
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
          unit: "UNIT",
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

  /* ── SH-06 installment edits ───────────────────────────────*/
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

  /* ── SH-07 files ───────────────────────────────────────────*/
  const addFiles = useCallback((next: SpecFile[]) => {
    setDraft((prev) => ({ ...prev, files: [...prev.files, ...next] }));
  }, []);
  const removeFile = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== id) }));
  }, []);

  /* ── SH-08 options ─────────────────────────────────────────*/
  const toggleOption = useCallback((key: keyof SpecOptions) => {
    setDraft((prev) => ({
      ...prev,
      options: { ...prev.options, [key]: !prev.options[key] },
    }));
  }, []);

  const setMarkups = useCallback((p: Partial<Markups>) => {
    setDraft((prev) => ({ ...prev, markups: { ...prev.markups, ...p } }));
  }, []);

  /* ── Collapse ──────────────────────────────────────────────
     Sheets open by default: a spec sheet is a document that is FILLED IN, and
     opening on nine shut drawers would be arguing the opposite. Collapse is
     there for the sheets a given job does not care about, and a shut sheet
     still prints its content summary in its head. */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const toggleSheet = useCallback((id: string) => {
    setShut((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  /* ── Which sheet am I on ───────────────────────────────────
     `.main` is the scroll container, so the spy listens there rather than on
     the window. rAF-throttled: a scroll handler that calls
     getBoundingClientRect nine times per event is a jank generator. */
  const sheetEls = useRef(new Map<string, HTMLElement | null>());
  const registerSheet = useCallback((id: string, el: HTMLElement | null) => {
    sheetEls.current.set(id, el);
  }, []);
  const [activeId, setActiveId] = useState<string>(SHEETS[0].id);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".jf-blueprint .main");
    if (!main) return;
    let frame = 0;

    // Arrow consts, not `function` declarations: a hoisted declaration is
    // type-checked against `main`'s DECLARED type, so the null guard above
    // would not narrow inside it. A closure created after the guard does.
    const measure = () => {
      frame = 0;
      const pin = main.getBoundingClientRect().top + PIN_OFFSET;
      let best = SHEETS[0].id;
      for (const sheet of SHEETS) {
        const el = sheetEls.current.get(sheet.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - pin <= 0) best = sheet.id;
      }
      setActiveId((prev) => (prev === best ? prev : best));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    main.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      main.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const jumpTo = useCallback((id: string) => {
    sheetEls.current.get(id)?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /* ── The total-changed flash ───────────────────────────────
     Driven straight at the DOM: the highlight is a one-shot on an element, not
     a fact about the proposal, and toggling a class is exactly the
     "synchronise with something outside React" job an effect is for. The
     animation is two transition durations on the two states — 90ms in, 520ms
     out — because Lightning CSS rejects @keyframes inside a module. */
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

  /* ── Save / send / reset — UI state only ───────────────────*/
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveState>("idle");
  const [turning, setTurning] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // Cleanup only — a pending timeout must not fire into an unmounted bar.
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  function runSave(send: boolean) {
    setSaving("working");
    setTurning(true);
    timers.current.push(
      window.setTimeout(() => {
        setSaving("done");
        setTurning(false);
        setNote(
          send
            ? "Nothing was sent. This lab page has no data layer — Save and Save & send are UI state only, and SH-09 is a render of what would go out."
            : "Nothing was written. This lab page has no data layer — Save and Save & send are UI state only.",
        );
      }, SAVE_MS),
    );
  }

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
    setSaving("idle");
    setNote(null);
  }

  /* ── Sheet summaries ───────────────────────────────────────
     PRINCIPLE: a collapsed sheet's line must summarise its CONTENT, never
     repeat its name. These are the same strings whether the sheet is open or
     shut, so a reader learns to read them as the sheet's state. */
  const namedLines = draft.lines.filter((l) => l.name.trim().length > 0).length;
  const issuedLines = draft.lines.filter(
    (l, i) => l.name.trim().length > 0 || totals.perLine[i].amount > 0,
  ).length;
  const covered = coveredAmount(draft.installments, totals.total);
  const coveredPct = totals.total > 0 ? Math.round((covered / totals.total) * 100) : 0;
  // The summary and SH-06's own meter read the SAME helper, so a collapsed
  // sheet can never claim the schedule balances while the meter says it does
  // not.
  const paySummary =
    scheduleState(draft.installments, totals.total) === "exact"
      ? "reconciles"
      : `${coveredPct}% covered`;
  const optionsOn = [
    draft.options.hideBreakdownCosts && "Lean",
    draft.options.laborOnly && "Labor only",
    draft.options.showSignatureLines && "Signatures",
    draft.options.showScopeOfWork && "Scope",
  ].filter(Boolean) as string[];

  const shortAddress = draft.address.trim()
    ? draft.address.split(",").slice(-2).join(",").trim()
    : "No address";

  const summaries: Record<string, string> = {
    "sh-ident": `${clientName || "No client"} · ${shortAddress}`,
    "sh-work": `${namedLines} of ${draft.lines.length} named · ${money(totals.grandTotal)}`,
    "sh-basis": `${pct1(draft.markups.materialMarkupPct)} / ${pct1(
      draft.markups.laborMarkupPct,
    )} · margin ${pct1(totals.margin)}`,
    "sh-scope": `Scope ${words(draft.scopeOfWork)} w · notes ${words(draft.notes)} w`,
    "sh-terms": draft.terms.trim() ? `${words(draft.terms)} words` : "Not written",
    "sh-pay": `${draft.installments.length} draws · ${paySummary}`,
    "sh-files": draft.files.length === 0 ? "No file chosen" : `${draft.files.length} attached`,
    "sh-issue": optionsOn.length > 0 ? optionsOn.join(" · ") : "All four off",
    "sh-issued": `${issuedLines} lines · ${money(totals.total)}`,
  };

  const activeIndex = Math.max(
    0,
    SHEETS.findIndex((s) => s.id === activeId),
  );

  return (
    <>
      {/* ══ MASTHEAD ═════════════════════════════════════════ */}
      <div className={cx("page-head", styles.head)}>
        <div>
          <div className="kicker">Manual builder · Card lab</div>
          <h1 className="page-title">Spec Sheet</h1>
          <div className={styles.headMeta}>
            <span>Drawing № {DRAWING_NO}</span>
            <i aria-hidden="true" />
            <span>Rev {REVISION}</span>
            <i aria-hidden="true" />
            <span>Issued {ISSUE_DATE}</span>
            <i aria-hidden="true" />
            <span className={styles.headWarn}>Design preview — nothing is saved</span>
          </div>
        </div>
      </div>

      {/* ══ TITLE BLOCK — pinned ═════════════════════════════ */}
      <div className={styles.tb}>
        <div className={styles.tbTop}>
          <div className={styles.tbCell}>
            <span className={styles.tbLab}>Proposal</span>
            <span className={styles.tbVal}>{draft.title.trim() || "Untitled proposal"}</span>
            <span className={styles.tbSub}>
              {clientName || "No client"} · {DRAWING_NO}
            </span>
          </div>

          <div className={styles.tbCell}>
            <span className={styles.tbLab}>Sheet</span>
            <span className={styles.tbVal}>
              {String(activeIndex + 1).padStart(2, "0")} / {SHEETS.length}
            </span>
            <span className={styles.tbSub}>Rev {REVISION}</span>
          </div>

          <div className={styles.tbCell}>
            <span className={styles.tbLab}>Proposal total</span>
            <span className={styles.tbNum} ref={totalRef}>
              {moneyRound(totals.total)}
            </span>
            <span className={styles.tbSub}>
              Sub {money(totals.grandTotal)} · tax {pct(draft.taxPct)}
            </span>
          </div>

          <div className={cx(styles.tbCell, styles.tbActs)}>
            <button
              type="button"
              className={cx(
                styles.act,
                resetArmed ? styles.actArmed : styles.actIcon,
              )}
              title="Reset this draft to the seeded fixture"
              onClick={onReset}
            >
              <svg className="ic" aria-hidden="true">
                <use href="#i-undo" />
              </svg>
              <span className={resetArmed ? undefined : styles.sr}>
                {resetArmed ? "Again" : "Reset the draft"}
              </span>
            </button>
            <button
              type="button"
              className={styles.act}
              onClick={() => runSave(false)}
              disabled={saving === "working"}
            >
              Save
            </button>
            <button
              type="button"
              className={cx(styles.act, styles.actPrimary)}
              onClick={() => runSave(true)}
              disabled={saving === "working"}
            >
              {saving === "working" ? (
                <span className={cx(styles.spin, turning && styles.isTurning)} aria-hidden="true" />
              ) : (
                <svg className="ic" aria-hidden="true">
                  <use href="#i-send" />
                </svg>
              )}
              {saving === "working" ? "Saving" : "Save & send"}
            </button>
          </div>
        </div>

        {/* The sheet index: the column's ordering device AND its navigation. */}
        <nav className={styles.idx} aria-label="Sheet index">
          {SHEETS.map((sheet, i) => (
            <button
              key={sheet.id}
              type="button"
              className={cx(styles.idxBtn, sheet.id === activeId && styles.isHere)}
              aria-current={sheet.id === activeId ? "true" : undefined}
              onClick={() => jumpTo(sheet.id)}
            >
              <span className={styles.sr}>{`Go to sheet ${sheet.no}, ${sheet.title}`}</span>
              <span className={styles.idxNo} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={styles.idxLab} aria-hidden="true">
                {sheet.code}
              </span>
            </button>
          ))}
        </nav>

        {note && (
          <div className={styles.note} role="status">
            <svg className="ic" aria-hidden="true">
              <use href="#i-pin" />
            </svg>
            <p className={styles.noteTxt}>{note}</p>
            <button
              type="button"
              className={styles.noteX}
              aria-label="Dismiss this message"
              onClick={() => setNote(null)}
            >
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ══ SH-01 · IDENTIFICATION ═══════════════════════════ */}
      <Sheet
        meta={SHEETS[0]}
        summary={summaries["sh-ident"]}
        open={!shut["sh-ident"]}
        onToggle={() => toggleSheet("sh-ident")}
        register={registerSheet}
      >
        <Row
          label="Proposal title"
          htmlFor="spec-title"
          hint="Heads the client's copy and names this proposal in your list."
        >
          <input
            id="spec-title"
            className={cx(styles.in, styles.inLead)}
            value={draft.title}
            placeholder="Patel Residence — Roof Replacement"
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Row>

        <Row
          label="Project"
          sub="· optional"
          hint="Files this proposal under a job you are already running."
        >
          <ProjectPicker
            projects={projects}
            value={draft.projectId}
            onChange={(id) => patch({ projectId: id })}
            onSaveProject={saveProject}
          />
        </Row>

        <Row
          label="Client"
          hint="Pick someone on file, add a record inline, or type a plain-text name for a quote that is not going in the book."
        >
          <ClientPicker
            clients={clients}
            choice={draft.client}
            onChoose={chooseClient}
            onSaveClient={saveClient}
          />
        </Row>

        <Row
          label="Job address"
          sub="· optional"
          htmlFor="spec-address"
          hint="Auto-filled from the client and used to estimate the tax rate on SH-02. Freely editable — typing here never locks anything."
        >
          <input
            id="spec-address"
            className={styles.in}
            value={draft.address}
            placeholder="4218 Bluewood Trl, Frisco, TX 75034"
            onChange={(e) => applyAddress(e.target.value)}
          />
          <div className={styles.underValue}>
            {addressEstimate ? (
              <span className={cx(styles.tag, styles.isBp)}>
                Resolves to {addressEstimate.name} · {pct(addressEstimate.pct)}
              </span>
            ) : (
              <span className={styles.tag}>No state resolved · rate unchanged</span>
            )}
            {clientRecord && clientAddressLine(clientRecord) && (
              <button
                type="button"
                className={cx(styles.link, styles.isQuiet)}
                onClick={() => applyAddress(clientAddressLine(clientRecord))}
              >
                <svg className="ic" aria-hidden="true">
                  <use href="#i-search" />
                </svg>
                Find — use the address on the client record
              </button>
            )}
          </div>
        </Row>

        <Row label="Description" htmlFor="spec-desc">
          <textarea
            id="spec-desc"
            className={styles.ta}
            rows={3}
            value={draft.description}
            placeholder="One-paragraph overview your client will see first."
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Row>
      </Sheet>

      {/* ══ SH-02 · SCHEDULE OF WORK ═════════════════════════ */}
      <Sheet
        meta={SHEETS[1]}
        summary={summaries["sh-work"]}
        open={!shut["sh-work"]}
        onToggle={() => toggleSheet("sh-work")}
        register={registerSheet}
      >
        <LineTable
          lines={draft.lines}
          perLine={totals.perLine}
          markups={draft.markups}
          options={draft.options}
          uplift={uplift}
          onPatch={patchLine}
          onRemove={removeLine}
          onAdd={addLine}
          scheduleTotal={totals.grandTotal}
        />

        <Row
          label="Tax rate"
          htmlFor="spec-tax"
          hint="Type 7.5 for 7.5%. The job address sets the estimate; once you type a rate by hand it is never overwritten by a later address change."
          echo={`Adds ${money(totals.tax)} on top of ${money(totals.grandTotal)}`}
        >
          <Affix post="%">
            <input
              id="spec-tax"
              className={cx(styles.in, styles.isNum)}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={draft.taxPct}
              onChange={(e) =>
                patch({ taxPct: Number(e.target.value), taxAuto: false, taxState: null })
              }
            />
          </Affix>
          <div className={styles.underValue}>
            {draft.taxAuto && draft.taxState ? (
              <span className={cx(styles.tag, styles.isBp)}>
                Estimated from {draft.taxState} · {pct(draft.taxPct)}
              </span>
            ) : (
              <span className={cx(styles.tag, styles.isWarn)}>Set by hand · held</span>
            )}
            {!draft.taxAuto && (
              <button
                type="button"
                className={cx(styles.link, styles.isQuiet)}
                onClick={() =>
                  patch({
                    taxPct: addressEstimate?.pct ?? ORG_DEFAULT_TAX_PCT,
                    taxAuto: true,
                    taxState: addressEstimate?.name ?? null,
                  })
                }
              >
                Go back to the {addressEstimate?.name ?? "company"} estimate
              </button>
            )}
          </div>
        </Row>
      </Sheet>

      {/* ══ SH-03 · ESTIMATE BASIS ═══════════════════════════ */}
      <Sheet
        meta={SHEETS[2]}
        summary={summaries["sh-basis"]}
        open={!shut["sh-basis"]}
        onToggle={() => toggleSheet("sh-basis")}
        register={registerSheet}
      >
        <EstimateRates markups={draft.markups} totals={totals} onChange={setMarkups} />
        <EstimateLedger
          markups={draft.markups}
          totals={totals}
          laborOnly={draft.options.laborOnly}
          onSaveDefaults={() =>
            setNote(
              "Saved as company defaults — in a real build. This lab page has no data layer, so future proposals would start with these markups only once one is wired up.",
            )
          }
        />
      </Sheet>

      {/* ══ SH-04 · SCOPE & NOTES ════════════════════════════ */}
      <Sheet
        meta={SHEETS[3]}
        summary={summaries["sh-scope"]}
        open={!shut["sh-scope"]}
        onToggle={() => toggleSheet("sh-scope")}
        register={registerSheet}
      >
        <Row
          label="Scope of work"
          htmlFor="spec-scope"
          hint="Printed on the client's copy while SH-08 says to show it."
        >
          <textarea
            id="spec-scope"
            className={styles.ta}
            rows={5}
            value={draft.scopeOfWork}
            placeholder="Remove existing shingles, install underlayment…"
            onChange={(e) => patch({ scopeOfWork: e.target.value })}
          />
        </Row>
        <Row label="Notes" htmlFor="spec-notes">
          <textarea
            id="spec-notes"
            className={styles.ta}
            rows={4}
            value={draft.notes}
            placeholder="Warranty, assumptions, exclusions…"
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </Row>
      </Sheet>

      {/* ══ SH-05 · TERMS & CONDITIONS ═══════════════════════ */}
      <Sheet
        meta={SHEETS[4]}
        summary={summaries["sh-terms"]}
        open={!shut["sh-terms"]}
        onToggle={() => toggleSheet("sh-terms")}
        register={registerSheet}
      >
        <Row label="Terms" htmlFor="spec-terms">
          <textarea
            id="spec-terms"
            className={styles.ta}
            rows={6}
            value={draft.terms}
            placeholder="Payment terms, change-order policy, warranty, dispute resolution…"
            onChange={(e) => patch({ terms: e.target.value })}
          />
          <div className={styles.underValue}>
            {draft.terms.trim().length === 0 ? (
              <button
                type="button"
                className={styles.link}
                onClick={() => patch({ terms: TERMS_TEMPLATE })}
              >
                <svg className="ic" aria-hidden="true">
                  <use href="#i-file" />
                </svg>
                Insert starter template
              </button>
            ) : (
              <button
                type="button"
                className={cx(styles.link, styles.isQuiet)}
                onClick={() => patch({ terms: TERMS_TEMPLATE })}
              >
                Replace with the starter template
              </button>
            )}
          </div>
        </Row>
      </Sheet>

      {/* ══ SH-06 · PAYMENT SCHEDULE ═════════════════════════ */}
      <Sheet
        meta={SHEETS[5]}
        summary={summaries["sh-pay"]}
        open={!shut["sh-pay"]}
        onToggle={() => toggleSheet("sh-pay")}
        register={registerSheet}
      >
        <PaymentTable
          installments={draft.installments}
          total={totals.total}
          onPatch={patchInstallment}
          onRemove={removeInstallment}
          onAdd={addInstallment}
        />
      </Sheet>

      {/* ══ SH-07 · ATTACHMENTS ══════════════════════════════ */}
      <Sheet
        meta={SHEETS[6]}
        summary={summaries["sh-files"]}
        open={!shut["sh-files"]}
        onToggle={() => toggleSheet("sh-files")}
        register={registerSheet}
      >
        <FileRows files={draft.files} onAdd={addFiles} onRemove={removeFile} />
      </Sheet>

      {/* ══ SH-08 · ISSUE OPTIONS ════════════════════════════ */}
      <Sheet
        meta={SHEETS[7]}
        summary={summaries["sh-issue"]}
        open={!shut["sh-issue"]}
        onToggle={() => toggleSheet("sh-issue")}
        register={registerSheet}
      >
        <OptionRows
          options={draft.options}
          issuedLines={issuedLines}
          issuedSubtotal={totals.grandTotal}
          scopeWords={words(draft.scopeOfWork)}
          onToggle={toggleOption}
        />
        <Row label="Issue" sub="· what goes out">
          <button type="button" className={styles.addBtn} onClick={() => jumpTo("sh-issued")}>
            <svg className="ic" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
            Read SH-09 — what the client sees
          </button>
        </Row>
      </Sheet>

      {/* ══ SH-09 · ISSUED SHEET ═════════════════════════════
          The client's copy. Rendered inside the sheet frame but in a
          deliberately different grammar — see spec-issued.tsx. */}
      <Sheet
        meta={SHEETS[8]}
        summary={summaries["sh-issued"]}
        open={!shut["sh-issued"]}
        onToggle={() => toggleSheet("sh-issued")}
        register={registerSheet}
      >
        <IssuedSheet
          draft={draft}
          totals={totals}
          clientName={clientName}
          clientLines={clientLines}
        />
      </Sheet>
    </>
  );
}
