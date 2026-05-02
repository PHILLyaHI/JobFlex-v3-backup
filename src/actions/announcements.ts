"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";

const input = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  priority: z.number().min(0).max(2).default(0),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export async function createAnnouncement(raw: unknown) {
  const { organizationId } = await requireOrg();
  const data = input.parse(raw);
  const expiresAt = data.expiresAt
    ? data.expiresAt instanceof Date
      ? data.expiresAt
      : new Date(data.expiresAt)
    : null;
  const created = await db.announcement.create({
    data: {
      organizationId,
      title: data.title,
      body: data.body,
      priority: data.priority,
      expiresAt,
    },
  });
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { id: created.id };
}

export async function dismissAnnouncement(id: string) {
  const { organizationId } = await requireOrg();
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a || a.organizationId !== organizationId) throw new Error("Not found");
  // Soft-dismiss by setting expiresAt to now — simplest approach without per-user tracking.
  await db.announcement.update({
    where: { id },
    data: { expiresAt: new Date() },
  });
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}
