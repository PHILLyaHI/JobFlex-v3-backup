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

  // Participant-scoped for EVERY role: you see threads you're a member of.
  // Legacy threads predate the participant model (zero participant rows), so
  // their membership is unknowable — they stay visible only to people who
  // actually wrote in them, never to the whole office.
  const conversationWhere = {
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
        // Needed to name a thread per-viewer: a 1:1 thread shows the OTHER
        // person, not the static title (which stores the recipient's name from
        // the creator's POV and is wrong for everyone else).
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    // Everyone on the team (any role) except the current user — anyone can
    // direct-message or group their teammates (createConversation validates
    // recipients against this org's membership).
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

  // The name to show for a thread, from THIS viewer's perspective. A 1:1 thread
  // is named after the other participant; groups/jobs keep their stored title;
  // legacy threads (no participant rows) fall back to whatever title they have.
  function displayName(c: (typeof conversations)[number]): string {
    const others = c.participants.filter((p) => p.userId !== user.id);
    if (c.kind === "DIRECT" && others.length > 0) {
      const o = others[0].user;
      return o?.name ?? o?.email ?? "Conversation";
    }
    if (c.title) return c.title;
    if (others.length > 0) {
      return others.map((p) => p.user?.name ?? p.user?.email ?? "Member").join(", ");
    }
    return "Conversation";
  }

  const summaries: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    title: displayName(c),
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
    activeTitle = displayName(active);
    activeMessages = await loadMessages(active.id);
  }

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description={
          isWorker
            ? "Your threads with the team. Start one with anyone on the crew."
            : "Internal threads for the team. Client-facing email still flows through the proposal editor."
        }
        actions={<StartConversationButton members={memberOptions} />}
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
