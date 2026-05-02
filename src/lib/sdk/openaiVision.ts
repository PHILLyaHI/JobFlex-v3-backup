import { getOpenAI, isOpenAIEnabled } from "./openai";

interface VisionInput {
  systemPrompt: string;
  userPrompt: string;
  imageUrl: string; // https or data: URL
  model?: string;
}

// Returns parsed JSON result from GPT-4o with a vision input. System prompt should describe the exact JSON schema expected.
export async function runVisionJson<T>(input: VisionInput): Promise<T | null> {
  if (!isOpenAIEnabled()) return null;
  const client = getOpenAI();
  const completion = await client.chat.completions.create({
    model: input.model ?? "gpt-4o",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: input.userPrompt },
          { type: "image_url", image_url: { url: input.imageUrl } },
        ] as any,
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
