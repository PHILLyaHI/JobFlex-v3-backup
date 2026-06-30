"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalStatus } from "@/lib/prismaEnums";

interface TemplateBody {
  description?: string | null;
  scopeOfWork?: string | null;
  notes?: string | null;
  taxRate: number;
  lineItems: Array<{
    name: string;
    description?: string | null;
    measurementType: string;
    quantity: number;
    unitPrice: number;
    materialCost: number;
    laborCost: number;
  }>;
  installments: Array<{
    label: string;
    amount: number;
    isPercent: boolean;
  }>;
}

export async function saveProposalAsTemplate(
  proposalId: string,
  name: string,
  description?: string | null,
) {
  const { organizationId } = await requireManager();
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      installments: { orderBy: { position: "asc" } },
    },
  });
  if (!proposal || proposal.organizationId !== organizationId) throw new Error("Not found");

  const body: TemplateBody = {
    description: proposal.description,
    scopeOfWork: proposal.scopeOfWork,
    notes: proposal.notes,
    taxRate: proposal.taxRate,
    lineItems: proposal.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      measurementType: l.measurementType,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      materialCost: l.materialCost,
      laborCost: l.laborCost,
    })),
    installments: proposal.installments.map((i) => ({
      label: i.label,
      amount: i.amount,
      isPercent: i.isPercent,
    })),
  };

  const template = await db.proposalTemplate.create({
    data: {
      organizationId,
      name: name.trim() || proposal.title,
      description: description ?? null,
      body: JSON.stringify(body),
    },
  });

  revalidatePath("/dashboard/proposals/templates");
  return { id: template.id };
}

const directTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  body: z.object({
    description: z.string().optional().nullable(),
    scopeOfWork: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    taxRate: z.number().min(0).max(1).default(0),
    lineItems: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional().nullable(),
        measurementType: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
        materialCost: z.number().default(0),
        laborCost: z.number().default(0),
      }),
    ),
    installments: z
      .array(
        z.object({
          label: z.string(),
          amount: z.number(),
          isPercent: z.boolean(),
        }),
      )
      .default([]),
  }),
});

export async function createTemplate(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = directTemplateSchema.parse(raw);
  const template = await db.proposalTemplate.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description ?? null,
      body: JSON.stringify(data.body),
    },
  });
  revalidatePath("/dashboard/proposals/templates");
  return { id: template.id };
}

export async function deleteTemplate(id: string) {
  const { organizationId } = await requireManager();
  const t = await db.proposalTemplate.findUnique({ where: { id } });
  if (!t || t.organizationId !== organizationId) throw new Error("Not found");
  await db.proposalTemplate.delete({ where: { id } });
  revalidatePath("/dashboard/proposals/templates");
}

export async function createProposalFromTemplate(templateId: string) {
  const { organizationId, user } = await requireManager();
  const t = await db.proposalTemplate.findUnique({ where: { id: templateId } });
  if (!t || t.organizationId !== organizationId) throw new Error("Not found");

  let body: TemplateBody;
  try {
    body = JSON.parse(t.body) as TemplateBody;
  } catch {
    throw new Error("Template body is corrupted");
  }

  const subtotal = body.lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxTotal = subtotal * (body.taxRate ?? 0);

  const proposal = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      title: t.name,
      description: body.description ?? null,
      scopeOfWork: body.scopeOfWork ?? null,
      notes: body.notes ?? null,
      taxRate: body.taxRate ?? 0,
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      status: ProposalStatus.DRAFT,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: {
        create: body.lineItems.map((l, i) => ({
          name: l.name,
          description: l.description ?? null,
          measurementType: l.measurementType,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          materialCost: l.materialCost,
          laborCost: l.laborCost,
          total: l.quantity * l.unitPrice,
          position: i,
        })),
      },
      installments: {
        create: body.installments.map((i, idx) => ({
          label: i.label,
          amount: i.amount,
          isPercent: i.isPercent,
          position: idx,
        })),
      },
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: proposal.id,
      kind: "CREATED",
      summary: `Created proposal "${proposal.title}" from template "${t.name}"`,
    },
  });

  revalidatePath("/dashboard/proposals");
  return { id: proposal.id };
}

// Expose a light "usage count" query helper — reused in the templates page.
export async function getTemplatesWithUsage(organizationId: string) {
  const templates = await db.proposalTemplate.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  // Count proposals whose activity refers to the template — simple heuristic: match the
  // activity summary string "from template \"<name>\"". For a first pass this is good enough;
  // a dedicated usage column can land in a later pass.
  const usageByName = new Map<string, number>();
  const events = await db.activityEvent.findMany({
    where: { organizationId, summary: { contains: "from template " } },
    select: { summary: true },
    take: 500,
  });
  for (const e of events) {
    const m = e.summary.match(/from template "([^"]+)"/);
    if (m) usageByName.set(m[1], (usageByName.get(m[1]) ?? 0) + 1);
  }

  return templates.map((t) => ({
    ...t,
    usageCount: usageByName.get(t.name) ?? 0,
  }));
}
