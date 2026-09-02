// Mobile company (mobile-company-v2) — types + pure derivations.
//
// This surface is no longer a fixture. The component fetches `getCompanySeed()`
// (actions/company.ts) on mount — the same org row, member roster and
// `toActivityEntries` feed mapping the desktop page
// (app/dashboard/company/page.tsx) renders — and every save runs the same
// three server actions the desktop sheet runs (updateBranding /
// updateLeadProfile / updateLanding).
//
// What stays here is the donor's presentation vocabulary: the row derivations
// (monogram, summary runs, meta splitting, badge + tone), and the three filter
// axes. The person filter now matches on the membership user id (like the
// desktop feed), not the display name — two crew members can share a name.

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

/** Fallback when the org has no primaryColor yet — the blueprint green. */
export const DEFAULT_COLOR = "#1F7A52";

export type Identity = {
  name: string;
  email: string;
  phone: string;
  site: string;
  addr: string;
};

/* ============================================================
   LEAD MATCHING — the canonical taxonomy, never a private list:
   updateLeadProfile validates with z.enum(TRADE_TYPES) from lib/tradeTypes.
   ============================================================ */

export { TRADE_TYPES } from "@/lib/tradeTypes";

export type LeadProfile = { addr: string; phone: string };

/* ============================================================
   LANDING BUILDER (ships empty until the org customizes — placeholders only)
   ============================================================ */

export type Landing = { title: string; sub: string };

export const LANDING_PLACEHOLDERS: Landing = {
  title: "Roofing and fencing done right, on schedule",
  sub: "Serving Bothell, Kirkland and the east side since 2018",
};

/* ============================================================
   TEAM ACTIVITY
   ============================================================ */

export type ActCat = { key: string; label: string };

// The five chips ARE the classic feed's category lens (lib/teamActivityView
// CATEGORIES) — same keys `categoryOf` emits, same labels, same order.
export const ACT_CATS: ActCat[] = [
  { key: "all", label: "All" },
  { key: "proposals", label: "Proposals" },
  { key: "leads", label: "Leads & clients" },
  { key: "jobs", label: "Jobs" },
  { key: "team", label: "Team" },
];

export const ALL_CAT = "all";
/** Sentinel id for the person filter's "everyone" option. Member ids are
 *  cuids, so this can never collide with a real membership. */
export const EVERYONE = "Everyone";

/** The desktop mapper's row shape (company-blueprint/company-data.ts). */
export type ActivityEntry = {
  day: string;
  actor: string;
  /** Membership user id, or "" for a client-side / system event. The person
   *  filter matches on this, not on the display name. */
  actorId: string;
  cat: string;
  /** Contains inline <b> markup — donor-exact. Rendered via summaryParts(). */
  summary: string;
  meta: string;
  time: string;
  tone: string;
};

/** The feed row needs a stable identity for React keys and the row sheet —
 *  the seed carries the ActivityEvent id. */
export type ActivityRecord = ActivityEntry & { id: string };

/* ============================================================
   SEED — what getCompanySeed() (actions/company.ts) returns
   ============================================================ */

export type CompanyOrg = {
  name: string;
  billingEmail: string;
  phone: string;
  website: string;
  address: string;
  primaryColor: string;
  logoUrl: string | null;
  /** Canonical trades (lib/tradeTypes) the org takes platform leads for. */
  tradeTypes: string[];
  leadOffersEnabled: boolean;
  publicProfileEnabled: boolean;
  landingHeroTitle: string;
  landingHeroSubtitle: string;
};

export type CompanyMember = { id: string; name: string };

export type CompanySeed = {
  org: CompanyOrg;
  members: CompanyMember[];
  activity: ActivityRecord[];
};

/**
 * The desktop pages the log six at a time behind "Load more". A handheld row is
 * three lines tall, so 5 — the same reasoning that took the clients book from
 * 12 to 8 and the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 5;

/* ============================================================
   HELPERS
   ============================================================ */

/** Server actions treat "" as a value; absent columns are null. */
export const orNull = (v: string) => (v ? v : null);

/** A server action failure, as one sentence a save line can carry. */
export function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  // Zod's parse failures are JSON blobs, not sentences.
  if (msg.startsWith("[") || msg.startsWith("{")) {
    return "Couldn’t save — check the highlighted fields.";
  }
  return msg;
}

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
 * The mapper's inline <b> is carried verbatim, so it has to be RENDERED rather
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

/** "Proposal · M. Henderson" → "Proposal". The record type, for the meta line. */
export function metaType(meta: string): string {
  return meta.split(" · ")[0];
}

/** "Proposal · $24,600" → 24600; "Job" → null. The real mapper carries no
 *  amounts today, so this renders the em-dash absence — kept so the column
 *  lights up the day the mapper does. */
export function metaAmount(meta: string): number | null {
  const m = /\$([\d,]+)/.exec(meta);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export function catLabel(key: string): string {
  return ACT_CATS.find((c) => c.key === key)?.label ?? key;
}

/**
 * The row's status badge. `meta`'s tail is the record's context where it has
 * one (the client behind a proposal event); where the tail is money or
 * missing, the category stands in, so every row carries exactly one badge.
 */
export function rowBadge(e: ActivityEntry): string {
  const rest = e.meta.split(" · ").slice(1).join(" · ").trim();
  if (!rest || rest.startsWith("$")) return catLabel(e.cat);
  return rest;
}

export type ToneKey = "bp" | "warn" | "ok" | "danger" | "none";

/**
 * The mapper stores the bead colour as a raw `var(--…)` string. Mapping it to a
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

/** A team / system event has no proposal, lead or client behind it. */
export function hasRecord(e: ActivityEntry): boolean {
  return e.cat !== "team";
}

/* ============================================================
   FILTERS — the donor's three axes: category, person, free text
   ============================================================ */

export function matchesCat(e: ActivityEntry, cat: string): boolean {
  return cat === ALL_CAT || e.cat === cat;
}

/** `person` is a membership user id, or the EVERYONE sentinel. */
export function matchesPerson(e: ActivityEntry, person: string): boolean {
  return person === EVERYONE || (e.actorId !== "" && e.actorId === person);
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
