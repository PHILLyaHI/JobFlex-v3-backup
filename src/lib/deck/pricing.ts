// THE DECK'S PRICE (2026-10-04; roofs 2026-10-10) — pure.
//
// The material package (takeoff.ts) priced on the shop's book (rates.ts),
// and the crew's work priced by measure, folded into the lines a proposal
// carries — one line per step of the job, the way JobFlex proposals are
// written ("lines = the job's steps"):
//
//   footings and posts · ledger and flashing · framing · decking · fascia
//   + the roof: posts · framing · roof deck · roofing · fascia and soffit ·
//     ceiling · gutters · a slab under a gazebo · a cupola
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

import { PIER_BLOCK, buildDeckFrame, footingDepthIn, type BuildOptions, type DeckFrame } from "./frame";
import { buildRoofFrame, roofPostsForDeck, roofWords, type RoofFrame } from "./roof";
import { deckTakeoff, type BomLine, type BomStep, type DeckTakeoff } from "./takeoff";
import { deckRate, type ResolvedRate } from "./rates";
import { framingSpecies, railType } from "./catalog";
import { GUARD_REQUIRED_ABOVE_IN, LEDGER_FASTENER_LABEL, ftIn, risersFor } from "./codeTables";
import { CEILING_LABEL, FASCIA_FINISH_LABEL, GUTTER_LABEL, PLACEMENT_LABEL, ROOFING_LABEL, ROOF_KIND_LABEL, hasDeck, hasRoof, shapeZones, sizeWords, structureWords, type DeckDesign } from "./design";
import { RULE_RAFTER } from "./roofTables";
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
  design: DeckDesign;
  /** The deck's frame — null for a gazebo or a pergola on a slab or the ground. */
  frame: DeckFrame | null;
  /** The roof — null for a bare deck. */
  roof: RoofFrame | null;
  takeoff: DeckTakeoff;
  bom: PricedBomLine[];
  lines: DeckPackageLine[];
  subtotal: number;
  materialSubtotal: number;
  laborSubtotal: number;
  /** The deck's area, or the floor under a gazebo. */
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

/** The deck's frame and its roof, built in the right order: the roof first (its posts need footings in the deck), then the deck under it. */
export function buildStructure(design: DeckDesign, opts: DeckPriceOptions = {}): { frame: DeckFrame | null; roof: RoofFrame | null } {
  const species = framingSpecies(design.framing.species);
  const deckUnder = hasDeck(design) ? { zones: shapeZones(design.shape), footingTopIn: design.footing.type === "pier-block" ? PIER_BLOCK.topIn : design.footing.aboveGradeIn } : null;
  const roof = hasRoof(design) ? buildRoofFrame(design, species, species.group, deckUnder, opts) : null;
  const frame = hasDeck(design) ? buildDeckFrame(design, { ...opts, extraPosts: roof ? roofPostsForDeck(roof) : undefined }) : null;
  return { frame, roof };
}

export function priceDeck(design: DeckDesign, opts: DeckPriceOptions = {}): DeckPackage {
  const { frame, roof } = buildStructure(design, opts);
  return priceStructure(design, frame, roof, opts);
}

/** A bare deck's frame, priced (the QA harness's door). */
export function priceDeckFrame(frame: DeckFrame, opts: DeckPriceOptions = {}): DeckPackage {
  return priceStructure(frame.design, frame, null, opts);
}

