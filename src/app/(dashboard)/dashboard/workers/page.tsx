import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { HardHat } from "lucide-react";
import { WorkersList, type WorkerListItem } from "./workers-list";
import { InviteButton } from "./invite-button";

function parseSpec(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default async function WorkersPage() {
  const { organizationId } = await requireOrg();

  const workers = await db.workerProfile.findMany({
    where: { organizationId },
    orderBy: { displayName: "asc" },
    include: {
      user: { select: { email: true } },
      assignments: {
        where: {
          job: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
        },
        select: { id: true },
      },
    },
  });

  const items: WorkerListItem[] = workers.map((w) => ({
    id: w.id,
    name: w.displayName,
    email: w.user?.email ?? null,
    specialties: parseSpec(w.specialties),
    activeJobs: w.assignments.length,
    hourlyRate: w.hourlyRate,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Workers"
        description="Your crew roster — specialties, active jobs, magic-link portals."
        actions={<InviteButton />}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<HardHat className="h-5 w-5" />}
          title="No workers yet"
          description="Invite your first crew member — they'll get a magic-link portal to view and accept jobs."
          action={<InviteButton />}
        />
      ) : (
        <WorkersList items={items} />
      )}
    </>
  );
}
