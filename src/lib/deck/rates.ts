// THE DECK PRICE BOOK (2026-10-04) — pure.
//
// One row for everything a deck is bought or built by: lumber by the foot,
// deck boards by the foot, each connector, a bag of concrete, and the crew's
// work BY MEASURE (a square foot framed, a footing set, a foot of ledger
// hung) — never by the hour, the same way the fence and roof estimators
// price work.
//
// EVERY DEFAULT HERE IS AN EXAMPLE. No public source gave a deck material
// price or a labor rate that could be checked (2026-10-04 research), and the
// owner asked for placeholders he can replace. So the studio marks a price
// that still stands on a default as "example", and the shop's own number —
// typed once, saved in its book — is what the job is priced at from then on.
//
// SPARSE, like the fence book (lib/fence/rates.ts): only what the shop
// changed is stored, a value equal to the default is dropped, and a rate
// nobody touched keeps following the platform's default.
//
// A default is scaled to the job's market (state + ZIP, lib/fence/market);
// a rate the contractor typed is the number they charge, taken as typed.

import { DECKING, RAIL_TYPES } from "./catalog";
import { laborFactor, type MarketBasis, type MarketSnapshot } from "../fence/market";

export type DeckRateGroup = "lumber" | "decking" | "hardware" | "concrete" | "labor" | "allowance";
export const DECK_RATE_GROUP_LABEL: Record<DeckRateGroup, string> = {
  lumber: "Framing lumber",
  decking: "Deck boards and fascia",
  hardware: "Connectors and fasteners",
  concrete: "Footings",
  labor: "Labor, by measure",
  allowance: "Railing and stairs",
};

export interface DeckRateDef {
  key: string;
  label: string;
  /** What one price buys: "ft", "ea", "sq ft", "bag". */
  unit: string;
  /** The EXAMPLE default, national. */
  price: number;
  group: DeckRateGroup;
  /** What moves it from market to market: a commodity basis, the labor index, or nothing. */
  basis: MarketBasis | "labor" | null;
  min: number;
  max: number;
}

const lumber = (nominal: string, price: number): DeckRateDef => ({ key: `lf.${nominal}`, label: `${nominal} framing lumber`, unit: "ft", price, group: "lumber", basis: "vinyl", min: 0.1, max: 80 });
const hw = (key: string, label: string, price: number, unit = "ea", max = 400): DeckRateDef => ({ key: `hw.${key}`, label, unit, price, group: "hardware", basis: "metal", min: 0.01, max });
const labor = (key: string, label: string, unit: string, price: number, max = 400): DeckRateDef => ({ key: `labor.${key}`, label, unit, price, group: "labor", basis: "labor", min: 0.1, max });

/**
 * Framing lumber is priced on the freight-only basis ("vinyl" in the market
 * tables), not on the pine or cedar basis: a shop frames in the species its
 * own region mills, so the lumber is local wherever the deck is.
 */
