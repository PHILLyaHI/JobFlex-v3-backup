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
