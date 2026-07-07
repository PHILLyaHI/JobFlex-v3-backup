"use server";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { syncPlanPricesToStripe } from "@/lib/planStripeSync";
import { revalidatePlanSurfaces } from "@/lib/planCatalogServer";

// Manual "Sync to Stripe" fallback. Saving a plan with a changed price already
// auto-syncs (see upsertPricingPlan); this button retries after a sync failure
// or pushes a plan that was saved while Stripe was unconfigured.
export async function syncPlanToStripe(planId: string) {
  await requirePlatformAdmin();
  const res = await syncPlanPricesToStripe(planId);
  revalidatePlanSurfaces();
  return res;
}
