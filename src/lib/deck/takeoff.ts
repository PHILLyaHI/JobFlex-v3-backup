// THE MATERIAL PACKAGE (2026-10-04; the roof 2026-10-10) — pure.
//
// Owner: "it calculates the sizes, quantities you need, and it gives you the
// breakdown, the material package." A frame (frame.ts), its boards
// (surface.ts) and its roof (roof.ts) go in; out comes what to load on the
// truck: lumber as the yard sells it (a stock length per stick, short pieces
// cut several from one board), every connector and fastener, flashing for
// the ledgers, tape for the joists, concrete by the bag, sheathing by the
// sheet, shingles by the square, gutter by the foot with its hangers,
// outlets, elbows and caps.
//
// Each line names the price-book row it is bought on (rates.ts) and how
// many of that row's units it is, so pricing.ts prices the list without
// knowing what a joist is — and the list on the screen, the price and the
// proposal read the same quantities.
//
// Lines are filed under the step of the job they belong to (footings, the
// ledger, framing, decking, fascia; then the roof's posts, frame, deck,
// roofing, trim, gutters, ceiling, a slab): the proposal's lines are those
// steps.

import { PIER_BLOCK, STOCK_LENGTHS_FT, type DeckFrame, type Stick, type StickRole } from "./frame";
import { deckSurface, type DeckSurface } from "./surface";
import { LEDGER_FASTENER_LABEL, ftIn, type LedgerFastener } from "./codeTables";
import { POST_HARDWARE_FACTOR, STAINLESS_FACTOR, lumberKey, tubeFactor } from "./rates";
import type { RoofFrame, RoofMember, RoofRole } from "./roof";
import { ROOFING_LABEL, type DeckDesign } from "./design";

export type BomStep = "footings" | "ledger" | "framing" | "decking" | "fascia" | "slab" | "roof-posts" | "roof-frame" | "roof-deck" | "roofing" | "trim" | "ceiling" | "gutters" | "cupola";
export const BOM_STEP_LABEL: Record<BomStep, string> = {
  footings: "Footings and posts",
  ledger: "Ledger and flashing",
  framing: "Framing",
  decking: "Decking",
  fascia: "Fascia",
  slab: "Concrete slab",
  "roof-posts": "Roof posts",
  "roof-frame": "Roof framing",
  "roof-deck": "Roof deck",
  roofing: "Roofing",
  trim: "Fascia, rakes and soffit",
  ceiling: "Ceiling",
  gutters: "Gutters and downspouts",
  cupola: "Cupola",
};
export const BOM_STEP_ORDER: readonly BomStep[] = ["slab", "footings", "ledger", "framing", "decking", "fascia", "roof-posts", "roof-frame", "roof-deck", "roofing", "trim", "ceiling", "gutters", "cupola"];

export interface BomLine {
  id: string;
  step: BomStep;
  kind: "lumber" | "boards" | "hardware" | "concrete" | "roofing";
  label: string;
  /** What is bought, in the unit a yard counts it in. */
  qty: number;
  unit: "pcs" | "ea" | "ft" | "bags" | "sq ft" | "sq";
  note?: string;
  /** The price-book row, how many of ITS units this line is, and a factor on its price. */
  rateKey: string;
  rateQty: number;
  factor: number;
}

export interface DeckTakeoff {
  lines: BomLine[];
  /** The deck boards — null when there is no deck under the roof. */
  surface: DeckSurface | null;
  /** Feet of framing lumber bought, and of it, feet that must be ground-contact stock. */
  framingLf: number;
  groundContactLf: number;
  concreteBags: number;
  footings: number;
  /** The roof's figures, when there is one. */
  roofSquares: number;
  roofAreaSqFt: number;
}

