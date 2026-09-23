"use server";

// THE HVAC SERVICE MENU PAGE — its one form (2026-09-23): the shop's own
// task, saved onto the rate card through the estimator's own action.

import { revalidatePath } from "next/cache";
import { saveHvacServiceTask } from "@/actions/hvacEstimator";

export async function addHvacServiceTaskForm(fd: FormData): Promise<void> {
  const num = (k: string) => {
    const n = Number(String(fd.get(k) ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const partName = String(fd.get("partName") ?? "").trim();
  const brands = String(fd.get("brands") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  await saveHvacServiceTask({
    title: String(fd.get("title") ?? "").trim(),
    includes: String(fd.get("includes") ?? "").trim() || undefined,
    laborUsd: num("laborUsd"),
    partName: partName || undefined,
    partCost: partName ? num("partCost") : undefined,
    brands: brands.length ? brands : undefined,
  });
  revalidatePath("/dashboard/hvac-estimator/services");
  revalidatePath("/dashboard/hvac-estimator");
}
