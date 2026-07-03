import { requireOrg, isSalesRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { LeadsWorkspace } from "./leads-workspace";

export default async function LeadsPage() {
  const { organizationId, role, user } = await requireOrg();
  // Sales reps see leads assigned to them, claimed by them, or still NEW (so
  // they can claim from the shared pool). Managers see the whole pipeline.
  const leads = await db.lead.findMany({
    where: {
      organizationId,
      ...(isSalesRole(role)
        ? {
            OR: [
              { assignedToId: user.id },
              { claimedById: user.id },
              { status: "NEW" },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description="Triage incoming inquiries, accept the ones you want, and import leads from anywhere."
      />
      <LeadsWorkspace
        initialLeads={leads.map((l) => ({
          id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone,
          address: l.address,
          city: l.city,
          state: l.state,
          projectType: l.projectType,
          description: l.description,
          status: l.status,
          source: l.source,
          aiCategory: l.aiCategory,
          aiConfidence: l.aiConfidence,
          createdAt: l.createdAt,
          assignee: l.assignedTo?.name ?? l.assignedTo?.email ?? null,
        }))}
      />
    </>
  );
}
