"use server";

// WAREHOUSE STOCK — the writes (2026-09-20). The reads live in
// lib/inventoryBoard (server module); the arithmetic in lib/inventory.
//
// Office writes (manager or owner): items, suppliers, stock received or
// counted, the purchase order. One crew write: "loaded" on a job's pick
// list, which takes the materials out of the warehouse and frees the
// reservation — allowed to the office and to a worker ON that job.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendOrgEmail } from "@/lib/email/orgSend";
import { isTradeId, pickList, purchaseOrderText, stockKey, type StockItem } from "@/lib/inventory";
import { presetItems } from "@/lib/inventoryPresets";
import { explodeLines } from "@/lib/inventoryBom";
import { NoOrgError, requireManager, requireOrg, UnauthorizedError, isWorkerRole } from "@/lib/orgContext";

type Fail = { ok: false; error: string };
const fail = (err: unknown): Fail =>
  err instanceof UnauthorizedError
    ? { ok: false, error: "Manager access required" }
    : err instanceof NoOrgError
      ? { ok: false, error: "No organization" }
      : { ok: false, error: err instanceof Error ? err.message : "Could not save" };

const boardPath = (trade: string) => `/dashboard/${trade === "roof" ? "roof" : trade}-estimator/board`;
const money = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** Add or edit a stock item. An existing item of the same trade and name is updated. */
export async function upsertInventoryItem(input: {
  trade: string;
  name: string;
  unit?: string;
  onHand?: number;
  reorderPoint?: number | null;
  supplierId?: string | null;
  supplierSku?: string | null;
  lastCost?: number | null;
}): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { organizationId } = await requireManager();
    if (!isTradeId(input.trade)) return { ok: false, error: "Unknown trade" };
    const name = input.name.trim().slice(0, 120);
    const key = stockKey(name);
    if (!key) return { ok: false, error: "Give the item a name" };
    if (input.supplierId) {
      const sup = await db.supplier.findFirst({ where: { id: input.supplierId, organizationId }, select: { id: true } });
      if (!sup) return { ok: false, error: "That supplier is not on this company" };
    }
    const data = {
      name,
      unit: (input.unit ?? "each").trim().slice(0, 24) || "each",
      reorderPoint: input.reorderPoint == null || input.reorderPoint === undefined ? null : Math.max(0, money(input.reorderPoint)),
      supplierId: input.supplierId ?? null,
      supplierSku: input.supplierSku?.trim() || null,
      lastCost: input.lastCost == null ? null : Math.max(0, money(input.lastCost)),
    };
    const row = await db.inventoryItem.upsert({
      where: { organizationId_trade_key: { organizationId, trade: input.trade, key } },
      create: { organizationId, trade: input.trade, key, onHand: Math.max(0, money(input.onHand ?? 0)), ...data },
      update: data,
      select: { id: true },
    });
    revalidatePath(boardPath(input.trade));
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err);
  }
}

/** Stock arrived (positive) or left outside a job (negative). */
export async function receiveStock(itemId: string, quantity: number, note?: string): Promise<{ ok: true; onHand: number } | Fail> {
  try {
    const { organizationId, user } = await requireManager();
    const qty = money(quantity);
    if (!qty) return { ok: false, error: "Enter a quantity" };
    const item = await db.inventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true, trade: true, onHand: true } });
    if (!item) return { ok: false, error: "That item is not on this company" };
    const [, updated] = await db.$transaction([
      db.inventoryMovement.create({ data: { itemId: item.id, kind: qty > 0 ? "RECEIVED" : "ADJUST", quantity: qty, note: note?.trim() || null, actorId: user.id } }),
      db.inventoryItem.update({ where: { id: item.id }, data: { onHand: { increment: qty } }, select: { onHand: true } }),
    ]);
    revalidatePath(boardPath(item.trade));
    return { ok: true, onHand: updated.onHand };
  } catch (err) {
    return fail(err);
  }
}

