// Adaptive intake questions for the homeowner wizard.
//
// The wizard used to ask four fixed questions per category — "Which rooms or
// areas?", "Rough size?" — which a homeowner who has just written "replace a
// rotted cedar fence along the back line, about 120 ft, one gate" reads as
// nobody having listened. This module writes the questions FROM what they typed,
// the same way the estimator's intake gate does for contractors
// (actions/advancedEstimator.ts → analyzeEstimatePrompt).
//
// Plain server module, NOT "use server": it is called from the one public
// action in actions/homeowner.ts, which owns the rate limit. Keeping it out of
// the action file keeps the public surface at one exported function.
//
// NEVER BLOCKS. No key, a refusal, a malformed answer — every path returns
// null, and the caller falls back to the static question set it already ships.
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";

/** The wizard's question shape (mirrors `Question` in the two wizard data
 *  files, which are client modules — this one may not import them). */
export interface IntakeQuestion {
  q: string;
  hint: string;
  chips?: string[];
}

const MIN_Q = 3;
const MAX_Q = 5;
/** Long enough for any real brief; short enough that the prompt stays cheap. */
const MAX_INPUT = 1500;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Keep only what the wizard can render: a question, a short hint, and 2–4
 *  chips. A chip list of one is not a choice, so it is dropped rather than
 *  shown. */
function normalize(raw: unknown): IntakeQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const q = clean(r.q ?? r.question, 120);
  if (!q) return null;
  const hint = clean(r.hint ?? r.placeholder, 60);
  const chipsRaw = Array.isArray(r.chips) ? r.chips : Array.isArray(r.options) ? r.options : [];
  const chips = chipsRaw
    .map((c) => clean(c, 28))
    .filter((c, i, all) => c !== "" && all.indexOf(c) === i)
    .slice(0, 4);
  return chips.length >= 2 ? { q, hint, chips } : { q, hint };
}

/**
 * 3–5 questions written for THIS description, or null to use the static set.
 *
 * `category` is what the homeowner picked (or the keyword guess) and is context
 * only — the questions follow the description, because that is where the detail
 * actually is.
 */
export async function suggestIntakeQuestions(
  description: string,
  category?: string | null,
): Promise<IntakeQuestion[] | null> {
  const brief = description.trim().slice(0, MAX_INPUT);
  // Under a dozen characters there is nothing to adapt TO, and a model asked to
  // adapt anyway invents a project the homeowner never described.
  if (brief.length < 12 || !isOpenAIEnabled()) return null;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            'You write the follow-up questions a good contractor asks a homeowner after reading their project description. Return JSON ONLY: {"questions":[{"q":string,"hint":string,"chips":string[]}]}. ' +
            `Write ${MIN_Q}-${MAX_Q} questions, most important first. Rules: ` +
            "(1) Every question must be SPECIFIC to what they wrote — name their material, room, or feature back to them. Never ask something the description already answers. " +
            "(2) Ask what actually changes the price or the plan for THIS job: dimensions they left out, material or finish choice, condition of what is there now, access, permits, timing. " +
            "(3) Plain homeowner English, one short sentence, no trade jargon and no compound questions. " +
            '(4) `hint` is a 2-5 word example answer (e.g. "about 120 ft"), never a sentence. ' +
            "(5) `chips` are 2-4 realistic one-tap answers when the question has a finite set of likely answers; omit chips entirely for open questions. Chips are 1-3 words each. " +
            "Return JSON only.",
        },
        {
          role: "user",
          content: `${category ? `Project type: ${category}\n` : ""}Homeowner wrote: ${brief}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      questions?: unknown;
    };
    const list = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions = list
      .map(normalize)
      .filter((q): q is IntakeQuestion => q !== null)
      .slice(0, MAX_Q);
    // Fewer than three is a thin answer, and a thin answer is worse than the
    // static set it would replace.
    return questions.length >= MIN_Q ? questions : null;
  } catch (err) {
    console.warn("[homeownerQuestions] falling back to the static set:", err);
    return null;
  }
}
