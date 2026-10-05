// THE BOARDS ON TOP (2026-10-04) — pure.
//
// Rows of deck boards over the frame, and the fascia around it. The frame
// says where the deck is; this says how many boards of which length to buy
// and where each one lies, so the 3D can lay them down one by one.
//
// HOW BOARDS ARE BOUGHT. A row no longer than the longest stock is one
// board — or half of one, when two rows come out of a single board. A row
// longer than stock is spliced: full boards and one cut piece, the splice
// landing on a joist (12, 16 and 20 ft all fall on a 12-, 16- or 24-in.
// layout), every second row turned end for end so the joints stagger. Of
// the ways to buy a row the one with the least lumber bought wins; fewer
// joints breaks a tie. The waste allowance is added in the stock length the
// job uses most.
//
// Boards laid on the diagonal are bought by the foot of board the deck
// swallows, in the longest stock, with 5 points more waste than the
// contractor set — a diagonal throws away a triangle at both ends of every
// board.

import type { DeckFrame } from "./frame";
import type { DeckingProduct } from "./catalog";

/** One board, or one piece of a spliced row, inches. */
export interface BoardPiece {
  /** Centre of the piece. */
  cx: number;
  cy: number;
  /** Its length along the house and its width out from it. */
  sx: number;
  sy: number;
}

export interface DeckSurface {
  product: DeckingProduct;
  diagonal: boolean;
  /** Rows of boards across the deepest part of the deck. */
  rows: number;
  /** Every piece, for the 3D (square-laid boards only; a diagonal is drawn from the outline). */
  pieces: BoardPiece[];
  /** What to buy: boards per stock length, waste included. */
  stock: Array<{ lengthFt: number; count: number }>;
  /** Feet of board the deck needs, and feet bought. */
  netLf: number;
  boughtLf: number;
  /** The waste the purchase was figured with, percent. */
  wastePct: number;
  /** Times a board crosses a joist — two screws or one clip each. */
  crossings: number;
  fastening: "screws" | "hidden";
  fascia: {
    on: boolean;
    kind: "wood" | "composite";
    /** Feet of open edge it covers, the board's height, and 12-ft boards to buy. */
    lf: number;
    heightIn: number;
    boards: number;
  };
}

interface RowPlan {
  /** One row's pieces, left to right, inches. */
  cuts: number[];
  /** Boards to buy for `rows` such rows, by stock length (ft). */
  buy: Map<number, number>;
  boughtIn: number;
  joints: number;
}

/** The cheapest way to buy `rows` rows `lengthIn` long from `stocksFt`. */
export function planRow(lengthIn: number, rows: number, stocksFt: readonly number[]): RowPlan {
  const stocks = [...stocksFt].sort((a, b) => a - b);
  const longest = stocks[stocks.length - 1] * 12;
  const plans: RowPlan[] = [];
  // A piece no longer than stock: the stock that wastes least, several rows from one board where they fit.
  const piece = (len: number): { stock: number; per: number; boards: number; bought: number } => {
    let best: { stock: number; per: number; boards: number; bought: number } | null = null;
    for (const s of stocks) {
      const per = Math.floor((s * 12) / len + 1e-9);
      if (per < 1) continue;
      const boards = Math.ceil(rows / per - 1e-9);
      const bought = boards * s * 12;
      if (!best || bought < best.bought) best = { stock: s, per, boards, bought };
    }
    return best ?? { stock: stocks[stocks.length - 1], per: 1, boards: rows, bought: rows * longest };
  };
  const add = (buy: Map<number, number>, stock: number, n: number) => buy.set(stock, (buy.get(stock) ?? 0) + n);
  if (lengthIn <= longest + 1e-6) {
    const p = piece(lengthIn);
    const buy = new Map<number, number>();
    add(buy, p.stock, p.boards);
    plans.push({ cuts: [lengthIn], buy, boughtIn: p.bought, joints: 0 });
  }
  // Spliced — only a row longer than any board: whole boards of one stock length, then the piece that is left.
  for (const s of lengthIn <= longest + 1e-6 ? [] : stocks) {
    const full = s * 12;
    for (let n = 1; n * full < lengthIn - 1e-6 && n <= 6; n++) {
      const rest = lengthIn - n * full;
      if (rest > longest + 1e-6 || rest < 12) continue;
      const p = piece(rest);
      const buy = new Map<number, number>();
      add(buy, s, n * rows);
      add(buy, p.stock, p.boards);
      plans.push({ cuts: [...new Array<number>(n).fill(full), rest], buy, boughtIn: n * rows * full + p.bought, joints: n });
    }
  }
  if (plans.length === 0) {
    // Longer than anything above reaches: all longest boards, the last one cut.
    const n = Math.ceil(lengthIn / longest - 1e-9);
    const buy = new Map<number, number>();
    add(buy, stocks[stocks.length - 1], n * rows);
    const cuts = new Array<number>(n - 1).fill(longest);
    cuts.push(lengthIn - (n - 1) * longest);
    return { cuts, buy, boughtIn: n * rows * longest, joints: n - 1 };
  }
  return plans.reduce((m, p) => (p.boughtIn < m.boughtIn - 1e-6 || (Math.abs(p.boughtIn - m.boughtIn) <= 1e-6 && p.joints < m.joints) ? p : m));
}

