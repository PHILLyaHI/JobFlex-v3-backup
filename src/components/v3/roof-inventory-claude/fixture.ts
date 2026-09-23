// DEV FIXTURE (2026-09-22) — a believable roofing shop's warehouse, for the
// dev-only preview at /dev/roof-inventory. It exists because the redesign has
// to be looked at in a browser, and the only database the shared dev server
// can reach is a copy of production, where no test account may sign in. The
// numbers are run through the REAL arithmetic (lib/inventory stockRows /
// untrackedLines), so every state the board can show is a state the live
// read would produce. Never imported by a production route.

import type { BoardOrder, BoardProposal, BoardSupplier, TradeBoardData } from "@/lib/inventoryBoard";
import type { ItemFacts, StockFacts, StockMove } from "@/lib/inventoryDashboard";
import { stockKey, stockRows, untrackedLines, type StockItem, type StockLine } from "@/lib/inventory";

export type FixtureState = "full" | "clear" | "empty";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const SUPPLIERS: BoardSupplier[] = [
  { id: "s-abc", name: "ABC Supply · Kent", email: "orders@abcsupply-kent.example", phone: "(253) 872-4100", website: "abcsupply.com", itemCount: 8 },
  { id: "s-beacon", name: "Beacon Roofing Supply · Seattle", email: "seattle.orders@beacon.example", phone: "(206) 763-2200", website: null, itemCount: 4 },
  { id: "s-pmw", name: "Pacific Metal Works · Tacoma", email: null, phone: "(253) 404-1180", website: "pacificmetalworks.example", itemCount: 3 },
];

type Seed = [name: string, unit: string, onHand: number, reorderPoint: number | null, supplierId: string | null, sku: string | null, lastCost: number | null];
const ITEMS: Seed[] = [
  ["Architectural shingle · 30-yr", "square", 90, 30, "s-abc", "GAF-THD-CHR", 118],
  ["Synthetic underlayment", "square", 80, 20, "s-abc", "RHN-SYN-10", 64],
  ["Ice & water shield · eaves + valleys", "sqft", 1400, null, "s-beacon", "GP-IWS-200", 1.15],
  ["Drip edge · F-style (standard) · 2 in face", "linear ft", 360, null, "s-pmw", "PMW-DE-F2", 1.9],
  ["Starter strip · eaves + rakes", "linear ft", 800, null, "s-abc", "GAF-PSS-120", 1.2],
  ["Hip & ridge cap", "linear ft", 180, null, null, null, 3.4],
  ["Pipe boot · 1½–3 in", "each", 14, 6, "s-beacon", "OAT-PB3", 18],
  ["Pipe boot · 3–4 in", "each", 5, 4, "s-beacon", "OAT-PB4", 24],
  ["Ridge vent", "linear ft", 140, null, "s-abc", "GAF-CB-4", 4.1],
  ["Roofing nails & fasteners", "square", 110, 40, "s-abc", null, 9],
  ["Chimney flashing kit · Medium (to 36 in)", "each", 3, null, "s-pmw", "PMW-CFK-M", 64],
  ["Soffit / intake vent · 16 × 8 in", "each", 24, null, "s-beacon", null, 12],
  ["Sealant, caulk & pipe collars", "square", 60, 20, "s-abc", null, 6],
  ["Impact-resistant shingle · Class 4", "square", 12, null, "s-abc", "OC-DUR-FLX", 142],
  ["Standing-seam metal", "square", 0, null, "s-pmw", null, null],
  ["Cedar shake", "square", 0, null, null, null, null],
  ["Concrete tile", "square", 0, null, null, null, null],
  ["TPO 60 mil · mech attached", "square", 0, null, null, null, null],
  ["Valley metal · Open metal · W-valley 24 in", "linear ft", 0, null, null, null, null],
];

const L = (name: string, quantity: number, unit: string): StockLine => ({ name, quantity, unit });
const ROOF_34 = [
  L("Architectural shingle · 30-yr", 34, "square"),
  L("Synthetic underlayment", 34, "square"),
  L("Ice & water shield · eaves + valleys", 450, "sqft"),
  L("Drip edge · F-style (standard) · 2 in face", 210, "linear ft"),
  L("Starter strip · eaves + rakes", 260, "linear ft"),
  L("Hip & ridge cap", 110, "linear ft"),
  L("Pipe boot · 1½–3 in", 3, "each"),
  L("Pipe boot · 3–4 in", 1, "each"),
  L("Ridge vent", 44, "linear ft"),
  L("Roofing nails & fasteners", 34, "square"),
  L("Sealant, caulk & pipe collars", 34, "square"),
];
const ROOF_28 = [
  L("Architectural shingle · 30-yr", 28, "square"),
  L("Synthetic underlayment", 28, "square"),
  L("Ice & water shield · eaves + valleys", 380, "sqft"),
  L("Drip edge · F-style (standard) · 2 in face", 190, "linear ft"),
  L("Starter strip · eaves + rakes", 240, "linear ft"),
  L("Hip & ridge cap", 90, "linear ft"),
  L("Pipe boot · 3–4 in", 2, "each"),
  L("Ridge vent", 38, "linear ft"),
  L("Roofing nails & fasteners", 28, "square"),
];

