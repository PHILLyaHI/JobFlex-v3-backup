"use server";

// THE HAND-OFF SEED IS SPENT ON ARRIVAL (2026-09-21). The estimator page
// reads the seed (lib/estimateSeed) while rendering; a page cannot clear a
// cookie, so the strip it renders calls this once it is on screen. The next
// visit to the estimator starts empty instead of repeating the lead.

import { cookies } from "next/headers";
import { ESTIMATE_SEED_COOKIE } from "@/lib/estimateSeed";

export async function consumeEstimateSeed(): Promise<void> {
  (await cookies()).delete(ESTIMATE_SEED_COOKIE);
}