const ROLE_LABEL: Record<StickRole, string> = { joist: "joists", rim: "rim", ledger: "ledger", beam: "beams", post: "posts", blocking: "blocking", brace: "knee braces" };
const ROLE_STEP: Record<StickRole, BomStep> = { joist: "framing", rim: "framing", ledger: "ledger", beam: "framing", post: "footings", blocking: "framing", brace: "framing" };
const LEDGER_RATE: Record<LedgerFastener, string> = { lag: "hw.lag", bolt: "hw.bolt", "bolt-gap": "hw.bolt", ledgerlok: "hw.ledgerlok", sdws: "hw.sdws", anchor: "hw.anchor" };

const ROOF_ROLE_LABEL: Record<RoofRole, string> = {
  "roof-post": "roof posts",
  header: "headers",
  "roof-ledger": "roof ledger",
  rafter: "rafters",
  jack: "jack rafters",
  fly: "fly rafters",
  hip: "hip rafters",
  ridge: "ridge",
  king: "king posts",
  tie: "rafter ties",
  purlin: "purlins",
  slat: "slats",
  "roof-brace": "knee braces",
  ring: "tier ring",
  "tier-post": "tier posts",
  subfascia: "sub-fascia",
  "fascia-eave": "fascia",
  "fascia-rake": "rake boards",
  gutter: "gutter",
  downspout: "downspout",
  cupola: "cupola",
};
const ROOF_ROLE_STEP: Partial<Record<RoofRole, BomStep>> = {
  "roof-post": "roof-posts",
  "roof-brace": "roof-posts",
  header: "roof-frame",
  "roof-ledger": "roof-frame",
  rafter: "roof-frame",
  jack: "roof-frame",
  fly: "roof-frame",
  hip: "roof-frame",
  ridge: "roof-frame",
  king: "roof-frame",
  tie: "roof-frame",
  purlin: "roof-frame",
  slat: "roof-frame",
  ring: "roof-frame",
  "tier-post": "roof-frame",
  subfascia: "trim",
};

/** The shortest stock a stick comes out of. */
export function stockFor(lengthIn: number): number {
  return STOCK_LENGTHS_FT.find((s) => s * 12 >= lengthIn - 0.01) ?? STOCK_LENGTHS_FT[STOCK_LENGTHS_FT.length - 1];
}

