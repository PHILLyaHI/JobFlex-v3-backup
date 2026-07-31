// Main trade board — Blueprint edition. Ported from the canonical trade board
// donor (jobflex-trade-board-blueprint.html), minus the donor's Influencers
// tab: the influencer program is its own logged-in surface at /influencer, so
// this page is the jobs board and nothing else.
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child route (/[id]) lives under the (dashboard) route group and keeps
// the classic layout — it is where a post card's title links to.
//
// The board is NOT a fixture any more: the posts are read here and the dialog
// and row menu call the real trade-post server actions (see trade-behavior.ts).
// The query is the archived classic page's — same org scope, same ordering,
// same author/reply joins — so both editions describe the same board.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import { TradeContent } from "@/components/v3/trade-blueprint/trade-content";
import type { TradePost } from "@/components/v3/trade-blueprint/trade-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Trade Board",
  description: "Trade board — the contractor bulletin: gear, subs, job shares and questions.",
};

export default async function TradePage() {
  let organizationId: string;
  let userId: string;
  let viewer: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    userId = ctx.user.id;
    viewer = ctx.user.name ?? ctx.user.email ?? "You";
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Ftrade");
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

  return <TradeContent entries={entries} viewer={viewer} />;
}
