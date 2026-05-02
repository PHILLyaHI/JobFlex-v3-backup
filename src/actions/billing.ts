"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PLAN_TIERS, type Plan } from "@/lib/entitlements";

export async function setOrgPlan(plan: Plan) {
  const { organizationId } = await requireOrg();
  if (!PLAN_TIERS.includes(plan)) throw new Error("Invalid plan");

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

  await db.subscription.upsert({
    where: { organizationId },
    update: {
      plan,
      status: plan === "FREE" ? "FREE" : "ACTIVE",
      currentPeriodEnd: plan === "FREE" ? null : periodEnd,
    },
    create: {
      organizationId,
      plan,
      status: plan === "FREE" ? "FREE" : "ACTIVE",
      provider: "STRIPE",
      currentPeriodEnd: plan === "FREE" ? null : periodEnd,
    },
  });
  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard");
  return { ok: true };
}
