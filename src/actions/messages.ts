"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireOrg, isWorkerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";

const createInput = z.object({
  title: z.string().optional(),
  // Org-member user ids to add to the thread (the creator is always added).
  participantIds: z.array(z.string()).default([]),
  kind: z.enum(["DIRECT", "GROUP"]).default("DIRECT"),
});

// Managers open threads. A direct thread is the creator + one person; a group is
// the creator + many. The creator is always a participant so it shows for them.
export async function createConversation(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = createInput.parse(raw ?? {});

  // Only let real members of THIS org be added (never a raw id from the client).
  const validMemberIds = new Set(
    (
      await db.membership.findMany({
        where: { organizationId, userId: { in: data.participantIds } },
        select: { userId: true },
      })
    ).map((m) => m.userId),
  );
  const participantUserIds = Array.from(
    new Set([user.id, ...data.participantIds.filter((id) => validMemberIds.has(id))]),
  );

  const c = await db.conversation.create({
    data: {
      organizationId,
      title: data.title?.trim() || null,
      kind: participantUserIds.length > 2 ? "GROUP" : data.kind,
      participants: { create: participantUserIds.map((userId) => ({ userId })) },
    },
  });
  revalidatePath("/dashboard/messages");
  return { id: c.id };
}

// True when the caller may read/post/clear this conversation: a participant, or a
// manager on a legacy thread that predates participants (no participant rows).
function canAccess(
  conv: { participants: { userId: string }[] },
  userId: string,
  role: string | null | undefined,
) {
  const isParticipant = conv.participants.some((p) => p.userId === userId);
  const legacyManager = conv.participants.length === 0 && !isWorkerRole(role);
  return isParticipant || legacyManager;
}

export async function postMessage(conversationId: string, body: string) {
  // requireOrg (not requireManager) so field workers can reply in their threads.
  const { organizationId, user, role } = await requireOrg();
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conv || conv.organizationId !== organizationId) throw new Error("Not found");
  if (!canAccess(conv, user.id, role)) {
    throw new Error("You can only reply in your own threads.");
  }

  const trimmed = body.trim();
  if (!trimmed) return;
  await db.message.create({
    data: { conversationId: conv.id, authorId: user.id, body: trimmed },
  });
  revalidatePath("/dashboard/messages");
  return { ok: true };
}

// Clear a single thread — wipes its messages but keeps the thread + members.
export async function clearConversation(conversationId: string) {
  const { organizationId, user, role } = await requireOrg();
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conv || conv.organizationId !== organizationId) throw new Error("Not found");
  if (!canAccess(conv, user.id, role)) throw new Error("Not allowed");
  await db.message.deleteMany({ where: { conversationId: conv.id } });
  revalidatePath("/dashboard/messages");
  return { ok: true };
}

// Clear every thread the caller can see (their participating threads, plus legacy
// no-participant org threads for managers). Wipes messages, keeps the threads.
export async function clearAllConversations() {
  const { organizationId, user, role } = await requireOrg();
  const worker = isWorkerRole(role);
  const convs = await db.conversation.findMany({
    where: worker
      ? { organizationId, participants: { some: { userId: user.id } } }
      : {
          organizationId,
          OR: [{ participants: { some: { userId: user.id } } }, { participants: { none: {} } }],
        },
    select: { id: true },
  });
  if (convs.length === 0) return { ok: true, cleared: 0 };
  await db.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
  revalidatePath("/dashboard/messages");
  return { ok: true, cleared: convs.length };
}
