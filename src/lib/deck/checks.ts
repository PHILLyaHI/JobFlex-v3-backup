// THE CODE-CHECK STRIP (2026-10-04) — pure.
//
// Owner: "it follows the code." Under the studio's plan and 3D sits one
// strip that says, part by part, what the frame is, what the table allows,
// and where that table is printed — and, when something is past the table,
// what one tap would bring it back. A contractor reads it the way an
// inspector would walk the deck: joists, beams, posts, footings, the
// ledger, then the things around the frame (guards, stairs, a low deck's
// clearance, the permit).
//
// Four levels:
//   pass — inside the table; the numbers are there to be read.
//   info — a fact worth knowing; nothing to do.
//   warn — allowed, but it needs a second look or an owner's decision.
//   fail — past the table or against the code as built here. The studio
//          will not hide it; a fail with a `fix` offers the way back.
//
// Facts about THIS deck only. Estimating grade — the building department
// decides.

import {
  BRACE_ABOVE_IN,
  GUARD_REQUIRED_ABOVE_IN,
  HANDRAIL_FROM_RISERS,
  JOIST_SIZES,
  LEDGER_FASTENER_LABEL,
  LEDGER_TABLE_MAX_SPAN_FT,
  PERMIT_EXEMPT,
  PIER_BLOCK_MAX_AREA_SQFT,
  PIER_BLOCK_MAX_HEIGHT_IN,
  POST_TABLE_MAX_AREA,
  POST_TABLE_MAX_IN,
  RULE,
  ftIn,
  joistDepthIn,
  joistMaxCantileverIn,
  joistMaxSpanIn,
  risersFor,
} from "./codeTables";
import { GROUND_CONTACT_WITHIN_IN, MIN_FRAME_CLEAR_IN, PIER_BLOCK, footingDepthIn, type DeckFrame } from "./frame";
import { GUTTER_LABEL, ROOFING_LABEL, normalizeDeckDesign, type DeckDesign } from "./design";
import { railFeet } from "./pricing";
import type { RoofFrame } from "./roof";
import { RULE_HIP, RULE_RAFTER, RULE_RIDGE, RULE_ROOF_LOAD, RULE_TIES } from "./roofTables";

/** A change to a design, part by part; anything left out stays as it is. */
export type DeckPatch = {
  [K in keyof DeckDesign]?: DeckDesign[K] extends object ? Partial<DeckDesign[K]> : DeckDesign[K];
};

/** A design with a patch laid over it, brought back inside its rails. */
export function applyDeckPatch(design: DeckDesign, patch: DeckPatch): DeckDesign {
  const out: Record<string, unknown> = { ...design };
  for (const [key, value] of Object.entries(patch)) {
    const current = (design as unknown as Record<string, unknown>)[key];
    // The shape is replaced whole (a rectangle has no notch to keep); every other part is merged.
    out[key] = key !== "shape" && value && typeof value === "object" && current && typeof current === "object" ? { ...(current as object), ...(value as object) } : value;
  }
  return normalizeDeckDesign(out);
}

export interface DeckCheck {
  id: string;
  level: "pass" | "info" | "warn" | "fail";
  /** The part of the deck, as a heading: "Joists". */
  part: string;
  text: string;
  /** Where the rule is printed. */
  rule?: string;
  /** One tap that answers it. */
  fix?: { label: string; patch: DeckPatch };
}

