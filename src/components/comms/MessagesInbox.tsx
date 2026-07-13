"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { relative } from "@/lib/format";
import { toast } from "@/components/ui/Toast";
import { postMessage, clearConversation, clearAllConversations, markConversationRead } from "@/actions/messages";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";

export interface ConversationSummary {
  id: string;
  title: string | null;
  jobId: string | null;
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
  canManage?: boolean;
}

export function MessagesInbox({
  conversations,
  activeConversationId,
  activeConversationTitle,
  messages,
  currentUserId,
  canManage = true,
}: MessagesInboxProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  // Live updates: poll the server every few seconds while the tab is visible so
  // new incoming messages (and thread previews) appear without a manual reload,
  // and refresh the moment the tab regains focus. router.refresh() re-runs the
  // server load; existing bubbles keep their id-key so only new ones animate in.
  React.useEffect(() => {
    const refreshIfVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const id = window.setInterval(refreshIfVisible, 5000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  // Keep the thread pinned to the newest message on open and as messages arrive.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeConversationId, messages.length]);

  // Stamp this thread read on open AND whenever new messages land while it's
  // open (the poll renders them here, so they're read) — drives the
  // unread-messages badge.
  React.useEffect(() => {
    if (activeConversationId) markConversationRead(activeConversationId);
  }, [activeConversationId, messages.length]);

  async function handleClear(id: string) {
    if (!window.confirm("Clear every message in this thread? This can't be undone.")) return;
    try {
      await clearConversation(id);
      toast.success("Chat cleared");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't clear", err?.message);
    }
  }
  async function handleClearAll() {
    if (!window.confirm("Clear messages in ALL your threads? This can't be undone.")) return;
    try {
      const res = await clearAllConversations();
      toast.success("Cleared", `${res.cleared} thread${res.cleared === 1 ? "" : "s"} wiped.`);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't clear", err?.message);
    }
  }

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return conversations;
    return conversations.filter(
      (c) =>
        (c.title ?? "").toLowerCase().includes(s) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(s),
    );
  }, [conversations, search]);

  // Group thread = more than one distinct non-me sender. Drives whether we show
  // sender names above incoming bubbles (Apple shows them in groups, hides them
  // in 1:1 DMs). Until participants land in the schema, infer it from authorship.
  const isGroupThread = React.useMemo(() => {
    const authors = new Set(messages.filter((x) => !x.isMe).map((x) => x.authorName));
    return authors.size > 1;
  }, [messages]);

  function selectConversation(id: string) {
    router.push(`/dashboard/messages?c=${id}` as any);
  }

  return (
    <div className="paper-card p-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[640px]">
      <aside className="border-r border-[color:var(--ink-line)] flex flex-col">
        <div className="p-3 border-b border-[color:var(--ink-line)] space-y-2">
          <Input
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
          {canManage && conversations.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--rose)]"
            >
              <Trash2 className="h-3 w-3" />
              Clear all chats
            </button>
          )}
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
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                        {c.title ?? "Untitled"}
                      </span>
                      {c.jobId && (
                        <span className="shrink-0 rounded-full bg-[color:var(--accent-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--accent-ink)]">
                          Job
                        </span>
                      )}
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
              {activeConversationId && messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleClear(activeConversationId)}
                  title="Clear this chat"
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-[11px] text-[color:var(--ink-muted)] transition-colors hover:bg-rose-50 hover:text-[color:var(--rose)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const next = messages[i + 1];
                  const sameSender = (a?: MessageItem) =>
                    !!a && a.isMe === m.isMe && a.authorName === m.authorName;
                  const firstInRun = !sameSender(prev);
                  const lastInRun = !sameSender(next);
                  const isLastOverall = i === messages.length - 1;
                  // iMessage rule: the receipt sits under the most recent message and
                  // only when that message is mine. Once the worker replies, their
                  // bubble is last → the receipt disappears until I send the next one.
                  // ("Delivered" is a placeholder until real read state lands in the
                  // schema batch, which will upgrade it to "Seen".)
                  const receipt = m.isMe && isLastOverall ? "Delivered" : null;
                  return (
                    <ChatMessageBubble
                      key={m.id}
                      m={m}
                      isGroup={isGroupThread}
                      isFirst={i === 0}
                      firstInRun={firstInRun}
                      lastInRun={lastInRun}
                      showMeta={lastInRun}
                      receipt={receipt}
                    />
                  );
                })}
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

function ChatMessageBubble({
  m,
  isGroup,
  isFirst,
  firstInRun,
  lastInRun,
  showMeta,
  receipt,
}: {
  m: MessageItem;
  isGroup: boolean;
  isFirst: boolean;
  firstInRun: boolean;
  lastInRun: boolean;
  showMeta: boolean;
  receipt: string | null;
}) {
  const mine = m.isMe;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col",
        mine ? "items-end" : "items-start",
        firstInRun && !isFirst ? "mt-3" : "mt-0.5",
      )}
    >
      {/* Sender name — only above the first incoming bubble of a run in a group. */}
      {!mine && isGroup && firstInRun && (
        <div className="ml-[36px] mb-1 text-[10px] tracking-[0.04em] text-[color:var(--ink-muted)]">
          {m.authorName}
        </div>
      )}

      <div className={cn("flex items-end gap-2 max-w-[78%]", mine && "flex-row-reverse")}>
        {!mine &&
          (lastInRun ? (
            <Avatar name={m.authorName} size={28} />
          ) : (
            <span className="w-7 shrink-0" aria-hidden />
          ))}
        <div
          className={cn(
            "rounded-[var(--r-lg)] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
            mine
              ? cn("bg-[color:var(--ink)] text-[color:var(--paper)]", lastInRun && "rounded-br-[4px]")
              : cn("paper-card", lastInRun && "rounded-bl-[4px]"),
          )}
        >
          {m.body}
        </div>
      </div>

      {/* Meta line — OUTSIDE/below the bubble, small + faint, Apple-style. The
          receipt (Delivered/Seen) only renders under the most recent message. */}
      {(showMeta || receipt) && (
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[10px] tabular text-[color:var(--ink-faint)]",
            mine ? "pr-0.5" : "ml-[36px]",
          )}
        >
          {receipt && (
            <span className="font-medium text-[color:var(--ink-muted)]">{receipt}</span>
          )}
          {receipt && showMeta && <span aria-hidden>·</span>}
          {showMeta && <span>{relative(m.createdAt)}</span>}
        </div>
      )}
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
      // Post-flight limit check: no preflight round-trip on every send, but a
      // redacted prod error still resolves to the upgrade dialog when the org
      // is actually at its cap.
      if (reportPlanLimit(err)) return;
      if (!(await ensureWithinLimit("messagesSent"))) return;
      toast.error("Couldn't send", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-[color:var(--ink-line)] p-3">
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