type P = Omit<BoardProposal, "createdAt" | "jobStartsAt"> & { created: number; starts: number | null };
const PROPOSALS: P[] = [
  { id: "p-hartley", title: "Roof replacement — Hartley residence, Kent", client: "Dana Hartley", status: "ACCEPTED", total: 18_450, created: -12, jobId: "j-hartley", loaded: false, starts: 2, inferred: false, linked: true, lines: ROOF_34 },
  { id: "p-okafor", title: "Tear-off & re-roof — Okafor, Renton", client: "Chidi Okafor", status: "ACCEPTED", total: 24_300, created: -9, jobId: "j-okafor", loaded: false, starts: 9, inferred: false, linked: true, lines: ROOF_28 },
  {
    id: "p-lindqvist",
    title: "Re-roof — Lindqvist, Bothell",
    client: "Erik Lindqvist",
    status: "SENT",
    total: 16_900,
    created: -5,
    jobId: null,
    loaded: false,
    starts: null,
    inferred: false,
    linked: true,
    lines: [L("Architectural shingle · 30-yr", 26, "square"), L("Synthetic underlayment", 26, "square"), L("Ice & water shield · eaves + valleys", 300, "sqft"), L("Hip & ridge cap", 80, "linear ft"), L("Skylight flashing kit · 2×4", 2, "each")],
  },
  { id: "p-nguyen", title: "Standing-seam porch roof — Nguyen, Kirkland", client: "Linh Nguyen", status: "VIEWED", total: 9_800, created: -3, jobId: null, loaded: false, starts: null, inferred: false, linked: true, lines: [L("Standing-seam metal", 6, "square"), L("Drip edge · F-style (standard) · 2 in face", 60, "linear ft")] },
  { id: "p-castillo", title: "Storm repair — Castillo, Federal Way", client: "Rosa Castillo", status: "DRAFT", total: 3_400, created: -1, jobId: null, loaded: false, starts: null, inferred: true, linked: true, lines: [L("Architectural shingle · 30-yr", 4, "square"), L("Synthetic underlayment", 4, "square"), L("Step flashing · 4×4×8", 40, "each")] },
  { id: "p-moreau", title: "Cedar shake repair — Moreau, Mercer Island", client: "Claire Moreau", status: "ACCEPTED", total: 6_400, created: -20, jobId: "j-moreau", loaded: true, starts: -1, inferred: false, linked: true, lines: [L("Cedar shake", 3, "square")] },
  { id: "p-park", title: "Roof replacement — Park, Issaquah", client: "Min-jun Park", status: "COMPLETED", total: 21_000, created: -34, jobId: "j-park", loaded: true, starts: -18, inferred: false, linked: true, lines: ROOF_28 },
  { id: "p-harbor", title: "Commercial TPO — Harbor Self Storage, Tukwila", client: "Harbor Self Storage LLC", status: "SENT", total: 58_200, created: -6, jobId: null, loaded: false, starts: null, inferred: false, linked: false, lines: [L("TPO 60 mil · mech attached", 120, "square")] },
  { id: "p-brooks", title: "Gutter and roof — Brooks, Auburn", client: "Tanya Brooks", status: "DECLINED", total: 12_100, created: -26, jobId: null, loaded: false, starts: null, inferred: false, linked: true, lines: [] },
];

const MOVES: Array<[item: string, kind: string, quantity: number, daysAgo: number, actor: string | null, job: string | null, note: string | null]> = [
  ["Architectural shingle · 30-yr", "RECEIVED", 40, 0.2, "Marcus Webb", null, "ABC Supply delivery"],
  ["Cedar shake", "PICKED", -3, 1.1, "Luis Ortega", "Cedar shake repair — Moreau, Mercer Island", null],
  ["Pipe boot · 1½–3 in", "ADJUST", 14, 2, "Marcus Webb", null, "Counted"],
  ["Synthetic underlayment", "USED", -28, 4, "Luis Ortega", "Roof replacement — Park, Issaquah", null],
  ["Starter strip · eaves + rakes", "RETURNED", 40, 5, "Luis Ortega", "Roof replacement — Park, Issaquah", "Left over"],
  ["Ice & water shield · eaves + valleys", "RECEIVED", 600, 9, "Marcus Webb", null, null],
  ["Ridge vent", "ADJUST", -4, 12, "Marcus Webb", null, "Damaged in the yard"],
  ["Roofing nails & fasteners", "PICKED", -28, 18, "Luis Ortega", "Roof replacement — Park, Issaquah", null],
];