/** A physical count: set what is on the shelf; the difference is booked as an adjustment. */
export async function countStock(itemId: string, onHand: number): Promise<{ ok: true; onHand: number } | Fail> {
  try {
    const { organizationId, user } = await requireManager();
    const target = Math.max(0, money(onHand));
    const item = await db.inventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true, trade: true, onHand: true } });
    if (!item) return { ok: false, error: "That item is not on this company" };
    const diff = money(target - item.onHand);
    if (diff !== 0) {
      await db.$transaction([
        db.inventoryMovement.create({ data: { itemId: item.id, kind: "ADJUST", quantity: diff, note: "Counted", actorId: user.id } }),
        db.inventoryItem.update({ where: { id: item.id }, data: { onHand: target } }),
      ]);
    }
    revalidatePath(boardPath(item.trade));
    return { ok: true, onHand: target };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteInventoryItem(itemId: string): Promise<{ ok: true } | Fail> {
  try {
    const { organizationId } = await requireManager();
    const item = await db.inventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true, trade: true } });
    if (!item) return { ok: false, error: "That item is not on this company" };
    await db.inventoryItem.delete({ where: { id: item.id } });
    revalidatePath(boardPath(item.trade));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertSupplier(input: { id?: string | null; name: string; email?: string | null; phone?: string | null; website?: string | null; notes?: string | null }): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { organizationId } = await requireManager();
    const name = input.name.trim().slice(0, 120);
    if (!name) return { ok: false, error: "Give the supplier a name" };
    const email = input.email?.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email does not look right" };
    const data = { name, email, phone: input.phone?.trim() || null, website: input.website?.trim() || null, notes: input.notes?.trim() || null };
    let id: string;
    if (input.id) {
      const existing = await db.supplier.findFirst({ where: { id: input.id, organizationId }, select: { id: true } });
      if (!existing) return { ok: false, error: "That supplier is not on this company" };
      id = (await db.supplier.update({ where: { id: existing.id }, data, select: { id: true } })).id;
    } else {
      id = (await db.supplier.create({ data: { organizationId, ...data }, select: { id: true } })).id;
    }
    for (const t of ["fence", "roof", "hvac"]) revalidatePath(boardPath(t));
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Email a purchase order to a supplier for the given items and quantities.
 * The company's own mail (Gmail when connected, else the platform sender).
 */
export async function sendPurchaseOrder(input: { trade: string; supplierId: string; lines: Array<{ itemId: string; quantity: number }>; note?: string }): Promise<{ ok: true; to: string; count: number } | Fail> {
  try {
    const { organizationId, user } = await requireManager();
    if (!isTradeId(input.trade)) return { ok: false, error: "Unknown trade" };
    const [org, supplier] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true, gmailSettingsJson: true, gmailTokensJson: true, billingEmail: true } }),
      db.supplier.findFirst({ where: { id: input.supplierId, organizationId } }),
    ]);
    if (!org) return { ok: false, error: "No organization" };
    if (!supplier) return { ok: false, error: "That supplier is not on this company" };
    if (!supplier.email) return { ok: false, error: `${supplier.name} has no email yet — add one on the Suppliers card` };
    const wanted = new Map(input.lines.filter((l) => l.quantity > 0).map((l) => [l.itemId, Math.ceil(l.quantity)]));
    if (!wanted.size) return { ok: false, error: "Nothing to order" };
    const items = await db.inventoryItem.findMany({ where: { id: { in: [...wanted.keys()] }, organizationId, trade: input.trade } });
    if (!items.length) return { ok: false, error: "Those items are not on this company" };
    const text = purchaseOrderText({
      company: org.name ?? "Our company",
      supplier: supplier.name,
      trade: input.trade,
      note: input.note,
      lines: items.map((it) => ({ name: it.name, sku: it.supplierSku, unit: it.unit, quantity: wanted.get(it.id) ?? 0 })),
    });
    await sendOrgEmail(org, { to: supplier.email, subject: text.subject, html: text.html });
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        kind: "PURCHASE_ORDER_SENT",
        summary: `Purchase order emailed to ${supplier.name} — ${items.length} ${input.trade} item(s)`,
        meta: JSON.stringify({ supplierId: supplier.id, trade: input.trade, href: boardPath(input.trade), lines: items.map((it) => ({ id: it.id, name: it.name, quantity: wanted.get(it.id) ?? 0 })) }),
      },
    });
    revalidatePath(boardPath(input.trade));
    return { ok: true, to: supplier.email, count: items.length };
  } catch (err) {
    return fail(err);
  }
}

