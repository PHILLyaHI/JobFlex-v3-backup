"use server";
// Change orders — the office side. Create (typed, itemized, with photos),
// send (email + SMS through lib/changeOrders/send), withdraw, delete a draft,
// record an in-person approval, and the reads the sheet and the lists need.
//
// The client's own approve / decline live in lib/changeOrders/respond and are
// reached through the token routes under /api/public-co — never from here, so
// nothing a browser can call takes an ip or a name for the client.
//
// Money: a change order never edits the proposal's totals. Its own subtotal /
// tax / total are frozen at creation (the proposal's tax rate copied in), and
// on approval it becomes its own installment (see respond.ts). Everything
// that reads "what the client owes" derives it (lib/contractTotal).
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { safeFilename } from "@/lib/safeHref";
import { createChangeOrderSchema } from "@/lib/changeOrders/schema";
import {
  BUILTIN_CHANGE_ORDER_TYPES,
  CO_STATUS,
  PLYWOOD_TYPE,
  inferRoofFamily,
  isRoofingProposal,
  normalizeTaxRate,
  totalsForLines,
  unitFromMeasurementType,
  type CoTypeDef,
  type CoUnit,
} from "@/lib/changeOrders/types";
import { approveChangeOrder } from "@/lib/changeOrders/respond";
import { sendChangeOrderToClient, type SendReport } from "@/lib/changeOrders/send";
import { parseCoLines, parseCoPhotos } from "@/lib/changeOrders/parse";
import { contractTotal } from "@/lib/contractTotal";
import { invoiceOptionsFor, sendInvoice, type InvoiceMethod, type InvoiceOptions, type InvoiceReport } from "@/lib/payments/invoices";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function revalidateForChangeOrder(jobId: string | null, proposalId: string | null) {
  if (jobId) {
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath(`/mobile-job-detail-v1/${jobId}`);
  }
  if (proposalId) revalidatePath(`/dashboard/proposals/${proposalId}`);
  for (const p of ["/dashboard/proposals", "/dashboard/financials", "/dashboard/financials/change-orders", "/v3/proposals-c", "/mobile-proposals-v2", "/mobile-financials-v2", "/dashboard/projects"]) {
    revalidatePath(p);
  }
}

/** Built-in types plus the org's own rows (ChangeOrderType), in that order. */
export async function listChangeOrderTypes(): Promise<CoTypeDef[]> {
  const { organizationId } = await requireManager();
  const out: CoTypeDef[] = [...BUILTIN_CHANGE_ORDER_TYPES];
  try {
    const rows = await db.changeOrderType.findMany({ where: { organizationId, active: true }, orderBy: { position: "asc" } });
    for (const r of rows) {
      try {
        const def = JSON.parse(r.definitionJson) as Partial<CoTypeDef>;
        if (!def || !Array.isArray(def.items)) continue;
        out.push({
          key: r.key,
          label: r.label,
          intro: def.intro ?? "",
          unit: def.unit ?? "each",
          items: def.items,
          allowCustomItem: def.allowCustomItem ?? true,
          areas: def.areas ?? false,
          helpers: def.helpers ?? {},
          photos: def.photos ?? true,
          reason: def.reason ?? true,
          reasonPlaceholder: def.reasonPlaceholder,
          smartDefault: def.smartDefault,
          pricingNote: def.pricingNote,
        });
      } catch {
        /* a row that does not parse is skipped, not fatal */
      }
    }
  } catch {
    /* table not pushed in this environment — built-ins only */
  }
  return out;
}

export interface ChangeOrderContext {
  jobId: string | null;
  proposalId: string | null;
  contextTitle: string;
  /** Fraction (0.095). */
  taxRate: number;
  roofFamily: string | null;
  /** Roofing proposals get the plywood type; everything else opens on the generic form. */
  isRoofing: boolean;
  /** The proposal's own lines, so a change can be "more of" one at the same unit and price. */
  proposalLines: Array<{ name: string; unit: CoUnit; unitPrice: number; kind: "material" | "labor" }>;
  clientEmail: boolean;
  clientPhone: boolean;
  /** The contract value before any new change: original + approved so far. */
  contractBefore: number | null;
  originalTotal: number | null;
  /** `${typeKey}:${itemKey}` → the contractor's own price and last quantity. */
  prefs: Record<string, { unitPrice: number; lastQuantity: number | null }>;
  types: CoTypeDef[];
  nextNumber: number;
  /** Every change order on this proposal / job, oldest first — the sheet manages them. */
  orders: ChangeOrderRowDto[];
  /** Which invoice rails the company can send on. */
  invoice: InvoiceOptions;
}

