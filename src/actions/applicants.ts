"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ApplicantStatus } from "@/lib/prismaEnums";

const applicantInput = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  role: z.string().min(1),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  resumeUrl: z.string().optional().nullable(),
  status: z.enum([
    ApplicantStatus.APPLIED,
    ApplicantStatus.INTERVIEWING,
    ApplicantStatus.HIRED,
    ApplicantStatus.REJECTED,
  ]).default(ApplicantStatus.APPLIED),
});

export async function createApplicant(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = applicantInput.parse(raw);
  const a = await db.applicant.create({
    data: {
      organizationId,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone ?? null,
      role: data.role,
      source: data.source ?? null,
      notes: data.notes ?? null,
      resumeUrl: data.resumeUrl ?? null,
      status: data.status,
    },
  });
  revalidatePath("/dashboard/hire");
  return { id: a.id };
}

const statusSchema = z.enum([
  ApplicantStatus.APPLIED,
  ApplicantStatus.INTERVIEWING,
  ApplicantStatus.HIRED,
  ApplicantStatus.REJECTED,
]);

export async function updateApplicantStatus(id: string, next: string) {
  const { organizationId } = await requireManager();
  const status = statusSchema.parse(next);
  const a = await db.applicant.findUnique({ where: { id } });
  if (!a || a.organizationId !== organizationId) throw new Error("Not found");
  if (a.status === status) return { ok: true, unchanged: true };
  await db.applicant.update({ where: { id }, data: { status } });
  revalidatePath("/dashboard/hire");
  revalidatePath(`/dashboard/hire/${id}`);
  return { ok: true };
}

export async function appendApplicantNote(id: string, text: string) {
  const { organizationId } = await requireManager();
  const a = await db.applicant.findUnique({ where: { id } });
  if (!a || a.organizationId !== organizationId) throw new Error("Not found");
  const stamped = `${new Date().toISOString().slice(0, 16).replace("T", " ")} — ${text}`;
  const next = a.notes ? `${a.notes}\n\n${stamped}` : stamped;
  await db.applicant.update({ where: { id }, data: { notes: next } });
  revalidatePath(`/dashboard/hire/${id}`);
}

export async function convertApplicantToWorker(id: string) {
  const { organizationId } = await requireManager();
  const a = await db.applicant.findUnique({ where: { id } });
  if (!a || a.organizationId !== organizationId) throw new Error("Not found");
  const { createWorkerInvite } = await import("./workers");
  await createWorkerInvite({
    name: a.fullName,
    email: a.email,
    phone: a.phone,
    specialties: a.role ? [a.role] : [],
  });
  await db.applicant.update({ where: { id }, data: { status: ApplicantStatus.HIRED } });
  revalidatePath("/dashboard/hire");
  revalidatePath("/dashboard/workers");
  return { ok: true };
}

export async function deleteApplicant(id: string) {
  const { organizationId } = await requireManager();
  const a = await db.applicant.findUnique({ where: { id } });
  if (!a || a.organizationId !== organizationId) throw new Error("Not found");
  await db.applicant.delete({ where: { id } });
  revalidatePath("/dashboard/hire");
}
