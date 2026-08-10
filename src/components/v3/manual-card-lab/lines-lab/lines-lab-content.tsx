"use client";

// LINE-ITEM LAB — the comparison page. Route: /dashboard/manual-lines.
//
// Three competing designs of card 03 (the priced work) from the manual proposal
// builder, stacked down one column.
//
// ── ONE STATE, THREE VIEWS ───────────────────────────────────
// All three blocks read and write the SAME `draft`. Rename a line in the ledger
// and it renames in the one-row grid and in the dropdown at the same instant;
// drag the ratio in one and the other two follow. That is the entire point of
// the page: three designs shown the same content at the same moment, so the
// comparison is of the DESIGN and not of whatever each happened to be seeded
// with. A per-variant copy of the fixture would have let two blocks drift and
// quietly made the prettier data win.
//
// `openIds` is shared for the same reason, even though the three variants spend
// it differently — the dropdown opens a panel with it, the one-row grid reveals
// a description line, the ledger ignores it entirely. That divergence is
// visible precisely because the input is identical.
//
// ── WHAT THIS PAGE IS NOT ────────────────────────────────────
// Not a builder. There is no markup card, no payment schedule, no client's
// copy, and no Save — those live at /dashboard/manual-blueprint. This page
// exists to answer one question (which line table?) and is deleted once it is
// answered. The winner moves into the builder as a one-line import swap,
// because all three implement the same `LineItemsProps`.
//
// Fixture-only: component-local `useState` over the shared seed. Nothing here
// touches Prisma, a server action or the network.

import { useMemo, useState } from "react";
import type { Draft, Line } from "../manual-focus/manual-focus-types";
import { PROPOSAL_NO, makeSeedDraft } from "../manual-focus/manual-focus-data";
import { computeTotals, money, newId } from "../manual-focus/manual-focus-math";
import type { LineItemsProps } from "./lines-contract";
import { LinesRow } from "./variant-row/lines-row";
import { LinesDrawer } from "./variant-drawer/lines-drawer";
import { LinesLedger } from "./variant-ledger/lines-ledger";
import styles from "./lines-lab.module.css";

/** The three entrants, in the order they are stacked. */
const VARIANTS: {
  key: string;
  letter: string;
  title: string;
  thesis: string;
  Block: (props: LineItemsProps) => React.ReactNode;
}[] = [
  {
    key: "row",
    letter: "A",
    title: "One row",
    thesis:
      "Everything on a single line — name, quantity, unit, price, total and the material/labor mix — with no disclosure and nothing hidden. The bet: twelve items should be twelve identical scan lines, not twenty-four.",
    Block: LinesRow,
  },
  {
    key: "drawer",
    letter: "B",
    title: "Dropdown",
    thesis:
      "A clean summary row, with the description, the mix and the cost breakdown behind a per-row panel. The bet: hiding the right forty per cent is what makes the other sixty readable.",
    Block: LinesDrawer,
  },
  {
    key: "ledger",
    letter: "C",
    title: "Ledger",
    thesis:
      "Nothing hides, but nothing draws a box either — fields show their edge only on hover and focus, so at rest the block reads as a printed estimate. The bet: what made the old design messy was never the density, it was twenty control outlines drawing themselves at once.",
    Block: LinesLedger,
  },
];

export function LinesLabContent() {
  const [draft, setDraft] = useState<Draft>(makeSeedDraft);
  const [openIds, setOpenIds] = useState<string[]>([]);

  const totals = useMemo(() => computeTotals(draft), [draft]);

  /* ---- editing: one set of handlers, passed to all three ------------- */

  const patchLine = (id: string, patch: Partial<Line>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const addLine = () =>
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
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

  const removeLine = (id: string) => {
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
    setOpenIds((ids) => ids.filter((x) => x !== id));
  };

  const toggle = (id: string) =>
    setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Typing a rate is the user taking the wheel: the estimate must stop
  // following the address, exactly as it does in the builder.
  const setTaxPct = (n: number) =>
    setDraft((d) => ({ ...d, taxPct: n, taxAuto: false, taxState: "" }));

  const shared: LineItemsProps = {
    lines: draft.lines,
    openIds,
    onToggle: toggle,
    onPatch: patchLine,
    onAdd: addLine,
    onRemove: removeLine,
    baseTotal: totals.baseTotal,
    namedCount: totals.printed.length,
    unnamedCount: totals.unnamedCount,
    taxPct: draft.taxPct,
    taxAuto: draft.taxAuto,
    taxState: draft.taxState,
    onTaxPct: setTaxPct,
  };

  return (
    <div className={styles.page}>
      <div className="page-head">
        <div>
          <div className="kicker">Line items · three designs</div>
          <h1 className="page-title">Which table</h1>
        </div>
        <div className={styles.meta}>
          <span className={styles.metaMono}>{PROPOSAL_NO} · shared state</span>
          <span className={styles.metaTotal}>{money(totals.baseTotal)}</span>
        </div>
      </div>

      <div className={styles.stack}>
        {VARIANTS.map(({ key, letter, title, thesis, Block }) => (
          <section key={key} id={`v-${key}`} className={styles.card} aria-labelledby={`v-${key}-t`}>
            <header className={styles.cardHead}>
              <span className={styles.num}>{letter}</span>
              <h2 id={`v-${key}-t`} className={styles.cardTitle}>
                {title}
              </h2>
            </header>
            <p className={styles.thesis}>{thesis}</p>
            <Block {...shared} />
          </section>
        ))}
      </div>

      <p className={styles.foot}>
        All three blocks are wired to one draft — edit any of them and the other two follow, along
        with the figure at the top. Nothing here saves; this page answers one question and then goes
        away. The winner drops into the builder at /dashboard/manual-blueprint as a single import
        swap, because all three implement the same props.
      </p>
    </div>
  );
}
