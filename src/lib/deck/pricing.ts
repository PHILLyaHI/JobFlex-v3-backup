// THE DECK'S PRICE (2026-10-04) — pure.
//
// The material package (takeoff.ts) priced on the shop's book (rates.ts),
// and the crew's work priced by measure, folded into the lines a proposal
// carries — one line per step of the job, the way JobFlex proposals are
// written ("lines = the job's steps"):
//
//   footings and posts · ledger and flashing · framing · decking · fascia
//   + railing and stairs as allowances, + tear-out of an old deck
//
// Every line carries its MATERIAL and LABOR halves per unit, like the fence
// package (lib/fence/pricing.ts): the proposal can print both to the client,
// and the two halves always add up to the unit price. The package's total is
// the sum of its lines — the same sum the proposal will show, to the cent.
//
// These are SELLING prices (owner, 2026-10-01: an estimator's rates are what
// the shop charges; nothing is marked up again when it becomes a proposal).
//
// EXAMPLE PRICES. Until the shop types its own rates, the package stands on
// the book's example defaults; `exampleShare` says how much of the total
// does, and the studio shows it so nobody sends a client a placeholder.

import { buildDeckFrame, footingDepthIn, type BuildOptions, type DeckFrame } from "./frame";
import { deckTakeoff, type BomLine, type BomStep, type DeckTakeoff } from "./takeoff";
import { deckRate, type ResolvedRate } from "./rates";
import { railType } from "./catalog";
import { GUARD_REQUIRED_ABOVE_IN, LEDGER_FASTENER_LABEL, ftIn, risersFor } from "./codeTables";
import { PLACEMENT_LABEL, sizeWords, type DeckDesign } from "./design";
import type { MarketSnapshot } from "../fence/market";

/** The shop's price book and the job's market. */
export type DeckPriceOptions = BuildOptions;

export interface DeckPackageLine {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unit: "sqft" | "ln ft" | "ea" | "lot";
  /** Per unit, material half. */
  materialCost: number;
  /** Per unit, labor half. */
  laborCost: number;
  /** material + labor, per unit. */
  unitPrice: number;
  /** Sales tax lands on materials; labor is untaxed in most states. */
  taxable: boolean;
}

/** A line of the material list with its price. */
export interface PricedBomLine extends BomLine {
  /** Per unit of `qty`. */
  unitPrice: number;
  cost: number;
  source: ResolvedRate["source"];
}

