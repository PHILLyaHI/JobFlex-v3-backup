import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { MessagesInbox, type ConversationSummary, type MessageItem } from "@/components/comms/MessagesInbox";
import { StartConversationButton } from "./start-conversation-button";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: activeId } = await searchParams;
  const { organizationId, user, role } = await requireOrg();

  // Field workers (INSTALLER) only see threads they're part of — ones they've
  // posted in, or the direct thread opened for them (titled with their name).
  // Managers see all org threads. Robust participant-based scoping arrives with
  // the unified messaging model; this is the interim guard so opening Messages to
  // workers doesn't expose the whole org's internal chats.
  const isWorker = role === "INSTALLER";
  const me = isWorker
    ? await db.workerProfile.findFirst({
        where: { userId: user.id, organizationId },
        select: { displayName: true },
      })
    : null;
  const conversationWhere = isWorker
    ? {
        organizationId,
        OR: [
          { messages: { some: { authorId: user.id } } },
          ...(me?.displayName ? [{ title: me.displayName }] : []),
        ],
      }
    : { organizationId };

  const [conversations, workers] = await Promise.all([
    db.conversation.findMany({
      where: conversationWhere,
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
    }),
    db.workerProfile.findMany({
      where: { organizationId },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  const summaries: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    jobId: c.jobId,
    lastMessagePreview: c.messages[0]?.body ?? null,
    lastMessageAt: c.messages[0]?.createdAt ?? null,
    unreadCount: 0,
  }));

  let activeMessages: MessageItem[] = [];
  let activeTitle: string | null = null;
  let activeConvId: string | null = null;
  if (activeId) {
    const active = conversations.find((x) => x.id === activeId);
    if (active) {
      activeConvId = active.id;
      activeTitle = active.title;
      const msgs = await db.message.findMany({
        where: { conversationId: active.id },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
      activeMessages = msgs.map((m) => ({
        id: m.id,
        body: m.body,
        authorName: m.author?.name ?? m.author?.email ?? "Anonymous",
        isMe: m.authorId === user.id,
        createdAt: m.createdAt,
      }));
    }
  } else if (summaries[0]) {
    activeConvId = summaries[0].id;
    activeTitle = summaries[0].title;
    const msgs = await db.message.findMany({
      where: { conversationId: summaries[0].id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    activeMessages = msgs.map((m) => ({
      id: m.id,
      body: m.body,
      authorName: m.author?.name ?? m.author?.email ?? "Anonymous",
      isMe: m.authorId === user.id,
      createdAt: m.createdAt,
    }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description="Internal threads for the team. Client-facing email still flows through the proposal editor."
        actions={<StartConversationButton workers={workers} />}
      />
      <MessagesInbox
        conversations={summaries}
        activeConversationId={activeConvId}
        activeConversationTitle={activeTitle}
        messages={activeMessages}
        currentUserId={user.id}
      />
    </>
  );
}
