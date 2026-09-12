"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { estimateSchema, type GeneratedEstimate } from "@/lib/estimatorSchema";
import { ProposalStatus } from "@/lib/prismaEnums";
import { checkPlanLimit, enforcePlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";

/**
 * The sample shown when no OpenAI key is set. Scaled from the REAL squares
 * (audit 2026-09-08: it used to be a fixed 24-square roof whatever was
 * measured): shingles and underlayment by the square, tear-off and install by
 * the square foot, the per-foot and per-lot lines in proportion.
 */
function stubFor(squares: number, wastePct: number): GeneratedEstimate {
  const sq = Math.max(1, squares);
  const sqft = Math.round(sq * 100);
  const withWaste = Math.ceil(sq * (1 + wastePct / 100));
  const k = sq / 24;
  return {
    title: "Roof replacement estimate · AI disabled",
    scope: "Tear-off, synthetic underlayment, architectural shingles, ridge vents, cleanup.",
    assumptions: [
      "One-layer tear-off only",
      "Standard pitch, no steep-slope surcharge",
      `Sample pricing scaled to the measured ${sq.toFixed(1)} squares — add OPENAI_API_KEY for real estimates`,
    ],
    materials: [
      { name: "Architectural shingles (30-yr)", quantity: withWaste, unitPrice: 115, unit: "square" },
      { name: "Synthetic underlayment", quantity: withWaste, unitPrice: 32, unit: "square" },
      { name: "Ice & water shield", quantity: Math.round(400 * k), unitPrice: 1.1, unit: "sqft" },
      { name: "Ridge vent system", quantity: Math.round(60 * k), unitPrice: 6, unit: "ln ft" },
      { name: "Drip edge + flashing", quantity: 1, unitPrice: Math.round(480 * k), unit: "lot" },
    ],
    labor: [
      { name: "Tear-off + disposal", quantity: sqft, unitPrice: 0.8, unit: "sqft" },
      { name: "Installation labor", quantity: sqft, unitPrice: 1.8, unit: "sqft" },
      { name: "Cleanup + magnetic sweep", quantity: 1, unitPrice: Math.round(380 * k), unit: "lot" },
    ],
    estimatedTimelineDays: Math.max(2, Math.round(3 * k)),
  };
}

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
  /** Where `pitch` came from — the estimate must never price a pitch nobody stated. */
  pitchSource?: "measured" | "eagleview" | "entered";
  /**
   * A two-pitch roof, when the elevation data measured one (audit
   * 2026-09-08: 12958 is 4/12 on 53 % and 9/12 on 47 %, and the estimate saw
   * only the 4/12). Each family is priced on its own share of the roof.
   */
  pitchFamilies?: Array<{ pitch12: number; share: number }>;
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
  if (!isOpenAIEnabled()) {
    return { ok: true, data: stubFor(input.squares, input.wastePct), disabled: true };
  }
  const families = (input.pitchFamilies ?? []).filter((f) => Number.isFinite(f.pitch12) && f.share > 0);
  const pitchLine =
    families.length > 1
      ? `Roof pitch: ${families.map((f) => `${Math.round(f.pitch12)}/12 on ${Math.round(f.share * 100)}% of the roof`).join(" + ")} (two-pitch roof — price labor and steep-slope surcharge per family, by its share of the squares)`
      : `Pitch: ${input.pitch}`;
  const sourceLine =
    input.pitchSource === "measured"
      ? "Pitch source: measured from aerial elevation data."
      : input.pitchSource === "entered"
        ? "Pitch source: entered by the contractor, not measured."
        : input.pitchSource === "eagleview"
          ? "Pitch source: the reported figure from the aerial data."
          : "";
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
            'You are a senior roofing estimator writing a contractor-grade takeoff. Produce a roof replacement estimate as JSON matching: {title, scope, assumptions: string[], materials: [{name, quantity, unitPrice, unit}], labor: [{name, quantity, unitPrice, unit}], estimatedTimelineDays}. ' +
            'UNITS: `unit` must be exactly one of "square" (100 sq ft of roof), "sq ft", "linear ft", "each", "hour", "lot" — never anything else, never "unit". ' +
            'MATERIALS must itemize the full package with real quantities: the roof covering by the square (name the product type), underlayment by the square, ice & water shield in sq ft (eaves and valleys unless told otherwise), drip edge in linear ft (the building perimeter), starter strip in linear ft, hip & ridge cap in linear ft, valley metal in linear ft with the valley count in the name, step flashing in pieces (each) with the wall count, apron/headwall and counter flashing in linear ft, pipe boots each by size, chimney flashing kit each when there is a chimney, curb flashing each per rooftop unit, ridge vent in linear ft and/or box, turbine or powered vents each, intake vents each, nails/fasteners and sealant by the square, and deck replacement sheets each when the age or condition warrants an allowance. ' +
            'LABOR must itemize install by the square (one line per pitch family, steep-slope rate from 8/12), tear-off by the square with the layer count, disposal by the square, flashing and vent labor by linear ft or each, a steep-slope safety lot when any pitch is 8/12 or more, and cleanup as a lot. ' +
            'Use realistic US 2026 pricing and the waste factor for coverings and underlayment. When the roof pitch line lists more than one pitch family, state EVERY family in `assumptions` with its pitch and share of the roof (e.g. "4/12 on 53% of the roof", "9/12 on 47% of the roof — steep-slope labor applied to this share") and price labor per family by that share. Lengths that are not measured (ridge, hip, valley, walls) are estimates from the shape and footprint — label them as estimates in `assumptions`. Return JSON only.',
        },
        {
          role: "user",
          content: `Address: ${input.address ?? "unknown"}
${pitchLine}${sourceLine ? `\n${sourceLine}` : ""}
Roof size: ${input.squares} squares (${input.squares * 100} sqft)
Waste factor: ${input.wastePct}%${input.measurementNotes ? `\n${input.measurementNotes}` : ""}`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = estimateSchema.parse(JSON.parse(text));
    return { ok: true, data: parsed };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
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
  // Pre-links the proposal to a client when converted from a client's page.
  clientId: z.string().optional().nullable(),
});

