"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";

const startInput = z.object({
  title: z.string().optional(),
});

export async function startConversation(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = startInput.parse(raw ?? {});
  const c = await db.conversation.create({
    data: {
      organizationId,
      title: data.title ?? null,
    },
  });
  revalidatePath("/dashboard/messages");
  return { id: c.id };
}

export async function postMessage(conversationId: string, body: string) {
  const { organizationId, user } = await requireManager();
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.organizationId !== organizationId) throw new Error("Not found");
  const trimmed = body.trim();
  if (!trimmed) return;
  await db.message.create({
    data: {
      conversationId: conv.id,
      authorId: user.id,
      body: trimmed,
    },
  });
  revalidatePath("/dashboard/messages");
  return { ok: true };
}
