import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplicantKanban, type KanbanApplicant } from "@/components/hire/ApplicantKanban";

export default async function HirePage() {
  const { organizationId } = await requireOrg();
  const applicants = await db.applicant.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  const cards: KanbanApplicant[] = applicants.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone,
    role: a.role,
    source: a.source,
    status: a.status,
    createdAt: a.createdAt,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Workforce"
        title="Hire"
        description="Applicant tracking. Drag candidates through the funnel; convert hires to active workers in one click."
        actions={
          <Link href={"/dashboard/hire/new" as any}>
            <Button icon={<Plus className="h-3.5 w-3.5" />}>Add applicant</Button>
          </Link>
        }
      />
      {cards.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No applicants yet"
          description="Add candidates manually or wire your job-board integrations later."
          action={
            <Link href={"/dashboard/hire/new" as any}>
              <Button icon={<Plus className="h-3.5 w-3.5" />}>Add first applicant</Button>
            </Link>
          }
        />
      ) : (
        <ApplicantKanban applicants={cards} />
      )}
    </>
  );
}
