import { IntegrationDisabledError } from "./base";

export function isFalEnabled() {
  return Boolean(process.env.FAL_KEY);
}

export async function getFal() {
  if (!isFalEnabled()) throw new IntegrationDisabledError("FAL.ai", "FAL_KEY");
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: process.env.FAL_KEY });
  return fal;
}
