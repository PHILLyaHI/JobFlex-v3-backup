// Badge-count queries for the sidebar / mobile tab bar. Server-only plain
// module — deliberately NOT a "use server" action file: these take raw
// (organizationId, userId, role) and must never be client-invokable, or any
// caller could read another tenant's counts. The layout calls them directly.
import { db } from "@/lib/db";

// Nav surfaces whose badge clears on view. `key` is the NavSeen row key; `href`
// is the badge key the sidebar/tab bar reads. Kept together so the two can't drift.
export const SEEN_SURFACES = {
  leads: "/dashboard/leads",
  proposals: "/dashboard/proposals",
  hire: "/dashboard/hire/hub",
  referrals: "/dashboard/referrals",
  reviews: "/dashboard/reviews",
} as const;
export type SeenKey = keyof typeof SEEN_SURFACES;

/**
 * Per-conversation unread counts for this viewer: messages from other people
 * newer than their lastReadAt in threads they participate in, plus every such
 * message in legacy no-participant threads they authored in. One groupBy —
 * not a count per thread — since this runs on every dashboard render (and
 * every 5s while the Messages poller is on). Mirrors the visibility rule in
 * src/app/(dashboard)/dashboard/messages/page.tsx, which shares this helper.
 */
export async function getUnreadByConversation(
  organizationId: string,
  userId: string,
): Promise<Map<string, number>> {
  const [participantRows, legacyConvs] = await Promise.all([
    db.conversationParticipant.findMany({
      where: { userId, conversation: { organizationId } },
      select: { conversationId: true, lastReadAt: true },
    }),
    db.conversation.findMany({
      where: {
        organizationId,
        participants: { none: {} },
        messages: { some: { authorId: userId } },
      },
      select: { id: true },
    }),
  ]);

  const legacyConvIds = legacyConvs.map((c) => c.id);
  if (participantRows.length === 0 && legacyConvIds.length === 0) return new Map();

  const grouped = await db.message.groupBy({
    by: ["conversationId"],
    _count: { _all: true },
    where: {
      authorId: { not: userId },
      OR: [
        ...participantRows.map((p) => ({
          conversationId: p.conversationId,
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        })),
        ...(legacyConvIds.length ? [{ conversationId: { in: legacyConvIds } }] : []),
      ],
    },
  });

  return new Map(grouped.map((g) => [g.conversationId, g._count._all]));
}

/** Total unread messages across every visible thread — the nav badge number. */
async function getUnreadMessageCount(organizationId: string, userId: string): Promise<number> {
  const byConversation = await getUnreadByConversation(organizationId, userId);
  let total = 0;
  for (const n of byConversation.values()) total += n;
  return total;
}

/**
 * Unread / pending-action counts for the sidebar + mobile tab bar, keyed by
 * nav href. Field workers only get their own surfaces (Jobs, Messages);
 * office roles get the full set. Every seen-gated surface clears through
 * markNavSeen (via <MarkNavSeen /> on the page); Messages clears per-thread
 * through markConversationRead.
 */
export async function getBadgeCounts(
  organizationId: string,
  userId: string,
  role: string | null,
): Promise<Record<string, number>> {
  if (role === "INSTALLER") {
    const badges: Record<string, number> = {};
    const workerProfile = await db.workerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    const [jobsPending, messagesUnread] = await Promise.all([
      workerProfile
        ? db.jobAssignment.count({ where: { workerId: workerProfile.id, status: "PENDING" } })
        : Promise.resolve(0),
      getUnreadMessageCount(organizationId, userId),
    ]);
    badges["/dashboard/jobs"] = jobsPending;
    badges["/dashboard/messages"] = messagesUnread;
    return badges;
  }

  // "Seen" cutoffs: each of these badges counts only items newer than the last
  // time the user opened that surface, so visiting the page clears the badge
  // until something new arrives. A missing row (never visited) means no cutoff.
  const seenRows = await db.navSeen.findMany({
    where: { userId, organizationId, key: { in: Object.keys(SEEN_SURFACES) } },
    select: { key: true, seenAt: true },
  });
  const seenAt = (key: SeenKey) => seenRows.find((r) => r.key === key)?.seenAt;

  const [messagesUnread, leads, proposalsUnscheduled, hireApplied, reviewsUnread, referralsPending] =
    await Promise.all([
      getUnreadMessageCount(organizationId, userId),
      countNewForSurface("leads", organizationId, seenAt("leads")),
      countNewForSurface("proposals", organizationId, seenAt("proposals")),
      countNewForSurface("hire", organizationId, seenAt("hire")),
      countNewForSurface("reviews", organizationId, seenAt("reviews")),
      countNewForSurface("referrals", organizationId, seenAt("referrals")),
    ]);

  return {
    "/dashboard/messages": messagesUnread,
    "/dashboard/leads": leads,
    "/dashboard/proposals": proposalsUnscheduled,
    "/dashboard/hire/hub": hireApplied,
    "/dashboard/reviews": reviewsUnread,
    "/dashboard/referrals": referralsPending,
  };
}

/**
 * Badge count for ONE seen-gated surface: items newer than `since` (no cutoff
 * when undefined). Shared by getBadgeCounts above and by markNavSeen, which
 * uses it to decide whether the visit actually cleared anything — so the page
 * only pays for a router.refresh() when a badge was really showing.
 */
export async function countNewForSurface(
  key: SeenKey,
  organizationId: string,
  since: Date | undefined,
): Promise<number> {
  const after = since ? { gt: since } : undefined;
  switch (key) {
    case "leads": {
      // Un-triaged leads (NEW plus lead-center ROUTED) + live Lead Center
      // offers awaiting an accept/decline — the two feeds share one badge.
      const [leadRows, offers] = await Promise.all([
        db.lead.count({
          where: { organizationId, status: { in: ["NEW", "ROUTED"] }, createdAt: after },
        }),
        db.leadOffer.count({
          where: { organizationId, status: "OFFERED", expiresAt: { gt: new Date() }, createdAt: after },
        }),
      ]);
      return leadRows + offers;
    }
    case "proposals":
      return db.proposal.count({
        where: { organizationId, status: "ACCEPTED", jobs: { none: {} }, acceptedAt: after },
      });
    case "hire":
      return db.applicant.count({
        where: { organizationId, status: "APPLIED", createdAt: after },
      });
    case "reviews":
      return db.reviewRequest.count({
        where: { organizationId, status: "COMPLETED", completedAt: after },
      });
    case "referrals":
      return db.referralConversion.count({
        where: { status: "PENDING", code: { organizationId }, createdAt: after },
      });
  }
}