/** Everything the sheet needs to open pre-filled, in one round trip. */
export async function getChangeOrderContext(input: { jobId?: string; proposalId?: string }): Promise<ChangeOrderContext> {
  const { organizationId } = await requireManager();
  let jobId: string | null = null;
  let proposalId: string | null = input.proposalId ?? null;
  let contextTitle = "the job";
  let client: { email: string | null; phone: string | null } | null = null;
  if (input.jobId) {
    const job = await db.job.findFirst({ where: { id: input.jobId, organizationId }, select: { id: true, title: true, proposalId: true, client: { select: { email: true, phone: true } } } });
    if (!job) throw new Error("Not found");
    jobId = job.id;
    contextTitle = job.title;
    client = job.client;
    proposalId = proposalId ?? job.proposalId;
  }
  let taxRate = 0;
  let roofFamily: string | null = null;
  let isRoofing = false;
  let proposalLines: ChangeOrderContext["proposalLines"] = [];
  let contractBefore: number | null = null;
  let originalTotal: number | null = null;
  if (proposalId) {
    const proposal = await db.proposal.findFirst({
      where: { id: proposalId, organizationId },
      select: {
        title: true,
        taxRate: true,
        total: true,
        client: { select: { email: true, phone: true } },
        lineItems: { orderBy: { position: "asc" }, select: { name: true, measurementType: true, unitPrice: true, materialCost: true, laborCost: true } },
        changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } },
      },
    });
    if (!proposal) throw new Error("Not found");
    if (!input.jobId) contextTitle = proposal.title;
    client = client ?? proposal.client;
    taxRate = normalizeTaxRate(proposal.taxRate);
    const names = proposal.lineItems.map((l) => l.name);
    roofFamily = inferRoofFamily(names);
    isRoofing = isRoofingProposal({ title: proposal.title, lineNames: names });
    proposalLines = proposal.lineItems
      .filter((l) => l.name.trim())
      .map((l) => ({
        name: l.name.trim(),
        unit: unitFromMeasurementType(l.measurementType),
        unitPrice: l.unitPrice,
        // A line priced as labor only is labor; anything else is material.
        kind: l.laborCost > 0 && l.materialCost <= 0 ? ("labor" as const) : ("material" as const),
      }));
    originalTotal = proposal.total;
    contractBefore = contractTotal(proposal.total, proposal.changeOrders);
  } else {
    const org = await db.organization.findUnique({ where: { id: organizationId }, select: { defaultTaxRate: true } });
    taxRate = normalizeTaxRate(org?.defaultTaxRate);
  }
  const prefs: ChangeOrderContext["prefs"] = {};
  try {
    const rows = await db.changeOrderPricePref.findMany({ where: { organizationId } });
    for (const r of rows) prefs[`${r.typeKey}:${r.itemKey}`] = { unitPrice: r.unitPrice, lastQuantity: r.lastQuantity };
  } catch {
    /* table not pushed yet */
  }
  const agg = await db.changeOrder.aggregate({ where: proposalId ? { proposalId } : { jobId: jobId ?? "" }, _max: { number: true }, _count: { _all: true } });
  return {
    jobId,
    proposalId,
    contextTitle,
    taxRate,
    roofFamily,
    isRoofing,
    proposalLines,
    clientEmail: Boolean(client?.email),
    clientPhone: Boolean(client?.phone),
    contractBefore,
    originalTotal,
    prefs,
    // Plywood is a roofing type: on any other job the sheet opens on the generic form.
    types: (await listChangeOrderTypes()).filter((t) => t.key !== PLYWOOD_TYPE.key || isRoofing),
    nextNumber: Math.max(agg._max.number ?? 0, agg._count._all) + 1,
    orders: await changeOrdersFor({ ...(jobId ? { jobId } : {}), ...(proposalId ? { proposalId } : {}) }),
    invoice: await invoiceOptionsFor(organizationId),
  };
}

/**
 * Invoice an APPROVED change order — its own stage on the schedule — on the
 * rail the office picks: card (hosted checkout), bank (the org's transfer
 * instructions), or the client's choice. A credit has no stage to invoice.
 */