const USED: Record<string, number> = {
  "Architectural shingle · 30-yr": 28,
  "Synthetic underlayment": 28,
  "Starter strip · eaves + rakes": 190,
  "Roofing nails & fasteners": 28,
  "Ice & water shield · eaves + valleys": 380,
  "Drip edge · F-style (standard) · 2 in face": 190,
  "Hip & ridge cap": 90,
  "Ridge vent": 38,
};

export function roofFixture(state: FixtureState = "full"): { data: TradeBoardData; facts: StockFacts } {
  const seeds = state === "empty" ? [] : ITEMS;
  const stock: StockItem[] = seeds.map(([name, unit, onHand, reorderPoint, supplierId, sku], i) => ({
    id: `i-${i}`,
    name,
    key: stockKey(name),
    unit,
    // "clear" = the same shelf with enough of everything and no one short.
    onHand: state === "clear" && onHand > 0 ? onHand * 4 : onHand,
    reorderPoint,
    supplierId,
    supplierName: SUPPLIERS.find((s) => s.id === supplierId)?.name ?? null,
    supplierSku: sku,
  }));
  const proposals: BoardProposal[] = (state === "empty" ? [] : PROPOSALS).map(({ created, starts, ...p }) => ({ ...p, createdAt: at(created), jobStartsAt: starts == null ? null : at(starts) }));
  const sold = proposals.filter((p) => p.linked && p.status === "ACCEPTED" && !p.loaded);
  const open = proposals.filter((p) => p.linked && ["DRAFT", "SENT", "VIEWED"].includes(p.status));
  const rows = stockRows(stock, sold, open);
  const orders: BoardOrder[] =
    state === "full"
      ? [
          {
            id: "po-beacon",
            supplier: "Beacon Roofing Supply · Seattle",
            sentAt: at(-2),
            lines: [
              { name: "Ice & water shield · eaves + valleys", quantity: 400 },
              { name: "Pipe boot · 3–4 in", quantity: 6 },
            ],
          },
        ]
      : [];

  const items: Record<string, ItemFacts> = {};
  seeds.forEach(([name, , , , , , lastCost], i) => {
    const used = USED[name] ?? 0;
    items[`i-${i}`] = { lastCost, used, received: name.startsWith("Architectural") ? 40 : 0, usedPerDay: used / 30, lastMoveAt: at(-3), lastCountAt: name.startsWith("Pipe boot · 1") ? at(-2) : null };
  });
  const recent: StockMove[] = (state === "empty" ? [] : MOVES).map(([itemName, kind, quantity, daysAgo, actor, job, note], i) => {
    const idx = seeds.findIndex((s) => s[0] === itemName);
    return { id: `m-${i}`, itemId: `i-${idx}`, itemName, unit: seeds[idx]?.[1] ?? "each", kind, quantity, note, actor, jobId: job ? `j-${i}` : null, jobTitle: job, at: at(-daysAgo) };
  });
  const valued = stock.filter((s, i) => (items[`i-${i}`]?.lastCost ?? null) != null);
  const value = stock.reduce((n, s, i) => n + s.onHand * (items[`i-${i}`]?.lastCost ?? 0), 0);

  return {
    data: {
      trade: "roof",
      orders,
      proposals,
      rows,
      suppliers: state === "empty" ? [] : SUPPLIERS,
      untracked: untrackedLines(stock, [...sold, ...open].flatMap((p) => p.lines)),
      presets: { missing: state === "empty" ? 97 : 78, total: 97 },
      pipeline: {
        open: open.length,
        openTotal: open.reduce((a, p) => a + p.total, 0),
        sold: sold.length,
        soldTotal: sold.reduce((a, p) => a + p.total, 0),
        low: rows.filter((r) => r.low).length,
        short: rows.filter((r) => r.short > 0).length,
      },
    },
    facts: {
      items,
      recent,
      value,
      valued: valued.length,
      itemCount: stock.length,
      nextLoads: sold.map((p) => ({ jobId: p.jobId!, proposalId: p.id, title: p.title, startsAt: p.jobStartsAt })),
      windowDays: 30,
    },
  };
}
