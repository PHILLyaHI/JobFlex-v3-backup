"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { logActivity, TRAIL_KINDS } from "@/lib/activityLog";

const input = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.string().nullable().optional(),
});

export async function upsertEmailTemplate(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = input.parse(raw);

  if (data.id) {
    const existing = await db.emailTemplate.findUnique({ where: { id: data.id } });
    if (!existing || existing.organizationId !== organizationId) throw new Error("Not found");
    const updated = await db.emailTemplate.update({
      where: { id: data.id },
      data: {
        name: data.name,
        subject: data.subject,
        body: data.body,
        category: data.category ?? null,
      },
    });
    revalidatePath("/dashboard/settings/email");
    await logActivity({ organizationId, actorId: user.id, kind: TRAIL_KINDS.SETTINGS, summary: `Updated email template settings — edited "${data.name}"`, meta: { area: "email templates", templateId: updated.id } });
    return { id: updated.id };
  }

  const created = await db.emailTemplate.create({
    data: {
      organizationId,
      name: data.name,
      subject: data.subject,
      body: data.body,
      category: data.category ?? null,
    },
  });
  revalidatePath("/dashboard/settings/email");
  await logActivity({ organizationId, actorId: user.id, kind: TRAIL_KINDS.SETTINGS, summary: `Updated email template settings — added "${data.name}"`, meta: { area: "email templates", templateId: created.id } });
  return { id: created.id };
}

export async function deleteEmailTemplate(id: string) {
  const { organizationId, user } = await requireManager();
  const t = await db.emailTemplate.findUnique({ where: { id } });
  if (!t || t.organizationId !== organizationId) throw new Error("Not found");
  await db.emailTemplate.delete({ where: { id } });
  revalidatePath("/dashboard/settings/email");
  await logActivity({ organizationId, actorId: user.id, kind: TRAIL_KINDS.SETTINGS, summary: `Updated email template settings — deleted "${t.name}"`, meta: { area: "email templates", templateId: id, deleted: true } });
}
