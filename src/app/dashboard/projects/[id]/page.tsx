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
// THE PROJECT QUERY IS THE CLASSIC PAGE'S, UNCHANGED — same findUnique with the
// same job include and ordering, the same org check. Only the markup and the
// styles are new, and `attachJob` — the server action the old drawer called —
// is still the one and only thing that writes.
//
// WHAT CHANGED (2026-08-15): the attach control attaches PROPOSALS, so the
// unassigned-JOB candidate list this page used to read is replaced by the
// attachable-PROPOSAL list below. No new action, no new route, no schema
// change: see the note above `PdAvailProposal` in project-detail-data.ts for
// why the link runs through the proposal's jobs and what that costs.

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
// The page renders the VIEWPORT SWITCH rather than the desktop content
// directly: above 768px it is ProjectDetailContent, unchanged, and at or below
// it the handheld rebuild in src/components/v3/mobile-project-detail/. Exactly
// one of the two mounts. The switch lives here rather than in
// responsive-dashboard-shell.tsx because this route is dynamic (no literal
// pathname key can match it) and because the handheld build needs the props
// read below — see the header of project-detail-viewport-switch.tsx.
import { ProjectDetailViewportSwitch } from "@/components/v3/mobile-project-detail/project-detail-viewport-switch";

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

  // Attach candidates: the org's proposals, with the jobs each one owns, so the
  // page can say which are linkable and why the rest are not. `take` is the
  // same ceiling the job list carried.
  const proposals = await db.proposal.findMany({
    where: { organizationId },
    select: {
      id: true,
      title: true,
      status: true,
      total: true,
      client: { select: { name: true } },
      jobs: { select: { id: true, projectId: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const availableProposals = proposals
    // Already on THIS project — it is attached, not attachable.
    .filter((p) => !p.jobs.some((j) => j.projectId === project.id))
    .map((p) => {
      const linkJobIds = p.jobs.filter((j) => !j.projectId).map((j) => j.id);
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        total: p.total,
        clientName: p.client?.name ?? null,
        linkJobIds,
        blocked: linkJobIds.length
          ? null
          : p.jobs.length
            ? "On another project"
            : "No job to link yet",
      };
    });

  return (
    <ProjectDetailViewportSwitch
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
      availableProposals={availableProposals}
    />
  );
}
