"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { NoOrgError, UnauthorizedError, requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { recordInventoryLink } from "@/lib/inventoryPick";
import { clearFilingContext, readFilingContext } from "@/lib/filingContext";
import { sellUnitPrice, resolveMarkupRates } from "@/lib/pricing/markup";
import { uploadBlob, isBlobEnabled } from "@/lib/sdk/blob";
import { getOpenAI, isOpenAIEnabled, samplingOptions, resolveOpenAIModel } from "@/lib/sdk/openai";
import { estimateSchema, type GeneratedEstimate } from "@/lib/estimatorSchema";
import { ProposalStatus } from "@/lib/prismaEnums";
import { checkPlanLimit } from "@/lib/limitsEngine";
import { fenceConvertSchema, firstIssue, PREVIEW_MAX_CHARS, type FenceConvertInput } from "@/lib/fence/convertSchema";
import { logServerError } from "@/lib/server-events";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";
import { stateFromAddress, stateTaxRate } from "@/lib/pricing/salesTax";
import { applyMemberDiscount } from "@/lib/servicePlanBook";

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

/** The result of a convert. A FAILURE IS RETURNED, NOT THROWN (2026-09-22):
 *  a thrown Error's message is redacted by Next.js in production, so the page
 *  saw "Couldn't convert" for a plan cap, a role and a bad field alike, and
 *  the plan-limit detection (message equality) only ever worked in dev. */
export type FenceConvertResult =
  | { ok: true; id: string }
  | { ok: false; code: "PLAN_LIMIT_REACHED"; error: string; resource?: LimitKey }
  | { ok: false; code: "FORBIDDEN" | "INVALID" | "FAILED"; error: string };

export async function convertFenceEstimateToProposal(raw: unknown): Promise<FenceConvertResult> {
  let ctx: Awaited<ReturnType<typeof requireEstimatorOrManager>>;
  try {
    ctx = await requireEstimatorOrManager();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, code: "FORBIDDEN", error: "Only an estimator, a manager or the owner can turn an estimate into a proposal." };
    if (err instanceof NoOrgError) return { ok: false, code: "FORBIDDEN", error: "Sign in to an organization to create a proposal." };
    throw err;
  }
  const { organizationId, user } = ctx;
  const quota = await checkPlanLimit(organizationId, "proposalsCreated");
  if (!quota.allowed) {
    return { ok: false, code: "PLAN_LIMIT_REACHED", error: PLAN_LIMIT_MESSAGE, resource: quota.cappedBy ?? "proposalsCreated" };
  }
  const parsed = fenceConvertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", error: firstIssue(parsed.error) };
  try {
    return { ok: true, id: await writeProposal(organizationId, user.id, parsed.data) };
  } catch (err) {
    // The cause goes to the log and to PostHog (server_error, scope fence-convert); the page gets one plain line.
    logServerError("fence-convert", err, { kind: "action", organizationId });
    return { ok: false, code: "FAILED", error: "The proposal could not be saved. Try again in a moment; if it keeps failing, tell support the time it happened." };
  }
}

async function writeProposal(organizationId: string, userId: string, data: FenceConvertInput): Promise<string> {
  const user = { id: userId };

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
  try {
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data.previewDataUrl ?? "");
    // Anything oversized is dropped, not refused: the proposal never waits on its picture.
    if (m && (data.previewDataUrl?.length ?? 0) <= PREVIEW_MAX_CHARS && isBlobEnabled()) {
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const { url } = await uploadBlob(`fence-preview/${randomUUID()}.${ext}`, Buffer.from(m[2], "base64"));
      beforePhotos = JSON.stringify([url]);
    }
  } catch {
    /* preview is optional */
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
  // A member client (2026-09-22): the plan's discount rides on the new proposal (lib/servicePlanBook).
  await applyMemberDiscount(proposal.id).catch(() => {});
  // The connect-or-not choice, when one was made (lib/inventoryPick; null = the company's default).
  await recordInventoryLink(organizationId, proposal.id, data.inventoryLinked, user.id);

  if (filing) await clearFilingContext();
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/proposals");
  return proposal.id;
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