export async function sendChangeOrderInvoice(id: string, method: InvoiceMethod): Promise<InvoiceReport> {
  const { organizationId } = await requireManager();
  const co = await db.changeOrder.findFirst({ where: { id, organizationId }, select: { status: true, proposalId: true, jobId: true } });
  if (!co) throw new Error("Not found");
  if (co.status !== CO_STATUS.APPROVED) throw new Error("Only an approved change order can be invoiced.");
  if (!co.proposalId) throw new Error("This change order is not on a proposal, so it has no payment stage.");
  const stage = await db.installment.findUnique({ where: { changeOrderId: id }, select: { id: true } });
  if (!stage) throw new Error("This change order is a credit — nothing to invoice.");
  const r = await sendInvoice({ proposalId: co.proposalId, installmentId: stage.id, method, organizationId });
  revalidateForChangeOrder(co.jobId, co.proposalId);
  return r;
}

export async function createChangeOrder(raw: unknown): Promise<{ id: string; publicToken: string; number: number; total: number; sent?: SendReport }> {
  const { organizationId, user } = await requireManager();
  const data = createChangeOrderSchema.parse(raw);

  // Parent: a job carries its proposal along, so the money can land on the
  // schedule; a proposal on its own is the contract itself.
  let jobId: string | null = null;
  let proposalId: string | null = data.proposalId ?? null;
  if (data.jobId) {
    const job = await db.job.findFirst({ where: { id: data.jobId, organizationId }, select: { id: true, proposalId: true } });
    if (!job) throw new Error("Not found");
    jobId = job.id;
    proposalId = proposalId ?? job.proposalId;
  }
  let taxRate = 0;
  if (proposalId) {
    const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId }, select: { taxRate: true } });
    if (!proposal) throw new Error("Not found");
    taxRate = normalizeTaxRate(proposal.taxRate);
  } else {
    const org = await db.organization.findUnique({ where: { id: organizationId }, select: { defaultTaxRate: true } });
    taxRate = normalizeTaxRate(org?.defaultTaxRate);
  }
  const totals = totalsForLines(data.lines, taxRate, data.taxable);
  const agg = await db.changeOrder.aggregate({ where: proposalId ? { proposalId } : { jobId: jobId ?? "" }, _max: { number: true }, _count: { _all: true } });
  const number = Math.max(agg._max.number ?? 0, agg._count._all) + 1;

  const co = await db.changeOrder.create({
    data: {
      organizationId,
      // 122-bit CSPRNG token: approving moves the contract, so the link must be unguessable.
      publicToken: randomUUID(),
      jobId,
      proposalId,
      number,
      kind: data.kind,
      title: data.title.trim(),
      description: data.reason?.trim() || null,
      reason: data.reason?.trim() || null,
      linesJson: JSON.stringify(data.lines),
      photosJson: JSON.stringify(data.photos),
      amount: totals.subtotal,
      taxable: data.taxable,
      taxRate: totals.taxRate,
      taxTotal: totals.taxTotal,
      total: totals.total,
      status: CO_STATUS.DRAFT,
      createdByUserId: user.id,
    },
  });

  // Remember the contractor's prices — per company, so the crew's phone
  // pre-fills what the office set. Best-effort: the table may not exist yet.
  for (const r of data.remember) {
    try {
      await db.changeOrderPricePref.upsert({
        where: { organizationId_typeKey_itemKey: { organizationId, typeKey: data.kind, itemKey: r.itemKey } },
        create: { organizationId, typeKey: data.kind, itemKey: r.itemKey, unitPrice: r.unitPrice, lastQuantity: r.lastQuantity ?? null },
        update: { unitPrice: r.unitPrice, lastQuantity: r.lastQuantity ?? null },
      });
    } catch {
      break;
    }
  }

  await db.activityEvent.create({
    data: { organizationId, actorId: user.id, proposalId, kind: "CREATED", summary: `Drafted change order #${number} "${co.title}"` },
  });

  let sent: SendReport | undefined;
  if (data.send) sent = await sendById(co.id, organizationId, user.id);
  revalidateForChangeOrder(jobId, proposalId);
  return { id: co.id, publicToken: co.publicToken, number, total: totals.total, sent };
}

