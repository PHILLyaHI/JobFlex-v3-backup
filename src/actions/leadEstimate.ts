"use server";

// FROM A LEAD INTO AN ESTIMATOR (2026-09-21). The lead page's buttons: each
// writes the hand-off seed (lib/estimateSeed) for one estimator and sends
// the contractor there. Estimator-or-manager, and only a lead of the
// signed-in company.

import type { Route } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { ESTIMATOR_PATH, type EstimatorId } from "@/lib/leadScope";
import { writeEstimateSeed } from "@/lib/estimateSeed";

const ENGINES = new Set<string>(["roof", "fence", "hvac", "smart"]);

export async function startEstimateFromLead(leadId: string, estimator: string): Promise<void> {
  const { organizationId } = await requireEstimatorOrManager();
  if (!ENGINES.has(estimator)) return;
  const engine = estimator as EstimatorId;
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { id: true, name: true, address: true, city: true, state: true, zip: true, description: true, scope: true },
  });
  if (!lead) return;
  const address = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(" ")].filter((s) => s && s.trim()).join(", ") || null;
  await writeEstimateSeed({
    leadId: lead.id,
    organizationId,
    estimator: engine,
    name: lead.name,
    address,
    state: lead.state ?? null,
    brief: (lead.scope ?? lead.description ?? "").trim(),
  });
  redirect(ESTIMATOR_PATH[engine] as Route);
}
