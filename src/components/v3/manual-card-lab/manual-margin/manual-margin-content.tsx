"use client";

// PRICE FIRST — page CONTENT. Manual proposal builder, single-column card lab.
// (route: /dashboard/manual-margin)
//
// THE THESIS
// Contractors do not build a scope and discover a price. They know the number
// they need to hit — a budget the homeowner said out loud, an insurance
// scope, the job they lost last month by nine hundred dollars — and they
// reconcile the work against it. So this page is INVERTED. Card 01 is the
// price: a target you type, the live contract total under it, the gap between
// them, the four markup controls, the tax rate, the estimate ledger, and a bar
// showing the five things the total is made of. Everything below is an INPUT
// THAT FEEDS THE NUMBER, and every card head states its price effect — a
// contribution percentage when it moves money, the words "no price effect"
// when it does not. As card 01 scrolls away a reduced form of the
// reconciliation pins under the topbar and follows you down, so the gap
// between what the job costs and what it must sell for is never off screen.
//
// WHAT THAT BUYS
// - Ordering that matches how a quote is actually decided (money, then the
//   work, then the paperwork), instead of the order a database would store it.
// - A reason for every card to be where it is: its distance from card 01 is
//   its distance from the number.
// - One honest solve. Set a target and the page works out the exact profit
//   percentage that reaches it and offers to apply it. It computes on every
//   render and changes nothing until it is pressed.
//
// WHY ONE COLUMN CHANGES THE DESIGN
// - No preview pane, so the client's copy is card 09, at the foot, behind a
//   hard boundary — it is the reading, not a control.
// - No modal layer, so creating a client, editing one and creating a project
//   all happen inline, in the column, where they were triggered.
//
// EVERY BLOCK RETURNED HERE IS A DIRECT CHILD OF `.content`: the reveal
// cascade in ./use-reveal.ts walks `content.children`, and the sticky strip
// has to be one of those children to pin against `.main`.
//
// STATE + DATA
// Component-local, fixture-seeded, and nothing persists. No server actions, no
// Prisma, no network, and deliberately not the live builder's shared Zustand
// draft store. Save and Save & send are UI state and write nothing; the page
// says so on its masthead and again in the flash note.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReveal } from "./use-reveal";
import type {
  ClientRecord,
  Installment,
  Line,
  MarginDraft,
  Markups,
  ProjectRecord,
  ProposalOptions,
} from "./manual-margin-types";
import {
  LOAD_MAX,
  MARKUP_MAX,
  clamp,
  composition,
  computeTotals,
  coverageState,
  money,
  money0,
  newId,
  reconcile,
  reducedMotion,
  round2,
  safe,
  share,
  solveProfit,
  solveUnitPrice,
} from "./manual-margin-math";
import {
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_CLIENTS,
  SEED_PROJECTS,
  STATE_TAX,
  makeSeedDraft,
} from "./manual-margin-data";
import { Card, Ic, cx } from "./margin-card";
import { PriceCard } from "./margin-price";
import { LinesBody, linesSummary } from "./margin-lines";
import { BasicsBody, basicsSummary, type ClientFields } from "./margin-basics";
import {
  FilesBody,
  OptionsBody,
  PaymentsBody,
  ScopeBody,
  TermsBody,
  blankInstallment,
  filesSummary,
  optionsSummary,
  paymentsSummary,
  scopeSummary,
  termsSummary,
} from "./margin-detail";
import { PreviewCard } from "./margin-preview";
import styles from "./manual-margin.module.css";

/** How long a flash note stays before it clears itself. Long enough to read a
 *  sentence, short enough not to become furniture. */
const FLASH_MS = 4200;
/** The fake save's "write" duration. Motion System UI band. */
const SAVE_MS = 900;
/** How long the destructive reset stays armed before it disarms itself. */
const RESET_ARMED_MS = 4000;
/** How long the sticky strip's total holds its changed highlight. */
const FLASH_TOTAL_MS = 420;

/** File type from a name, for the staged-file chips. The browser gives a MIME
 *  type for most files and nothing at all for some, so the extension is the
 *  fallback rather than an empty cell. */
function fileKind(name: string, type: string): string {
  if (type) return type;
  const dot = name.lastIndexOf(".");
  return dot > -1 ? `${name.slice(dot + 1).toLowerCase()} file` : "file";
}

