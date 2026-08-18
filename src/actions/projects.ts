"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
// Projects are open to estimators as well as managers (full access — projects
// aren't per-user scoped, so estimators manage all org projects).
import { requireEstimatorOrManager, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { enforcePlanLimit } from "@/lib/limitsEngine";

const projectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  budget: z.number().min(0).default(0),
});

/** One row of the project book, as both editions of /dashboard/projects render
 *  it. The two date fields are the card's short "Jul 08" plates rather than
 *  Date objects, which is what the desktop page already computes server-side —
 *  the shape is shared so the two surfaces cannot describe the same book
 *  differently. */
export type ProjectBookRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  budget: number;
  jobCount: number;
  completedJobs: number;
};

/** Formatted in UTC on purpose: project dates are stored as UTC midnight (the
 *  action coerces a "YYYY-MM-DD" string), and a local-time format renders the
 *  previous day in every negative-offset timezone. Same helper the desktop
 *  page's server component uses. */
function shortPlate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

/**
 * The org's project book, for surfaces that cannot be handed the server
 * component's rows as props — the handheld build of /dashboard/projects is
 * mounted by the responsive shell with no props, so it reads the book itself
 * and re-reads it after every write.
 *
 * READ ONLY, and scoped exactly like the desktop page's own query: same
 * organization, same ARCHIVED exclusion, same ordering, same job roll-up.
 * `requireOrg` rather than `requireEstimatorOrManager` for the same reason the
 * page uses it — every role that can open the sheet may read it; the writes
 * below keep their stricter guard.
 */
export async function listProjects(): Promise<ProjectBookRow[]> {
  const { organizationId } = await requireOrg();
  const projects = await db.project.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: { jobs: { select: { id: true, status: true } } },
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    startsAt: shortPlate(p.startsAt),
    endsAt: shortPlate(p.endsAt),
    budget: p.budget,
    jobCount: p.jobs.length,
    completedJobs: p.jobs.filter((j) => j.status === "COMPLETED").length,
  }));
}

export async function createProject(raw: unknown) {
  const { organizationId } = await requireEstimatorOrManager();
  await enforcePlanLimit(organizationId, "projects");
  const data = projectInput.parse(raw);
  const p = await db.project.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      budget: data.budget,
    },
  });
  revalidatePath("/dashboard/projects");
  return { id: p.id };
}

const updateInput = projectInput.partial().extend({ id: z.string() });

export async function updateProject(raw: unknown) {
  const { organizationId } = await requireEstimatorOrManager();
  const data = updateInput.parse(raw);
  const existing = await db.project.findUnique({ where: { id: data.id } });
  if (!existing || existing.organizationId !== organizationId) throw new Error("Not found");
  const { id, ...rest } = data;
  await db.project.update({
    where: { id },
    data: {
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.description !== undefined && { description: rest.description }),
      ...(rest.status !== undefined && { status: rest.status }),
      ...(rest.startsAt !== undefined && { startsAt: rest.startsAt }),
      ...(rest.endsAt !== undefined && { endsAt: rest.endsAt }),
      ...(rest.budget !== undefined && { budget: rest.budget }),
    },
  });
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${id}`);
}

export async function archiveProject(id: string) {
  const { organizationId } = await requireEstimatorOrManager();
  const p = await db.project.findUnique({ where: { id } });
  if (!p || p.organizationId !== organizationId) throw new Error("Not found");
  await db.project.update({ where: { id }, data: { status: "ARCHIVED" } });
  revalidatePath("/dashboard/projects");
}

export async function attachJob(projectId: string, jobId: string) {
  const { organizationId } = await requireEstimatorOrManager();
  const [p, j] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.job.findUnique({ where: { id: jobId } }),
  ]);
  if (!p || p.organizationId !== organizationId) throw new Error("Project not found");
  if (!j || j.organizationId !== organizationId) throw new Error("Job not found");
  await db.job.update({ where: { id: jobId }, data: { projectId } });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function detachJob(jobId: string) {
  const { organizationId } = await requireEstimatorOrManager();
  const j = await db.job.findUnique({ where: { id: jobId } });
  if (!j || j.organizationId !== organizationId) throw new Error("Not found");
  const previousProjectId = j.projectId;
  await db.job.update({ where: { id: jobId }, data: { projectId: null } });
  if (previousProjectId) revalidatePath(`/dashboard/projects/${previousProjectId}`);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}
