/* TRADE-ADAPTIVE HERO — the one table behind `?industry=`.
   Copy pattern (owner, 2026-09-10): h1 "The full [result]. / From just
   [input]."; sub lists what is inside, and the time.
   ============================================================
   An ad lands on jobflex.app/?industry=<trade> and the landing swaps ONLY its
   first screen: the headline, the line under it, the primary button's words,
   the product shot, and which estimator the showcase opens on. Everything
   below the fold is shared. Without the parameter the page is byte-for-byte
   what it was — DEFAULT_LANDING is the hero's original copy moved here.

   The variant is resolved ON THE SERVER (src/app/page.tsx reads the query —
   only the query) so the first paint already carries the right hero; nothing
   here sniffs the client. This module is deliberately free of next/headers so both
   the server page and client components can import it.

   ONE KEY PER TRADE. The keys are the 20 real trades of TRADE_TYPES ("Other"
   is not a direction anyone advertises), as URL slugs. Every key already
   works end to end — the register links carry it, the register form
   pre-selects the trade, the cookie remembers it — and a key whose entry is
   still null simply shows the default hero. Filling a trade in is data:
   write its LandingVariant, and if it plays the Smart Proposal sequence, its
   scenario in smart-scenarios.ts. */

import { TRADE_TYPES, type TradeType } from "@/lib/tradeTypes";
import type { SmartScenarioKey } from "./smart-scenarios";

export type ShowcaseSlideKey = "smart" | "roof" | "fence" | "video";

export type LandingVariant = {
  /** Two lines — the hero breaks the H1 exactly once. */
  h1: [string, string];
  /** One line under the H1. Absent on the default hero, which never had one. */
  sub?: string;
  /** Words on the solid CTA. */
  primaryCta: string;
  /** Which estimator the showcase opens on; auto-advance carries on from it. */
  showcaseSlide: ShowcaseSlideKey;
  /** The hero's product shot. "dashboard" is the default's; a trade picks
   *  one of the three estimator sequences. */
  visual: "dashboard" | "roof" | "fence" | "smart";
  /** For visual "smart": which job the sequence prices. */
  scenario?: SmartScenarioKey;
};

/** The hero as it shipped on 2026-08-25 — the page with no `?industry=`. */
export const DEFAULT_LANDING: LandingVariant = {
  h1: ["Turn your trade", "into a business."],
  primaryCta: "Start 14-Day Free Trial",
  showcaseSlide: "smart",
  visual: "dashboard",
};

/* ── keys ──────────────────────────────────────────────────
   TRADE_TYPES minus "Other", slugged. The map is the single place a key is
   tied to its trade; the register form's pre-select and the alias table both
   read it. */
export const VARIANT_TRADE = {
  flooring: "Flooring",
  tile: "Tile",
  countertops: "Countertops",
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry: "Carpentry",
  painting: "Painting",
  roofing: "Roofing",
  fencing: "Fencing",
  decking: "Decking",
  siding: "Siding",
  "kitchen-bath": "Kitchen & Bath",
  hvac: "HVAC",
  landscaping: "Landscaping",
  concrete: "Concrete",
  demolition: "Demolition",
  drywall: "Drywall",
  insulation: "Insulation",
  windows: "Windows",
  "general-contractor": "General Contractor",
} as const satisfies Record<string, Exclude<TradeType, "Other">>;

export type LandingVariantKey = keyof typeof VARIANT_TRADE;

export const VARIANT_KEYS = Object.keys(VARIANT_TRADE) as LandingVariantKey[];

/* ── the variants ──────────────────────────────────────────
   null = not written yet: the key works (links, cookie, register pre-select)
   and the hero is the default. The dev gallery (/dev/landing-variants)
   shows these as TODO plates. */
