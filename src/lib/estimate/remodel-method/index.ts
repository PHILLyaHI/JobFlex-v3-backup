// The REMODEL ESTIMATING METHOD — which parts a brief carries, whether the
// brief is a whole job or part of one, and the block the prompt sends.
//
// Owner, 2026-09-18: estimates missed the work a pro knows is implied ("if
// replacing a sink it needs to understand the under-sink plumbing, or that
// there is a disposal") and a full bathroom in Kirkland came back as eight
// lines. The method (./text.ts) is the implication logic: six connections of
// every fixture, what each brief phrase implies, hidden-work chains, code
// triggers, what is never forgotten, when to ask, what never to write, sanity
// ranges and worked examples. A brief carries the core parts plus only the
// domain parts its words reach (a sink brief: kitchen, not interior).
//
// Scope: a brief that names part of a room ("replace the kitchen sink",
// "tub to shower") must not be held to the full-remodel procedure's step
// count — the procedure becomes a menu and the method's section 2 lists the
// lines. Plain module, no "use client"/"use server".

import { AI_SPECIALTY_GROUPS } from "../legacy/specialties";
import { REMODEL_BATHROOM, REMODEL_CHAINS, REMODEL_INTERIOR, REMODEL_KITCHEN, REMODEL_READ, REMODEL_RULES } from "./text";

export type RemodelPartKey = "read" | "chains" | "rules" | "kitchen" | "bathroom" | "interior";
export type RemodelDomain = "kitchen" | "bathroom" | "interior";
export type RemodelOverrides = Partial<Record<RemodelPartKey, string>>;

export const REMODEL_PARTS: { key: RemodelPartKey; label: string; covers: string; text: string }[] = [
  { key: "read", label: "How to read a brief", covers: "Section 1: the six connections, stated vs implied vs unknown, levels of implied work, the assumption ladder, allowances, room dimensions into quantities, quality tiers, a full remodel in kind", text: REMODEL_READ },
  { key: "kitchen", label: "Kitchen", covers: "Section 2A: what a kitchen brief implies, with worked examples 9.1 and 9.3", text: REMODEL_KITCHEN },
  { key: "bathroom", label: "Bathroom", covers: "Section 2B: what a bathroom brief implies, with worked examples 9.2 and 9.5", text: REMODEL_BATHROOM },
  { key: "interior", label: "Interior, basement, laundry, office, garage, ADU", covers: "Section 2C: walls and openings, floors, walls and ceilings, windows and doors, basement, laundry, office, garage conversion, ADU, insulation, stairs, alarms, with worked example 9.4", text: REMODEL_INTERIOR },
  { key: "chains", label: "Hidden-work chains and code triggers", covers: "Sections 3 and 4", text: REMODEL_CHAINS },
  { key: "rules", label: "Never forgotten, questions, never-lines, sanity ranges", covers: "Sections 5 to 8", text: REMODEL_RULES },
];

export const REMODEL_PART_KEYS: readonly RemodelPartKey[] = REMODEL_PARTS.map((p) => p.key);

export function remodelPartDefault(key: RemodelPartKey): string {
  return REMODEL_PARTS.find((p) => p.key === key)?.text ?? "";
}

const RULE = "═══════════════════════════════════════════════════════════════";
const HEAD = [
  RULE,
  "REMODEL ESTIMATING METHOD",
  RULE,
  "Applies to this brief. It sits beside the PROCEDURE block (the ordered steps of a full job) and the brief rules (a stated quantity or price is binding; work not asked for is an [option]). The procedure says what a full job contains; this method says what this brief implies, what touching one thing forces, and what is never forgotten. Where a method line and a procedure step name the same work, write the method line once.",
].join("\n");

// ── Which parts a brief carries ─────────────────────────────────────────────

/** Remodel specialties: the method always rides; the words pick the rooms. */
const REMODEL_FAMILY: Record<string, RemodelDomain | null> = {
  "kitchen-remodel": "kitchen",
  "bathroom-remodel": "bathroom",
  "interior-remodel": "interior",
  "laundry-room-remodel": "interior",
  "home-office-buildout": "interior",
  "garage-conversion": "interior",
  "adu-builder": "interior",
  "general-contracting": null,
  "design-build": null,
  "tenant-improvement": null,
};

