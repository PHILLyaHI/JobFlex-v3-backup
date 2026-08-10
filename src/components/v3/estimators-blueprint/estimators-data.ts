// The engine roster the hub draws.
//
// A fixture, not a query, and deliberately so: WHICH estimators exist is a
// product fact, not org data. The queued entries are honest placeholders for
// trades that have no engine yet — they render disabled and unfocusable rather
// than as buttons that lead nowhere.

export type EngineDiagram = "roof" | "fence" | "sheet" | "prose";

type EngineBase = {
  id: string;
  title: string;
  /** The lowercase method line under the title — how you feed this engine. */
  method: string;
  diagram: EngineDiagram;
  /** The three-row spec table. Mono, tabular, scannable at arm's length. */
  spec: { input: string; output: string; time: string };
};

export type Engine = EngineBase &
  ({ status: "active"; href: string } | { status: "queued"; href?: never });

export const ENGINES: Engine[] = [
  {
    id: "roof",
    title: "Roof",
    method: "satellite trace",
    diagram: "roof",
    status: "active",
    href: "/dashboard/roof-estimator",
    spec: { input: "aerial imagery", output: "squares · facets", time: "~4 min" },
  },
  {
    id: "fence",
    title: "Fence",
    method: "map trace",
    diagram: "fence",
    status: "active",
    href: "/dashboard/fence-estimator",
    spec: { input: "drawn polyline", output: "linear ft · gates", time: "~3 min" },
  },
  {
    id: "manual",
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
    title: "Smart Proposal",
    method: "describe it",
    diagram: "prose",
    status: "active",
    href: "/dashboard/advanced-ai",
    spec: { input: "plain prose", output: "cost sheet", time: "~2 min" },
  },
  {
    id: "deck",
    title: "Deck",
    method: "queued",
    diagram: "sheet",
    status: "queued",
    spec: { input: "—", output: "—", time: "—" },
  },
  {
    id: "concrete",
    title: "Concrete",
    method: "queued",
    diagram: "sheet",
    status: "queued",
    spec: { input: "—", output: "—", time: "—" },
  },
  {
    id: "paint",
    title: "Paint",
    method: "queued",
    diagram: "sheet",
    status: "queued",
    spec: { input: "—", output: "—", time: "—" },
  },
];

export const ACTIVE_COUNT = ENGINES.filter((e) => e.status === "active").length;
export const QUEUED_COUNT = ENGINES.filter((e) => e.status === "queued").length;
