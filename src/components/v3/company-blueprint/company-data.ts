// Company blueprint — the donor's embedded demo data, hardcoded exactly as it
// appears in jobflex-company-blueprint_3.html. Same order, same strings, same
// inline <b> markup inside `summary` (the ported renderer writes it as HTML,
// just like the donor). Kept in its own module so company-behavior.ts stays
// pure behavior, matching proposals-blueprint/proposals-data.ts.

export const COLOR_PRESETS = [
  "#1F7A52",
  "#0EA5E9",
  "#059669",
  "#C89450",
  "#E11D48",
  "#7C3AED",
  "#475569",
  "#111113",
];

export const TRADE_TYPES = [
  "Flooring",
  "Tile",
  "Countertops",
  "Plumbing",
  "Electrical",
  "Carpentry",
  "Painting",
  "Roofing",
  "Fencing",
  "Decking",
  "Siding",
  "Kitchen & Bath",
];

export type ActCat = { key: string; label: string };

export const ACT_CATS: ActCat[] = [
  { key: "all", label: "All" },
  { key: "proposals", label: "Proposals" },
  { key: "leads", label: "Leads & clients" },
  { key: "jobs", label: "Jobs" },
  { key: "team", label: "Team" },
];

export const MEMBERS = ["Everyone", "Ivan", "Marcus B.", "Sofia R.", "Dan K."];

export type ActivityEntry = {
  day: string;
  actor: string;
  cat: string;
  /** Contains inline <b> markup — written into the feed as HTML, donor-exact. */
  summary: string;
  meta: string;
  time: string;
  tone: string;
};

export const ACTIVITY_DATA: ActivityEntry[] = [
  { day: "Today", actor: "Ivan", cat: "proposals", summary: "sent proposal <b>#2851</b> to M. Henderson", meta: "Proposal · $24,600", time: "25m", tone: "var(--blueprint)" },
  { day: "Today", actor: "Marcus B.", cat: "jobs", summary: "started <b>Roof tear-off — 4812 Maple Ave</b>", meta: "Job · in progress", time: "2h", tone: "var(--warning)" },
  { day: "Today", actor: "Sofia R.", cat: "leads", summary: "claimed lead <b>S. Rao</b>", meta: "Lead · Facebook", time: "5h", tone: "var(--blueprint)" },
  { day: "Today", actor: "Ivan", cat: "leads", summary: "added client <b>R. Tran</b>", meta: "Client", time: "8h", tone: "" },
  { day: "Yesterday", actor: "Dan K.", cat: "jobs", summary: "completed <b>Deck power wash — 55 Cedar Loop</b>", meta: "Job · completed", time: "1d", tone: "var(--success)" },
  { day: "Yesterday", actor: "Ivan", cat: "proposals", summary: "marked <b>Cedar fence, 140 ft</b> accepted", meta: "Proposal · $12,400", time: "1d", tone: "var(--success)" },
  { day: "Yesterday", actor: "Sofia R.", cat: "team", summary: "invited <b>Tyler Brooks</b> to the crew", meta: "Team · invite sent", time: "1d", tone: "" },
  { day: "Jul 20", actor: "Marcus B.", cat: "jobs", summary: "scheduled <b>Fence repair — 1409 Fern St</b>", meta: "Job · Jul 23", time: "2d", tone: "var(--blueprint)" },
  { day: "Jul 20", actor: "Ivan", cat: "proposals", summary: "recorded payment on <b>#2825</b>", meta: "Payment · $8,400", time: "2d", tone: "var(--success)" },
  { day: "Jul 19", actor: "Sofia R.", cat: "leads", summary: "moved <b>P. Delgado</b> to lost", meta: "Lead · lost", time: "3d", tone: "var(--danger)" },
  { day: "Jul 19", actor: "Dan K.", cat: "jobs", summary: "uploaded 6 photos to <b>Gutter guards — Redmond</b>", meta: "Job · photos", time: "3d", tone: "" },
  { day: "Jul 18", actor: "Ivan", cat: "team", summary: "changed <b>Dan K.</b> role to installer", meta: "Team · role", time: "4d", tone: "" },
];