export const DECK_RATES: readonly DeckRateDef[] = [
  lumber("2x4", 0.75),
  lumber("2x6", 1.1),
  lumber("2x8", 1.5),
  lumber("2x10", 2.1),
  lumber("2x12", 2.8),
  lumber("4x4", 1.9),
  lumber("4x6", 3.6),
  lumber("4x8", 6),
  lumber("4x10", 7.5),
  lumber("4x12", 9.5),
  lumber("6x6", 5.5),
  lumber("8x8", 11),
  ...DECKING.map((d): DeckRateDef => ({ key: `deck.${d.id}`, label: d.label, unit: "ft", price: d.pricePerLf, group: "decking", basis: d.basis, min: 0.2, max: 60 })),
  { key: "fascia.wood", label: "Fascia board, wood", unit: "ft", price: 2.2, group: "decking", basis: "cedar", min: 0.2, max: 60 },
  { key: "fascia.composite", label: "Fascia board, composite or PVC", unit: "ft", price: 5, group: "decking", basis: "vinyl", min: 0.2, max: 60 },
  { key: "fast.screws", label: "Deck screws, per square foot of deck", unit: "sq ft", price: 0.35, group: "hardware", basis: "metal", min: 0.01, max: 20 },
  { key: "fast.hidden", label: "Hidden clips and screws, per square foot of deck", unit: "sq ft", price: 1.1, group: "hardware", basis: "metal", min: 0.01, max: 20 },
  { key: "fast.framing", label: "Framing nails and screws, per square foot of deck", unit: "sq ft", price: 0.25, group: "hardware", basis: "metal", min: 0.01, max: 20 },
  hw("hanger", "Joist hanger", 2.5),
  hw("hangerDouble", "Double joist hanger", 5.5),
  hw("tie", "Hurricane tie, joist to beam", 1.2),
  hw("connectorFasteners", "Nails or screws for one connector", 0.6),
  hw("postBase", "Post base, 6x6", 18),
  hw("postCap", "Post cap, 6x6", 14),
  hw("anchorBolt", "Anchor bolt for a post base", 2.5),
  hw("lag", "1/2-in. lag screw with washer", 1.4),
  hw("bolt", "1/2-in. through-bolt, nut and washers", 2.4),
  hw("ledgerlok", "LedgerLOK structural screw", 1.1),
  hw("sdws", "Simpson SDWS structural screw", 1),
  hw("anchor", "1/2-in. concrete anchor", 3.5),
  hw("holddown", "Lateral hold-down, 1,500 lb, with rod", 28),
  hw("holddownSmall", "Lateral tie, 750 lb", 9),
  hw("structScrew", "Structural wood screw, rim to joist", 0.45),
  hw("flashing", "Ledger cap flashing", 2.5, "ft"),
  hw("membrane", "Flashing membrane tape", 0.9, "ft"),
  hw("joistTape", "Joist tape", 0.35, "ft"),
  { key: "conc.bag", label: "Concrete, 80-lb bag", unit: "bag", price: 7, group: "concrete", basis: "vinyl", min: 1, max: 60 },
  { key: "conc.tube", label: "Form tube, 12 in. (wider tubes in proportion)", unit: "ft", price: 3.9, group: "concrete", basis: "vinyl", min: 0.2, max: 80 },
  { key: "conc.pierBlock", label: "Precast pier block", unit: "ea", price: 14, group: "concrete", basis: "vinyl", min: 1, max: 200 },
  labor("framing", "Framing — beams, joists, rim, blocking, hardware", "sq ft", 9),
  labor("decking.wood", "Laying softwood deck boards", "sq ft", 6),
  labor("decking.hardwood", "Laying hardwood deck boards", "sq ft", 11),
  labor("decking.composite", "Laying composite deck boards", "sq ft", 8),
  labor("decking.pvc", "Laying PVC deck boards", "sq ft", 8),
  labor("decking.aluminum", "Laying aluminum planks", "sq ft", 9),
  labor("diagonal", "Extra for boards laid on the diagonal", "sq ft", 1.5),
  labor("footing", "Dig, form and pour one footing", "ea", 85, 2000),
  labor("pierBlock", "Set one pier block", "ea", 20, 2000),
  labor("ledger", "Ledger — siding off, flash, fasten", "ft", 6),
  labor("fascia", "Fascia", "ft", 4),
  labor("brace", "Cut and fit one knee brace", "ea", 15, 2000),
  labor("demo", "Tear out and haul away an old deck", "sq ft", 4),
  ...RAIL_TYPES.filter((r) => r.id !== "none" && r.id !== "custom").flatMap((r): DeckRateDef[] => [
    { key: `rail.${r.id}.material`, label: `Railing, ${r.label.toLowerCase()} — material`, unit: "ft", price: r.perFt[0], group: "allowance", basis: r.basis, min: 0.5, max: 1500 },
    { key: `rail.${r.id}.labor`, label: `Railing, ${r.label.toLowerCase()} — labor`, unit: "ft", price: r.perFt[1], group: "allowance", basis: "labor", min: 0.5, max: 1500 },
  ]),
  { key: "stairs.material", label: "Stairs — material, per step per foot of width", unit: "step·ft", price: 14, group: "allowance", basis: "vinyl", min: 0.5, max: 500 },
  { key: "stairs.labor", label: "Stairs — labor, per step per foot of width", unit: "step·ft", price: 20, group: "allowance", basis: "labor", min: 0.5, max: 500 },
];

const BY_KEY = new Map(DECK_RATES.map((r) => [r.key, r]));

/** A post base or cap for another post size, against the 6x6's price. */
export const POST_HARDWARE_FACTOR: Record<string, number> = { "4x4": 0.55, "4x6": 0.7, "6x6": 1, "8x8": 1.8 };
/** Stainless connectors and fasteners, against galvanized — an EXAMPLE factor. */
export const STAINLESS_FACTOR = 2.2;
/** A form tube wider than 12 in., priced in proportion to its width. */
export const tubeFactor = (diameterIn: number) => Math.max(0.6, diameterIn / 12);

/** The shop's own numbers: only the rows it changed. */
export type DeckRateBook = Record<string, number>;

/** Anything → a clean sparse book: known rows, inside their rails, not restating the default. */
export function sanitizeDeckRateBook(raw: unknown): DeckRateBook {
  const out: DeckRateBook = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const def = BY_KEY.get(key);
    const n = Number(val);
    if (!def || val === null || val === "" || !Number.isFinite(n)) continue;
    if (n < def.min || n > def.max) continue;
    const rounded = Math.round(n * 100) / 100;
    if (Math.abs(rounded - def.price) < 0.005) continue;
    out[key] = rounded;
  }
  return out;
}

export interface ResolvedRate {
  price: number;
  /** "book": the shop typed it. "market": the example, scaled to the job's market. "example": the example as is. */
  source: "book" | "market" | "example";
}

/** What one row prices at on this job. An unknown key prices at zero. */
export function deckRate(key: string, book?: DeckRateBook, market?: MarketSnapshot): ResolvedRate {
  const def = BY_KEY.get(key);
  if (!def) return { price: 0, source: "example" };
  const own = book?.[key];
  if (typeof own === "number" && Number.isFinite(own) && own >= def.min && own <= def.max) return { price: own, source: "book" };
  const factor = !market || def.basis === null ? 1 : def.basis === "labor" ? laborFactor(market) : (market.material[def.basis] ?? 1);
  return factor === 1 ? { price: def.price, source: "example" } : { price: Math.round(def.price * factor * 100) / 100, source: "market" };
}

export function deckRateDef(key: string): DeckRateDef | undefined {
  return BY_KEY.get(key);
}

/** The whole book as rows, for the rate card: every row, the shop's number where it set one. */
export function deckRateRows(book?: DeckRateBook): Array<DeckRateDef & { own: number | null }> {
  return DECK_RATES.map((r) => ({ ...r, own: typeof book?.[r.key] === "number" ? book[r.key] : null }));
}

/** The lumber row a member is bought on: "2-2x10" and "2x10" are both 2x10 stock. */
export function lumberKey(nominal: string): string {
  return `lf.${nominal.replace(/^\d-/, "")}`;
}