/** Edit a DRAFT in place — title, reason, lines, photos, type. Totals are recomputed the same way. */
export async function updateChangeOrder(id: string, raw: unknown): Promise<{ id: string; total: number; sent?: SendReport }> {
  const { organizationId, user } = await requireManager();
  const data = createChangeOrderSchema.parse(raw);
  const co = await db.changeOrder.findFirst({ where: { id, organizationId }, select: { id: true, status: true, jobId: true, proposalId: true } });
  if (!co) throw new Error("Not found");
  if (co.status !== CO_STATUS.DRAFT) throw new Error("Only a draft can be edited. Withdraw a sent change order and make a new one.");
  let taxRate = 0;
  if (co.proposalId) {
    const proposal = await db.proposal.findFirst({ where: { id: co.proposalId, organizationId }, select: { taxRate: true } });
    taxRate = normalizeTaxRate(proposal?.taxRate);
  } else {
    const org = await db.organization.findUnique({ where: { id: organizationId }, select: { defaultTaxRate: true } });
    taxRate = normalizeTaxRate(org?.defaultTaxRate);
  }
  const totals = totalsForLines(data.lines, taxRate, data.taxable);
  await db.changeOrder.update({
    where: { id },
    data: {
      kind: data.kind,
      title: data.title.trim(),
      description: data.reason?.trim() || null,
      reason: data.reason?.trim() || null,
      linesJson: JSON.stringify(data.lines),
      photosJson: JSON.stringify(data.photos),
      amount: totals.subtotal,
      taxable: data.taxable,
      taxRate: totals.taxRate,
      taxTotal: totals.taxTotal,
      total: totals.total,
    },
  });
  for (const r of data.remember) {
    try {
      await db.changeOrderPricePref.upsert({
        where: { organizationId_typeKey_itemKey: { organizationId, typeKey: data.kind, itemKey: r.itemKey } },
        create: { organizationId, typeKey: data.kind, itemKey: r.itemKey, unitPrice: r.unitPrice, lastQuantity: r.lastQuantity ?? null },
        update: { unitPrice: r.unitPrice, lastQuantity: r.lastQuantity ?? null },
      });
    } catch {
      break;
    }
  }
  let sent: SendReport | undefined;
  if (data.send) sent = await sendById(co.id, organizationId, user.id);
  revalidateForChangeOrder(co.jobId, co.proposalId);
  return { id: co.id, total: totals.total, sent };
}

async function sendById(id: string, organizationId: string, actorId: string): Promise<SendReport> {
  const { count } = await db.changeOrder.updateMany({
    where: { id, organizationId, status: CO_STATUS.DRAFT },
    data: { status: CO_STATUS.SENT, sentAt: new Date() },
  });
  if (count !== 1) throw new Error("Only a draft can be sent.");
  const report = await sendChangeOrderToClient(id);
  const co = await db.changeOrder.findUnique({ where: { id }, select: { title: true, proposalId: true, jobId: true } });
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId,
      proposalId: co?.proposalId ?? null,
      kind: "SENT",
      summary: `Sent change order "${co?.title ?? ""}" — email ${report.email}, text ${report.sms}`,
    },
  });
  return report;
}

export async function sendChangeOrder(id: string): Promise<SendReport> {
  const { organizationId, user } = await requireManager();
  const co = await db.changeOrder.findFirst({ where: { id, organizationId }, select: { jobId: true, proposalId: true } });
  if (!co) throw new Error("Not found");
  const report = await sendById(id, organizationId, user.id);
  revalidateForChangeOrder(co.jobId, co.proposalId);
  return report;
}

/** Withdraw a sent (or draft) change order: the token stops approving. */
export async function voidChangeOrder(id: string) {
  const { organizationId, user } = await requireManager();
  const co = await db.changeOrder.findFirst({ where: { id, organizationId } });
  if (!co) throw new Error("Not found");
  const { count } = await db.changeOrder.updateMany({
    where: { id, status: { in: [CO_STATUS.DRAFT, CO_STATUS.SENT] } },
    data: { status: CO_STATUS.VOID, voidedAt: new Date() },
  });
  if (count !== 1) throw new Error("Only a draft or a sent change order can be withdrawn.");
  await db.activityEvent.create({
    data: { organizationId, actorId: user.id, proposalId: co.proposalId, kind: "UPDATED", summary: `Withdrew change order "${co.title}"` },
  });
  revalidateForChangeOrder(co.jobId, co.proposalId);
  return { ok: true as const };
}