export const LANDING_VARIANTS: Record<LandingVariantKey, LandingVariant | null> = {
  fencing: {
    h1: ["The whole fence takeoff.", "From the lot lines."],
    sub: "Run, grade, stepped panels, posts, gates, concrete and labor — from the line you draw on the parcel.",
    primaryCta: "Start free — estimate a fence",
    showcaseSlide: "fence",
    visual: "fence",
  },
  roofing: {
    h1: ["The full roof report.", "From just the address."],
    sub: "Area, squares, pitch, facets, aerial photo and a priced proposal — in about a minute.",
    primaryCta: "Start free — measure a roof",
    showcaseSlide: "roof",
    visual: "roof",
  },
  "kitchen-bath": {
    h1: ["The full remodel estimate.", "From a description and a photo."],
    sub: "Demo, rough-in, cabinets, tile, fixtures and labor — written in minutes.",
    primaryCta: "Start free — write an estimate",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "kitchen",
  },
  painting: {
    h1: ["The whole paint bid.", "From the square footage."],
    sub: "Prep, primer, coats, trim and labor — interior or exterior.",
    primaryCta: "Start free — quote a paint job",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "painting",
  },
  decking: {
    h1: ["The complete deck estimate.", "From the size and the material."],
    sub: "Frame, boards, railing, stairs and labor, priced and ready to send.",
    primaryCta: "Start free — estimate a deck",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "decking",
  },

  // Batch 2 (2026-09-08): no tool of their own — the Smart Estimator
  // sequence with the trade's own job. Copy stays short and promises no
  // measurement.
  siding: {
    h1: ["The whole siding bid.", "From the wall area."],
    sub: "Tear-off, wrap, lap siding, trim and labor — per sq ft, in one proposal.",
    primaryCta: "Start free — quote a siding job",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "siding",
  },
  concrete: {
    h1: ["The whole pour, priced.", "Before you order the mix."],
    sub: "Demo, base, forms, rebar, finish and labor from the slab you describe.",
    primaryCta: "Start free — price a pour",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "concrete",
  },
  landscaping: {
    h1: ["The full yard proposal.", "From what you describe."],
    sub: "Grading, pavers, retaining wall, sod and labor — priced line by line.",
    primaryCta: "Start free — estimate a yard",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "landscaping",
  },
  flooring: {
    h1: ["The complete floor bid.", "From a room list."],
    sub: "Tear-out, underlayment, planks, trim and labor — room by room.",
    primaryCta: "Start free — quote a floor",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "flooring",
  },
  tile: {
    h1: ["The whole tile job, priced.", "From the rooms you describe."],
    sub: "Demo, prep, waterproofing, tile, grout and labor, floor to shower.",
    primaryCta: "Start free — price a tile job",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "tile",
  },

  // Batch 3 (2026-09-08): the unit-priced trades — fixtures, points,
  // equipment, sheets, openings. Smart Estimator sequence, no measurement
  // promised.
  plumbing: {
    h1: ["The whole job, priced.", "Fixture by fixture."],
    sub: "Water heater, rough-ins, fixtures, drain runs and labor from what you describe.",
    primaryCta: "Start free — price a plumbing job",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "plumbing",
  },
  electrical: {
    h1: ["The full electrical quote.", "From the scope."],
    sub: "Panel, circuits, outlets, cans and labor — point by point.",
    primaryCta: "Start free — quote electrical",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "electrical",
  },
  hvac: {
    h1: ["The whole system, priced.", "Before the first site visit."],
    sub: "Heat pump or furnace, tonnage, duct runs, thermostat and labor per unit.",
    primaryCta: "Start free — price an HVAC job",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "hvac",
  },
  drywall: {
    h1: ["The complete drywall bid.", "From the sheet count."],
    sub: "Hang, tape, level 4 finish, texture and labor per sheet.",
    primaryCta: "Start free — quote drywall",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "drywall",
  },
  windows: {
    h1: ["Every opening, priced.", "From your count."],
    sub: "Units, patio door, casing, install and haul-away in one proposal.",
    primaryCta: "Start free — price windows",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "windows",
  },

  // Batch 4 (2026-09-08): the last five. General Contractor is the one
  // that differs in kind — a project assembled from phases, not one trade's
  // estimate — and its scenario prices each phase off the sub-trade's anchor.
  countertops: {
    h1: ["The full countertop quote.", "From the slab and the foot."],
    sub: "Quartz by the sq ft, sink cutout, backsplash, template and install.",
    primaryCta: "Start free — price countertops",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "countertops",
  },
  carpentry: {
    h1: ["The complete carpentry bid.", "Cut by cut."],
    sub: "Trim by the foot, doors, built-ins, framing and labor from the scope you type.",
    primaryCta: "Start free — quote carpentry",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "carpentry",
  },
  insulation: {
    h1: ["The whole insulation job, priced.", "From the R-value."],
    sub: "Removal, blown-in attic, batts, air sealing and labor per sq ft.",
    primaryCta: "Start free — price insulation",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "insulation",
  },
  demolition: {
    h1: ["The whole tear-out, priced.", "Dumpster to dumpster."],
    sub: "Containment, demo by the sq ft, loads out, disposal and cleanup.",
    primaryCta: "Start free — quote a tear-out",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "demolition",
  },
  "general-contractor": {
    h1: ["The whole job, every trade.", "One estimate."],
    sub: "Demo to finish — each phase at its sub's price, in a single proposal.",
    primaryCta: "Start free — price the whole job",
    showcaseSlide: "smart",
    visual: "smart",
    scenario: "general-contractor",
  },
};

