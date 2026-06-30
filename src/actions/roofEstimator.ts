"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { estimateSchema, type GeneratedEstimate } from "@/lib/estimatorSchema";
import { ProposalStatus } from "@/lib/prismaEnums";

const STUB: GeneratedEstimate = {
  title: "Roof replacement estimate · AI disabled",
  scope: "Tear-off, synthetic underlayment, architectural shingles, ridge vents, cleanup.",
  assumptions: [
    "One-layer tear-off only",
    "Standard pitch, no steep-slope surcharge",
    "Add OPENAI_API_KEY for real estimates",
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

export async function estimateRoof(input: {
  address?: string;
  lat?: number;
  lng?: number;
  pitch: string;
  squares: number;
  wastePct: number;
  // Optional EagleView-measured facet/edge detail, fed verbatim to the AI so it
  // can price ridge vent, valley/flashing metal, and steep-slope labor off real
  // geometry rather than a single average pitch.
  measurementNotes?: string;
}): Promise<
  | { ok: true; data: GeneratedEstimate; disabled?: false }
  | { ok: true; data: GeneratedEstimate; disabled: true }
  | { ok: false; error: string }
> {
  await requireManager();
  if (!isOpenAIEnabled()) {
    return { ok: true, data: STUB, disabled: true };
  }
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
            'You are a senior roofing estimator. Produce a roof replacement estimate as JSON matching: {title, scope, assumptions: string[], materials: [{name, quantity, unitPrice, unit}], labor: [{name, quantity, unitPrice, unit}], estimatedTimelineDays}. Use realistic US 2026 pricing, account for pitch (steeper = more labor) and waste factor (bumps material qty). Return JSON only.',
        },
        {
          role: "user",
          content: `Address: ${input.address ?? "unknown"}
Pitch: ${input.pitch}
Roof size: ${input.squares} squares (${input.squares * 100} sqft)
Waste factor: ${input.wastePct}%${input.measurementNotes ? `\n${input.measurementNotes}` : ""}`,
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

export async function convertRoofEstimateToProposal(raw: unknown) {
  const { organizationId, user } = await requireManager();
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

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: proposal.id,
      kind: "CREATED",
      summary: `Converted roof estimate to proposal "${proposal.title}"`,
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
    case "square":
    case "lot":
    case undefined:
    default:
      return "UNIT";
  }
}
