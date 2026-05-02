"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { ProposalStatus } from "@/lib/prismaEnums";

const lineSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  unit: z.string().optional(),
});

export const estimateSchema = z.object({
  title: z.string(),
  scope: z.string(),
  assumptions: z.array(z.string()).default([]),
  materials: z.array(lineSchema).default([]),
  labor: z.array(lineSchema).default([]),
  estimatedTimelineDays: z.number().optional(),
});

export type GeneratedEstimate = z.infer<typeof estimateSchema>;

const STUB: GeneratedEstimate = {
  title: "Sample Roof Replacement Estimate · AI Disabled",
  scope:
    "Full tear-off, synthetic underlayment, 30-year architectural shingles, new ridge vents, ice & water shield at valleys and eaves, drip edge, pipe collars. Full cleanup and magnetic sweep.",
  assumptions: [
    "No decking replacement needed beyond 2 sheets",
    "Existing chimney flashing to be reused",
    "One-layer tear-off; dumpster on driveway",
    "Pricing placeholders — add OPENAI_API_KEY for real generation",
  ],
  materials: [
    { name: "Architectural shingles (30-yr)", quantity: 24, unitPrice: 115, unit: "square" },
    { name: "Synthetic underlayment", quantity: 24, unitPrice: 32, unit: "square" },
    { name: "Ice & water shield", quantity: 400, unitPrice: 1.1, unit: "sqft" },
    { name: "Ridge vent system", quantity: 60, unitPrice: 6, unit: "ln ft" },
    { name: "Drip edge + flashing", quantity: 1, unitPrice: 480, unit: "lot" },
  ],
  labor: [
    { name: "Tear-off + disposal", quantity: 2400, unitPrice: 0.8, unit: "sqft" },
    { name: "Installation labor", quantity: 2400, unitPrice: 1.8, unit: "sqft" },
    { name: "Cleanup + magnetic sweep", quantity: 1, unitPrice: 380, unit: "lot" },
  ],
  estimatedTimelineDays: 3,
};

interface GenerateInput {
  projectType: string;
  description: string;
  location?: string;
  sqft?: number;
}

export async function generateAdvancedEstimate(input: GenerateInput): Promise<
  | { ok: true; data: GeneratedEstimate; disabled?: false }
  | { ok: true; data: GeneratedEstimate; disabled: true }
  | { ok: false; error: string }
> {
  try {
    const { organizationId } = await requireOrg();
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    const plan = await getOrgPlanById(organizationId);
    requireFeatureOrThrow(plan, "advanced_estimator");
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Upgrade required" };
  }

  if (!isOpenAIEnabled()) {
    return { ok: true, data: { ...STUB, title: `${input.projectType} estimate · AI disabled` }, disabled: true };
  }
  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            'You are a senior contractor AI estimator. Produce a detailed project estimate as JSON matching: {title, scope, assumptions: string[], materials: [{name, quantity, unitPrice, unit}], labor: [{name, quantity, unitPrice, unit}], estimatedTimelineDays: number}. Apply realistic US pricing adjusted for the stated location. Keep 4-7 materials and 2-4 labor items. Return JSON only.',
        },
        {
          role: "user",
          content: `Project type: ${input.projectType}
${input.location ? `Location: ${input.location}` : ""}
${input.sqft ? `Approximate size: ${input.sqft} sqft` : ""}
Description: ${input.description}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = estimateSchema.parse(JSON.parse(text));
    return { ok: true, data: parsed };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "AI generation failed" };
  }
}

// Persist estimate
export async function saveEstimate(raw: {
  projectType: string;
  location?: string | null;
  data: GeneratedEstimate;
}) {
  const { organizationId } = await requireOrg();
  const total =
    raw.data.materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0) +
    raw.data.labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const est = await db.aiEstimate.create({
    data: {
      organizationId,
      projectType: raw.projectType,
      location: raw.location ?? null,
      materials: JSON.stringify(raw.data.materials),
      labor: JSON.stringify(raw.data.labor),
      categories: JSON.stringify({
        title: raw.data.title,
        assumptions: raw.data.assumptions,
        estimatedTimelineDays: raw.data.estimatedTimelineDays,
      }),
      assumptions: raw.data.assumptions.join("\n"),
      total,
    },
  });
  revalidatePath("/dashboard/advanced-ai");
  return { id: est.id };
}

// Convert estimate → new Proposal
const convertInput = z.object({
  projectType: z.string(),
  title: z.string(),
  scope: z.string().optional(),
  materials: z.array(lineSchema).default([]),
  labor: z.array(lineSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});

export async function convertEstimateToProposal(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  const data = convertInput.parse(raw);

  const lines = [
    ...data.materials.map((l) => ({
      name: l.name,
      description: l.unit ? `Measured in ${l.unit}` : null,
      measurementType: l.unit === "sqft" ? "SQFT" : l.unit === "ln ft" ? "LINEAR_FT" : l.unit === "hour" ? "HOUR" : "UNIT",
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      materialCost: l.unitPrice,
      laborCost: 0,
      total: l.quantity * l.unitPrice,
    })),
    ...data.labor.map((l) => ({
      name: l.name,
      description: l.unit ? `Measured in ${l.unit}` : null,
      measurementType: l.unit === "hour" ? "HOUR" : l.unit === "sqft" ? "SQFT" : "UNIT",
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      materialCost: 0,
      laborCost: l.unitPrice,
      total: l.quantity * l.unitPrice,
    })),
  ];

  const subtotal = lines.reduce((a, l) => a + l.total, 0);

  const scopeWithAssumptions = [
    data.scope ?? "",
    data.assumptions.length > 0 ? "\n\nAssumptions:\n" + data.assumptions.map((a) => `• ${a}`).join("\n") : "",
  ]
    .join("")
    .trim();

  const proposal = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      title: data.title,
      scopeOfWork: scopeWithAssumptions || null,
      status: ProposalStatus.DRAFT,
      subtotal,
      taxRate: 0,
      taxTotal: 0,
      total: subtotal,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: {
        create: lines.map((l, i) => ({ ...l, position: i })),
      },
      installments: {
        create: [
          { label: "Deposit", amount: 30, isPercent: true, position: 0 },
          { label: "Completion", amount: 70, isPercent: true, position: 1 },
        ],
      },
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: proposal.id,
      kind: "CREATED",
      summary: `Converted "${data.projectType}" AI estimate to proposal "${proposal.title}"`,
    },
  });

  revalidatePath("/dashboard/proposals");
  return { id: proposal.id };
}