/** A remodeler or general contractor: its ranges are the method's section 8, never a trade's benchmark. */
export const inRemodelFamily = (specialtyId: string) => specialtyId in REMODEL_FAMILY;

/** Groups whose briefs are often a piece of a room remodel: the method rides
 *  only when the brief's words name a kitchen, bath or interior piece. */
const WORD_GATED_GROUPS = new Set(["interior-finishes", "mep", "specialty-surface-decor", "general-professional", "waterproofing-envelope"]);

const GROUP_OF = new Map<string, string>();
for (const g of AI_SPECIALTY_GROUPS) for (const id of g.specialtyIds) if (!GROUP_OF.has(id)) GROUP_OF.set(id, g.id);

const KITCHEN_WORDS =
  /\bkitchen|\b(?:garbage\s+)?disposal\b|\bdish\s?washer|\brange\s+hood|\bhood\b|\bcook\s?top|\bwall\s+oven|\b(?:gas|electric|induction|slide-in|freestanding)\s+range\b|\bover[-\s]the[-\s]range|\bmicrowave|\bfridge|\brefrigerator|\bice[-\s]?maker|\bcounter\s?tops?\b|\bbacksplash|\bpantry|\bisland\b|\bcabinets?\b|\bpot\s+filler/i;
const BATH_WORDS =
  /\bbath(?:room)?s?\b|\bpowder\s+room|\bensuite|\ben-suite|\btoilets?\b|\bvanit(?:y|ies)\b|\blavator(?:y|ies)\b|\b(?:bath)?tubs?\b|\bshowers?\b|\bgrab\s+bars?|\bbath\s+fan|\bexhaust\s+fan|\bhalf\s+bath|\bprimary\s+bath|\bmaster\s+bath/i;
const INTERIOR_STRONG =
  /\bbasement|\blaundry|\bdryer\b|\bwasher\b|\bhome\s+office|\boffice\b|\bgarage\s+(?:conversion|into|to\b)|\bconvert(?:ing)?\s+(?:the\s+|my\s+|a\s+|our\s+)?garage|\badu\b|\bin[-\s]law\b|\baccessory\s+dwelling|\bpopcorn|\bload[-\s]bearing|\bbearing\s+wall|\bopen\s+(?:concept|floor\s*plan|up\s+the)|\b(?:remove|removing|take\s+out|tear\s+out|knock\s+(?:out|down)|open)\b[^.]{0,40}\bwall|\bwall\b[^.]{0,30}\b(?:removal|come\s+out|taken\s+out)|\bdoorway|\bpocket\s+door|\bnew\s+wall|\bpartition|\begress|\bstairs?\b|\brailing|\binsulat|\bclosets?\b|\bbedrooms?\b|\bliving\s+room|\bfamily\s+room|\bden\b|\bhallway|\bbonus\s+room|\bwhole[-\s](?:house|home)\b|\bentire\s+(?:house|home)\b/i;
const INTERIOR_WEAK = /\b(?:lvp|vinyl\s+plank|laminate\s+floor|hardwood|carpet|flooring|floors?)\b|\bdrywall|\bsheetrock|\bpaint(?:ing)?\b|\binterior\b/i;
const WHOLE_HOUSE = /\bwhole[-\s](?:house|home)\b|\bentire\s+(?:house|home)\b|\bfull[-\s](?:house|home)\b|\bwhole[-\s]house\s+remodel/i;

/**
 * The domain parts a brief carries, in section order. Empty when the method
 * does not apply (a roof, a fence, a sewer line, an engineering fee).
 */