export interface DeckPackage {
  frame: DeckFrame;
  takeoff: DeckTakeoff;
  bom: PricedBomLine[];
  lines: DeckPackageLine[];
  subtotal: number;
  materialSubtotal: number;
  laborSubtotal: number;
  areaSqFt: number;
  /** subtotal ÷ area — the number a contractor checks a deck price by. */
  pricePerSqFt: number;
  /** The share of the subtotal that still stands on example prices, 0–1. */
  exampleShare: number;
  /** Feet of railing and stair steps in the price (0 when not chosen). */
  railFt: number;
  stairSteps: number;
  market?: MarketSnapshot;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, w: string, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;

/** Feet of railing the price carries: what the contractor typed, or every open edge less the stair openings. */
export function railFeet(frame: DeckFrame): number {
  const { extras } = frame.design;
  if (extras.rail === "none") return 0;
  if (extras.railFt !== "auto") return extras.railFt;
  return Math.max(0, Math.round((frame.openEdgeFt - extras.stairFlights * extras.stairWidthFt) * 10) / 10);
}

/** Steps in the price: the risers one flight needs, times the flights. */
export function stairSteps(design: DeckDesign): number {
  return design.extras.stairFlights > 0 ? design.extras.stairFlights * risersFor(design.heightIn) : 0;
}

export function priceDeck(design: DeckDesign, opts: DeckPriceOptions = {}): DeckPackage {
  const frame = buildDeckFrame(design, opts);
  return priceDeckFrame(frame, opts);
}

export function priceDeckFrame(frame: DeckFrame, opts: DeckPriceOptions = {}): DeckPackage {
  const { design } = frame;
  const takeoff = deckTakeoff(frame);
  const rate = (key: string) => deckRate(key, opts.rates, opts.market);
  let exampleMoney = 0;

  const bom: PricedBomLine[] = takeoff.lines.map((l) => {
    const r = rate(l.rateKey);
    const cost = round2(l.rateQty * r.price * l.factor);
    return { ...l, unitPrice: l.qty > 0 ? round2(cost / l.qty) : 0, cost, source: r.source };
  });
  const stepMaterial = (step: BomStep) => bom.filter((l) => l.step === step).reduce((a, l) => a + l.cost, 0);
  const stepExample = (step: BomStep) => bom.filter((l) => l.step === step && l.source !== "book").reduce((a, l) => a + l.cost, 0);

  const lines: DeckPackageLine[] = [];
  /** One line: the totals for its step, spread over its quantity, the halves adding up to the cent. */
  const line = (l: { id: string; name: string; description?: string; quantity: number; unit: DeckPackageLine["unit"]; material: number; labor: number; exampleMaterial: number; exampleLabor: number }) => {
    if (!(l.quantity > 0) || !(l.material + l.labor > 0)) return;
    const unitPrice = round2((l.material + l.labor) / l.quantity);
    const materialCost = Math.min(unitPrice, round2(l.material / l.quantity));
    lines.push({ id: l.id, name: l.name, description: l.description, quantity: l.quantity, unit: l.unit, materialCost, laborCost: round2(unitPrice - materialCost), unitPrice, taxable: l.material > 0 });
    exampleMoney += l.exampleMaterial + l.exampleLabor;
  };
  /** Labor by measure: a rate times a quantity, and how much of it is still an example. */
  const work = (key: string, qty: number) => {
    const r = rate(key);
    const amount = r.price * qty;
    return { amount, example: r.source === "book" ? 0 : amount };
  };

  const area = Math.round(frame.areaSqFt * 10) / 10;
  const posts = frame.posts.length;
  const poured = frame.posts.filter((p) => p.footing.type === "poured").length;
  const first = frame.posts[0];

  // Footings and posts.
  {
    const w1 = work("labor.footing", poured);
    const w2 = work("labor.pierBlock", posts - poured);
    const pads = [...new Set(frame.posts.filter((p) => p.footing.type === "poured").map((p) => p.footing.padIn))].sort((a, b) => a - b);
    const description = poured
      ? `Poured concrete, ${pads.length > 1 ? `${pads[0]}–${pads[pads.length - 1]}` : pads[0]} in. across and ${footingDepthIn(design)} in. deep; ${first && first.heightIn >= 1 ? `${design.framing.post} posts on stand-off bases` : "beams set on post bases"}`
      : `Precast pier blocks under ${design.framing.post} posts`;
    line({ id: "deck-footings", name: `Footings and posts — ${plural(posts, "footing")}`, description, quantity: posts, unit: "ea", material: stepMaterial("footings"), labor: w1.amount + w2.amount, exampleMaterial: stepExample("footings"), exampleLabor: w1.example + w2.example });
  }

  // Ledger and flashing.
  const ledgerFt = Math.round((frame.ledgers.reduce((a, l) => a + l.lengthIn, 0) / 12) * 10) / 10;
  if (ledgerFt > 0) {
    const w = work("labor.ledger", ledgerFt);
    const spacing = Math.min(...frame.ledgers.map((l) => l.spacingIn).filter((s) => s > 0));
    line({
      id: "deck-ledger",
      name: "Ledger on the house, flashed",
      description: `${LEDGER_FASTENER_LABEL[design.ledger.fastener]}${Number.isFinite(spacing) ? ` every ${spacing} in., two staggered rows` : ""}; cap flashing and membrane; ${frame.hardware.lateralTies} lateral ties`,
      quantity: ledgerFt,
      unit: "ln ft",
      material: stepMaterial("ledger"),
      labor: w.amount,
      exampleMaterial: stepExample("ledger"),
      exampleLabor: w.example,
    });
  }

  // Framing.
  {
    const w = work("labor.framing", area);
    const braces = work("labor.brace", frame.hardware.braces);
    const beamSizes = [...new Set(frame.beams.map((b) => b.spec.size))];
    line({
      id: "deck-framing",
      name: `Framing — ${frame.species.short.toLowerCase()}`,
      description: `${frame.joistSize} joists ${frame.spacingIn} in. on center; ${beamSizes.join(" and ")} ${frame.beamStyle === "flush" ? "flush " : ""}${frame.beams.length === 1 ? "beam" : "beams"}${design.framing.doubleRim ? "; doubled rim and outside joists" : ""}${design.framing.joistTape ? "; joist tape" : ""}; hangers, ties and blocking`,
      quantity: area,
      unit: "sqft",
      material: stepMaterial("framing"),
      labor: w.amount + braces.amount,
      exampleMaterial: stepExample("framing"),
      exampleLabor: w.example + braces.example,
    });
  }

  // Decking.
  {
    const w = work(`labor.decking.${frame.decking.labor}`, area);
    const d = design.decking.diagonal ? work("labor.diagonal", area) : { amount: 0, example: 0 };
    line({
      id: "deck-decking",
      name: `Decking — ${frame.decking.label}`,
      description: `${design.decking.diagonal ? "Laid on the diagonal" : "Laid square to the joists"}, ${takeoff.surface.fastening === "hidden" ? "hidden fasteners" : "deck screws"}`,
      quantity: area,
      unit: "sqft",
      material: stepMaterial("decking"),
      labor: w.amount + d.amount,
      exampleMaterial: stepExample("decking"),
      exampleLabor: w.example + d.example,
    });
  }

  // Fascia.
  if (takeoff.surface.fascia.on) {
    const ft = takeoff.surface.fascia.lf;
    const w = work("labor.fascia", ft);
    line({ id: "deck-fascia", name: "Fascia on the open edges", quantity: ft, unit: "ln ft", material: stepMaterial("fascia"), labor: w.amount, exampleMaterial: stepExample("fascia"), exampleLabor: w.example });
  }

  // Railing — an allowance by the foot until the rail builder lands.
  const railFt = railFeet(frame);
  if (railFt > 0) {
    const t = railType(design.extras.rail);
    if (t.id === "custom") {
      const each = design.extras.railCustomPerFt;
      line({ id: "deck-rail", name: "Railing — custom", description: "Allowance by the foot", quantity: railFt, unit: "ln ft", material: each * railFt * 0.6, labor: each * railFt * 0.4, exampleMaterial: 0, exampleLabor: 0 });
    } else {
      const m = work(`rail.${t.id}.material`, railFt);
      const l = work(`rail.${t.id}.labor`, railFt);
      line({ id: "deck-rail", name: `Railing — ${t.label.toLowerCase()}`, description: "Allowance by the foot: posts, rails, infill and hardware", quantity: railFt, unit: "ln ft", material: m.amount, labor: l.amount, exampleMaterial: m.example, exampleLabor: l.example });
    }
  }

  // Stairs — an allowance by the step.
  const steps = stairSteps(design);
  if (steps > 0) {
    const width = design.extras.stairWidthFt;
    const m = work("stairs.material", steps * width);
    const l = work("stairs.labor", steps * width);
    line({ id: "deck-stairs", name: `Stairs — ${plural(design.extras.stairFlights, "flight")}, ${width} ft wide`, description: `${plural(risersFor(design.heightIn), "riser")} to the ground${design.extras.stairFlights > 1 ? " each" : ""}: stringers, treads, risers and a landing pad`, quantity: steps, unit: "ea", material: m.amount, labor: l.amount, exampleMaterial: m.example, exampleLabor: l.example });
  }

  // Tear-out.
  if (design.extras.demoSqFt > 0) {
    const w = work("labor.demo", design.extras.demoSqFt);
    line({ id: "deck-demo", name: "Tear out and haul away the old deck", quantity: design.extras.demoSqFt, unit: "sqft", material: 0, labor: w.amount, exampleMaterial: 0, exampleLabor: w.example });
  }

  const subtotal = round2(lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  const materialSubtotal = round2(lines.reduce((a, l) => a + l.quantity * l.materialCost, 0));
  const laborSubtotal = round2(lines.reduce((a, l) => a + l.quantity * l.laborCost, 0));
  return {
    frame,
    takeoff,
    bom,
    lines,
    subtotal,
    materialSubtotal,
    laborSubtotal,
    areaSqFt: area,
    pricePerSqFt: area > 0 ? round2(subtotal / area) : 0,
    exampleShare: subtotal > 0 ? Math.min(1, Math.max(0, Math.round((exampleMoney / subtotal) * 1000) / 1000)) : 0,
    railFt,
    stairSteps: steps,
    market: opts.market,
  };
}

/* ------------------------------------------------------------------ */
/*  The client's scope                                                 */
/* ------------------------------------------------------------------ */

/** What the client reads: the work, in plain sentences. No prices, no estimate words. */
export function deckScope(pkg: DeckPackage, where?: string | null): string[] {
  const { frame, takeoff } = pkg;
  const { design } = frame;
  const out: string[] = [];
  const height = design.heightIn >= 24 ? ftIn(design.heightIn) : `${design.heightIn} in.`;
  out.push(`Build a ${sizeWords(design)} deck (${Math.round(pkg.areaSqFt)} sq ft), ${height} above the ground${where ? `, at ${where}` : ""} — ${PLACEMENT_LABEL[design.placement].split(" — ")[0].toLowerCase()}${design.placement === "attached" ? ", carried on a ledger" : design.placement === "beside" ? ", standing on its own posts" : ""}.`);
  const poured = frame.posts.filter((p) => p.footing.type === "poured").length;
  out.push(poured ? `${plural(poured, "poured concrete footing")}, ${footingDepthIn(design)} in. deep, sized for the load each one carries; ${design.framing.post} posts on metal bases, held off the concrete.` : `${plural(frame.posts.length, "precast pier block")} under ${design.framing.post} posts.`);
  const beamSizes = [...new Set(frame.beams.map((b) => b.spec.size))].join(" and ");
  out.push(`Frame in ${frame.species.short.toLowerCase()}: ${frame.joistSize} joists ${frame.spacingIn} in. on center on ${frame.beams.length === 1 ? `a ${beamSizes} beam` : `${beamSizes} beams`}${frame.beamStyle === "flush" ? " set flush with the joists" : ""}, metal hangers and ties at every connection${design.framing.doubleRim ? ", doubled rim and outside joists" : ""}${design.framing.joistTape ? ", protective tape on every joist top" : ""}.`);
  if (frame.ledgers.length) out.push(`Ledger fastened to the house with ${LEDGER_FASTENER_LABEL[design.ledger.fastener]}, flashed above and behind so water cannot reach the house framing, and tied to the house against sideways movement.`);
  out.push(`${frame.decking.label} decking${design.decking.diagonal ? ", laid on the diagonal" : ""}, fastened with ${takeoff.surface.fastening === "hidden" ? "hidden fasteners" : "coated deck screws"}${takeoff.surface.fascia.on ? "; fascia boards on the open edges" : ""}.`);
  if (pkg.railFt > 0) out.push(`${Math.round(pkg.railFt)} ft of ${railType(design.extras.rail).id === "custom" ? "custom" : railType(design.extras.rail).label.toLowerCase()} railing.`);
  if (pkg.stairSteps > 0) out.push(`${plural(design.extras.stairFlights, "flight")} of stairs, ${design.extras.stairWidthFt} ft wide, ${plural(risersFor(design.heightIn), "riser")} to the ground.`);
  if (design.extras.demoSqFt > 0) out.push(`Tear-out and haul-away of the existing deck, ${design.extras.demoSqFt} sq ft.`);
  out.push("Layout squared and checked before digging; site cleaned when the work is done.");
  return out;
}

/** The words under the numbers: what the price assumed and what it leaves to the owner. */
export function deckNotes(pkg: DeckPackage): string[] {
  const { frame } = pkg;
  const { design } = frame;
  const out: string[] = [];
  out.push(`Framing sized from the deck tables of the International Residential Code (Section R507)${frame.beams.some((b) => b.table === "DCA6") ? " and the American Wood Council's DCA 6 guide" : ""} for a ${design.loadPsf} psf load. The building department has the final word; permit fees and engineered drawings are not included.`);
  out.push(`Footings assume soil that bears ${design.soilPsf.toLocaleString("en-US")} psf${design.placement === "attached" ? ` and a frost depth of ${design.frostIn} in.` : ""}; rock, fill or a deeper frost line changes them.`);
  if (design.heightIn > GUARD_REQUIRED_ABOVE_IN && pkg.railFt === 0) out.push("A deck this high needs a guard rail on its open edges; railing is not in this price.");
  if (frame.decking.family === "treated" || frame.decking.family === "softwood" || frame.decking.family === "hardwood") out.push("Wood decking is natural: color change, small checks and some movement with the seasons are normal, not defects. Sealing or staining is the owner's upkeep.");
  out.push("811 marks public utilities; the owner marks private ones — sprinklers, drains, low-voltage, septic. Property lines, setbacks and HOA approval are the owner's to confirm.");
  return out;
}