/** A member longer than stock is bought in pieces, spliced: how many, and from what stock. */
export function piecesFor(lengthIn: number): { boards: number; stockFt: number } {
  const max = STOCK_LENGTHS_FT[STOCK_LENGTHS_FT.length - 1] * 12;
  const boards = Math.max(1, Math.ceil(lengthIn / max - 1e-9));
  return { boards, stockFt: stockFor(lengthIn / boards) };
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

export function deckTakeoff(frame: DeckFrame | null, roof: RoofFrame | null = null, designIn?: DeckDesign): DeckTakeoff {
  const design = designIn ?? frame?.design;
  if (!design) throw new Error("deckTakeoff needs a frame or a design");
  const species = frame?.species ?? roof?.species;
  const surface = frame ? deckSurface(frame) : null;
  const lines: BomLine[] = [];
  const speciesFactor = species?.priceFactor ?? 1;
  const metal = design.extras.stainless ? STAINLESS_FACTOR : 1;
  const grade = (ground: boolean) => (species?.treated !== false ? (ground ? "ground-contact" : "above-ground") : "heartwood");
  let framingLf = 0;
  let groundContactLf = 0;
  const lumber = (step: BomStep, roleLabel: string, nominal: string, stockFt: number, boards: number, ground: boolean, note?: string, idTag = roleLabel) => {
    if (!(boards > 0)) return;
    framingLf += boards * stockFt;
    if (ground) groundContactLf += boards * stockFt;
    const id = `lumber-${idTag.replace(/\s+/g, "-")}-${nominal}-${stockFt}`;
    const existing = lines.find((l) => l.id === id);
    if (existing) {
      existing.qty += boards;
      existing.rateQty += boards * stockFt;
      return;
    }
    lines.push({ id, step, kind: "lumber", label: `${nominal} × ${stockFt} ft — ${roleLabel}`, qty: boards, unit: "pcs", note: [grade(ground), note].filter(Boolean).join(" · "), rateKey: lumberKey(nominal), rateQty: boards * stockFt, factor: speciesFactor });
  };
  const hw = (id: string, step: BomStep, label: string, qty: number, rateKey: string, factor = 1, unit: BomLine["unit"] = "ea", note?: string) => {
    if (!(qty > 0)) return;
    lines.push({ id, step, kind: "hardware", label, qty, unit, note, rateKey, rateQty: qty, factor: factor * metal });
  };

  let bags = 0;
  let footingCount = 0;

  /* ── The deck ─────────────────────────────────────────────────────── */
  if (frame && surface) {
    const { hardware } = frame;
    // Long sticks: one board each. Short ones (posts, blocking, braces): several from a board.
    const byRole = (role: StickRole) => frame.sticks.filter((s) => s.role === role);
    for (const role of ["ledger", "beam", "joist", "rim"] as const) {
      for (const s of byRole(role)) lumber(ROLE_STEP[role], ROLE_LABEL[role], s.nominal, stockFor(s.lengthIn), 1, s.ground, undefined, role);
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
        lumber(ROLE_STEP[role], ROLE_LABEL[role], g.nominal, pack.stockFt, pack.boards, g.ground, `${g.lengths.length} cut ${max - min < 0.5 ? `at ${ftIn(max)}` : `from ${ftIn(min)} to ${ftIn(max)}`}`, role);
      }
    };
    shorts("post", [8, 10, 12, 16]);
    shorts("blocking", [8, 10, 12, 16]);
    shorts("brace", [8]);

    // Footings (the roof's posts on the deck have theirs here too).
    const poured = frame.posts.filter((p) => p.footing.type === "poured");
    const blocks = frame.posts.length - poured.length;
    bags = poured.reduce((a, p) => a + p.footing.bags, 0);
    footingCount = frame.posts.length;
    const roofPosts = frame.posts.filter((p) => p.roof).length;
    if (bags > 0) lines.push({ id: "concrete", step: "footings", kind: "concrete", label: "Concrete mix, 80-lb bags", qty: bags, unit: "bags", note: `${poured.length} footings${roofPosts ? `, ${roofPosts} of them under the roof's posts` : ""}`, rateKey: "conc.bag", rateQty: bags, factor: 1 });
    const tubes = new Map<number, number>();
    for (const p of poured) tubes.set(p.footing.pierIn, (tubes.get(p.footing.pierIn) ?? 0) + p.footing.tubeFt);
    for (const [diameter, ft] of [...tubes].sort((a, b) => a[0] - b[0])) {
      const qty = Math.ceil(ft - 1e-9);
      if (qty > 0) lines.push({ id: `tube-${diameter}`, step: "footings", kind: "concrete", label: `Form tube, ${diameter} in.`, qty, unit: "ft", rateKey: "conc.tube", rateQty: qty, factor: tubeFactor(diameter) });
    }
    if (blocks > 0) lines.push({ id: "pier-blocks", step: "footings", kind: "concrete", label: `Precast pier blocks, ${PIER_BLOCK.baseIn} in.`, qty: blocks, unit: "ea", rateKey: "conc.pierBlock", rateQty: blocks, factor: 1 });
    const postFactor = POST_HARDWARE_FACTOR[design.framing.post] ?? 1;
    const deckBases = poured.filter((p) => !p.roof).length;
    hw("post-bases", "footings", `Post bases, ${design.framing.post}`, deckBases, "hw.postBase", postFactor);
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
  }

  /* ── The roof ─────────────────────────────────────────────────────── */
  let roofSquares = 0;
  let roofAreaSqFt = 0;
  if (roof) {
    const r = roof.roof;
    const pergola = roof.kind === "pergola";
    roofSquares = roof.squares;
    roofAreaSqFt = roof.roofAreaSqFt;
    const members = (role: RoofRole) => roof.members.filter((m) => m.role === role);
    const oneEach = (role: RoofRole, extraIn = 0) => {
      for (const m of members(role)) {
        const p = piecesFor(m.lengthIn + extraIn);
        lumber(ROOF_ROLE_STEP[role] ?? "roof-frame", ROOF_ROLE_LABEL[role], m.nominal, p.stockFt, p.boards, !!m.ground, p.boards > 1 ? "spliced" : undefined, role);
      }
    };
    const shortsOf = (role: RoofRole, stocks: readonly number[]) => {
      const groups = new Map<string, { nominal: string; ground: boolean; lengths: number[] }>();
      for (const m of members(role) as RoofMember[]) {
        const g = groups.get(m.nominal) ?? { nominal: m.nominal, ground: !!m.ground, lengths: [] };
        g.lengths.push(Math.ceil(m.lengthIn * 4 - 1e-9) / 4);
        groups.set(m.nominal, g);
      }
      for (const g of groups.values()) {
        const pack = packPieces(g.lengths, stocks);
        const min = Math.min(...g.lengths);
        const max = Math.max(...g.lengths);
        lumber(ROOF_ROLE_STEP[role] ?? "roof-frame", ROOF_ROLE_LABEL[role], g.nominal, pack.stockFt, pack.boards, g.ground, `${g.lengths.length} cut ${max - min < 0.5 ? `at ${ftIn(max)}` : `from ${ftIn(min)} to ${ftIn(max)}`}`, role);
      }
    };

    // Posts, bases, caps, braces; footings or anchors under them.
    const postFactor = POST_HARDWARE_FACTOR[r.post] ?? 1;
    if (roof.floor === "deck") {
      // Full-length posts from their footings; the footings themselves are in the deck's list.
      for (const m of members("roof-post")) {
        const p = piecesFor(m.lengthIn);
        lumber("roof-posts", "roof posts", m.nominal, p.stockFt, p.boards, true, p.boards > 1 ? "spliced at the deck" : "footing to header, through the deck", "roof-post");
      }
      hw("roof-post-bases", "roof-posts", `Post bases, ${r.post}`, roof.posts.length, "hw.postBase", postFactor);
    } else {
      shortsOf("roof-post", [8, 10, 12, 16, 20]);
      hw("roof-post-bases", "roof-posts", `Post bases, ${r.post}${roof.floor === "slab" ? ", anchored to the slab" : ""}`, roof.posts.length, "hw.postBase", postFactor);
      if (roof.floor === "slab") hw("roof-anchors", "roof-posts", "Wedge anchors, two per base", roof.hardware.slabAnchors, "hw.wedgeAnchor");
      if (roof.floor === "ground") {
        const pours = roof.posts.map((p) => p.footing).filter((f): f is NonNullable<typeof f> => !!f && f.type === "poured");
        const rb = pours.reduce((a, f) => a + f.bags, 0);
        bags += rb;
        footingCount += roof.posts.length;
        if (rb > 0) lines.push({ id: "roof-concrete", step: "roof-posts", kind: "concrete", label: "Concrete mix, 80-lb bags", qty: rb, unit: "bags", note: `${pours.length} footings under the posts`, rateKey: "conc.bag", rateQty: rb, factor: 1 });
        const tubes = new Map<number, number>();
        for (const f of pours) tubes.set(f.pierIn, (tubes.get(f.pierIn) ?? 0) + f.tubeFt);
        for (const [diameter, ft] of [...tubes].sort((a, b) => a[0] - b[0])) {
          const qty = Math.ceil(ft - 1e-9);
          if (qty > 0) lines.push({ id: `roof-tube-${diameter}`, step: "roof-posts", kind: "concrete", label: `Form tube, ${diameter} in.`, qty, unit: "ft", rateKey: "conc.tube", rateQty: qty, factor: tubeFactor(diameter) });
        }
        hw("roof-anchor-bolts", "roof-posts", "Anchor bolts for the post bases", roof.posts.length, "hw.anchorBolt");
      }
    }
    hw("roof-post-caps", "roof-posts", `Post caps, ${r.post}, header to post`, roof.hardware.postCaps, "hw.postCap", postFactor);
    shortsOf("roof-brace", [8, 10]);
    hw("roof-brace-lags", "roof-posts", "1/2-in. lag screws for the knee braces", roof.hardware.braces * 2, "hw.lag");

    // The frame.
    oneEach("header");
    oneEach("roof-ledger");
    if (roof.ledger) {
      hw("roof-ledger-screws", "roof-frame", "Structural screws, roof ledger to the house", roof.ledger.fasteners, "hw.roofScrew", 1, "ea", "two every 16 in.");
    }
    oneEach("rafter", 4);
    oneEach("jack", 4);
    oneEach("fly", 4);
    oneEach("hip", 6);
    oneEach("ridge");
    oneEach("tie");
    oneEach("ring");
    oneEach("slat");
    shortsOf("king", [8, 10]);
    shortsOf("tier-post", [8]);
    shortsOf("purlin", [8, 10, 12, 16]);
    hw("hurricane-ties", "roof-frame", "Hurricane ties, rafter to header", roof.hardware.hurricaneTies, "hw.hurricaneTie");
    hw("rafter-hangers", "roof-frame", "Rafter hangers", roof.hardware.rafterHangers, "hw.rafterHanger", 1, "ea", roof.ridge?.kind === "beam" ? "at the ridge beam, the hips and the jacks" : "at the hips, the jacks and the ledger");
    hw("king-brackets", "roof-frame", "Post brackets at the king posts", roof.hardware.kingBrackets, "hw.kingBracket");
    hw("wall-hangers", "roof-frame", "Beam hangers at the house wall", roof.hardware.wallHangers, "hw.beamHanger");
    hw("ring-plate", "roof-frame", "Steel compression ring at the peak", roof.hardware.ringPlate, "hw.ringPlate");
    hw("roof-connector-fasteners", "roof-frame", "Connector nails and screws", roof.hardware.hurricaneTies + roof.hardware.rafterHangers + roof.hardware.postCaps + roof.hardware.kingBrackets + roof.hardware.wallHangers, "hw.connectorFasteners", 1, "ea", "one set per connector");
    hw("roof-framing-fasteners", "roof-frame", "Framing nails and screws", Math.round(pergola ? roof.footprintSqFt : roof.roofAreaSqFt), "fast.framing", 1, "sq ft");

    if (!pergola) {
      const shingles = r.roofing === "arch-shingle" || r.roofing === "3tab-shingle" || r.roofing === "designer-shingle";
      const metalRoof = r.roofing === "metal-panel" || r.roofing === "standing-seam";
      // The roof deck.
      if (roof.sheets > 0) lines.push({ id: "sheathing", step: "roof-deck", kind: "roofing", label: "Roof sheathing, 1/2-in. 4x8 sheets", qty: roof.sheets, unit: "ea", note: `${Math.round(roof.roofAreaSqFt)} sq ft of roof, ${Math.round((roof.wasteFactor - 1) * 100)}% waste`, rateKey: "roof.sheathing", rateQty: roof.sheets, factor: 1 });
      if (roof.sheets > 0) lines.push({ id: "underlayment", step: "roof-deck", kind: "roofing", label: "Synthetic underlayment", qty: roof.squares, unit: "sq", rateKey: "roof.underlayment", rateQty: roof.squares, factor: 1 });
      const dripPieces = Math.ceil((roof.eaveFt + roof.rakeFt) / 10 - 1e-9);
      hw("drip-edge", "roof-deck", "Drip edge, 10-ft pieces", dripPieces, "roof.dripEdge", 1 / metal, "ea", `${Math.round(roof.eaveFt)} ft of eave, ${Math.round(roof.rakeFt)} ft of rake`);
      if (roof.wallFt > 0) hw("wall-flashing", "roof-deck", "Step and counter flashing where the roof meets the house", Math.ceil(roof.wallFt + 2), "roof.wallFlashing", 1 / metal, "ft");
      if (!metalRoof) hw("roofing-nails", "roof-deck", "Roofing nails and cap nails", Math.ceil(roof.squares), "roof.nails", 1 / metal, "sq");

      // The roofing.
      if (shingles) {
        const key = r.roofing === "3tab-shingle" ? "roof.shingle.3tab" : r.roofing === "designer-shingle" ? "roof.shingle.designer" : "roof.shingle.arch";
        lines.push({ id: "shingles", step: "roofing", kind: "roofing", label: ROOFING_LABEL[r.roofing], qty: roof.squares, unit: "sq", note: `${Math.ceil(roof.squares * 3)} bundles`, rateKey: key, rateQty: roof.squares, factor: 1 });
        hw("starter", "roofing", "Starter strip along the eaves", Math.ceil(roof.eaveFt), "roof.starter", 1 / metal, "ft");
        const capFt = Math.ceil(roof.hipFt + roof.ridgeFt);
        hw("hip-ridge", "roofing", "Hip and ridge cap", capFt, "roof.hipRidge", 1 / metal, "ft");
      } else if (r.roofing === "cedar-shake") {
        lines.push({ id: "shakes", step: "roofing", kind: "roofing", label: "Cedar shakes", qty: roof.squares, unit: "sq", rateKey: "roof.shake", rateQty: roof.squares, factor: 1 });
        hw("starter", "roofing", "Starter course along the eaves", Math.ceil(roof.eaveFt), "roof.starter", 1 / metal, "ft");
        hw("hip-ridge", "roofing", "Hip and ridge units", Math.ceil(roof.hipFt + roof.ridgeFt), "roof.hipRidge", 1 / metal, "ft");
      } else if (metalRoof) {
        const panelFt = roof.metalPanels.reduce((a, p) => a + p.count * p.lengthFt, 0);
        const seam = r.roofing === "standing-seam";
        lines.push({ id: "metal-panels", step: "roofing", kind: "roofing", label: seam ? "Standing-seam metal panels" : "Metal roof panels, 36-in. cover", qty: seam ? Math.ceil(panelFt * (36 / 16)) : panelFt, unit: "ft", note: roof.metalPanels.map((p) => `${p.count} × ${p.lengthFt} ft`).join(", "), rateKey: seam ? "roof.metal.seam" : "roof.metal.panel", rateQty: seam ? Math.ceil(panelFt * (36 / 16)) : panelFt, factor: 1 });
        hw("metal-trim", "roofing", "Eave, rake, hip and ridge trim", Math.ceil(roof.eaveFt + roof.rakeFt + roof.hipFt + roof.ridgeFt), "roof.metal.trim", 1 / metal, "ft");
        hw("metal-screws", "roofing", "Metal roofing screws and closures", Math.ceil(roof.squares), "roof.metal.screws", 1 / metal, "sq");
      }

      // Fascia and rakes: a 2x sub-fascia across the rafter tails, the finish over it.
      oneEach("subfascia");
      const trimFt = Math.ceil((r.fascia.eave ? roof.eaveFt : 0) + (r.fascia.rake ? roof.rakeFt : 0));
      if (trimFt > 0) {
        const board = roof.rafters.size === "2x10" || roof.rafters.size === "2x12" ? "1x10" : "1x8";
        if (r.fascia.finish === "wood") hw("fascia-boards", "trim", `Fascia and rake boards, primed ${board}`, trimFt, "trim.fascia.wood", board === "1x10" ? 1.25 : 1, "ft");
        else if (r.fascia.finish === "pvc") hw("fascia-boards", "trim", `Fascia and rake boards, PVC ${board}`, trimFt, "trim.fascia.pvc", board === "1x10" ? 1.25 : 1, "ft");
        else hw("fascia-wrap", "trim", "Aluminum fascia wrap over the sub-fascia", trimFt, "trim.fascia.wrap", 1 / metal, "ft");
      }
      if (roof.soffitSqFt > 0) hw("soffit", "trim", "Vented soffit panels", Math.ceil(roof.soffitSqFt * 1.1), "trim.soffit", 1 / metal, "sq ft", `${roof.soffitSqFt} sq ft under the eaves`);

      // The ceiling.
      if (roof.ceilingSqFt > 0) {
        const tg = r.ceiling === "tongue-groove";
        lines.push({ id: "ceiling", step: "ceiling", kind: "boards", label: tg ? "Tongue-and-groove ceiling boards" : "Beadboard ceiling panels", qty: Math.ceil(roof.ceilingSqFt * 1.1), unit: "sq ft", note: "10% waste", rateKey: tg ? "trim.ceiling.tg" : "trim.ceiling.bead", rateQty: Math.ceil(roof.ceilingSqFt * 1.1), factor: 1 });
      }

      // Gutters.
      if (roof.gutters) {
        const g = roof.gutters;
        const key = g.kind === "k5" ? "gut.k5" : g.kind === "k6" ? "gut.k6" : g.kind === "half-round-alum" ? "gut.halfRoundAlum" : "gut.halfRoundCopper";
        const copper = g.kind === "half-round-copper";
        const label = g.kind === "k5" ? "5-in. K-style aluminum gutter" : g.kind === "k6" ? "6-in. K-style aluminum gutter" : copper ? "Half-round copper gutter" : "Half-round aluminum gutter";
        hw("gutter", "gutters", label, Math.ceil(g.lf), key, 1 / metal, "ft", `${g.runs === 1 ? "one run" : `${g.runs} runs`}${g.closed ? " around the roof" : ""}`);
        hw("downspouts", "gutters", copper ? "Round copper downspouts" : `${g.downspoutSize} downspouts`, g.downspoutFt, copper ? "gut.downspoutCopper" : g.downspoutSize === "2x3" ? "gut.downspout23" : "gut.downspout34", 1 / metal, "ft", `${g.downspouts} downspouts`);
        hw("gutter-hangers", "gutters", "Hidden hangers", g.hangers, "gut.hanger", copper ? 2.5 : 1);
        hw("gutter-caps", "gutters", "End caps", g.endCaps, "gut.endCap", copper ? 3 : 1);
        hw("gutter-corners", "gutters", "Mitred corners", g.corners, "gut.corner", copper ? 3 : 1);
        hw("gutter-outlets", "gutters", "Downspout outlets", g.downspouts, "gut.outlet", copper ? 3 : 1);
        hw("gutter-elbows", "gutters", "Downspout elbows", g.elbows, "gut.elbow", copper ? 3 : 1);
        hw("gutter-splash", "gutters", "Splash blocks or extensions", g.downspouts, "gut.splash");
        if (g.guardsLf > 0) hw("gutter-guards", "gutters", "Gutter guards", Math.ceil(g.guardsLf), "gut.guard", 1 / metal, "ft");
      }

      if (r.cupola) hw("cupola", "cupola", "Cupola, 30 in., louvers and roof", 1, "cupola.kit", 1 / metal, "ea", "set at the peak");
    }

    // A slab under it all.
    if (roof.slab) lines.push({ id: "slab", step: "slab", kind: "concrete", label: "Concrete slab, 4 in., on a gravel base with mesh", qty: roof.slab.sqFt, unit: "sq ft", note: `about ${roof.slab.cuYd} cu yd`, rateKey: "conc.slab", rateQty: roof.slab.sqFt, factor: 1 });
  }

  lines.sort((a, b) => BOM_STEP_ORDER.indexOf(a.step) - BOM_STEP_ORDER.indexOf(b.step));
  return { lines, surface, framingLf, groundContactLf, concreteBags: bags, footings: footingCount, roofSquares, roofAreaSqFt };
}
