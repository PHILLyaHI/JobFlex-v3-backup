import OpenAI from "openai";
import { IntegrationDisabledError } from "./base";

let client: OpenAI | null = null;

export function isOpenAIEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new IntegrationDisabledError("OpenAI", "OPENAI_API_KEY");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/** Model name read at CALL time. Module-level consts are captured when the
 *  module first evaluates — under a tsx harness whose .env loader runs after
 *  imports hoist, that silently pins the default model even though
 *  OPENAI_MODEL is set. Vision paths (chimneyVision, outlineVision) must use
 *  this getter so harness and server agree on the model. */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

/** A reasoning model (gpt-5, the o-series) thinks before it answers and rejects a temperature. */
export const isReasoningModelName = (model: string) => /^(gpt-5|o[1-9])/.test(model);

/**
 * The model that reads photos and video frames: its own setting when one is
 * given (OPENAI_VISION_MODEL), else the model the estimators run on — the
 * owner moved them to gpt-4.1 and wanted pictures read by it too
 * (2026-09-19). A mini or nano tier reads a frame poorly (scale off a door, a
 * nameplate's small print), so pictures then keep gpt-4o.
 */
export function getVisionModel(override?: string | null): string {
  const own = override?.trim() || process.env.OPENAI_VISION_MODEL?.trim();
  if (own) return own;
  const main = getOpenAIModel();
  return /-(mini|nano)\b/.test(main) ? "gpt-4o" : main;
}

/** Import-time snapshot, kept for existing call sites that run only on the
 *  server (where the env is loaded before any import). New code — and anything
 *  a tsx harness can reach — should call getOpenAIModel() instead. */
export const OPENAI_MODEL = getOpenAIModel();
