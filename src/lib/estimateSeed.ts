// A LEAD HANDED TO AN ESTIMATOR (2026-09-21) — server only.
//
// Owner: when a contractor opens a lead, the estimators should sit beside
// it; a roof lead opens the roof estimator with the address already in,
// a fence lead the fence estimator, anything else the Smart Proposal with
// the scope already typed. The hand-off is a short-lived cookie the lead
// page's action writes and the estimator page reads: the seed never rides
// in the URL, and it dies on its own in ten minutes. Same shape of trick
// as the filing cookie (lib/filingContext), on its own name.

import { cookies } from "next/headers";
import type { EstimatorId } from "@/lib/leadScope";

export const ESTIMATE_SEED_COOKIE = "jf_estimate_seed";
const MAX_AGE_S = 10 * 60;

export type EstimateSeed = {
  leadId: string;
  organizationId: string;
  estimator: EstimatorId;
  /** The client's name, for the proposal. */
  name: string;
  /** Full street address as one line, when the lead carries one. */
  address: string | null;
  state: string | null;
  /** The professional scope, else the homeowner's own words. */
  brief: string;
};

export function encodeSeed(seed: EstimateSeed): string {
  return Buffer.from(JSON.stringify(seed), "utf8").toString("base64url");
}

export function decodeSeed(raw: string | null | undefined): EstimateSeed | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<EstimateSeed>;
    if (!s || typeof s.leadId !== "string" || typeof s.organizationId !== "string" || typeof s.brief !== "string") return null;
    if (s.estimator !== "roof" && s.estimator !== "fence" && s.estimator !== "hvac" && s.estimator !== "smart") return null;
    return {
      leadId: s.leadId,
      organizationId: s.organizationId,
      estimator: s.estimator,
      name: typeof s.name === "string" ? s.name : "",
      address: typeof s.address === "string" && s.address ? s.address : null,
      state: typeof s.state === "string" && s.state ? s.state : null,
      brief: s.brief.slice(0, 6000),
    };
  } catch {
    return null;
  }
}

/** Set from a server action, just before the redirect to the estimator. */
export async function writeEstimateSeed(seed: EstimateSeed): Promise<void> {
  (await cookies()).set(ESTIMATE_SEED_COOKIE, encodeSeed(seed), { httpOnly: true, sameSite: "lax", path: "/", maxAge: MAX_AGE_S });
}

/**
 * The seed for this estimator, when the signed-in company wrote one within
 * the last ten minutes. A seed for another estimator or another company is
 * ignored — a page only prefills what was meant for it.
 */
export async function readEstimateSeed(organizationId: string, estimator: EstimatorId): Promise<EstimateSeed | null> {
  const seed = decodeSeed((await cookies()).get(ESTIMATE_SEED_COOKIE)?.value);
  if (!seed || seed.organizationId !== organizationId || seed.estimator !== estimator) return null;
  return seed;
}
