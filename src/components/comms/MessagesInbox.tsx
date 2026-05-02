"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { relative } from "@/lib/format";
import { toast } from "@/components/ui/Toast";
import { postMessage } from "@/actions/messages";

export interface ConversationSummary {
  id: string;
  title: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}

export interface MessageItem {
  id: string;
  body: string;
  authorName: string;
  isMe: boolean;
  createdAt: Date;
}

interface MessagesInboxProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeConversationTitle: string | null;
  messages: MessageItem[];
  currentUserId: string;
}

export function MessagesInbox({
  conversations,
  activeConversationId,
  activeConversationTitle,
  messages,
  currentUserId,
}: MessagesInboxProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return conversations;
    return conversations.filter(
      (c) =>
        (c.title ?? "").toLowerCase().includes(s) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(s),
    );
  }, [conversations, search]);

  function selectConversation(id: string) {
    router.push(`/dashboard/messages?c=${id}` as any);
  }

  return (
    <div className="paper-card p-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[640px]">
      <aside className="border-r border-[color:var(--ink-line)] flex flex-col">
        <div className="p-3 border-b border-[color:var(--ink-line)]">
          <Input
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-[11px] text-[color:var(--ink-muted)]">
              No conversations
            </div>
          )}
          {filtered.map((c) => {
            const active = c.id === activeConversationId;
            return (
              <button
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className={cn(
                  "relative w-full text-left px-4 py-3 border-b border-[color:var(--ink-line)] last:border-0 flex items-start gap-3 transition-colors",
                  active
                    ? "bg-[color:var(--accent-soft)]/60"
                    : "hover:bg-black/[0.02]",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="msg-active"
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-[color:var(--accent)]"
                  />
                )}
                <Avatar name={c.title ?? "Conversation"} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {c.title ?? "Untitled"}
                    </div>
                    {c.lastMessageAt && (
                      <span className="text-[10px] text-[color:var(--ink-faint)] tabular shrink-0">
                        {relative(c.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
                      {c.lastMessagePreview ?? "No messages yet"}
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full bg-[color:var(--ink)] text-[color:var(--paper)] text-[10px] tabular shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex flex-col min-h-[640px] max-h-[82dvh]">
        {!activeConversationId ? (
          <div className="flex-1 grid place-items-center p-10">
            <EmptyState
              title="Pick a conversation"
              description="Choose a thread on the left to read and reply."
            />
          </div>
        ) : (
          <>
            <header className="px-6 h-14 flex items-center justify-between border-b border-[color:var(--ink-line)]">
              <div>
                <div className="font-display text-[17px] tracking-[-0.01em] text-[color:var(--ink)]">
                  {activeConversationTitle ?? "Conversation"}
                </div>
                <div className="text-[11px] text-[color:var(--ink-muted)] tabular mt-0.5">
                  {messages.length} message{messages.length === 1 ? "" : "s"}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <ChatMessageBubble key={m.id} m={m} />
                ))}
              </AnimatePresence>
              {messages.length === 0 && (
                <div className="text-center text-[12px] text-[color:var(--ink-muted)] pt-10">
                  Say hello — this thread is empty.
                </div>
              )}
            </div>

            <MessageComposer
              conversationId={activeConversationId}
              onSent={() => router.refresh()}
            />
          </>
        )}
      </section>
    </div>
  );
}

function ChatMessageBubble({ m }: { m: MessageItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex gap-3 items-end", m.isMe ? "justify-end" : "justify-start")}
    >
      {!m.isMe && <Avatar name={m.authorName} size={28} />}
      <div
        className={cn(
          "max-w-[70%] rounded-[var(--r-lg)] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
          m.isMe
            ? "bg-[color:var(--ink)] text-[color:var(--paper)] rounded-br-[4px]"
            : "paper-card rounded-bl-[4px]",
        )}
      >
        {!m.isMe && (
          <div className="text-[10px] text-[color:var(--ink-muted)] mb-0.5 tracking-[0.04em]">
            {m.authorName}
          </div>
        )}
        <div>{m.body}</div>
        <div
          className={cn(
            "text-[10px] mt-1 tabular",
            m.isMe ? "text-[color:var(--paper)]/60" : "text-[color:var(--ink-faint)]",
          )}
        >
          {relative(m.createdAt)}
        </div>
      </div>
    </motion.div>
  );
}

function MessageComposer({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    const h = Math.min(ref.current.scrollHeight, 140);
    ref.current.style.height = `${h}px`;
  }, [body]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await postMessage(conversationId, body.trim());
      setBody("");
      onSent();
    } catch (err: any) {
      toast.error("Couldn't send", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-[color:var(--ink-line)] p-3">
      <div className="flex items-end gap-2 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] hairline p-2 focus-within:shadow-[0_0_0_3px_rgba(79,70,229,0.18)] transition-shadow">
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
          placeholder="Write a message…   (Enter to send, Shift+Enter for new line)"
          className="flex-1 bg-transparent outline-none text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] resize-none px-2 py-1 leading-snug"
        />
        <Button
          size="sm"
          loading={busy}
          disabled={!body.trim()}
          onClick={send}
          icon={<Send className="h-3.5 w-3.5" />}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
