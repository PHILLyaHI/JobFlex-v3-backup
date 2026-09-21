// THE INVENTORY DASHBOARD'S EXTRA FACTS (2026-09-20) — server only.
//
// Owner: "make kind of dashboard for inventory, smart." The board's read
// (lib/inventoryBoard) carries the shelf and the work counted against it;
// this adds what a dashboard needs on top and nothing the board already
// knows:
//
//   value      what the shelf is worth — on hand × the item's last cost,
//              over the items that have a cost;
//   pace       how fast each item goes — the net taken out over the last
//              ninety days, so the dashboard can say "about 12 days at this
//              pace" next to what is available;
//   history    when an item last moved and was last counted, and the last
//              fifteen movements across the trade, with who and which job;
//   next loads the sold jobs still to load, soonest first, so the dashboard
//              can check the next truck against the shelf.
//
// Not a "use server" action: the pages call it with a trusted organizationId.

import { db } from "@/lib/db";

export type StockMove = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  /** RECEIVED | PICKED | USED | RETURNED | ADJUST */
  kind: string;
  /** Signed as stored: received and returned add, picked and used take away. */
  quantity: number;
  note: string | null;
  actor: string | null;
  jobId: string | null;
  jobTitle: string | null;
  at: string;
};

export type ItemFacts = {
  lastCost: number | null;
  /** Net taken out over the window: picked and used, less what came back. */
  used: number;
  received: number;
  /** Net use per day over the window, 0 when nothing went out. */
  usedPerDay: number;
  lastMoveAt: string | null;
  lastCountAt: string | null;
};

export type NextLoad = { jobId: string; proposalId: string; title: string; startsAt: string | null };

export type StockFacts = {
  /** Keyed by item id; an item with no history is absent. */
  items: Record<string, ItemFacts>;
  recent: StockMove[];
  /** Σ on hand × last cost, over the items that have a cost. */
  value: number;
  /** How many items carry a cost — the value is only as complete as this. */
  valued: number;
  itemCount: number;
  nextLoads: NextLoad[];
  windowDays: number;
};

const WINDOW_DAYS = 90;
/** A shop that started tracking last week has no ninety-day pace: the span is at least two weeks. */
const MIN_PACE_DAYS = 14;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function loadStockFacts(organizationId: string, trade: string): Promise<StockFacts> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const [items, moves, loads] = await Promise.all([
    db.inventoryItem.findMany({ where: { organizationId, trade }, select: { id: true, name: true, unit: true, onHand: true, lastCost: true } }),
    db.inventoryMovement.findMany({
      where: { item: { organizationId, trade }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { id: true, itemId: true, kind: true, quantity: true, note: true, actorId: true, jobId: true, createdAt: true },
    }),
    db.job.findMany({
      where: { organizationId, materialsLoadedAt: null, proposal: { trade, status: "ACCEPTED" } },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
      take: 10,
      select: { id: true, title: true, startsAt: true, proposalId: true },
    }),
  ]);

  const actorIds = [...new Set(moves.map((m) => m.actorId).filter((x): x is string => !!x))];
  const jobIds = [...new Set(moves.map((m) => m.jobId).filter((x): x is string => !!x))];
  const [actors, jobs] = await Promise.all([
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    jobIds.length ? db.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const jobTitle = new Map(jobs.map((j) => [j.id, j.title]));
  const byId = new Map(items.map((i) => [i.id, i]));

  const facts: Record<string, ItemFacts> = {};
  const firstMove = new Map<string, number>();
  for (const m of moves) {
    const f = (facts[m.itemId] ??= { lastCost: byId.get(m.itemId)?.lastCost ?? null, used: 0, received: 0, usedPerDay: 0, lastMoveAt: null, lastCountAt: null });
    const at = m.createdAt.toISOString();
    if (!f.lastMoveAt) f.lastMoveAt = at; // the query is newest first
    if (m.kind === "ADJUST" && m.note === "Counted" && !f.lastCountAt) f.lastCountAt = at;
    if (m.kind === "PICKED" || m.kind === "USED") f.used += -m.quantity;
    else if (m.kind === "RETURNED") f.used -= m.quantity;
    else if (m.kind === "RECEIVED") f.received += m.quantity;
    firstMove.set(m.itemId, m.createdAt.getTime());
  }
  for (const it of items) {
    const f = facts[it.id];
    if (!f) {
      if (it.lastCost != null) facts[it.id] = { lastCost: it.lastCost, used: 0, received: 0, usedPerDay: 0, lastMoveAt: null, lastCountAt: null };
      continue;
    }
    const spanDays = Math.max(MIN_PACE_DAYS, (Date.now() - (firstMove.get(it.id) ?? Date.now())) / 86_400_000);
    f.used = r2(Math.max(0, f.used));
    f.received = r2(f.received);
    f.usedPerDay = f.used > 0 ? f.used / spanDays : 0;
  }

  const priced = items.filter((i) => i.lastCost != null && i.lastCost > 0);
  return {
    items: facts,
    recent: moves.slice(0, 15).map((m) => ({
      id: m.id,
      itemId: m.itemId,
      itemName: byId.get(m.itemId)?.name ?? "Item",
      unit: byId.get(m.itemId)?.unit ?? "each",
      kind: m.kind,
      quantity: m.quantity,
      note: m.note,
      actor: m.actorId ? (actorName.get(m.actorId) ?? null) : null,
      jobId: m.jobId,
      jobTitle: m.jobId ? (jobTitle.get(m.jobId) ?? null) : null,
      at: m.createdAt.toISOString(),
    })),
    value: r2(priced.reduce((n, i) => n + i.onHand * (i.lastCost ?? 0), 0)),
    valued: priced.length,
    itemCount: items.length,
    nextLoads: loads.filter((j) => j.proposalId).map((j) => ({ jobId: j.id, proposalId: j.proposalId!, title: j.title, startsAt: j.startsAt ? j.startsAt.toISOString() : null })),
    windowDays: WINDOW_DAYS,
  };
}
