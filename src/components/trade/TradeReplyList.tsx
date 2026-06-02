"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { replyToTradePost } from "@/actions/tradePosts";

export interface TradeReplyItem {
  id: string;
  body: string;
  authorName: string;
  createdAt: Date;
}

export function TradeReplyList({
  postId,
  replies,
  canReply,
}: {
  postId: string;
  replies: TradeReplyItem[];
  canReply: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`;
  }, [body]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await replyToTradePost(postId, body.trim());
      setBody("");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't reply", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ul className="space-y-4">
        {replies.map((r) => (
          <li key={r.id} className="flex gap-3">
            <Avatar name={r.authorName} size={28} />
            <div className="flex-1 min-w-0 paper-card px-4 py-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[12px] font-medium text-[color:var(--ink)]">
                  {r.authorName}
                </span>
                <span className="text-[10px] text-[color:var(--ink-faint)] tabular">
                  {relative(r.createdAt)}
                </span>
              </div>
              <div className="text-[13px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
                {r.body}
              </div>
            </div>
          </li>
        ))}
        {replies.length === 0 && (
          <li className="text-[12px] text-[color:var(--ink-muted)]">No replies yet. Be first.</li>
        )}
      </ul>

      {canReply && (
        <div className="mt-6 pt-6 border-t border-[color:var(--ink-line)]">
          <div className="flex items-end gap-2 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] hairline p-2 focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)] transition-shadow">
            <textarea
              ref={ref}
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Add a reply… (Enter to send, Shift+Enter for new line)"
              className="flex-1 bg-transparent outline-none text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] resize-none px-2 py-1 leading-snug"
            />
            <Button
              size="sm"
              loading={busy}
              disabled={!body.trim()}
              onClick={send}
              icon={<Send className="h-3.5 w-3.5" />}
            >
              Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
