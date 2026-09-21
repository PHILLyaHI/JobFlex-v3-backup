"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { clearFilingContext, readFilingContext } from "@/lib/filingContext";
import { sellUnitPrice, resolveMarkupRates } from "@/lib/pricing/markup";
import { uploadBlob, isBlobEnabled } from "@/lib/sdk/blob";
import { getOpenAI, isOpenAIEnabled, samplingOptions, resolveOpenAIModel } from "@/lib/sdk/openai";
import { estimateSchema, type GeneratedEstimate } from "@/lib/estimatorSchema";
import { ProposalStatus } from "@/lib/prismaEnums";
import { checkPlanLimit, enforcePlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";
import { stateFromAddress, stateTaxRate } from "@/lib/pricing/salesTax";

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
  | { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey }
> {
  const { organizationId } = await requireEstimatorOrManager();
await enforceRateLimit(`ai:${organizationId}`, 60, HOUR, "AI runs");
  // Union failure (not a throw): thrown messages are redacted in prod, and
  // this action's callers already branch on { ok }.
  const quota = await checkPlanLimit(organizationId, "estimatorUses");
  if (!quota.allowed) {
    return {
      ok: false,
      error: PLAN_LIMIT_MESSAGE,
      code: "PLAN_LIMIT_REACHED",
      resource: quota.cappedBy ?? "estimatorUses",
    };
  }
  if (!isOpenAIEnabled()) return { ok: true, data: STUB, disabled: true };
  try {
    // The model this process can actually call, asked once per process and
    // remembered (lib/sdk/openai). OPENAI_MODEL's import-time snapshot answers
    // with whatever string the environment holds, and a string is not an
    // entitlement: a model the key's project has no access to fails every call
    // with 403 model_not_found. Resolved here instead, so one check covers the
    // process and the fallback is a working model rather than a dead one.
    const model = await resolveOpenAIModel();
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model,
      ...(await samplingOptions(0.4)),
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
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "Generation failed" };
  }
}

const convertSchema = z.object({
  title: z.string(),
  scope: z.string().optional(),
  materials: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().finite(),
      unitPrice: z.number().finite(),
      unit: z.string().optional(),
    }),
  ),
  labor: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().finite(),
      unitPrice: z.number().finite(),
      unit: z.string().optional(),
    }),
  ),
  assumptions: z.array(z.string()),
  // The package engine's lines (lib/fence/pricing, 2026-09-18): one row per
  // part of the job with its MATERIAL and LABOR halves per unit, so the
  // proposal can print both to the client and the org's markup lands on
  // each half. When present these are the proposal's lines; `materials` /
  // `labor` above stay for the older callers.
  lines: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(400).optional(),
        quantity: z.number().finite().min(0),
        unit: z.string().optional(),
        materialCost: z.number().finite().min(0),
        laborCost: z.number().finite().min(0),
      }),
    )
    .max(80)
    .optional(),
  // The job address: rides with the proposal and sets the state's sales tax.
  address: z.string().max(300).optional().nullable(),
  // Optional 3D snapshot (PNG data URL) — uploaded to Blob and attached when present.
  previewDataUrl: z.string().optional(),
  // Pre-links the proposal to a client when converted from a client's page.
  clientId: z.string().optional().nullable(),
});