/** The boards and the fascia for a frame. */
export function deckSurface(frame: DeckFrame): DeckSurface {
  const { design, decking: product } = frame;
  const diagonal = design.decking.diagonal;
  const zones = frame.zones.map((z) => z.zone);
  const depth = Math.max(...zones.map((z) => z.y1));
  const pitch = product.widthIn + product.gapIn;
  const againstHouse = design.placement !== "detached";
  // A quarter inch off the wall, so water and the siding have room.
  const first = againstHouse ? 0.25 : 0;
  const rows = Math.max(1, Math.ceil((depth - first + product.gapIn) / pitch - 1e-9));
  const wastePct = design.decking.wastePct + (diagonal ? 5 : 0);
  const joistXs = frame.joists.filter((j) => !j.sister).map((j) => j.x);

  const pieces: BoardPiece[] = [];
  const buy = new Map<number, number>();
  let netIn = 0;
  let crossings = 0;
  if (!diagonal) {
    // Rows by the length of deck under them; an L has two lengths.
    const groups = new Map<string, { x0: number; x1: number; ys: Array<{ y: number; w: number }> }>();
    for (let r = 0; r < rows; r++) {
      const y0 = first + r * pitch;
      const w = Math.min(product.widthIn, depth - y0);
      if (!(w > 0.25)) continue;
      const yc = y0 + w / 2;
      const under = zones.filter((z) => yc >= z.y0 && yc <= z.y1);
      if (under.length === 0) continue;
      const x0 = Math.min(...under.map((z) => z.x0));
      const x1 = Math.max(...under.map((z) => z.x1));
      const key = `${x0}:${x1}`;
      const g = groups.get(key) ?? { x0, x1, ys: [] };
      g.ys.push({ y: yc, w });
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const length = g.x1 - g.x0;
      const plan = planRow(length, g.ys.length, product.lengthsFt);
      for (const [stock, n] of plan.buy) buy.set(stock, (buy.get(stock) ?? 0) + n);
      netIn += length * g.ys.length;
      crossings += g.ys.length * joistXs.filter((x) => x > g.x0 && x < g.x1).length;
      g.ys.forEach((row, i) => {
        // Every second row runs the other way, so the joints stagger.
        const cuts = i % 2 === 0 ? plan.cuts : [...plan.cuts].reverse();
        let at = g.x0;
        for (const c of cuts) {
          pieces.push({ cx: at + c / 2, cy: row.y, sx: c, sy: row.w });
          at += c;
        }
      });
    }
  } else {
    const areaIn = zones.reduce((a, z) => a + (z.x1 - z.x0) * (z.y1 - z.y0), 0);
    netIn = areaIn / pitch;
    // On the diagonal a board meets the joists farther apart by the square root of two.
    crossings = Math.round(netIn / (frame.spacingIn * Math.SQRT2));
    const longest = Math.max(...product.lengthsFt);
    buy.set(longest, Math.ceil(netIn / (longest * 12) - 1e-9));
  }

  // The waste allowance, in the length the job uses most.
  const boughtBefore = [...buy].reduce((a, [s, n]) => a + s * n, 0);
  if (wastePct > 0 && buy.size > 0) {
    const [main] = [...buy].sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];
    buy.set(main, (buy.get(main) ?? 0) + Math.ceil((boughtBefore * wastePct) / 100 / main - 1e-9));
  }
  const stock = [...buy].filter(([, n]) => n > 0).map(([lengthFt, count]) => ({ lengthFt, count })).sort((a, b) => a.lengthFt - b.lengthFt);

  const fasteningAsked = design.decking.fastening;
  const fastening: DeckSurface["fastening"] = fasteningAsked === "hidden" && product.hiddenFasteners ? "hidden" : fasteningAsked === "screws" ? "screws" : product.hiddenFasteners && product.family !== "hardwood" && product.family !== "modified" ? "hidden" : "screws";

  // Fascia: on by default where the boards are not wood, covering the rim on every open edge.
  const synthetic = product.family === "composite" || product.family === "pvc" || product.family === "mineral" || product.family === "aluminum";
  const fasciaOn = design.decking.fascia === "match" || (design.decking.fascia === "auto" && synthetic);
  const fasciaLf = frame.openEdgeFt;
  return {
    product,
    diagonal,
    rows,
    pieces,
    stock,
    netLf: Math.round((netIn / 12) * 10) / 10,
    boughtLf: stock.reduce((a, s) => a + s.lengthFt * s.count, 0),
    wastePct,
    crossings,
    fastening,
    fascia: {
      on: fasciaOn,
      kind: synthetic ? "composite" : "wood",
      lf: fasciaOn ? Math.round(fasciaLf * 10) / 10 : 0,
      heightIn: frame.joistTopIn - frame.joistBottomIn,
      // Ten percent for the mitres and the joints, in 12-ft boards.
      boards: fasciaOn ? Math.ceil((fasciaLf * 1.1) / 12 - 1e-9) : 0,
    },
  };
}
