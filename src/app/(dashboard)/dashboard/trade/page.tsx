import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { TradePageShell } from "./trade-page-shell";

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const { organizationId } = await requireOrg();

  const [posts, statements, payouts] = await Promise.all([
    db.tradePost.findMany({
      where: {
        organizationId,
        ...(cat && cat !== "all" ? { category: cat } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true } },
        replies: { select: { id: true } },
      },
    }),
    db.influencerStatement.findMany({
      where: { organizationId },
      orderBy: [{ period: "desc" }, { earnings: "desc" }],
    }),
    db.influencerPayout.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const items = posts.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    category: p.category,
    status: p.status,
    authorName: p.author.name,
    authorEmail: p.author.email,
    replyCount: p.replies.length,
    createdAt: p.createdAt,
  }));

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Trade board"
        description="Contractor-to-contractor bulletin and your influencer / affiliate program — both in one hub."
      />
      <TradePageShell
        posts={items}
        activeCategory={cat ?? "all"}
        statements={statements.map((s) => ({
          id: s.id,
          influencerName: s.influencerName,
          clicks: s.clicks,
          conversions: s.conversions,
          earnings: s.earnings,
          period: s.period,
        }))}
        payouts={payouts.map((p) => ({
          id: p.id,
          influencerName: p.influencerName,
          amount: p.amount,
          status: p.status,
          period: p.period,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
        }))}
        currentPeriod={currentPeriod}
      />
    </>
  );
}
