import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ProjectDetail } from "./project-detail";

const TONE: Record<string, "neutral" | "accent" | "success" | "warn"> = {
  ACTIVE: "accent",
  ON_HOLD: "warn",
  COMPLETED: "success",
  ARCHIVED: "neutral",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireOrg();

  const project = await db.project.findUnique({
    where: { id },
    include: {
      jobs: {
        include: { client: { select: { name: true } } },
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!project || project.organizationId !== organizationId) notFound();

  // Jobs in this org with no project assigned — candidates to attach.
  const availableJobs = await db.job.findMany({
    where: { organizationId, projectId: null, status: { not: "CANCELED" } },
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title={project.name}
        description={project.description ?? "No description yet."}
        actions={<Badge tone={TONE[project.status] ?? "neutral"}>{project.status.toLowerCase().replace("_", " ")}</Badge>}
      />
      <ProjectDetail
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          startsAt: project.startsAt,
          endsAt: project.endsAt,
          budget: project.budget,
        }}
        jobs={project.jobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          startsAt: j.startsAt,
          endsAt: j.endsAt,
          clientName: j.client?.name ?? null,
        }))}
        availableJobs={availableJobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          startsAt: j.startsAt,
          clientName: j.client?.name ?? null,
        }))}
      />
    </>
  );
}