export async function deleteChangeOrder(id: string) {
  const { organizationId } = await requireManager();
  const co = await db.changeOrder.findFirst({ where: { id, organizationId } });
  if (!co) throw new Error("Not found");
  if (co.status !== CO_STATUS.DRAFT) throw new Error("Only drafts can be deleted.");
  await db.changeOrder.delete({ where: { id } });
  revalidateForChangeOrder(co.jobId, co.proposalId);
}

/** The client said yes in person: recorded as such, under the staff member who typed it. */
export async function markChangeOrderApproved(id: string, clientName: string) {
  const { organizationId, user } = await requireManager();
  const co = await db.changeOrder.findFirst({ where: { id, organizationId }, select: { jobId: true, proposalId: true } });
  if (!co) throw new Error("Not found");
  const name = clientName.trim();
  if (name.length < 2) throw new Error("Type the client's full name to record their approval.");
  const res = await approveChangeOrder({ coId: id, via: "in_person", name, ip: null, userAgent: null, byUserId: user.id });
  if (!res.ok) throw new Error(res.error);
  revalidateForChangeOrder(co.jobId, co.proposalId);
  return res;
}

/**
 * A photo of the damage, from the phone's camera. Blob only: a data URL in
 * photosJson would blow the row and the client page; without Blob the sheet
 * says so and sends without photos.
 */
export async function uploadChangeOrderPhoto(dataUrl: string, filename: string): Promise<{ id: string; url: string }> {
  const { organizationId } = await requireManager();
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("Photo must be a JPEG, PNG or WebP image");
  if (!isBlobEnabled()) throw new Error("Photo storage isn't configured (BLOB_READ_WRITE_TOKEN) — send without photos");
  const buf = Buffer.from(match[2], "base64");
  if (buf.byteLength > PHOTO_MAX_BYTES) throw new Error("Photo is too large (5 MB max)");
  const res = await uploadBlob(`change-orders/${organizationId}/${Date.now()}-${safeFilename(filename, "photo")}`, buf, {
    contentType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase(),
  });
  return { id: randomUUID(), url: res.url };
}

export interface ChangeOrderRowDto {
  id: string;
  number: number | null;
  title: string;
  kind: string | null;
  status: string;
  /** Tax-inclusive when itemized; the legacy signed amount otherwise. */
  total: number;
  taxTotal: number;
  reason: string | null;
  lines: ReturnType<typeof parseCoLines>;
  photos: ReturnType<typeof parseCoPhotos>;
  publicToken: string;
  sentAt: Date | null;
  approvedAt: Date | null;
  approvedName: string | null;
  approvedVia: string | null;
  declinedAt: Date | null;
  declineReason: string | null;
  createdAt: Date;
}

function toDto(c: {
  id: string; number: number | null; title: string; kind: string | null; status: string; total: number | null; amount: number; taxTotal: number | null;
  reason: string | null; description: string | null; linesJson: string | null; photosJson: string | null; publicToken: string;
  sentAt: Date | null; approvedAt: Date | null; approvedName: string | null; approvedVia: string | null; declinedAt: Date | null; declineReason: string | null; createdAt: Date;
}): ChangeOrderRowDto {
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    kind: c.kind,
    status: c.status,
    total: c.total ?? c.amount,
    taxTotal: c.taxTotal ?? 0,
    reason: c.reason ?? c.description,
    lines: parseCoLines(c.linesJson),
    photos: parseCoPhotos(c.photosJson),
    publicToken: c.publicToken,
    sentAt: c.sentAt,
    approvedAt: c.approvedAt,
    approvedName: c.approvedName,
    approvedVia: c.approvedVia,
    declinedAt: c.declinedAt,
    declineReason: c.declineReason,
    createdAt: c.createdAt,
  };
}

/** The change orders of a proposal, or of a job and its proposal — one list. */
export async function changeOrdersFor(input: { proposalId?: string; jobId?: string }): Promise<ChangeOrderRowDto[]> {
  const { organizationId } = await requireManager();
  let proposalId = input.proposalId ?? null;
  const jobId = input.jobId ?? null;
  if (jobId && !proposalId) {
    const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { proposalId: true } });
    proposalId = job?.proposalId ?? null;
  }
  const rows = await db.changeOrder.findMany({
    where: { organizationId, OR: [...(proposalId ? [{ proposalId }] : []), ...(jobId ? [{ jobId }] : [])] },
    orderBy: [{ createdAt: "asc" }],
  });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map(toDto);
}
