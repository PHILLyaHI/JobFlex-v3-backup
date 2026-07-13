"use server";
import { z } from "zod";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { checkPlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";

const aiDraftSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  scopeOfWork: z.string(),
  lineItems: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        measurementType: z.enum(["SQFT", "LINEAR_FT", "CUBIC_FT", "UNIT", "HOUR", "LUMP_SUM"]),
        quantity: z.number(),
        unitPrice: z.number(),
        materialCost: z.number(),
        laborCost: z.number(),
      }),
    )
    .min(1),
  timeline: z.string().optional(),
  installments: z
    .array(
      z.object({
        label: z.string(),
        amount: z.number(),
        isPercent: z.boolean(),
      }),
    )
    .optional(),
});

export type AiProposalDraft = z.infer<typeof aiDraftSchema>;

const STUB_DRAFT: AiProposalDraft = {
  title: "Sample Proposal · AI Disabled",
  description: "AI is disabled — add OPENAI_API_KEY to .env.local to enable real generation.",
  scopeOfWork: "This is a placeholder scope. Real output will describe tear-off, materials, labor, and cleanup with precision.",
  timeline: "7-10 business days",
  lineItems: [
    { name: "Placeholder · labor", measurementType: "HOUR", quantity: 24, unitPrice: 85, materialCost: 0, laborCost: 85 },
    { name: "Placeholder · materials", measurementType: "LUMP_SUM", quantity: 1, unitPrice: 2400, materialCost: 2400, laborCost: 0 },
  ],
  installments: [
    { label: "Deposit", amount: 30, isPercent: true },
    { label: "Completion", amount: 70, isPercent: true },
  ],
};

export async function generateAiProposal(prompt: string): Promise<
  | { ok: true; draft: AiProposalDraft; disabled?: false }
  | { ok: true; draft: AiProposalDraft; disabled: true }
  | { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey }
> {
  const { organizationId } = await requireEstimatorOrManager();

  // Plan gate
  try {
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    const plan = await getOrgPlanById(organizationId);
    requireFeatureOrThrow(plan, "ai_proposals");
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Upgrade required" };
  }

  // Quota gate — AI generation draws from the same budget as estimator runs.
  // Returned (not thrown): thrown messages are redacted in prod and callers
  // already branch on { ok }.
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
    return { ok: true, draft: STUB_DRAFT, disabled: true };
  }

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You are a senior contractor's AI estimator. Generate a detailed, production-grade proposal as JSON matching this shape: {title, description, scopeOfWork, timeline, lineItems: [{name, description, measurementType: one of SQFT|LINEAR_FT|CUBIC_FT|UNIT|HOUR|LUMP_SUM, quantity, unitPrice, materialCost, laborCost}], installments: [{label, amount, isPercent}]}. Use realistic US pricing. Itemize materials and labor separately per line. 4-8 line items. Return JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = aiDraftSchema.parse(JSON.parse(text));

    await db.aiDraft.create({
      data: {
        organizationId,
        prompt,
        model: OPENAI_MODEL,
        // AiDraft.result is a String column — store the draft as JSON text.
        result: JSON.stringify(parsed),
        tokensIn: completion.usage?.prompt_tokens,
        tokensOut: completion.usage?.completion_tokens,
      },
    });

    return { ok: true, draft: parsed };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "AI generation failed" };
  }
}

export async function categorizeLead(text: string): Promise<{
  category: string;
  confidence: number;
  disabled: boolean;
}> {
  if (!isOpenAIEnabled()) return { category: "General", confidence: 0.4, disabled: true };

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            'Categorize the following contractor lead into one of: Roofing, Fencing, Decking, Flooring, Kitchen, Bath, Siding, Windows, Painting, Landscaping, General. Return JSON: {"category":"...","confidence":0-1}.',
        },
        { role: "user", content: text.slice(0, 2000) },
      ],
      response_format: { type: "json_object" },
    });
    const text_ = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text_);
    return {
      category: parsed.category ?? "General",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
      disabled: false,
    };
  } catch {
    return { category: "General", confidence: 0.3, disabled: false };
  }
}
