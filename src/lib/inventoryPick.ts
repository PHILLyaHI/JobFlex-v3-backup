// A PROPOSAL'S PLACE IN THE WAREHOUSE (2026-09-20) — server module.
//
// Owner: proposals connected to the inventory show the list of materials
// to pick up, the worker's job carries the same list, and the connection
// can be made or broken at any time. One answer for every page that asks:
//   linkedTradeOf   the trade a proposal draws stock from — none when it is
//                   an estimate only (Proposal.inventoryLinked false) or
//                   belongs to no trade (lib/inventoryTrade);
//   pickForProposal the crew's list against that trade's shelf.

import { db } from "@/lib/db";
import { pickList, type PickRow, type StockItem, type TradeId } from "@/lib/inventory";
import { explodeLines } from "@/lib/inventoryBom";
import { proposalTrade } from "@/lib/inventoryTrade";

export type LinkedProposal = {
  trade: string | null;
  inventoryLinked: boolean | null;
  title: string;
  description?: string | null;
  lineItems: ReadonlyArray<{ name: string; quantity: number; measurementType: string }>;
};

export function linkedTradeOf(p: LinkedProposal): TradeId | null {
  if (p.inventoryLinked === false) return null;
  return proposalTrade({ trade: p.trade, title: p.title, description: p.description, lines: p.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.measurementType })) });
}

/** What to take from the warehouse for a proposal; empty when it is an estimate only. */
export async function pickForProposal(organizationId: string, p: LinkedProposal): Promise<{ trade: TradeId | null; rows: PickRow[] }> {
  const trade = linkedTradeOf(p);
  if (!trade || !p.lineItems.length) return { trade, rows: [] };
  const items: StockItem[] = (await db.inventoryItem.findMany({ where: { organizationId, trade } })).map((i) => ({ id: i.id, name: i.name, key: i.key, unit: i.unit, onHand: i.onHand, reorderPoint: i.reorderPoint, supplierId: i.supplierId }));
  return { trade, rows: pickList(items, explodeLines(trade, p.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.measurementType.toLowerCase().replace("_", " ") })))) };
}