/**
 * The crew loaded the truck: every tracked line on the job's pick list leaves
 * the warehouse, the job is stamped, and the sold proposal's reservation is
 * released by that stamp. The office may do it too. Done once per job.
 */
export async function loadJobMaterials(jobId: string): Promise<{ ok: true; taken: number; untracked: number } | Fail> {
  try {
    const ctx = await requireOrg();
    const { organizationId } = ctx;
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
      select: {
        id: true,
        materialsLoadedAt: true,
        proposal: { select: { id: true, trade: true, lineItems: { where: { materialCost: { gt: 0 } }, select: { name: true, quantity: true, measurementType: true } } } },
        assignments: { select: { worker: { select: { userId: true } } } },
      },
    });
    if (!job) return { ok: false, error: "Job not found" };
    if (isWorkerRole(ctx.role) && !job.assignments.some((a) => a.worker.userId === ctx.user.id)) return { ok: false, error: "You are not on this job" };
    if (job.materialsLoadedAt) return { ok: false, error: "Already loaded" };
    if (!job.proposal || !isTradeId(job.proposal.trade)) {
      await db.job.update({ where: { id: job.id }, data: { materialsLoadedAt: new Date() } });
      return { ok: true, taken: 0, untracked: job.proposal?.lineItems.length ?? 0 };
    }
    const items = await db.inventoryItem.findMany({ where: { organizationId, trade: job.proposal.trade } });
    const stock: StockItem[] = items.map((i) => ({ id: i.id, name: i.name, key: i.key, unit: i.unit, onHand: i.onHand, reorderPoint: i.reorderPoint, supplierId: i.supplierId }));
    const rows = pickList(stock, explodeLines(job.proposal.trade, job.proposal.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.measurementType }))));
    const tracked = rows.filter((r) => r.itemId);
    await db.$transaction([
      ...tracked.flatMap((r) => [
        db.inventoryMovement.create({ data: { itemId: r.itemId!, kind: "PICKED", quantity: -r.quantity, jobId: job.id, proposalId: job.proposal!.id, actorId: ctx.user.id } }),
        db.inventoryItem.update({ where: { id: r.itemId! }, data: { onHand: { decrement: r.quantity } } }),
      ]),
      db.job.update({ where: { id: job.id }, data: { materialsLoadedAt: new Date() } }),
    ]);
    revalidatePath(`/dashboard/jobs/${job.id}`);
    revalidatePath(boardPath(job.proposal.trade));
    return { ok: true, taken: tracked.length, untracked: rows.length - tracked.length };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Leftovers back on the shelf after the job: each line is what came back,
 * never more than was taken. The crew on the job or the office.
 */
