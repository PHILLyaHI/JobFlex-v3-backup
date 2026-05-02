"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalStatus } from "@/lib/prismaEnums";

const lineItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  measurementType: z.enum(["SQFT", "LINEAR_FT", "CUBIC_FT", "UNIT", "HOUR", "LUMP_SUM"]),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  materialCost: z.number().min(0).default(0),
  laborCost: z.number().min(0).default(0),
});

const installmentSchema = z.object({
  label: z.string(),
  amount: z.number().min(0),
  isPercent: z.boolean(),
});

const proposalInput = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  clientId: z.string().optional().nullable(),
  description: z.string().optional(),
  scopeOfWork: z.string().optional(),
  notes: z.string().optional(),
  taxRate: z.number().min(0).max(1).default(0),
  lineItems: z.array(lineItemSchema).min(1),
  installments: z.array(installmentSchema).default([]),
  materialMarkupPct: z.number().min(0).max(500).optional(),
  laborMarkupPct: z.number().min(0).max(500).optional(),
  overheadPct: z.number().min(0).max(200).optional(),
  profitPct: z.number().min(0).max(200).optional(),
});

type ProposalInput = z.infer<typeof proposalInput>;

function computeTotals(input: Pick<ProposalInput, "lineItems" | "taxRate">) {
  const subtotal = input.lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxTotal = subtotal * input.taxRate;
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

export async function saveProposal(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  const data = proposalInput.parse(raw);
  const { subtotal, taxTotal, total } = computeTotals(data);

  if (data.id) {
    const existing = await db.proposal.findUnique({ where: { id: data.id } });
    if (!existing || existing.organizationId !== organizationId) throw new Error("Not found");
    const updated = await db.proposal.update({
      where: { id: data.id },
      data: {
        title: data.title,
        clientId: data.clientId ?? null,
        description: data.description,
        scopeOfWork: data.scopeOfWork,
        notes: data.notes,
        taxRate: data.taxRate,
        materialMarkupPct: data.materialMarkupPct ?? undefined,
        laborMarkupPct: data.laborMarkupPct ?? undefined,
        overheadPct: data.overheadPct ?? undefined,
        profitPct: data.profitPct ?? undefined,
        subtotal,
        taxTotal,
        total,
        lineItems: {
          deleteMany: {},
          create: data.lineItems.map((l, i) => ({
            ...l,
            total: l.quantity * l.unitPrice,
            position: i,
          })),
        },
        installments: {
          deleteMany: {},
          create: data.installments.map((i, idx) => ({ ...i, position: idx })),
        },
      },
    });
    revalidatePath("/dashboard/proposals");
    revalidatePath(`/dashboard/proposals/${updated.id}`);
    return { id: updated.id, publicId: updated.publicId };
  }

  const created = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      clientId: data.clientId ?? null,
      title: data.title,
      description: data.description,
      scopeOfWork: data.scopeOfWork,
      notes: data.notes,
      taxRate: data.taxRate,
      materialMarkupPct: data.materialMarkupPct ?? 0,
      laborMarkupPct: data.laborMarkupPct ?? 0,
      overheadPct: data.overheadPct ?? 0,
      profitPct: data.profitPct ?? 0,
      subtotal,
      taxTotal,
      total,
      status: ProposalStatus.DRAFT,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: {
        create: data.lineItems.map((l, i) => ({
          ...l,
          total: l.quantity * l.unitPrice,
          position: i,
        })),
      },
      installments: {
        create: data.installments.map((i, idx) => ({ ...i, position: idx })),
      },
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: created.id,
      clientId: data.clientId ?? null,
      kind: "CREATED",
      summary: `Created proposal "${created.title}"`,
    },
  });

  revalidatePath("/dashboard/proposals");
  return { id: created.id, publicId: created.publicId };
}

export async function sendProposal(id: string) {
  const { organizationId, user } = await requireOrg();
  const p = await db.proposal.findUnique({ where: { id }, include: { client: true } });
  if (!p || p.organizationId !== organizationId) throw new Error("Not found");
  await db.proposal.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });
  await snapshotProposal(id, "sent");
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: id,
      clientId: p.clientId,
      kind: "SENT",
      summary: `Sent "${p.title}" to ${p.client?.name ?? p.client?.email ?? "client"}`,
    },
  });

  // Best-effort notifications + follow-up scheduling — never block the save.
  try {
    const { notifyProposalSent } = await import("./notify");
    await notifyProposalSent({ proposalId: id });
  } catch (err) {
    console.warn("[sendProposal] notify failed:", err);
  }
  try {
    const { scheduleFollowUpsFor } = await import("./followUps");
    await scheduleFollowUpsFor(id, "SENT");
  } catch (err) {
    console.warn("[sendProposal] schedule failed:", err);
  }

  revalidatePath("/dashboard/proposals");
  revalidatePath(`/dashboard/proposals/${id}`);
  return { ok: true };
}

