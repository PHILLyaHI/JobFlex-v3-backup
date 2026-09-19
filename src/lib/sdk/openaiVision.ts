import { getOpenAI, getVisionModel, isOpenAIEnabled, isReasoningModelName } from "./openai";

interface VisionInput {
  systemPrompt: string;
  userPrompt: string;
  imageUrl: string; // https or data: URL
  model?: string;
}

// Returns the parsed JSON a vision model reads off one image (getVisionModel: the
// estimators' model, gpt-4o under a mini tier). The system prompt describes the exact JSON schema expected.
export async function runVisionJson<T>(input: VisionInput): Promise<T | null> {
  if (!isOpenAIEnabled()) return null;
  const client = getOpenAI();
  const model = getVisionModel(input.model);
  const completion = await client.chat.completions.create({
    model,
    // A reasoning model rejects a temperature.
    ...(isReasoningModelName(model) ? {} : { temperature: 0.2 }),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text" as const, text: input.userPrompt },
          { type: "image_url" as const, image_url: { url: input.imageUrl } },
        ],
      },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
