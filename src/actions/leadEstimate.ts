"use server";

// FROM A LEAD INTO AN ESTIMATOR (2026-09-21). The lead page's buttons: each
// writes the hand-off seed (lib/estimateSeed) for one estimator and sends
// the contractor there. Estimator-or-manager, and only a lead of the
// signed-in company.

import type { Route } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { isEstimatorRole, requireEstimatorOrManager } from "@/lib/orgContext";
import { ESTIMATOR_PATH, writeProfessionalScope, type EstimatorId } from "@/lib/leadScope";
import { writeEstimateSeed } from "@/lib/estimateSeed";
import { ensureClientForLead } from "@/lib/leadClient";
import { FILING_COOKIE, FILING_MAX_AGE_S } from "@/lib/filingCookie";

const ENGINES = new Set<string>(["roof", "fence", "hvac", "smart", "manual"]);

export async function startEstimateFromLead(leadId: string, estimator: string): Promise<void> {
  const { organizationId, role } = await requireEstimatorOrManager();
  if (!ENGINES.has(estimator)) return;
  const engine = estimator as EstimatorId;
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { id: true, name: true, email: true, phone: true, address: true, city: true, state: true, zip: true, projectType: true, description: true, scope: true },
  });
  if (!lead) return;
  const address = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(" ")].filter((s) => s && s.trim()).join(", ") || null;
  const brief = (lead.scope ?? lead.description ?? "").trim();
  const words = (lead.description ?? "").trim();
  // The client the lead is — found by email or phone, else made from the
  // lead (lib/leadClient; an estimator's role matches but never makes one).
  // The estimate files under it through the same cookie the estimator picker
  // writes (lib/filingCookie), so the chip on the estimator says so and every
  // convert-to-proposal action reads it. Not httpOnly: the chip reads it.
  const client = await ensureClientForLead(organizationId, lead, { create: !isEstimatorRole(role) });
  if (client) {
    (await cookies()).set(FILING_COOKIE, JSON.stringify({ clientId: client.id, clientName: client.name }), { path: "/", maxAge: FILING_MAX_AGE_S, sameSite: "lax" });
  }
  await writeEstimateSeed({
    leadId: lead.id,
    organizationId,
    estimator: engine,
    name: lead.name,
    address,
    state: lead.state ?? null,
    brief,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    projectType: lead.projectType ?? null,
    // The homeowner's own words beside the professional scope; nothing when they are the same text.
    words: words && words !== brief ? words : null,
    clientId: client?.id ?? null,
  });
  redirect(ESTIMATOR_PATH[engine] as Route);
}

/**
 * WRITE THE SCOPE FOR A LEAD THAT HAS NONE (2026-09-22). Requests made
 * before the scope existed, imported and hand-typed leads: the lead page's
 * button turns the description into the scope a contractor prices from
 * (lib/leadScope) and keeps it on the lead. Lands back on the lead page;
 * `?scope=failed` when the model could not write one.
 */
export async function writeLeadScope(leadId: string): Promise<void> {
  const { organizationId } = await requireEstimatorOrManager();
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { id: true, description: true, aiCategory: true, projectType: true, address: true, city: true, state: true, scope: true },
  });
  if (!lead) return;
  if (!lead.scope) {
    const scope = (lead.description ?? "").trim().length >= 12
      ? await writeProfessionalScope({
          description: lead.description ?? "",
          trade: lead.aiCategory,
          projectType: lead.projectType,
          address: [lead.address, lead.city, lead.state].filter(Boolean).join(", ") || null,
        })
      : null;
    if (!scope) redirect(`/dashboard/leads/${lead.id}?scope=failed` as Route);
    await db.lead.update({ where: { id: lead.id }, data: { scope } });
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${lead.id}`);
  }
  redirect(`/dashboard/leads/${lead.id}` as Route);
}
