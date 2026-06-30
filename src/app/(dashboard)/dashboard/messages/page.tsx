import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesInbox, type ConversationSummary, type MessageItem } from "@/components/comms/MessagesInbox";
import { StartConversationButton, type MemberOption } from "./start-conversation-button";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: activeId } = await searchParams;
  const { organizationId, user, role } = await requireOrg();
  const isWorker = role === "INSTALLER";

  // Participant-scoped: you see threads you're a member of. Managers also see
  // legacy org threads created before participants existed (no participant rows),
  // so nothing pre-existing disappears.
  const conversationWhere = isWorker
    ? { organizationId, participants: { some: { userId: user.id } } }
    : {
        organizationId,
        OR: [
          { participants: { some: { userId: user.id } } },
          { participants: { none: {} } },
        ],
      };

  const [conversations, members] = await Promise.all([
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
    // Everyone on the team (any role) except the current user — a manager can
    // direct-message or group any of them.
    db.membership.findMany({
      where: { organizationId, NOT: { userId: user.id } },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const memberOptions: MemberOption[] = members.map((m) => ({
    userId: m.userId,
    name: m.user?.name ?? m.user?.email ?? "Member",
    email: m.user?.email ?? "",
    role: m.role,
  }));

  const summaries: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    jobId: c.jobId,
    lastMessagePreview: c.messages[0]?.body ?? null,
    lastMessageAt: c.messages[0]?.createdAt ?? null,
    unreadCount: 0,
  }));

  async function loadMessages(conversationId: string): Promise<MessageItem[]> {
    const msgs = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    return msgs.map((m) => ({
      id: m.id,
      body: m.body,
      authorName: m.author?.name ?? m.author?.email ?? "Anonymous",
      isMe: m.authorId === user.id,
      createdAt: m.createdAt,
    }));
  }

  let activeMessages: MessageItem[] = [];
  let activeTitle: string | null = null;
  let activeConvId: string | null = null;
  // Only open a thread that's in the (scoped) list — never an arbitrary id.
  const active =
    (activeId && conversations.find((x) => x.id === activeId)) || conversations[0] || null;
  if (active) {
    activeConvId = active.id;
    activeTitle = active.title;
    activeMessages = await loadMessages(active.id);
  }

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description={
          isWorker
            ? "Your threads with the office. Reply here; the team will see it."
            : "Internal threads for the team. Client-facing email still flows through the proposal editor."
        }
        // Workers reply in threads the office opens for them; only managers start new ones.
        actions={isWorker ? undefined : <StartConversationButton members={memberOptions} />}
      />
      <MessagesInbox
        conversations={summaries}
        activeConversationId={activeConvId}
        activeConversationTitle={activeTitle}
        messages={activeMessages}
        currentUserId={user.id}
        canManage={!isWorker}
      />
    </>
  );
}