const plural = (n: number, w: string, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;

export function deckChecks(frame: DeckFrame | null, roof: RoofFrame | null = null, designIn?: DeckDesign): DeckCheck[] {
  const design = designIn ?? frame?.design ?? null;
  const out: DeckCheck[] = [];
  const add = (c: DeckCheck) => out.push(c);
  if (frame) deckFrameChecks(frame, add, roof);
  if (roof && design) roofChecks(roof, design, frame, add);
  return out;
}

function deckFrameChecks(frame: DeckFrame, add: (c: DeckCheck) => void, roof: RoofFrame | null): void {
  const { design, species, decking, wall, group, load } = frame;
  const attached = design.placement === "attached";

  /* ── Joists ─────────────────────────────────────────────────────── */
  const maxSpan = joistMaxSpanIn(load, group, frame.joistSize, frame.spacingIn);
  const worstSpan = Math.max(...frame.zones.flatMap((z) => z.spansIn));
  const middleBeams = frame.beams.filter((b) => b.role === "middle").length;
  if (worstSpan <= maxSpan) {
    add({ id: "joist-span", level: "pass", part: "Joists", text: `${frame.joistSize} at ${frame.spacingIn} in. span ${ftIn(worstSpan)}; the table allows ${ftIn(maxSpan)} in ${species.short.toLowerCase()}${load > 40 ? ` at ${load} psf` : ""}.`, rule: RULE.joist });
  } else {
    const bigger = JOIST_SIZES.find((s) => joistMaxSpanIn(load, group, s, frame.spacingIn) >= worstSpan);
    add({
      id: "joist-span",
      level: "fail",
      part: "Joists",
      text: `${frame.joistSize} at ${frame.spacingIn} in. would span ${ftIn(worstSpan)}; the table stops at ${ftIn(maxSpan)}.`,
      rule: RULE.joist,
      fix: bigger ? { label: `Use ${bigger} joists`, patch: { framing: { joist: bigger } } } : { label: "Let the studio size the joists", patch: { framing: { joist: "auto", spacingIn: "auto", overhangFt: "auto" } } },
    });
  }
  if (design.framing.joist === "auto" && middleBeams > 0 && worstSpan <= maxSpan) {
    add({ id: "joist-middle-beam", level: "info", part: "Joists", text: `No joist in the table reaches across this deck in one span at ${frame.spacingIn} in., so ${middleBeams === 1 ? "a middle beam carries" : `${middleBeams} middle beams carry`} them.`, rule: RULE.joist });
  }
  for (const z of frame.zones) {
    const checkCant = (cant: number, backSpanIn: number, where: string, id: string) => {
      if (!(cant > 0.5)) return;
      const allowed = joistMaxCantileverIn(load, group, frame.joistSize, backSpanIn / 12);
      if (cant <= allowed) add({ id, level: "pass", part: "Joists", text: `Joists run ${ftIn(cant)} past the ${where} beam; the table allows ${ftIn(allowed)} behind a ${ftIn(backSpanIn)} span.`, rule: RULE.cantilever });
      else
        add({
          id,
          level: "fail",
          part: "Joists",
          text: allowed > 0 ? `Joists run ${ftIn(cant)} past the ${where} beam; the table allows ${ftIn(allowed)} behind a ${ftIn(backSpanIn)} span.` : `The table allows no overhang for a ${frame.joistSize} behind a ${ftIn(backSpanIn)} span.`,
          rule: RULE.cantilever,
          fix: { label: "Let the studio set the overhang", patch: { framing: { overhangFt: "auto" } } },
        });
    };
    checkCant(z.frontCantIn, z.spansIn[z.spansIn.length - 1], "outer", `joist-overhang-${z.zone.id}`);
    if (z.back === "beam") checkCant(z.backCantIn, z.spansIn[0], "house-side", `joist-overhang-back-${z.zone.id}`);
  }
  if (frame.spacingIn > frame.deckingMaxSpacingIn) {
    add({
      id: "joist-spacing",
      level: "fail",
      part: "Joists",
      text: `${decking.label}${design.decking.diagonal ? " on the diagonal" : ""} may sit on joists no more than ${frame.deckingMaxSpacingIn} in. apart; these are at ${frame.spacingIn} in.`,
      rule: decking.source === "code" ? RULE.decking : decking.sourceNote,
      fix: { label: `Space the joists at ${frame.deckingMaxSpacingIn >= 16 ? 16 : 12} in.`, patch: { framing: { spacingIn: frame.deckingMaxSpacingIn >= 16 ? 16 : 12 } } },
    });
  } else {
    add({ id: "joist-spacing", level: decking.source === "trade" ? "info" : "pass", part: "Joists", text: `${decking.label}${design.decking.diagonal ? " on the diagonal" : ""} may sit on joists up to ${frame.deckingMaxSpacingIn} in. apart${decking.source === "trade" ? " by the yard's usual practice — confirm it with your supplier" : ""}.`, rule: decking.source === "code" ? RULE.decking : decking.source === "maker" ? "The maker's installation guide" : undefined });
  }

  /* ── Beams ──────────────────────────────────────────────────────── */
  if (frame.beamKindNote) add({ id: "beam-kind", level: "info", part: "Beams", text: frame.beamKindNote, rule: RULE.solidBeam });
  if (design.framing.beamStyle === "auto" && frame.beamStyle === "flush") {
    add({ id: "beam-flush", level: "info", part: "Beams", text: `At ${design.heightIn} in. there is no room for a beam under the joists, so the beams sit flush and the joists hang on them.`, rule: RULE.flushBeam });
  }
  if (frame.flags.droppedDoesNotFit) {
    add({ id: "beam-fit", level: "fail", part: "Beams", text: `A beam under the joists does not clear the footings on a deck ${design.heightIn} in. high.`, fix: { label: "Set the beams flush", patch: { framing: { beamStyle: "flush" } } } });
  }
  const joistDepth = joistDepthIn(frame.joistSize);
  for (const b of frame.beams) {
    const name = `${b.spec.size} ${b.role === "middle" ? "middle " : b.role === "back" ? "house-side " : ""}beam`;
    const table = b.table === "DCA6" ? RULE.solidBeam : RULE.beam;
    const carried = b.table === "DCA6" && !b.bothSides ? `${ftIn(b.tableSpanFt * 12)} joists` : `an effective joist span of ${ftIn(b.tableSpanFt * 12)}`;
    if (frame.flags.beamBeyondTable.includes(b.id) || !(b.maxSpanIn > 0)) {
      add({
        id: `beam-${b.id}`,
        level: "fail",
        part: "Beams",
        text: `No ${frame.beamKind === "solid" ? "solid" : "built-up"} beam in the table carries ${carried}. An engineer sizes this one, or the joists get another beam line.`,
        rule: table,
        fix: frame.beamKind === "solid" ? { label: "Try built-up beams", patch: { framing: { beamKind: "built-up", beam: "auto" } } } : undefined,
      });
      continue;
    }
    if (b.spanIn > b.maxSpanIn + 0.01) {
      add({ id: `beam-${b.id}`, level: "fail", part: "Beams", text: `${name}: posts ${ftIn(b.spanIn)} apart; the table allows ${ftIn(b.maxSpanIn)} under ${carried}.`, rule: table, fix: { label: "Let the studio size the beams", patch: { framing: { beam: "auto" } } } });
    } else {
      add({ id: `beam-${b.id}`, level: "pass", part: "Beams", text: `${name}, ${ftIn(b.x1 - b.x0)} on ${plural(b.postXs.length, "post")}: ${ftIn(b.spanIn)} between posts; the table allows ${ftIn(b.maxSpanIn)} under ${carried}.`, rule: table });
    }
    if (b.endIn > b.spanIn / 4 + 0.01) add({ id: `beam-end-${b.id}`, level: "fail", part: "Beams", text: `${name} runs ${ftIn(b.endIn)} past its end posts; a quarter of the span is ${ftIn(b.spanIn / 4)}.`, rule: RULE.beamCantilever });
    if (b.style === "flush" && b.spec.depthIn < joistDepth) {
      add({ id: `beam-depth-${b.id}`, level: "fail", part: "Beams", text: `A flush ${b.spec.size} is shallower than the ${frame.joistSize} joists that hang on it.`, rule: RULE.flushBeam, fix: { label: "Let the studio size the beams", patch: { framing: { beam: "auto" } } } });
    }
    if (b.bothSides) {
      add({ id: `beam-both-${b.id}`, level: "warn", part: "Beams", text: `The ${b.spec.size} middle beam carries joists on both sides. The code's beam table is printed for joists on one side, so this one is sized from the strip of deck it really carries — show it to the building office.`, rule: RULE.beam });
    }
  }

  /* ── Posts ──────────────────────────────────────────────────────── */
  if (frame.posts.length) {
    const tallest = frame.posts.reduce((m, p) => (p.heightIn > m.heightIn ? p : m));
    const heaviest = frame.posts.reduce((m, p) => (p.tributarySqFt > m.tributarySqFt ? p : m));
    const bad = frame.posts.filter((p) => p.heightIn > p.maxHeightIn + 0.01);
    if (tallest.heightIn > POST_TABLE_MAX_IN) {
      add({ id: "post-height", level: "fail", part: "Posts", text: `Posts ${ftIn(tallest.heightIn)} tall: the post table stops at 14 ft. A deck this high is an engineer's.`, rule: RULE.post });
    } else if (heaviest.tributarySqFt > POST_TABLE_MAX_AREA) {
      add({ id: "post-area", level: "fail", part: "Posts", text: `One post carries ${Math.round(heaviest.tributarySqFt)} sq ft of deck; the table stops at ${POST_TABLE_MAX_AREA}. More posts, or an engineer.`, rule: RULE.post, fix: { label: "Let the studio size the beams", patch: { framing: { beam: "auto" } } } });
    } else if (bad.length) {
      const p = bad[0];
      add({
        id: "post-height",
        level: "fail",
        part: "Posts",
        text: p.maxHeightIn > 0 ? `A ${p.size} post ${ftIn(p.heightIn)} tall carrying ${Math.round(p.tributarySqFt)} sq ft: the table allows ${ftIn(p.maxHeightIn)}.` : `The table does not permit a ${p.size} post under ${Math.round(p.tributarySqFt)} sq ft of deck.`,
        rule: RULE.post,
        fix: design.framing.post !== "6x6" && design.framing.post !== "8x8" ? { label: "Use 6x6 posts", patch: { framing: { post: "6x6" } } } : design.framing.post === "6x6" ? { label: "Use 8x8 posts", patch: { framing: { post: "8x8" } } } : undefined,
      });
    } else if (tallest.heightIn >= 1) {
      add({ id: "post-height", level: "pass", part: "Posts", text: `${plural(frame.posts.length, "post")}, ${design.framing.post}, ${ftIn(tallest.heightIn)} tall, the busiest under ${Math.round(heaviest.tributarySqFt)} sq ft; the table allows ${ftIn(heaviest.maxHeightIn)} there.`, rule: RULE.post });
    } else {
      add({ id: "post-height", level: "info", part: "Posts", text: "The beams sit right on their footings: post bases, no posts.", rule: RULE.post });
    }
    if (design.framing.post === "4x4" || design.framing.post === "4x6") add({ id: "post-size", level: "info", part: "Posts", text: `The code's table allows a ${design.framing.post} here; the American Wood Council's guide builds every deck on 6x6 posts, and many building offices ask for them.`, rule: "AWC DCA 6" });
    const braced = frame.sticks.filter((s) => s.role === "brace").length;
    if (braced > 0) add({ id: "post-braces", level: "pass", part: "Posts", text: `${plural(braced, "knee brace")}: a 2x4 at each corner post, 2 ft down the post and 2 ft out, a 1/2-in. lag at each end.`, rule: RULE.bracing });
    else if (design.framing.braces === false && tallest.heightIn > BRACE_ABOVE_IN) add({ id: "post-braces", level: "warn", part: "Posts", text: `Posts over 2 ft with no knee braces. The American Wood Council's guide braces every corner post that tall.`, rule: RULE.bracing, fix: { label: "Add knee braces", patch: { framing: { braces: true } } } });
  }

  /* ── Footings ───────────────────────────────────────────────────── */
  if (frame.posts.length) {
    const depth = footingDepthIn(design);
    const beyond = frame.posts.filter((p) => !p.footing.required);
    const pours = frame.posts.filter((p) => p.footing.type === "poured");
    if (beyond.length) {
      add({ id: "footing-size", level: "fail", part: "Footings", text: `One footing carries more than 160 sq ft of deck — past the footing table. More posts, or an engineer.`, rule: RULE.footing });
    } else if (pours.length) {
      const pads = pours.map((p) => p.footing.padIn);
      const min = Math.min(...pads);
      const max = Math.max(...pads);
      const thick = Math.max(...pours.map((p) => p.footing.padThickIn));
      add({ id: "footing-size", level: "pass", part: "Footings", text: `${plural(pours.length, "poured footing")}, ${min === max ? `${min} in.` : `${min} to ${max} in.`} across and ${thick} in. thick at the base, on ${design.soilPsf.toLocaleString("en-US")} psf soil — each sized for the deck its post carries.`, rule: RULE.footing });
    }
    if (design.footing.type === "pier-block") {
      const allowed = !attached && frame.areaSqFt <= PIER_BLOCK_MAX_AREA_SQFT && design.heightIn <= PIER_BLOCK_MAX_HEIGHT_IN;
      const tooSmall = frame.posts.filter((p) => p.footing.required && p.footing.required.squareIn > PIER_BLOCK.baseIn);
      if (!allowed) {
        add({
          id: "footing-blocks",
          level: "fail",
          part: "Footings",
          text: `Precast pier blocks carry a deck only when it stands free of the house, is no bigger than ${PIER_BLOCK_MAX_AREA_SQFT} sq ft and no higher than ${PIER_BLOCK_MAX_HEIGHT_IN} in. This one ${attached ? "hangs on the house" : frame.areaSqFt > PIER_BLOCK_MAX_AREA_SQFT ? `is ${Math.round(frame.areaSqFt)} sq ft` : `is ${design.heightIn} in. high`}.`,
          rule: RULE.pierBlock,
          fix: { label: "Pour the footings", patch: { footing: { type: "poured" } } },
        });
      } else {
        add({ id: "footing-blocks", level: "warn", part: "Footings", text: `Pier blocks are allowed under a deck this small and low — but the code's wording is for joists set straight on the blocks, with no beams or posts. Where a permit is needed, ask the building office before building it this way.`, rule: RULE.pierBlock });
      }
      if (tooSmall.length) add({ id: "footing-block-size", level: "warn", part: "Footings", text: `${plural(tooSmall.length, "post")} need a footing wider than a ${PIER_BLOCK.baseIn}-in. block on this soil. More posts, or pour those.`, rule: RULE.footing });
    } else if (attached) {
      add({ id: "footing-depth", level: "pass", part: "Footings", text: depth > 12 ? `Dug ${depth} in. — below the ${design.frostIn}-in. frost line, as a deck on the house must be.` : `Dug ${depth} in. — the code's least depth; the frost line here is ${design.frostIn} in.`, rule: depth > 12 ? RULE.frost : RULE.footingDepth });
    } else {
      add({
        id: "footing-depth",
        level: "info",
        part: "Footings",
        text: design.footing.frostAlways ? `Dug ${depth} in., to the frost line, by the shop's choice.` : `Dug ${depth} in. The code asks for frost depth only where a deck is attached to the house${design.frostIn > 12 ? `; the frost line here is ${design.frostIn} in., and many building offices want it anyway` : ""}.`,
        rule: RULE.frost,
        fix: !design.footing.frostAlways && design.frostIn > 12 ? { label: `Dig to ${design.frostIn} in.`, patch: { footing: { frostAlways: true } } } : undefined,
      });
    }
    if (design.placement === "beside" && frame.posts.some((p) => p.y < 60)) add({ id: "footing-near-house", level: "info", part: "Footings", text: "Footings within 5 ft of the house foundation go down to the level of the house footing, so they do not load the backfill against the wall.", rule: "AWC DCA 6" });
  }

  /* ── Ledger, or standing free ───────────────────────────────────── */
  if (attached) {
    const worst = frame.ledgers.reduce((m, l) => (l.joistSpanFt > m ? l.joistSpanFt : m), 0);
    const untabled = frame.ledgers.filter((l) => !(l.spacingIn > 0));
    const fasteners = frame.ledgers.reduce((a, l) => a + l.fasteners, 0);
    const label = LEDGER_FASTENER_LABEL[design.ledger.fastener];
    if (worst > LEDGER_TABLE_MAX_SPAN_FT) {
      add({ id: "ledger", level: "fail", part: "Ledger", text: `Joists ${ftIn(worst * 12)} long hang on the ledger; the ledger table stops at 18 ft. A middle beam, or an engineer.`, rule: RULE.ledger });
    } else if (untabled.length) {
      add({ id: "ledger", level: "fail", part: "Ledger", text: `${label.replace(/^(.)/, (c) => c.toUpperCase())} have no printed spacing at ${load} psf${wall.rim === "engineered" ? " on an engineered rim" : ""}.`, rule: untabled[0].rule, fix: wall.fasteners.includes("lag") ? { label: "Use 1/2-in. lag screws", patch: { ledger: { fastener: "lag" } } } : undefined });
    } else {
      const spacings = [...new Set(frame.ledgers.map((l) => l.spacingIn))].sort((a, b) => a - b);
      add({ id: "ledger", level: "pass", part: "Ledger", text: `${plural(fasteners, "fastener")}: ${label} every ${spacings.join(" / ")} in., in two staggered rows, for ${ftIn(worst * 12)} joists.`, rule: frame.ledgers[0].rule });
    }
    add({ id: "ledger-wall", level: "info", part: "Ledger", text: wall.why, rule: RULE.ledgerWall });
    if (design.ledger.fastener === "anchor") add({ id: "ledger-anchor", level: "warn", part: "Ledger", text: "Concrete anchors are counted at the through-bolt spacing. The anchor maker's own table sets the real spacing and embedment — check it before ordering.", rule: "AWC DCA 6" });
    add({ id: "ledger-flashing", level: "pass", part: "Ledger", text: "Flashed: metal cap flashing over the ledger, membrane behind it and over its top. No aluminum against copper-treated lumber.", rule: "IRC R507.2.4" });
    add({ id: "ledger-lateral", level: "pass", part: "Ledger", text: design.ledger.lateral === "four" ? "Four 750-lb ties hold the deck to the house against sideways movement." : "Two 1,500-lb hold-downs, one within 2 ft of each end, hold the deck to the house against sideways movement.", rule: RULE.lateral });
  } else {
    if (design.placement === "beside") add({ id: "free-wall", level: "info", part: "Standing free", text: wall.ledger ? "Framed on its own posts beside the house, by choice: nothing hangs on the wall." : wall.why, rule: wall.ledger ? RULE.selfSupporting : RULE.ledgerWall });
    add({ id: "free-lateral", level: "warn", part: "Standing free", text: "A deck that stands free must resist sideways movement on its own. Neither the code nor the American Wood Council's guide prints a bracing design for one; the knee braces here are a starting point — have the bracing looked at where a permit is needed.", rule: "AWC DCA 6, commentary" });
    if (frame.areaSqFt <= PERMIT_EXEMPT.maxAreaSqFt && design.heightIn <= PERMIT_EXEMPT.maxHeightIn) add({ id: "free-permit", level: "info", part: "Standing free", text: `No bigger than ${PERMIT_EXEMPT.maxAreaSqFt} sq ft, no higher than ${PERMIT_EXEMPT.maxHeightIn} in. and not attached: the model code asks for no permit, as long as the deck does not serve the house's required exit door. Local rules differ — ask.`, rule: RULE.permit });
  }

  /* ── The frame's lumber ─────────────────────────────────────────── */
  if (species.id === "spf") add({ id: "lumber-spf", level: "warn", part: "Lumber", text: "Treated spruce-pine-fir is an above-ground stock. Order the posts, the ledger and the beams in a species treated for ground contact.", rule: RULE.treatment });
  if (!species.treated) add({ id: "lumber-heart", level: "info", part: "Lumber", text: `${species.short}: only heartwood is naturally durable. Sapwood under a deck has to be pressure-treated.`, rule: RULE.treatment });
  if (design.extras.stainless) add({ id: "lumber-stainless", level: "info", part: "Lumber", text: "Stainless connectors and fasteners throughout — required within 300 ft of salt water.", rule: RULE.fasteners });

  /* ── Height: a low deck, a guard, the stairs ────────────────────── */
  if (frame.flags.tooLow) {
    const smaller = JOIST_SIZES.filter((s) => frame.joistTopIn - joistDepthIn(s) >= MIN_FRAME_CLEAR_IN);
    add({
      id: "low-fit",
      level: "fail",
      part: "Height",
      text: `At ${design.heightIn} in. the ${frame.joistSize} joists would sit ${frame.joistBottomIn <= 0 ? "in the ground" : `${Math.round(frame.joistBottomIn * 10) / 10} in. off the ground`}. Raise the deck, dig the ground out, or build it on sleepers over a slab.`,
      fix: smaller.length && design.framing.joist !== "auto" ? { label: "Let the studio size the joists", patch: { framing: { joist: "auto" } } } : undefined,
    });
  } else if (frame.joistBottomIn < GROUND_CONTACT_WITHIN_IN) {
    add({ id: "low-contact", level: "info", part: "Height", text: `The frame is ${Math.round(frame.joistBottomIn * 10) / 10} in. off the ground. Wood within 6 in. of the soil is ordered ground-contact, and the material list says so.`, rule: RULE.treatment });
  }
  const lowestBeam = frame.beams.length ? Math.min(...frame.beams.map((b) => b.bottomIn)) : frame.joistBottomIn;
  if (!frame.flags.tooLow && lowestBeam < 0) add({ id: "low-beam", level: "fail", part: "Height", text: `The beams are deeper than the deck is high: their undersides would be ${Math.round(-lowestBeam * 10) / 10} in. in the ground.`, fix: { label: "Let the studio size the beams", patch: { framing: { beam: "auto", beamStyle: "auto" } } } });
  if (decking.minClearanceIn && !frame.flags.tooLow && frame.joistBottomIn < decking.minClearanceIn) add({ id: "low-air", level: "warn", part: "Height", text: `${decking.label} wants at least ${decking.minClearanceIn} in. of open air under the joists; this frame leaves ${Math.round(frame.joistBottomIn * 10) / 10} in.`, rule: "The maker's installation guide" });

  const rail = railFeet(frame);
  if (design.heightIn > GUARD_REQUIRED_ABOVE_IN) {
    if (rail > 0) add({ id: "guard", level: "pass", part: "Guard and stairs", text: `More than 30 in. up, so a guard is required on the open edges: ${Math.round(rail)} ft of railing is in the price, at least 36 in. high.`, rule: RULE.guard });
    else add({ id: "guard", level: "warn", part: "Guard and stairs", text: `More than 30 in. up, so a guard at least 36 in. high is required on the ${Math.round(frame.openEdgeFt)} ft of open edge. No railing is in the price yet.`, rule: RULE.guard, fix: { label: "Add a railing allowance", patch: { extras: { rail: "treated", railFt: "auto" } } } });
  } else if (rail === 0) {
    add({ id: "guard", level: "info", part: "Guard and stairs", text: "No more than 30 in. up: the code asks for no guard.", rule: RULE.guard });
  }
  const risers = risersFor(design.heightIn);
  if (risers > 1) {
    if (design.extras.stairFlights > 0) add({ id: "stairs", level: "pass", part: "Guard and stairs", text: `${plural(design.extras.stairFlights, "flight")} in the price: ${risers} risers of ${(Math.round((design.heightIn / risers) * 100) / 100).toFixed(2)} in. each (7 3/4 in. at most), treads at least 10 in.${risers >= HANDRAIL_FROM_RISERS ? ", with a handrail" : ""}.`, rule: RULE.stairs });
    else add({ id: "stairs", level: "info", part: "Guard and stairs", text: `Reaching the ground takes ${risers} risers. No stairs are in the price yet.`, rule: RULE.stairs, fix: { label: "Add a flight of stairs", patch: { extras: { stairFlights: 1 } } } });
  }

  /* ── Load ───────────────────────────────────────────────────────── */
  if (load > 40) add({ id: "load", level: "info", part: "Load", text: `Sized for a ${load} psf ground snow load — every table is read on its ${load} psf rows.`, rule: "IRC R507.1" });

  /* ── Decking ────────────────────────────────────────────────────── */
  const makerRows = frame.blockingRows.filter((r) => r.why === "maker").length;
  if (makerRows > 0) add({ id: "decking-blocking", level: "pass", part: "Decking", text: `Rows of solid blocking no more than ${decking.blockingRowsMaxFt} ft apart, as this board's maker requires.`, rule: "The maker's installation guide" });
  if (design.decking.diagonal) add({ id: "decking-diagonal", level: "info", part: "Decking", text: "Boards on the diagonal: 5 points more waste than you set, and the crew's diagonal rate on top." });

  /* ── The roof's posts through the deck ──────────────────────────────── */
  const roofPosts = frame.posts.filter((p) => p.roof);
  if (roof && roofPosts.length) {
    const beyond = roofPosts.filter((p) => !p.footing.required);
    const heaviest = roofPosts.reduce((m, p) => (p.tributarySqFt > m.tributarySqFt ? p : m));
    const lb = Math.round(heaviest.tributarySqFt * (load + 10));
    if (beyond.length) add({ id: "roof-post-footing", level: "fail", part: "Roof posts", text: `A roof post brings down about ${lb.toLocaleString("en-US")} lb — more than the footing table reads. An engineer sizes that footing, or the roof gets more posts.`, rule: RULE.footing });
    else add({ id: "roof-post-footing", level: "pass", part: "Roof posts", text: `${plural(roofPosts.length, "roof post")} run from their own footings up through the deck; the busiest brings down about ${lb.toLocaleString("en-US")} lb, read on the footing table as ${Math.round(heaviest.tributarySqFt)} sq ft of deck — a ${heaviest.footing.padIn}-in. footing.`, rule: RULE.footing });
  }
}


/* ------------------------------------------------------------------ */
/*  The roof (M2)                                                      */
/* ------------------------------------------------------------------ */

function roofChecks(roof: RoofFrame, design: DeckDesign, frame: DeckFrame | null, add: (c: DeckCheck) => void): void {
  const r = roof.roof;
  const pergola = roof.kind === "pergola";
  const kindName = roof.kind === "double-tier" ? "double-tier" : roof.kind;
  const rafterRule = RULE_RAFTER[roof.roofLoad];

  if (roof.kindNote) add({ id: "roof-kind", level: "warn", part: "Roof", text: roof.kindNote });

  /* ── Rafters ────────────────────────────────────────────────────────── */
  const span = roof.rafters.spanIn;
  const max = roof.rafters.maxSpanIn;
  const who = roof.rafterGroup === "RW" ? `${roof.species.short.toLowerCase()} (read on the Southern pine row, shortened — no rafter row is printed for it)` : roof.species.short.toLowerCase();
  if (pergola) {
    add({ id: "rafter-span", level: span <= max ? "pass" : "fail", part: "Pergola", text: span <= max ? `${roof.rafters.size} rafters at ${roof.rafters.spacingIn} in. span ${ftIn(span)} header to header; the 20 psf roof table allows ${ftIn(max)} in ${who}.` : `${roof.rafters.size} rafters at ${roof.rafters.spacingIn} in. would span ${ftIn(span)}; the table stops at ${ftIn(max)}.`, rule: RULE_RAFTER[20], fix: span <= max ? undefined : { label: "Let the studio size the rafters", patch: { roof: { ...r, rafter: "auto" } } } });
    add({ id: "pergola-open", level: "info", part: "Pergola", text: `Open slats: ${r.slats.size} every ${r.slats.spacingIn} in. The frame carries no roof load, only its own weight and the wind; it gives shade, not shelter.` });
  } else if (span <= max) {
    add({ id: "rafter-span", level: "pass", part: "Rafters", text: `${roof.rafters.size} at ${roof.rafters.spacingIn} in. span ${ftIn(span)} (horizontal, header to ${roof.ridge ? "ridge" : roof.ledger ? "ledger" : "peak"}); the table allows ${ftIn(max)} in ${who} at ${roof.roofLoad} psf${r.ceiling !== "none" ? ", shortened for the ceiling's weight" : ""}.`, rule: rafterRule });
  } else {
    const spacingFix = roof.rafters.spacingIn > 12;
    add({
      id: "rafter-span",
      level: "fail",
      part: "Rafters",
      text: `${roof.rafters.size} at ${roof.rafters.spacingIn} in. would span ${ftIn(span)}; the table stops at ${ftIn(max)}${roof.rafters.size === "2x12" ? " — a 2x12 is the deepest sawn rafter in the table: closer spacing, or an engineer" : ""}.`,
      rule: rafterRule,
      fix: r.rafter !== "auto" ? { label: "Let the studio size the rafters", patch: { roof: { ...r, rafter: "auto" } } } : spacingFix ? { label: `Space the rafters at ${roof.rafters.spacingIn === 24 ? 16 : 12} in.`, patch: { roof: { ...r, rafterSpacingIn: roof.rafters.spacingIn === 24 ? 16 : 12 } } } : undefined,
    });
  }
  if (!pergola && roof.flags.speciesEstimated) add({ id: "rafter-species", level: "warn", part: "Rafters", text: `No rafter table is printed for ${roof.species.short.toLowerCase()}: its spans are read on the Southern pine row and cut by 15%. Have the building office confirm, or frame the roof in a tabulated species.`, rule: rafterRule });
  if (!pergola && r.ceiling !== "none") add({ id: "rafter-ceiling", level: "info", part: "Rafters", text: `A ${r.ceiling === "tongue-groove" ? "board" : "panel"} ceiling adds weight: spans are read 7% shorter than the 10-psf-dead-load table prints. The code's 20-psf table is the one to show the building office.`, rule: rafterRule });
  if (!pergola && roof.hips.count) add({ id: "roof-hips", level: "info", part: "Rafters", text: `${plural(roof.hips.count, `${roof.hips.nominal} hip`)}, one size deeper than the ${roof.rafters.size} commons, as the code asks of a hip; the jacks hang on them.`, rule: RULE_HIP });

  /* ── Headers ────────────────────────────────────────────────────────── */
  for (const h of roof.headers) {
    const name = `${h.spec.size} header ${h.id.replace("h", "")}`;
    if (!(h.maxSpanIn > 0)) {
      add({ id: `header-${h.id}`, level: "fail", part: "Headers", text: `${name} (${ftIn(h.lengthIn)}) carries more than the deck beam table reads at this roof load${h.kingPost ? " — it also holds the ridge's king post" : ""}. An engineer sizes it (an LVL), or the roof gets more posts.`, rule: RULE.beam, fix: r.header !== "auto" ? { label: "Let the studio size the headers", patch: { roof: { ...r, header: "auto" } } } : undefined });
    } else if (h.spanIn > h.maxSpanIn + 0.01) {
      add({ id: `header-${h.id}`, level: "fail", part: "Headers", text: `${name}: posts ${ftIn(h.spanIn)} apart; the table allows ${ftIn(h.maxSpanIn)} under this roof.`, rule: RULE.beam, fix: { label: "Let the studio size the headers", patch: { roof: { ...r, header: "auto" } } } });
    } else {
      add({ id: `header-${h.id}`, level: "pass", part: "Headers", text: `${name}, ${ftIn(h.lengthIn)} on ${plural(h.postAt.length - (h.wallEnd ? 1 : 0), "post")}${h.wallEnd ? " and the house" : ""}: ${ftIn(h.spanIn)} between supports; read on the deck beam table as a ${h.eqJoistSpanFt}-ft joist span at 40 psf (${roof.totalPsf} psf of roof${h.kingPost ? " plus the king post" : ""}), which allows ${ftIn(h.maxSpanIn)}.`, rule: RULE.beam });
    }
  }
  if (roof.headers.length) add({ id: "header-method", level: "info", part: "Headers", text: `Roof headers are read on the code's DECK beam tables at the weight the roof really puts on them (${roof.roofLoad} psf ${roof.roofLoad === 20 ? "live" : "snow"} + ${roof.deadPsf} psf dead)${roof.headers.some((h) => h.eqJoistSpanFt < 6) ? "; a load lighter than the table's first column stretches its span by the square root of the load ratio, an estimate" : ""}. The code prints no table for a roof beam; show the building office the reading, or bring an engineer's letter.`, rule: RULE.beam });

  /* ── Ridge ──────────────────────────────────────────────────────────── */
  if (roof.ridge) {
    if (roof.ridge.kind === "beam") {
      if (roof.flags.ridgeBeyondTable) add({ id: "ridge", level: "fail", part: "Ridge", text: `A ${roof.ridge.spec?.size ?? roof.ridge.nominal} ridge beam spanning ${ftIn(roof.ridge.spanIn)} is past the beam table. An engineered beam (LVL), or a post under the ridge.`, rule: RULE_RIDGE, fix: { label: "Use a ridge board with ties instead", patch: { roof: { ...r, ridge: "board" } } } });
      else add({ id: "ridge", level: "pass", part: "Ridge", text: `${roof.ridge.spec?.size ?? roof.ridge.nominal} ridge beam, ${ftIn(roof.ridge.lengthIn)} long, spanning ${ftIn(roof.ridge.spanIn)} between ${roof.kingPosts === 2 ? "two king posts" : "the house and a king post"}; the rafters bear on it and the ceiling stays open — no ties needed.${roof.ridge.maxSpanIn ? ` Read on the deck beam table as a ${roof.ridge.eqJoistSpanFt}-ft joist span: allows ${ftIn(roof.ridge.maxSpanIn)}.` : ""}`, rule: RULE_RIDGE });
    } else if (roof.ties > 0) {
      add({ id: "ridge", level: roof.ridge.fellBack ? "info" : "pass", part: "Ridge", text: `${roof.ridge.fellBack ? `No beam in the table spans the ${ftIn(roof.ridge.spanIn)} ridge under this roof, so it is framed with a ` : ""}${roof.ridge.nominal} ridge board${roof.ridge.fellBack ? "" : ""} with ${plural(roof.ties, "2x6 rafter tie")} every 4 ft at the header line: the ties take the rafters' thrust, so the board carries no load.${roof.ridge.fellBack ? " Choose Ridge beam to price an engineered beam (LVL) and an open ceiling instead." : ""}`, rule: RULE_TIES });
    } else {
      add({ id: "ridge", level: "info", part: "Ridge", text: `${roof.ridge.nominal} ridge board between the hips, one size deeper than the rafters. A hip roof ties itself: the hips carry the thrust down to the corner posts and the headers hold them.`, rule: RULE_RIDGE });
    }
  } else if (!pergola && roof.hips.count) {
    add({ id: "ridge", level: "info", part: "Ridge", text: roof.hardware.ringPlate ? `No ridge: the ${roof.hips.count} hips meet at a steel compression ring at the peak, the way a polygon gazebo is framed.` : `No ridge: the ${roof.hips.count} hips meet at the peak and carry the roof to the corner posts.`, rule: RULE_HIP });
  }
  if (roof.kind === "double-tier") add({ id: "roof-tier", level: "info", part: "Ridge", text: `Two tiers: the lower roof stops at a 2x8 ring beam on the hips; ${plural(roof.members.filter((m) => m.role === "tier-post").length, "4x4 post")} carry the upper roof above a 2-ft open band (screen or louvers are the owner's choice, not in the price).` });

  /* ── Posts ──────────────────────────────────────────────────────────── */
  {
    const n = roof.posts.length;
    const heaviest = roof.posts.reduce((m, p) => (p.loadLb > m.loadLb ? p : m), roof.posts[0]);
    if (roof.flags.postBeyondTable) add({ id: "roof-post-height", level: "fail", part: "Roof posts", text: `A ${r.post} post ${ftIn(r.eaveHeightIn)} tall under ${heaviest.loadLb.toLocaleString("en-US")} lb of roof: the post table allows ${ftIn(heaviest.maxHeightIn)} for that weight.`, rule: RULE.post, fix: r.post === "4x4" ? { label: "Use 6x6 posts", patch: { roof: { ...r, post: "6x6" } } } : r.post === "6x6" ? { label: "Use 8x8 posts", patch: { roof: { ...r, post: "8x8" } } } : undefined });
    else add({ id: "roof-post-height", level: "pass", part: "Roof posts", text: `${plural(n, `${r.post} post`)}, ${ftIn(r.eaveHeightIn)} from the ${roof.floor === "deck" ? "deck" : roof.floor === "slab" ? "slab" : "footings"} to the headers; the busiest carries about ${heaviest.loadLb.toLocaleString("en-US")} lb of roof, read on the post table as ${heaviest.tributarySqFt} sq ft of deck — it allows ${ftIn(heaviest.maxHeightIn)}.`, rule: RULE.post });
    if (roof.flags.postSpliced) add({ id: "roof-post-splice", level: "info", part: "Roof posts", text: "Footing to header is longer than a 20-ft post: the roof posts are spliced at the deck, bolted through the rim and the beam." });
    if (roof.floor === "slab") add({ id: "roof-post-slab", level: "info", part: "Roof posts", text: `Posts on stand-off bases, two wedge anchors each, into a 4-in. slab; the slab is a foot wider than the posts all round. Where the frost line is deep, the building office may want footings under the slab's corners.`, rule: RULE.footingDepth });
    if (roof.floor === "ground") {
      const fts = roof.posts.map((p) => p.footing).filter((f): f is NonNullable<typeof f> => !!f);
      const pads = fts.map((f) => f.padIn);
      if (fts.length) add({ id: "roof-footings", level: fts.some((f) => !f.required) ? "fail" : "pass", part: "Roof posts", text: fts.some((f) => !f.required) ? "One post's footing is past the footing table — more posts, or an engineer." : `${plural(fts.length, "poured footing")}, ${Math.min(...pads) === Math.max(...pads) ? `${pads[0]} in.` : `${Math.min(...pads)} to ${Math.max(...pads)} in.`} across, ${fts[0].depthIn} in. deep${roof.attach === "wall" ? ", below the frost line as a structure on the house must be" : ""}.`, rule: RULE.footing });
    }
    if (roof.hardware.braces) add({ id: "roof-braces", level: "pass", part: "Roof posts", text: `${plural(roof.hardware.braces, "4x4 knee brace")} at the posts, 2 ft down and 2 ft out along the headers, a lag at each end — what holds a free-standing roof square.`, rule: RULE.bracing });
    else if (r.braces === false && roof.attach === "free") add({ id: "roof-braces", level: "warn", part: "Roof posts", text: "A free-standing roof with no knee braces has nothing holding it square but the post bases. Brace it, or have the bracing looked at where a permit is needed.", rule: RULE.bracing, fix: { label: "Add knee braces", patch: { roof: { ...r, braces: true } } } });
  }

  /* ── On the house ───────────────────────────────────────────────────── */
  if (roof.attach === "wall") {
    if (roof.ledger) add({ id: "roof-ledger", level: "pass", part: "On the house", text: `${roof.ledger.nominal} ledger on the wall, ${ftIn(roof.ledger.lengthIn)}, ${roof.ledger.fasteners} structural screws (two every 16 in., into the studs or the rim); the rafters hang on it in hangers. Flashed into the siding above.`, rule: RULE.ledgerBoard });
    if (roof.hardware.wallHangers) add({ id: "roof-wall-hangers", level: "pass", part: "On the house", text: "The side headers end on beam hangers bolted to the house framing; the ridge beam sits in a bracket on the wall.", rule: RULE.ledgerBoard });
    const meetIn = roof.ledger ? roof.ledger.zIn : roof.peakIn;
    const above = meetIn - roof.floorIn;
    add({ id: "roof-wall-height", level: "info", part: "On the house", text: `The roof meets the house ${ftIn(Math.round(above))} above the ${roof.floor === "deck" ? "deck" : "floor"} (${ftIn(Math.round(meetIn))} above the ground). Check it clears the windows and the house's own eave; the siding there is cut back and flashed (${Math.round(roof.wallFt)} ft).`, rule: "IRC R903.2" });
  } else if (!pergola) {
    add({ id: "roof-free", level: "info", part: "Standing free", text: `A free-standing ${kindName} roof: ${plural(roof.posts.length, "post")}, headers all round, knee braces. The building office may want its lateral bracing shown.`, rule: RULE.selfSupporting });
  }

  /* ── Covering, trim, gutters ────────────────────────────────────────── */
  if (!pergola) {
    const metalRoof = r.roofing === "metal-panel" || r.roofing === "standing-seam";
    add({ id: "roofing", level: "info", part: "Roofing", text: `${ROOFING_LABEL[r.roofing]} on ${Math.round(roof.roofAreaSqFt)} sq ft of roof: ${roof.squares} squares with ${Math.round((roof.wasteFactor - 1) * 100)}% waste${roof.sheets ? `, ${plural(roof.sheets, "sheet")} of sheathing` : ", on 2x4 purlins"}; ${Math.round(roof.eaveFt)} ft of eave, ${Math.round(roof.rakeFt)} ft of rake, ${Math.round(roof.hipFt + roof.ridgeFt)} ft of hip and ridge.`, rule: metalRoof ? "IRC R905.10" : r.roofing === "cedar-shake" ? "IRC R905.8" : "IRC R905.2" });
    if (r.pitch < 4 && !metalRoof) add({ id: "roof-pitch", level: r.pitch < 2 ? "fail" : "warn", part: "Roofing", text: r.pitch < 2 ? `Shingles are not permitted below 2:12.` : `At ${r.pitch}:12 shingles need two layers of underlayment (the code's low-slope rule); one layer is priced.`, rule: "IRC R905.2.2", fix: { label: "Pitch it 4:12", patch: { roof: { ...r, pitch: 4 } } } });
    if (metalRoof && r.roofDeck === "purlins") add({ id: "roof-purlins", level: "info", part: "Roofing", text: "Metal on open purlins: cheaper, and the underside shows. Condensation drips in cold weather unless the panels have an anti-condensation backing.", rule: "IRC R905.10.2" });
    if (roof.roofLoad >= 30) add({ id: "roof-snow", level: "info", part: "Load", text: `Sized for a ${roof.roofLoad} psf ground snow load; the rafter table is read on its ${roof.roofLoad} psf page.`, rule: RULE_ROOF_LOAD });
    if (roof.gutters) add({ id: "gutters", level: "pass", part: "Gutters", text: `${GUTTER_LABEL[roof.gutters.kind]}: ${Math.round(roof.gutters.lf)} ft on the eaves, ${plural(roof.gutters.downspouts, "downspout")} (one per run and one more every 35 ft), hangers every ${roof.roofLoad >= 30 ? 18 : 24} in.${roof.gutters.closed ? ", mitred at every corner" : ""}.`, rule: "SMACNA · IRC R801.3" });
    else if (design.structure === "covered-deck" && frame) add({ id: "gutters", level: "warn", part: "Gutters", text: `No gutters: ${Math.round(roof.eaveFt)} ft of eave drips onto the deck and splashes the house. 5-in. K-style aluminum is the usual answer.`, rule: "IRC R801.3", fix: { label: "Add 5-in. gutters", patch: { roof: { ...r, gutters: { kind: "k5", guards: false } } } } });
    if (r.fascia.eave || r.fascia.rake) add({ id: "roof-fascia", level: "info", part: "Trim", text: `A 2x sub-fascia across the rafter tails and ${r.fascia.finish === "aluminum-wrap" ? "aluminum wrap over it" : `a ${roof.rafters.size === "2x10" || roof.rafters.size === "2x12" ? "1x10" : "1x8"} ${r.fascia.finish === "pvc" ? "PVC" : "primed wood"} board`}${r.fascia.rake && roof.rakeFt ? ", rake boards on the fly rafters" : ""}${roof.soffitSqFt ? `, ${roof.soffitSqFt} sq ft of vented soffit` : ", open eaves (no soffit)"}.` });
  }
}

/** The strip's verdict in one glance. */
export function checkSummary(checks: readonly DeckCheck[]): { fail: number; warn: number; pass: number; info: number } {
  const count = (level: DeckCheck["level"]) => checks.filter((c) => c.level === level).length;
  return { fail: count("fail"), warn: count("warn"), pass: count("pass"), info: count("info") };
}
