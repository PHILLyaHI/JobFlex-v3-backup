// THE HOMEOWNER'S REQUEST, WRITTEN FOR A CONTRACTOR (2026-09-21).
//
// Owner: the homeowner types the project and answers the questions; the two
// should be combined into a professional description of what needs doing,
// because that is what the contractor prices from — it lands in the Smart
// Proposal, or, with the address, in the roof and fence estimators.
//
// The plain rules (needsAddressFor, estimatorFor, looksLikeStreetAddress)
// live in lib/leadRules so the wizards can use them in the browser; they are
// re-exported here. One model call lives here:
//   writeProfessionalScope — the model turns the homeowner's words and
//                       answers into a contractor's scope. Never blocks:
//                       any failure returns null and the request goes out
//                       with the homeowner's own words.

import { getOpenAI, isOpenAIEnabled, resolveOpenAIModel, samplingOptions } from "@/lib/sdk/openai";

export * from "@/lib/leadRules";

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * The contractor's scope, from the homeowner's words and answers. Plain
 * prose: what is there now, what they want done, sizes and counts stated,
 * the questions still open. Nothing invented, no prices.
 */
export async function writeProfessionalScope(input: {
  description: string;
  trade?: string | null;
  address?: string | null;
  projectType?: string | null;
}): Promise<string | null> {
  if (!isOpenAIEnabled()) return null;
  const description = clip(input.description, 3000);
  if (description.length < 12) return null;
  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: await resolveOpenAIModel(),
      ...(await samplingOptions(0.2)),
      messages: [
        {
          role: "system",
          content:
            "You write the scope of work a contractor prices from. You are given what a homeowner typed about their project, with their answers to a few follow-up questions written under it. " +
            "Return JSON ONLY: {\"scope\": string}. The scope is 3-8 plain sentences in the third person, the way an estimator writes a job up: what exists now, what is to be removed, replaced, built or repaired, with every size, count, material, brand and condition the homeowner stated, then the items a contractor must confirm on site. " +
            "Use the homeowner's numbers exactly; never invent a size, a material or a condition they did not give; never give a price. No greeting, no bullets, no headings.",
        },
        {
          role: "user",
          content: [
            input.trade ? `Trade: ${clip(input.trade, 40)}` : "",
            input.projectType ? `Project type: ${clip(input.projectType, 80)}` : "",
            input.address ? `Address: ${clip(input.address, 160)}` : "",
            `Homeowner's description and answers:\n${description}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { scope?: unknown };
    const scope = typeof parsed.scope === "string" ? parsed.scope.trim() : "";
    return scope.length >= 20 && scope.length <= 3000 ? scope : null;
  } catch (err) {
    console.warn(`[leadScope] scope not written: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