export function ManualMarginContent() {
  useReveal();

  const [draft, setDraft] = useState<MarginDraft>(makeSeedDraft);
  const [clients, setClients] = useState<ClientRecord[]>(() => SEED_CLIENTS.map((c) => ({ ...c })));
  const [projects, setProjects] = useState<ProjectRecord[]>(() =>
    SEED_PROJECTS.map((p) => ({ ...p })),
  );

  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving">("idle");
  const [armed, setArmed] = useState(false);
  const [pinned, setPinned] = useState(false);

  /* ── Derived money. One computation, read by everything. ─────────── */
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const comp = useMemo(() => composition(totals), [totals]);
  const recon = useMemo(
    () => reconcile(draft.targetTotal, totals.contractTotal),
    [draft.targetTotal, totals.contractTotal],
  );
  const solve = useMemo(
    () => solveProfit(draft.targetTotal, totals, draft.taxPct),
    [draft.targetTotal, totals, draft.taxPct],
  );

  /**
   * What the material side of the sheet is worth in the contract total — the
   * exact dollars the labor-only switch removes or puts back. Computed by
   * running the same pure totals twice rather than by a second formula, so it
   * can never drift from the number it is describing.
   */
  const materialWeight = useMemo(() => {
    const withMaterial = computeTotals({
      ...draft,
      options: { ...draft.options, laborOnly: false },
    });
    const withoutMaterial = computeTotals({
      ...draft,
      options: { ...draft.options, laborOnly: true },
    });
    return round2(withMaterial.contractTotal - withoutMaterial.contractTotal);
  }, [draft]);

  const coverage = coverageState(draft.installments, totals.contractTotal);

  /**
   * The sticky strip's changed-total highlight.
   *
   * Driven straight onto the DOM node rather than through React state, for two
   * reasons. It is a purely visual acknowledgement — nothing else in the tree
   * needs to know the number just moved — and a `setState` in an effect body
   * schedules a second render on every keystroke of every number field on the
   * page, which is a real cost for a highlight. The class is the CSS module's
   * own hashed name, so this stays inside the stylesheet's vocabulary.
   */
  const stripNum = useRef<HTMLSpanElement>(null);
  const lastTotal = useRef(totals.contractTotal);
  useEffect(() => {
    if (lastTotal.current === totals.contractTotal) return;
    lastTotal.current = totals.contractTotal;
    const el = stripNum.current;
    if (!el || reducedMotion()) return;
    el.classList.add(styles.isFlash);
    const t = window.setTimeout(() => el.classList.remove(styles.isFlash), FLASH_TOTAL_MS);
    return () => window.clearTimeout(t);
  }, [totals.contractTotal]);

  /* ── Flash notes clear themselves. ───────────────────────────────── */
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);

  /* ── The armed reset disarms itself. ─────────────────────────────── */
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), RESET_ARMED_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  /**
   * Pinned state for the sticky strip, from a 1px sentinel above it.
   *
   * An IntersectionObserver rather than a scroll handler: the shadow is
   * cosmetic and does not deserve work on every frame. `.main` is the scroll
   * container (the shell sets `body { overflow: hidden }`), and the strip pins
   * at `top: var(--topbar-h)`, so the sentinel counts as gone once it is
   * within 62px of the root's top edge.
   */
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const root = el.closest<HTMLElement>(".main");
    const io = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { root: root ?? null, rootMargin: "-62px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Draft patching ──────────────────────────────────────────────── */
  const patch = useCallback((p: Partial<MarginDraft>) => setDraft((d) => ({ ...d, ...p })), []);

  const onMarkup = useCallback((p: Partial<Markups>) => {
    setDraft((d) => {
      const next = { ...d.markups, ...p };
      return {
        ...d,
        markups: {
          materialMarkupPct: clamp(safe(next.materialMarkupPct), 0, MARKUP_MAX),
          laborMarkupPct: clamp(safe(next.laborMarkupPct), 0, MARKUP_MAX),
          overheadPct: clamp(safe(next.overheadPct), 0, LOAD_MAX),
          profitPct: clamp(safe(next.profitPct), 0, LOAD_MAX),
        },
      };
    });
  }, []);

  const onApplySolve = useCallback(
    (profitPct: number) => {
      onMarkup({ profitPct: round2(profitPct) });
      setFlash({
        text: `Profit set to ${round2(profitPct).toFixed(1)}%. Nothing else on the sheet moved — the line items, the markups and the tax rate are exactly where you left them.`,
        good: true,
      });
    },
    [onMarkup],
  );

  // Typing a rate by hand is a decision, and it is remembered: `taxAuto` goes
  // false and no later address change ever overwrites the number again.
  const onTax = useCallback((n: number) => {
    setDraft((d) => ({ ...d, taxPct: clamp(safe(n), 0, 25), taxAuto: false }));
  }, []);

  const onRestoreTaxEstimate = useCallback(() => {
    setDraft((d) => {
      if (!d.taxState) return d;
      return { ...d, taxPct: STATE_TAX[d.taxState] ?? d.taxPct, taxAuto: true };
    });
  }, []);

  const onAddressFound = useCallback((label: string, state: string) => {
    setDraft((d) => ({
      ...d,
      address: label,
      taxState: state,
      taxPct: d.taxAuto ? STATE_TAX[state] ?? d.taxPct : d.taxPct,
    }));
  }, []);

  /* ── Client ──────────────────────────────────────────────────────── */
  const onPickClient = useCallback((c: ClientRecord) => {
    setDraft((d) => {
      // A thin record (name only) must not blank an address the contractor
      // already typed. Picking a client fills what it can and leaves the rest.
      const composed = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
        .filter((s) => s && s.trim().length > 0)
        .join(", ");
      return {
        ...d,
        client: { mode: "record", id: c.id },
        address: composed || d.address,
        taxState: c.state || d.taxState,
        taxPct: d.taxAuto && c.state ? STATE_TAX[c.state] ?? d.taxPct : d.taxPct,
      };
    });
  }, []);

  const onCreateClient = useCallback(
    (fields: ClientFields) => {
      const made: ClientRecord = { id: newId("cl"), ...fields };
      setClients((prev) => [...prev, made]);
      onPickClient(made);
    },
    [onPickClient],
  );

  const onEditClient = useCallback((id: string, fields: ClientFields) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)));
    // The edit may have changed the state, which the tax estimate is derived
    // from. The address is deliberately NOT rewritten: the contractor may have
    // typed a job address that is not the client's mailing address, and that
    // is the whole reason the field is separate.
    setDraft((d) => {
      if (d.client.mode !== "record" || d.client.id !== id || !fields.state) return d;
      return {
        ...d,
        taxState: fields.state,
        taxPct: d.taxAuto ? STATE_TAX[fields.state] ?? d.taxPct : d.taxPct,
      };
    });
  }, []);

  /* ── Project ─────────────────────────────────────────────────────── */
  const onCreateProject = useCallback((name: string, description: string) => {
    const made: ProjectRecord = { id: newId("pj"), name, description };
    setProjects((prev) => [...prev, made]);
    setDraft((d) => ({ ...d, projectId: made.id }));
  }, []);

  /* ── Lines ───────────────────────────────────────────────────────── */
  const onPatchLine = useCallback((id: string, p: Partial<Line>) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)),
    }));
  }, []);

  // Typing a unit price BACK-SOLVES the cost split rather than storing a
  // second, disagreeing price. See solveUnitPrice() for the ratio rule.
  const onUnitPrice = useCallback((id: string, price: number) => {
    setDraft((d) => {
      const line = d.lines.find((l) => l.id === id);
      if (!line) return d;
      const solved = solveUnitPrice(line, d, price);
      return { ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...solved } : l)) };
    });
  }, []);

  const onAddLine = useCallback(() => {
    const line: Line = {
      id: newId("ln"),
      name: "",
      description: "",
      unit: "SQFT",
      quantity: 1,
      materialCost: 0,
      laborCost: 0,
    };
    setDraft((d) => ({ ...d, lines: [...d.lines, line] }));
    // A brand-new row has nothing on its face worth reading, so it opens with
    // its cost breakdown already showing — that is where the work starts.
    setOpenRows((o) => ({ ...o, [line.id]: true }));
  }, []);

  const onRemoveLine = useCallback((id: string) => {
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  }, []);

  /* ── Payments ────────────────────────────────────────────────────── */
  const onPatchInstallment = useCallback((id: string, p: Partial<Installment>) => {
    setDraft((d) => ({
      ...d,
      installments: d.installments.map((i) => (i.id === id ? { ...i, ...p } : i)),
    }));
  }, []);

  const onAddInstallment = useCallback(() => {
    setDraft((d) => ({ ...d, installments: [...d.installments, blankInstallment()] }));
  }, []);

  const onRemoveInstallment = useCallback((id: string) => {
    setDraft((d) => ({ ...d, installments: d.installments.filter((i) => i.id !== id) }));
  }, []);

  // Puts the whole gap on the LAST installment. That is what a contractor does
  // on paper, and it leaves the deposit — the number the client argues about —
  // exactly where it was put.
  const onBalance = useCallback(() => {
    setDraft((d) => {
      if (d.installments.length === 0) return d;
      const t = computeTotals(d).contractTotal;
      // Same tolerance the meter draws with, so pressing the button can never
      // "fix" something the meter already calls settled.
      const { gap, state } = coverageState(d.installments, t);
      if (state === "exact") return d;
      const last = d.installments[d.installments.length - 1];
      const amount = last.isPercent
        ? t > 0
          ? round2(safe(last.amount) + (gap / t) * 100)
          : safe(last.amount)
        : round2(safe(last.amount) + gap);
      return {
        ...d,
        installments: d.installments.map((i, idx) =>
          idx === d.installments.length - 1 ? { ...i, amount: Math.max(0, amount) } : i,
        ),
      };
    });
  }, []);

  /* ── Files ───────────────────────────────────────────────────────── */
  const onAddFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    // Names, sizes and types only. Nothing is read and nothing is uploaded.
    const added = Array.from(list).map((f) => ({
      id: newId("fl"),
      name: f.name,
      size: f.size,
      kind: fileKind(f.name, f.type),
    }));
    setDraft((d) => ({ ...d, files: [...d.files, ...added] }));
  }, []);

  const onRemoveFile = useCallback((id: string) => {
    setDraft((d) => ({ ...d, files: d.files.filter((f) => f.id !== id) }));
  }, []);

  /* ── Chrome actions. All UI state; none of them write anything. ──── */
  const onSave = useCallback(
    (send: boolean) => {
      setSaving("saving");
      window.setTimeout(() => {
        setSaving("idle");
        setFlash({
          text: send
            ? "Nothing was sent. This route is a design preview with no data layer — no proposal was created and no email left the building."
            : "Nothing was saved. This route is a design preview with no data layer; refresh and the seeded draft comes back exactly as it was.",
          good: false,
        });
      }, SAVE_MS);
    },
    [],
  );

  const onReset = useCallback(() => {
    setDraft(makeSeedDraft());
    setClients(SEED_CLIENTS.map((c) => ({ ...c })));
    setProjects(SEED_PROJECTS.map((p) => ({ ...p })));
    setOpenRows({});
    setArmed(false);
    setFlash({ text: "Back to the seeded draft.", good: true });
  }, []);

  const toggleShut = useCallback((id: string) => {
    setShut((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const toggleRow = useCallback((id: string) => {
    setOpenRows((o) => ({ ...o, [id]: !o[id] }));
  }, []);

  const onToggleOption = useCallback((p: Partial<ProposalOptions>) => {
    setDraft((d) => ({ ...d, options: { ...d.options, ...p } }));
  }, []);

  /* ── The card heads' price-effect tags ───────────────────────────── */
  const costShare = share(comp.cost, totals.contractTotal);
  // Rounded ONCE, from the summed dollars, rather than as the sum of four
  // rounded percentages — four roundings can land the closing identity on
  // 100.1% and make a decomposition that is exact by construction look wrong.
  const addedShare = share(
    round2(comp.markup + comp.overhead + comp.profit + comp.tax),
    totals.contractTotal,
  );
  const coverShare = share(coverage.covered, totals.contractTotal);

  return (
    <>
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <div className={cx("page-head", styles.col)}>
        <div>
          <div className="kicker">Manual proposal · card lab</div>
          <h1 className="page-title">Price first</h1>
          <p className={styles.headMeta}>
            <span>Drawing {PROPOSAL_NO}</span>
            <i aria-hidden="true" />
            <span>{PROPOSAL_DATE}</span>
            <i aria-hidden="true" />
            <em>Design preview — nothing is saved</em>
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className={cx(styles.act, armed && styles.actArmed)}
            onClick={() => (armed ? onReset() : setArmed(true))}
          >
            <Ic id="i-undo" />
            {armed ? "Press again to reset" : "Reset draft"}
          </button>
          <button
            type="button"
            className={styles.act}
            disabled={saving === "saving"}
            onClick={() => onSave(false)}
          >
            <Ic id="i-check" />
            {saving === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={cx(styles.act, styles.actPrimary)}
            disabled={saving === "saving"}
            onClick={() => onSave(true)}
          >
            <Ic id="i-send" />
            Save &amp; send
          </button>
        </div>
      </div>

      {/* ── 01 · THE PRICE ─────────────────────────────────────────── */}
      <PriceCard
        draft={draft}
        totals={totals}
        comp={comp}
        recon={recon}
        solve={solve}
        onTarget={(n) => patch({ targetTotal: n })}
        onMarkup={onMarkup}
        onTax={onTax}
        onRestoreTaxEstimate={onRestoreTaxEstimate}
        onApplySolve={onApplySolve}
        onSaveDefaults={() =>
          setFlash({
            text: "Saved as company defaults — in a real build. This page has no data layer, so the numbers stay in this tab.",
            good: false,
          })
        }
      />

      {/* The 1px probe that tells the strip whether it is floating. It is a
          direct child of `.content` like everything else, so the reveal
          cascade counts it — a 1px block with a -1px bottom margin costs
          nothing and keeps the strip's own slot in the cascade honest. */}
      <div className={cx(styles.sentinel, styles.col)} ref={sentinel} aria-hidden="true" />

      {/* ── The reduced instrument, carried down the page ──────────── */}
      <div className={cx(styles.strip, styles.col, pinned && styles.isPinned)}>
        <span className={styles.stripBlock}>
          <span className={styles.stripLab}>Contract total</span>
          <span className={styles.stripNum} ref={stripNum}>
            {money(totals.contractTotal)}
          </span>
        </span>

        <span className={styles.stripDiv} aria-hidden="true" />

        <span className={styles.stripBlock}>
          <span className={styles.stripLab}>Target</span>
          <span className={styles.stripSmall}>
            {draft.targetTotal === null ? "none set" : money(draft.targetTotal)}
          </span>
        </span>

        <span
          className={cx(
            styles.stripChip,
            recon.kind === "short" && styles.isShort,
            recon.kind === "over" && styles.isOver,
            recon.kind === "onTarget" && styles.isOn,
          )}
        >
          {recon.kind === "none"
            ? "No target set"
            : recon.kind === "onTarget"
              ? "On target"
              : `${recon.kind === "short" ? "Short" : "Over"} ${money(recon.gap)}`}
        </span>

        <span className={styles.stripChip}>Margin {totals.margin.toFixed(1)}%</span>

        <span className={styles.stripActs}>
          <a className={cx(styles.act, styles.actSm)} href="#mc-price">
            <Ic id="i-arrow" />
            To the price
          </a>
        </span>

        {flash && (
          <div className={cx(styles.flash, flash.good && styles.isGood)} role="status">
            <p>
              <strong>{flash.good ? "Done." : "Heads up."}</strong> {flash.text}
            </p>
            <button type="button" className={styles.iconBtn} onClick={() => setFlash(null)}>
              <Ic id="i-x" />
              <span className={styles.srOnly}>Dismiss</span>
            </button>
          </div>
        )}
      </div>

      {/* ── 02 · LINE ITEMS ────────────────────────────────────────── */}
      <Card
        id="mc-lines"
        num="02"
        title="Line items"
        summary={linesSummary(draft, totals)}
        effect={{
          value: `${costShare.toFixed(1)}%`,
          label: "of total · your direct cost",
          tone: "live",
        }}
        shut={shut["mc-lines"]}
        onShut={() => toggleShut("mc-lines")}
      >
        <LinesBody
          draft={draft}
          totals={totals}
          openRows={openRows}
          onToggleRow={toggleRow}
          onPatchLine={onPatchLine}
          onUnitPrice={onUnitPrice}
          onRemoveLine={onRemoveLine}
          onAddLine={onAddLine}
        />
      </Card>

      {/* ── 03 · CLIENT & JOB ──────────────────────────────────────── */}
      <Card
        id="mc-basics"
        num="03"
        title="Client & job"
        summary={basicsSummary(draft, clients, projects)}
        effect={{ label: "sets the tax rate", tone: "flat" }}
        shut={shut["mc-basics"]}
        onShut={() => toggleShut("mc-basics")}
      >
        <BasicsBody
          draft={draft}
          clients={clients}
          projects={projects}
          onTitle={(v) => patch({ title: v })}
          onDescription={(v) => patch({ description: v })}
          onAddress={(v) => patch({ address: v })}
          onAddressFound={onAddressFound}
          onPickProject={(id) => patch({ projectId: id })}
          onClearProject={() => patch({ projectId: null })}
          onCreateProject={onCreateProject}
          onPickClient={onPickClient}
          onFreeText={(name) => patch({ client: { mode: "freeText", name } })}
          onClearClient={() => patch({ client: { mode: "none" } })}
          onCreateClient={onCreateClient}
          onEditClient={onEditClient}
        />
      </Card>

      {/* ── 04 · SCOPE & NOTES ─────────────────────────────────────── */}
      <Card
        id="mc-scope"
        num="04"
        title="Scope & notes"
        summary={scopeSummary(draft)}
        effect={{ label: "no price effect", tone: "flat" }}
        shut={shut["mc-scope"]}
        onShut={() => toggleShut("mc-scope")}
      >
        <ScopeBody
          draft={draft}
          onScope={(v) => patch({ scopeOfWork: v })}
          onNotes={(v) => patch({ notes: v })}
        />
      </Card>

      {/* ── 05 · PROPOSAL OPTIONS ──────────────────────────────────── */}
      <Card
        id="mc-options"
        num="05"
        title="Proposal options"
        summary={optionsSummary(draft)}
        effect={
          draft.options.laborOnly
            ? { value: `−${money0(materialWeight)}`, label: "labor only · off the total", tone: "warn" }
            : { label: "changes what prints", tone: "flat" }
        }
        shut={shut["mc-options"]}
        onShut={() => toggleShut("mc-options")}
      >
        <OptionsBody draft={draft} materialWeight={materialWeight} onToggle={onToggleOption} />
      </Card>

      {/* ── 06 · TERMS ─────────────────────────────────────────────── */}
      <Card
        id="mc-terms"
        num="06"
        title="Terms & conditions"
        summary={termsSummary(draft)}
        effect={{ label: "no price effect", tone: "flat" }}
        shut={shut["mc-terms"]}
        onShut={() => toggleShut("mc-terms")}
      >
        <TermsBody draft={draft} onTerms={(v) => patch({ terms: v })} />
      </Card>

      {/* ── 07 · PAYMENT SCHEDULE ──────────────────────────────────── */}
      <Card
        id="mc-payments"
        num="07"
        title="Payment schedule"
        summary={paymentsSummary(draft, totals)}
        effect={{
          value: `${coverShare.toFixed(0)}%`,
          label: coverage.state === "exact" ? "of total covered" : "covered · does not add up",
          tone:
            coverage.state === "exact" ? "ok" : coverage.state === "under" ? "warn" : "bad",
        }}
        shut={shut["mc-payments"]}
        onShut={() => toggleShut("mc-payments")}
      >
        <PaymentsBody
          draft={draft}
          totals={totals}
          onPatch={onPatchInstallment}
          onAdd={onAddInstallment}
          onRemove={onRemoveInstallment}
          onBalance={onBalance}
        />
      </Card>

      {/* ── 08 · FILES ─────────────────────────────────────────────── */}
      <Card
        id="mc-files"
        num="08"
        title="Files & documents"
        summary={filesSummary(draft)}
        effect={{ label: "no price effect", tone: "flat" }}
        shut={shut["mc-files"]}
        onShut={() => toggleShut("mc-files")}
      >
        <FilesBody draft={draft} onAdd={onAddFiles} onRemove={onRemoveFile} />
      </Card>

      {/* ── 09 · WHAT THE CLIENT SEES ──────────────────────────────── */}
      <PreviewCard draft={draft} totals={totals} clients={clients} />

      {/* The closing annotation. `addedShare` is the other side of card 02's
          percentage: cost plus everything card 01 loads on top is the whole
          contract total, and printing both is what proves the decomposition
          adds up rather than asking anyone to take it on trust. */}
      <p className={cx(styles.headMeta, styles.col)}>
        <span>
          {totals.contractTotal > 0
            ? `Cost ${costShare.toFixed(1)}% + markup, overhead, profit and tax ${addedShare.toFixed(1)}% = ${money(totals.contractTotal)}`
            : "No priced work yet — the contract total is $0.00"}
        </span>
        <i aria-hidden="true" />
        <em>Fixture data · nothing here is saved or sent</em>
      </p>
    </>
  );
}