export function remodelDomainsFor(description: string, specialtyId: string | null | undefined): RemodelDomain[] {
  const text = description ?? "";
  const id = specialtyId ?? "general-contracting";
  const family = id in REMODEL_FAMILY;
  if (!family && !WORD_GATED_GROUPS.has(GROUP_OF.get(id) ?? "")) return [];
  const out = new Set<RemodelDomain>();
  if (WHOLE_HOUSE.test(text)) {
    out.add("kitchen").add("bathroom").add("interior");
  }
  const kitchen = KITCHEN_WORDS.test(text);
  const bath = BATH_WORDS.test(text);
  // A cabinet or a counter in a bath brief is the vanity's, not a kitchen.
  if (kitchen && !(bath && !/\bkitchen|\bdisposal|\bdish\s?washer|\brange|\bcook\s?top|\bfridge|\brefrigerator|\bisland|\bbacksplash/i.test(text))) out.add("kitchen");
  if (bath) out.add("bathroom");
  // A bare "sink" or "faucet" with no room named: both rooms' lines apply.
  if (!kitchen && !bath && /\bsinks?\b|\bfaucets?\b/i.test(text)) out.add("kitchen").add("bathroom");
  const outside = /\bexterior\b|\bsiding\b|\boutside\b|\bdeck\b|\bfence\b|\broof\b/i.test(text);
  if (INTERIOR_STRONG.test(text) || (!kitchen && !bath && !outside && INTERIOR_WEAK.test(text))) out.add("interior");
  const home = REMODEL_FAMILY[id];
  if (family && home && out.size === 0) out.add(home);
  return (["kitchen", "bathroom", "interior"] as const).filter((d) => out.has(d));
}

// ── Whole job or part of one ─────────────────────────────────────────────────

/** Specialties whose procedure is a whole-room remodel that a brief often
 *  names only a piece of. Every other specialty's procedure IS the job. */
const PARTIAL_ELIGIBLE = new Set(["kitchen-remodel", "bathroom-remodel", "interior-remodel", "laundry-room-remodel", "home-office-buildout", "general-contracting", "design-build"]);

const WHOLE_JOB_WORDS =
  /\bremodel\w*|\brenovat\w*|\bgut(?:ted|ting)?\b|\bmake\s?over\b|\boverhaul\b|\bfrom\s+scratch\b|\bbuild[-\s]?out\b|\bredo\s+(?:the\s+|my\s+|our\s+)?(?:kitchen|bath\w*|basement)|\brebuild\s+(?:the\s+|my\s+|our\s+)?(?:kitchen|bath\w*|basement)|\b(?:full|complete|entire|whole|total)\s+(?:\w+\s+){0,2}(?:kitchen|bath\w*|basement|house|home|interior|remodel\w*|renovation)\b|\bnew\s+(?:kitchen|bathroom)\b|\bfinish(?:ed|ing)?\s+(?:the\s+|my\s+|a\s+|an\s+|our\s+)?(?:\d[\d,]*\s*(?:sq\.?\s*ft|sqft|sf)\s+)?basement|\bbasement\s+finish/i;

export type BriefScope = "full" | "partial";

/**
 * "partial" when a room-remodel specialty was detected but the brief names a
 * piece of the room (a sink, a toilet, a wall, a tub-to-shower): its
 * procedure is then a menu, never a line quota. "full" otherwise.
 */
export function briefScope(description: string, specialtyId: string | null | undefined): BriefScope {
  if (!PARTIAL_ELIGIBLE.has(specialtyId ?? "general-contracting")) return "full";
  return WHOLE_JOB_WORDS.test(description ?? "") ? "full" : "partial";
}

// ── The block ────────────────────────────────────────────────────────────────

/** A domain part is its section 2 text, then its worked examples (### 9.x). */
function splitDomain(text: string): { implies: string; examples: string } {
  const t = (text ?? "").trim();
  const j = t.search(/\n### 9\.\d/);
  return j >= 0 ? { implies: t.slice(0, j).trim(), examples: t.slice(j + 1).trim() } : { implies: t, examples: "" };
}

/**
 * The method block for these domains, the admin's edits applied. Null when no
 * domain applies. Sections keep their numbers so the cross-references hold.
 * A room part left empty drops only section 2 for that room: the core parts
 * (reading the brief, the chains and code, the rules and ranges) still ride.
 */
export function formatRemodelMethod(domains: readonly RemodelDomain[], overrides?: RemodelOverrides | null): string | null {
  if (!domains.length) return null;
  const part = (k: RemodelPartKey) => overrides?.[k]?.trim() || remodelPartDefault(k);
  const rooms = domains.map((d) => splitDomain(part(d))).filter((r) => r.implies);
  const examples = rooms.map((r) => r.examples).filter(Boolean);
  return [
    HEAD,
    part("read"),
    ...(rooms.length ? ["## 2. WHAT THE BRIEF IMPLIES", ...rooms.map((r) => r.implies)] : []),
    part("chains"),
    part("rules"),
    ...(examples.length ? ["## 9. WORKED EXAMPLES", ...examples] : []),
  ].join("\n\n");
}
