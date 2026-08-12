// Project detail — Blueprint edition. Pixel-identical port of the project
// detail donor (jobflex-projectdetail-blueprint (14).html).
//
// This REPLACES the classic record page that lived at
// src/app/(dashboard)/dashboard/projects/[id]/ — same URL, no parallel
// "-blueprint" route beside it. Moving the folder into src/app/dashboard/ is
// what puts it on the blueprint shell: ../../layout.tsx mounts the sidebar,
// topbar, sprite and `.content` wrapper once, and the page renders only the
// donor's `.content` children. Its sibling /new still lives under the
// (dashboard) route group on the classic layout; a static segment outranks a
// dynamic one, so /dashboard/projects/new is unaffected.
//
// THE QUERY IS THE CLASSIC PAGE'S, UNCHANGED — same findUnique with the same
// job include and ordering, the same org check, the same unassigned-job
// candidate list. Only the markup and the styles are new. `attachJob`, the
// server action the old drawer called, is still the one that writes.

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProjectDetailContent } from "@/components/v3/project-detail-blueprint/project-detail-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Project",
  description: "One project — its jobs as a list, a schedule and a gantt.",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The blueprint layout deliberately swallows an auth failure so the PAGE can
  // decide; the classic tree let requireOrg throw into its own boundary.
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(`/dashboard/projects/${id}`)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

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
    <ProjectDetailContent
      project={{
        id: project.id,
        name: project.name,
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
  );
}
