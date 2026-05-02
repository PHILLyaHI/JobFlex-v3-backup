import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { relative } from "@/lib/format";

interface Props {
  id: string;
  title: string;
  body: string;
  category: string | null;
  status: string;
  authorName: string | null;
  authorEmail: string;
  replyCount: number;
  createdAt: Date;
}

const CATEGORY_TONES: Record<string, "accent" | "success" | "warn" | "neutral"> = {
  equipment: "accent",
  subcontractor: "warn",
  "job-share": "success",
  question: "neutral",
};

export function TradePostCard({
  id,
  title,
  body,
  category,
  status,
  authorName,
  authorEmail,
  replyCount,
  createdAt,
}: Props) {
  const closed = status === "CLOSED";
  return (
    <Link
      href={`/dashboard/trade/${id}` as any}
      className="break-inside-avoid mb-4 paper-card p-5 block transition-all hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="flex items-center gap-2 mb-2">
        {category && (
          <Badge tone={CATEGORY_TONES[category] ?? "neutral"}>{category.replace("-", " ")}</Badge>
        )}
        {closed && <Badge tone="neutral">closed</Badge>}
        <span className="ml-auto text-[10px] text-[color:var(--ink-faint)] tabular">
          {relative(createdAt)}
        </span>
      </div>
      <h3 className="font-display text-[18px] tracking-[-0.01em] leading-tight mb-2">{title}</h3>
      <p className="text-[12.5px] text-[color:var(--ink-soft)] leading-relaxed line-clamp-3 whitespace-pre-wrap">
        {body}
      </p>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[color:var(--ink-line)]">
        <Avatar name={authorName ?? authorEmail} size={22} />
        <span className="text-[11px] text-[color:var(--ink-soft)] truncate">
          {authorName ?? authorEmail}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[color:var(--ink-muted)] tabular">
          <MessageCircle className="h-3 w-3" />
          {replyCount}
        </span>
      </div>
    </Link>
  );
}
