// AI trade detection for Lead Center routing. Plain server module (NOT
// "use server") — called from submitHomeownerRequest only; keeping it out of
// src/actions/ai.ts avoids exposing another public action surface. Unlike the
// legacy categorizeLead (free-form categories for org-side triage), this one
// is constrained to the canonical TRADE_TYPES vocabulary the matcher filters on.
//
// Since 2026-09-04 (owner's call) the detector is the ONLY source of a lead's
// trade — the wizards no longer offer a specialty picker — so its honesty
// matters more than its coverage:
//   · null           = the AI could not be asked (no key, network, bad JSON).
//     The caller parks the lead in MANUAL_QUEUE rather than guessing.
//   · low confidence / "Other" = the description does not clearly belong to a
//     trade we route. routeDecision() below turns that into MANUAL_QUEUE too.
// The old behaviour — a silent {Other, 0.3} fallback for every failure mode —
// made "the AI was down" indistinguishable from "the request is junk".
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { TRADE_TYPES, isTradeType, type TradeType } from "@/lib/tradeTypes";

export interface DetectedTrade {
  trade: TradeType;
  confidence: number;
  /** One line of the model's own reasoning — stored with queued leads so the
   *  admin placing them by hand sees why the router would not. */
  reason: string;
}

/** Below this the detector's answer does not route a lead on its own. */
export const MIN_ROUTE_CONFIDENCE = 0.6;
/** "General Contractor" needs a higher bar: the model reaches for it on any
 *  grab-bag of unrelated tasks (fence + paint + "maybe the deck"), and the
 *  owner wants those placed by a human, not cascaded to a GC by default.
 *  A genuine whole-home remodel classifies well above this. */
export const MIN_GC_CONFIDENCE = 0.75;

/**
 * Classify a request's free text into one canonical trade.
 * Returns null when the AI cannot be asked at all — the caller must treat
 * that as "park for a human", never as a classification.
 */
export async function detectTrade(text: string): Promise<DetectedTrade | null> {
  const input = text.trim();
  if (!input) return { trade: "Other", confidence: 0, reason: "Empty description" };
  if (!isOpenAIEnabled()) return null;

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
            `Use "General Contractor" only for a genuine whole-project remodel one GC would run (a kitchen gut, an addition); a short list of unrelated tasks (e.g. a fence plus exterior paint) is ambiguous — classify it General Contractor but keep confidence under 0.7. ` +
            `Use "Other" with LOW confidence when the text is vague, empty of work ("help", "call me"), or not about home improvement at all — never force-fit those. ` +
            `Confidence is how sure you are the chosen trade is the right single contractor to send: clear single-trade jobs are 0.8+, ambiguous or mixed requests belong under 0.6. ` +
            `Return JSON: {"trade":"<one of the list>","confidence":0-1,"reason":"<one short sentence>"}.`,
        },
        { role: "user", content: input.slice(0, 2000) },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const trade = typeof parsed.trade === "string" && isTradeType(parsed.trade) ? parsed.trade : "Other";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 200)
        : "No reasoning returned";
    return { trade, confidence: trade === "Other" ? Math.min(confidence, 0.5) : confidence, reason };
  } catch {
    return null;
  }
}

export type RouteDecision =
  | { route: "CASCADE"; trade: TradeType }
  | { route: "MANUAL_QUEUE"; queueReason: "AI_UNAVAILABLE" | "TRADE_UNDETERMINED"; note: string };

/**
 * The one routing rule, shared by the intake action and the QA harness:
 * a lead auto-routes only on a confident, non-"Other" classification.
 * Everything else goes to the Lead Center queue for a human — the request is
 * never lost and never sent to a random trade.
 */
export function routeDecision(detected: DetectedTrade | null): RouteDecision {
  if (!detected) {
    return { route: "MANUAL_QUEUE", queueReason: "AI_UNAVAILABLE", note: "trade detection unavailable" };
  }
  const floor = detected.trade === "General Contractor" ? MIN_GC_CONFIDENCE : MIN_ROUTE_CONFIDENCE;
  if (detected.trade === "Other" || detected.confidence < floor) {
    return {
      route: "MANUAL_QUEUE",
      queueReason: "TRADE_UNDETERMINED",
      note: `${detected.trade} @ ${detected.confidence.toFixed(2)} — ${detected.reason}`,
    };
  }
  return { route: "CASCADE", trade: detected.trade };
}
