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

/** Import-time snapshot, kept for existing call sites that run only on the
 *  server (where the env is loaded before any import). New code — and anything
 *  a tsx harness can reach — should call getOpenAIModel() instead. */
export const OPENAI_MODEL = getOpenAIModel();
