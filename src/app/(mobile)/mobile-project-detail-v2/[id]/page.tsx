// MOBILE PROJECT DETAIL — /mobile-project-detail-v2/<id>
//
// The direct-review entry point for the handheld project-detail build: always
// the mobile design, at any width, so the page can be opened on a desktop
// browser for review without resizing. The live route
// /dashboard/projects/[id] serves the SAME component at ≤768px through
// src/components/v3/mobile-project-detail/project-detail-viewport-switch.tsx —
// one implementation, two entry points, nothing copied between them.
//
// THE QUERIES ARE THE LIVE PAGE'S, character for character — the same
// findUnique with the same job include and ordering, the same org check, and
// the same attachable-proposal list as src/app/dashboard/projects/[id]/page.tsx.
// They are restated rather than shared because a `db` call cannot live in the
// module the client component imports its shapes from. No Prisma change, no new
// server action and no new API route: `attachJob` still does every write.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own redirect-to-login like every other (mobile) design route.

import { notFound, redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { MobileProjectDetail } from "@/components/v3/mobile-project-detail/mobile-project-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project · JobFlex Mobile",
  description: "One project on a phone — its jobs as a list, a schedule and a timeline.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileProjectDetailV2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(`/mobile-project-detail-v2/${id}`)}`);
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
  // sheet can say which are linkable and why the rest are not.
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
    <MobileProjectDetail
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
