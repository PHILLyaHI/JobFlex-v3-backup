// THE MATERIAL PACKAGE (2026-10-04) — pure.
//
// Owner: "it calculates the sizes, quantities you need, and it gives you the
// breakdown, the material package." A frame (frame.ts) and its boards
// (surface.ts) go in; out comes what to load on the truck: lumber as the
// yard sells it (a stock length per stick, short pieces cut several from
// one board), every connector and fastener, flashing for the ledger, tape
// for the joists, concrete by the bag.
//
// Each line names the price-book row it is bought on (rates.ts) and how
// many of that row's units it is, so pricing.ts prices the list without
// knowing what a joist is — and the list on the screen, the price and the
// proposal read the same quantities.
//
// Lines are filed under the step of the job they belong to (footings, the
// ledger, framing, decking, fascia): the proposal's lines are those steps.

import { PIER_BLOCK, STOCK_LENGTHS_FT, type DeckFrame, type Stick, type StickRole } from "./frame";
import { deckSurface, type DeckSurface } from "./surface";
import { LEDGER_FASTENER_LABEL, ftIn, type LedgerFastener } from "./codeTables";
import { POST_HARDWARE_FACTOR, STAINLESS_FACTOR, lumberKey, tubeFactor } from "./rates";

export type BomStep = "footings" | "ledger" | "framing" | "decking" | "fascia";
export const BOM_STEP_LABEL: Record<BomStep, string> = {
  footings: "Footings and posts",
  ledger: "Ledger and flashing",
  framing: "Framing",
  decking: "Decking",
  fascia: "Fascia",
};

export interface BomLine {
  id: string;
  step: BomStep;
  kind: "lumber" | "boards" | "hardware" | "concrete";
  label: string;
  /** What is bought, in the unit a yard counts it in. */
  qty: number;
  unit: "pcs" | "ea" | "ft" | "bags" | "sq ft";
  note?: string;
  /** The price-book row, how many of ITS units this line is, and a factor on its price. */
  rateKey: string;
  rateQty: number;
  factor: number;
}

export interface DeckTakeoff {
  lines: BomLine[];
  surface: DeckSurface;
  /** Feet of framing lumber bought, and of it, feet that must be ground-contact stock. */
  framingLf: number;
  groundContactLf: number;
  concreteBags: number;
  footings: number;
}

const ROLE_LABEL: Record<StickRole, string> = { joist: "joists", rim: "rim", ledger: "ledger", beam: "beams", post: "posts", blocking: "blocking", brace: "knee braces" };
const ROLE_STEP: Record<StickRole, BomStep> = { joist: "framing", rim: "framing", ledger: "ledger", beam: "framing", post: "footings", blocking: "framing", brace: "framing" };
const LEDGER_RATE: Record<LedgerFastener, string> = { lag: "hw.lag", bolt: "hw.bolt", "bolt-gap": "hw.bolt", ledgerlok: "hw.ledgerlok", sdws: "hw.sdws", anchor: "hw.anchor" };

/** The shortest stock a stick comes out of. */
export function stockFor(lengthIn: number): number {
  return STOCK_LENGTHS_FT.find((s) => s * 12 >= lengthIn - 0.01) ?? STOCK_LENGTHS_FT[STOCK_LENGTHS_FT.length - 1];
}

/**
 * Short pieces cut from longer boards: the stock length that buys the least
 * lumber, the pieces laid into boards longest first (a saw kerf between).
 */
export function packPieces(lengthsIn: readonly number[], stocksFt: readonly number[]): { stockFt: number; boards: number } {
  const KERF = 0.125;
  const sorted = [...lengthsIn].sort((p, q) => q - p);
  let best: { stockFt: number; boards: number } | null = null;
  for (const s of stocksFt) {
    const room = s * 12;
    if (sorted.length && sorted[0] > room + 1e-6) continue;
    const bins: number[] = [];
    for (const len of sorted) {
      const i = bins.findIndex((left) => left >= len - 1e-6);
      if (i >= 0) bins[i] -= len + KERF;
      else bins.push(room - len - KERF);
    }
    if (!best || bins.length * s < best.boards * best.stockFt) best = { stockFt: s, boards: bins.length };
  }
  return best ?? { stockFt: stocksFt[stocksFt.length - 1], boards: lengthsIn.length };
}

