// Mobile company (mobile-company-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop company donor
// (src/components/v3/company-blueprint/company-data.ts): same values, same
// order, same field names, including the inline <b> markup inside `summary`.
// The identity / lead / landing seeds below are the same strings the desktop
// markup ships as `defaultValue` / `placeholder` on its inputs
// (company-content.tsx), lifted into data so the handheld page is judged
// against exactly the same content as the desktop sheet.
//
// Seattle-area contractor texture: Bell Roofing & Fence out of Bothell, a crew
// of four, twelve audit entries across four categories.
//
// Reachable states baked into the fixture:
//  · two entries with cat "team" — they have no work record attached, which is
//    what makes the row sheet's DISABLED "Open record" row reachable;
//  · four entries with tone "" — no state change, so the bead and the row badge
//    render neutral rather than in a status colour;
//  · three entries carry money in `meta`, nine do not — the nine render the
//    em-dash absence rather than "$0";
//  · every actor is also a MEMBERS option, so the sheet's "Show only …" row can
//    always resolve to a real person filter.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The arrays are mutated at runtime (row
// delete, trade toggles, identity edits), so the component clones the seed per
// mount.

/* ============================================================
   BRANDING
   ============================================================ */

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

/** The donor's initial brand colour (`co.color` in company-behavior.ts). */
export const DEFAULT_COLOR = "#1F7A52";

export type Identity = {
  name: string;
  email: string;
  phone: string;
  site: string;
  addr: string;
};

/** The donor's `[data-b]` field values, verbatim. */
export const IDENTITY_SEED: Identity = {
  name: "Bell Roofing & Fence",
  email: "billing@bellroofing.com",
  phone: "(425) 555-0100",
  site: "bellroofing.com",
  addr: "1180 Monroe Ave NE, Bothell, WA 98011",
};

/* ============================================================
   LEAD MATCHING
   ============================================================ */

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

/** The donor's `co.trades`. */
export const DEFAULT_TRADES = ["Roofing", "Fencing", "Decking", "Siding"];

export type LeadProfile = { addr: string; phone: string };

/** The donor's `[data-l]` field values, verbatim. */
export const LEAD_SEED: LeadProfile = {
  addr: "1180 Monroe Ave NE, Bothell, WA 98011",
  phone: "(425) 555-0100",
};

/* ============================================================
   LANDING BUILDER (ships empty on the desktop — placeholders only)
   ============================================================ */

export type Landing = { title: string; sub: string };

export const LANDING_SEED: Landing = { title: "", sub: "" };

export const LANDING_PLACEHOLDERS: Landing = {
  title: "Roofing and fencing done right, on schedule",
  sub: "Serving Bothell, Kirkland and the east side since 2018",
};

/* ============================================================
   TEAM ACTIVITY
   ============================================================ */

export type ActCat = { key: string; label: string };

export const ACT_CATS: ActCat[] = [
  { key: "all", label: "All" },
  { key: "proposals", label: "Proposals" },
  { key: "leads", label: "Leads & clients" },
  { key: "jobs", label: "Jobs" },
  { key: "team", label: "Team" },
];

export const MEMBERS = ["Everyone", "Ivan", "Marcus B.", "Sofia R.", "Dan K."];

/** MEMBERS minus the "Everyone" filter option — the actual crew. */
export const CREW = MEMBERS.slice(1);

export const ALL_CAT = "all";
export const EVERYONE = "Everyone";

