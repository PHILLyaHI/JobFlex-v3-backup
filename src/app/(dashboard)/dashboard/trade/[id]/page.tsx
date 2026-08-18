import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TradeReplyList } from "@/components/trade/TradeReplyList";
import { ClosePostButton } from "./close-post-button";
import { relative } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

// Session-scoped, never static. Declared so the dev server does not fork its
// static-paths worker for this route — see the workerThreads note in
// next.config.ts.
export const dynamic = "force-dynamic";

export default async function TradePostDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId, user } = await requireOrg();

  const post = await db.tradePost.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, email: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, email: true } } },
      },
    },
  });
  if (!post || post.organizationId !== organizationId) return notFound();

  const isAuthor = post.authorId === user.id;
  const replies = post.replies.map((r) => ({
    id: r.id,
    body: r.body,
    authorName: r.author.name ?? r.author.email ?? "Anonymous",
    createdAt: r.createdAt,
  }));

  return (
    <>
      <div className="mb-4">
        <Link
          href={"/dashboard/trade" as any}
          className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to trade board
        </Link>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {post.category && <Badge tone="accent">{post.category.replace("-", " ")}</Badge>}
            {post.status === "CLOSED" && <Badge tone="neutral">closed</Badge>}
          </div>
          {isAuthor && post.status !== "CLOSED" && <ClosePostButton id={post.id} />}
        </div>
        <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.02em]">
          {post.title}
        </h1>
        <div className="flex items-center gap-2 mt-4">
          <Avatar name={post.author.name ?? post.author.email} size={28} />
          <div className="text-[12px] text-[color:var(--ink-soft)]">
            {post.author.name ?? post.author.email}
          </div>
          <span className="text-[11px] text-[color:var(--ink-faint)] tabular">
            · {relative(post.createdAt)}
          </span>
        </div>
        <p className="mt-6 text-[14px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
          {post.body}
        </p>
      </Card>

      <div className="mt-6">
        <div className="quiet-caps mb-4">
          {replies.length} repl{replies.length === 1 ? "y" : "ies"}
        </div>
        <TradeReplyList
          postId={post.id}
          replies={replies}
          canReply={post.status === "OPEN"}
        />
      </div>
    </>
  );
}
