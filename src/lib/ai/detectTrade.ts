// AI trade detection for Lead Center routing. Plain server module (NOT
// "use server") — called from submitHomeownerRequest only; keeping it out of
// src/actions/ai.ts avoids exposing another public action surface. Unlike the
// legacy categorizeLead (free-form categories for org-side triage), this one
// is constrained to the canonical TRADE_TYPES vocabulary the matcher filters on.
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { TRADE_TYPES, isTradeType, type TradeType } from "@/lib/tradeTypes";

export interface DetectedTrade {
  trade: TradeType;
  confidence: number;
}

const FALLBACK: DetectedTrade = { trade: "Other", confidence: 0.3 };

export async function detectTrade(text: string): Promise<DetectedTrade> {
  const input = text.trim();
  if (!input) return FALLBACK;
  if (!isOpenAIEnabled()) return FALLBACK;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            `Classify a homeowner's project request into exactly one trade from this list: ${TRADE_TYPES.join(", ")}. ` +
            `Pick the trade of the contractor best suited to do the work (e.g. "replace kitchen cabinets" → Kitchen & Bath, ` +
            `"new shingles" → Roofing, "build a cedar fence" → Fencing). ` +
            `Use "General Contractor" for multi-trade remodels and "Other" only when nothing fits. ` +
            `Return JSON: {"trade":"<one of the list>","confidence":0-1}.`,
        },
        { role: "user", content: input.slice(0, 2000) },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const trade = typeof parsed.trade === "string" && isTradeType(parsed.trade) ? parsed.trade : "Other";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    return { trade, confidence: trade === "Other" ? Math.min(confidence, 0.5) : confidence };
  } catch {
    return FALLBACK;
  }
}