export async function returnJobMaterials(jobId: string, lines: Array<{ itemId: string; quantity: number }>): Promise<{ ok: true; returned: number } | Fail> {
  try {
    const ctx = await requireOrg();
    const job = await db.job.findFirst({ where: { id: jobId, organizationId: ctx.organizationId }, select: { id: true, materialsLoadedAt: true, assignments: { select: { worker: { select: { userId: true } } } } } });
    if (!job) return { ok: false, error: "Job not found" };
    if (isWorkerRole(ctx.role) && !job.assignments.some((a) => a.worker.userId === ctx.user.id)) return { ok: false, error: "You are not on this job" };
    if (!job.materialsLoadedAt) return { ok: false, error: "Nothing was loaded for this job yet" };
    const moves = await db.inventoryMovement.findMany({ where: { jobId: job.id, kind: { in: ["PICKED", "RETURNED"] } }, select: { itemId: true, kind: true, quantity: true } });
    const taken = new Map<string, number>();
    // PICKED rows are stored negative and RETURNED rows positive, so negating
    // both gives what is still out on the job.
    for (const m of moves) taken.set(m.itemId, (taken.get(m.itemId) ?? 0) - m.quantity);
    const writes = [];
    let returned = 0;
    for (const l of lines) {
      const room = taken.get(l.itemId) ?? 0;
      const qty = Math.min(Math.max(0, money(l.quantity)), Math.max(0, room));
      if (!qty) continue;
      writes.push(
        db.inventoryMovement.create({ data: { itemId: l.itemId, kind: "RETURNED", quantity: qty, jobId: job.id, actorId: ctx.user.id, note: "Leftovers back" } }),
        db.inventoryItem.update({ where: { id: l.itemId }, data: { onHand: { increment: qty } } }),
      );
      returned++;
    }
    if (writes.length) await db.$transaction(writes);
    revalidatePath(`/dashboard/jobs/${job.id}`);
    for (const t of ["fence", "roof", "hvac"]) revalidatePath(boardPath(t));
    return { ok: true, returned };
  } catch (err) {
    return fail(err);
  }
}

/** The order arrived: every line of a sent purchase order is received, and the order is marked. */
export async function receivePurchaseOrder(eventId: string): Promise<{ ok: true; received: number } | Fail> {
  try {
    const { organizationId, user } = await requireManager();
    const ev = await db.activityEvent.findFirst({ where: { id: eventId, organizationId, kind: "PURCHASE_ORDER_SENT" } });
    if (!ev) return { ok: false, error: "That order is not on this company" };
    const meta = JSON.parse(ev.meta ?? "{}") as { trade?: string; lines?: Array<{ id: string; quantity: number }>; receivedAt?: string };
    if (meta.receivedAt) return { ok: false, error: "Already received" };
    const lines = (meta.lines ?? []).filter((l) => l.quantity > 0);
    const items = await db.inventoryItem.findMany({ where: { id: { in: lines.map((l) => l.id) }, organizationId }, select: { id: true } });
    const known = new Set(items.map((i) => i.id));
    const writes = lines
      .filter((l) => known.has(l.id))
      .flatMap((l) => [
        db.inventoryMovement.create({ data: { itemId: l.id, kind: "RECEIVED", quantity: l.quantity, note: "Purchase order received", actorId: user.id } }),
        db.inventoryItem.update({ where: { id: l.id }, data: { onHand: { increment: l.quantity } } }),
      ]);
    await db.$transaction([...writes, db.activityEvent.update({ where: { id: ev.id }, data: { meta: JSON.stringify({ ...meta, receivedAt: new Date().toISOString() }) } })]);
    if (meta.trade) revalidatePath(boardPath(meta.trade));
    return { ok: true, received: writes.length / 2 };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Put the trade's standard items on the shelf list: every material its
 * estimator prices, read off the estimator itself (lib/inventoryPresets).
 * Items already there are left alone; the rest start at zero on hand.
 */
export async function seedTradeItems(trade: string): Promise<{ ok: true; added: number; total: number } | Fail> {
  try {
    const { organizationId } = await requireManager();
    if (!isTradeId(trade)) return { ok: false, error: "Unknown trade" };
    const presets = presetItems(trade);
    const have = new Set((await db.inventoryItem.findMany({ where: { organizationId, trade }, select: { key: true } })).map((i) => i.key));
    const missing = presets.filter((p) => !have.has(stockKey(p.name)));
    if (missing.length) {
      await db.inventoryItem.createMany({ data: missing.map((p) => ({ organizationId, trade, name: p.name, key: stockKey(p.name), unit: p.unit })) });
    }
    revalidatePath(boardPath(trade));
    return { ok: true, added: missing.length, total: presets.length };
  } catch (err) {
    return fail(err);
  }
}
