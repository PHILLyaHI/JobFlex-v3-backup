"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { enforcePlanLimit } from "@/lib/limitsEngine";

const createInput = z.object({
  title: z.string().optional(),
  // Org-member user ids to add to the thread (the creator is always added).
  participantIds: z.array(z.string()).default([]),
  kind: z.enum(["DIRECT", "GROUP"]).default("DIRECT"),
});

// Anyone on the team can open a thread with other members (workers included) —
// a direct thread is the creator + one person; a group is the creator + many.
// The creator is always a participant so it shows for them. Recipients are
// validated against THIS org's membership below, so the blast radius of any
// role is limited to people already on the same team.
export async function createConversation(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  await enforcePlanLimit(organizationId, "conversationsStarted");
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

// True when the caller may read/post/clear this conversation: a participant, or —
// for a legacy thread that predates participants (no participant rows) — someone
// who authored a message in it. Membership of legacy threads is unknowable, so
// authorship is the only signal; they are never open to the whole office.
// Callers pass `messages` pre-filtered to the caller's own (take: 1).
function canAccess(
  conv: { participants: { userId: string }[]; messages: { id: string }[] },
  userId: string,
) {
  const isParticipant = conv.participants.some((p) => p.userId === userId);
  const legacyAuthor = conv.participants.length === 0 && conv.messages.length > 0;
  return isParticipant || legacyAuthor;
}

export async function postMessage(conversationId: string, body: string) {
  // requireOrg (not requireManager) so limited roles can reply in their threads.
  const { organizationId, user } = await requireOrg();
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { select: { userId: true } },
      messages: { where: { authorId: user.id }, select: { id: true }, take: 1 },
    },
  });
  if (!conv || conv.organizationId !== organizationId) throw new Error("Not found");
  if (!canAccess(conv, user.id)) {
    throw new Error("You can only reply in your own threads.");
  }

  const trimmed = body.trim();
  if (!trimmed) return;
  await enforcePlanLimit(organizationId, "messagesSent");
  await db.message.create({
    data: { conversationId: conv.id, authorId: user.id, body: trimmed },
  });
  revalidatePath("/dashboard/messages");
  return { ok: true };
}

// Stamps this thread as read for the caller — drives the unread-messages
// badge in the sidebar/tab bar. No revalidatePath: the badge recomputes on
// the layout's next render, same as every other self-clearing surface.
export async function markConversationRead(conversationId: string) {
  const { user } = await requireOrg();
  await db.conversationParticipant.updateMany({
    where: { conversationId, userId: user.id },
    data: { lastReadAt: new Date() },
  });
}

// Clear a single thread — wipes its messages but keeps the thread + members.
export async function clearConversation(conversationId: string) {
  const { organizationId, user } = await requireOrg();
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { select: { userId: true } },
      messages: { where: { authorId: user.id }, select: { id: true }, take: 1 },
    },
  });
  if (!conv || conv.organizationId !== organizationId) throw new Error("Not found");
  if (!canAccess(conv, user.id)) throw new Error("Not allowed");
  await db.message.deleteMany({ where: { conversationId: conv.id } });
  revalidatePath("/dashboard/messages");
  return { ok: true };
}

// Clear every thread the caller can see: their participating threads, plus legacy
// no-participant threads they authored in. Wipes messages, keeps the threads.
// Mirrors the visibility rule on the messages page — keep the two in sync.
export async function clearAllConversations() {
  const { organizationId, user } = await requireOrg();
  const convs = await db.conversation.findMany({
    where: {
      organizationId,
      OR: [
        { participants: { some: { userId: user.id } } },
        {
          AND: [
            { participants: { none: {} } },
            { messages: { some: { authorId: user.id } } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  if (convs.length === 0) return { ok: true, cleared: 0 };
  await db.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
  revalidatePath("/dashboard/messages");
  return { ok: true, cleared: convs.length };
}