export async function updateProposalStatus(id: string, status: ProposalStatus) {
  const { organizationId, user } = await requireOrg();
  const p = await db.proposal.findUnique({ where: { id } });
  if (!p || p.organizationId !== organizationId) throw new Error("Not found");
  await db.proposal.update({
    where: { id },
    data: { status, ...(status === "PAID" ? { paidAt: new Date() } : {}) },
  });
  if (status === "ACCEPTED" || status === "PAID") {
    await snapshotProposal(id, status === "ACCEPTED" ? "accepted" : "manual");
  }
  // Schedule any follow-ups watching this status
  try {
    const { scheduleFollowUpsFor } = await import("./followUps");
    await scheduleFollowUpsFor(id, status);
  } catch (err) {
    console.warn("[updateProposalStatus] schedule failed:", err);
  }
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: id,
      kind: status === "PAID" ? "PAID" : "UPDATED",
      summary: `${p.title} → ${status}`,
    },
  });
  revalidatePath("/dashboard/proposals");
  revalidatePath(`/dashboard/proposals/${id}`);
}

// ── Pricing snapshots ──────────────────────────────────────

type SnapshotReason = "manual" | "sent" | "accepted" | "edited";

async function snapshotProposal(proposalId: string, reason: SnapshotReason) {
  const p = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: { orderBy: { position: "asc" } } },
  });
  if (!p) return;
  await db.pricingSnapshot.create({
    data: {
      proposalId: p.id,
      organizationId: p.organizationId,
      reason,
      subtotal: p.subtotal,
      discountTotal: p.discountTotal,
      taxRate: p.taxRate,
      taxTotal: p.taxTotal,
      total: p.total,
      currency: p.currency,
      lineItemsJson: JSON.stringify(
        p.lineItems.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
          measurementType: l.measurementType,
        })),
      ),
    },
  });
}

export async function saveSnapshotManual(proposalId: string) {
  const { organizationId } = await requireOrg();
  const p = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!p || p.organizationId !== organizationId) throw new Error("Not found");
  await snapshotProposal(proposalId, "manual");
  revalidatePath(`/dashboard/proposals/${proposalId}`);
}

// ── Bulk operations ────────────────────────────────────────

export async function bulkUpdateProposalStatus(ids: string[], status: ProposalStatus) {
  const { organizationId } = await requireOrg();
  if (ids.length === 0) return { updated: 0 };
  const { count } = await db.proposal.updateMany({
    where: { id: { in: ids }, organizationId },
    data: {
      status,
      ...(status === "PAID" ? { paidAt: new Date() } : {}),
    },
  });
  revalidatePath("/dashboard/proposals");
  return { updated: count };
}

export async function bulkDeleteProposals(ids: string[]) {
  const { organizationId } = await requireOrg();
  if (ids.length === 0) return { deleted: 0 };
  const { count } = await db.proposal.deleteMany({
    where: { id: { in: ids }, organizationId },
  });
  revalidatePath("/dashboard/proposals");
  return { deleted: count };
}

export async function duplicateProposal(id: string) {
  const { organizationId, user } = await requireOrg();
  const p = await db.proposal.findUnique({
    where: { id },
    include: { lineItems: true, installments: true, discounts: true },
  });
  if (!p || p.organizationId !== organizationId) throw new Error("Not found");
  const dup = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      clientId: p.clientId,
      title: `${p.title} (copy)`,
      description: p.description,
      scopeOfWork: p.scopeOfWork,
      notes: p.notes,
      taxRate: p.taxRate,
      subtotal: p.subtotal,
      taxTotal: p.taxTotal,
      total: p.total,
      status: "DRAFT",
      lineItems: {
        create: p.lineItems.map((l) => ({
          name: l.name,
          description: l.description,
          measurementType: l.measurementType,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          materialCost: l.materialCost,
          laborCost: l.laborCost,
          total: l.total,
          position: l.position,
        })),
      },
      installments: {
        create: p.installments.map((i) => ({
          label: i.label,
          amount: i.amount,
          isPercent: i.isPercent,
          position: i.position,
        })),
      },
    },
  });
  revalidatePath("/dashboard/proposals");
  return { id: dup.id };
}
