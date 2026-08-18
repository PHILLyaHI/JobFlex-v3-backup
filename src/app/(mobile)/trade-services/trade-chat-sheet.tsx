"use client";
import * as React from "react";
import { Send } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PopupLoading } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/cn";
import { type TradeJob, type ChatMessage } from "./trade-data";

interface TradeChatSheetProps {
  open: boolean;
  onClose: () => void;
  job: TradeJob | null;
  messages: ChatMessage[];
  /** History still on the wire. The sheet opens BEFORE the fetch resolves. */
  loading?: boolean;
  onSend: (jobId: string, body: string) => void;
}

export function TradeChatSheet({
  open,
  onClose,
  job,
  messages,
  loading = false,
  onSend,
}: TradeChatSheetProps) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const kbInset = useKeyboardInset();

  React.useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [open, job?.id, messages.length]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      {job && (
        <div className="-mt-1 flex min-h-[60dvh] flex-col">
          {/* Context header */}
          <div className="flex items-center gap-2.5 border-b border-[color:var(--ink-line)] pb-3">
            <Avatar name={job.postedByName} size={36} />
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-[color:var(--ink)]">
                {job.postedByName}
              </div>
              <div className="truncate text-[12px] text-[color:var(--ink-muted)]">
                {job.title}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 py-4">
            {loading && <PopupLoading label="Loading messages" minHeight={160} />}
            {!loading && messages.length === 0 && (
              <p className="px-2 pt-8 text-center text-[13px] text-[color:var(--ink-muted)]">
                You&apos;re connected with {job.postedByName.split(" ")[0]}. Say hello to
                work out timing and price.
              </p>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} m={m} posterName={job.postedByName} />
            ))}
            <div ref={endRef} />
          </div>

          {/* Composer — paddingBottom lifts it above the on-screen keyboard. */}
          <div
            className="sticky bottom-0 -mx-5 border-t border-[color:var(--ink-line)] bg-[color:var(--paper)] px-5 pt-3 pb-1"
            style={kbInset > 0 ? { paddingBottom: kbInset } : undefined}
          >
            <Composer onSend={(body) => onSend(job.id, body)} />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function Bubble({ m, posterName }: { m: ChatMessage; posterName: string }) {
  return (
    <div className={cn("flex items-end gap-2.5", m.mine ? "justify-end" : "justify-start")}>
      {!m.mine && <Avatar name={posterName} size={26} />}
      <div
        className={cn(
          "max-w-[78%] rounded-[var(--r-lg)] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
          m.mine
            ? "rounded-br-[4px] bg-[color:var(--ink)] text-[color:var(--paper)]"
            : "paper-card rounded-bl-[4px]",
        )}
      >
        <div>{m.body}</div>
        <div
          className={cn(
            "mt-1 text-[11px] tabular",
            m.mine
              ? "text-[color-mix(in_srgb,var(--paper)_75%,transparent)]"
              : "text-[color:var(--ink-muted)]",
          )}
        >
          {m.atLabel}
        </div>
      </div>
    </div>
  );
}

function Composer({ onSend }: { onSend: (body: string) => void }) {
  const [body, setBody] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
  }, [body]);

  function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setBody("");
    ref.current?.focus();
  }

  return (
    <div className="flex items-end gap-2 rounded-[var(--r-md)] bg-white/60 p-2 hairline transition-shadow focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]">
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
        placeholder="Write a message…"
        aria-label="Message"
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-snug text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
      />
      <Button
        size="sm"
        disabled={!body.trim()}
        onClick={send}
        icon={<Send className="h-3.5 w-3.5" />}
        className="h-11"
      >
        Send
      </Button>
    </div>
  );
}

/** Height (px) the on-screen keyboard currently occupies, via visualViewport. */
function useKeyboardInset() {
  const [inset, setInset] = React.useState(0);
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
