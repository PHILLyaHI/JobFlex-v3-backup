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
import { normalizeDeckDesign, type DeckDesign } from "./design";
import { railFeet } from "./pricing";

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

export function deckChecks(frame: DeckFrame): DeckCheck[] {
  const { design, species, decking, wall, group, load } = frame;
  const out: DeckCheck[] = [];
  const add = (c: DeckCheck) => out.push(c);
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

  return out;
}

/** The strip's verdict in one glance. */
export function checkSummary(checks: readonly DeckCheck[]): { fail: number; warn: number; pass: number; info: number } {
  const count = (level: DeckCheck["level"]) => checks.filter((c) => c.level === level).length;
  return { fail: count("fail"), warn: count("warn"), pass: count("pass"), info: count("info") };
}
