// The engine roster the picker draws.
//
// A fixture, not a query, and deliberately so: WHICH estimators exist is a
// product fact, not org data. The queued entries are honest placeholders for
// trades that have no engine yet — they render disabled and unfocusable rather
// than as buttons that lead nowhere.
//
// ORDER IS THE MOCKUP'S. `jobflex-estimator-picker-blueprint (10).html` lists
// its ENGINES as Manual, Smart Proposal, Roof, Fence — catalogue numbers 03,
// 04, 01, 02 — so the 2×2 block reads Manual/Smart on the top row. The number
// stays on the record as `no`; only the queued stubs print it, which is also
// what the source does (`<i>05</i>Deck`).

export type EngineDiagram = "roof" | "fence" | "sheet" | "prose";

type EngineBase = {
  id: string;
  /** Catalogue number. Printed on the queued stubs only — the source's cards
      carry it in their data and never render it. */
  no: string;
  title: string;
  /** The lowercase method line under the title — how you feed this engine. */
  method: string;
  diagram: EngineDiagram;
  /** Input/output/time. Only `time` reaches the card — it is the figure in the
      card's right-hand slot. The other two are the source's dead fields, kept
      because they are real and cost nothing. */
  spec: { input: string; output: string; time: string };
};

export type Engine = EngineBase &
  ({ status: "active"; href: string } | { status: "queued"; href?: never });

export const ENGINES: Engine[] = [
  {
    id: "manual",
    no: "03",
    title: "Manual",
    method: "line items",
    diagram: "sheet",
    status: "active",
    // POINTED AT THE REDESIGN WHILE IT IS UNDER REVIEW.
    // The shipped builder is untouched and still reachable directly at
    // /dashboard/estimators/manual — only this card's destination moved, so
    // reverting is restoring that one string.
    //
    // Worth knowing before using it for real work: the redesign is a FIXTURE.
    // Save and Save & send write nothing and say so on the page. Anything typed
    // there is gone on reload.
    href: "/dashboard/manual-blueprint",
    spec: { input: "typed rows", output: "cost sheet", time: "~9 min" },
  },
  {
    id: "smart",
    no: "04",
    title: "Smart Proposal",
    method: "describe it",
    diagram: "prose",
    status: "active",
    href: "/dashboard/advanced-ai",
    spec: { input: "plain prose", output: "cost sheet", time: "~2 min" },
  },
  {
    id: "roof",
    no: "01",
    title: "Roof",
    method: "satellite trace",
    diagram: "roof",
    status: "active",
    href: "/dashboard/roof-estimator",
    spec: { input: "aerial imagery", output: "squares · facets", time: "~4 min" },
  },
  {
    id: "fence",
    no: "02",
    title: "Fence",
    method: "map trace",
    diagram: "fence",
    status: "active",
    href: "/dashboard/fence-estimator",
    spec: { input: "drawn polyline", output: "linear ft · gates", time: "~3 min" },
  },
  {
    id: "deck",
    no: "05",
    title: "Deck",
    method: "queued",
    diagram: "sheet",
    status: "queued",
    spec: { input: "—", output: "—", time: "—" },
  },
  {
    id: "concrete",
    no: "06",
    title: "Concrete",
    method: "queued",
    diagram: "sheet",
    status: "queued",
    spec: { input: "—", output: "—", time: "—" },
  },
  {
    id: "paint",
    no: "07",
    title: "Paint",
    method: "queued",
    diagram: "sheet",
    status: "queued",
    spec: { input: "—", output: "—", time: "—" },
  },
];

export const ACTIVE_COUNT = ENGINES.filter((e) => e.status === "active").length;
export const QUEUED_COUNT = ENGINES.filter((e) => e.status === "queued").length;