export function deckTakeoff(frame: DeckFrame): DeckTakeoff {
  const { design, species, hardware } = frame;
  const surface = deckSurface(frame);
  const lines: BomLine[] = [];
  const speciesFactor = species.priceFactor;
  const metal = design.extras.stainless ? STAINLESS_FACTOR : 1;
  const grade = (ground: boolean) => (species.treated ? (ground ? "ground-contact" : "above-ground") : "heartwood");
  let framingLf = 0;
  let groundContactLf = 0;
  const lumber = (role: StickRole, nominal: string, stockFt: number, boards: number, ground: boolean, note?: string) => {
    if (!(boards > 0)) return;
    framingLf += boards * stockFt;
    if (ground) groundContactLf += boards * stockFt;
    const id = `lumber-${role}-${nominal}-${stockFt}`;
    const existing = lines.find((l) => l.id === id);
    if (existing) {
      existing.qty += boards;
      existing.rateQty += boards * stockFt;
      return;
    }
    lines.push({ id, step: ROLE_STEP[role], kind: "lumber", label: `${nominal} × ${stockFt} ft — ${ROLE_LABEL[role]}`, qty: boards, unit: "pcs", note: [grade(ground), note].filter(Boolean).join(" · "), rateKey: lumberKey(nominal), rateQty: boards * stockFt, factor: speciesFactor });
  };

  // Long sticks: one board each. Short ones (posts, blocking, braces): several from a board.
  const byRole = (role: StickRole) => frame.sticks.filter((s) => s.role === role);
  for (const role of ["ledger", "beam", "joist", "rim"] as const) {
    for (const s of byRole(role)) lumber(role, s.nominal, stockFor(s.lengthIn), 1, s.ground);
  }
  const shorts = (role: StickRole, stocks: readonly number[]) => {
    const groups = new Map<string, { nominal: string; ground: boolean; lengths: number[] }>();
    for (const s of byRole(role) as Stick[]) {
      const g = groups.get(s.nominal) ?? { nominal: s.nominal, ground: s.ground, lengths: [] };
      // To the quarter inch above, so two cuts a hair apart are one cut.
      g.lengths.push(Math.ceil(s.lengthIn * 4 - 1e-9) / 4);
      groups.set(s.nominal, g);
    }
    for (const g of groups.values()) {
      const pack = packPieces(g.lengths, stocks);
      const min = Math.min(...g.lengths);
      const max = Math.max(...g.lengths);
      lumber(role, g.nominal, pack.stockFt, pack.boards, g.ground, `${g.lengths.length} cut ${max - min < 0.5 ? `at ${ftIn(max)}` : `from ${ftIn(min)} to ${ftIn(max)}`}`);
    }
  };
  shorts("post", [8, 10, 12, 16]);
  shorts("blocking", [8, 10, 12, 16]);
  shorts("brace", [8]);

  const hw = (id: string, step: BomStep, label: string, qty: number, rateKey: string, factor = 1, unit: BomLine["unit"] = "ea", note?: string) => {
    if (!(qty > 0)) return;
    lines.push({ id, step, kind: "hardware", label, qty, unit, note, rateKey, rateQty: qty, factor: factor * metal });
  };

  // Footings.
  const poured = frame.posts.filter((p) => p.footing.type === "poured");
  const blocks = frame.posts.length - poured.length;
  const bags = poured.reduce((a, p) => a + p.footing.bags, 0);
  if (bags > 0) lines.push({ id: "concrete", step: "footings", kind: "concrete", label: "Concrete mix, 80-lb bags", qty: bags, unit: "bags", note: `${poured.length} footings`, rateKey: "conc.bag", rateQty: bags, factor: 1 });
  const tubes = new Map<number, number>();
  for (const p of poured) tubes.set(p.footing.pierIn, (tubes.get(p.footing.pierIn) ?? 0) + p.footing.tubeFt);
  for (const [diameter, ft] of [...tubes].sort((a, b) => a[0] - b[0])) {
    const qty = Math.ceil(ft - 1e-9);
    if (qty > 0) lines.push({ id: `tube-${diameter}`, step: "footings", kind: "concrete", label: `Form tube, ${diameter} in.`, qty, unit: "ft", rateKey: "conc.tube", rateQty: qty, factor: tubeFactor(diameter) });
  }
  if (blocks > 0) lines.push({ id: "pier-blocks", step: "footings", kind: "concrete", label: `Precast pier blocks, ${PIER_BLOCK.baseIn} in.`, qty: blocks, unit: "ea", rateKey: "conc.pierBlock", rateQty: blocks, factor: 1 });
  const postFactor = POST_HARDWARE_FACTOR[design.framing.post] ?? 1;
  hw("post-bases", "footings", `Post bases, ${design.framing.post}`, poured.length, "hw.postBase", postFactor);
  hw("anchor-bolts", "footings", "Anchor bolts for the post bases", poured.length, "hw.anchorBolt");
  hw("post-caps", "footings", `Post caps, ${design.framing.post}`, hardware.postCaps, "hw.postCap", postFactor);

  // The ledger: its fasteners, the flashing over it, the membrane behind and above, the ties to the house.
  const ledgerFasteners = frame.ledgers.reduce((a, l) => a + l.fasteners, 0);
  if (frame.ledgers.length) {
    const f = design.ledger.fastener;
    const spacings = [...new Set(frame.ledgers.map((l) => l.spacingIn))].filter((s) => s > 0);
    hw("ledger-fasteners", "ledger", LEDGER_FASTENER_LABEL[f].replace(/^(.)/, (c) => c.toUpperCase()), ledgerFasteners, LEDGER_RATE[f], 1, "ea", spacings.length ? `every ${spacings.map((s) => `${s} in.`).join(" / ")}, two staggered rows` : undefined);
    // Flashing runs 4 in. past each end of every ledger; the membrane goes on twice.
    const flashFt = Math.ceil(frame.ledgers.reduce((a, l) => a + l.lengthIn + 8, 0) / 12 - 1e-9);
    hw("flashing", "ledger", "Ledger cap flashing", flashFt, "hw.flashing", 1 / metal, "ft", "4 in. past each end");
    hw("membrane", "ledger", "Flashing membrane tape", flashFt * 2, "hw.membrane", 1 / metal, "ft", "behind the ledger and over its top");
    if (hardware.lateralTies === 4) hw("lateral-ties", "ledger", "Lateral ties to the house, 750 lb", 4, "hw.holddownSmall");
    else hw("lateral-ties", "ledger", "Lateral hold-downs to the house, 1,500 lb", hardware.lateralTies, "hw.holddown");
  }

  // Framing connectors.
  hw("hangers", "framing", `Joist hangers, ${frame.joistSize}`, hardware.hangers, "hw.hanger");
  hw("double-hangers", "framing", `Double joist hangers, ${frame.joistSize}`, hardware.doubleHangers, "hw.hangerDouble");
  hw("ties", "framing", "Hurricane ties, joist to beam", hardware.ties, "hw.tie");
  hw("connector-fasteners", "framing", "Connector nails and screws", hardware.hangers + 2 * hardware.doubleHangers + hardware.ties + hardware.postCaps + poured.length, "hw.connectorFasteners", 1, "ea", "one set per connector");
  hw("rim-screws", "framing", "Structural screws, rim to joists", hardware.rimScrews, "hw.structScrew", 1, "ea", "three in each joist end");
  hw("brace-lags", "framing", "1/2-in. lag screws for the knee braces", hardware.braces * 2, "hw.lag", 1, "ea", "one at each end of a brace");
  hw("framing-fasteners", "framing", "Framing nails and screws", Math.round(frame.areaSqFt), "fast.framing", 1, "sq ft");
  if (design.framing.joistTape) {
    // Tape on every top that a board sits on: joists, rim, ledger, and the beams.
    const topsIn = frame.sticks.filter((s) => s.role === "joist" || s.role === "rim" || s.role === "ledger" || s.role === "beam").reduce((a, s) => a + s.lengthIn, 0);
    hw("joist-tape", "framing", "Joist tape", Math.ceil(topsIn / 12 / 10 - 1e-9) * 10, "hw.joistTape", 1 / metal, "ft", "joists, rim, ledger and beam tops");
  }

  // Boards and what holds them down.
  for (const s of surface.stock) {
    lines.push({ id: `boards-${s.lengthFt}`, step: "decking", kind: "boards", label: `${surface.product.label} × ${s.lengthFt} ft`, qty: s.count, unit: "pcs", rateKey: `deck.${surface.product.id}`, rateQty: s.count * s.lengthFt, factor: 1 });
  }
  hw("deck-fasteners", "decking", surface.fastening === "hidden" ? "Hidden clips and screws" : "Deck screws", Math.round(frame.areaSqFt), surface.fastening === "hidden" ? "fast.hidden" : "fast.screws", 1, "sq ft", surface.fastening === "hidden" ? `about ${surface.crossings} clips` : `about ${surface.crossings * 2} screws`);
  if (surface.fascia.on) {
    const nominal = surface.fascia.heightIn > 9.5 ? 12 : surface.fascia.heightIn > 7.5 ? 10 : 8;
    lines.push({ id: "fascia", step: "fascia", kind: "boards", label: `Fascia, ${surface.fascia.kind === "composite" ? "composite" : "wood"} 1x${nominal} × 12 ft`, qty: surface.fascia.boards, unit: "pcs", note: `${Math.round(surface.fascia.lf)} ft of open edge`, rateKey: surface.fascia.kind === "composite" ? "fascia.composite" : "fascia.wood", rateQty: surface.fascia.boards * 12, factor: nominal / 10 });
  }

  const order: BomStep[] = ["footings", "ledger", "framing", "decking", "fascia"];
  lines.sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
  return { lines, surface, framingLf, groundContactLf, concreteBags: bags, footings: frame.posts.length };
}
