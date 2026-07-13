"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
// Projects are open to estimators as well as managers (full access — projects
// aren't per-user scoped, so estimators manage all org projects).
import { requireEstimatorOrManager } from "@/lib/orgContext";
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
