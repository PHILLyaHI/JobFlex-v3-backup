import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { LeadsWorkspace } from "./leads-workspace";

export default async function LeadsPage() {
  const { organizationId } = await requireOrg();
  const leads = await db.lead.findMany({
    where: { organizationId },
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