/** The hero content for a key: its variant, or the default while unwritten. */
export function variantContent(key: LandingVariantKey | undefined): LandingVariant {
  return (key && LANDING_VARIANTS[key]) || DEFAULT_LANDING;
}

/** True when the key has a written hero (not a TODO placeholder). */
export function isVariantReady(key: LandingVariantKey): boolean {
  return LANDING_VARIANTS[key] !== null;
}

/* ── normalisation ─────────────────────────────────────────
   What an ad link may carry, lower-cased: the key itself, the TRADE_TYPES
   name ("Kitchen & Bath"), and the obvious short forms. Anything else is
   the default page. */
const VARIANT_ALIASES: Record<string, LandingVariantKey> = {
  // short forms and plurals
  fence: "fencing",
  fences: "fencing",
  fencer: "fencing",
  fencers: "fencing",
  roof: "roofing",
  roofs: "roofing",
  roofer: "roofing",
  roofers: "roofing",
  reroof: "roofing",
  deck: "decking",
  decks: "decking",
  paint: "painting",
  painter: "painting",
  painters: "painting",
  sider: "siding",
  siders: "siding",
  "flooring-contractor": "flooring",
  tiler: "tile",
  tilers: "tile",
  "hvac-contractor": "hvac",
  "gc-contractor": "general-contractor",
  kitchen: "kitchen-bath",
  kitchens: "kitchen-bath",
  bath: "kitchen-bath",
  bathroom: "kitchen-bath",
  bathrooms: "kitchen-bath",
  "kitchen-and-bath": "kitchen-bath",
  kitchen_bath: "kitchen-bath",
  remodel: "kitchen-bath",
  gc: "general-contractor",
  general: "general-contractor",
  contractor: "general-contractor",
  floor: "flooring",
  floors: "flooring",
  tiles: "tile",
  tiling: "tile",
  countertop: "countertops",
  counters: "countertops",
  quartz: "countertops",
  trim: "carpentry",
  framing: "carpentry",
  plumber: "plumbing",
  plumbers: "plumbing",
  electric: "electrical",
  electrician: "electrical",
  electricians: "electrical",
  carpenter: "carpentry",
  carpenters: "carpentry",
  heating: "hvac",
  cooling: "hvac",
  ac: "hvac",
  landscape: "landscaping",
  landscaper: "landscaping",
  landscapers: "landscaping",
  hardscape: "landscaping",
  demo: "demolition",
  sheetrock: "drywall",
  insulate: "insulation",
  window: "windows",
  "windows-doors": "windows",
  doors: "windows",
};

