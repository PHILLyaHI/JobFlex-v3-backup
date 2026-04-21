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

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
