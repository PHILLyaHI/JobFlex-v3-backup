// Manual Card Lab hub — the presentation layer for the single-column CARD
// design of the manual proposal builder (/dashboard/manual-cards).
//
// The lab ran five competing variants; the owner picked Focus Card on
// 2026-08-08 and the other four were removed from the tree in the commit that
// follows their own. They are NOT lost — they are in git history, one commit
// back, and their theses are recorded at the foot of this file so the
// comparison that produced the pick survives the deletion.
//
// Routes are STRINGS on purpose: the content component casts to `Route` at the
// <Link>, the same way the donor pages cast their router.push targets. This
// file therefore has zero imports and cannot go stale.
//
// Sibling of the earlier four-variant hub at /dashboard/manual-lab, which
// indexes a DIFFERENT set (drafting / ticket / ledger / stack — mixed layout
// paradigms). This lab holds one paradigm: a single column of cards.

/** Which aria-hidden layout schematic the spec-card draws. */
export type SchematicKind = "focus";

export interface CardVariant {
  /** Drawing-station number, printed on the ink plate ("01"…"05"). */
  station: string;
  /** Display name; the card renders it in caps. */
  name: string;
  /** The design BET in one line — what this variant claims and the others don't. */
  thesis: string;
  /** Target route, linked by URL string only (see file header). */
  route: string;
  schematic: SchematicKind;
}

export const CARD_VARIANTS: CardVariant[] = [
  {
    station: "01",
    name: "Focus Card",
    thesis:
      "Nothing ever collapses — only one card is live at full ink, the rest stand down to summaries you can still read.",
    route: "/dashboard/manual-focus",
    schematic: "focus",
  },
];

/**
 * The four bets that lost, kept as text so the reasoning outlives the code.
 *
 * All four were complete, working builds against the same feature inventory
 * and the same seed draft; they were removed from the tree, not abandoned
 * mid-flight. To read one, check out the commit before the removal — the
 * routes and component folders come back intact.
 *
 * Rendered on the hub under the surviving spec-card, so the page states what
 * it chose AND what it chose against. A lab that deletes its losers without a
 * trace teaches nothing the second time the question comes up.
 */
export const RETIRED_VARIANTS: { name: string; route: string; thesis: string }[] =
  [
    {
      name: "Proof Card",
      route: "/dashboard/manual-proof",
      thesis:
        "Every card ends with a footer stating what it adds to the price. Read only the footers and you have read the estimate.",
    },
    {
      name: "Spec Sheet",
      route: "/dashboard/manual-spec",
      thesis:
        "No form boxes. One label gutter, one value track, one vertical rule down the page — the whole column is a filled-in spec.",
    },
    {
      name: "Worklist",
      route: "/dashboard/manual-worklist",
      thesis:
        "Cards that meet their done-condition sink below a seam into one-line receipts. The page shrinks as you work.",
    },
    {
      name: "Price First",
      route: "/dashboard/manual-margin",
      thesis:
        "The total goes on top and is editable as a target. Everything below it is an input, and states its share of the number.",
    },
  ];