/** Lower-cased lookup table: keys, TRADE_TYPES names, slugs of those names, aliases. */
const LOOKUP: Record<string, LandingVariantKey> = (() => {
  const t: Record<string, LandingVariantKey> = {};
  for (const key of VARIANT_KEYS) {
    t[key] = key;
    const name = VARIANT_TRADE[key].toLowerCase();
    t[name] = key; // "kitchen & bath", "general contractor"
    t[name.replace(/\s*&\s*/g, "-").replace(/\s+/g, "-")] = key; // "kitchen-bath"
    t[name.replace(/\s*&\s*/g, " and ").replace(/\s+/g, "-")] = key; // "kitchen-and-bath"
    t[name.replace(/[^a-z]+/g, "")] = key; // "kitchenbath", "generalcontractor"
  }
  Object.assign(t, VARIANT_ALIASES);
  return t;
})();

/** `?industry=Fencing`, `?trade=fence`, `?industry=Kitchen%20%26%20Bath`, `?industry=gc`
 *  → the key; anything else → undefined (the default page). Case and
 *  surrounding whitespace do not matter. */
export function resolveLandingVariant(raw: string | string[] | null | undefined): LandingVariantKey | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const norm = value.trim().toLowerCase().replace(/\s+/g, " ");
  return LOOKUP[norm] ?? LOOKUP[norm.replace(/[\s_]+/g, "-")];
}

/** The same resolution from the register form's side: the trade to pre-select. */
export function variantTrade(key: LandingVariantKey | undefined): TradeType | null {
  return key ? VARIANT_TRADE[key] : null;
}

// Every real trade has a key, and every key names a real trade — checked at
// module load so the two lists cannot drift without a thrown error in dev.
if (process.env.NODE_ENV !== "production") {
  const covered = new Set<string>(Object.values(VARIANT_TRADE));
  for (const t of TRADE_TYPES) {
    if (t !== "Other" && !covered.has(t)) throw new Error(`landing-variants: no key for trade "${t}"`);
  }
}

/* ── memory ────────────────────────────────────────────────
   Same pattern as the promo/referral capture (attribution-capture.tsx):
   a 30-day first-party cookie, written by the page once a variant has been
   asked for explicitly. Read by /auth/register (trade pre-select) and the
   Google return only — the landing never reads it (owner, 2026-09-10): the
   page with no `?industry=` is always the default page. */
export const INDUSTRY_COOKIE = "jf_industry";
export const INDUSTRY_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/* ── links ─────────────────────────────────────────────────
   Every register link on a variant page carries the variant, and whatever
   utm_* the visit arrived with, so the register form and the analytics see
   the same campaign the hero did. */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** The utm_* pairs present in a query, values trimmed and capped. */
export function pickUtm(params: Record<string, string | string[] | undefined>): UtmParams {
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value) out[key] = value.slice(0, 120);
  }
  return out;
}

/* The utm_* of the visit, remembered the same way as the trade (30 days,
   first-party) so the Google button, the gold pill and a later visit with no
   parameters still hand the campaign to the signup (CRO stage 1, 2026-09-09).
   Stored as a query string; read back through pickUtm so the keys and caps
   are the same as for a URL. */
export const UTM_COOKIE = "jf_utm";

export function serializeUtm(utm: UtmParams): string {
  const q = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const v = utm[key];
    if (v) q.set(key, v);
  }
  return q.toString();
}

export function parseUtmCookie(value: string | undefined): UtmParams {
  if (!value) return {};
  try {
    return pickUtm(Object.fromEntries(new URLSearchParams(value)));
  } catch {
    return {};
  }
}

/** True when the visit carried any utm_* at all. */
export function hasUtm(utm: UtmParams | undefined): boolean {
  return !!utm && UTM_KEYS.some((k) => !!utm[k]);
}

/** `/auth/register` → `/auth/register?industry=fencing&utm_source=…`.
 *  With neither a variant nor utm it returns `base` untouched, so the default
 *  page's markup is exactly what it was. */
export function signupHref(base: string, opts: { industry?: LandingVariantKey; utm?: UtmParams }): string {
  const q = new URLSearchParams();
  if (opts.industry) q.set("industry", opts.industry);
  for (const key of UTM_KEYS) {
    const v = opts.utm?.[key];
    if (v) q.set(key, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
