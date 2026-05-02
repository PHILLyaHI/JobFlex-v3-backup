import Link from "next/link";
import { Plus, Folder } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { ProjectCard, type ProjectCardData } from "@/components/projects/ProjectCard";

export default async function ProjectsListPage() {
  const { organizationId } = await requireOrg();

  const projects = await db.project.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      jobs: { select: { id: true, status: true } },
    },
  });

  const cards: ProjectCardData[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    budget: p.budget,
    jobCount: p.jobs.length,
    completedJobs: p.jobs.filter((j) => j.status === "COMPLETED").length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Projects"
        description="Group jobs under a single banner — subdivisions, multi-house builds, complex remodels."
        actions={
          <Link href={"/dashboard/projects/new" as any}>
            <Button icon={<Plus className="h-3.5 w-3.5" />}>New project</Button>
          </Link>
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          icon={<Folder className="h-5 w-5" />}
          title="No projects yet"
          description="Bundle related jobs together to track multi-phase builds and shared budgets."
          action={
            <Link href={"/dashboard/projects/new" as any}>
              <Button icon={<Plus className="h-3.5 w-3.5" />}>Create project</Button>
            </Link>
          }
        />
      ) : (
        <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </StaggerGrid>
      )}
    </>
  );
}