export async function convertFenceEstimateToProposal(raw: unknown) {
  const { organizationId, user } = await requireEstimatorOrManager();
  await enforcePlanLimit(organizationId, "proposalsCreated");
  const data = convertSchema.parse(raw);

  // Never trust a client id from the browser — it must belong to this org.
  const named = data.clientId
    ? (
        await db.client.findFirst({
          where: { id: data.clientId, organizationId },
          select: { id: true },
        })
      )?.id ?? null
    : null;
  // Started from a project or a client's page, the picker recorded where this
  // estimate files (lib/filingContext); an explicit client still wins.
  const filing = await readFilingContext(organizationId);
  const clientId = named ?? filing?.clientId ?? null;
  const projectId = filing?.projectId ?? null;

  // Hidden profit markup: seed from the org-wide default, then apply so each
  // line's unitPrice is the SELL price (0% → equals cost).
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { materialMarkupPct: true, laborMarkupPct: true, defaultTaxRate: true },
  });
  const markupRates = resolveMarkupRates(null, org);

  // A split line (the package engine): the sell price marks up each half at
  // its own rate; the stored unit price is the client-facing figure.
  const split = (data.lines ?? []).map((l) => {
    const sell = sellUnitPrice({ unitPrice: l.materialCost + l.laborCost, materialCost: l.materialCost, laborCost: l.laborCost }, markupRates);
    return {
      name: l.name,
      description: l.description,
      measurementType: unitToType(l.unit),
      quantity: l.quantity,
      unitPrice: sell,
      materialCost: l.materialCost,
      laborCost: l.laborCost,
      total: l.quantity * sell,
    };
  });
  const lines = [
    ...split,
    ...data.materials.map((l) => ({
      name: l.name,
      measurementType: unitToType(l.unit),
      quantity: l.quantity,
      unitPrice: sellUnitPrice({ unitPrice: l.unitPrice, materialCost: l.unitPrice, laborCost: 0 }, markupRates),
      materialCost: l.unitPrice,
      laborCost: 0,
      total:
        l.quantity *
        sellUnitPrice({ unitPrice: l.unitPrice, materialCost: l.unitPrice, laborCost: 0 }, markupRates),
    })),
    ...data.labor.map((l) => ({
      name: l.name,
      measurementType: unitToType(l.unit),
      quantity: l.quantity,
      unitPrice: sellUnitPrice({ unitPrice: l.unitPrice, materialCost: 0, laborCost: l.unitPrice }, markupRates),
      materialCost: 0,
      laborCost: l.unitPrice,
      total:
        l.quantity *
        sellUnitPrice({ unitPrice: l.unitPrice, materialCost: 0, laborCost: l.unitPrice }, markupRates),
    })),
  ];

  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  // Tax sits on top of the marked-up subtotal (sell price), applied once: the
  // job's state rate from the address, the way the roof and HVAC converts
  // write it, else the org default. taxRate is a FRACTION (0.08 = 8%).
  const address = data.address?.trim() || null;
  const taxRate = stateTaxRate(stateFromAddress(address)) ?? org?.defaultTaxRate ?? 0;
  const taxTotal = subtotal * taxRate;

  // Best-effort: persist the 3D snapshot to Blob so it can ride along in the
  // proposal/PDF. Never blocks proposal creation if Blob is off or upload fails.
  let beforePhotos: string | undefined;
  if (data.previewDataUrl?.startsWith("data:image/") && data.previewDataUrl.length <= 5_000_000 && isBlobEnabled()) {
    try {
      const base64 = data.previewDataUrl.split(",")[1] ?? "";
      const { url } = await uploadBlob(`fence-preview/${randomUUID()}.png`, Buffer.from(base64, "base64"));
      beforePhotos = JSON.stringify([url]);
    } catch {
      /* preview is optional */
    }
  }

  const proposal = await db.proposal.create({
    data: {
      // The trade board lists it and its materials count against the fence stock (2026-09-20).
      trade: "fence",
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      clientId,
      projectId,
      ...(beforePhotos ? { beforePhotos } : {}),
      title: data.title,
      // Scope only — assumptions stay on the estimate, never baked into the
      // proposal's scope (keeps the preview / calendar / job detail clean).
      scopeOfWork: data.scope ?? "",
      address,
      status: ProposalStatus.DRAFT,
      subtotal,
      taxRate,
      taxTotal,
      total: subtotal + taxTotal,
      materialMarkupPct: markupRates.materialMarkupPct,
      laborMarkupPct: markupRates.laborMarkupPct,
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

  if (filing) await clearFilingContext();
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
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
    case "lot":
      return "LUMP_SUM";
    default:
      return "UNIT";
  }
}
