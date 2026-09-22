import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isSalesRole, isWorkerRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { longDate } from "@/lib/format";
import { LeadDetailContent } from "@/components/v3/lead-detail-blueprint/lead-detail-content";

// ONE LEAD (2026-09-22) — under the blueprint shell, the same design as the
// Leads list it opens from. Session-scoped, never static.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Lead",
  description: "One lead — the scope of work, the homeowner's words, and the estimators.",
};

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const scopeFailed = (await searchParams)?.scope === "failed";
  let organizationId: string;
  let role: string;
  let userId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(`/dashboard/leads/${id}`)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const lead = await db.lead.findUnique({ where: { id }, include: { assignedTo: { select: { name: true, email: true } } } });
  if (!lead || lead.organizationId !== organizationId) notFound();
  // Sales reps can only open leads that are theirs (assigned/claimed) or NEW.
  if (isSalesRole(role) && lead.assignedToId !== userId && lead.claimedById !== userId && lead.status !== "NEW") {
    notFound();
  }
  return (
    <LeadDetailContent
      lead={{
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        projectType: lead.projectType,
        description: lead.description,
        scope: lead.scope,
        status: lead.status,
        source: lead.source,
        aiCategory: lead.aiCategory,
        aiConfidence: lead.aiConfidence,
        assignee: lead.assignedTo?.name ?? lead.assignedTo?.email ?? null,
        created: longDate(lead.createdAt),
      }}
      canEstimate={!isSalesRole(role) && !isWorkerRole(role)}
      scopeFailed={scopeFailed}
    />
  );
}