export function priceStructure(design: DeckDesign, frame: DeckFrame | null, roof: RoofFrame | null, opts: DeckPriceOptions = {}): DeckPackage {
  const takeoff = deckTakeoff(frame, roof, design);
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
  const none = { amount: 0, example: 0 };
  const sum = (...ws: Array<{ amount: number; example: number }>) => ({ amount: ws.reduce((a, w) => a + w.amount, 0), example: ws.reduce((a, w) => a + w.example, 0) });

  const deckArea = frame ? Math.round(frame.areaSqFt * 10) / 10 : 0;
  const area = frame ? deckArea : roof ? Math.round((roof.slab?.sqFt ?? roof.ringAreaSqFt) * 10) / 10 : 0;

  /* ── The slab under a gazebo or a pergola ─────────────────────────── */
  if (roof?.slab) {
    const w = work("labor.slab", roof.slab.sqFt);
    line({ id: "deck-slab", name: `Concrete slab, 4 in. — ${roof.slab.sqFt} sq ft`, description: `Gravel base, wire mesh, broom finish, about ${roof.slab.cuYd} cu yd; a foot past the posts on every side`, quantity: roof.slab.sqFt, unit: "sqft", material: stepMaterial("slab"), labor: w.amount, exampleMaterial: stepExample("slab"), exampleLabor: w.example });
  }

  /* ── The deck ─────────────────────────────────────────────────────── */
  if (frame && takeoff.surface) {
    const surface = takeoff.surface;
    const deckPosts = frame.posts.filter((p) => !p.roof);
    const roofPostsOnDeck = frame.posts.filter((p) => p.roof).length;
    const posts = frame.posts.length;
    const poured = frame.posts.filter((p) => p.footing.type === "poured").length;
    const first = deckPosts[0] ?? frame.posts[0];

    // Footings and posts.
    {
      const w1 = work("labor.footing", poured);
      const w2 = work("labor.pierBlock", posts - poured);
      const pads = [...new Set(frame.posts.filter((p) => p.footing.type === "poured").map((p) => p.footing.padIn))].sort((a, b) => a - b);
      const description = poured
        ? `Poured concrete, ${pads.length > 1 ? `${pads[0]}–${pads[pads.length - 1]}` : pads[0]} in. across and ${footingDepthIn(design)} in. deep; ${first && first.heightIn >= 1 ? `${design.framing.post} posts on stand-off bases` : "beams set on post bases"}${roofPostsOnDeck ? `; ${plural(roofPostsOnDeck, "footing")} under the roof's posts` : ""}`
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
      const w = work("labor.framing", deckArea);
      const braces = work("labor.brace", frame.hardware.braces);
      const beamSizes = [...new Set(frame.beams.map((b) => b.spec.size))];
      line({
        id: "deck-framing",
        name: `Framing — ${frame.species.short.toLowerCase()}`,
        description: `${frame.joistSize} joists ${frame.spacingIn} in. on center; ${beamSizes.join(" and ")} ${frame.beamStyle === "flush" ? "flush " : ""}${frame.beams.length === 1 ? "beam" : "beams"}${design.framing.doubleRim ? "; doubled rim and outside joists" : ""}${design.framing.joistTape ? "; joist tape" : ""}; hangers, ties and blocking`,
        quantity: deckArea,
        unit: "sqft",
        material: stepMaterial("framing"),
        labor: w.amount + braces.amount,
        exampleMaterial: stepExample("framing"),
        exampleLabor: w.example + braces.example,
      });
    }

    // Decking.
    {
      const w = work(`labor.decking.${frame.decking.labor}`, deckArea);
      const d = design.decking.diagonal ? work("labor.diagonal", deckArea) : none;
      line({
        id: "deck-decking",
        name: `Decking — ${frame.decking.label}`,
        description: `${design.decking.diagonal ? "Laid on the diagonal" : "Laid square to the joists"}, ${surface.fastening === "hidden" ? "hidden fasteners" : "deck screws"}`,
        quantity: deckArea,
        unit: "sqft",
        material: stepMaterial("decking"),
        labor: w.amount + d.amount,
        exampleMaterial: stepExample("decking"),
        exampleLabor: w.example + d.example,
      });
    }

    // Fascia.
    if (surface.fascia.on) {
      const ft = surface.fascia.lf;
      const w = work("labor.fascia", ft);
      line({ id: "deck-fascia", name: "Fascia on the open edges", quantity: ft, unit: "ln ft", material: stepMaterial("fascia"), labor: w.amount, exampleMaterial: stepExample("fascia"), exampleLabor: w.example });
    }
  }

  /* ── The roof ─────────────────────────────────────────────────────── */
  if (roof) {
    const r = roof.roof;
    const pergola = roof.kind === "pergola";
    const kindName = roof.kind === "double-tier" ? "double-tier" : roof.kind;
    const hipRoof = roof.kind === "hip" || roof.kind === "pyramid" || roof.kind === "double-tier";

    // Posts.
    {
      const n = roof.posts.length;
      const w = sum(work("labor.roofPost", n), work("labor.brace", roof.hardware.braces), roof.floor === "ground" ? work("labor.footing", n) : none);
      const where = roof.floor === "deck" ? "from their own footings up through the deck" : roof.floor === "slab" ? "on bases anchored to the slab" : `on poured footings ${footingDepthIn(design.floor === "ground" ? { ...design, placement: roof.attach === "wall" ? "attached" : "detached" } : design)} in. deep`;
      line({ id: "roof-posts", name: `${pergola ? "Pergola" : "Roof"} posts — ${plural(n, `${r.post} post`)}`, description: `${ftIn(r.eaveHeightIn)} to the headers, ${where}${roof.hardware.braces ? `; ${plural(roof.hardware.braces, "knee brace")}` : ""}`, quantity: n, unit: "ea", material: stepMaterial("roof-posts"), labor: w.amount, exampleMaterial: stepExample("roof-posts"), exampleLabor: w.example });
    }

    // Framing.
    {
      const qty = pergola ? Math.round(roof.footprintSqFt) : Math.round(roof.roofAreaSqFt);
      const w = sum(work("labor.roofFrame", qty), hipRoof ? work("labor.hipExtra", qty) : none, roof.ledger ? work("labor.roofLedger", roof.ledger.lengthIn / 12) : none, pergola ? work("labor.slats", qty) : none);
      const headers = [...new Set(roof.headers.map((h) => h.spec.size))].join(" and ");
      const ridgeWords = roof.ridge ? (roof.ridge.kind === "beam" ? `${roof.ridge.spec?.size ?? roof.ridge.nominal} ridge beam on ${plural(roof.kingPosts, "king post")}${roof.attach === "wall" ? " and the house" : ""}` : `${roof.ridge.nominal} ridge board${roof.ties ? ` with ${plural(roof.ties, "rafter tie")}` : ""}`) : roof.hips.count ? `${roof.hips.count} ${roof.hips.nominal} hips to the peak` : "";
      const description = pergola
        ? `${roof.rafters.size} rafters ${roof.rafters.spacingIn} in. on center on ${headers} headers; ${r.slats.size} slats ${r.slats.spacingIn} in. apart; ${ftIn(r.overhangIn)} overhang`
        : `${roof.rafters.size} rafters ${roof.rafters.spacingIn} in. on center${roof.hips.count ? `, ${roof.hips.nominal} hips` : ""}; ${headers} headers on the posts${roof.ledger ? `; ${roof.ledger.nominal} ledger on the house` : ""}${ridgeWords ? `; ${ridgeWords}` : ""}; ${ftIn(r.overhangIn)} overhang; hurricane ties and hangers`;
      line({ id: "roof-frame", name: pergola ? `Pergola framing — ${plural(roof.rafters.count, "rafter")}, ${plural(roof.slats?.count ?? 0, "slat")}` : `Roof framing — ${kindName} ${r.pitch}:12`, description, quantity: qty, unit: "sqft", material: stepMaterial("roof-frame"), labor: w.amount, exampleMaterial: stepExample("roof-frame"), exampleLabor: w.example });
    }

    if (!pergola) {
      const areaR = Math.round(roof.roofAreaSqFt);
      // Roof deck.
      if (stepMaterial("roof-deck") > 0) {
        const w = roof.sheets > 0 ? work("labor.sheathing", areaR) : none;
        line({ id: "roof-deck", name: roof.sheets > 0 ? "Roof deck — sheathing, underlayment, drip edge" : "Roof deck — drip edge and flashing", description: roof.sheets > 0 ? `${plural(roof.sheets, "sheet")} of 1/2-in. sheathing, synthetic underlayment, drip edge on ${Math.round(roof.eaveFt + roof.rakeFt)} ft of edge${roof.wallFt ? ", flashed to the house" : ""}` : `Metal on purlins; drip edge on ${Math.round(roof.eaveFt + roof.rakeFt)} ft of edge${roof.wallFt ? ", flashed to the house" : ""}`, quantity: areaR, unit: "sqft", material: stepMaterial("roof-deck"), labor: w.amount, exampleMaterial: stepExample("roof-deck"), exampleLabor: w.example });
      }
      // Roofing.
      {
        const metalRoof = r.roofing === "metal-panel" || r.roofing === "standing-seam";
        const w = metalRoof ? work("labor.metal", areaR) : work("labor.shingles", roof.squares);
        line({ id: "roofing", name: `Roofing — ${ROOFING_LABEL[r.roofing].toLowerCase()}`, description: `${roof.squares} squares with waste; ${Math.round(roof.hipFt + roof.ridgeFt)} ft of hip and ridge${metalRoof ? "; eave, rake and ridge trim" : "; starter strip and cap"}`, quantity: areaR, unit: "sqft", material: stepMaterial("roofing"), labor: w.amount, exampleMaterial: stepExample("roofing"), exampleLabor: w.example });
      }
      // Fascia, rakes, soffit.
      {
        const trimFt = Math.round(((r.fascia.eave ? roof.eaveFt : 0) + (r.fascia.rake ? roof.rakeFt : 0)) * 10) / 10;
        const w = sum(work("labor.trim", trimFt), roof.soffitSqFt ? work("labor.soffit", roof.soffitSqFt) : none);
        if (trimFt > 0 || roof.soffitSqFt > 0) {
          const parts = [r.fascia.eave ? `${Math.round(roof.eaveFt)} ft of eave` : null, r.fascia.rake && roof.rakeFt ? `${Math.round(roof.rakeFt)} ft of rake` : null].filter(Boolean).join(", ");
          line({ id: "roof-trim", name: `Fascia${roof.soffitSqFt ? " and soffit" : ""} — ${FASCIA_FINISH_LABEL[r.fascia.finish].toLowerCase()}`, description: `2x sub-fascia across the rafter tails; ${parts}${roof.soffitSqFt ? `; ${roof.soffitSqFt} sq ft of vented soffit` : ""}`, quantity: trimFt || roof.soffitSqFt, unit: trimFt ? "ln ft" : "sqft", material: stepMaterial("trim"), labor: w.amount, exampleMaterial: stepExample("trim"), exampleLabor: w.example });
        }
      }
      // Ceiling.
      if (roof.ceilingSqFt > 0) {
        const w = work("labor.ceiling", roof.ceilingSqFt);
        line({ id: "roof-ceiling", name: `Ceiling — ${CEILING_LABEL[r.ceiling].toLowerCase()}`, description: "On the undersides of the rafters, inside the headers", quantity: roof.ceilingSqFt, unit: "sqft", material: stepMaterial("ceiling"), labor: w.amount, exampleMaterial: stepExample("ceiling"), exampleLabor: w.example });
      }
      // Gutters.
      if (roof.gutters) {
        const g = roof.gutters;
        const w = sum(work("labor.gutters", g.lf), work("labor.downspout", g.downspouts));
        line({ id: "roof-gutters", name: `Gutters — ${GUTTER_LABEL[g.kind].toLowerCase()}`, description: `${plural(g.downspouts, "downspout")}${g.downspoutSize ? ` (${g.kind === "half-round-copper" ? "round copper" : g.downspoutSize})` : ""} to splash blocks; hidden hangers every ${roof.roofLoad >= 30 ? 18 : 24} in.${g.guardsLf ? "; gutter guards" : ""}`, quantity: Math.round(g.lf), unit: "ln ft", material: stepMaterial("gutters"), labor: w.amount, exampleMaterial: stepExample("gutters"), exampleLabor: w.example });
      }
      // Cupola.
      if (r.cupola) {
        const w = work("labor.cupola", 1);
        line({ id: "roof-cupola", name: "Cupola at the peak", description: "30-in. cupola with louvers and its own roof", quantity: 1, unit: "ea", material: stepMaterial("cupola"), labor: w.amount, exampleMaterial: stepExample("cupola"), exampleLabor: w.example });
      }
    }
  }

  /* ── Railing, stairs, tear-out ────────────────────────────────────── */
  const railFt = frame ? railFeet(frame) : 0;
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
  const steps = frame ? stairSteps(design) : 0;
  if (steps > 0) {
    const width = design.extras.stairWidthFt;
    const m = work("stairs.material", steps * width);
    const l = work("stairs.labor", steps * width);
    line({ id: "deck-stairs", name: `Stairs — ${plural(design.extras.stairFlights, "flight")}, ${width} ft wide`, description: `${plural(risersFor(design.heightIn), "riser")} to the ground${design.extras.stairFlights > 1 ? " each" : ""}: stringers, treads, risers and a landing pad`, quantity: steps, unit: "ea", material: m.amount, labor: l.amount, exampleMaterial: m.example, exampleLabor: l.example });
  }
  if (design.extras.demoSqFt > 0) {
    const w = work("labor.demo", design.extras.demoSqFt);
    line({ id: "deck-demo", name: "Tear out and haul away the old deck", quantity: design.extras.demoSqFt, unit: "sqft", material: 0, labor: w.amount, exampleMaterial: 0, exampleLabor: w.example });
  }

  const subtotal = round2(lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  const materialSubtotal = round2(lines.reduce((a, l) => a + l.quantity * l.materialCost, 0));
  const laborSubtotal = round2(lines.reduce((a, l) => a + l.quantity * l.laborCost, 0));
  return {
    design,
    frame,
    roof,
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
  const { frame, takeoff, roof, design } = pkg;
  const out: string[] = [];
  if (frame && takeoff.surface) {
    const height = design.heightIn >= 24 ? ftIn(design.heightIn) : `${design.heightIn} in.`;
    out.push(`Build a ${sizeWords(design)} ${design.structure === "covered-deck" ? "covered deck" : "deck"} (${Math.round(frame.areaSqFt)} sq ft), ${height} above the ground${where ? `, at ${where}` : ""} — ${PLACEMENT_LABEL[design.placement].split(" — ")[0].toLowerCase()}${design.placement === "attached" ? ", carried on a ledger" : design.placement === "beside" ? ", standing on its own posts" : ""}.`);
    const poured = frame.posts.filter((p) => p.footing.type === "poured").length;
    out.push(poured ? `${plural(poured, "poured concrete footing")}, ${footingDepthIn(design)} in. deep, sized for the load each one carries; ${design.framing.post} posts on metal bases, held off the concrete.` : `${plural(frame.posts.length, "precast pier block")} under ${design.framing.post} posts.`);
    const beamSizes = [...new Set(frame.beams.map((b) => b.spec.size))].join(" and ");
    out.push(`Frame in ${frame.species.short.toLowerCase()}: ${frame.joistSize} joists ${frame.spacingIn} in. on center on ${frame.beams.length === 1 ? `a ${beamSizes} beam` : `${beamSizes} beams`}${frame.beamStyle === "flush" ? " set flush with the joists" : ""}, metal hangers and ties at every connection${design.framing.doubleRim ? ", doubled rim and outside joists" : ""}${design.framing.joistTape ? ", protective tape on every joist top" : ""}.`);
    if (frame.ledgers.length) out.push(`Ledger fastened to the house with ${LEDGER_FASTENER_LABEL[design.ledger.fastener]}, flashed above and behind so water cannot reach the house framing, and tied to the house against sideways movement.`);
    out.push(`${frame.decking.label} decking${design.decking.diagonal ? ", laid on the diagonal" : ""}, fastened with ${takeoff.surface.fastening === "hidden" ? "hidden fasteners" : "coated deck screws"}${takeoff.surface.fascia.on ? "; fascia boards on the open edges" : ""}.`);
  } else if (roof) {
    out.push(`Build a ${structureWords(design)}${where ? ` at ${where}` : ""}, ${roof.floor === "slab" ? `on a new 4-in. concrete slab (${roof.slab?.sqFt ?? 0} sq ft)` : "on poured footings"}${roof.attach === "wall" ? ", against the house" : ""}.`);
  }
  if (roof) {
    const r = roof.roof;
    if (roof.kind === "pergola") {
      out.push(`Pergola over it: ${plural(roof.posts.length, `${r.post} post`)} ${ftIn(r.eaveHeightIn)} to the headers, ${roof.rafters.size} rafters ${roof.rafters.spacingIn} in. apart with ${r.slats.size} slats ${r.slats.spacingIn} in. apart on top, ${ftIn(r.overhangIn)} overhang all round${roof.hardware.braces ? ", knee braces at the posts" : ""}.`);
    } else {
      const kindName = ROOF_KIND_LABEL[roof.kind].split(" — ")[0].toLowerCase();
      out.push(`${roof.attach === "wall" ? "A" : "A free-standing"} ${kindName} roof over it, ${r.pitch}:12 pitch, ${ftIn(r.eaveHeightIn)} to the headers${roof.floor === "deck" ? " above the deck" : ""}: ${plural(roof.posts.length, `${r.post} post`)}${roof.floor === "deck" ? " from their own footings through the deck" : ""}, ${[...new Set(roof.headers.map((h) => h.spec.size))].join(" and ")} headers, ${roof.rafters.size} rafters ${roof.rafters.spacingIn} in. on center${roof.hips.count ? ` with ${roof.hips.nominal} hips` : ""}${roof.ridge ? (roof.ridge.kind === "beam" ? `, a ${roof.ridge.spec?.size ?? roof.ridge.nominal} ridge beam` : `, a ${roof.ridge.nominal} ridge board${roof.ties ? " and rafter ties" : ""}`) : ""}${roof.ledger ? `, a ${roof.ledger.nominal} ledger on the house, flashed` : ""}; ${ftIn(r.overhangIn)} overhang.`);
      out.push(`${ROOFING_LABEL[r.roofing]} over ${roof.sheets > 0 ? "1/2-in. sheathing and synthetic underlayment" : "2x4 purlins"}, drip edge on every edge${roof.wallFt ? ", step and counter flashing where the roof meets the house" : ""}${r.fascia.eave || r.fascia.rake ? `; ${FASCIA_FINISH_LABEL[r.fascia.finish].toLowerCase()} fascia${r.fascia.rake && roof.rakeFt ? " and rake boards" : ""}` : ""}${roof.soffitSqFt ? "; vented soffit under the eaves" : ""}${roof.ceilingSqFt ? `; ${CEILING_LABEL[r.ceiling].toLowerCase()} ceiling` : ""}${r.cupola ? "; a cupola at the peak" : ""}.`);
      if (roof.gutters) out.push(`${GUTTER_LABEL[roof.gutters.kind]} gutters on the eaves (${Math.round(roof.gutters.lf)} ft) with ${plural(roof.gutters.downspouts, "downspout")} to splash blocks${roof.gutters.guardsLf ? ", with gutter guards" : ""}.`);
    }
  }
  if (pkg.railFt > 0) out.push(`${Math.round(pkg.railFt)} ft of ${railType(design.extras.rail).id === "custom" ? "custom" : railType(design.extras.rail).label.toLowerCase()} railing.`);
  if (pkg.stairSteps > 0) out.push(`${plural(design.extras.stairFlights, "flight")} of stairs, ${design.extras.stairWidthFt} ft wide, ${plural(risersFor(design.heightIn), "riser")} to the ground.`);
  if (design.extras.demoSqFt > 0) out.push(`Tear-out and haul-away of the existing deck, ${design.extras.demoSqFt} sq ft.`);
  out.push("Layout squared and checked before digging; site cleaned when the work is done.");
  return out;
}

/** The words under the numbers: what the price assumed and what it leaves to the owner. */
export function deckNotes(pkg: DeckPackage): string[] {
  const { frame, roof, design } = pkg;
  const out: string[] = [];
  if (frame) {
    out.push(`Framing sized from the deck tables of the International Residential Code (Section R507)${frame.beams.some((b) => b.table === "DCA6") ? " and the American Wood Council's DCA 6 guide" : ""} for a ${design.loadPsf} psf load. The building department has the final word; permit fees and engineered drawings are not included.`);
    out.push(`Footings assume soil that bears ${design.soilPsf.toLocaleString("en-US")} psf${design.placement === "attached" ? ` and a frost depth of ${design.frostIn} in.` : ""}; rock, fill or a deeper frost line changes them.`);
  }
  if (roof && roof.kind !== "pergola") {
    out.push(`Rafters sized from ${RULE_RAFTER[roof.roofLoad]} (${roof.roofLoad} psf ${roof.roofLoad === 20 ? "roof live load" : "ground snow load"}); headers and ridge from the deck beam tables at the roof's load — the building department may ask for an engineer's letter on the roof beams.${roof.attach === "wall" ? " Where the roof meets the house, the siding is cut back and flashed; the house framing behind must be sound." : ""}`);
    if (roof.roofLoad >= 30) out.push("In snow country the building office may require an ice barrier along the eaves; it is not in this price unless listed.");
  }
  if (roof?.kind === "pergola") out.push("A pergola gives shade, not shelter: its slats are open to rain by design.");
  if (roof?.floor === "slab") out.push("The slab assumes level, compacted ground; grading, drainage and a vapour barrier under it are quoted separately when needed.");
  if (!frame && roof) out.push(`Footings assume soil that bears ${design.soilPsf.toLocaleString("en-US")} psf; rock, fill or a deeper frost line changes them. Permit fees and engineered drawings are not included.`);
  if (frame && design.heightIn > GUARD_REQUIRED_ABOVE_IN && pkg.railFt === 0) out.push("A deck this high needs a guard rail on its open edges; railing is not in this price.");
  if (frame && (frame.decking.family === "treated" || frame.decking.family === "softwood" || frame.decking.family === "hardwood")) out.push("Wood decking is natural: color change, small checks and some movement with the seasons are normal, not defects. Sealing or staining is the owner's upkeep.");
  out.push("811 marks public utilities; the owner marks private ones — sprinklers, drains, low-voltage, septic. Property lines, setbacks and HOA approval are the owner's to confirm.");
  return out;
}

export { roofWords };
