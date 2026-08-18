import Link from "next/link";
import { LayoutList } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { LeadKanbanBoard, type KanbanLead } from "@/components/leads/LeadKanbanBoard";

export default async function LeadsKanbanPage() {
  const { organizationId } = await requireOrg();
  const leads = await db.lead.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: { assignedTo: { select: { name: true, email: true } } },
  });

  const cards: KanbanLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    projectType: l.projectType,
    description: l.description,
    status: l.status,
    aiCategory: l.aiCategory,
    aiConfidence: l.aiConfidence,
    createdAt: l.createdAt,
    assignee: l.assignedTo?.name ?? l.assignedTo?.email ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Leads board"
        description="Drag leads through the pipeline. Status changes save instantly."
        actions={
          <Link href="/dashboard/leads">
            <Button variant="outline" size="sm" icon={<LayoutList className="h-3.5 w-3.5" />}>
              Table view
            </Button>
          </Link>
        }
      />
      <LeadKanbanBoard leads={cards} />
    </>
  );
}