export type ActivityEntry = {
  day: string;
  actor: string;
  cat: string;
  /** Contains inline <b> markup — donor-exact. Rendered via summaryParts(). */
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

/** The feed row needs a stable identity for React keys and for delete. */
export type ActivityRecord = ActivityEntry & { id: string };

/**
 * One clone per mount. The desktop feed is read-only; the handheld sheet can
 * remove an entry, so runtime mutations must not leak into the next mount.
 */
export function cloneActivity(): ActivityRecord[] {
  return ACTIVITY_DATA.map((e, i) => ({ ...e, id: `a${String(i + 1).padStart(2, "0")}` }));
}

/**
 * The desktop pages the log six at a time behind "Load more". A handheld row is
 * three lines tall, so 5 — the same reasoning that took the clients book from
 * 12 to 8 and the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 5;

/* ============================================================
   DERIVATIONS — everything the row and the sheet read
   ============================================================ */

/** The donor's monogram(), verbatim: "Marcus B." → MB, "Ivan" → IV. */
export function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** "sent proposal <b>#2851</b> to …" → plain text, for kickers and clipboard. */
export function plainSummary(summary: string): string {
  return summary.replace(/<[^>]+>/g, "");
}

/**
 * The fixture's inline <b> is carried verbatim, so it has to be RENDERED rather
 * than injected: this splits the string into runs, and the row emits real <b>
 * elements. No dangerouslySetInnerHTML anywhere on the surface.
 */
export function summaryParts(summary: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /<b>(.*?)<\/b>/g;
  let last = 0;
  // A for-loop rather than `while ((m = re.exec()))` — no assignment in a
  // condition, so no-cond-assign stays satisfied.
  for (let m = re.exec(summary); m !== null; m = re.exec(summary)) {
    if (m.index > last) out.push({ text: summary.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < summary.length) out.push({ text: summary.slice(last), bold: false });
  return out;
}

/** "Proposal · $24,600" → "Proposal". The record type, for the mono meta line. */
export function metaType(meta: string): string {
  return meta.split(" · ")[0];
}

/** "Proposal · $24,600" → 24600; "Job · in progress" → null. */
export function metaAmount(meta: string): number | null {
  const m = /\$([\d,]+)/.exec(meta);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export function catLabel(key: string): string {
  return ACT_CATS.find((c) => c.key === key)?.label ?? key;
}

/**
 * The row's status badge. `meta`'s tail is the record's state where it has one
 * ("in progress", "completed", "lost", "invite sent", "Jul 23", "Facebook");
 * where the tail is money or missing, the category stands in, so every row
 * carries exactly one badge.
 */
export function rowBadge(e: ActivityEntry): string {
  const rest = e.meta.split(" · ").slice(1).join(" · ").trim();
  if (!rest || rest.startsWith("$")) return catLabel(e.cat);
  return rest;
}

export type ToneKey = "bp" | "warn" | "ok" | "danger" | "none";

/**
 * The donor stores the bead colour as a raw `var(--…)` string. Mapping it to a
 * key lets the badge take all THREE tones (base border / soft fill / base text)
 * from the stylesheet instead of colouring one property inline.
 */
export function toneKey(tone: string): ToneKey {
  if (tone.includes("blueprint")) return "bp";
  if (tone.includes("warning")) return "warn";
  if (tone.includes("success")) return "ok";
  if (tone.includes("danger")) return "danger";
  return "none";
}

/** A team change has no proposal / job / lead behind it. */
export function hasRecord(e: ActivityEntry): boolean {
  return e.cat !== "team";
}

/* ============================================================
   FILTERS — the donor's three axes: category, person, free text
   ============================================================ */

export function matchesCat(e: ActivityEntry, cat: string): boolean {
  return cat === ALL_CAT || e.cat === cat;
}

export function matchesPerson(e: ActivityEntry, person: string): boolean {
  return person === EVERYONE || e.actor === person;
}

/** Donor-exact haystack: actor + summary + meta, tags stripped. */
export function matchesQuery(e: ActivityEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${e.actor} ${e.summary} ${e.meta}`
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .includes(q);
}

export function matchesEntry(
  e: ActivityEntry,
  cat: string,
  person: string,
  query: string,
): boolean {
  return matchesCat(e, cat) && matchesPerson(e, person) && matchesQuery(e, query);
}

/** Counts on the filter faces are of the whole log, like the clients book. */
export function catCount(list: ActivityEntry[], cat: string): number {
  return list.filter((e) => matchesCat(e, cat)).length;
}

export function personCount(list: ActivityEntry[], person: string): number {
  return list.filter((e) => matchesPerson(e, person)).length;
}
