import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewJobForm } from "./new-job-form";

export default async function NewJobPage() {
  const { organizationId } = await requireOrg();
  const [clients, proposals, workers] = await Promise.all([
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    db.proposal.findMany({
      where: { organizationId, status: { in: ["ACCEPTED", "SENT", "VIEWED"] } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { id: true, title: true, clientId: true, scopeOfWork: true },
    }),
    db.workerProfile.findMany({
      where: { organizationId },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="New job"
        title="Create a job"
        description="Link it to a client and (optionally) a proposal — we'll also drop an event on the calendar."
      />
      <NewJobForm clients={clients} proposals={proposals} workers={workers} />
    </>
  );
}
