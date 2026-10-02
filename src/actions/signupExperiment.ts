"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { assignSignupBrowser, SIGNUP_ALLOCATION_KEY, type SignupAllocation } from "@/lib/signupExperiment";
export async function initializeSignupExperiment() {
  const assignment = await assignSignupBrowser();
  return { variant: assignment.variant };
}

export async function updateSignupAllocation(mode: SignupAllocation) {
  const admin = await requirePlatformAdmin();
  if (mode !== "split" && mode !== "a" && mode !== "b") throw new Error("Choose both variants, only A, or only B.");
  const cursor = JSON.stringify({ mode, updatedAt: new Date().toISOString(), updatedBy: admin.id });
  await db.syncState.upsert({
    where: { key: SIGNUP_ALLOCATION_KEY },
    create: { key: SIGNUP_ALLOCATION_KEY, cursor },
    update: { cursor },
  });
  revalidatePath("/admin/signup-experiment");
  return { mode };
}
