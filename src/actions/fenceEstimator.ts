"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { estimateSchema, type GeneratedEstimate } from "./advancedEstimator";
import { ProposalStatus } from "@/lib/prismaEnums";

const STUB: GeneratedEstimate = {
  title: "Cedar privacy fence estimate · AI disabled",
  scope: "Install 180 linear ft cedar privacy fence, 6 ft tall, 1 gate.",
  assumptions: [
    "Standard post spacing (8 ft)",
    "Level ground; no slope surcharge",
    "Add OPENAI_API_KEY for real estimates",
  ],
  materials: [
    { name: "Cedar pickets (6ft)", quantity: 360, unitPrice: 4.5, unit: "ea" },
    { name: "4x4 posts (8ft)", quantity: 23, unitPrice: 18, unit: "ea" },
    { name: "Concrete bags", quantity: 46, unitPrice: 7, unit: "ea" },
    { name: "Single walk gate kit", quantity: 1, unitPrice: 180, unit: "ea" },
    { name: "Fasteners + brackets", quantity: 1, unitPrice: 140, unit: "lot" },
  ],
  labor: [
    { name: "Layout + post setting", quantity: 180, unitPrice: 8, unit: "ln ft" },
    { name: "Panel install", quantity: 180, unitPrice: 7, unit: "ln ft" },
    { name: "Cleanup", quantity: 1, unitPrice: 200, unit: "lot" },
  ],
  estimatedTimelineDays: 2,
};

export async function estimateFence(input: {
  linearFt: number;
  heightFt: number;
  material: string;
  gates: number;
  slope: boolean;
  notes?: string;
}): Promise<
  | { ok: true; data: GeneratedEstimate; disabled?: false }
  | { ok: true; data: GeneratedEstimate; disabled: true }
  | { ok: false; error: string }
> {
  await requireOrg();
  if (!isOpenAIEnabled()) return { ok: true, data: STUB, disabled: true };
  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a senior fencing estimator. Produce a fence installation estimate as JSON: {title, scope, assumptions: string[], materials: [{name, quantity, unitPrice, unit}], labor: [{name, quantity, unitPrice, unit}], estimatedTimelineDays}. Slope yards add labor. Gates add material. Use realistic US 2026 pricing. Return JSON only.',
        },
        {
          role: "user",
          content: `Linear ft: ${input.linearFt}
Height: ${input.heightFt} ft
Material: ${input.material}
Gates: ${input.gates}
Slope: ${input.slope ? "yes" : "no"}
${input.notes ? `Notes: ${input.notes}` : ""}`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = estimateSchema.parse(JSON.parse(text));
    return { ok: true, data: parsed };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Generation failed" };
  }
}

const convertSchema = z.object({
  title: z.string(),
  scope: z.string().optional(),
  materials: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      unit: z.string().optional(),
    }),
  ),
  labor: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      unit: z.string().optional(),
    }),
  ),
  assumptions: z.array(z.string()),
});

export async function convertFenceEstimateToProposal(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  const data = convertSchema.parse(raw);

  const lines = [
    ...data.materials.map((l) => ({
      name: l.name,
      measurementType: unitToType(l.unit),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      materialCost: l.unitPrice,
      laborCost: 0,
      total: l.quantity * l.unitPrice,
    })),
    ...data.labor.map((l) => ({
      name: l.name,
      measurementType: unitToType(l.unit),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      materialCost: 0,
      laborCost: l.unitPrice,
      total: l.quantity * l.unitPrice,
    })),
  ];

  const subtotal = lines.reduce((a, l) => a + l.total, 0);

  const proposal = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      title: data.title,
      scopeOfWork:
        (data.scope ?? "") +
        (data.assumptions.length
          ? "\n\nAssumptions:\n" + data.assumptions.map((a) => `• ${a}`).join("\n")
          : ""),
      status: ProposalStatus.DRAFT,
      subtotal,
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

  revalidatePath("/dashboard/proposals");
  return { id: proposal.id };
}

function unitToType(unit: string | undefined): string {
  switch (unit) {
    case "sqft":
      return "SQFT";
    case "ln ft":
    case "linear ft":
      return "LINEAR_FT";
    case "hour":
      return "HOUR";
    default:
      return "UNIT";
  }
}
