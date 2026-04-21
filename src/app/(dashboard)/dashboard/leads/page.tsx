import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Inbox } from "lucide-react";
import { LeadsBoard } from "./leads-board";

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
        description="Triage new inquiries, claim them, and convert to proposals. AI pre-tags each one by specialty."
      />
      {leads.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No leads yet"
          description="Share your public homeowner form at /homeowners — every submission lands here."
        />
      ) : (
        <LeadsBoard
          leads={leads.map((l) => ({
            id: l.id,
            name: l.name,
            email: l.email,
            phone: l.phone,
            address: l.address,
            projectType: l.projectType,
            description: l.description,
            status: l.status,
            aiCategory: l.aiCategory,
            aiConfidence: l.aiConfidence,
            createdAt: l.createdAt,
            assignee: l.assignedTo?.name ?? l.assignedTo?.email ?? null,
          }))}
        />
      )}
    </>
  );
}