export async function convertRoofEstimateToProposal(raw: unknown) {
  const { organizationId, user } = await requireEstimatorOrManager();
  await enforcePlanLimit(organizationId, "proposalsCreated");
  const data = convertSchema.parse(raw);

  // Never trust a client id from the browser — it must belong to this org.
  const clientId = data.clientId
    ? (
        await db.client.findFirst({
          where: { id: data.clientId, organizationId },
          select: { id: true },
        })
      )?.id ?? null
    : null;

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
      clientId,
      title: data.title,
      // Scope only — assumptions stay on the estimate, never baked into the
      // proposal's scope (keeps the preview / calendar / job detail clean).
      scopeOfWork: data.scope ?? "",
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

/**
 * The estimate's free-text unit → the proposal's measurement type. Reads the
 * WORD, not an exact spelling: the AI wrote "linear foot" and the old exact
 * match sent every such line to the proposal as "Unit" (2026-09-12, every
 * line of a converted estimate showed "Unit"). Roofing squares get their own
 * type — SQUARE — so a shingle line stays "24.9 squares" on the proposal.
 */
function unitToType(unit: string | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u) return "UNIT";
  if (/sq\.?\s*ft|sqft|square\s*f(ee|oo)?t|\bsf\b/.test(u)) return "SQFT";
  if (/^sq(uare)?s?$/.test(u) || /\bsquares?\b/.test(u)) return "SQUARE";
  if (/lin|\bln\b|\blf\b|\bft\b|f(ee|oo)t/.test(u)) return "LINEAR_FT";
  if (/cu(bic)?\.?\s*(ft|yd)|\bcy\b/.test(u)) return "CUBIC_FT";
  if (/hour|\bhrs?\b/.test(u)) return "HOUR";
  if (/lot|lump|allowance|flat|fixed|\bjob\b/.test(u)) return "LUMP_SUM";
  return "UNIT";
}
