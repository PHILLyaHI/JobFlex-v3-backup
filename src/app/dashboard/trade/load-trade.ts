// Trade board — the ONE loader both editions read.
//
// /dashboard/trade (desktop board + handheld build behind the viewport switch)
// and the /mobile-trade-v2 preview route call this. The query is the archived
// classic page's — same org scope, same ordering, same author/reply joins — so
// both editions describe the same board.

import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import type { TradePost } from "@/components/v3/trade-blueprint/trade-data";

export type TradeProps = {
  entries: TradePost[];
  /** The signed-in contractor's display name — what a post they publish is
   *  stamped with, and what "Posted by you" is measured against. */
  viewer: string;
};

/**
 * @param nextPath where the login redirect should return to — the route that
 *   called this, so a preview URL comes back to the preview.
 */
export async function loadTradeProps(nextPath: string): Promise<TradeProps> {
  let organizationId: string;
  let userId: string;
  let viewer: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    userId = ctx.user.id;
    viewer = ctx.user.name ?? ctx.user.email ?? "You";
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const posts = await db.tradePost.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
      replies: { select: { id: true } },
    },
  });

  const entries: TradePost[] = posts.map((p) => ({
    id: p.id,
    // The board files everything under one of the five chips; a post written
    // before the category column existed lands in Question, the classic form's
    // own default.
    cat: p.category ?? "question",
    status: p.status,
    title: p.title,
    body: p.body,
    author: p.author.name ?? p.author.email ?? "Unknown",
    when: relative(p.createdAt),
    replies: p.replies.length,
    mine: p.authorId === userId,
  }));

  return { entries, viewer };
}
