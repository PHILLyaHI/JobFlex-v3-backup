// Main projects — Blueprint edition. Pixel-identical port of the projects
// donor (jobflex-projects-blueprint_2.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// /[id] is now a blueprint page too and sits right here in ./[id] — it
// REPLACED the classic record page rather than standing beside it, which
// reverses the side-by-side convention the earlier ports recorded. Only /new
// still lives under the (dashboard) route group on the classic layout; a
// static segment outranks a dynamic one, so it is unaffected by ./[id].
//
// The grid is NOT a fixture: the project book is read from the database here
// and the create dialog calls the real `createProject` server action (see
// projects-behavior.ts). The query is the archived classic page's — same
// where-clause (ARCHIVED hidden), same ordering, same job roll-up — so both
// editions describe the same book.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProjectsContent } from "@/components/v3/projects-blueprint/projects-content";
import type { Project } from "@/components/v3/projects-blueprint/projects-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Projects",
  description: "Projects — status filters and the full project book on one sheet.",
};

/** The card's Window/due plates are short "Jul 08" labels, not full dates.
 *  Formatted in UTC on purpose: project dates are stored as UTC midnight (the
 *  action coerces a "YYYY-MM-DD" string), and a local-time format renders the
 *  previous day in every negative-offset timezone. */
function shortDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

export default async function ProjectsPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fprojects");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const projects = await db.project.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: { jobs: { select: { id: true, status: true } } },
  });

  const rows: Project[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    startsAt: shortDate(p.startsAt),
    endsAt: shortDate(p.endsAt),
    budget: p.budget,
    jobCount: p.jobs.length,
    completedJobs: p.jobs.filter((j) => j.status === "COMPLETED").length,
  }));

  return <ProjectsContent projects={rows} />;
}
